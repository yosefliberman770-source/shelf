#!/usr/bin/env python3
"""Discovery harvest: ask open research-data catalogues for historical-geospatial sources.

Every search term in queries.py is sent to each catalogue; the answers are cached unchanged
(scripts/atlas-build/.cache/discovery/<catalogue>/<hash>.json) and normalised into candidate records
by inventory.py. Nothing is downloaded beyond catalogue metadata.

  python3 scripts/historical-data/discover/harvest.py [catalogue ...]

Catalogues: datacite (covers Zenodo, Figshare, Dryad, OSF, Dataverse and most institutional repositories),
zenodo (file lists), dataverse (Harvard Dataverse), europa (data.europa.eu: national open-data portals),
figshare.
"""
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from queries import LOCAL, TOPICS, all_queries  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
CACHE = os.path.join(ROOT, 'scripts', 'atlas-build', '.cache', 'discovery')
UA = 'ShelfResearch/1.0 (personal historical atlas; https://github.com/yosefliberman770-source/shelf)'


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(10 * (i + 1))
                continue
            return {'error': e.code}
        except Exception as e:  # noqa: BLE001
            time.sleep(5 * (i + 1))
            last = str(e)
    return {'error': last if 'last' in dir() else 'failed'}


def cached(cat, query, url):
    d = os.path.join(CACHE, cat)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, hashlib.sha1(url.encode()).hexdigest()[:16] + '.json')
    if os.path.exists(p):
        return
    data = get(url)
    json.dump({'query': query, 'url': url, 'fetched': time.strftime('%Y-%m-%d'), 'response': data}, open(p, 'w'))


def q(s):
    return urllib.parse.quote(s)


CATALOGUES = {
    # DataCite REST API: datasets, collections and models (GIS layers are registered under all three).
    'datacite': (lambda s: f'https://api.datacite.org/dois?query={q(s)}&resource-type-id=dataset,collection,model,image&page%5Bsize%5D=100', all_queries, 4, 0.2),
    'zenodo': (lambda s: f'https://zenodo.org/api/records?q={q(s)}&type=dataset&size=25', lambda: [(t, 'en', 'topic') for t in TOPICS] + [(t, l, 'local') for l, ts in LOCAL.items() for t in ts], 1, 1.2),
    'dataverse': (lambda s: f'https://dataverse.harvard.edu/api/search?q={q(s)}&type=dataset&per_page=100', lambda: [(t, 'en', 'topic') for t in TOPICS] + [(t, l, 'local') for l, ts in LOCAL.items() for t in ts], 2, 0.5),
    'europa': (lambda s: f'https://data.europa.eu/api/hub/search/search?q={q(s)}&limit=100&filter=dataset', lambda: [(t, l, 'local') for l, ts in LOCAL.items() for t in ts] + [(t, 'en', 'topic') for t in TOPICS], 2, 0.5),
    'zenodo2': (lambda s: f'https://zenodo.org/api/records?q={q(s)}&type=dataset&size=25&page=2', lambda: [(t, 'en', 'topic') for t in TOPICS] + [(t, l, 'local') for l, ts in LOCAL.items() for t in ts], 1, 1.2),
    'figshare': (lambda s: f'https://api.figshare.com/v2/articles?search_for={q(s)}&page_size=100&item_type=3', lambda: [(t, 'en', 'topic') for t in TOPICS], 2, 0.5),
}


MAP_PLACES = ['Europe', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'England', 'Scotland', 'Ireland', 'Netherlands', 'Belgium', 'Denmark',
              'Sweden', 'Norway', 'Finland', 'Iceland', 'Poland', 'Bohemia', 'Hungary', 'Austria', 'Switzerland', 'Romania', 'Bulgaria', 'Serbia',
              'Croatia', 'Dalmatia', 'Bosnia', 'Greece', 'Ottoman Empire', 'Turkey', 'Russia', 'Ukraine', 'Lithuania', 'Livonia', 'Prussia',
              'Holy Roman Empire', 'Mediterranean', 'Balkan Peninsula', 'Byzantine Empire', 'Roman Empire', 'Cyprus', 'Crete', 'Sicily', 'Sardinia',
              'Palestine', 'Egypt', 'North Africa', 'Caucasus', 'Baltic Sea', 'Danube']


def run_extras():
    # World Historical Gazetteer: its public datasets.
    for page in range(1, 6):
        cached('whg', {'q': 'datasets', 'page': page}, f'https://whgazetteer.org/api/datasets/?page={page}')
    # Library of Congress: historical maps per place (pages of 100).
    for place in MAP_PLACES:
        for pg in (1, 2):
            cached('loc', {'q': place, 'lang': 'en', 'family': 'maps'}, f'https://www.loc.gov/maps/?q={q(place)}&dates=0001/1920&fo=json&c=100&sp={pg}')
            time.sleep(1)
    # re3data: every registered research-data repository (names; details fetched by inventory.py for likely ones).
    cached('re3data', {'q': 'all'}, 'https://www.re3data.org/api/v1/repositories')
    print('extras done', flush=True)


def run(cat):
    if cat == 'extras':
        return run_extras()
    make, queries, workers, pause = CATALOGUES[cat]
    qs = queries()

    def one(item):
        cached(cat, {'q': item[0], 'lang': item[1], 'family': item[2]}, make(item[0]))
        time.sleep(pause)
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(one, qs))
    print(cat, len(qs), 'queries', flush=True)


if __name__ == '__main__':
    for c in (sys.argv[1:] or CATALOGUES):
        run(c)
