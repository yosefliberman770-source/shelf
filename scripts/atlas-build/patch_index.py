"""Apply one dataset's corrected rows to the published place index without a full rebuild (Stage 2 fixes).

Each step re-reads one source with today's code and replaces only that dataset's records in public/world/places
(world.replace_source_rows), so other datasets are untouched. A full rebuild produces the same rows.

  python3 scripts/atlas-build/patch_index.py cassini     # A19-001: Latin-1 names decoded correctly
  python3 scripts/atlas-build/patch_index.py hurbpop     # A18-001: world cities no gazetteer holds become findable
  python3 scripts/atlas-build/patch_index.py words       # A23-001: places whose name is an English word (Wells, Newton…)
  python3 scripts/atlas-build/patch_index.py wdbce       # A8-009: Wikidata BCE founding dates one year late
  python3 scripts/atlas-build/patch_index.py future      # PA-009: period tables ending in the future ("modern" 1901–2050)
  python3 scripts/atlas-build/patch_index.py meaning     # C8/SS-5: a source with undocumented meaning claims no precision
  python3 scripts/atlas-build/patch_index.py halc        # PA-010: HALC "estimate within 1 km" is not a precise position
"""
from __future__ import annotations

import json
import math
import os
import sys

import world
from names import norm, shard

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
BASE = os.path.join(ROOT, 'public', 'world', 'places')
COMMON = {w.strip().lower() for w in open(os.path.join(ROOT, 'public', 'atlas', 'common-words.txt'), encoding='utf-8') if w.strip()}


def common(name):
    n = name.strip().lower()
    return n in COMMON or (n.startswith('the ') and n[4:].strip() in COMMON)


def current_rows(src):
    out = []
    for f in sorted(os.listdir(os.path.join(BASE, 'c'))):
        out += [r for r in json.load(open(os.path.join(BASE, 'c', f), encoding='utf-8')) if r[0] == src]
    return out


def rows_from(records, no_index=frozenset()):
    import sites
    rows, skipped = [], {}
    for x in records:
        row, why = sites.index_row(x, common, no_index)
        if row:
            rows.append(row)
        elif why:
            skipped[why] = skipped.get(why, 0) + 1
    return rows, skipped


def placed_nearby(name, lon, lat, km=10):
    """Does any record of another dataset with this name lie within km?"""
    k = norm(name)
    p = os.path.join(BASE, 'n', f'{shard(k)}.json')
    if not os.path.exists(p):
        return False
    for e in json.load(open(p, encoding='utf-8')):
        if e[0] != k or e[1] == 'hurbpop':
            continue
        for r in json.load(open(os.path.join(BASE, 'c', f'{e[3]}.json'), encoding='utf-8')):
            if r[0] == e[1] and str(r[1]) == str(e[2]):
                if math.hypot((r[3] - lon) * math.cos(math.radians(lat)), r[4] - lat) * 111 <= km:
                    return True
    return False


def cassini():
    import registers
    rows, skipped = rows_from(registers.cassini_places())
    before = current_rows('cassini')
    stats = world.replace_source_rows('cassini', rows, BASE)
    return {'before': len(before), 'garbledBefore': sum('�' in r[2] for r in before), 'after': stats['rows'],
            'garbledAfter': sum('�' in r[2] for r in rows), 'notIndexed': skipped}


def hurbpop():
    import generic
    spec = next(s for s in generic.specs(geometry=None) if s['src'] == 'hurbpop')
    recs, _ = generic.records(spec)
    rows, skipped = rows_from(recs, no_index={'hurbpop'})
    rows = world.merge_snapshot_rows(rows)
    kept = [r for r in rows if not placed_nearby(r[2], r[3], r[4])]
    stats = world.replace_source_rows('hurbpop', kept, BASE)
    return {'records': len(recs), 'dated': len(rows), 'alreadyPlacedByAnotherDataset': len(rows) - len(kept), 'added': stats['rows'], 'notIndexed': skipped}


def words():
    """Records left out only because their name is an ordinary English word, now indexed (unless the name is generic)."""
    import registers as REG
    out = {}
    for src, fn in (('canmore', REG.canmore), ('generalkarte', REG.generalkarte), ('swegeo', REG.sweden_geometric),
                    ('dissiloc', REG.dissiloc), ('wdextra', REG.wikidata_extra), ('rohgis', REG.rohgis_settlements)):
        res = fn()
        recs = res[0] if isinstance(res, tuple) else res
        new_rows, _ = rows_from([x for x in recs if common(x['name'])])
        have = current_rows(src)
        ids = {str(r[13].get('sid', r[1])) if isinstance(r[13], dict) else str(r[1]) for r in have}
        add = [r for r in new_rows if str(r[1]) not in ids]
        if add:
            world.replace_source_rows(src, have + add, BASE)
        out[src] = {'added': len(add), 'examples': sorted({r[2] for r in add})[:12]}
    return out


def wdbce():
    """Wikidata sites dated BCE: the snapshot's years were read without the query service's year 0 (-0217 as 217 BCE, not
    218 BCE). Each row's start and end are re-read from the snapshot with dates.wd_year; only Wikidata-dated ends change."""
    import sites
    recs = sites.wd_records(sites.KINDS + ['city', 'town'])
    have = current_rows('wikidata')
    changed, examples = 0, []
    for r in have:
        w = recs.get(str(r[1]))
        fb = (r[13] or {}).get('fb') if isinstance(r[13], dict) else None
        if not w or fb not in ('founded', 'first mention', 'recorded start (Wikidata inception)'):
            continue
        start = min((x for x in (w['inc'], w['fm']) if x is not None), default=None)
        end = w['dis']
        new = list(r)
        if r[7] is not None and r[7] <= 0 and start is not None and start == r[7] - 1:
            new[7] = start
        if r[8] is not None and r[8] <= 0 and end is not None and end == r[8] - 1:
            new[8] = end
        if new != r:
            changed += 1
            if len(examples) < 6:
                examples.append(f'{r[2]}: {r[7]} → {new[7]}')
            r[:] = new
    if changed:
        world.replace_source_rows('wikidata', have, BASE)
    return {'changed': changed, 'examples': examples}


def future():
    """Spans that end after this year (a period table's "modern" 1901–2050, "21st century" 2001–2100) end now, as the
    loader now does for every record (generic.ingestion_checks, dates.cap_future)."""
    from dates import THIS_YEAR
    out = {}
    for src in ('nmrw', 'canmore', 'frmines', 'ltkvr'):
        have = current_rows(src)
        n = 0
        for r in have:
            e = r[13] if isinstance(r[13], dict) else None
            if r[8] is not None and r[8] > THIS_YEAR:
                r[8] = THIS_YEAR
                n += 1
            if e and e.get('env') and e['env'][1] is not None and e['env'][1] > THIS_YEAR:
                e['env'] = [e['env'][0], THIS_YEAR, *e['env'][2:]]
                n += 1
        if n:
            world.replace_source_rows(src, have, BASE)
        out[src] = n
    return out


def meaning():
    """Records of a spec declared "meaning": "unknown" make no precision claim (precise 0, as the loader now writes them)."""
    import generic
    out = {}
    for spec in generic.specs(geometry=None):
        if spec.get('meaning') != 'unknown':
            continue
        have = current_rows(spec['src'])
        n = sum(1 for r in have if r[5] == 1)
        for r in have:
            r[5], r[9] = 0, max(r[9] or 0, 1)
        if n:
            world.replace_source_rows(spec['src'], have, BASE)
        out[spec['src']] = n
    return out


def halc():
    """HALC positions coded 1 (estimated within 1 km) or 9 (a point inside the area) are approximate, with the code's
    meaning on the record, as the loader now reads them."""
    import generic
    spec = json.load(open(os.path.join(ROOT, 'data', 'historical', 'specs', 'halc.json'), encoding='utf-8'))
    ap = spec['fields']['approx']
    code = {str(p.get('SHORT_ID')): str(p.get(ap['field'])) for p in generic.read_rows(spec)}
    have = current_rows('halc')
    n = 0
    for r in have:
        c = code.get(str(r[1]))
        if c in ap['values']:
            n += r[5] == 1
            r[5], r[9] = 0, max(r[9] or 0, 1)
            if c in ap['note']:
                r[13] = {**(r[13] or {}), 'pq': ap['note'][c]}
    world.replace_source_rows('halc', have, BASE)
    return {'approximate now': n, 'rows': len(have)}


def stamp(what: str):
    """The published data changed: its build date moves to today, so the app drops answers worked out from the old data
    (bookWorld's data version, the offline data cache) instead of replaying them, and the manifest lists the patch."""
    import datetime
    path = os.path.join(HERE, '..', '..', 'public', 'world', 'manifest.json')
    m = json.load(open(path, encoding='utf-8'))
    today = datetime.date.today().isoformat()
    m['built'] = today
    m['patches'] = sorted(set(m.get('patches', [])) | {f'{today} {what}'})
    import world
    world.write_json(path, m)


if __name__ == '__main__':
    steps = {'halc': halc, 'meaning': meaning, 'cassini': cassini, 'hurbpop': hurbpop, 'words': words, 'wdbce': wdbce, 'future': future}
    for step in sys.argv[1:] or steps:
        print(step, json.dumps(steps[step](), ensure_ascii=False))
        stamp(f'place index: {step}')
