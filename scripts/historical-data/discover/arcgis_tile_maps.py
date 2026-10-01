#!/usr/bin/env python3
"""Add an ArcGIS Online folder of georeferenced historical map scans (tiled MapServers, Web Mercator) to the map index.

  python3 scripts/historical-data/discover/arcgis_tile_maps.py <tiles folder url> <id prefix> "<publisher>"
    e.g. https://tiles.arcgis.com/tiles/YFaBqL5jL3y8fq7s/arcgis/rest/services walesmaps "Welsh historic mapping (ArcGIS)"
    → rows merged into public/world/maps/georef-index.json (rows of an earlier run with the same prefix are replaced)

Only services whose own name gives the year the map was made ("…_Tithe_Survey_1847", "…_c1750") are added; the app shows a
map as a snapshot of that year and never dates map content from it. The tiles stay on the publisher's server and are
streamed when the reader lays a map over the atlas; the holder is the service's own copyright line. Row layout as in
map_index.py, with layer 'xyz' and the tile URL template in place of the WMS URL.
"""
import concurrent.futures as cf
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
OUT = os.path.join(ROOT, 'public', 'world', 'maps', 'georef-index.json')
R = 6378137.0


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def lonlat(x, y):
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


def year_of(name):
    """(year, circa) from the service name, or None."""
    m = re.search(r'(?:^|_)(c)?(1[0-9]{3})(?:_|$)', name)
    return (int(m.group(2)), bool(m.group(1))) if m else None


def title_of(name, circa, year):
    t = name.replace('_', ' ')
    t = re.sub(rf'\bc{year}\b', f'c. {year}', t) if circa else t
    return re.sub(r'\s+', ' ', t).strip()


def service(base, name):
    j = get(f'{base}/{urllib.parse.quote(name)}/MapServer?f=json')
    ti, fe = j.get('tileInfo') or {}, j.get('fullExtent') or {}
    wkid = (ti.get('spatialReference') or {}).get('latestWkid') or (ti.get('spatialReference') or {}).get('wkid')
    ewkid = (fe.get('spatialReference') or {}).get('latestWkid') or (fe.get('spatialReference') or {}).get('wkid')
    if wkid != 3857 or ewkid != 3857 or (ti.get('rows'), ti.get('cols')) != (256, 256):
        return None, f'not standard Web Mercator 256px tiles (wkid {wkid}, extent {ewkid})'
    w, s = lonlat(fe['xmin'], fe['ymin'])
    e, n = lonlat(fe['xmax'], fe['ymax'])
    return {'bbox': [round(w, 5), round(s, 5), round(e, 5), round(n, 5)], 'holder': re.sub(r'^©\s*', '', (j.get('copyrightText') or '').strip())}, None


def main(base, prefix, publisher):
    base = base.rstrip('/')
    names = [s['name'].split('/')[-1] for s in get(f'{base}?f=json').get('services', []) if s.get('type') == 'MapServer']
    dated = {n: year_of(n) for n in names}
    skipped = [n for n, y in dated.items() if not y]

    def one(n):
        try:
            return n, *service(base, n)
        except Exception as e:  # recorded below, not fatal
            return n, None, str(e)

    rows, failed = [], []
    with cf.ThreadPoolExecutor(8) as ex:
        for n, info, err in ex.map(one, [n for n, y in dated.items() if y]):
            if not info:
                failed.append((n, err))
                continue
            y, circa = dated[n]
            rows.append([f'{prefix}-{n.lower()}', title_of(n, circa, y)[:160], y, y, info['bbox'], f'{base}/{urllib.parse.quote(n)}/MapServer/tile/{{z}}/{{y}}/{{x}}', 'xyz',
                         info['holder'] or publisher, f'{base}/{urllib.parse.quote(n)}/MapServer'])
    d = json.load(open(OUT))
    d['maps'] = [r for r in d['maps'] if not str(r[0]).startswith(prefix + '-')] + sorted(rows)
    d['built'] = re.sub(r'(; plus [^;]*)?$', '', d.get('built', '')) + f'; plus {publisher} tiled map scans'
    with open(OUT, 'w') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(rows)} maps added; {len(skipped)} without a year in the name; {len(failed)} failed', flush=True)
    for n, err in failed:
        print('  failed', n, err)
    for n in skipped:
        print('  no year', n)


if __name__ == '__main__':
    main(*sys.argv[1:4])
