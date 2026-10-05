"""Add what a full rebuild now writes into tiles to the published tile archives, without rebuilding them.

  python3 scripts/atlas-build/patch_tiles.py stacks medieval-sites spec-sites registers
  python3 scripts/atlas-build/patch_tiles.py approx spec-sites halc   # 'u' = 1 on the points the place index marks approximate

stacks: every point that shares its position with others gets 'sk' = the number of records there (tiler.mark_stacks),
measured on the deepest zoom's 4096-unit grid as the tiler does. Each tile is decoded and written back with the same
features, geometry and order; the archive is replaced only after it is complete.
"""
from __future__ import annotations

import gzip
import json
import os
import sys
from collections import Counter

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import zxy_to_tileid
from pmtiles.writer import Writer

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.join(HERE, '..', '..', 'public', 'world', 'tiles')


def _decode(data):
    return mapbox_vector_tile.decode(gzip.decompress(data))


def _encode(layers):
    return gzip.compress(mapbox_vector_tile.encode([{'name': n, 'features': [{'geometry': f['geometry'], 'properties': f['properties']} for f in l['features']]}
                                                     for n, l in layers.items()], default_options={'extents': 4096}), mtime=0)


def _rewrite(name: str, change) -> int:
    """Every tile of an archive written back, with change(props) applied to each feature's properties (True = changed)."""
    path = os.path.join(TILES, f'{name}.pmtiles')
    tiles, n = [], 0
    with open(path, 'rb') as fh:
        rd = Reader(MmapSource(fh))
        header, meta = rd.header(), rd.metadata()
        for (z, x, y), data in all_tiles(rd.get_bytes):
            layers = _decode(data)
            hit = False
            for l in layers.values():
                for f in l['features']:
                    if change(f['properties']):
                        hit = True
                        n += 1
            tiles.append((zxy_to_tileid(z, x, y), _encode(layers) if hit else data))
    tiles.sort()
    with open(path + '.new', 'wb') as f:
        wr = Writer(f)
        for tid, data in tiles:
            wr.write_tile(tid, data)
        wr.finalize(header, meta)
    os.replace(path + '.new', path)
    return n


def approx(name: str, src: str) -> dict:
    """Points of one dataset that the place index records as approximate get 'u' = 1 (drawn blurred)."""
    base = os.path.join(HERE, '..', '..', 'public', 'world', 'places', 'c')
    ids = {f'{src}:{r[1]}' for f in sorted(os.listdir(base)) for r in json.load(open(os.path.join(base, f), encoding='utf-8')) if r[0] == src and r[5] == 0}

    def change(p):
        if p.get('i') in ids and p.get('u') != 1:
            p['u'] = 1
            return True
        return False
    return {'features marked approximate (all zooms)': _rewrite(name, change), 'records': len(ids)}


def stacks(name: str) -> dict:
    path = os.path.join(TILES, f'{name}.pmtiles')
    with open(path, 'rb') as fh:
        rd = Reader(MmapSource(fh))
        header, meta = rd.header(), rd.metadata()
        mz = header['max_zoom']
        # pass 1: how many records stand on each pixel of the deepest zoom
        at, where = Counter(), {}
        for (z, x, y), data in all_tiles(rd.get_bytes):
            if z != mz:
                continue
            for l in _decode(data).values():
                for f in l['features']:
                    if f['geometry']['type'] == 'Point' and 'i' in f['properties']:
                        k = (x, y, *f['geometry']['coordinates'])
                        at[k] += 1
                        where[f['properties']['i']] = k
        sk = {i: at[k] for i, k in where.items() if at[k] > 1}
        # pass 2: every tile written back with the count on the stacked points
        out = path + '.new'
        tiles = []
        for (z, x, y), data in all_tiles(rd.get_bytes):
            layers = _decode(data)
            changed = False
            for l in layers.values():
                for f in l['features']:
                    n = sk.get(f['properties'].get('i'))
                    if n and f['properties'].get('sk') != n:
                        f['properties']['sk'] = n
                        changed = True
            tiles.append((zxy_to_tileid(z, x, y), _encode(layers) if changed else data))
    tiles.sort()
    for vl in meta.get('vector_layers', []):
        vl.setdefault('fields', {})['sk'] = 'Number'
    with open(out, 'wb') as f:
        wr = Writer(f)
        for tid, data in tiles:
            wr.write_tile(tid, data)
        wr.finalize(header, meta)
    os.replace(out, path)
    return {'points in stacks': len(sk), 'in stacks of 10+': sum(1 for n in sk.values() if n >= 10), 'largest stack': max(sk.values(), default=0)}


def stamp(what: str):
    """The published data changed: its build date moves to today, so the app drops answers worked out from the old data
    (bookWorld's data version, the offline data cache) instead of replaying them, and the manifest lists the patch."""
    import datetime
    path = os.path.join(HERE, '..', '..', 'public', 'world', 'manifest.json')
    m = json.load(open(path, encoding='utf-8'))
    today = datetime.date.today().isoformat()
    m['built'] = today
    m['patches'] = sorted(set(m.get('patches', [])) | {f'{today} {what}'})
    import world
    world.write_json(path, m)


if __name__ == '__main__':
    step, args = sys.argv[1], sys.argv[2:]
    if step == 'approx':
        print(args[0], json.dumps(approx(args[0], args[1])))
    else:
        for n in args:
            print(n, json.dumps({'stacks': stacks}[step](n)))
    stamp(f'tiles: {step} {" ".join(args)}')
