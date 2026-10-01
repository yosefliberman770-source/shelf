#!/usr/bin/env python3
"""Discovery chains: from each strong dataset, follow what it is connected to, and add what that turns up to the universe.

  python3 scripts/historical-data/discover/chains.py [--depth 2]
    → scripts/atlas-build/.cache/universe/chains.jsonl.gz   (records with 'via': how they were reached)
    → data/historical/discovery/chains.json                 the graph: seed → edges (kind, target, found)

Seeds: datasets integrated or acquired (decisions.json), and candidates the investigation found promising or high priority.
Edges followed for each seed (DataCite, Zenodo):
  related     its related identifiers (IsPartOf, HasPart, IsSupplementTo, IsDerivedFrom, References, IsNewVersionOf, IsSourceOf…)
  citedBy     DataCite events: records citing / referencing it
  creators    other datasets by the same people
  publisher   other historical/archaeological/geographic datasets of the same institution
  community   other records in its Zenodo communities
Every new record keeps the path that reached it, so the branching is auditable.
"""
import gzip
import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from universe import Sink, datacite, get, txt, zenodo  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
DISC = os.path.join(ROOT, 'data', 'historical', 'discovery')
TOPIC = '(histor* OR archaeolog* OR mediev* OR roman OR gazetteer OR "place names" OR castle* OR monaster* OR settlement* OR map*)'
q = urllib.parse.quote


def dc_record(doi):
    d = get(f'https://api.datacite.org/dois/{q(doi)}')
    return ((d or {}).get('data') or {}).get('attributes')


def as_rec(a, via):
    pub = a.get('publisher')
    return {'doi': a.get('doi'), 'url': a.get('url'), 'title': txt((a.get('titles') or [{}])[0].get('title'), 300),
            'desc': txt([x.get('description') for x in a.get('descriptions') or []][:2]), 'year': a.get('publicationYear'),
            'inst': pub if isinstance(pub, str) else (pub or {}).get('name'), 'creators': [x.get('name') for x in a.get('creators') or []][:5],
            'kw': [x.get('subject') for x in a.get('subjects') or [] if x.get('subject')][:15], 'fmts': (a.get('formats') or [])[:10],
            'type': (a.get('types') or {}).get('resourceTypeGeneral'), 'rel': [f"{r.get('relationType')}:{r.get('relatedIdentifier')}" for r in a.get('relatedIdentifiers') or []][:15],
            'via': via}


def seeds():
    out = []
    for d in json.load(open(os.path.join(DISC, 'decisions.json'), encoding='utf-8'))['decisions']:
        if d.get('state') in ('integrated', 'acquired', 'promising'):
            for m in d.get('match') or []:
                if m.startswith('10.'):
                    out.append((m, d['title']))
    ip = os.path.join(DISC, 'investigations.jsonl.gz')
    if os.path.exists(ip):
        try:
            for line in gzip.open(ip, 'rt', encoding='utf-8'):
                r = json.loads(line)
                if r['state'] in ('promising', 'high-priority') and r.get('doi'):
                    out.append((r['doi'], r['title']))
        except (EOFError, ValueError):
            pass  # the file is still being written: what was read so far is used
    seen, uniq = set(), []
    for d, t in out:
        if d.lower() not in seen:
            seen.add(d.lower())
            uniq.append((d, t))
    return uniq


def main():
    depth = int(sys.argv[sys.argv.index('--depth') + 1]) if '--depth' in sys.argv else 2
    sink = Sink('chains')
    graph_path = os.path.join(DISC, 'chains.json')
    graph = json.load(open(graph_path, encoding='utf-8')) if os.path.exists(graph_path) else {}
    frontier = seeds()
    print('seeds', len(frontier), flush=True)
    visited = set(graph)
    for level in range(depth):
        nxt = []
        for doi, title in frontier:
            if doi.lower() in visited or sink.is_done(doi):
                continue
            visited.add(doi.lower())
            a = dc_record(doi) or {}
            edges, recs = [], []
            # related identifiers
            for r in a.get('relatedIdentifiers') or []:
                rid, kind = r.get('relatedIdentifier') or '', r.get('relationType')
                if r.get('relatedIdentifierType') == 'DOI' and rid:
                    ra = dc_record(rid)
                    if ra:
                        recs.append(as_rec(ra, {'seed': doi, 'edge': f'related:{kind}', 'level': level}))
                        edges.append(['related', kind, rid])
                    time.sleep(0.15)
            # records citing / referencing it (DataCite event data)
            ev = get(f'https://api.datacite.org/events?doi={q(doi)}&page[size]=100') or {}
            for e in ev.get('data') or []:
                at = e.get('attributes') or {}
                if at.get('relation-type-id') in ('references', 'cites', 'is-supplement-to', 'is-derived-from', 'is-part-of') and at.get('subj-id'):
                    sid = re.sub(r'^https?://doi\.org/', '', at['subj-id'])
                    if sid.lower() != doi.lower():
                        ra = dc_record(sid)
                        if ra:
                            recs.append(as_rec(ra, {'seed': doi, 'edge': f"citedBy:{at.get('relation-type-id')}", 'level': level}))
                            edges.append(['citedBy', at.get('relation-type-id'), sid])
            # same creators (personal names only, not institutional authors)
            for cr in (a.get('creators') or [])[:4]:
                nm = cr.get('name') or ''
                if cr.get('nameType') == 'Personal' or ',' in nm:
                    rs = datacite(f'creators.name:"{nm}"', pages=1) or []
                    for r in rs:
                        r['via'] = {'seed': doi, 'edge': 'creator', 'name': nm, 'level': level}
                    recs += rs
                    edges.append(['creator', nm, len(rs)])
            # same institution, topical subset
            pub = a.get('publisher')
            pub = pub if isinstance(pub, str) else (pub or {}).get('name')
            if pub and not re.search(r'zenodo|figshare|dryad|harvard dataverse|pangaea|mendeley|osf', pub, re.I):
                rs = datacite(f'publisher:"{pub}" AND {TOPIC}', pages=2) or []
                for r in rs:
                    r['via'] = {'seed': doi, 'edge': 'publisher', 'name': pub, 'level': level}
                recs += rs
                edges.append(['publisher', pub, len(rs)])
            # Zenodo communities
            m = re.search(r'zenodo\.(\d+)', doi)
            if m:
                z = get(f'https://zenodo.org/api/records/{m.group(1)}') or {}
                for com in ((z.get('parent') or {}).get('communities') or {}).get('entries') or []:
                    slug = com.get('slug') or com.get('id')
                    if slug and slug not in ('zenodo', 'eu'):
                        rs = zenodo(f'communities:{slug}') or []
                        for r in rs:
                            r['via'] = {'seed': doi, 'edge': 'community', 'name': slug, 'level': level}
                        recs += rs
                        edges.append(['community', slug, len(rs)])
                time.sleep(1.1)
            for r in recs:
                r['q'] = f'chain:{doi}'
            sink.write(recs, doi)
            graph[doi.lower()] = {'title': title[:120], 'level': level, 'edges': edges, 'found': len(recs)}
            for r in recs:
                if r.get('doi') and r['doi'].lower() not in visited and r.get('via', {}).get('edge', '').startswith(('related', 'citedBy')):
                    nxt.append((r['doi'], r.get('title') or ''))
            print(level, doi, len(recs), flush=True)
            json.dump(graph, open(graph_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        frontier = nxt
    sink.close()
    print('chains done; seeds visited', len(graph), 'records', sink.n, flush=True)


if __name__ == '__main__':
    main()
