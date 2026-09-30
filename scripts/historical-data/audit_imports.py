#!/usr/bin/env python3
"""Measure what the Europe-wide imports actually contain — not what their record
counts suggest. Reads the raw vault (Wikidata snapshot, Buringh) and the built
place index, and writes data/historical/audit/import-audit.json.

  python3 scripts/historical-data/audit_imports.py
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'atlas-build'))
import sites  # noqa: E402

OUT = os.path.join(ROOT, 'data', 'historical', 'audit', 'import-audit.json')
SITE_KINDS = ['cathedral', 'monastery', 'university', 'castle', 'fortification', 'bridge', 'diocese', 'settlement']


def pct(a, b):
    return round(100 * a / b, 1) if b else 0.0


def wikidata():
    recs = sites.wd_records(sites.KINDS + ['city', 'town'])
    site = [r for r in recs.values() if r['kind'] in SITE_KINDS]
    out = {'itemsInSnapshot': len(recs), 'siteItems': len(site), 'byKind': {}}
    for k in SITE_KINDS:
        rs = [r for r in site if r['kind'] == k]
        start = [min(x for x in (r['inc'], r['fm']) if x is not None) for r in rs if r['inc'] is not None or r['fm'] is not None]
        types = ' | '.join(' | '.join(r['types']) for r in rs).lower()
        latin_only = sum(1 for r in rs if not r['en'] and any(sites.latin(v) for v in r['names'].values()))
        no_latin = sum(1 for r in rs if not r['en'] and not any(sites.latin(v) for v in r['names'].values()))
        both = [(r['inc'], r['fm']) for r in rs if r['inc'] is not None and r['fm'] is not None]
        out['byKind'][k] = {
            'items': len(rs),
            'withFoundingOrFirstMention': len(start),
            'pctDated': pct(len(start), len(rs)),
            'startBefore500': sum(1 for s in start if s < 500),
            'start500to1500': sum(1 for s in start if 500 <= s <= 1500),
            'start1500to1650': sum(1 for s in start if 1500 < s < 1650),
            'startAfter1650 (dropped)': sum(1 for s in start if s >= 1650),
            'withDissolution': sum(1 for r in rs if r['dis'] is not None),
            'englishLabel': sum(1 for r in rs if r['en']),
            'onlyLatinScriptOtherLanguage': latin_only,
            'noLatinScriptLabel (dropped by first pass)': no_latin,
            'foundingAndFirstMentionDisagreeBy100yPlus': sum(1 for a, b in both if abs(a - b) >= 100),
        }
        if k == 'castle':
            tc = Counter()
            for r in rs:
                for t in r['types']:
                    tc[t] += 1
            out['byKind'][k]['typeMix'] = dict(tc.most_common(15))
            # Later country houses and palaces filed under "castle".
            out['byKind'][k]['chateauOrPalaceTyped'] = sum(1 for r in rs if re.search(r'château|schloss|palace|manor|country house', ' '.join(r['types']).lower()))
            out['byKind'][k]['ruinOrSiteTyped'] = sum(1 for r in rs if re.search(r'ruin|deserted castle site|archaeological site', ' '.join(r['types']).lower()))
        if k == 'diocese':
            out['byKind'][k]['titularSees'] = sum(1 for r in rs if 'titular see' in ' '.join(r['types']).lower())
            out['byKind'][k]['presentDayDioceses (no dissolution)'] = sum(1 for r in rs if r['dis'] is None and 'titular' not in ' '.join(r['types']).lower())
        if k == 'settlement':
            tc = Counter(t for r in rs for t in r['types'])
            out['byKind'][k]['typeMix'] = dict(tc.most_common(12))
            out['byKind'][k]['administrativeUnitsTyped'] = sum(1 for r in rs if re.search(r'cadastral|municipal part|municipality|ortsteil|seat of the local council', ' '.join(r['types']).lower()))
    # Duplicates: the same place as several items (same normalised English label within 2 km).
    grid = defaultdict(list)
    for r in site:
        if r['en']:
            grid[(round(r['lon'] * 20), round(r['lat'] * 20))].append(r)
    dup = 0
    seen = set()
    for r in site:
        if not r['en'] or r['q'] in seen:
            continue
        k = (round(r['lon'] * 20), round(r['lat'] * 20))
        n = sites.norm(r['en'])
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for o in grid.get((k[0] + dx, k[1] + dy), []):
                    if o['q'] != r['q'] and o['q'] not in seen and sites.norm(o['en']) == n and sites.dist_km((r['lon'], r['lat']), (o['lon'], o['lat'])) <= 2:
                        dup += 1
                        seen.add(o['q'])
        seen.add(r['q'])
    out['sameNameWithin2kmPairs'] = dup
    # Country imbalance of dated settlements (by label country is not in the snapshot; use Buringh-like boxes via regions).
    return out


def buringh():
    towns = sites.buringh_records()
    n = len(towns)
    nature = Counter()
    zero_all = 0
    for t in towns:
        for y, v in t['nature'].items():
            nature[v] += 1
        if all(v == 0 for y, v in t['pop'].items() if y <= 1500):
            zero_all += 1
    per_country = Counter(t['country'] for t in towns)
    recs = sites.wd_records(['city', 'town', 'settlement'])
    ts = [dict(t) for t in towns]
    match = sites.match_english(ts, recs)
    # Coordinate agreement for towns confirmed by name: how far is Buringh's point from Wikidata's?
    byq = {r['q']: r for r in recs.values()}
    dists = []
    orig = {(t['city'], t['country']): (t['lon'], t['lat']) for t in towns}
    for t in ts:
        if t.get('q') and not t.get('fixed') and not t.get('moved'):
            o = orig.get((t['city'], t['country']))
            w = byq.get(t['q'])
            if o and w:
                dists.append(sites.dist_km(o, (w['lon'], w['lat'])))
    dists.sort()
    bands = Counter('<2 km' if d < 2 else '2–5 km' if d < 5 else '5–12 km' for d in dists)
    samples = sorted({y for t in towns for y in t['pop']})
    return {
        'towns': n, 'sampleYears': samples,
        'estimateNature (per town-year)': dict(nature),
        'townYears': sum(len(t['pop']) for t in towns),
        'townsWithZeroEstimateThrough1500': zero_all,
        'perCountry': dict(per_country.most_common()),
        'nameMatching': {k: (len(v) if isinstance(v, list) else v) for k, v in match.items()},
        'droppedTowns': match['droppedBadCoordinates'],
        'coordinateAgreementWithWikidata (name-confirmed, unmodified)': {'n': len(dists), 'median_km': round(dists[len(dists) // 2], 2) if dists else None, 'bands': dict(bands)},
    }


def main():
    out = {'wikidata': wikidata(), 'buringh': buringh()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1)[:6000])


if __name__ == '__main__':
    main()
