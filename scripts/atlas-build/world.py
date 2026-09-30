"""
Build the Historical World data system: modular, queryable packs that the
app loads piece by piece — never the whole world at once.

  public/world/places/c/{cx}_{cy}.json   places in one 2°×2° cell (all sources, each row keeps its source)
  public/world/places/n/{shard}.json     name index: normalised name → source, id, cell
  public/world/places/i/{src}-{k}.json   id → cell, for direct lookups
  public/world/tiles/*.pmtiles           vector tiles for map layers, with level of detail
  public/world/manifest.json             what was built, from which source release, when

Sources: Pleiades (CC BY 3.0), Viabundus 2 (CC BY 4.0), al-Ṯurayyā (Apache-2.0,
after Cornu), Itiner-e (CC BY 4.0). Every row and tile feature keeps its
source's own identifier, dates and certainty.
"""
from __future__ import annotations

import csv
import html
import json
import io
import zipfile
import math
import os
import re
import shutil
import unicodedata
import zlib
from collections import defaultdict
from datetime import date

import tiler

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
PUBLIC = os.path.join(HERE, '..', '..', 'public')
OUT = os.path.join(PUBLIC, 'world')
CELL = 2.0


def log(*a):
    print(*a, flush=True)


def norm(s: str) -> str:
    """Must match normName() in src/atlas/gazetteer.ts."""
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.category(c).startswith('M')).lower()
    s = re.sub(r'^the\s+', '', s)
    s = s.replace('’', "'")
    return re.sub(r'\s+', ' ', s).strip()


def shard(n: str) -> str:
    """Must match nameShard() in src/world/places.ts."""
    out = ''
    for ch in list(n)[:2]:
        out += ch if re.match(r'[a-z0-9]', ch) else 'x%x' % (ord(ch) % 16)
    return out or '_'


def cell_of(lon, lat):
    return f'{int(math.floor((lon + 180) / CELL))}_{int(math.floor((lat + 90) / CELL))}'


def num(v):
    try:
        return int(float(v)) if v not in (None, '', 'null') else None
    except ValueError:
        return None


def txt(v):
    return None if v in (None, '', 'null') else html.unescape(v)


# ── Sources → rows [src, id, title, lon, lat, precise, types, from, to, unc, names, partOf, related, extra] ──

def pleiades_rows():
    path = os.path.join(CACHE, 'pleiades-gazetteer.json')
    d = json.load(open(path, encoding='utf-8'))
    titles = d.get('titles', {})
    byid = {str(r[0]): r[1] for r in d['rows']}
    # Relationships in both directions (the app never holds the whole dataset, so reverse links are precomputed).
    reverse = defaultdict(list)
    for r in d['rows']:
        for x, t in (r[11] if len(r) > 11 else []):
            reverse[str(x)].append([r[0], t, r[1], 1])
    out = []
    for r in d['rows']:
        pid, title, lon, lat, precise, types, a, b, unc, names, parts = r[:11]
        rel = [[x, t, byid.get(str(x)) or titles.get(str(x)), 0] for x, t in (r[11] if len(r) > 11 else []) if byid.get(str(x)) or titles.get(str(x))]
        env = r[12] if len(r) > 12 and r[12] else None
        out.append(['pleiades', pid, title, lon, lat, precise, types, a, b, unc, names,
                    [byid.get(str(x)) or titles.get(str(x)) for x in parts if byid.get(str(x)) or titles.get(str(x))],
                    (rel + reverse.get(str(pid), []))[:16], {'env': env} if env else None])
    return out


ROLES = [('Settlement', 'settlement'), ('Town', 'town'), ('Fair', 'fair'), ('Toll', 'toll'), ('Bridge', 'bridge'), ('Staple', 'staple'),
         ('Ferry', 'ferry'), ('Harbour', 'harbour'), ('Lock', 'lock')]


def viabundus_rows():
    nodes = list(csv.DictReader(open(os.path.join(CACHE, 'viabundus_nodes.csv'), encoding='utf-8')))
    alt = defaultdict(list)
    for a in csv.DictReader(open(os.path.join(CACHE, 'viabundus_alternativenames.csv'), encoding='utf-8')):
        n = txt(a['name'])
        if n:
            alt[a['nodesid']].append([n, num(a['year1']), num(a['year2']), (txt(a['language']) or '')[:8]])
    out = []
    for r in nodes:
        lat, lon = num(r['latitude']) is not None and float(r['latitude']), num(r['longitude']) is not None and float(r['longitude'])
        if lat is False or lon is False or not txt(r['name']):
            continue
        roles = []
        for key, role in ROLES:
            if r.get(f'Is_{key}') == 'y':
                roles.append([role, num(r.get(f'{key}_From')), num(r.get(f'{key}_To'))])
        if not roles:
            continue
        froms = [x[1] for x in roles if x[1] is not None]
        open_end = any(x[2] is None for x in roles)
        tos = [x[2] for x in roles if x[2] is not None]
        out.append(['viabundus', int(r['id']), txt(r['name']), round(lon, 5), round(lat, 5), 1, ','.join(x[0] for x in roles),
                    min(froms) if froms else None, None if open_end or not tos else max(tos), 0,
                    [n for n in alt.get(r['id'], []) if n[0] != txt(r['name'])][:10], [], [],
                    # Undated nodes: Viabundus records them as valid for its core period (1350–1650) — the dataset's own semantics.
                    {'roles': roles, 'z': num(r['zoomlevel']), **({'env': [1350, 1650, 'dataset']} if not froms and not tos else {})}])
    return out


def thurayya_rows():
    d = json.load(open(os.path.join(CACHE, 'thurayya_places.geojson'), encoding='utf-8'))
    out = []
    for f in d['features']:
        c = f['properties']['cornuData']
        try:
            lon, lat = float(c['coord_lon']), float(c['coord_lat'])
        except (TypeError, ValueError):
            continue
        title = c.get('toponym_translit') or c.get('toponym_search')
        names = []
        for k, lang in (('toponym_arabic', 'ara'), ('toponym_arabic_other', 'ara'), ('toponym_search', ''), ('toponym_translit_other', '')):
            v = (c.get(k) or '').strip()
            if v and v != title and v not in [n[0] for n in names]:
                names.append([v, None, None, lang])
        out.append(['althurayya', c['cornu_URI'], title, round(lon, 5), round(lat, 5), 1 if c.get('coord_certainty') == 'certain' else 0,
                    c.get('top_type_hom') or '', None, None, 0 if c.get('coord_certainty') == 'certain' else 1, names,
                    [c['region_spelled']] if c.get('region_spelled') else [], [], {'period': [800, 1000]}])
    return out


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))


def places_index(rows):
    cells = defaultdict(list)
    names = defaultdict(list)
    ids = defaultdict(dict)
    for r in rows:
        src, pid, title, lon, lat = r[:5]
        c = cell_of(lon, lat)
        cells[c].append(r)
        k = (zlib.crc32(str(pid).encode()) % 16)
        ids[f'{src}-{k}'][str(pid)] = c
        seen = set()
        for i, n in enumerate([title] + [x[0] for x in r[10]]):
            nn = norm(n)
            if len(nn) < 2 or nn in seen:
                continue
            seen.add(nn)
            names[shard(nn)].append([nn, src, pid, c, 1 if i == 0 else 0])
    base = os.path.join(OUT, 'places')
    if os.path.exists(base):
        shutil.rmtree(base)
    for c, rs in cells.items():
        write_json(os.path.join(base, 'c', f'{c}.json'), rs)
    for s, es in names.items():
        write_json(os.path.join(base, 'n', f'{s}.json'), sorted(es))
    for k, m in ids.items():
        write_json(os.path.join(base, 'i', f'{k}.json'), m)
    return {'cells': len(cells), 'nameShards': len(names), 'rows': len(rows)}


# ── Vector tiles ──

def pleiades_importance():
    """Map prominence class (1–4) for each Pleiades place, from recorded evidence.

    Pleiades records no population, and "well documented" is not the same as
    "important", so documentation is only a small, capped part. The signals:
      role       — recorded as the capital of something; other places recorded
                   as administratively part of it
      type       — urban / polis, fortified settlement, settlement, station,
                   villa or farm (Pleiades' own place types)
      port       — port or harbour type, or recorded as the port of a place
      roads      — Itiner-e road segments that end at the place (a road hub;
                   main roads count more)
      sites      — sites recorded at / in / part of it (temples, theatres, walls)
      documents  — attested names (at most +1)
    Returns {pid: (class, [reasons])}. Used only to decide what to draw and name
    first when zoomed out — never shown as a size or rank claim.
    """
    z = zipfile.ZipFile(os.path.join(CACHE, 'pleiades_gis.zip'))

    def rows(name):
        member = next(n for n in z.namelist() if n.endswith('/' + name))
        return csv.DictReader(io.TextIOWrapper(z.open(member), encoding='utf-8-sig'))

    types = defaultdict(set)
    for r in rows('places_place_types.csv'):
        types[r['place_id']].add(r['place_type'])
    places = {r['id']: r for r in rows('places.csv')}
    capital, admin_children, sites, port_of = set(), defaultdict(int), defaultdict(int), set()
    for r in rows('connections.csv'):
        ct = r['connection_type']
        src, dst = r['place_id'], (r['connects_to'] or '').rstrip('/').rsplit('/', 1)[-1]
        if ct == 'capital':
            capital.add(src)
        elif ct == 'part_of_admin':
            admin_children[dst] += 1
        elif ct in ('at', 'in', 'part_of_physical'):
            sites[dst] += 1
        elif ct == 'port_of':
            port_of.add(src)
    names = defaultdict(int)
    for r in rows('names.csv'):
        names[r['place_id']] += 1
    # Road hubs: Itiner-e segment ends within ~2 km of the place.
    ends = defaultdict(list)
    for line in open(os.path.join(CACHE, 'itinere.ndjson'), encoding='utf-8'):
        f = json.loads(line)
        g = f.get('geometry') or {}
        cs = g.get('coordinates') or []
        parts = cs if g.get('type') == 'MultiLineString' else [cs]
        w = 1.0 if (f.get('properties') or {}).get('type') == 'Main Road' else 0.5
        for part in parts:
            if len(part) < 2:
                continue
            for lon, lat in (part[0][:2], part[-1][:2]):
                ends[(round(lon * 50), round(lat * 50))].append((lon, lat, w))

    def hub(lon, lat):
        k = (round(lon * 50), round(lat * 50))
        tot = 0.0
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for x, y, w in ends.get((k[0] + dx, k[1] + dy), []):
                    if abs(x - lon) < 0.025 and abs(y - lat) < 0.02:
                        tot += w
        return tot / 2  # a road through the place ends two segments there

    out = {}
    for pid, p in places.items():
        if not p['representative_latitude']:
            continue
        t = types.get(pid, set())
        score, why = 0.0, []
        if pid in capital:
            score += 4; why.append('capital')
        if admin_children[pid]:
            score += 2 + (1 if admin_children[pid] >= 3 else 0); why.append('administrative centre')
        if t & {'urban', 'polis'}:
            score += 3; why.append('urban')
        elif 'fortified-settlement' in t:
            score += 1.5; why.append('fortified settlement')
        elif 'settlement' in t:
            score += 1
        elif t & {'vicus', 'station'}:
            score += 0.5
        if t & {'villa', 'farm'} and not t & {'urban', 'polis', 'settlement'}:
            score -= 0.5
        if t & {'port', 'harbor'} or pid in port_of:
            score += 1; why.append('port')
        h = hub(float(p['representative_longitude']), float(p['representative_latitude']))
        if h >= 1:
            score += min(3, h * 0.75); why.append('road hub' if h >= 2 else 'on a road')
        if sites[pid]:
            score += min(2, sites[pid] * 0.4); why.append('sites recorded there')
        score += min(1, names[pid] * 0.15)
        cls = 4 if score >= 7 else 3 if score >= 4.5 else 2 if score >= 2.5 else 1
        out[int(pid)] = (cls, why)
    return out


def tiles_pleiades():
    d = json.load(open(os.path.join(CACHE, 'pleiades-places.json'), encoding='utf-8'))
    imp = pleiades_importance()
    feats = []
    for f in d['features']:
        p = dict(f['properties'])
        ty = p.get('ty', '')
        if 'a' in p:
            p['a'] = p['a'][:120]
        cls, why = imp.get(p.get('i'), (1, []))
        p['im'] = cls
        if why:
            p['iw'] = ','.join(why)
        # Level of detail: only precise, prominent places when zoomed out; the rest as you zoom in.
        precise = p.get('p') == 1
        mz = {4: 3, 3: 5, 2: 7, 1: 8}[cls] if precise else max(7, {4: 5, 3: 6, 2: 8, 1: 9}[cls])
        feats.append((f['geometry'], p, mz))
    return tiler.build(os.path.join(OUT, 'tiles', 'pleiades.pmtiles'), 'places', feats, 10, 'Pleiades places', 'Pleiades (CC BY 3.0)')


def tiles_itinere():
    feats = []
    for line in open(os.path.join(CACHE, 'itinere.ndjson'), encoding='utf-8'):
        line = line.strip()
        if not line:
            continue
        f = json.loads(line)
        p = f['properties']
        props = {'i': f.get('id'), 'n': (p.get('name') or '')[:80], 'k': p.get('type') or '', 'c': p.get('segmentCertainty') or ''}
        for k_in, k_out in (('lowerDate', 'f'), ('upperDate', 't'), ('lowerDateError', 'fe'), ('upperDateError', 'te')):
            if p.get(k_in) is not None:
                props[k_out] = int(p[k_in])
        if p.get('constructionPeriod'):
            props['cp'] = p['constructionPeriod'][:60]
        if p.get('author'):
            props['au'] = p['author'][:80]
        if p.get('bibliography'):
            props['b'] = p['bibliography'][:160]
        mz = 3 if props['k'] == 'Main Road' else 5
        feats.append((f['geometry'], props, mz))
    return tiler.build(os.path.join(OUT, 'tiles', 'itinere.pmtiles'), 'roads', feats, 10, 'Itiner-e roads', 'Itiner-e (Brughmans et al. 2024), CC BY 4.0')


def tiles_viabundus():
    d = json.load(open(os.path.join(CACHE, 'viabundus_Viabundus-2-edges.geojson'), encoding='utf-8'))
    zmap = {1: 4, 2: 6, 3: 7, 4: 8}
    feats = []
    for f in d['features']:
        p = f['properties']
        props = {'i': p['id'], 'k': p['type'], 'c': p['certainty']}
        if p.get('fromyear'):
            props['f'] = int(p['fromyear'])
        if p.get('toyear'):
            props['t'] = int(p['toyear'])
        feats.append((f['geometry'], props, zmap.get(p.get('zoomlevel'), 8)))
    e = tiler.build(os.path.join(OUT, 'tiles', 'viabundus-edges.pmtiles'), 'edges', feats, 11, 'Viabundus roads and waterways', 'Viabundus 2 (CC BY 4.0)')
    rows = viabundus_rows()
    nodes = []
    for r in rows:
        extra = r[13]
        props = {'i': r[1], 'n': r[2][:60], 'l': r[6]}
        if r[7] is not None:
            props['f'] = r[7]
        if r[8] is not None:
            props['t'] = r[8]
        town = next((x for x in extra['roles'] if x[0] == 'town'), None)
        if town and town[1] is not None:
            props['tf'] = town[1]
        mz = max(3, (extra.get('z') or 11) - 4)
        nodes.append(({'type': 'Point', 'coordinates': [r[3], r[4]]}, props, mz))
    n = tiler.build(os.path.join(OUT, 'tiles', 'viabundus-nodes.pmtiles'), 'nodes', nodes, 11, 'Viabundus places', 'Viabundus 2 (CC BY 4.0)')
    return {'edgeTiles': e, 'nodeTiles': n}


def tiles_thurayya():
    rows = thurayya_rows()
    rank = {'capitals': 3, 'regions': 4, 'towns': 5}
    pts = [({'type': 'Point', 'coordinates': [r[3], r[4]]}, {'i': r[1], 'n': r[2], 'k': r[6], 'rg': (r[11] or [''])[0][:40]}, rank.get(r[6], 7)) for r in rows]
    p = tiler.build(os.path.join(OUT, 'tiles', 'thurayya-places.pmtiles'), 'places', pts, 10, 'al-Thurayya places', 'al-Ṯurayyā Gazetteer (Romanov & Seydi), after G. Cornu')
    d = json.load(open(os.path.join(CACHE, 'thurayya_routes.json'), encoding='utf-8'))
    lines = [(f['geometry'], {'i': f['properties'].get('id', ''), 'm': int(f['properties'].get('Meter') or 0)}, 4) for f in d['features'] if f.get('geometry')]
    r = tiler.build(os.path.join(OUT, 'tiles', 'thurayya-routes.pmtiles'), 'routes', lines, 10, 'al-Thurayya routes', 'al-Ṯurayyā Gazetteer (Romanov & Seydi), after G. Cornu')
    return {'placeTiles': p, 'routeTiles': r}


def build_world(only=None):
    log('World: place index')
    if only == {'places'}:
        rows = pleiades_rows() + viabundus_rows() + thurayya_rows()
        return places_index(rows)
    rows = pleiades_rows() + viabundus_rows() + thurayya_rows()
    stats = {'places': places_index(rows), 'bySource': {s: sum(1 for r in rows if r[0] == s) for s in ('pleiades', 'viabundus', 'althurayya')}}
    log('  ', stats)
    os.makedirs(os.path.join(OUT, 'tiles'), exist_ok=True)
    for name, fn in (('pleiades', tiles_pleiades), ('itinere', tiles_itinere), ('viabundus', tiles_viabundus), ('thurayya', tiles_thurayya)):
        if only and name not in only:
            continue
        log('World: tiles', name)
        stats[f'tiles-{name}'] = fn()
        log('  ', stats[f'tiles-{name}'])
    if not only or 'england' in only:
        # Medieval England & Wales layers, read from data/historical/raw (see england.py).
        import england
        stats['england'] = england.build()
    stats['built'] = date.today().isoformat()
    stats['sources'] = {
        'pleiades': 'Pleiades daily GIS export (CC BY 3.0)',
        'viabundus': 'Viabundus 2, Zenodo 10.5281/zenodo.16611998 (CC BY 4.0)',
        'althurayya': 'al-Ṯurayyā Gazetteer v1.0, github.com/althurayya (Apache-2.0; after G. Cornu)',
        'itinere': 'Itiner-e route segments download (CC BY 4.0), Zenodo 10.5281/zenodo.17122148',
    }
    write_json(os.path.join(OUT, 'manifest.json'), stats)
    for f in os.listdir(os.path.join(OUT, 'tiles')):
        log('  ', f, f'{os.path.getsize(os.path.join(OUT, "tiles", f)) / 1e6:.1f} MB')
    return stats
