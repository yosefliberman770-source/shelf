#!/usr/bin/env python3
"""Snapshot an ArcGIS FeatureServer / MapServer layer into the raw vault as GeoJSON (WGS84), paging through all features.

  python3 scripts/historical-data/fetch_arcgis.py <dataset-id> <layer-url> [<file-name>]
    → data/historical/raw/<dataset-id>/original/<file-name or layer name>.geojson  (+ <…>.service.json: the layer's own description)

The snapshot is recorded in manifest.json like every other download, so the build never depends on a live service.
"""
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from fetch import MANIFEST, RAW, load, record, save  # noqa: E402

UA = 'ShelfAtlasBuild/1.0 (personal research)'


def get(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=180) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print('retry', i, str(e)[:80], flush=True)
            time.sleep(4 * (i + 1))
    raise SystemExit(f'failed: {url}')


def main(ds, url, name=None):
    url = url.rstrip('/')
    meta = get(url + '?f=json')
    name = name or re.sub(r'\W+', '_', meta.get('name') or 'layer').strip('_')
    feats, offset = [], 0
    while True:
        d = get(f'{url}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset={offset}&resultRecordCount=1000')
        fs = d.get('features') or []
        feats += fs
        if len(fs) < 1000 and not d.get('exceededTransferLimit') and not (d.get('properties') or {}).get('exceededTransferLimit'):
            break
        offset += len(fs)
    out_dir = os.path.join(RAW, ds, 'original')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f'{name}.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump({k: meta.get(k) for k in ('name', 'description', 'copyrightText', 'fields', 'geometryType', 'extent')},
              open(os.path.join(out_dir, f'{name}.service.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    manifest = load(MANIFEST, {})
    rel = os.path.relpath(path, RAW)
    manifest[rel] = record(url + '/query (all features, outSR=4326)', path, manifest.get(rel))
    save(manifest)
    print(ds, name, len(feats), 'features')


if __name__ == '__main__':
    main(*sys.argv[1:])
