#!/usr/bin/env python3
"""The entity layer: one historical place through time, assembled from source records by stored, reversible claims.

Three levels are kept apart (docs/HISTORICAL_SOURCES_SEARCH.md, O):
  source record  — a row of public/world/places as its dataset published it; never edited here
  entity         — a place through time, with an id of its own, made of records from *different* datasets
  map label      — the name shown for a year, chosen from the entity's dated name forms (label_at)

A join is a *claim* with its evidence, not an edit. Every claim considered is stored, also the ones not applied, so any
grouping can be audited ("why are these one place?" and "why are these not one place?") and reversed by dropping it.
Claims are tried strongest first:
  1. id    — the records carry the same external identifier (a Wikidata item).
  2. name  — the records share a recorded name form (normalised) and lie within a distance set by what they are.
A claim is applied only if the two groups have no dataset in common: two records of one dataset are never one place
(a dataset's own duplicates are its own business). A name claim is held back as ambiguous when another record of
the same dataset is about as close under the same name. Nothing is hand-paired; no name equivalence is hard-coded
("Istanbul = Constantinople" falls out of dated name forms, or does not appear at all).

Outputs (the public build holds only public records; with the private pack built, a full build goes into it):
  public/world/entities/r/{src}-{k}.json     record id → entity id      (k = crc32(id) % 16, as places/i)
  public/world/entities/e/{k}.json           entity id → entity          (k = crc32(entity id) % 64)
  data/historical/audit/entities.json        counts, dataset pairs, refused claims, label examples

  python3 scripts/atlas-build/entities.py           # public, and private if data/private-pack/build/places exists

Entity: {"id", "m": [record keys], "n": [[name, from, to, lang, basis, [member indexes]]], "c": [claims]}
Claim:  [a, b, basis, status, evidence]   a/b record keys; basis id|name; status joined|ambiguous|refused
Name basis: "name" (the name's own dates), "record" (a record's title, dated by the record), "period" (a record's
title, dated only by the period its evidence allows), "" (undated).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import sys
import unicodedata
import zlib
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
PUBLIC_PLACES = os.path.join(ROOT, 'public', 'world', 'places', 'c')
PUBLIC_OUT = os.path.join(ROOT, 'public', 'world', 'entities')
PRIVATE_PLACES = os.path.join(ROOT, 'data', 'private-pack', 'build', 'places', 'c')
PRIVATE_OUT = os.path.join(ROOT, 'data', 'private-pack', 'build', 'entities')
AUDIT = os.path.join(ROOT, 'data', 'historical', 'audit', 'entities.json')
ENTITY_SHARDS = 64
# Years either side of a name's own dates in which it still counts as current (as namesAround() in the app).
SLACK = 50

# How far apart two records may be and still be one place, by what they are: a town's centre and its castle can be a
# kilometre or two apart; two churches of the same dedication in one town are not one church. Kinds not listed here
# (rivers, regions, finds…) are joined only by a shared identifier.
KM = {'settlement': 6, 'castle': 1.5, 'church': 0.5, 'bridge': 0.5, 'site': 0.5, 'diocese': 10}
CLASS = {'town': 'settlement', 'city': 'settlement', 'market': 'settlement', 'village': 'settlement', 'fortification': 'castle',
         'cathedral': 'church', 'monastery': 'church', 'abbey': 'church', 'priory': 'church', 'convent': 'church'}
# A settlement and the castle or church named after it are the same named place, at the stricter distance.
CROSS = {frozenset({'settlement', 'castle'}), frozenset({'settlement', 'church'})}
BASIS_RANK = {'name': 3, 'record': 2, 'period': 1, '': 0}


def log(*a):
    print(*a, flush=True)


def match_norm(s) -> str:
    """For comparing names across datasets: case, accents, punctuation and a leading article dropped."""
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'^(the|le|la|les|l|il|lo|el|los|las|der|die|das|de|het)\s+', '', s)
    return re.sub(r'[^a-z0-9]+', '', s)


def form_norm(s) -> str:
    """For folding identical name forms (keeps script and spelling; as norm() in world.py)."""
    s = ''.join(c for c in unicodedata.normalize('NFD', str(s)) if not unicodedata.category(c).startswith('M')).lower()
    return re.sub(r'\s+', ' ', s.replace('’', "'")).strip()


def latin(s: str) -> bool:
    """Written in Latin letters (as isLatinScript() in src/atlas/names.ts)."""
    letters = [c for c in s if unicodedata.category(c).startswith('L')]
    return bool(letters) and all('LATIN' in unicodedata.name(c, '') for c in letters)


def km(a, b) -> float:
    return math.hypot((a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2)), a[1] - b[1]) * 111.2


def kind_of(r) -> str:
    ex = r[13] or {}
    k = ex.get('k') or ('settlement' if re.search(r'settlement|urban|town|city|village|polis', str(r[6])) else str(r[6]).split(',')[0])
    return CLASS.get(k, k)


def qid(r):
    ex = r[13] or {}
    q = r[1] if r[0] == 'wikidata' else ex.get('q')
    return q if isinstance(q, str) and re.fullmatch(r'Q\d+', q) else None


def rows(dirs):
    for d in dirs:
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                yield from json.load(open(os.path.join(d, fn), encoding='utf-8'))


class Groups:
    """Union-find over records that also tracks each group's datasets, so a join never puts two records of one
    dataset in one place."""

    def __init__(self, recs):
        self.parent = list(range(len(recs)))
        self.ds = [{r['ds']} for r in recs]

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def clash(self, i, j):
        a, b = self.find(i), self.find(j)
        return None if a == b else sorted(self.ds[a] & self.ds[b])

    def union(self, i, j):
        a, b = self.find(i), self.find(j)
        if a != b:
            self.parent[b] = a
            self.ds[a] |= self.ds[b]
            self.ds[b] = set()


def load(dirs):
    recs = []
    for r in rows(dirs):
        ex = r[13] or {}
        kind = kind_of(r)
        own_title = ex.get('tn') != 0
        names = {match_norm(n[0]) for n in (r[10] or []) if n and n[0]}
        if own_title:
            names.add(match_norm(r[2]))
        names = {n for n in names if len(n) >= 3}
        recs.append({'key': f'{r[0]}:{r[1]}', 'ds': r[0], 'title': r[2], 'll': (r[3], r[4]), 'kind': kind, 'names': names,
                     'q': qid(r), 'row': r, 'own_title': own_title})
    return recs


def candidate_claims(recs):
    """Every pair of records from different datasets with evidence of being one place, strongest evidence first."""
    out = []
    by_q = defaultdict(list)
    for i, x in enumerate(recs):
        if x['q']:
            by_q[x['q']].append(i)
    for q, ids in by_q.items():
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                i, j = ids[a], ids[b]
                if recs[i]['ds'] != recs[j]['ds']:
                    out.append((0, 0.0, i, j, 'id', {'wikidata': q, 'km': round(km(recs[i]['ll'], recs[j]['ll']), 2)}))
    # Shared name forms: compare only records in the same or a neighbouring 0.2° bucket (the widest limit is 10 km).
    by_name = defaultdict(lambda: defaultdict(list))
    for i, x in enumerate(recs):
        if x['kind'] not in KM:
            continue
        cell = (int(math.floor(x['ll'][0] / 0.2)), int(math.floor(x['ll'][1] / 0.2)))
        for n in x['names']:
            by_name[n][cell].append(i)
    seen = set()
    for n, cells in by_name.items():
        for (cx, cy), ids in cells.items():
            near = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in cells.get((cx + dx, cy + dy), ())]
            for i in ids:
                for j in near:
                    if j <= i or recs[i]['ds'] == recs[j]['ds'] or (i, j) in seen:
                        continue
                    x, y = recs[i], recs[j]
                    if x['kind'] == y['kind']:
                        lim = KM[x['kind']]
                    elif frozenset({x['kind'], y['kind']}) in CROSS:
                        lim = min(KM[x['kind']], KM[y['kind']])
                    else:
                        continue
                    d = km(x['ll'], y['ll'])
                    if d <= lim:
                        seen.add((i, j))
                        shared = sorted(x['names'] & y['names'])
                        out.append((1, d, i, j, 'name', {'names': shared[:4], 'km': round(d, 2), 'limit': lim, 'kinds': sorted({x['kind'], y['kind']})}))
    out.sort(key=lambda c: (c[0], c[1], recs[c[2]]['key'], recs[c[3]]['key']))
    return out


def resolve(recs, cands):
    """Apply claims strongest first. Returns the groups and every claim with its status."""
    # A name claim is ambiguous when the record has another candidate of the same dataset, under a shared name, that
    # is not clearly farther (less than twice as far): the evidence cannot say which one is meant.
    nearest = defaultdict(list)
    for basis_rank, d, i, j, basis, ev in cands:
        if basis == 'name':
            nearest[(i, recs[j]['ds'])].append((d, j))
            nearest[(j, recs[i]['ds'])].append((d, i))
    ambiguous = set()
    for (i, _), xs in nearest.items():
        if len(xs) > 1:
            xs.sort()
            if xs[1][0] < 2 * xs[0][0] + 0.05:
                ambiguous.update((min(i, j), max(i, j)) for _, j in xs)
    g = Groups(recs)
    claims = []
    for basis_rank, d, i, j, basis, ev in cands:
        a, b = recs[i]['key'], recs[j]['key']
        if basis == 'name' and (min(i, j), max(i, j)) in ambiguous:
            claims.append((i, j, [a, b, basis, 'ambiguous', {**ev, 'why': 'another record of the same dataset is about as close under the same name'}]))
            continue
        clash = g.clash(i, j)
        if clash is None:
            claims.append((i, j, [a, b, basis, 'joined', {**ev, 'why': 'already one place through other claims'}]))
        elif clash:
            claims.append((i, j, [a, b, basis, 'refused', {**ev, 'why': f'would make two records of {", ".join(clash)} one place'}]))
        else:
            g.union(i, j)
            claims.append((i, j, [a, b, basis, 'joined', ev]))
    return g, claims


def name_forms(members):
    """Every name form of the entity, with its own dates and the records that give it."""
    forms = {}
    for mi, x in enumerate(members):
        r = x['row']
        ex = r[13] or {}
        out = []
        if x['own_title']:
            if r[7] is not None or r[8] is not None:
                out.append((r[2], r[7], r[8], None, 'record'))
            elif ex.get('env'):
                out.append((r[2], ex['env'][0], ex['env'][1], None, 'period'))
            else:
                out.append((r[2], None, None, None, ''))
        for n in r[10] or []:
            if not n or not n[0]:
                continue
            lang = n[3] if len(n) > 3 and n[3] not in (None, 'None', '') else None
            dated = n[1] is not None or n[2] is not None
            out.append((n[0], n[1] if dated else None, n[2] if dated else None, lang, 'name' if dated else ''))
        for name, a, b, lang, basis in out:
            k = (form_norm(name), a, b, basis)
            f = forms.get(k)
            if f is None:
                forms[k] = f = [name, a, b, lang, basis, []]
            if mi not in f[5]:
                f[5].append(mi)
            if f[3] is None and lang:
                f[3] = lang
    return sorted(forms.values(), key=lambda f: (-BASIS_RANK[f[4]], f[1] if f[1] is not None else 99999, form_norm(f[0])))


def covers(f, year) -> bool:
    """Whether a name form is current at a year. A name given only a start year is one attestation (a register entry,
    a first mention), current only near that year; a record's title with only a start runs on (the place persists)."""
    a, b = f[1], f[2]
    if a is None and b is None:
        return False
    if b is None and f[4] == 'name':
        b = a
    return (a if a is not None else -99999) - SLACK <= year <= (b if b is not None else 99999) + SLACK


def is_title(f, entity) -> bool:
    """The form is a member record's own main title, and a single name (not "Londinium/Augusta")."""
    return f[4] in ('record', 'period', '') and '/' not in f[0]


def label_at(entity, year, datasets=None):
    """The name to show for an entity in a year, and why. Must match labelAt() in src/atlas/entities.ts.

    1. Name forms current at the year (their dates, ±50 years), ranked: a name dated in its own right before a record's
       title dated by its record, before one dated only by an evidence period (many records are titled with today's
       name, so a title's dates are not the name's); then the number of datasets giving the form at that year; then a
       record's own main title; then Latin script; then the longer-lived form (a short-lived one is usually one
       source's variant).
    2. With none current: the undated form most datasets give (Latin script first).
    Returns (name, rule, form)."""
    ds = datasets or (lambda mi: entity['m'][mi].split(':', 1)[0])
    folded = defaultdict(set)
    for f in entity['n']:
        if year is not None and covers(f, year):
            folded[form_norm(f[0])].update(ds(mi) for mi in f[5])
    cur = [f for f in entity['n'] if year is not None and covers(f, year)]
    if cur:
        def rank(f):
            span = (f[2] if f[2] is not None else 2100) - (f[1] if f[1] is not None else -3000)
            return (-BASIS_RANK[f[4]], -len(folded[form_norm(f[0])]), 0 if is_title(f, entity) else 1, 0 if latin(f[0]) else 1, -span, form_norm(f[0]))
        best = min(cur, key=rank)
        return best[0], {'name': 'dated-name', 'record': 'dated-record', 'period': 'evidence-period'}[best[4]], best
    und = defaultdict(set)
    for f in entity['n']:
        und[form_norm(f[0])].update(ds(mi) for mi in f[5])
    best = min(entity['n'], key=lambda f: (-len(und[form_norm(f[0])]), 0 if latin(f[0]) else 1, -BASIS_RANK[f[4]], form_norm(f[0])))
    return best[0], 'most-sources', best


def entity_id(keys):
    return 'e' + hashlib.sha1(min(keys).encode('utf-8')).hexdigest()[:12]


def build(dirs, out_dir):
    recs = load(dirs)
    log(f'  {len(recs):,} records')
    cands = candidate_claims(recs)
    log(f'  {len(cands):,} candidate claims')
    g, claims = resolve(recs, cands)
    groups = defaultdict(list)
    for i in range(len(recs)):
        groups[g.find(i)].append(i)
    by_root = defaultdict(list)
    for i, j, c in claims:
        by_root[g.find(i)].append(c)
        if g.find(j) != g.find(i):
            by_root[g.find(j)].append(c)
    entities = []
    for root, ids in groups.items():
        if len(ids) < 2 and root not in by_root:
            continue  # a record no claim touches is its own place; the app needs no file for it
        ids.sort(key=lambda i: recs[i]['key'])
        members = [recs[i] for i in ids]
        keys = [m['key'] for m in members]
        entities.append({'id': entity_id(keys), 'm': keys, 'n': name_forms(members), 'c': by_root.get(root, [])})
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    rmap = defaultdict(dict)
    emap = defaultdict(dict)
    for e in entities:
        for k in e['m']:
            src, rid = k.split(':', 1)
            rmap[f'{src}-{zlib.crc32(rid.encode()) % 16}'][rid] = e['id']
        emap[zlib.crc32(e['id'].encode()) % ENTITY_SHARDS][e['id']] = {k: v for k, v in e.items() if k != 'id'}
    for name, m in rmap.items():
        write(os.path.join(out_dir, 'r', f'{name}.json'), m)
    for k, m in emap.items():
        write(os.path.join(out_dir, 'e', f'{k}.json'), m)
    return recs, entities, claims


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))


EXAMPLES = [('London', [100, 900, 1300, 1800]), ('Paris', [300, 1200]), ('Köln', [100, 1200, 1800]), ('York', [200, 900, 1300]),
            ('Constantinople', [300, 1300, 1600, 1900]), ('Kraków', [1300, 1580]), ('Lübeck', [1300]), ('Sofia', [300, 1300, 1600, 1900]),
            ('Aachen', [800, 1500]), ('Bratislava', [1300, 1700, 1900]), ('Ljubljana', [200, 1500, 1900])]


def report(recs, entities, claims, label):
    status = Counter(c[3] for _, _, c in claims)
    basis = Counter((c[2], c[3]) for _, _, c in claims)
    multi = [e for e in entities if len(e['m']) > 1]
    pairs = Counter()
    for e in multi:
        dss = sorted({k.split(':', 1)[0] for k in e['m']})
        for a in range(len(dss)):
            for b in range(a + 1, len(dss)):
                pairs[f'{dss[a]} + {dss[b]}'] += 1
    refused = Counter(', '.join(sorted({c[0].split(':')[0], c[1].split(':')[0]})) for _, _, c in claims if c[3] == 'refused')
    by_key = {}
    for e in multi:
        for k in e['m']:
            by_key[k] = e
    examples = {}
    for name, years in EXAMPLES:
        n = match_norm(name)
        best = None
        # Prefer a place one of whose records is titled exactly so (Kraków, not Krakow am See), then the most records.
        score = lambda e: (any(f[4] != 'name' and form_norm(f[0]) == form_norm(name) for f in e['n']), len(e['m']))
        for e in multi:
            if any(match_norm(f[0]) == n for f in e['n']) and (best is None or score(e) > score(best)):
                best = e
        if best:
            examples[name] = {'entity': best['id'], 'records': best['m'][:16],
                              'labels': {str(y): (lambda t: {'label': t[0], 'rule': t[1], 'from': t[2][1], 'to': t[2][2],
                                                             'sources': sorted({best['m'][mi] for mi in t[2][5]})[:6]})(label_at(best, y)) for y in years}}
    return {'label': label, 'records': len(recs), 'entitiesWithFiles': len(entities), 'multiSourceEntities': len(multi),
            'recordsInMultiSourceEntities': sum(len(e['m']) for e in multi), 'largestEntity': max((len(e['m']) for e in multi), default=0),
            'claims': dict(status), 'claimsByBasis': {f'{b} {s}': n for (b, s), n in sorted(basis.items())},
            'sourcePairs': pairs.most_common(40), 'refusedBetween': refused.most_common(20), 'examples': examples,
            'method': __doc__.strip().split('\n\nOutputs')[0]}


def main():
    reports = []
    log('entities: public records')
    recs, ents, claims = build([PUBLIC_PLACES], PUBLIC_OUT)
    reports.append(report(recs, ents, claims, 'public'))
    if os.path.isdir(PRIVATE_PLACES):
        log('entities: public and private records (into the private pack)')
        recs, ents, claims = build([PUBLIC_PLACES, PRIVATE_PLACES], PRIVATE_OUT)
        reports.append(report(recs, ents, claims, 'public + private pack'))
    os.makedirs(os.path.dirname(AUDIT), exist_ok=True)
    json.dump(reports if len(reports) > 1 else reports[0], open(AUDIT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in reports:
        log(json.dumps({k: v for k, v in r.items() if k not in ('method', 'examples', 'sourcePairs')}, ensure_ascii=False))
        for name, ex in r['examples'].items():
            log(f"  {name}: " + '; '.join(f"{y} {v['label']} ({v['rule']})" for y, v in ex['labels'].items()))


if __name__ == '__main__':
    sys.exit(main())
