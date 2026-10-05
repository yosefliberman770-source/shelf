"""Measured coverage of the public place index: how many dated records Shelf actually holds per region and period.

The app's coverage panel and its "nothing here" notes are capped by these counts (src/world/coverage.ts): a region where
Shelf holds no dated record for a period is never described as covered, whatever a dataset's declared extent says.
Regions and periods are read from src/world/axes.ts so the two never drift apart.

  python3 scripts/atlas-build/coverage_index.py        writes src/world/coverage-measured.json
"""
from __future__ import annotations

import glob
import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
INDEX = os.path.join(ROOT, 'public', 'world', 'places', 'c')
OUT = os.path.join(ROOT, 'src', 'world', 'coverage-measured.json')


def axes():
    src = open(os.path.join(ROOT, 'src', 'world', 'axes.ts'), encoding='utf-8').read()
    regions = [(m.group(1), [float(x) for x in m.group(2).split(',')])
               for m in re.finditer(r"\{ id: '([\w-]+)', label: '[^']*', box: \[([-\d., ]+)\] \}", src)]
    periods = [(m.group(1), int(m.group(2)), int(m.group(3)))
               for m in re.finditer(r"\{ id: '([\w-]+)', label: '[^']*', from: (-?\d+), to: (-?\d+) \}", src)]
    return regions, periods


def region_of(lon, lat, regions):
    for rid, (w, s, e, n) in regions:
        if w <= lon <= e and s <= lat <= n:
            return rid
    return None


def spans(r):
    """The year spans a record gives evidence for: its dates, and its evidence period (extra.env)."""
    out = []
    a, b = r[7], r[8]
    if a is not None or b is not None:
        out.append((a if a is not None else b, b if b is not None else a))
    env = (r[13] or {}).get('env') if isinstance(r[13], dict) else None
    if env and (env[0] is not None or env[1] is not None):
        out.append((env[0] if env[0] is not None else env[1], env[1] if env[1] is not None else env[0]))
    return out


SETTLEMENT = {'settlement', 'urban', 'polis', 'vicus', 'fortified-settlement', 'townhouse-settlement', 'village', 'town', 'towns', 'capitals', 'villages', 'city', 'hamlet'}


def klass(types) -> str:
    """The coarse class a record counts under: a settlement, or another kind of site (monument, find, church…)."""
    return 'settlement' if set(types or []) & SETTLEMENT else 'site'


def measure(index=INDEX):
    """Coverage as data (AR-2): dated records per region × period, and the same split by source and by class."""
    regions, periods = axes()
    dated = defaultdict(lambda: defaultdict(int))
    undated = defaultdict(int)
    by_source = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    by_class = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for f in sorted(glob.glob(os.path.join(index, '*.json'))):
        for r in json.load(open(f, encoding='utf-8')):
            rid = region_of(r[3], r[4], regions)
            if not rid:
                continue
            ss = spans(r)
            if not ss:
                undated[rid] += 1
                continue
            for pid, lo, hi in periods:
                if any(a <= hi and b >= lo for a, b in ss):
                    dated[rid][pid] += 1
                    by_source[r[0]][rid][pid] += 1
                    by_class[klass(r[6])][rid][pid] += 1
    plain = lambda d: {k: {kk: dict(sorted(vv.items())) for kk, vv in sorted(v.items())} for k, v in sorted(d.items())}
    return {'about': 'Dated records in the public place index per region and period (scripts/atlas-build/coverage_index.py). '
                     'A record counts in every period its dates or evidence period touch. "sources" and "classes" split the '
                     'same counts by the dataset holding the record and by settlement / other site.',
            'regions': {rid: {'dated': dict(sorted(dated[rid].items())), 'undated': undated[rid]} for rid, _ in regions},
            'sources': plain(by_source), 'classes': plain(by_class)}


def write(index=INDEX, out=OUT):
    m = measure(index)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(m, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')
    return m


if __name__ == '__main__':
    m = write()
    for rid, v in m['regions'].items():
        print(f"{rid:22} undated {v['undated']:7}  " + '  '.join(f'{p}:{n}' for p, n in v['dated'].items()))
