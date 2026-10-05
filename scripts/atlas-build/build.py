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
Needs:  python3 -m pip install -r scripts/atlas-build/requirements.txt  (pinned versions)
"""
from __future__ import annotations

import dates
import events
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

import inputs
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
    'hydrorivers': 'https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_eu_shp.zip',
    'osm_land': 'https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip',
    'hydrolakes': 'https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip',
    'ne_regions': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson',
    'osm_water': 'https://osmdata.openstreetmap.de/download/simplified-water-polygons-split-3857.zip',
    'polders': 'https://nominatim.openstreetmap.org/lookup?osm_ids=W975309515,W975311593,R302126,R1354537,W171875325,R13108203,R47436,R408114,R409806,R409828,R409764&format=geojson&polygon_geojson=1&polygon_threshold=0.0002',
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
    """The file at a source URL: the raw vault's copy when the vault manifest records that URL (checksummed, and the
    one the manifest describes), else a download kept in the cache. Return the local path."""
    vault = inputs.vault_copy(url)
    if vault:
        inputs.fetched(key, url, vault)
        return vault
    os.makedirs(CACHE, exist_ok=True)
    name = key + os.path.splitext(urllib.parse.urlparse(url).path)[1]
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        log('  downloading', url)
        req = urllib.request.Request(urllib.parse.quote(url, safe=':/?=&%'), headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(path + '.part', path)
    inputs.fetched(key, url, path)
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
    """'-0217-01-01T00:00:00Z' → -218 (Wikidata stores 218 BCE as -0217 astronomically). The shared reader in dates.py."""
    return dates.wd_year(v)


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
    # Read as events: kind by name, scope to 1945, duplicates merged, dates outside their war marked (events.py).
    out = list(feats.values())
    cleaned = events.clean_events(out, list(wars.values()))
    log(f'  {cleaned}')
    write('wikidata-events.json', fc(out))
    with open(os.path.join(OUT, 'wikidata-wars.json'), 'w', encoding='utf-8') as fh:
        json.dump(sorted(wars.values(), key=lambda w: (w['f'] if w['f'] is not None else 9999)), fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  wrote wikidata-wars.json: {len(wars)} wars')
    return {'events': len(out), 'wars': len(wars), **cleaned}


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
        inputs.fetched('cliopatria-classes.json', 'Wikidata answers (polity classes), kept since the date given', cls_path)
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


# ── HydroRIVERS: the modern river network for the base map, with a hierarchy ──
# A river appears from the zoom its upstream area warrants (Danube and Rhine first, tributaries later). The lines
# come from a 15-arc-second DEM (about 500 m), so they are used only up to zoom 8; closer in, the map draws the
# exact, named OpenStreetMap rivers instead (see docs/BASE_MAP.md).
RIVER_ZOOMS = ((50000, 3), (20000, 4), (5000, 5), (1500, 6), (500, 7), (150, 8))
EUROPE_BOX = (-25, 34, 45, 72)


def river_minzoom(upstream_km2):
    """The first zoom at which a river with this upstream area is drawn, or None if it is too small."""
    return next((z for t, z in RIVER_ZOOMS if (upstream_km2 or 0) >= t), None)


def chaikin(coords, rounds=2):
    """Round off the stair-steps a raster-derived line has; the ends stay where they are, so segments still meet."""
    for _ in range(rounds):
        if len(coords) < 3:
            return coords
        out = [coords[0]]
        for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
            out += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1), (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        out.append(coords[-1])
        coords = out
    return coords


def hydrorivers():
    import shapefile  # pyshp
    import zipfile
    import tiler
    log('HydroRIVERS (Europe)')
    z = zipfile.ZipFile(fetch('hydrorivers', SOURCES['hydrorivers']))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'))
    w, s_, e, n = EUROPE_BOX
    feats = []
    for rec, shp in zip(r.iterRecords(fields=['HYRIV_ID', 'UPLAND_SKM', 'DIS_AV_CMS']), r.iterShapes()):
        x0, y0, x1, y1 = shp.bbox
        if x1 < w or x0 > e or y1 < s_ or y0 > n:
            continue
        mz = river_minzoom(rec['UPLAND_SKM'])
        if mz is None:
            continue
        q = rec['DIS_AV_CMS'] or 0
        coords = [(round(x, 5), round(y, 5)) for x, y in chaikin([tuple(p) for p in shp.points])]
        feats.append(({'type': 'LineString', 'coordinates': coords}, {'i': rec['HYRIV_ID'], 'q': round(q) if q >= 10 else round(q, 1)}, mz))
    out = os.path.join(OUT, '..', 'world', 'tiles', 'hydrorivers.pmtiles')
    stats = tiler.build(out, 'rivers', feats, 8, 'HydroRIVERS (Europe)', 'HydroRIVERS v1.0, Lehner & Grill 2013 (CC BY 4.0)', min_zoom=3)
    stats = {'segments': stats['features'], 'tiles': stats['tiles'], 'rejected': stats['rejected']}
    log('  ', stats)
    return stats


# ── Coast for when the detailed map tiles can't load: OpenStreetMap land, simplified, for Europe ──
LAND_BOX = (-30, 25, 65, 75)


def osm_land():
    return _osm_polygons('osm_land', 'land', 'osm-land.pmtiles', 'OSM land (Europe)')


def osm_water():
    return _osm_polygons('osm_water', 'water', 'osm-water.pmtiles', 'OSM sea (Europe)')


def _osm_polygons(key, layer, file, title):
    import math
    import shapefile  # pyshp
    import zipfile
    import tiler
    from shapely.geometry import box, mapping, shape
    from shapely.ops import transform
    log(title, '(for the offline coast)')
    z = zipfile.ZipFile(fetch(key, SOURCES[key]))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'))
    R = 6378137.0
    to_lonlat = lambda x, y, zz=None: (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))
    clip = box(*LAND_BOX)
    feats = []
    for shp in r.iterShapes():
        x0, y0, x1, y1 = shp.bbox
        lo0, la0 = to_lonlat(x0, y0)
        lo1, la1 = to_lonlat(x1, y1)
        if lo1 < LAND_BOX[0] or lo0 > LAND_BOX[2] or la1 < LAND_BOX[1] or la0 > LAND_BOX[3]:
            continue
        g = transform(to_lonlat, shape(shp.__geo_interface__)).intersection(clip)
        if g.is_empty:
            continue
        # Small islands appear as the map zooms in (area in square degrees, roughly: 0.5 ≈ 3,000 km² in Europe). The sea
        # comes split into grid cells, so every piece is kept at every zoom (dropping small ones would leave holes).
        a = g.area
        mz = 0 if layer == 'water' or a > 0.5 else 3 if a > 0.02 else 5 if a > 0.001 else 7
        feats.append((mapping(g), {}, mz))
    out = os.path.join(OUT, '..', 'world', 'tiles', file)
    stats = tiler.build(out, layer, feats, 8, title, '© OpenStreetMap contributors (ODbL), osmdata.openstreetmap.de')
    stats = {'polygons': stats['features'], 'tiles': stats['tiles'], 'rejected': stats['rejected']}
    log('  ', stats)
    return stats


# ── Water that was land: reservoirs, land before their dams ──────────────────
# HydroLAKES marks reservoirs (Lake_type 2). The year comes from Wikidata: the earliest inception / opening / service
# date of a dam or reservoir item within 3 km of the reservoir's outlet or inside it. Reservoirs with no such date are
# almost all 19th–20th-century dams; they are drawn as land before 1800 and marked as assumed.
RESERVOIR_DATE_KM = 3
UNDATED_RESERVOIR_YEAR = 1800
WD_RESERVOIRS = '''SELECT ?i ?l ?coord (MIN(YEAR(?d)) AS ?y) WHERE {
  VALUES ?cls { wd:Q131681 wd:Q12323 wd:Q1244922 }
  ?i wdt:P31 ?cls ; wdt:P625 ?coord .
  { ?i wdt:P571 ?d } UNION { ?i wdt:P1619 ?d } UNION { ?i wdt:P729 ?d }
  ?i rdfs:label ?l . FILTER(LANG(?l) = "en")
  FILTER(geof:latitude(?coord) > 34 && geof:latitude(?coord) < 72 && geof:longitude(?coord) > -25 && geof:longitude(?coord) < 60)
} GROUP BY ?i ?l ?coord'''


def reservoir_year(lake, outlet, dated):
    """(year, Wikidata item) of the earliest dated dam/reservoir inside the lake or within RESERVOIR_DATE_KM of its
    outlet, or None. lake: shapely polygon (lon/lat); outlet: (lon, lat); dated: [(lon, lat, year, qid)]."""
    import math
    from shapely.geometry import Point
    best = None
    k = math.cos(math.radians(outlet[1]))
    for lon, lat, y, q in dated:
        near = math.hypot((lon - outlet[0]) * k, lat - outlet[1]) * 111.2 <= RESERVOIR_DATE_KM
        if (near or lake.contains(Point(lon, lat))) and (best is None or y < best[0]):
            best = (y, q)
    return best


def reservoirs():
    import shapefile  # pyshp
    import zipfile
    import tiler
    from shapely.geometry import mapping, shape
    from shapely.strtree import STRtree
    from shapely.geometry import Point
    log('Reservoirs (HydroLAKES + Wikidata dates)')
    cache = os.path.join(CACHE, 'wd-reservoirs.json')
    if not os.path.exists(cache):
        json.dump(sparql(WD_RESERVOIRS), open(cache, 'w'))
    inputs.fetched('wd-reservoirs.json', 'Wikidata query (dam dates), answer kept since the date given', cache)
    dated = []
    for b in json.load(open(cache)):
        y = int(b['y']['value']) if b.get('y') else None
        if y is None or y < -1000 or y > 2030 or y == 0:
            continue
        lon, lat = (float(v) for v in b['coord']['value'].removeprefix('Point(').rstrip(')').split())
        dated.append((lon, lat, y, b['i']['value'].rsplit('/', 1)[-1]))
    pts = [Point(d[0], d[1]) for d in dated]
    tree = STRtree(pts)
    z = zipfile.ZipFile(fetch('hydrolakes', SOURCES['hydrolakes']))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'), encoding='cp1252', encodingErrors='replace')
    feats, n_dated = [], 0
    for i, rec in enumerate(r.iterRecords(fields=['Hylak_id', 'Lake_name', 'Lake_type', 'Lake_area', 'Pour_long', 'Pour_lat'])):
        if rec['Lake_type'] != 2 or not (-25 < rec['Pour_long'] < 60 and 34 < rec['Pour_lat'] < 72):
            continue
        lake = shape(r.shape(i).__geo_interface__)
        near = [dated[j] for j in tree.query(lake.buffer(0.05))]
        hit = reservoir_year(lake, (rec['Pour_long'], rec['Pour_lat']), near)
        props = {'i': rec['Hylak_id'], 'k': 'became-water'}
        if rec['Lake_name'].strip():
            props['n'] = rec['Lake_name'].strip()
        if hit:
            props['y'], props['q'] = hit
            n_dated += 1
        else:
            props['y'], props['u'] = UNDATED_RESERVOIR_YEAR, 1
        a = rec['Lake_area']
        mz = 3 if a >= 100 else 5 if a >= 10 else 7 if a >= 1 else 9
        feats.append((mapping(lake.simplify(0.0003)), props, mz))
    out = os.path.join(OUT, '..', 'world', 'tiles', 'reservoirs.pmtiles')
    stats = tiler.build(out, 'reservoirs', feats, 10, 'Reservoirs (Europe)', 'HydroLAKES v1.0 (CC BY 4.0); dates from Wikidata (CC0)')
    stats = {'reservoirs': stats['features'], 'dated': n_dated, 'tiles': stats['tiles'], 'rejected': stats['rejected']}
    log('  ', stats)
    return stats


# ── Physical names: mountain ranges and plains (Natural Earth), peaks by prominence (Wikidata) ──
LABEL_BOX = (-30, 25, 70, 78)
REGION_CLASSES = {'Range/mtn': 'range', 'Plateau': 'plateau', 'Plain': 'plain', 'Lowland': 'plain', 'Basin': 'plain', 'Delta': 'delta',
                  'Peninsula': 'peninsula', 'Valley': 'valley', 'Foothills': 'range', 'Depression': 'plain', 'Desert': 'desert', 'Wetlands': 'wetland'}
WD_PEAKS = '''SELECT ?i ?l ?coord (MAX(?p) AS ?prom) (MAX(?e) AS ?ele) WHERE {
  ?i wdt:P2660 ?p ; wdt:P625 ?coord . FILTER(?p >= 300)
  OPTIONAL { ?i wdt:P2044 ?e }
  ?i rdfs:label ?l . FILTER(LANG(?l) = "en")
  FILTER(geof:latitude(?coord) > 34 && geof:latitude(?coord) < 72 && geof:longitude(?coord) > -25 && geof:longitude(?coord) < 60)
} GROUP BY ?i ?l ?coord'''


def peak_minzoom(prominence):
    """Zoom from which a peak is named: the more it stands out from its surroundings, the earlier."""
    return 7 if prominence >= 2000 else 8 if prominence >= 1000 else 9 if prominence >= 600 else 10


def physical_labels():
    from shapely.geometry import shape
    from shapely.ops import polylabel
    log('Physical names (Natural Earth regions, Wikidata peaks)')
    out = []
    for f in json.load(open(fetch('ne_regions', SOURCES['ne_regions']), encoding='utf-8'))['features']:
        p = f['properties']
        c = REGION_CLASSES.get(p.get('FEATURECLA'))
        if not c:
            continue
        g = shape(f['geometry'])
        g = max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g
        pt = polylabel(g, tolerance=0.05)
        if not (LABEL_BOX[0] <= pt.x <= LABEL_BOX[2] and LABEL_BOX[1] <= pt.y <= LABEL_BOX[3]):
            continue
        out.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(pt.x, 3), round(pt.y, 3)]},
                    'properties': {'k': c, 'n': p.get('NAME_EN') or p['NAME'], 'z': max(3, int(p.get('MIN_LABEL') or 5)), 'src': 'Natural Earth ' + str(p.get('WIKIDATAID') or '')}})
    cache = os.path.join(CACHE, 'wd-peaks.json')
    if not os.path.exists(cache):
        json.dump(sparql(WD_PEAKS), open(cache, 'w'))
    inputs.fetched('wd-peaks.json', 'Wikidata query (peaks), answer kept since the date given', cache)
    peaks = 0
    for b in json.load(open(cache)):
        lon, lat = (float(v) for v in b['coord']['value'].removeprefix('Point(').rstrip(')').split())
        prom = float(b['prom']['value'])
        props = {'k': 'peak', 'n': b['l']['value'], 'p': round(prom), 'z': peak_minzoom(prom), 'q': b['i']['value'].rsplit('/', 1)[-1]}
        if b.get('ele'):
            props['e'] = round(float(b['ele']['value']))
        out.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 4), round(lat, 4)]}, 'properties': props})
        peaks += 1
    write('physical-labels.json', fc(out))
    return {'regions': len(out) - peaks, 'peaks': peaks}


# ── Land that was water: polders drawn as water in the years they were water ──
# OSM outlines (polders, or the municipalities that are the polder). Years: f = from when the water had about this
# extent (approximate), y = the year it fell dry (from then on it is land). Outside f..y the map shows today's land.
POLDERS = {
    'way/975309515': ('Beemster (lake)', 1500, 1612, 'Drained 1608–1612. Before c. 1500 the lake was smaller (peat erosion).'),
    'way/975311593': ('Schermer (lake)', 1500, 1635, 'Drained 1633–1635. Before c. 1500 the lake was smaller.'),
    'relation/302126': ('Purmer (lake)', 1500, 1622, 'Drained 1618–1622 (outline: the Purmer localities of Edam-Volendam and Waterland; the part inside Purmerend is not included).'),
    'relation/1354537': ('Purmer (lake)', 1500, 1622, 'Drained 1618–1622.'),
    'way/171875325': ('Venetian lagoon (Tronchetto)', 500, 1960, 'Tronchetto is an artificial island, made from the late 1950s; the year is approximate.'),
    'relation/13108203': ('Haarlemmermeer', 1650, 1852, 'Drained 1849–1852. The lake grew from several smaller lakes; it had roughly this size from the 17th century.'),
    'relation/47436': ('Zuiderzee (Noordoostpolder)', 1250, 1942, 'Fell dry 1942. The Zuiderzee formed in the 12th–13th centuries; the islands of Urk and Schokland are not separated out.'),
    'relation/408114': ('Zuiderzee (Oostelijk Flevoland)', 1250, 1957, 'Fell dry 1957 (outline: Dronten municipality).'),
    'relation/409806': ('Zuiderzee (Oostelijk Flevoland)', 1250, 1957, 'Fell dry 1957 (outline: Lelystad municipality, partly in Zuidelijk Flevoland, dry 1968).'),
    'relation/409828': ('Zuiderzee (Zuidelijk Flevoland)', 1250, 1968, 'Fell dry 1968 (outline: Zeewolde municipality).'),
    'relation/409764': ('Zuiderzee (Zuidelijk Flevoland)', 1250, 1968, 'Fell dry 1968 (outline: Almere municipality).'),
}


def physical_change():
    log('Land that was water (polders)')
    d = json.load(open(fetch('polders', SOURCES['polders']), encoding='utf-8'))
    out = []
    for f in d['features']:
        key = f"{f['properties']['osm_type']}/{f['properties']['osm_id']}"
        if key not in POLDERS:
            continue
        name, start, dry, note = POLDERS[key]
        g = simplify(f['geometry'], 0.0002, 5)
        if g:
            out.append({'type': 'Feature', 'geometry': g, 'properties': {'k': 'became-land', 'n': name, 'f': start, 'y': dry, 'b': note, 'src': 'OpenStreetMap ' + key, 'u': 1}})
    missing = sorted(set(POLDERS) - {f"{x['properties']['osm_type']}/{x['properties']['osm_id']}" for x in d['features']})
    if missing:
        raise SystemExit(f'polder outlines missing from the download: {missing}')
    write('physical-change.json', fc(out))
    return {'features': len(out)}


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
    # Written by the pleiades step: without it every undated Pleiades place would silently lose its evidence period.
    if not os.path.exists(env_path):
        raise SystemExit('pleiades-envelopes.json is missing: run the "pleiades" step first (python3 scripts/atlas-build/build.py pleiades gazetteer)')
    envelopes = json.load(open(env_path))
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
    if os.path.exists(cache_path):
        inputs.fetched('cliopatria-aliases.json', 'Wikidata answers (polity aliases), kept since the date given', cache_path)
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
    shared = polity_shared_ids(rows)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  {n_al} polities with aliases, {n_dm} with demonyms; {shared} hold a Wikidata id shared with another polity')
    return {'aliases': n_al, 'demonyms': n_dm}


def normalize_name(x):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z ]', ' ', x.lower().strip('()'))).strip()


def polity_common_names():
    """The everyday English name to show for a polity ('cn'), when its Cliopatria name is a formal title.

    Two rules, both checked against the data, never applied blindly:
      1. Cliopatria's own Wikipedia title for the polity, when it is a plain name the formal title
         contains ("Federated Republic of Germany" → Germany, "Old Kingdom of Norway" → Norway).
      2. For modern regimes (from 1800), the country Wikidata records for them (P17), only when the
         formal title itself refers to that country — shares a word stem with the country's name, an
         alias or its demonym ("Third Hellenic Republic" → Greece via Hellas; "French Second Republic"
         → France). Earlier polities are never renamed after a modern country (the Roman Republic is
         not "Italy", the Frankish kingdom not "France").
    The formal name stays in 'n' and is shown in the details.
    """
    log('Cliopatria: common names')
    z = zipfile.ZipFile(fetch('cliopatria', SOURCES['cliopatria']))
    d = json.load(z.open(next(n for n in z.namelist() if n.endswith('.geojson'))))
    wiki = {}
    for f in d['features']:
        p = f['properties']
        if p.get('Type') == 'POLITY' and p.get('Wikipedia'):
            wiki.setdefault(p['Name'], p['Wikipedia'])
    path = os.path.join(OUT, 'cliopatria', 'names.json')
    rows = json.load(open(path, encoding='utf-8'))
    norm = lambda x: re.sub(r'[^a-z ]', ' ', x.lower()).split()
    # Country records for modern regimes (QLever's copy of Wikidata; cached).
    cache_path = os.path.join(CACHE, 'cliopatria-countries.json')
    countries = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    if os.path.exists(cache_path):
        inputs.fetched('cliopatria-countries.json', 'Wikidata answers (countries), kept since the date given', cache_path)
    todo = sorted({r['q'] for r in rows if r.get('q') and r['t'] >= 1800} - set(countries))
    for i in range(0, len(todo), 150):
        chunk = todo[i:i + 150]
        query = ('PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> '
                 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX skos: <http://www.w3.org/2004/02/skos/core#> '
                 f'SELECT ?p ?cl ?al ?dm WHERE {{ VALUES ?p {{ {" ".join("wd:" + q for q in chunk)} }} ?p wdt:P17 ?c . '
                 '?c rdfs:label ?cl FILTER(LANG(?cl) = "en") OPTIONAL { ?c skos:altLabel ?al FILTER(LANG(?al) = "en") } '
                 'OPTIONAL { ?c wdt:P1549 ?dm FILTER(LANG(?dm) = "en") } }')
        res = None
        for attempt in range(5):
            try:
                req = urllib.request.Request('https://qlever.dev/api/wikidata', data=urllib.parse.urlencode({'query': query}).encode(),
                                             headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'})
                with urllib.request.urlopen(req, timeout=180) as r:
                    res = json.load(r)['results']['bindings']
                break
            except Exception as e:  # noqa: BLE001 — wait and retry
                log('   countries:', str(e)[:60], '— retrying')
                time.sleep(30 * (attempt + 1))
        if res is None:
            log('   countries unavailable; rule 2 applies only to what is cached')
            break
        got = {q: {'c': [], 'w': []} for q in chunk}
        for r in res:
            q = r['p']['value'].rsplit('/', 1)[1]
            got[q]['c'].append(r['cl']['value'])
            got[q]['w'] += [r[k]['value'] for k in ('cl', 'al', 'dm') if k in r]
        for q, v in got.items():
            countries[q] = {'c': sorted(set(v['c'])), 'w': sorted(set(v['w']))}
        json.dump(countries, open(cache_path, 'w'))
    common = {}
    taken = {normalize_name(r['n']) for r in rows}
    for r in rows:
        n = r['n']
        if n.startswith('('):
            continue
        w = re.sub(r'\s*\([^)]*\)\s*$', '', wiki.get(n, '')).strip()  # drop Wikipedia disambiguation "(1798–1799)"
        words = norm(n)
        if w and w != n and norm(w) and ' '.join(norm(w)) in ' '.join(words) and len(w) < len(n):
            common[n] = w
            continue
        # Rule 2 applies only to a regime title of the country itself: ordinals + ONE country adjective +
        # a form word ("Third Hellenic Republic", "Second Spanish Republic", "Greek junta"), and only when
        # the country's own name is a plain name (no form words). Colonies, factions, parties, renamed
        # countries ("Burma", "Republic of China") are never renamed.
        c = countries.get(r.get('q') or '')
        forms = {'republic', 'empire', 'junta', 'state', 'confederation', 'kingdom'}
        ordinals = {'first', 'second', 'third', 'fourth', 'fifth', 'sixth'}
        rest = [x for x in words if x not in forms and x not in ordinals]
        if (r['f'] >= 1800 and c and len(c['c']) == 1 and any(x in forms for x in words) and len(rest) == 1
                and not set(norm(c['c'][0])) & (forms | {'union', 'reich', 'people', 'peoples', 'socialist', 'federal', 'united', 'colonial', 'of'})):
            stems = {x[:4] for x in norm(' '.join(c['w'])) if len(x) >= 4}
            if len(rest[0]) >= 4 and rest[0][:4] in stems:
                common[n] = c['c'][0]
    # A common name that is another polity's own name would confuse them ("Revolutionary Roman Republic"
    # of 1799 is not shown as "Roman Republic"); several regimes of one country may share one ("France").
    common = {n: c for n, c in common.items() if normalize_name(c) == normalize_name(n) or normalize_name(c) not in taken}
    for r in rows:
        r.pop('cn', None)  # recomputed from scratch every time
        if r['n'] in common:
            r['cn'] = common[r['n']]
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    # The map labels come from the time slices: add the common name there too.
    folder = os.path.join(OUT, 'cliopatria')
    for fn in sorted(os.listdir(folder)):
        if not re.match(r'^-?\d+_-?\d+\.json$', fn):
            continue
        fp = os.path.join(folder, fn)
        fcol = json.load(open(fp, encoding='utf-8'))
        for f in fcol['features']:
            cn = common.get(f['properties']['n'])
            if cn:
                f['properties']['cn'] = cn
            else:
                f['properties'].pop('cn', None)
        with open(fp, 'w', encoding='utf-8') as fh:
            json.dump(fcol, fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  {len(common)} polities get an everyday name')
    return {'commonNames': len(common)}


def polity_spans(folder):
    """Per polity (name, Wikidata id), from the time slices: when it really has an outline and where
    its label sits then. A name's full range can bridge centuries with no outline (the Kingdom of
    Portugal has none 1582–1639; "Kingdom of Italy" covers 587 and 1946), so the pieces are kept:
      's'  — the spans with an outline, when there is more than one (a gap between them);
      'sp' — [from, to, lon, lat]: Cliopatria's own label point for each period, consecutive
             periods at the same point merged — the label follows the polity's home territory
             instead of jumping to its largest outline (Portugal's 1885 outline is Angola);
      x/y  — the label point it holds for the most years.
    """
    by = {}
    for fn in sorted(os.listdir(folder)):
        if not re.match(r'^-?\d+_-?\d+\.json$', fn):
            continue
        for f in json.load(open(os.path.join(folder, fn), encoding='utf-8'))['features']:
            p = f['properties']
            if p.get('op'):
                continue
            k = (p['n'], p.get('q', ''))
            cur = by.setdefault(k, {'n': p['n'], 'f': p['f'], 't': p['t'], **({'q': p['q']} if p.get('q') else {}), **({'c': p['c']} if p.get('c') else {}),
                                    **({'g': 1} if p.get('g') else {}), **({'m': p['m']} if p.get('m') else {}), 'spans': set(), 'labels': {}, 'area': {}})
            if p.get('lbl'):
                x, y = f['geometry']['coordinates'][:2]
                cur['labels'][(p['f'], p['t'])] = (round(x, 2), round(y, 2))
                continue
            cur['f'] = min(cur['f'], p['f'])
            cur['t'] = max(cur['t'], p['t'])
            cur['spans'].add((p['f'], p['t']))
            g = shape(f['geometry'])
            if g.area > cur['area'].get((p['f'], p['t']), (0,))[0]:
                c = g.representative_point()
                cur['area'][(p['f'], p['t'])] = (g.area, round(c.x, 2), round(c.y, 2))
    out = {}
    for k, cur in by.items():
        if not cur['spans']:
            continue
        merged = []
        for f, t in sorted(cur['spans']):
            if merged and f <= merged[-1][1] + 1:
                merged[-1][1] = max(merged[-1][1], t)
            else:
                merged.append([f, t])
        pts = []
        for f, t in sorted(cur['spans']):
            xy = cur['labels'].get((f, t)) or cur['area'][(f, t)][1:]
            if pts and pts[-1][1] + 1 >= f and abs(pts[-1][2] - xy[0]) < 0.3 and abs(pts[-1][3] - xy[1]) < 0.3:
                pts[-1][1] = max(pts[-1][1], t)
            else:
                pts.append([f, t, xy[0], xy[1]])
        best = max(pts, key=lambda e: e[1] - e[0])
        row = {k2: v for k2, v in cur.items() if k2 not in ('spans', 'labels', 'area')}
        row.update(x=best[2], y=best[3])
        if len(merged) > 1:
            row['s'] = merged
        if len(pts) > 1:
            row['sp'] = pts
        out[k] = row
    return out


def polity_shared_ids(rows):
    """A Wikidata id is evidence about a polity, never its key (ID-1, PA-006, A9-007). Cliopatria gives
    some ids to two different polities (Austria-Hungary's to "Hungarian Nationalists", Assyria's to
    Syria, the County of Portugal's to modern Portugal). Wikidata's aliases and demonyms then belong
    only to the polity the id names — the one whose own name is among them, or is the start of one
    ("Holy Roman Empire" in "Holy Roman Empire of the German Nation"); the others keep the id with 'qx'
    (shared, not theirs to be sure of) and get no aliases, demonyms or Wikidata link. When no polity's
    name is among them (the Roman Republic's aliases are Italian), nothing tells them apart and all keep them."""
    norm = lambda x: re.sub(r'^the ', '', normalize_name(x))
    groups = {}
    for r in rows:
        if r.get('q'):
            groups.setdefault(r['q'], []).append(r)
    flagged = 0
    for q, rs in groups.items():
        if len(rs) < 2 or len({normalize_name(r['n']) for r in rs}) == 1:
            continue
        al = sorted({a for r in rs for a in r.get('al', [])})
        dm = sorted({d for r in rs for d in r.get('dm', [])})
        names = {norm(a) for a in al}
        named = lambda x: bool(x) and (norm(x) in names or any((a + ' ').startswith(norm(x) + ' ') for a in names))
        owners = [r for r in rs if named(r['n']) or named(r.get('cn'))]
        for r in rs:
            own = not owners or r in owners
            if own:
                r.pop('qx', None)
                if al:
                    r['al'] = al
                if dm:
                    r['dm'] = dm
            else:
                r.pop('al', None)
                r.pop('dm', None)
                r['qx'] = 1
                flagged += 1
    return flagged


def polity_names():
    """cliopatria/names.json: every polity name once, with its full date range, the periods it
    really has an outline and its label point in each (polity_spans), for historical search."""
    log('Cliopatria names index')
    folder = os.path.join(OUT, 'cliopatria')
    rows = sorted(polity_spans(folder).values(), key=lambda r: (r['f'], r['n']))
    with open(os.path.join(folder, 'names.json'), 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    log(f'  wrote cliopatria/names.json: {len(rows)} polities')
    return {'names': len(rows), 'withGaps': sum(1 for r in rows if r.get('s'))}


def manifest(stats, ran=None):
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
            {'id': 'hydrosheds', 'name': 'HydroRIVERS v1.0 (HydroSHEDS)', 'url': 'https://www.hydrosheds.org/products/hydrorivers', 'license': 'CC BY 4.0',
             'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/', 'commercial': True, 'shareAlike': False,
             'attribution': 'HydroRIVERS v1.0, Lehner & Grill 2013 (CC BY 4.0)', 'files': ['../world/tiles/hydrorivers.pmtiles'],
             'notes': 'Modern river network of Europe with upstream area and discharge, used for the zoomed-out base map (to zoom 8). Lines are derived from a 500 m elevation model; rivers have moved since antiquity.',
             'retrieved': today, 'counts': stats.get('hydrosheds')},
            {'id': 'osm', 'name': 'OpenStreetMap', 'url': 'https://www.openstreetmap.org/copyright', 'license': 'ODbL 1.0',
             'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'commercial': True, 'shareAlike': True,
             'attribution': '© OpenStreetMap contributors (ODbL)', 'files': ['physical-change.json'],
             'notes': 'Outlines of Dutch polders (or the municipalities that are the polder), fetched via Nominatim. The dates of draining and of the lakes’ extent are Shelf’s, from standard histories, and are approximate.',
             'retrieved': today, 'counts': stats.get('osm')},
            {'id': 'osmland', 'name': 'OpenStreetMap land polygons (simplified)', 'url': 'https://osmdata.openstreetmap.de/data/land-polygons.html', 'license': 'ODbL 1.0',
             'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'commercial': True, 'shareAlike': True,
             'attribution': '© OpenStreetMap contributors (ODbL)', 'files': ['../world/tiles/osm-land.pmtiles', '../world/tiles/osm-water.pmtiles'],
             'notes': 'Today’s land and sea of Europe, simplified, to zoom 8. Drawn only when the detailed OpenFreeMap tiles cannot load.',
             'retrieved': today, 'counts': {'land': stats.get('osmland'), 'sea': stats.get('osmwater')}},
            {'id': 'hydrolakes', 'name': 'HydroLAKES v1.0 (HydroSHEDS) reservoirs, dated from Wikidata', 'url': 'https://www.hydrosheds.org/products/hydrolakes', 'license': 'CC BY 4.0',
             'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/', 'commercial': True, 'shareAlike': False,
             'attribution': 'HydroLAKES v1.0, Messager et al. 2016 (CC BY 4.0); dam dates from Wikidata (CC0)', 'files': ['../world/tiles/reservoirs.pmtiles'],
             'notes': 'Reservoirs of Europe, drawn as land before their dam. The year is the earliest inception/opening date of a Wikidata dam or reservoir within 3 km of the outlet; reservoirs with none are drawn as land before 1800 (assumed).',
             'retrieved': today, 'counts': stats.get('hydrolakes')},
            {'id': 'physlabels', 'name': 'Mountain ranges and plains (Natural Earth); peaks (Wikidata)', 'url': 'https://www.naturalearthdata.com/', 'license': 'Public domain / CC0',
             'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/', 'commercial': True, 'shareAlike': False,
             'attribution': 'Made with Natural Earth; peaks from Wikidata (CC0)', 'files': ['physical-labels.json'],
             'notes': 'Today’s names of mountain ranges, plateaus, plains and deltas, and of peaks with a recorded prominence of at least 300 m (named from zoom 7 for 2,000 m to zoom 10 for 300 m).',
             'retrieved': today, 'counts': stats.get('physlabels')},
        ],
    }
    # Each dataset says which input files (URL, checksum) it was built from and when they were downloaded — not the
    # date of the build. A dataset this run did not rebuild keeps what the previous manifest said about it.
    previous = {}
    mpath = os.path.join(OUT, 'manifest.json')
    if os.path.exists(mpath):
        previous = {d['id']: d for d in json.load(open(mpath, encoding='utf-8')).get('datasets', [])}
    for d in m['datasets']:
        keys = sorted(k for k in inputs.FETCHED if any(k.startswith(p) for p in DATASET_INPUTS.get(d['id'], ())))
        old = previous.get(d['id'], {})
        if ran is not None and d['id'] not in ran and old:
            for k in ('retrieved', 'built', 'inputs', 'counts'):
                if k in old:
                    d[k] = old[k]
            continue
        d['built'] = today
        if keys:
            d['inputs'] = {k: inputs.FETCHED[k] for k in keys}
            d['retrieved'] = min(inputs.FETCHED[k]['downloaded'] for k in keys)
        else:
            # Fetched live (a SPARQL query) or not downloaded by this script: no file date to give.
            d['retrieved'] = old.get('retrieved') if old.get('retrieved') and old.get('retrieved') != old.get('built') else None
    m['python'] = sys.version.split()[0]
    m['packages'] = _packages()
    with open(mpath, 'w', encoding='utf-8') as fh:
        json.dump(m, fh, ensure_ascii=False, indent=1)
    log('  wrote manifest.json')


# Which downloads (fetch keys) each published dataset is built from.
DATASET_INPUTS = {'pleiades': ('pleiades_gis',), 'awmc': ('awmc_', 'snap_'), 'cliopatria': ('cliopatria',),
                  'naturalearth': ('ne_land', 'ne_rivers'), 'hydrosheds': ('hydrorivers',), 'osm': ('polders',),
                  'osmland': ('osm_land', 'osm_water'), 'hydrolakes': ('hydrolakes', 'wd-reservoirs'), 'physlabels': ('ne_regions', 'wd-peaks')}


def _packages():
    """The installed versions of the build's Python packages (pinned in requirements.txt)."""
    import importlib.metadata as md
    out = {}
    for line in open(os.path.join(HERE, 'requirements.txt'), encoding='utf-8'):
        name = line.split('#')[0].split('==')[0].strip()
        if name:
            try:
                out[name] = md.version(name)
            except md.PackageNotFoundError:
                out[name] = None
    return out


def main():
    args = sys.argv[1:]
    flags = {a for a in args if a.startswith('--')}
    only = {a for a in args if not a.startswith('--')}
    # The raw vault must be what the manifest records before anything is built from it (changed, missing or
    # unrecorded files are listed); --accept-changed-inputs builds anyway, after you have recorded why.
    problems = inputs.verify_vault() if (not only or only & {'world'}) else []
    if problems:
        for p in problems:
            log(f"  !! {p['path']}: {p['problem']}")
        if '--accept-changed-inputs' not in flags:
            log(f'{len(problems)} problem(s) in data/historical/raw. Record new files with scripts/historical-data/record_vault.py, '
                'restore changed ones, or run with --accept-changed-inputs.')
            sys.exit(2)
    stats = {}
    old = {}
    mpath = os.path.join(OUT, 'manifest.json')
    if os.path.exists(mpath):
        old = {d['id']: d.get('counts') for d in json.load(open(mpath))['datasets']}
    steps = [('pleiades', pleiades), ('gazetteer', gazetteer), ('awmc', awmc), ('cliopatria', cliopatria), ('polities', polity_names), ('aliases', polity_aliases), ('common', polity_common_names),
             ('wikidata', wikidata_events), ('naturalearth', natural_earth), ('hydrosheds', hydrorivers), ('osm', physical_change), ('osmland', osm_land), ('osmwater', osm_water), ('hydrolakes', reservoirs), ('physlabels', physical_labels)]
    ran = set()
    for key, fn in steps:
        if not only or key in only:
            stats[key] = fn()
            ran.add(key)
        else:
            stats[key] = old.get(key)
    if not only or 'world' in only:
        import world
        world.build_world()
    # The manifest keeps counts per dataset; extra steps fold into their dataset.
    stats['pleiades'] = {**(stats.get('pleiades') or {}), 'gazetteer': stats.pop('gazetteer', None)}
    stats['cliopatria'] = {**(stats.get('cliopatria') or {}), 'names': stats.pop('polities', None), 'aliases': stats.pop('aliases', None), 'commonNames': stats.pop('common', None)}
    if ran & {'gazetteer'}:
        ran.add('pleiades')
    if ran & {'polities', 'aliases', 'common'}:
        ran.add('cliopatria')
    if 'osmwater' in ran:
        ran.add('osmland')
    manifest(stats, None if not only else ran)
    sys.exit(inputs.finish(allow_missing='--allow-missing' in flags))


if __name__ == '__main__':
    main()
