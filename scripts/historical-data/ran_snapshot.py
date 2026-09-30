#!/usr/bin/env python3
"""Snapshot Romania's national archaeological register (RAN, Repertoriul Arheologic Național, CIMEC) into the vault.

  data/historical/raw/ran-romania/original/list-page-NNN.html   the register's own list, 500 sites per page,
                                                              ordered by period (code, name, category, type,
                                                              county, locality, components, period)
  data/historical/raw/ran-romania/original/points-NNN.json     site positions (CODSIT) from the public ArcGIS
                                                              service behind map.cimec.ro, 1,000 per query

Each file is saved unchanged and recorded in manifest.json. data.gov.ro, where RAN is also published, resets
connections from this environment, so the register's own site and map service are used.

  python3 scripts/historical-data/ran_snapshot.py
"""
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from fetch import MANIFEST, RAW, load, record, save  # noqa: E402

LIST = 'https://ran.cimec.ro/sel.asp?Oepo=1&lpag=500&nr={}'
POINTS = ('https://eism.geo-spatial.ro/eismgeo/rest/services/Patrimoniu/PatrimoniuWM/MapServer/0/query'
          '?where=OBJECTID%3E%3D{}+AND+OBJECTID%3C{}&outFields=OBJECTID,CODSIT,NUMESIT,SIRUTA&returnGeometry=true&outSR=4326&f=json')
IDS = ('https://eism.geo-spatial.ro/eismgeo/rest/services/Patrimoniu/PatrimoniuWM/MapServer/0/query'
       '?where=1%3D1&returnIdsOnly=true&f=json')
OUT = os.path.join(RAW, 'ran-romania', 'original')


def get(url, dest):
    for attempt in range(4):
        if subprocess.run(['curl', '-sSL', '-m', '180', '-o', dest, url]).returncode == 0 and os.path.getsize(dest) > 1000:
            return True
        time.sleep(2 ** attempt)
    return False


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = load(MANIFEST, {})
    pages = None
    n = 1
    while pages is None or n <= pages:
        dest = os.path.join(OUT, f'list-page-{n:03d}.html')
        if not os.path.exists(dest) and not get(LIST.format(n), dest):
            print('FAILED list page', n)
            break
        if pages is None:
            last = re.findall(r'nr=(\d+)">>>\|', open(dest, encoding='utf-8', errors='replace').read())
            pages = int(last[0]) if last else 1
        manifest[os.path.relpath(dest, RAW)] = record(LIST.format(n), dest, manifest.get(os.path.relpath(dest, RAW)))
        print(f'list page {n}/{pages}')
        n += 1
        time.sleep(1)
    # The service does not page (resultOffset fails), so positions are fetched by OBJECTID ranges of 1,000.
    ids = json.loads(subprocess.run(['curl', '-sSL', '-m', '180', IDS], capture_output=True, text=True).stdout)['objectIds']
    for lo in range(min(ids), max(ids) + 1, 1000):
        dest = os.path.join(OUT, f'points-{(lo - min(ids)) // 1000:03d}.json')
        url = POINTS.format(lo, lo + 1000)
        if not get(url, dest):
            print('FAILED points', lo)
            continue
        manifest[os.path.relpath(dest, RAW)] = record(url, dest, manifest.get(os.path.relpath(dest, RAW)))
        print(f'points {lo}: {len(json.load(open(dest)).get("features", []))}')
    save(manifest)


if __name__ == '__main__':
    main()
