"""
Registers and historical gazetteers, second group (2026-10 coverage pass for the weakest regions; see
docs/HISTORICAL_SOURCES_SEARCH.md, section T). Built like the first group (sites.register_entries: each record dated only
by its own source), but into their own tiles, so this group can be (re)built on a machine that does not hold the raw
files of every other dataset:

  public/world/tiles/registers-2.pmtiles   layer `sites`   (VIA-TARIQ sites, Atlas of the Latin Church c. 1772)
  public/world/tiles/levant-roads.pmtiles  layer `roads`   (VIA-TARIQ road segments, per period layer)
  rows of this group in public/world/places (place index), added to the cells, name and id shards in place

  python3 scripts/atlas-build/registers2.py          # rebuild this group only; every other dataset's rows stay as they are

sites.py calls add_rows() and build_tiles() in a full build, so both builds give the same result. The incremental run
counts every dataset's rows in the place index before and after, and stops (writing nothing) if any dataset other than
this group's would change.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from collections import Counter

import registers as REG
import tiler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
TILES = os.path.join(ROOT, 'public', 'world', 'tiles')
PLACES = os.path.join(ROOT, 'public', 'world', 'places')
WORLD_MANIFEST = os.path.join(ROOT, 'public', 'world', 'manifest.json')

LOADERS = (('viatariq', REG.via_tariq), ('latinchurch', REG.latin_church_1772))
SRCS = {name for name, _ in LOADERS}
SITES_TILE = 'registers-2.pmtiles'
ROADS_TILE = 'levant-roads.pmtiles'
ATTRIBUTION = ('VIA-TARIQ, medieval road system of the Levant (A. Pažout, UAB; Zenodo 10.5281/zenodo.21981430, CC BY 4.0); '
               'Atlas of the Latin Church in the Polish-Lithuanian Commonwealth c. 1772 (S. Litak, B. Szady, IHGK KUL; '
               'Zenodo 10.5281/zenodo.10912495, CC BY-NC 4.0)')
REG_ZOOM = {'cathedral': 6, 'monastery': 7, 'castle': 8, 'fortification': 9, 'settlement': 9, 'church': 9, 'market': 8, 'bridge': 10,
            'harbour': 9, 'wreck': 10, 'mill': 10, 'mine': 10, 'road': 10, 'site': 11, 'building': 11}

_feats: list = []


def add_rows(rows):
    """Appends this group's place-index rows to rows (a full build) and keeps its tile features for build_tiles()."""
    import sites
    stats, index = {}, Counter()
    _feats[:] = []
    sites.register_entries(LOADERS, rows, _feats, stats, index)
    return {**stats, 'inPlaceIndex': dict(index), 'tileFeatures': len(_feats)}


def build_tiles():
    import quality
    import sites
    registry = quality.dataset_registry(ROOT)
    feats = []
    for p in _feats:
        p = dict(p)
        ll = p.pop('_ll')
        sites.with_window(p, registry)
        feats.append(({'type': 'Point', 'coordinates': list(ll)}, p, REG_ZOOM.get(p['k'], 10)))
    out = {'sites': tiler.build(os.path.join(TILES, SITES_TILE), 'sites', feats, 11, 'Registers and historical gazetteers (2)', ATTRIBUTION)}
    out['levantRoads'] = tiler.build(os.path.join(TILES, ROADS_TILE), 'roads', REG.via_tariq_roads(), 11, 'Medieval roads of the Levant (VIA-TARIQ)',
                                     'VIA-TARIQ, medieval road system of the Levant (A. Pažout, UAB; Zenodo 10.5281/zenodo.21981430, CC BY 4.0)')
    return out


# ── Incremental place index ──────────────────────────────────────────────────────────────────────────────────────

def _load(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def count_rows(base=PLACES):
    """Rows per dataset in the place index (cells), and name / id entries per dataset."""
    rows, names, ids = Counter(), Counter(), Counter()
    for f in os.listdir(os.path.join(base, 'c')):
        for r in _load(os.path.join(base, 'c', f)):
            rows[r[0]] += 1
    for f in os.listdir(os.path.join(base, 'n')):
        for e in _load(os.path.join(base, 'n', f)):
            names[e[1]] += 1
    for f in os.listdir(os.path.join(base, 'i')):
        ids[f.rsplit('-', 1)[0]] += len(_load(os.path.join(base, 'i', f)))
    return rows, names, ids


def merge_into(base, new_base):
    """Removes this group's rows from the index at base and adds those at new_base (written by world.places_index for this
    group alone). Rows go at the end of their cell, as in a full build, where this group's rows come last."""
    import world
    for sub in ('c', 'n'):
        os.makedirs(os.path.join(base, sub), exist_ok=True)
    # Cells.
    cells = set(os.listdir(os.path.join(base, 'c'))) | set(os.listdir(os.path.join(new_base, 'c')))
    for f in sorted(cells):
        path = os.path.join(base, 'c', f)
        whole = _load(path) if os.path.exists(path) else []
        old = [r for r in whole if r[0] not in SRCS]
        new_path = os.path.join(new_base, 'c', f)
        new = _load(new_path) if os.path.exists(new_path) else []
        if not new and len(old) == len(whole):
            continue  # a cell this group never touched stays as it is
        if old or new:
            world.write_json(path, old + new)
        else:
            os.remove(path)
    # Name shards (sorted as world.places_index sorts them).
    shards = set(os.listdir(os.path.join(base, 'n'))) | set(os.listdir(os.path.join(new_base, 'n')))
    for f in sorted(shards):
        path = os.path.join(base, 'n', f)
        whole = _load(path) if os.path.exists(path) else []
        old = [e for e in whole if e[1] not in SRCS]
        new_path = os.path.join(new_base, 'n', f)
        new = _load(new_path) if os.path.exists(new_path) else []
        if not new and len(old) == len(whole):
            continue
        es = sorted(old + new, key=lambda e: (e[0], e[1], str(e[2]), e[3], e[4]))
        if es:
            world.write_json(path, es)
        elif os.path.exists(path):
            os.remove(path)
    # Id shards: one file per dataset and hash bucket.
    for f in os.listdir(os.path.join(base, 'i')):
        if f.rsplit('-', 1)[0] in SRCS:
            os.remove(os.path.join(base, 'i', f))
    for f in os.listdir(os.path.join(new_base, 'i')):
        shutil.copyfile(os.path.join(new_base, 'i', f), os.path.join(base, 'i', f))


def update_manifest(index_stats, group_stats, tile_stats, rows_by_src):
    m = _load(WORLD_MANIFEST)
    p = m['places']
    p['cells'] = len(os.listdir(os.path.join(PLACES, 'c')))
    p['nameShards'] = len(os.listdir(os.path.join(PLACES, 'n')))
    p['rows'] = sum(rows_by_src.values())
    p['rejected'] = [r for r in p.get('rejected', []) if r.get('src') not in SRCS] + index_stats['rejected']
    by = {k: v for k, v in m.get('bySource', {}).items() if k not in SRCS}
    by.update({s: n for s, n in group_stats['inPlaceIndex'].items()})
    m['bySource'] = dict(sorted(by.items()))
    m.setdefault('tiles-sites', {})['registers2'] = {**tile_stats, 'records': {k: v for k, v in group_stats.items() if k in SRCS}}
    m.setdefault('sources', {}).update({
        'viatariq': 'VIA-TARIQ medieval roads and sites of the Levant, Zenodo 10.5281/zenodo.21981430 (CC BY 4.0)',
        'latinchurch': 'Atlas of the Latin Church in the Polish-Lithuanian Commonwealth c. 1772, Zenodo 10.5281/zenodo.10912495 (CC BY-NC 4.0)'})
    with open(WORLD_MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(m, fh, ensure_ascii=False, separators=(',', ':'))


def main():
    import world
    before, before_n, before_i = count_rows()
    print('place index before:', dict(sorted(before.items())))
    rows = []
    group = add_rows(rows)
    print('this group:', json.dumps(group, ensure_ascii=False))
    tmp = tempfile.mkdtemp(prefix='registers2-')
    try:
        index_stats = world.places_index(rows, os.path.join(tmp, 'places'))
        # Work on a copy first; the public index is replaced only if every other dataset is unchanged.
        work = os.path.join(tmp, 'work')
        shutil.copytree(PLACES, work)
        merge_into(work, os.path.join(tmp, 'places'))
        after, after_n, after_i = count_rows(work)
        changed = {s: (before[s], after[s]) for s in set(before) | set(after) if s not in SRCS and before[s] != after[s]}
        changed.update({f'names:{s}': (before_n[s], after_n[s]) for s in set(before_n) | set(after_n) if s not in SRCS and before_n[s] != after_n[s]})
        changed.update({f'ids:{s}': (before_i[s], after_i[s]) for s in set(before_i) | set(after_i) if s not in SRCS and before_i[s] != after_i[s]})
        if changed:
            print('STOP: other datasets would change:', changed)
            sys.exit(1)
        shutil.rmtree(PLACES)
        shutil.copytree(work, PLACES)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    tile_stats = build_tiles()
    update_manifest(index_stats, group, tile_stats, after)
    print('place index after:', dict(sorted(after.items())))
    print('unchanged for every other dataset (rows, names, ids); added:', {s: after[s] - before[s] for s in SRCS})
    print('tiles:', {k: {kk: vv for kk, vv in v.items() if kk != 'rejected'} for k, v in tile_stats.items()})


if __name__ == '__main__':
    main()
