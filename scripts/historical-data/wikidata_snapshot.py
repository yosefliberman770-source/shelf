#!/usr/bin/env python3
"""Snapshot medieval and early sites from Wikidata (CC0) into the raw vault.

Wikidata has no bulk file for "castles in Europe", so the snapshot is a set
of SPARQL queries run against the QLever Wikidata endpoint (a full, fast
mirror; the Wikidata Query Service rate-limits and times out on these).
Each query is saved next to its result, so the snapshot can be re-run and
compared, and every result file is recorded in manifest.json with the
endpoint, size, SHA-256 and date like any other download.

  data/historical/raw/wikidata-medieval/original/queries/<kind>.rq        the query
  data/historical/raw/wikidata-medieval/original/<kind>.tsv               core fields
  data/historical/raw/wikidata-medieval/original/<kind>.names.tsv         labels in European languages
  data/historical/raw/wikidata-medieval/original/labels.tsv               English labels of referenced items (orders, types, dioceses, wars)

  python3 scripts/historical-data/wikidata_snapshot.py          # all kinds
  python3 scripts/historical-data/wikidata_snapshot.py castle   # one kind

The area is Europe, the Mediterranean and the Near East (lon −32…62,
lat 24…72). Which records are included is decided only by Wikidata's own
classes and dates — nothing is added or corrected here.
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from fetch import MANIFEST, RAW, load, record, save  # noqa: E402

ENDPOINT = 'https://qlever.dev/api/wikidata'
OUT = os.path.join(RAW, 'wikidata-medieval', 'original')
BOX = '?lon > -32 && ?lon < 62 && ?lat > 24 && ?lat < 72'
DATED = lambda before, after=None: (  # noqa: E731
    '?i wdt:P571 ?d0 . FILTER(YEAR(?d0) < %d)' % before if after is None else
    '{ ?i wdt:P1249 ?d0 } UNION { ?i wdt:P571 ?d0 } FILTER(YEAR(?d0) < %d && YEAR(?d0) >= %d)' % (before, after))
EVENT = '{ ?i wdt:P585 ?d0 } UNION { ?i wdt:P580 ?d0 } FILTER(YEAR(?d0) < 1600)'

# kind → (Wikidata class, extra restriction). Classes are matched with subclasses (P31/P279*).
KINDS = {
    'castle': ('wd:Q23413', ''),                      # castle (all, dated or not)
    'monastery': ('wd:Q44613', ''),                   # monastery, incl. abbeys, priories, convents, friaries
    'cathedral': ('wd:Q2977', ''),
    'diocese': ('wd:Q665487', ''),
    'battle': ('wd:Q178561', EVENT),
    'siege': ('wd:Q188055', EVENT),
    'fortification': ('wd:Q57821', DATED(1500)),       # only with a founding date before 1500 (the class includes modern forts)
    'university': ('wd:Q3918', DATED(1600)),
    'bridge': ('wd:Q12280', DATED(1600)),
    'settlement': ('wd:Q486972', DATED(1600, 400)),    # with a first written mention (P1249) or founding date, 400–1600
    'city': ('wd:Q515 wd:Q3957', ''),                  # cities and towns of any date: used only to give English names to other sources' towns
    'town': ('wd:Q486972', '?i wdt:P1082 ?pp . FILTER(?pp >= 5000)'),  # any settlement of 5,000+ today (communes, boroughs…), same use
}
# Latin-script languages, then languages in other scripts (kept so that no place is left without its
# own name; Cyrillic and Greek labels can be romanized by a standard scheme, see atlas-build/translit.py).
NAME_LANGS = ('de fr it es pt ca nl pl cs sk hu ro hr sl sv da nb fi is la lt lv et ga cy eu gl mul '
              'sq tr sr-el sh lb rm fy se hsb ru uk be bg sr mk el ka hy ar he').split()

HEAD = '''PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
'''


def inner(cls, extra):
    return f'''  {{ SELECT DISTINCT ?i ?c WHERE {{ VALUES ?cls {{ {cls} }} ?i wdt:P31/wdt:P279* ?cls . ?i wdt:P625 ?c .
    BIND(geof:longitude(?c) AS ?lon) BIND(geof:latitude(?c) AS ?lat)
    FILTER({BOX}) {extra} }} }}'''


def core_query(cls, extra):
    # P571 inception, P1249 earliest written record, P576 dissolved, P585 point in time, P580/P582 start/end,
    # P611 religious order, P708 diocese, P361 part of (e.g. the war a battle belongs to), P31 instance of.
    return HEAD + f'''SELECT ?i (SAMPLE(?c) AS ?coord) (SAMPLE(?en) AS ?label)
  (MIN(?inc) AS ?inception) (MIN(?fm) AS ?firstMention) (MIN(?dis) AS ?dissolved) (MIN(?pt) AS ?when) (MIN(?st) AS ?start) (MAX(?e2) AS ?end)
  (GROUP_CONCAT(DISTINCT STR(?ord); separator="|") AS ?orders) (SAMPLE(?dio) AS ?diocese) (GROUP_CONCAT(DISTINCT STR(?part); separator="|") AS ?partOf)
  (SAMPLE(?sl) AS ?sitelinks) (GROUP_CONCAT(DISTINCT STR(?typ); separator="|") AS ?types)
WHERE {{
{inner(cls, extra)}
  OPTIONAL {{ ?i rdfs:label ?en . FILTER(LANG(?en) = "en") }}
  OPTIONAL {{ ?i wdt:P571 ?inc }}
  OPTIONAL {{ ?i wdt:P1249 ?fm }}
  OPTIONAL {{ ?i wdt:P576 ?dis }}
  OPTIONAL {{ ?i wdt:P585 ?pt }}
  OPTIONAL {{ ?i wdt:P580 ?st }}
  OPTIONAL {{ ?i wdt:P582 ?e2 }}
  OPTIONAL {{ ?i wdt:P611 ?ord }}
  OPTIONAL {{ ?i wdt:P708 ?dio }}
  OPTIONAL {{ ?i wdt:P361 ?part }}
  OPTIONAL {{ ?i wikibase:sitelinks ?sl }}
  OPTIONAL {{ ?i wdt:P31 ?typ }}
}} GROUP BY ?i
'''


def names_query(cls, extra):
    langs = ','.join(f'"{x}"' for x in NAME_LANGS)
    return HEAD + f'''SELECT ?i (GROUP_CONCAT(DISTINCT CONCAT(LANG(?alt), ":", STR(?alt)); separator="|") AS ?names) WHERE {{
{inner(cls, extra)}
  ?i rdfs:label ?alt . FILTER(LANG(?alt) IN ({langs}))
}} GROUP BY ?i
'''


def run(query, dest):
    for attempt in range(4):
        r = subprocess.run(['curl', '-sS', '-m', '600', '-X', 'POST', ENDPOINT, '-H', 'Accept: text/tab-separated-values',
                            '-H', 'Content-Type: application/sparql-query', '--data-binary', query, '-o', dest + '.part'])
        if r.returncode == 0 and open(dest + '.part', 'rb').read(1) == b'?':
            os.replace(dest + '.part', dest)
            return True
        time.sleep(5 * (attempt + 1))
    print('FAILED ', dest)
    return False


def main():
    only = sys.argv[1:]
    os.makedirs(os.path.join(OUT, 'queries'), exist_ok=True)
    manifest = load(MANIFEST, {})
    for kind, (cls, extra) in KINDS.items():
        if only and kind not in only:
            continue
        for suffix, q in (('', core_query(cls, extra)), ('.names', names_query(cls, extra))):
            qpath = os.path.join(OUT, 'queries', f'{kind}{suffix}.rq')
            open(qpath, 'w').write(q)
            dest = os.path.join(OUT, f'{kind}{suffix}.tsv')
            if run(q, dest):
                rel = os.path.relpath(dest, RAW)
                manifest[rel] = record(f'{ENDPOINT} (POST queries/{kind}{suffix}.rq)', dest, manifest.get(rel))
                print(f'{kind}{suffix}: {sum(1 for _ in open(dest)) - 1} rows')
        save(manifest)
    labels(manifest)


def labels(manifest):
    """English labels for the items the snapshot refers to (orders, types, dioceses, wars)."""
    refs = set()
    for f in os.listdir(OUT):
        if not f.endswith('.tsv') or '.names' in f or f == 'labels.tsv':
            continue
        for line in open(os.path.join(OUT, f), encoding='utf-8'):
            for cell in line.rstrip('\n').split('\t')[9:]:
                for x in cell.strip('"<>').split('|'):
                    if '/entity/Q' in x:
                        refs.add(x.strip('<>').rsplit('/', 1)[1])
    refs = sorted(refs)
    dest = os.path.join(OUT, 'labels.tsv')
    rows = ['?i\t?l']
    for i in range(0, len(refs), 3000):
        vals = ' '.join('wd:' + x for x in refs[i:i + 3000])
        q = HEAD + f'SELECT ?i ?l WHERE {{ VALUES ?i {{ {vals} }} ?i rdfs:label ?l . FILTER(LANG(?l) = "en") }}\n'
        tmp = dest + '.batch'
        if run(q, tmp):
            rows += open(tmp, encoding='utf-8').read().splitlines()[1:]
            os.remove(tmp)
    open(dest, 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
    rel = os.path.relpath(dest, RAW)
    manifest[rel] = record(f'{ENDPOINT} (labels of referenced items)', dest, manifest.get(rel))
    save(manifest)
    print('labels:', len(rows) - 1)


if __name__ == '__main__':
    main()
