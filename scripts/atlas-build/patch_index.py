"""Apply one dataset's corrected rows to the published place index without a full rebuild (Stage 2 fixes).

Each step re-reads one source with today's code and replaces only that dataset's records in public/world/places
(world.replace_source_rows), so other datasets are untouched. A full rebuild produces the same rows.

  python3 scripts/atlas-build/patch_index.py cassini     # A19-001: Latin-1 names decoded correctly
  python3 scripts/atlas-build/patch_index.py hurbpop     # A18-001: world cities no gazetteer holds become findable
  python3 scripts/atlas-build/patch_index.py words       # A23-001: places whose name is an English word (Wells, Newton…)
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


if __name__ == '__main__':
    steps = {'cassini': cassini, 'hurbpop': hurbpop, 'words': words}
    for step in sys.argv[1:] or steps:
        print(step, json.dumps(steps[step](), ensure_ascii=False))
