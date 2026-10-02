#!/usr/bin/env python3
"""Place identity across datasets: how often one historical place is several source records.

  python3 scripts/historical-data/entity_report.py → data/historical/audit/entities.json

Generic rule (no hand-made pairs): two records from *different* datasets are the same place when they share a name —
any of their recorded names, compared normalised (case, accents, punctuation, a leading article dropped) — and lie
within a distance that depends on what they are (a town's centre and its castle can be a kilometre or two apart;
two churches of the same dedication in one town are not one church), or when they carry the same Wikidata item.
Records of the same dataset are never merged (a dataset's own duplicates are reported separately).
"""
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
KM = {'settlement': 6, 'town': 6, 'city': 6, 'market': 6, 'castle': 1.5, 'fortification': 1.5, 'monastery': 1, 'cathedral': 1,
      'church': 0.5, 'bridge': 0.5, 'site': 0.5, 'diocese': 10}
CLASS = {'town': 'settlement', 'city': 'settlement', 'market': 'settlement', 'fortification': 'castle', 'cathedral': 'church', 'monastery': 'church'}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'^(the|le|la|les|l|il|lo|el|los|las|der|die|das|de|het)\s+', '', s)
    return re.sub(r'[^a-z0-9]+', '', s)


def dist(a, b):
    return math.hypot((a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2)), a[1] - b[1]) * 111.2


def rows():
    for d in (os.path.join(ROOT, 'public', 'world', 'places', 'c'), os.path.join(ROOT, 'data', 'private-pack', 'build', 'places', 'c')):
        if os.path.isdir(d):
            for fn in os.listdir(d):
                yield from json.load(open(os.path.join(d, fn), encoding='utf-8'))


def main():
    recs = []
    for r in rows():
        ex = r[13] or {}
        kind = ex.get('k') or ('settlement' if re.search(r'settlement|urban|town|city|village|polis', str(r[6])) else str(r[6]).split(',')[0])
        names = {norm(r[2])} | {norm(n[0]) for n in r[10] if n and n[0]}
        names.discard('')
        recs.append({'ds': r[0], 'id': r[1], 'name': r[2], 'kind': CLASS.get(kind, kind), 'll': (r[3], r[4]), 'names': names, 'q': ex.get('q') or (r[1] if r[0] == 'wikidata' else None)})
    parent = list(range(len(recs)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        a, b = find(i), find(j)
        if a != b:
            parent[b] = a
    by_name = defaultdict(list)
    for i, x in enumerate(recs):
        for n in x['names']:
            by_name[n].append(i)
    by_q = defaultdict(list)
    for i, x in enumerate(recs):
        if x['q']:
            by_q[x['q']].append(i)
    same_ds_dups = Counter()
    for n, ids in by_name.items():
        if len(ids) < 2 or len(ids) > 3000:
            continue
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                x, y = recs[ids[a]], recs[ids[b]]
                if x['kind'] != y['kind'] and not ({x['kind'], y['kind']} <= {'settlement', 'castle', 'church'} and 'settlement' in (x['kind'], y['kind'])):
                    continue
                lim = min(KM.get(x['kind'], 1), KM.get(y['kind'], 1)) if x['kind'] != y['kind'] else KM.get(x['kind'], 1)
                if dist(x['ll'], y['ll']) <= lim:
                    if x['ds'] == y['ds']:
                        same_ds_dups[x['ds']] += 1
                    else:
                        union(ids[a], ids[b])
    for q, ids in by_q.items():
        for j in ids[1:]:
            if recs[j]['ds'] != recs[ids[0]]['ds']:
                union(ids[0], j)
    groups = defaultdict(list)
    for i in range(len(recs)):
        groups[find(i)].append(i)
    multi = [g for g in groups.values() if len({recs[i]['ds'] for i in g}) > 1]
    pairs = Counter()
    for g in multi:
        dss = sorted({recs[i]['ds'] for i in g})
        for a in range(len(dss)):
            for b in range(a + 1, len(dss)):
                pairs[f'{dss[a]} + {dss[b]}'] += 1

    def show(name):
        n = norm(name)
        out = []
        for g in multi:
            if any(n in recs[i]['names'] for i in g):
                out.append(sorted({f"{recs[i]['ds']}:{recs[i]['name']}" for i in g})[:14])
        return sorted(out, key=len, reverse=True)[:2]
    rep = {'records': len(recs), 'entities': len(groups), 'recordsInMultiSourceEntities': sum(len(g) for g in multi), 'multiSourceEntities': len(multi),
           'largestEntity': max((len(g) for g in multi), default=0), 'sourcePairs': pairs.most_common(40), 'sameDatasetNearDuplicates': dict(same_ds_dups),
           'examples': {k: show(k) for k in ('London', 'Paris', 'Roma', 'York', 'Köln', 'Constantinople', 'Istanbul', 'Kraków', 'Edinburgh', 'Dublin', 'Lübeck', 'Sofia')},
           'method': __doc__.strip()}
    json.dump(rep, open(os.path.join(ROOT, 'data', 'historical', 'audit', 'entities.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in rep.items() if k not in ('method',)}, ensure_ascii=False)[:3500])


if __name__ == '__main__':
    main()
