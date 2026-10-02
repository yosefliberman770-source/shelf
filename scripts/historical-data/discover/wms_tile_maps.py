#!/usr/bin/env python3
"""Add georeferenced historical maps served by a WMS that draws only when zoomed in to the map index, as tiled layers.

  python3 scripts/historical-data/discover/wms_tile_maps.py
    reads data/historical/discovery/wms-tile-maps.json → rows merged into public/world/maps/georef-index.json

Each row's URL is a WMS GetMap template with {bbox-epsg-3857} (filled in per 256 px tile by the map) and its layer is
'xyz:<minzoom>', the zoom from which the server draws. Rows of an earlier run (ids 'wmstile-…') are replaced.
"""
import json
import os
import urllib.parse

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
CONF = os.path.join(ROOT, 'data', 'historical', 'discovery', 'wms-tile-maps.json')
OUT = os.path.join(ROOT, 'public', 'world', 'maps', 'georef-index.json')


def main():
    rows = []
    for m in json.load(open(CONF))['maps']:
        q = urllib.parse.urlencode({'SERVICE': 'WMS', 'REQUEST': 'GetMap', 'VERSION': '1.3.0', 'LAYERS': m['layer'], 'STYLES': m.get('style', ''),
                                    'FORMAT': 'image/png', 'TRANSPARENT': 'TRUE', 'CRS': 'EPSG:3857', 'WIDTH': 256, 'HEIGHT': 256})
        rows.append([f"wmstile-{m['id']}", m['title'][:160], m['year'], m.get('yearTo', m['year']), m['bbox'], f"{m['wms']}?{q}&BBOX={{bbox-epsg-3857}}",
                     f"xyz:{m['minzoom']}", m['holder'], m['page']])
    d = json.load(open(OUT))
    d['maps'] = [r for r in d['maps'] if not str(r[0]).startswith('wmstile-')] + rows
    with open(OUT, 'w') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    print(len(rows), 'WMS maps added as tiled layers')


if __name__ == '__main__':
    main()
