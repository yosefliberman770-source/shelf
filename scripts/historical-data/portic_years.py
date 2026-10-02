#!/usr/bin/env python3
"""Portic (Navigocorpus) ports with the years each one is actually named in a dated ship call.

  python3 scripts/historical-data/portic_years.py
    reads  data/historical/raw/portic-ports/original/{ports.json, pointcalls.json}   (API snapshots, unchanged)
    writes data/historical/raw/portic-ports/derived/ports-attested.csv               (one row per port: its call years)

A call date like "1787=01=08" (certain) or "1785>03>12!" (Navigocorpus' uncertain/approximate forms) gives its year; ports
never named in a dated call get no row — the gazetteer's own 1749–1815 state attribution is not used as a date.
"""
import csv
import json
import os
import re
from collections import defaultdict

D = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'portic-ports')
ports = {p['uhgs_id']: p for p in json.load(open(os.path.join(D, 'original', 'ports.json'), encoding='utf-8'))}
years, sources = defaultdict(set), defaultdict(set)
for c in json.load(open(os.path.join(D, 'original', 'pointcalls.json'), encoding='utf-8')):
    for k in ('pointcall_out_date', 'pointcall_in_date'):
        m = re.match(r'(\d{4})', str(c.get(k) or ''))
        if m and c.get('pointcall_uhgs_id') in ports:
            years[c['pointcall_uhgs_id']].add(int(m.group(1)))
            sources[c['pointcall_uhgs_id']].add(str(c.get('source_suite') or '')[:40])
os.makedirs(os.path.join(D, 'derived'), exist_ok=True)
with open(os.path.join(D, 'derived', 'ports-attested.csv'), 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh)
    w.writerow(['uhgs_id', 'name', 'toponym', 'lon', 'lat', 'state_1789', 'years', 'sources'])
    for pid, ys in sorted(years.items()):
        p = ports[pid]
        w.writerow([pid, p.get('toponyme_standard_en') or p.get('toponym'), p.get('toponym'), p.get('x'), p.get('y'), p.get('state_1789_en') or '',
                    ';'.join(map(str, sorted(ys))), ';'.join(sorted(s for s in sources[pid] if s))])
print('ports with dated calls', len(years), 'of', len(ports))
