#!/usr/bin/env python3
"""Temporal evidence Wikidata holds for the snapshot's undated sites, which the snapshot query did not ask for.

The snapshot (wikidata_snapshot.py) reads inception (P571), first mention (P1249), dissolution (P576), point in time
(P585) and start/end (P580/P582). Many castles, religious houses and cathedrals have none of these but carry other
dated statements. This asks Wikidata, for the snapshot's undated items only, for:

  P793 significant event with a date (P585 / P580 qualifier)   e.g. construction 1250, consecration 1180
  P1619 date of official opening
  P31 "instance of" with a start-time qualifier (P580)          e.g. castle since 1290
  P2348 time period, P149 architectural style, P2596 archaeological culture — and, for each of those items, the
        dates Wikidata records for it (P580/P582, P571/P576, or its own time period's)

Nothing is inferred here: the answers are saved unchanged, and atlas-build/sites.py decides what each can mean.

  data/historical/raw/wikidata-medieval/original/temporal-evidence.json   {statements: [...], periods: {Q: [from, to]}}

  python3 scripts/historical-data/wikidata_dates.py
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from fetch import MANIFEST, RAW, load, record, save  # noqa: E402

ENDPOINT = 'https://query.wikidata.org/sparql'
SNAP = os.path.join(RAW, 'wikidata-medieval', 'original')
OUT = os.path.join(SNAP, 'temporal-evidence.json')
QUERY_FILE = os.path.join(SNAP, 'queries', 'temporal-evidence.rq')
BATCH = 250
KINDS = ('castle', 'monastery', 'cathedral', 'diocese', 'fortification', 'bridge', 'university', 'settlement')

STATEMENTS = '''SELECT ?i ?prop ?v ?y WHERE {{ VALUES ?i {{ {vals} }}
  {{ ?i wdt:P2348 ?v . BIND("period" AS ?prop) }}
  UNION {{ ?i wdt:P149 ?v . BIND("style" AS ?prop) }}
  UNION {{ ?i wdt:P2596 ?v . BIND("culture" AS ?prop) }}
  UNION {{ ?i p:P793 ?s . ?s ps:P793 ?v . {{ ?s pq:P585 ?d }} UNION {{ ?s pq:P580 ?d }} BIND(YEAR(?d) AS ?y) BIND("event" AS ?prop) }}
  UNION {{ ?i wdt:P1619 ?d . BIND(YEAR(?d) AS ?y) BIND("opening" AS ?prop) }}
  UNION {{ ?i p:P31 ?s . ?s ps:P31 ?v . ?s pq:P580 ?d . BIND(YEAR(?d) AS ?y) BIND("instance-start" AS ?prop) }}
}}'''
# The dates of a period, style or culture item: its own start/end, else inception/dissolution, else its period's.
PERIODS = '''SELECT ?v ?a ?b WHERE {{ VALUES ?v {{ {vals} }}
  OPTIONAL {{ ?v wdt:P580 ?s1 }} OPTIONAL {{ ?v wdt:P582 ?e1 }} OPTIONAL {{ ?v wdt:P571 ?s2 }} OPTIONAL {{ ?v wdt:P576 ?e2 }}
  OPTIONAL {{ ?v wdt:P2348 ?p . OPTIONAL {{ ?p wdt:P580 ?s3 }} OPTIONAL {{ ?p wdt:P582 ?e3 }} }}
  BIND(YEAR(COALESCE(?s1, ?s2, ?s3)) AS ?a) BIND(YEAR(COALESCE(?e1, ?e2, ?e3)) AS ?b)
}}'''


def ask(query):
    for attempt in range(5):
        try:
            req = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'query': query, 'format': 'json'}).encode(),
                                         headers={'User-Agent': 'Shelf/1.0 (personal historical atlas; data audit)', 'Accept': 'application/sparql-results+json'})
            return json.load(urllib.request.urlopen(req, timeout=180))['results']['bindings']
        except Exception as e:  # noqa: BLE001 — rate limits and time-outs: wait and retry
            print('  retry', attempt + 1, str(e)[:80], flush=True)
            time.sleep(10 * (attempt + 1))
    raise SystemExit('Wikidata did not answer; nothing written.')


def undated_items():
    out = []
    for kind in KINDS:
        p = os.path.join(SNAP, f'{kind}.tsv')
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8') as f:
            for r in csv.DictReader(f, delimiter='\t'):
                if not any((r.get(k) or '').strip() for k in ('?inception', '?firstMention', '?dissolved', '?when', '?start', '?end')):
                    out.append(r['?i'].strip('<>').rsplit('/', 1)[-1])
    return sorted(set(out))


def main():
    ids = undated_items()
    print(f'{len(ids)} undated items', flush=True)
    os.makedirs(os.path.dirname(QUERY_FILE), exist_ok=True)
    open(QUERY_FILE, 'w').write(STATEMENTS.format(vals='wd:Q…') + '\n\n' + PERIODS.format(vals='wd:Q…') + '\n')
    rows = []
    for k in range(0, len(ids), BATCH):
        part = ids[k:k + BATCH]
        for b in ask(STATEMENTS.format(vals=' '.join('wd:' + q for q in part))):
            rows.append({'i': b['i']['value'].rsplit('/', 1)[-1], 'prop': b['prop']['value'], 'v': b.get('v', {}).get('value', '').rsplit('/', 1)[-1] or None,
                         'y': int(b['y']['value']) if b.get('y') else None})
        print(f'  {k + len(part)}/{len(ids)}: {len(rows)} statements', flush=True)
        time.sleep(1)
    refs = sorted({r['v'] for r in rows if r['prop'] in ('period', 'style', 'culture') and r['v']})
    periods = {}
    for k in range(0, len(refs), BATCH):
        for b in ask(PERIODS.format(vals=' '.join('wd:' + q for q in refs[k:k + BATCH]))):
            q = b['v']['value'].rsplit('/', 1)[-1]
            a = int(b['a']['value']) if b.get('a') else None
            z = int(b['b']['value']) if b.get('b') else None
            if q not in periods or (periods[q] == [None, None] and (a or z)):
                periods[q] = [a, z]
    json.dump({'asked': len(ids), 'statements': rows, 'periods': periods, 'endpoint': ENDPOINT}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    manifest = load(MANIFEST, {})
    manifest[os.path.relpath(OUT, RAW)] = record(ENDPOINT + ' (queries/temporal-evidence.rq)', OUT, manifest.get(os.path.relpath(OUT, RAW)))
    save(manifest)
    print(f'{OUT}: {len(rows)} statements for {len({r["i"] for r in rows})} items; {len(periods)} period/style/culture items')


if __name__ == '__main__':
    main()
