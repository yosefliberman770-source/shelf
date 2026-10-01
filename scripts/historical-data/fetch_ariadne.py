#!/usr/bin/env python3
"""Harvest ARIADNE portal records (European archaeology catalogue) for chosen countries, unchanged, into the raw vault.

  python3 scripts/historical-data/fetch_ariadne.py Iceland Finland ...      → data/historical/raw/ariadne/original/<country>.jsonl.gz
  python3 scripts/historical-data/fetch_ariadne.py --by-place Hungary       (countries above the API's 10,000-result window:
                                                                             one text query per GeoNames populated place)

The portal's search API returns 50 records a page and at most 10,000 per query. Requests are sequential with a pause
and retried on the portal's intermittent empty answers. Each record is stored as the API returns it (id + data);
licences differ per provider (see each record's accessRights) — the data goes into the private pack only.
"""
import gzip
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'ariadne', 'original')
API = 'https://portal.ariadne-infrastructure.eu/api/search'
PAUSE = 0.4
GEONAMES = {'Hungary': 'HU'}


def get(params, tries=6):
    url = f'{API}?{urllib.parse.urlencode(params)}'
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ShelfAtlasBuild/1.0 (personal research)'}), timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def harvest(params, seen, out, cap=10000):
    page = 1
    while True:
        d = get({**params, 'size': 50, 'page': page})
        time.sleep(PAUSE)
        if not d or not d.get('hits'):
            return
        for h in d['hits']:
            if h['id'] not in seen:
                seen.add(h['id'])
                out.write(json.dumps(h, ensure_ascii=False) + '\n')
        total = d['total']['value']
        if page * 50 >= min(total, cap):
            return
        page += 1


def places(cc):
    """Populated-place names of a country from GeoNames (downloaded once into the vault)."""
    path = os.path.join(ROOT, f'geonames-{cc}.zip')
    if not os.path.exists(path):
        urllib.request.urlretrieve(f'https://download.geonames.org/export/dump/{cc}.zip', path)
    names = set()
    with zipfile.ZipFile(path) as z:
        for line in io.TextIOWrapper(z.open(f'{cc}.txt'), encoding='utf-8'):
            f = line.split('\t')
            if f[6] == 'P':
                names.add(f[1])
    return sorted(names)


def main():
    args = sys.argv[1:]
    by_place = '--by-place' in args
    os.makedirs(ROOT, exist_ok=True)
    for country in [a for a in args if not a.startswith('--')]:
        path = os.path.join(ROOT, f"{country.replace(' ', '_')}.jsonl.gz")
        seen = set()
        with gzip.open(path, 'wt', encoding='utf-8') as out:
            if by_place:
                for i, name in enumerate(places(GEONAMES[country])):
                    harvest({'country': country, 'q': name}, seen, out)
                    if i % 200 == 0:
                        print(country, i, len(seen), flush=True)
            else:
                d = get({'country': country, 'size': 0})
                total = d['total']['value'] if d else 0
                if total <= 10000:
                    harvest({'country': country}, seen, out)
                else:
                    # Above the window: split by period ranges (broad records recur across windows; ids deduplicate).
                    for a, b in ((-10000, 0), (1, 599), (600, 999), (1000, 1299), (1300, 1549), (1550, 1799), (1800, 1949), (1950, 2100)):
                        harvest({'country': country, 'range': f'{a},{b}'}, seen, out)
        print(country, 'records', len(seen), flush=True)


if __name__ == '__main__':
    main()
