#!/usr/bin/env python3
"""Spatial quality pass over every point record Shelf holds (public place index, private pack, register tiles).

  python3 scripts/historical-data/spatial_qa.py → data/historical/audit/spatial-qa.json

Nothing is changed. Each suspicious record is classified, with the reason, so a fix can be decided on evidence:
  water-far       a non-maritime record more than 2 km out to sea (today's coast)        → source or projection error, or lost land
  water-near      within 2 km of today's coast, in the sea                                 → coordinate precision or a changed shoreline
  wreck-on-land   a shipwreck more than 1 km inland                                         → source error, or a river/harbour wreck
  outside-box     outside the area its dataset documents (by more than 1°)                  → source error or a different place of the same name
  swapped         outside the box but inside it with latitude and longitude exchanged      → lat/lon swap
  stacked         20 or more records of one dataset on the very same coordinate             → a placeholder position (e.g. a parish or county centre)
Land and sea come from OpenStreetMap's simplified land polygons (Europe, the same as the offline coast).
"""
import gzip
import io
import json
import math
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict

from shapely.geometry import Point, box, shape
from shapely.ops import transform
from shapely.strtree import STRtree

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
CACHE = os.path.join(ROOT, 'scripts', 'atlas-build', '.cache')
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'atlas-build'))
import quality  # noqa: E402

EUROPE = (-30, 25, 65, 75)
MARITIME = {'wreck', 'harbour', 'port'}
R = 6378137.0


def land_index():
    import shapefile
    z = zipfile.ZipFile(os.path.join(CACHE, 'osm_land.zip'))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))  # noqa: E731
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'))
    to_ll = lambda x, y, zz=None: (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))  # noqa: E731
    clip = box(*EUROPE)
    geoms = []
    for shp in r.iterShapes():
        g = transform(to_ll, shape(shp.__geo_interface__))
        if g.intersects(clip):
            geoms.append(g)
    return geoms, STRtree(geoms)


def records():
    """(dataset, id, name, kind, lon, lat) from the public and private place indexes and the register tiles."""
    for d in (os.path.join(ROOT, 'public', 'world', 'places', 'c'), os.path.join(ROOT, 'data', 'private-pack', 'build', 'places', 'c')):
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            for r in json.load(open(os.path.join(d, fn), encoding='utf-8')):
                yield r[0], r[1], r[2], (r[13] or {}).get('k') or r[6], r[3], r[4]


def main():
    geoms, tree = land_index()

    def on_land(lon, lat):
        p = Point(lon, lat)
        return any(geoms[i].contains(p) for i in tree.query(p))

    def km_to_land(lon, lat):
        p = Point(lon, lat)
        near = tree.query(p.buffer(0.2))
        d = min((geoms[i].distance(p) for i in near), default=1)
        return d * 111.0 * max(0.3, math.cos(math.radians(lat)))

    reg = quality.dataset_registry(ROOT)
    stacks = defaultdict(Counter)
    out = defaultdict(lambda: defaultdict(list))
    counts = defaultdict(Counter)
    total = Counter()
    for ds, rid, name, kind, lon, lat in records():
        total[ds] += 1
        stacks[ds][(round(lon, 5), round(lat, 5))] += 1
        if not (EUROPE[0] <= lon <= EUROPE[2] and EUROPE[1] <= lat <= EUROPE[3]):
            continue
        b = (reg.get(ds) or {}).get('box')
        if b and not quality.in_box(lon, lat, b):
            cls = 'swapped' if quality.swapped(lon, lat, b) else 'outside-box'
            counts[ds][cls] += 1
            if len(out[ds][cls]) < 15:
                out[ds][cls].append([rid, name, lon, lat])
        land = on_land(lon, lat)
        if kind in MARITIME:
            if land and kind == 'wreck':
                d = km_inland = None
                # A wreck inside the land polygon: how far from the sea? (distance to the polygon edge)
                p = Point(lon, lat)
                for i in tree.query(p):
                    if geoms[i].contains(p):
                        km_inland = geoms[i].exterior.distance(p) * 111.0 * math.cos(math.radians(lat))
                if km_inland and km_inland > 1:
                    counts[ds]['wreck-on-land'] += 1
                    if len(out[ds]['wreck-on-land']) < 15:
                        out[ds]['wreck-on-land'].append([rid, name, lon, lat, round(km_inland, 1)])
            continue
        if not land:
            d = km_to_land(lon, lat)
            cls = 'water-far' if d > 2 else 'water-near'
            counts[ds][cls] += 1
            if len(out[ds][cls]) < 15:
                out[ds][cls].append([rid, name, kind, lon, lat, round(d, 1)])
    for ds, st in stacks.items():
        big = [(k, n) for k, n in st.items() if n >= 20]
        if big:
            counts[ds]['stacked'] = sum(n for _, n in big)
            out[ds]['stacked'] = [[list(k), n] for k, n in sorted(big, key=lambda x: -x[1])[:10]]
    rep = {'checked': dict(total), 'flags': {ds: dict(c) for ds, c in counts.items()},
           'shareFlagged': {ds: round(sum(v for k, v in counts[ds].items() if k != 'water-near') / total[ds], 4) for ds in counts if total[ds]},
           'examples': {ds: dict(v) for ds, v in out.items()}, 'method': __doc__.strip()}
    path = os.path.join(ROOT, 'data', 'historical', 'audit', 'spatial-qa.json')
    json.dump(rep, open(path, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({'checked': rep['checked'], 'flags': rep['flags']}, ensure_ascii=False)[:3000])


if __name__ == '__main__':
    main()
