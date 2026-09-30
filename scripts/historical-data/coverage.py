#!/usr/bin/env python3
"""Measure what Shelf's offline data actually holds, region × theme × period.

Counts real records in the built packs (public/world, public/atlas) — never
what a dataset claims to cover. Regions are present-day countries (CShapes
2.0, 2019 borders) grouped into the areas the audit asked about; that is a
modern-border convenience for counting, not a historical claim.

  python3 scripts/historical-data/coverage.py
    → data/historical/coverage-measured.json
    → docs/HISTORICAL_COVERAGE_MEASURED.md

A record counts for a period when its own dates overlap it. Records with
only an evidence period (an envelope) are counted separately as
"approximate"; records with no dates at all as "undated" — neither is
evidence for a particular period.
"""
import json
import os
import re
from collections import defaultdict
from datetime import date

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')
CACHE = os.path.join(ROOT, 'scripts', 'atlas-build', '.cache')

PERIODS = [(500, 799), (800, 999), (1000, 1199), (1200, 1399), (1400, 1500)]
THEMES = ['Settlements', 'Political', 'Religion', 'Military', 'Roads', 'Economy', 'Landscape', 'Events', 'Names']
GROUPS = {
    'British Isles': ['United Kingdom', 'Ireland'],
    'France': ['France', 'Monaco'],
    'Low Countries': ['Belgium', 'Netherlands', 'Luxembourg'],
    'Germany': ['German Federal Republic'],
    'Austria': ['Austria', 'Liechtenstein'],
    'Switzerland': ['Switzerland'],
    'Italy & Malta': ['Italy/Sardinia', 'San Marino', 'Malta'],
    'Iberia': ['Spain', 'Portugal', 'Andorra'],
    'Scandinavia': ['Denmark', 'Norway', 'Sweden'],
    'Finland & Iceland': ['Finland', 'Iceland'],
    'Poland': ['Poland'],
    'Czechia': ['Czech Republic'],
    'Slovakia': ['Slovakia'],
    'Hungary': ['Hungary'],
    'Western Balkans': ['Slovenia', 'Croatia', 'Bosnia-Herzegovina', 'Serbia', 'Montenegro', 'Kosovo', 'Macedonia (FYROM/North Macedonia)', 'Albania'],
    'Bulgaria': ['Bulgaria'],
    'Romania & Moldova': ['Rumania', 'Moldova'],
    'Greece': ['Greece'],
    'Baltic': ['Estonia', 'Latvia', 'Lithuania'],
    'Belarus': ['Belarus (Byelorussia)'],
    'Ukraine': ['Ukraine'],
    'Western Russia': ['Russia (Soviet Union)'],
    'Anatolia': ['Turkey (Ottoman Empire)'],
}


def status(n, theme=''):
    # Political counts distinct polities, not records: a region with 15 recorded polities in a period is well covered.
    if theme == 'Political':
        return 'strong' if n >= 15 else 'moderate' if n >= 5 else 'weak' if n > 0 else 'absent'
    return 'strong' if n >= 200 else 'moderate' if n >= 50 else 'weak' if n > 0 else 'absent'


def regions():
    d = json.load(open(os.path.join(ROOT, 'data', 'historical', 'raw', 'cshapes', 'original', 'CShapes-Europe.geojson')))
    to_group = {c: g for g, cs in GROUPS.items() for c in cs}
    geoms, names = [], []
    for f in d['features']:
        p = f['properties']
        if p['To'] >= 2019 and p['Name'] in to_group:
            geoms.append(shape(f['geometry']))
            names.append(to_group[p['Name']])
    tree = STRtree(geoms)

    def at(lon, lat):
        pt = Point(lon, lat)
        for i in tree.query(pt):
            if geoms[i].contains(pt):
                g = names[i]
                return None if g == 'Western Russia' and lon > 45 else g  # western Russia only (to 45°E)
        return None
    return at


def theme_of(src, types, extra):
    t = types.lower()
    k = (extra or {}).get('k')
    if src == 'wikidata':
        return {'settlement': 'Settlements', 'monastery': 'Religion', 'cathedral': 'Religion', 'diocese': 'Religion', 'university': 'Religion',
                'castle': 'Military', 'fortification': 'Military', 'bridge': 'Roads'}.get(k)
    if src == 'germaniasacra':
        return 'Religion'
    if src == 'buringh':
        return 'Settlements'
    if src == 'viabundus':
        if re.search(r'\b(toll|fair|staple|harbour)\b', t) and not re.search(r'\b(town|settlement)\b', t):
            return 'Economy'
        if re.search(r'\b(bridge|ferry|lock)\b', t) and not re.search(r'\b(town|settlement)\b', t):
            return 'Roads'
        return 'Settlements'
    if src == 'althurayya':
        return 'Roads' if 'waystation' in t else 'Political' if 'region' in t else 'Settlements'
    # Pleiades place types
    if re.search(r'temple|sanctuar|church|monaster|shrine|mosque|synagog|cathedral', t):
        return 'Religion'
    if re.search(r'fort|castle|camp|wall|tower', t):
        return 'Military'
    if re.search(r'road|bridge|station|aqueduct', t):
        return 'Roads'
    if re.search(r'river|mountain|lake|island|cape|bay|spring|forest|plain|valley|pass|hill|marsh|lagoon', t):
        return 'Landscape'
    if re.search(r'market|port|harbo|mine|quarr|kiln|mill|agora|forum', t):
        return 'Economy'
    if re.search(r'province|region|people|ethnic|territor', t):
        return 'Political'
    if re.search(r'settlement|urban|polis|villa|vicus|city|town|village', t):
        return 'Settlements'
    return None


def overlaps(a, b, lo, hi):
    return (a is None or a <= hi) and (b is None or b >= lo) and not (a is None and b is None)


def main():
    at = regions()
    counts = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))  # region → theme → period → n
    approx = defaultdict(lambda: defaultdict(int))
    undated = defaultdict(lambda: defaultdict(int))
    by_source = defaultdict(lambda: defaultdict(int))

    def add(region, theme, a, b, src, env=None):
        if not region or not theme:
            return
        hit = False
        for lo, hi in PERIODS:
            if overlaps(a, b, lo, hi):
                counts[region][theme][f'{lo}-{hi}'] += 1
                hit = True
        if hit:
            by_source[region][src] += 1
        elif a is None and b is None:
            (approx if env else undated)[region][theme] += 1

    cdir = os.path.join(PUB, 'world', 'places', 'c')
    for fn in os.listdir(cdir):
        for r in json.load(open(os.path.join(cdir, fn), encoding='utf-8')):
            src, _, _, lon, lat, _, types, a, b, _, names, _, _, extra = r
            region = at(lon, lat)
            if not region:
                continue
            if src == 'buringh':
                pops = {int(y): v for y, v in (extra or {}).get('pop', {}).items()}
                for lo, hi in PERIODS:
                    if any(v > 0 for y, v in pops.items() if lo <= y <= hi + 100 and y >= lo):
                        counts[region]['Settlements'][f'{lo}-{hi}'] += 1
                by_source[region]['buringh'] += 1
            else:
                env = (extra or {}).get('env') or (extra or {}).get('period')
                if a is None and b is None and env:
                    add(region, theme_of(src, types, extra), env[0], env[1], src)  # counted in its period, but…
                    approx[region][theme_of(src, types, extra) or '—'] += 1       # …also flagged approximate
                else:
                    add(region, theme_of(src, types, extra), a, b, src)
            # Names: dated records that carry historical or alternative names.
            if names:
                add(region, 'Names', a, b, src + ':names')

    for f, src in (('wikidata-events.json', 'wikidata'), ('hced-battles.json', 'hced')):
        for e in json.load(open(os.path.join(PUB, 'atlas', f), encoding='utf-8'))['features']:
            lon, lat = e['geometry']['coordinates'][:2]
            p = e['properties']
            region = at(lon, lat)
            th = 'Military' if p['k'] in ('battle', 'siege', 'campaign', 'expedition') else 'Events'
            add(region, th, p['y'], p.get('y2', p['y']), src)
            add(region, 'Events', p['y'], p.get('y2', p['y']), src)

    # Political: distinct polities whose label point lies in the region, per slice.
    pol = defaultdict(lambda: defaultdict(set))
    cl = os.path.join(PUB, 'atlas', 'cliopatria')
    for fn in os.listdir(cl):
        m = re.match(r'^(-?\d+)_(-?\d+)\.json$', fn)
        if not m or int(m.group(2)) < 500 or int(m.group(1)) > 1500:
            continue
        for f in json.load(open(os.path.join(cl, fn), encoding='utf-8'))['features']:
            p = f['properties']
            if 'lbl' not in p or f['geometry']['type'] != 'Point':
                continue
            region = at(*f['geometry']['coordinates'][:2])
            if not region:
                continue
            for lo, hi in PERIODS:
                if overlaps(p.get('f'), p.get('t'), lo, hi):
                    pol[region][f'{lo}-{hi}'].add(p.get('n'))
    for region, per in pol.items():
        for k, v in per.items():
            counts[region]['Political'][k] += len(v)

    # Roads: segments (Itiner-e: Roman, dated; Viabundus edges: dated or its 1350–1650 period).
    for line in open(os.path.join(CACHE, 'itinere.ndjson'), encoding='utf-8'):
        f = json.loads(line)
        cs = (f.get('geometry') or {}).get('coordinates') or []
        c = cs[0][0] if cs and isinstance(cs[0][0], list) else cs[0] if cs else None
        if c:
            p = f['properties']
            add(at(c[0], c[1]), 'Roads', p.get('lowerDate'), p.get('upperDate'), 'itinere')
    for f in json.load(open(os.path.join(CACHE, 'viabundus_Viabundus-2-edges.geojson'), encoding='utf-8'))['features']:
        g = f.get('geometry') or {}
        cs = g.get('coordinates') or []
        c = cs[0][0] if cs and isinstance(cs[0][0], list) else cs[0] if cs else None
        if c:
            p = f['properties']
            a, b = p.get('fromyear'), p.get('toyear')
            add(at(c[0], c[1]), 'Roads', a or 1350, b or 1650, 'viabundus')

    out = {'built': date.today().isoformat(), 'periods': [f'{a}-{b}' for a, b in PERIODS], 'themes': THEMES,
           'thresholds': 'strong ≥200 records, moderate 50–199, weak 1–49, absent 0 (per region, theme and period); Political counts distinct polities: strong ≥15, moderate 5–14',
           'regions': {g: {'counts': {t: dict(counts[g][t]) for t in THEMES}, 'approximate': dict(approx[g]), 'undated': dict(undated[g]),
                           'sources': dict(sorted(by_source[g].items(), key=lambda x: -x[1]))} for g in GROUPS}}
    json.dump(out, open(os.path.join(ROOT, 'data', 'historical', 'coverage-measured.json'), 'w'), ensure_ascii=False, indent=1)

    sym = {'strong': '●', 'moderate': '◐', 'weak': '○', 'absent': '·'}
    lines = ['# Measured coverage: medieval Europe', '',
             f'Counted from the records Shelf actually holds offline on {out["built"]} by `scripts/historical-data/coverage.py` — not from what datasets claim. '
             'Regions are present-day countries (CShapes 2.0 borders) grouped for counting; that is a counting convenience, not a historical claim.', '',
             '● strong (≥200 records) · ◐ moderate (50–199) · ○ weak (1–49) · · absent. A record counts for a period when its own dates overlap it; '
             '“approximate” records (dated only by an evidence period) are included but flagged below. Political = distinct polities (Cliopatria) with their label in the region (● ≥15, ◐ 5–14). '
             'Not counted here: the England-only layers (Domesday, Gough Map, inland navigation, bridges), which are tiles rather than place records.', '']
    for lo, hi in PERIODS:
        k = f'{lo}-{hi}'
        lines += [f'## {lo}–{hi}', '', '| Region | ' + ' | '.join(THEMES) + ' |', '| --- |' + ' --- |' * len(THEMES)]
        for g in GROUPS:
            cells = [f"{sym[status(counts[g][t].get(k, 0), t)]} {counts[g][t].get(k, 0)}" for t in THEMES]
            lines.append(f'| {g} | ' + ' | '.join(cells) + ' |')
        lines.append('')
    lines += ['## Records without dates (not counted above)', '', '| Region | Approximate (evidence period) | Undated |', '| --- | --- | --- |']
    for g in GROUPS:
        lines.append(f"| {g} | {sum(approx[g].values())} | {sum(undated[g].values())} |")
    lines += ['', '## Main sources per region (records counted in any period)', '']
    for g in GROUPS:
        top = ', '.join(f'{s} {n}' for s, n in list(out['regions'][g]['sources'].items())[:6])
        lines.append(f'- **{g}:** {top or "—"}')
    lines.append('')
    open(os.path.join(ROOT, 'docs', 'HISTORICAL_COVERAGE_MEASURED.md'), 'w').write('\n'.join(lines))
    print('wrote coverage-measured.json and HISTORICAL_COVERAGE_MEASURED.md')


if __name__ == '__main__':
    main()
