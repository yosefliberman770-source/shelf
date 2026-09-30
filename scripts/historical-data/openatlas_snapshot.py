#!/usr/bin/env python3
"""Snapshot the places of the TIB "Maps of Power" OpenAtlas database (Austrian Academy
of Sciences) through its public API, in Linked Places format, into the raw vault.

  data/historical/raw/tib-maps-of-power/original/places-page-NNN.json

The API is paged (100 places per page). Each page is saved unchanged and recorded in
manifest.json like any download. The dataset is flagged local_only in sources.json:
the data licence is not stated (only the photographs carry CC BY 4.0), so these files
are kept out of the public repository and the tiles built from them are local-only.

  python3 scripts/historical-data/openatlas_snapshot.py
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from fetch import MANIFEST, RAW, load, record, save  # noqa: E402

API = 'https://openatlas.maps-of-power.at/api/0.4/system_class/place?format=lp&limit=100&page={}'
OUT = os.path.join(RAW, 'tib-maps-of-power', 'original')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = load(MANIFEST, {})
    page, total = 1, None
    while True:
        url = API.format(page)
        dest = os.path.join(OUT, f'places-page-{page:03d}.json')
        r = subprocess.run(['curl', '-sS', '-m', '120', '--retry', '3', '-o', dest, url])
        if r.returncode:
            print('FAILED', url)
            break
        d = json.load(open(dest, encoding='utf-8'))
        total = d['pagination']['entities']
        rel = os.path.relpath(dest, RAW)
        manifest[rel] = record(url, dest, manifest.get(rel))
        n = sum(len(x['features']) for x in d['results'])
        print(f'page {page}: {n} places')
        if page * 100 >= total or not n:
            break
        page += 1
        time.sleep(1)
    save(manifest)
    print('total', total)


if __name__ == '__main__':
    main()
