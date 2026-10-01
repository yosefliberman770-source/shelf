#!/usr/bin/env python3
"""Per-region research questions, answered from the discovery universe — so no region is "solved" because one good
dataset was found.

  python3 scripts/historical-data/discover/region_questions.py
    → data/historical/discovery/region-questions.json   region → question → counts by state + the top not-yet-investigated leads
    → data/historical/discovery/queue.jsonl.gz          the not-yet-investigated queue (catalogue-only candidates), by priority

Questions (per coverage region): archaeology, historical maps, gazetteers/place names, churches & monasteries, roads &
waterways, castles & fortifications, settlements & towns, population & tax, cadastre & land, earlier centuries (before
1000), later centuries (after 1500), economy, maritime, political boundaries, institutions holding more (repositories).
A question's answer is the candidates whose metadata names the region and the theme; states show how far each got.
"""
import gzip
import json
import os
import re
from collections import Counter, defaultdict

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..', '..')
DISC = os.path.join(ROOT, 'data', 'historical', 'discovery')

QUESTIONS = {
    'archaeology': ('Archaeology',), 'historical maps': None, 'gazetteers & place names': ('Names',),
    'churches & monasteries': ('Religious',), 'roads & waterways': ('Transport',), 'castles & fortifications': ('Military',),
    'settlements & towns': ('Settlements',), 'population & tax': ('Population',), 'cadastre & land': None, 'economy': ('Economic',),
    'maritime': ('Maritime',), 'political boundaries': ('Political',), 'earlier centuries (<1000)': None, 'later centuries (>1500)': None,
    'institutions & repositories': None,
}
MAP_CH = {'loc-maps', 'europeana-maps', 'rumsey-maps', 'ogm', 'harvard-geodata'}
CADASTRE = re.compile(r'cadast|kataster|katastr|catasto|land survey|urbar|terrier|land register|kataszt|tithe map|estate map', re.I)
INVESTIGATED = {'metadata-inspected', 'data-inspected', 'promising', 'high-priority', 'insufficient-temporal', 'insufficient-spatial',
                'acquisition-attempted', 'acquired', 'validated', 'integrated', 'rejected', 'blocked', 'duplicate'}


def answers(c):
    cats = set(c.get('categories') or [])
    per = c.get('periods') or []
    out = [q for q, cs in QUESTIONS.items() if cs and cats & set(cs)]
    if c['channel'] in MAP_CH or re.search(r'\bmaps?\b|karte|carte|mappa|térkép', c['title'].lower()):
        out.append('historical maps')
    if CADASTRE.search(c['title'] + ' ' + c.get('description', '')[:300]):
        out.append('cadastre & land')
    if any(p < 1000 for p in per):
        out.append('earlier centuries (<1000)')
    if any(p >= 1500 for p in per):
        out.append('later centuries (>1500)')
    if c['channel'] == 're3data' or c.get('type') == 'repository':
        out.append('institutions & repositories')
    return out


def main():
    import sys
    sys.path.insert(0, HERE)
    from investigate import REGION_MAP, need_index, need_of
    need = need_index()
    grid = defaultdict(lambda: defaultdict(Counter))
    leads = defaultdict(lambda: defaultdict(list))
    queue = []
    for line in gzip.open(os.path.join(DISC, 'inventory.jsonl.gz'), 'rt', encoding='utf-8'):
        c = json.loads(line)
        if c['state'] == 'irrelevant':
            continue
        regs = sorted({r for g in c.get('regions') or [] for r in REGION_MAP.get(g, [])})
        qs = answers(c)
        pr = round(c.get('relevance', 0) / 100 + 2 * need_of(c, need), 3)
        if c['state'] == 'catalogue-only':
            queue.append((pr, c['id'], c['channel'], c['title'][:150], c.get('doi') or c.get('url'), regs[:4], c.get('categories', [])[:4]))
        for r in regs:
            for q in qs:
                grid[r][q][c['state']] += 1
                if c['state'] == 'catalogue-only':
                    leads[r][q].append((pr, c['title'][:100], c.get('doi') or c.get('url')))
    out = {}
    for r in sorted(grid):
        out[r] = {}
        for q in QUESTIONS:
            st = grid[r].get(q, Counter())
            total = sum(st.values())
            out[r][q] = {'candidates': total, 'investigated': sum(v for k, v in st.items() if k in INVESTIGATED),
                         'promising': st.get('promising', 0) + st.get('high-priority', 0), 'integrated': st.get('integrated', 0),
                         'awaiting': st.get('catalogue-only', 0),
                         'topLeads': [{'title': t, 'link': u} for _, t, u in sorted(leads[r].get(q, []), reverse=True)[:3]]}
    json.dump(out, open(os.path.join(DISC, 'region-questions.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    queue.sort(reverse=True)
    with gzip.open(os.path.join(DISC, 'queue.jsonl.gz'), 'wt', encoding='utf-8') as fh:
        for x in queue:
            fh.write(json.dumps({'priority': x[0], 'id': x[1], 'channel': x[2], 'title': x[3], 'link': x[4], 'regions': x[5], 'categories': x[6]}, ensure_ascii=False) + '\n')
    empty = [(r, q) for r in out for q in QUESTIONS if out[r][q]['candidates'] == 0]
    print('regions', len(out), 'queue', len(queue), 'questions with no candidate at all', len(empty))
    print(empty[:40])


if __name__ == '__main__':
    main()
