#!/usr/bin/env python3
"""
Build the Historical Atlas data packs in public/atlas/ from scholarly sources.

Nothing here invents data. Every feature comes from a named dataset, keeps its
own dates, certainty and identifiers, and every pack records its licence and
attribution in public/atlas/manifest.json.

Sources (see docs/HISTORICAL_ATLAS.md for what each provides and why):
  Pleiades        CC BY 3.0   places, names, roads, rivers, provinces, dates, precision
  AWMC geodata    ODbL 1.0    Roman roads, ancient shoreline by period, inland water, empire snapshots
  Cliopatria      CC BY 4.0   polity borders 3400 BCE - 2024 CE
  Wikidata        CC0         battles, sieges, wars; polity classification (empire/kingdom/republic)
  Natural Earth   public dom. modern land outline for the base map
  Early Medieval Atlas (ADS)  CC BY 4.0  Domesday shires & hundreds, Gough Map routes, inland navigation (england.py,
                  read from the original ZIPs in data/historical/raw/)
  Atlas of Rural Settlement   © English Heritage, personal/business use — local builds only, never deployed

Usage:  python3 scripts/atlas-build/build.py            (downloads into scripts/atlas-build/.cache)
        python3 scripts/atlas-build/england.py          (England layers only)
Needs:  pip install shapely pyshp pyproj pmtiles mapbox-vector-tile
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', '..', 'public', 'atlas')
UA = 'ShelfAtlasBuild/1.0 (https://github.com/yosefliberman770-source/shelf)'
csv.field_size_limit(10**9)

AWMC_RAW = 'https://raw.githubusercontent.com/AWMC/geodata/master/'
SOURCES = {
    'pleiades_gis': 'https://atlantides.org/downloads/pleiades/gis/pleiades_gis_data.zip',
    'cliopatria': 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip',
    'ne_land': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson',
    'ne_rivers': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson',
    'awmc_roads': AWMC_RAW + 'Cultural-Data/roads/roads.geojson',
    'awmc_shoreline': AWMC_RAW + 'Physical Data/shoreline/shoreline.geojson',
    'awmc_inland': AWMC_RAW + 'Physical Data/inland_water/inland-water-OSM.geojson',
}
AWMC_SNAPSHOTS = {
    # file → (label, from, to, date basis). Roman dates are in the dataset titles; the
    # others are the conventional dates of the extent each title names, marked approximate.
    'roman_empire_bce_60/roman_empire_bce_60': ('Roman territory, 60 BCE', -60, -60, 'title'),
    'roman_empire_ce_117_extent/roman_empire_ce_117_extent': ('Roman Empire at its greatest extent, 117 CE', 117, 117, 'title'),
    'roman_empire_ce_200_extent/roman_empire_ce_200_extent': ('Roman Empire, 200 CE', 200, 200, 'title'),
    'alexanders_empire/alexanders_empire': ("Alexander's empire (at his death, c. 323 BCE)", -323, -323, 'approximate'),
    'persian_extent/extent_of_the_persian_empire': ('Achaemenid Persian Empire at its greatest extent (c. 500 BCE)', -500, -500, 'approximate'),
    'hasmonean/hasmonean_kingdom': ('Hasmonean kingdom (greatest extent, c. 76 BCE)', -76, -76, 'approximate'),
    'herod/herods_kingdom': ("Herod's kingdom (c. 4 BCE)", -4, -4, 'approximate'),
}
AWMC_PROVINCE_SNAPSHOTS = {
    'roman_empire_ce_200_provinces/roman_empire_ce_200_provinces': ('Roman provinces, 200 CE', 200, 200, 'title'),
    'roman_empire_provinces post_diocletian/roman_empire_provinces post_diocletian': ('Roman provinces after Diocletian (c. 300 CE)', 300, 300, 'approximate'),
}

# Barrington Atlas period letters used by AWMC (and Pleiades' period bounds).
BARRINGTON = {'A': (-750, -550), 'C': (-550, -330), 'H': (-330, -30), 'R': (-30, 300), 'L': (300, 640)}

# ── Pleiades place types → atlas layers (a place can be in several) ──────────
PLACE_LAYERS = {
    'settlement': {'settlement', 'urban', 'vicus', 'polis', 'fortified-settlement', 'townhouse-settlement'},
    'port': {'port', 'harbor', 'anchorage', 'lighthouse', 'shipshed'},
    'fort': {'fort', 'fort-2', 'fortlet', 'fort-group', 'castellum', 'castle', 'hillfort', 'fortified-settlement',
             'military-installation-or-camp-temporary', 'military-base', 'barracks', 'citadel', 'tower-defensive'},
    'archaeological': {'archaeological-site', 'tell', 'ruin', 'tumulus', 'nuraghe', 'cairn', 'earthwork', 'earthworks'},
    'mountain': {'mountain', 'hill', 'volcano'},
    'pass': {'pass'},
    'lake': {'lake', 'lagoon', 'water-inland', 'reservoir'},
    'bridge': {'bridge', 'bridge-group'},
    'religious': {'temple', 'temple-2', 'sanctuary', 'shrine', 'church', 'church-2', 'mosque', 'synagogue', 'monastery',
                  'abbey', 'abbey-church', 'priory', 'altar', 'ziggurat', 'stupa', 'fortified-church'},
    'market': {'agora', 'forum', 'macellum', 'taberna-shop'},
    'cultural': {'theatre', 'odeon', 'amphitheatre', 'circus', 'stadion', 'gymnasium', 'palaestra', 'stoa', 'lesche'},
}
SKIP_TYPES = {'settlement-modern', 'label', 'unlabeled', 'false toponym', 'false', 'fiction', 'unlocated', 'unlocated-group'}
LINE_LAYERS = {'road': 'road', 'river': 'river', 'aqueduct': 'aqueduct', 'canal': 'canal'}


def log(*a):
    print(*a, flush=True)


def fetch(key: str, url: str) -> str:
    """Download once into the cache; return the local path."""
    os.makedirs(CACHE, exist_ok=True)
    name = key + os.path.splitext(urllib.parse.urlparse(url).path)[1]
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        log('  downloading', url)
        req = urllib.request.Request(urllib.parse.quote(url, safe=':/?=&%'), headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(path + '.part', path)
    return path


def rnd(geom, digits=4):
    """Round coordinates to keep files small (4 decimals ≈ 11 m)."""
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], digits), round(c[1], digits)]
        return [r(x) for x in c]
    g = mapping(geom) if not isinstance(geom, dict) else geom
    return {'type': g['type'], 'coordinates': r(g['coordinates'])}


def simplify(geom_json, tol, digits=4):
    g = shape(geom_json)
    if tol:
        g = g.simplify(tol, preserve_topology=True)
    if g.is_empty:
        return None
    return rnd(g, digits)


def write(name: str, fc: dict, folder: str | None = None) -> int:
    folder = folder or OUT
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(fc, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(path)
    log(f'  wrote {name}: {len(fc["features"])} features, {size/1e6:.2f} MB')
    return size


def fc(features):
    return {'type': 'FeatureCollection', 'features': features}


def year(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def period_range(code: str | None):
    """'HRL' → (-330, 640). '?' marks uncertainty. Unknown → (None, None)."""
    if not code:
        return None, None, False
    letters = [c for c in code.upper() if c in BARRINGTON]
    if not letters:
        return None, None, '?' in code
    return min(BARRINGTON[c][0] for c in letters), max(BARRINGTON[c][1] for c in letters), '?' in code


# ── Pleiades ─────────────────────────────────────────────────────────────────

# Connection types that mean two places existed at the same time (a site *at*
# a town, a station *on* a road, a district *part of* a city). "near",
# "succeeds" and "flows into" say nothing about coexistence and are not used.
COEXIST = {'at', 'on', 'in', 'connection', 'route_next', 'part_of_physical', 'part_of_regional', 'part_of_admin', 'part_of_analytical'}


def pleiades_envelopes(rows, dated):
    """The narrowest defensible period for Pleiades places that carry no dates.

    Evidence, strongest first:
      related  — dated records that can only exist while this place does
                 (a dated connection record; a dated site recorded at/on/in or
                 part of this place). The union of their spans.
      part-of  — the dated larger place/region this one is recorded as part of.
      source   — the record comes from a reference work with a defined period
                 (the Barrington Atlas: Pleiades' own Archaic…Late Antique
                 period bounds, read from time_periods.csv).
    Places with none of these stay undated: no period is assumed for them.
    Returns {pid: [from, to, basis]} (from/to may be None = open on that side).
    """
    periods = {r['key']: r for r in rows('time_periods.csv')}

    def bound(v):
        m = re.match(r'(?:AD )?(\d+)(?: (BC|AD))?', (v or '').strip())
        if not m:
            return None
        n = int(m.group(1))
        return -n if (m.group(2) == 'BC' or 'BC' in v) else n

    barrington = (bound(periods.get('archaic', {}).get('lower_bound')), bound(periods.get('late-antique', {}).get('upper_bound')))
    direct = defaultdict(list)
    parent = defaultdict(list)
    for r in rows('connections.csv'):
        ctype = (r.get('connection_type') or '').strip()
        if ctype not in COEXIST:
            continue
        src = r.get('place_id') or ''
        dst = (r.get('connects_to') or '').rstrip('/').rsplit('/', 1)[-1]
        a, b = year(r['year_after_which']), year(r['year_before_which'])
        if a is not None or b is not None:
            # The connection itself is dated: both ends existed then.
            direct[src].append((a, b))
            direct[dst].append((a, b))
        if dst in dated:
            (parent if ctype.startswith('part_of') else direct)[src].append(dated[dst])
        if src in dated:
            # Something dated is recorded at/in/part of this place: the place existed then.
            direct[dst].append(dated[src])
    places = {r['id']: r for r in rows('places.csv')}
    out = {}

    def union(spans):
        # Records dated to the modern period describe the place today, not its history.
        spans = [x for x in spans if x[0] is None or x[0] < 1700] or [(None, None)]
        spans = [(x[0], None if x[1] is not None and x[1] >= 1700 else x[1]) for x in spans]
        a = [x[0] for x in spans]
        b = [x[1] for x in spans]
        return [None if any(v is None for v in a) else min(a), None if any(v is None for v in b) else max(b)]

    for pid, p in places.items():
        if pid in dated:
            continue
        d, pa = union(direct.get(pid, [])), union(parent.get(pid, []))
        if d != [None, None]:
            out[pid] = d + ['related']
        elif pa != [None, None]:
            out[pid] = pa + ['part-of']
        elif re.search(r'barrington|batlas', p.get('provenance') or '', re.I) and None not in barrington:
            out[pid] = [barrington[0], barrington[1], 'source']
    return out


def pleiades():
    log('Pleiades')
    z = zipfile.ZipFile(fetch('pleiades_gis', SOURCES['pleiades_gis']))

    def rows(name):
        member = next(n for n in z.namelist() if n.endswith('/' + name) or n == name)
        return csv.DictReader(io.TextIOWrapper(z.open(member), encoding='utf-8-sig'))

    places = {r['id']: r for r in rows('places.csv')}
    types = defaultdict(set)
    for r in rows('places_place_types.csv'):
        types[r['place_id']].add(r['place_type'])

    # Dates come from dated *locations*; names only as a fallback, and never
    # modern names (they'd stretch every ancient place to the present day).
    loc_dates = defaultdict(lambda: [None, None])
    radius = {}
    certainty = {}
    lines = []
    polys = []
    for fname, kind in (('location_points.csv', 'point'), ('location_linestrings.csv', 'line'), ('location_polygons.csv', 'poly')):
        for r in rows(fname):
            pid = r['place_id']
            a, b = year(r['year_after_which']), year(r['year_before_which'])
            if b is not None and b >= 1700:
                if kind == 'point':
                    continue  # a modern location record for the place
                b = None  # a river or road outline recorded today: still valid, open-ended
            d = loc_dates[pid]
            if a is not None:
                d[0] = a if d[0] is None else min(d[0], a)
            if b is not None:
                d[1] = b if d[1] is None else max(d[1], b)
            rad = year(r.get('accuracy_radius'))
            if rad:
                radius[pid] = min(radius.get(pid, rad), rad)
            c = r.get('association_certainty') or 'certain'
            rank = {'certain': 0, 'less-certain': 1, 'uncertain': 2}.get(c, 0)
            certainty[pid] = max(certainty.get(pid, 0), rank)
            if kind == 'line':
                lines.append((pid, r['geometry_wkt'], a, b, rank))
            elif kind == 'poly':
                polys.append((pid, r['geometry_wkt'], a, b, rank))

    name_dates = defaultdict(lambda: [None, None])
    alt = defaultdict(list)
    for r in rows('names.csv'):
        pid = r['place_id']
        a, b = year(r['year_after_which']), year(r['year_before_which'])
        if b is not None and b < 1700:
            d = name_dates[pid]
            if a is not None:
                d[0] = a if d[0] is None else min(d[0], a)
            d[1] = b if d[1] is None else max(d[1], b)
        for k in ('romanized_form_1', 'attested_form'):
            v = (r.get(k) or '').strip()
            if v and v not in alt[pid] and len(alt[pid]) < 6:
                alt[pid].append(v)

    from shapely import wkt as shp_wkt

    own = {}
    for pid in places:
        a, b = loc_dates.get(pid, [None, None])
        if a is None and b is None:
            a, b = name_dates.get(pid, [None, None])
        if a is not None or b is not None:
            own[pid] = (a, b)
    envelopes = pleiades_envelopes(rows, own)
    # The gazetteer dates records by their locations only; name-dated places carry those spans as their period.
    for pid in own:
        if pid not in loc_dates or loc_dates[pid] == [None, None]:
            envelopes.setdefault(pid, [own[pid][0], own[pid][1], 'names'])
    with open(os.path.join(CACHE, 'pleiades-envelopes.json'), 'w') as fh:
        json.dump(envelopes, fh)
    envelopes = {k: v for k, v in envelopes.items() if v[2] != 'names'}
    log(f'  undated places with a defensible period: {len(envelopes)} ({", ".join(f"{k}: {v}" for k, v in sorted(Counter(e[2] for e in envelopes.values()).items()))})')

    feats = []
    for pid, p in places.items():
        t = types.get(pid, set())
        if not p['representative_latitude'] or t & SKIP_TYPES and not (t - SKIP_TYPES):
            continue
        layers = sorted(l for l, ts in PLACE_LAYERS.items() if t & ts)
        if not layers:
            continue
        a, b = loc_dates.get(pid, [None, None])
        basis = 'location'
        if a is None and b is None:
            a, b = name_dates.get(pid, [None, None])
            basis = 'names' if a is not None or b is not None else 'none'
        props = {
            'i': int(pid), 'n': p['title'],
            'l': ','.join(layers),
            'ty': ','.join(sorted(t - SKIP_TYPES))[:80],
            'p': 1 if p['location_precision'] == 'precise' else 0,
        }
        names = [x for x in alt.get(pid, []) if x != p['title']]
        if names:
            props['a'] = '|'.join(names[:5])
        if a is not None:
            props['f'] = a
        if b is not None:
            props['t'] = b
        if basis != 'location':
            props['db'] = basis
        env = envelopes.get(pid) if basis == 'none' else None
        if env:
            # No dates of its own: the period the evidence allows (see pleiades_envelopes).
            if env[0] is not None:
                props['ef'] = env[0]
            if env[1] is not None:
                props['et'] = env[1]
            props['eo'] = env[2]
        if certainty.get(pid):
            props['u'] = certainty[pid]
        if radius.get(pid):
            props['r'] = radius[pid]
        feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(float(p['representative_longitude']), 4), round(float(p['representative_latitude']), 4)]}, 'properties': props})
    # Source for the vector tiles (public/world/tiles/pleiades.pmtiles); not served whole.
    write('pleiades-places.json', fc(feats), CACHE)

    # Lines: roads, rivers, aqueducts, canals.
    line_feats = []
    for pid, w, a, b, rank in lines:
        t = types.get(pid, set())
        kind = next((LINE_LAYERS[x] for x in t if x in LINE_LAYERS), None)
        if not kind or pid not in places:
            continue
        try:
            g = simplify(mapping(shp_wkt.loads(w)), 0.002)
        except Exception:
            continue
        if not g:
            continue
        props = {'i': int(pid), 'n': places[pid]['title'], 'k': kind}
        if a is not None:
            props['f'] = a
        if b is not None:
            props['t'] = b
        if rank:
            props['u'] = rank
        line_feats.append({'type': 'Feature', 'geometry': g, 'properties': props})
    write('pleiades-lines.json', fc(line_feats))

    # Named provinces and regions with outlines.
    prov = []
    for pid, w, a, b, rank in polys:
        t = types.get(pid, set())
        if not t & {'province', 'province-2', 'regio-augusti', 'diocese-roman', 'satrapy', 'nome-gr', 'nome-egyptian', 'kingdom', 'state', 'territory'}:
            continue
        try:
            g = simplify(mapping(shp_wkt.loads(w)), 0.01, 3)
        except Exception:
            continue
        if not g:
            continue
        props = {'i': int(pid), 'n': places[pid]['title'], 'ty': ','.join(sorted(t))[:60]}
        if a is not None:
            props['f'] = a
        if b is not None:
            props['t'] = b
        if rank:
            props['u'] = rank
        prov.append({'type': 'Feature', 'geometry': g, 'properties': props})
    write('pleiades-provinces.json', fc(prov))
    return {'places': len(feats), 'lines': len(line_feats), 'provinces': len(prov)}


# ── AWMC ─────────────────────────────────────────────────────────────────────

def awmc():
    log('AWMC')
    stats = {}
    roads = json.load(open(fetch('awmc_roads', SOURCES['awmc_roads']), encoding='utf-8'))
    out = []
    for f in roads['features']:
        if not f.get('geometry'):
            continue
        p = f['properties'] or {}
        code = p.get('timeperiod') or p.get('timeperi_1')
        a, b, q = period_range(code)
        g = simplify(f['geometry'], 0.003)
        if not g:
            continue
        props = {'k': 'road'}
        if p.get('Name'):
            props['n'] = p['Name']
        if a is not None:
            props['f'], props['t'] = a, b
        if code:
            props['pc'] = code
        # The "Known_or_a…" and "Major_or_M…" flags aren't documented (which value means
        # known/assumed isn't stated), so they're not used. Only the period code is.
        if q:
            props['u'] = 1
        out.append({'type': 'Feature', 'geometry': g, 'properties': props})
    write('awmc-roads.json', fc(out))
    stats['roads'] = len(out)

    shore = json.load(open(fetch('awmc_shoreline', SOURCES['awmc_shoreline']), encoding='utf-8'))
    out = []
    for f in shore['features']:
        if not f.get('geometry'):
            continue
        p = f['properties'] or {}
        a, b, q = period_range(p.get('TIMEPERIOD'))
        g = simplify(f['geometry'], 0.004)
        if not g:
            continue
        props = {'k': 'coast'}
        if a is not None:
            props['f'], props['t'] = a, b
        if p.get('TIMEPERIOD'):
            props['pc'] = p['TIMEPERIOD']
        if p.get('acc') not in (1, None):
            props['u'] = 1  # not marked "Accurate"
        if p.get('exs') not in (1, None):
            props['as'] = 1  # not marked "Definite"
        out.append({'type': 'Feature', 'geometry': g, 'properties': props})
    write('awmc-shoreline.json', fc(out))
    stats['shoreline'] = len(out)

    inland = json.load(open(fetch('awmc_inland', SOURCES['awmc_inland']), encoding='utf-8'))
    out = []
    for f in inland['features']:
        if not f.get('geometry'):
            continue
        p = f['properties'] or {}
        g = simplify(f['geometry'], 0.004)
        if not g:
            continue
        props = {'k': (p.get('TYPE') or 'water').lower()}
        title = p.get('TITLE')
        if title and title != 'Untitled':
            props['n'] = title
        if p.get('ACCURATE') not in (1, None):
            props['u'] = 1
        out.append({'type': 'Feature', 'geometry': g, 'properties': props})
    write('awmc-inland-water.json', fc(out))
    stats['inland'] = len(out)

    snaps = []
    for path, (label, a, b, basis) in {**AWMC_SNAPSHOTS, **AWMC_PROVINCE_SNAPSHOTS}.items():
        url = AWMC_RAW + 'Cultural-Data/political_shading/' + path + '.geojson'
        d = json.load(open(fetch('snap_' + os.path.basename(path).replace(' ', '_'), url), encoding='utf-8'))
        geoms = [shape(f['geometry']) for f in d['features'] if f.get('geometry')]
        kind = 'province' if path in AWMC_PROVINCE_SNAPSHOTS else 'extent'
        if kind == 'extent':
            geoms = [unary_union(geoms)]
        for g in geoms:
            s = simplify(mapping(g), 0.01, 3)
            if s:
                snaps.append({'type': 'Feature', 'geometry': s, 'properties': {'n': label, 'k': kind, 'f': a, 't': b, 'db': basis}})
    write('awmc-snapshots.json', fc(snaps))
    stats['snapshots'] = len(snaps)
    return stats


# ── Wikidata ─────────────────────────────────────────────────────────────────

PREFIXES = """PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""
# Two independent public endpoints over the same Wikidata graph, so the build
# doesn't depend on one service (WDQS has been rate-limited during outages).
SPARQL_ENDPOINTS = ['https://qlever.dev/api/wikidata', 'https://query.wikidata.org/sparql']


def sparql(query: str):
    body = PREFIXES + query
    last = None
    for endpoint in SPARQL_ENDPOINTS:
        for attempt in range(2):
            try:
                url = endpoint + '?' + urllib.parse.urlencode({'query': body})
                req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
                with urllib.request.urlopen(req, timeout=300) as r:
                    return json.load(r)['results']['bindings']
            except Exception as e:  # noqa: BLE001 — try again, then the other endpoint
                last = e
                log('   sparql', endpoint.split('/')[2], 'failed:', str(e)[:120])
                time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'All SPARQL endpoints failed: {last}')


def wd_year(v: str | None, precision: str | None = None):
    """'-0217-01-01T00:00:00Z' → -218 (Wikidata stores 218 BCE as -0217 astronomically)."""
    if not v:
        return None
    m = re.match(r'^([+-]?)(\d+)-', v)
    if not m:
        return None
    y = int(m.group(2)) * (-1 if m.group(1) == '-' else 1)
    return y - 1 if y <= 0 else y  # astronomical → historical (no year 0)


def wikidata_events():
    log('Wikidata battles, sieges, campaigns, revolts, expeditions, coups, treaties')
    feats = {}
    # Classes in order of precedence (an item that is both a battle and a revolt counts as a battle).
    for cls, kind in (('Q178561', 'battle'), ('Q188055', 'siege'), ('Q831663', 'campaign'), ('Q124734', 'revolt'),
                      ('Q2401485', 'expedition'), ('Q45382', 'coup'), ('Q131569', 'treaty')):
        rows = sparql(f"""SELECT ?e ?label ?coord ?time ?prec ?start ?sprec ?end WHERE {{
  ?e wdt:P31/wdt:P279* wd:{cls} ; wdt:P625 ?coord ; rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL {{ ?e p:P585/psv:P585 ?tv . ?tv wikibase:timeValue ?time ; wikibase:timePrecision ?prec }}
  OPTIONAL {{ ?e p:P580/psv:P580 ?sv . ?sv wikibase:timeValue ?start ; wikibase:timePrecision ?sprec }}
  OPTIONAL {{ ?e wdt:P582 ?end }}
  FILTER(BOUND(?time) || BOUND(?start))
}}""")
        time.sleep(2)
        for r in rows:
            qid = r['e']['value'].rsplit('/', 1)[1]
            if qid in feats:
                continue
            m = re.match(r'(?i)point\(([-\d.eE]+) ([-\d.eE]+)\)', r['coord']['value'])
            if not m:
                continue
            t = r.get('time') or r.get('start')
            y = wd_year(t['value'] if t else None)
            if y is None:
                continue
            prec = int((r.get('prec') or r.get('sprec') or {}).get('value') or 9)
            props = {'q': qid, 'n': r['label']['value'], 'k': kind, 'y': y}
            y2 = wd_year((r.get('end') or {}).get('value'))
            if y2 is not None and y2 > y:
                props['y2'] = y2  # a date range (campaigns, expeditions, revolts)
            if prec < 9:
                props['u'] = 1  # date known only to the decade / century
                props['yp'] = {8: 'decade', 7: 'century', 6: 'millennium'}.get(prec, 'approximate')
            feats[qid] = {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(float(m.group(1)), 4), round(float(m.group(2)), 4)]}, 'properties': props}
        log(f'  {kind}: {sum(1 for f in feats.values() if f["properties"]["k"] == kind)}')

    # Which war each event was part of, and the war's own dates.
    rows = sparql("""SELECT ?e ?war ?wlabel ?ws ?we WHERE {
  ?e wdt:P361 ?war . ?war wdt:P31/wdt:P279* wd:Q198 ; rdfs:label ?wlabel . FILTER(LANG(?wlabel) = "en")
  ?e wdt:P625 ?c .
  OPTIONAL { ?war wdt:P580 ?ws } OPTIONAL { ?war wdt:P582 ?we }
}""")
    wars = {}
    for r in rows:
        qid = r['e']['value'].rsplit('/', 1)[1]
        f = feats.get(qid)
        if not f:
            continue
        wq = r['war']['value'].rsplit('/', 1)[1]
        f['properties'].setdefault('w', wq)
        f['properties'].setdefault('wn', r['wlabel']['value'])
        wars.setdefault(wq, {'q': wq, 'n': r['wlabel']['value'], 'f': wd_year((r.get('ws') or {}).get('value')), 't': wd_year((r.get('we') or {}).get('value'))})
    write('wikidata-events.json', fc(list(feats.values())))
    with open(os.path.join(OUT, 'wikidata-wars.json'), 'w', encoding='utf-8') as fh:
        json.dump(sorted(wars.values(), key=lambda w: (w['f'] if w['f'] is not None else 9999)), fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  wrote wikidata-wars.json: {len(wars)} wars')
    return {'events': len(feats), 'wars': len(wars)}


POLITY_CLASSES = [
    # (class, Wikidata items whose instances/subclasses count). Order = precedence.
    ('empire', ['Q48349']),
    ('republic', ['Q7270']),
    ('kingdom', ['Q417175', 'Q1250464']),  # kingdom, realm
    ('city-state', ['Q133442', 'Q148837']),  # city-state, polis
    ('confederation', ['Q170156', 'Q11691', 'Q1207437']),  # confederation, league, tribal confederation
    ('province', ['Q34876', 'Q1348006']),  # province, Roman province
]


def label_point(f):
    g = shape(f['geometry'])
    parts = list(getattr(g, 'geoms', [g]))
    big = max(parts, key=lambda x: x.area)
    try:
        from shapely.ops import polylabel
        pt = polylabel(big, tolerance=0.05)
    except Exception:
        pt = big.representative_point()
    return {'type': 'Point', 'coordinates': [round(pt.x, 2), round(pt.y, 2)]}


def same_as_member(p):
    """A grouping whose only member has its own name ("(Kingdom of England)" of "Kingdom of England") needs no second label."""
    if not p.get('g'):
        return False
    comps = [c.strip() for c in p.get('cm', '').split(';') if c.strip()]
    return not comps or p['n'].strip('()') in comps


PALETTE_SIZE = 12


def polity_relations(out, geoms, relations=()):
    """Contested overlaps and colours, computed once from the outlines.

    Overlaps: two polities (neither a grouping) whose outlines overlap
    substantially in the same years. Cliopatria records territory per period
    and records relationships between polities (allegiance, alliance,
    vassalage, personal union) — it records no claims or disputes. So an
    overlap is explained by a recorded relationship when one links the two
    polities at that time ('xr'); otherwise it is only an overlap between the
    source's outlines ('x': shared or changing control within the period, or
    reconstruction imprecision — the source doesn't say which). Neither is
    called "contested".

    Colour: every polity gets a fixed palette index (by its Seshat/Wikidata
    identity, so the same state keeps its colour through time), chosen so
    polities that border or overlap each other at any time differ.
    """
    from shapely.strtree import STRtree
    tree = STRtree(geoms)
    ents = sorted({f['properties']['k'] for f in out})
    nbrs = defaultdict(set)
    contested = 0
    explained = 0
    for i, f in enumerate(out):
        p = f['properties']
        gi = geoms[i]
        for j in tree.query(gi.buffer(0.1)):
            j = int(j)
            if j <= i:
                continue
            o = out[j]['properties']
            if o['f'] > p['t'] or o['t'] < p['f'] or o['k'] == p['k']:
                continue
            nbrs[p['k']].add(o['k'])
            nbrs[o['k']].add(p['k'])
            if p.get('g') or o.get('g'):
                continue
            gj = geoms[j]
            if not gi.intersects(gj):
                continue
            inter = gi.intersection(gj).area
            small = min(gi.area, gj.area)
            # Either a large share of one outline, or a separate piece of one
            # lying mostly inside the other (e.g. an overseas holding claimed
            # inside a neighbour) — but not the thin slivers simplification
            # leaves along a shared border.
            enclave = inter > 0.05 and any(x.area > 0.05 and x.intersection(other).area > 0.5 * x.area
                                           for a, other in ((gi, gj), (gj, gi)) for x in getattr(a, 'geoms', [a]) if x.area < 0.5 * a.area)
            if small > 0 and ((inter / small > 0.08 and inter > 0.05) or enclave):
                rel = next((r for r in relations if p['n'] in r['c'] and o['n'] in r['c'] and r['f'] <= min(p['t'], o['t']) and r['t'] >= max(p['f'], o['f'])), None)
                key = 'xr' if rel else 'x'
                for a, b in ((p, o), (o, p)):
                    a.setdefault(key, [])
                    v = rel['n'].strip('()') if rel else b['n']
                    if v not in a[key]:
                        a[key].append(v)
                contested += 1
                explained += 1 if rel else 0
    # Greedy colouring, largest-degree first; deterministic order.
    colour = {}
    for k in sorted(ents, key=lambda k: (-len(nbrs[k]), k)):
        used = {colour[n] for n in nbrs[k] if n in colour}
        free = [c for c in range(PALETTE_SIZE) if c not in used]
        if free:
            # Spread choices by identity so unrelated polities don't all get colour 0.
            colour[k] = free[sum(map(ord, k)) % len(free)]
        else:
            counts = defaultdict(int)
            for n in nbrs[k]:
                if n in colour:
                    counts[colour[n]] += 1
            colour[k] = min(range(PALETTE_SIZE), key=lambda c: (counts[c], c))
    for f in out:
        p = f['properties']
        p['ci'] = colour[p['k']]
        for key in ('x', 'xr'):
            if key in p:
                p[key] = ';'.join(sorted(p[key])[:6])
        if not p.get('op'):
            p['_lp'] = label_point(f)['coordinates']
    log(f'  cliopatria: {contested} overlapping outlines ({explained} explained by a recorded relationship); {len(ents)} polities coloured with {PALETTE_SIZE} colours')


def cliopatria():
    log('Cliopatria + Wikidata classification')
    z = zipfile.ZipFile(fetch('cliopatria', SOURCES['cliopatria']))
    member = next(n for n in z.namelist() if n.endswith('.geojson'))
    d = json.load(z.open(member))
    qids = sorted({f['properties'].get('Wikidata') for f in d['features'] if f['properties'].get('Wikidata')})
    # The Wikidata classes change rarely; they are cached so a rebuild doesn't re-query the endpoint.
    cls_path = os.path.join(CACHE, 'cliopatria-classes.json')
    if os.path.exists(cls_path):
        cls = json.load(open(cls_path))
    else:
        cls = {}
        for i in range(0, len(qids), 300):
            chunk = ' '.join('wd:' + q for q in qids[i:i + 300])
            for c, items in POLITY_CLASSES:
                vals = ' '.join('wd:' + x for x in items)
                rows = sparql(f'SELECT DISTINCT ?p WHERE {{ VALUES ?p {{ {chunk} }} VALUES ?c {{ {vals} }} ?p wdt:P31/wdt:P279* ?c . }}')
                for r in rows:
                    q = r['p']['value'].rsplit('/', 1)[1]
                    cls.setdefault(q, c)  # first (highest precedence) class wins
                time.sleep(2)  # be polite to the public endpoints
            time.sleep(3)
        json.dump(cls, open(cls_path, 'w'))
    out = []
    geoms = []
    for f in d['features']:
        p = f['properties']
        if p.get('Type') != 'POLITY' or not f.get('geometry'):
            continue
        g = shape(f['geometry']).simplify(0.06, preserve_topology=True)
        # Drop specks (islets, slivers) under ~50 km² unless that is the whole polity.
        parts = list(getattr(g, 'geoms', [g]))
        keep = [x for x in parts if x.area >= 0.005] or parts
        g = unary_union(keep) if len(keep) > 1 else keep[0]
        if g.is_empty:
            continue
        q = p.get('Wikidata') or ''
        props = {'n': p['Name'], 'f': int(p['FromYear']), 't': int(p['ToYear'])}
        if q:
            props['q'] = q
            if q in cls:
                props['c'] = cls[q]
        # Hierarchy, as Cliopatria records it. A name in parentheses is a
        # grouping of other polities (an empire's provinces, a heptarchy, a
        # personal union) — drawn as an outline around its members, never as a
        # rival state. Members record which grouping(s) they belong to.
        if p['Name'].startswith('('):
            props['g'] = 1
            if p.get('Components'):
                props['cm'] = p['Components']
        if p.get('MemberOf'):
            props['m'] = p['MemberOf']
        props['a'] = int(round(float(p.get('Area') or 0)))  # km², from Cliopatria
        props['k'] = (p.get('SeshatID') or '').split(';')[0] or q or p['Name'].strip('()')
        # Small pieces far from the polity's main territory (a coastal
        # foothold, a raid remembered as a holding) are kept as separate
        # "outlying" features, so the map can show them as the source's
        # claim rather than as solid territory, and they get no label.
        parts = list(getattr(g, 'geoms', [g]))
        main = max(parts, key=lambda x: x.area)
        outlying = [x for x in parts if x is not main and x.area < 0.05 * g.area and x.distance(main) > 2]
        if outlying and not props.get('g'):
            rest = [x for x in parts if not any(x is o for o in outlying)]
            g = unary_union(rest) if len(rest) > 1 else rest[0]
            for o in outlying:
                out.append({'type': 'Feature', 'geometry': rnd(o, 2), 'properties': {**props, 'op': 1}})
                geoms.append(o)
        out.append({'type': 'Feature', 'geometry': rnd(g, 2), 'properties': props})
        geoms.append(g)
    relations = [{'n': f['properties']['Name'], 'f': int(f['properties']['FromYear']), 't': int(f['properties']['ToYear']),
                  'c': set(x.strip() for x in (f['properties'].get('Components') or '').split(';') if x.strip())}
                 for f in d['features'] if f['properties'].get('Type') == 'RELATION']
    polity_relations(out, geoms, relations)
    # Split by time so the app downloads only the era on screen. Borders change
    # almost yearly in recent centuries, so those slices are shorter.
    def slice_len(y):
        return 100 if y < 1500 else 50 if y < 1700 else 20 if y < 1800 else 10

    edges = []
    y = -3400
    while y <= 2024:
        n = slice_len(y)
        edges.append((y, min(y + n - 1, 2024)))
        y += n
    os.makedirs(os.path.join(OUT, 'cliopatria'), exist_ok=True)
    for old in os.listdir(os.path.join(OUT, 'cliopatria')):
        os.remove(os.path.join(OUT, 'cliopatria', old))
    index = []
    total = 0
    for a, b in edges:
        fs = [f for f in out if f['properties']['f'] <= b and f['properties']['t'] >= a]
        if not fs:
            continue
        # One label point per polity version: inside its largest part, so a
        # polity split into many pieces (Denmark with Greenland) is named once.
        fs = [{**f, 'properties': {k: v for k, v in f['properties'].items() if k != '_lp'}} for f in fs] + [
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': f['properties']['_lp']},
             'properties': {**{k: v for k, v in f['properties'].items() if k in ('n', 'f', 't', 'q', 'c', 'g', 'a', 'k', 'ci', 'x', 'xr')}, 'lbl': 1}} for f in fs if not f['properties'].get('op') and not same_as_member(f['properties'])]
        name = f'{a}_{b}.json'
        total += write(f'cliopatria/{name}', fc(fs))
        index.append({'from': a, 'to': b, 'file': f'cliopatria/{name}', 'count': len(fs)})
    with open(os.path.join(OUT, 'cliopatria', 'index.json'), 'w') as fh:
        json.dump(index, fh, separators=(',', ':'))
    log(f'  cliopatria: {len(index)} time slices, {total/1e6:.1f} MB in all')
    counts = defaultdict(int)
    for f in out:
        counts[f['properties'].get('c', 'unclassified')] += 1
    log('  classes:', dict(counts))
    return {'polities': len(out), 'classified': sum(v for k, v in counts.items() if k != 'unclassified')}


def natural_earth():
    log('Natural Earth land')
    d = json.load(open(fetch('ne_land', SOURCES['ne_land']), encoding='utf-8'))
    out = []
    for f in d['features']:
        g = simplify(f['geometry'], 0.01, 3)
        if g:
            out.append({'type': 'Feature', 'geometry': g, 'properties': {}})
    write('ne-land.json', fc(out))
    rv = json.load(open(fetch('ne_rivers', SOURCES['ne_rivers']), encoding='utf-8'))
    rivers = []
    for f in rv['features']:
        p = f['properties'] or {}
        if (p.get('featurecla') or '').lower().startswith('lake'):
            continue
        g = simplify(f['geometry'], 0.005, 3)
        if g:
            props = {'k': 'river', 'sr': int(p.get('scalerank') or 10)}
            if p.get('name_en') or p.get('name'):
                props['n'] = p.get('name_en') or p.get('name')
            rivers.append({'type': 'Feature', 'geometry': g, 'properties': props})
    write('ne-rivers.json', fc(rivers))
    return {'land': len(out), 'rivers': len(rivers)}


# ── Gazetteer: every Pleiades place with all its names, for name lookup ──────

# Pleiades connection types that say one place is part of / inside another.
PART_OF = {'part_of_admin', 'part_of_regional', 'part_of_physical', 'located_in', 'in_territory_of', 'part_of_analytical', 'member'}
# Other recorded relationships worth showing as "related places" (Pleiades' own wording).
RELATED = {'succeeds', 'same_as', 'capital', 'port_of', 'founded', 'near', 'at', 'on', 'crosses', 'flows_into', 'route_next', 'abuts', 'bounds', 'communicates', 'related'}


def gazetteer():
    """pleiades-gazetteer.json: compact rows the reader uses to recognise and
    look up names offline. Every alternative name is one Pleiades itself links
    to the place — names are never merged across places here."""
    log('Pleiades gazetteer')
    z = zipfile.ZipFile(fetch('pleiades_gis', SOURCES['pleiades_gis']))
    names_in_zip = z.namelist()

    def rows(name):
        member = next((n for n in names_in_zip if n.endswith('/' + name) or n == name), None)
        if not member:
            log('  (no', name, 'in the Pleiades package)')
            return []
        return csv.DictReader(io.TextIOWrapper(z.open(member), encoding='utf-8-sig'))

    places = {r['id']: r for r in rows('places.csv')}
    types = defaultdict(set)
    for r in rows('places_place_types.csv'):
        types[r['place_id']].add(r['place_type'])
    dates = defaultdict(lambda: [None, None])
    certainty = {}
    for fname in ('location_points.csv', 'location_linestrings.csv', 'location_polygons.csv'):
        for r in rows(fname):
            a, b = year(r['year_after_which']), year(r['year_before_which'])
            if b is not None and b >= 1700:
                continue
            d = dates[r['place_id']]
            if a is not None:
                d[0] = a if d[0] is None else min(d[0], a)
            if b is not None:
                d[1] = b if d[1] is None else max(d[1], b)
            rank = {'certain': 0, 'less-certain': 1, 'uncertain': 2}.get(r.get('association_certainty') or 'certain', 0)
            certainty[r['place_id']] = max(certainty.get(r['place_id'], 0), rank)
    names = defaultdict(list)
    for r in rows('names.csv'):
        pid = r['place_id']
        a, b = year(r['year_after_which']), year(r['year_before_which'])
        seen = {n[0] for n in names[pid]}
        forms = [(r.get(k) or '').strip() for k in ('romanized_form_1', 'romanized_form_2', 'romanized_form_3', 'attested_form')]
        for v in forms:
            for part in re.split(r'\s*,\s*', v) if ',' in v else [v]:
                if part and part not in seen and len(part) < 60 and len(names[pid]) < 12:
                    seen.add(part)
                    names[pid].append([part, a, b, (r.get('language_tag') or '')[:8]])
    parents = defaultdict(list)
    related = defaultdict(list)
    for r in rows('connections.csv'):
        ctype = (r.get('connection_type') or '').strip()
        src = r.get('place_id') or r.get('source') or ''
        dst = (r.get('connects_to') or r.get('target') or '').rsplit('/', 1)[-1]
        if not (src and dst.isdigit()):
            continue
        if ctype in PART_OF:
            if dst not in parents[src]:
                parents[src].append(dst)
        elif ctype in RELATED and len(related[src]) < 10:
            related[src].append([int(dst), ctype])

    # Periods for undated places, from the same evidence as the map (built by pleiades()).
    env_path = os.path.join(CACHE, 'pleiades-envelopes.json')
    envelopes = json.load(open(env_path)) if os.path.exists(env_path) else {}
    out = []
    titles = {}
    for pid, p in places.items():
        t = types.get(pid, set())
        if not p['representative_latitude'] or (t and not (t - SKIP_TYPES)):
            continue
        a, b = dates.get(pid, [None, None])
        par = [int(x) for x in parents.get(pid, [])[:4] if x.isdigit()]
        rel = related.get(pid, [])
        for x in par + [r[0] for r in rel]:
            if str(x) in places:
                titles[str(x)] = places[str(x)]['title']
        out.append([
            int(pid), p['title'],
            round(float(p['representative_longitude']), 4), round(float(p['representative_latitude']), 4),
            1 if p['location_precision'] == 'precise' else 0,
            ','.join(sorted(t - SKIP_TYPES))[:60],
            a, b, certainty.get(pid, 0),
            [n for n in names.get(pid, []) if n[0] != p['title']],
            par,
            rel,
            envelopes.get(pid) if a is None and b is None else None,
        ])
    doc = {'v': 1, 'fields': ['id', 'title', 'lon', 'lat', 'precise', 'types', 'from', 'to', 'uncertain', 'names', 'partOf', 'related', 'envelope'], 'titles': titles, 'rows': out}
    # Kept in the build cache: the app reads it through the tiled World index (public/world/places), never whole.
    path = os.path.join(CACHE, 'pleiades-gazetteer.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    log(f'  wrote pleiades-gazetteer.json: {len(out)} places, {os.path.getsize(path)/1e6:.2f} MB')
    return {'places': len(out), 'withParents': sum(1 for r in out if r[10])}


def polity_aliases():
    """cliopatria/names.json gains, per polity, the English aliases ('al') and
    demonyms ('dm', Wikidata P1549) that Wikidata records for its item — so
    "Venetian", "Byzantium" or "Eastern Roman Empire" find their polity from
    data, not from a hand-made list. Cached; re-queried only when missing."""
    log('Cliopatria: Wikidata aliases and demonyms')
    path = os.path.join(OUT, 'cliopatria', 'names.json')
    rows = json.load(open(path, encoding='utf-8'))
    cache_path = os.path.join(CACHE, 'cliopatria-aliases.json')
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    qids = sorted({r['q'] for r in rows if r.get('q')} - set(cache))
    # QLever's copy of Wikidata (University of Freiburg) first: same data, not subject to the
    # query-service rate limits shared build machines hit. Wikidata's own entity API is the fallback.
    def store(q, al, dm):
        cache[q] = {'al': sorted(set(al))[:20], 'dm': sorted(set(x for x in dm if x))[:6]}

    def qlever(chunk):
        query = ('PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> '
                 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#> '
                 f'SELECT ?p ?alias ?dem WHERE {{ VALUES ?p {{ {" ".join("wd:" + q for q in chunk)} }} '
                 'OPTIONAL { ?p skos:altLabel ?alias FILTER(LANG(?alias) = "en") } '
                 'OPTIONAL { ?p wdt:P1549 ?dem FILTER(LANG(?dem) = "en") } }')
        req = urllib.request.Request('https://qlever.dev/api/wikidata', data=urllib.parse.urlencode({'query': query}).encode(),
                                     headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=180) as r:
            rows = json.load(r)['results']['bindings']
        got = {q: ([], []) for q in chunk}
        for r in rows:
            q = r['p']['value'].rsplit('/', 1)[1]
            if 'alias' in r:
                got[q][0].append(r['alias']['value'])
            if 'dem' in r:
                got[q][1].append(r['dem']['value'])
        return got

    def entity_api(chunk):
        url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({'action': 'wbgetentities', 'ids': '|'.join(chunk), 'props': 'aliases|claims', 'languages': 'en', 'format': 'json'})
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as r:
            ents = json.load(r).get('entities', {})
        got = {}
        for q in chunk:
            e = ents.get(q, {})
            got[q] = ([a['value'] for a in e.get('aliases', {}).get('en', [])],
                      [c['mainsnak'].get('datavalue', {}).get('value', {}).get('text') for c in e.get('claims', {}).get('P1549', [])
                       if c['mainsnak'].get('datavalue', {}).get('value', {}).get('language') == 'en'])
        return got

    wait = 60
    i = 0
    deadline = time.time() + 3600  # give up after an hour and use what is cached
    while i < len(qids) and time.time() < deadline:
        chunk = qids[i:i + 200]
        got = None
        for source in (qlever, entity_api):
            try:
                got = source(chunk if source is qlever else chunk[:50])
                break
            except Exception as e:  # noqa: BLE001 — try the other source
                log('   ', source.__name__, str(e)[:80])
        if got is None:
            time.sleep(wait)
            wait = min(wait * 2, 900)
            continue
        for q, (al, dm) in got.items():
            store(q, al, dm)
        json.dump(cache, open(cache_path, 'w'))  # keep progress
        log(f'   {len(cache)} polities fetched')
        i += len(got)
        wait = 60
        time.sleep(2)
    json.dump(cache, open(cache_path, 'w'))
    if i < len(qids):
        log(f'  Wikidata unavailable: {len(qids) - i} polities without aliases this time (kept for the next build)')
    n_al = n_dm = 0
    for r in rows:
        c = cache.get(r.get('q') or '')
        if not c:
            continue
        # Latin-script aliases short enough to be a name as written in a book.
        al = [a for a in c['al'] if len(a) <= 40 and re.match(r"^[A-Za-zÀ-ɏ' .\-]+$", a)]
        if al:
            r['al'] = al
            n_al += 1
        if c['dm']:
            r['dm'] = c['dm']
            n_dm += 1
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  {n_al} polities with aliases, {n_dm} with demonyms')
    return {'aliases': n_al, 'demonyms': n_dm}


def polity_names():
    """cliopatria/names.json: every polity name once, with its full date range
    (from the slices already built), for historical search."""
    log('Cliopatria names index')
    folder = os.path.join(OUT, 'cliopatria')
    by = {}
    for fn in os.listdir(folder):
        if not re.match(r'^-?\d+_-?\d+\.json$', fn):
            continue
        for f in json.load(open(os.path.join(folder, fn), encoding='utf-8'))['features']:
            p = f['properties']
            if p.get('lbl') or p.get('op'):
                continue
            k = (p['n'], p.get('q', ''))
            cur = by.get(k)
            g = shape(f['geometry'])
            c = g.representative_point()
            if not cur:
                by[k] = {'n': p['n'], 'f': p['f'], 't': p['t'], **({'q': p['q']} if p.get('q') else {}), **({'c': p['c']} if p.get('c') else {}), **({'g': 1} if p.get('g') else {}), **({'m': p['m']} if p.get('m') else {}),
                         'x': round(c.x, 2), 'y': round(c.y, 2), 'area': g.area}
            else:
                cur['f'] = min(cur['f'], p['f'])
                cur['t'] = max(cur['t'], p['t'])
                if g.area > cur['area']:
                    cur.update(x=round(c.x, 2), y=round(c.y, 2), area=g.area)
    rows = sorted(by.values(), key=lambda r: (r['f'], r['n']))
    for r in rows:
        del r['area']
    with open(os.path.join(folder, 'names.json'), 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  wrote cliopatria/names.json: {len(rows)} polities')
    return {'names': len(rows)}


def manifest(stats):
    today = date.today().isoformat()
    m = {
        'version': today,
        'datasets': [
            {'id': 'pleiades', 'name': 'Pleiades', 'url': 'https://pleiades.stoa.org/', 'license': 'CC BY 3.0',
             'licenseUrl': 'https://creativecommons.org/licenses/by/3.0/', 'commercial': True, 'shareAlike': False,
             'attribution': 'Pleiades: A Gazetteer of Past Places, pleiades.stoa.org (CC BY 3.0)',
             'files': ['pleiades-lines.json', 'pleiades-provinces.json', '../world/places/', '../world/tiles/pleiades.pmtiles'],
             'notes': 'Dates are broad archaeological periods (e.g. Roman = 30 BCE–300 CE), not founding dates. Pleiades does not record settlement size.',
             'retrieved': today, 'counts': stats.get('pleiades')},
            {'id': 'awmc', 'name': 'Ancient World Mapping Center', 'url': 'https://awmc.unc.edu/', 'license': 'ODbL 1.0',
             'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'commercial': True, 'shareAlike': True,
             'attribution': 'Ancient World Mapping Center, UNC Chapel Hill — geodata derived from the Barrington Atlas (ODbL)',
             'files': ['awmc-roads.json', 'awmc-shoreline.json', 'awmc-inland-water.json', 'awmc-snapshots.json'],
             'notes': 'Road and shoreline dates are Barrington periods. Inland water is modern-based (OSM). Dates for non-Roman snapshots are the conventional dates of the extents their titles name.',
             'retrieved': today, 'counts': stats.get('awmc')},
            {'id': 'cliopatria', 'name': 'Cliopatria (Seshat Global History Databank)', 'url': 'https://github.com/Seshat-Global-History-Databank/cliopatria',
             'license': 'CC BY 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/', 'commercial': True, 'shareAlike': False,
             'attribution': 'Cliopatria, Seshat Global History Databank (CC BY 4.0); simplified by Shelf',
             'files': ['cliopatria/index.json', 'cliopatria/names.json'],
             'notes': 'One scholarly version of each polity’s territory; borders were rarely this sharp. Kingdom/empire/republic types come from Wikidata where available.',
             'retrieved': today, 'counts': stats.get('cliopatria')},
            {'id': 'wikidata', 'name': 'Wikidata', 'url': 'https://www.wikidata.org/', 'license': 'CC0',
             'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/', 'commercial': True, 'shareAlike': False,
             'attribution': 'Wikidata (CC0)', 'files': ['wikidata-events.json', 'wikidata-wars.json'],
             'notes': 'Battles, sieges and campaigns with a location and a date. Crowd-sourced; check important facts.',
             'retrieved': today, 'counts': stats.get('wikidata')},
            {'id': 'naturalearth', 'name': 'Natural Earth', 'url': 'https://www.naturalearthdata.com/', 'license': 'Public domain',
             'licenseUrl': 'https://www.naturalearthdata.com/about/terms-of-use/', 'commercial': True, 'shareAlike': False,
             'attribution': 'Made with Natural Earth', 'files': ['ne-land.json', 'ne-rivers.json'], 'notes': 'Modern coastline and modern river courses. Rivers and coasts have moved since antiquity; ancient coastlines come from AWMC.',
             'retrieved': today, 'counts': stats.get('naturalearth')},
        ],
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(m, fh, ensure_ascii=False, indent=1)
    log('  wrote manifest.json')


def main():
    only = set(sys.argv[1:])
    stats = {}
    old = {}
    mpath = os.path.join(OUT, 'manifest.json')
    if os.path.exists(mpath):
        old = {d['id']: d.get('counts') for d in json.load(open(mpath))['datasets']}
    steps = [('pleiades', pleiades), ('gazetteer', gazetteer), ('awmc', awmc), ('cliopatria', cliopatria), ('polities', polity_names), ('aliases', polity_aliases),
             ('wikidata', wikidata_events), ('naturalearth', natural_earth)]
    for key, fn in steps:
        stats[key] = fn() if not only or key in only else old.get(key)
    if not only or 'world' in only:
        import world
        world.build_world()
    # The manifest keeps counts per dataset; extra steps fold into their dataset.
    stats['pleiades'] = {**(stats.get('pleiades') or {}), 'gazetteer': stats.pop('gazetteer', None)}
    stats['cliopatria'] = {**(stats.get('cliopatria') or {}), 'names': stats.pop('polities', None), 'aliases': stats.pop('aliases', None)}
    manifest(stats)


if __name__ == '__main__':
    main()
