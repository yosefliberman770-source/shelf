"""
Regional specialist datasets added in the second audit pass, read from
data/historical/raw (never modified). Each keeps its own identifiers, its own date
semantics and its own names; nothing is merged without a stated rule.

Published (open licences):
  princes-townspeople   Holy Roman Empire towns (Deutsches Städtebuch): first mention, foundation,
                        town charter, market grants, ruling territory per year from 1300 (CC0)
  merimee               France: protected monuments (Mérimée) — castles, religious buildings, bridges,
                        market halls — dated by the century of their main building campaign (Licence Ouverte 2.0)
  finland-heritage      Finland: archaeological sites the register classes as medieval (CC BY 4.0)
  western-bohemia       dated historical name forms of West Bohemian places to 1500 (CC BY 4.0)
  medieval-bridges      England: bridges and fords attested to c. 1250 (CC BY 4.0)

Local builds only (licence not verified — kept out of the public repository):
  tib-maps-of-power     Byzantine / Balkan places of the TIB "Maps of Power" database (ÖAW)
  markets-fairs         England & Wales markets and fairs to 1516 (Letters)

Everything is returned to sites.py, which writes the tiles and place-index rows.
"""
from __future__ import annotations

import csv
import glob
import io
import json
import os
import re
import sqlite3
import zipfile
from collections import Counter, defaultdict

from pyproj import Transformer
from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', '..', 'data', 'historical', 'raw')
csv.field_size_limit(10 ** 9)


def _tab(path):
    return csv.DictReader(open(path, encoding='utf-8', errors='replace'), delimiter='\t')


def _num(v):
    try:
        return int(float(v)) if v not in (None, '', 'NA') else None
    except ValueError:
        return None


# ── Holy Roman Empire: Princes and Townspeople ────────────────────────────

PT = os.path.join(RAW, 'princes-townspeople', 'original')
MARKET_TYPE = {1: 'yearly fair', 2: 'weekly market', 3: 'livestock market', 4: 'merchants’ market', 5: 'wine market', 6: 'trade fair',
               7: 'specific market', 8: 'market', 9: 'yearly fair and livestock market', 10: 'merchants’ and livestock market'}
RANGE_YEARS = {0: 0, 1: 5, 2: 25, 3: 50, 4: 100}


def princes_townspeople():
    """Towns of the Deutsches Städtebuch with their dated history. Returns a list of dicts."""
    if not os.path.exists(os.path.join(PT, 'city_locations.tab')):
        return []
    towns = {}
    for r in _tab(os.path.join(PT, 'city_locations.tab')):
        try:
            lat, lon = float(r['latitude']), float(r['longitude'])
        except ValueError:
            continue
        towns[r['city_id']] = {'id': r['city_id'], 'name': r['name'].strip('"'), 'alt': r['name_alt'].strip('"'), 'foreign': r['name_foreign'].strip('"'),
                               'nat': r['nat'].strip('"'), 'lon': round(lon, 5), 'lat': round(lat, 5), 'events': [], 'markets': [], 'rule': []}
    # Town charters and first mentions (towncharter.tab; codes from its documentation).
    for r in _tab(os.path.join(PT, 'towncharter.tab')):
        t = towns.get(r['city_id'])
        y = _num(r['time_point'])
        if not t or y is None:
            continue
        origin, cat = _num(r['type_origin']), _num(r['type_category'])
        t['events'].append({'y': y, 'origin': origin, 'cat': cat, 'unc': _num(r['uncertainty']) or 0, 'range': RANGE_YEARS.get(_num(r['range']) or 0, None),
                            'legal': r['legal_family'].strip('"') or None, 'note': r['comment'].strip('"')[:160]})
    for r in _tab(os.path.join(PT, 'markets.tab')):
        t = towns.get(r['city_id'])
        y, ty = _num(r['time_point']), _num(r['type_market'])
        if t and y is not None and ty in MARKET_TYPE:
            t['markets'].append([y, MARKET_TYPE[ty]])
    # Ruling territory per year (cities_polities.tab, from 1300) → spans. Names from territory_codes.tab.
    names = {r['terr_id'].strip('"'): r['terr_name'].strip('"') for r in _tab(os.path.join(PT, 'territory_codes.tab'))}
    spans = defaultdict(list)
    for r in _tab(os.path.join(PT, 'cities_polities.tab')):
        cid, y = r['city_id'], _num(r['year'])
        terr = r['terr_id'].strip('"')
        if y is None or not terr or y > 1806:
            continue
        s = spans[cid]
        if s and s[-1][0] == terr and s[-1][2] == y - 1:
            s[-1][2] = y
        else:
            s.append([terr, y, y])
    for cid, s in spans.items():
        if cid in towns:
            towns[cid]['rule'] = [[names.get(terr, terr), a, b] for terr, a, b in s]
    out = []
    for t in towns.values():
        ev = t['events']
        mention = min((e['y'] for e in ev if e['origin'] == 5), default=None)
        founded = min((e['y'] for e in ev if e['cat'] == 0), default=None)
        charter = min((e['y'] for e in ev if e['origin'] == 1), default=None)
        character = min((e['y'] for e in ev if e['origin'] == 0), default=None)
        legal = next((e['legal'] for e in sorted(ev, key=lambda e: e['y']) if e['origin'] == 1 and e['legal']), None)
        grants = sorted(m for m in t['markets'])
        t.update(mention=mention, founded=founded, charter=charter, character=character, legal=legal, firstMarket=grants[0] if grants else None)
        out.append(t)
    return out


# ── France: Mérimée protected monuments ───────────────────────────────────

MERIMEE = os.path.join(RAW, 'merimee', 'original', 'merimee.csv')
MERIMEE_KIND = [
    (r'château fort|maison forte|donjon|motte|édifice fortifié|fortification|enceinte|porte de ville|rempart|tour', 'castle'),
    (r'\bchâteau\b', 'castle'),
    (r'abbaye|prieuré|couvent|monastère|chartreuse|commanderie|collégiale', 'monastery'),
    (r'cathédrale', 'cathedral'),
    (r'église|chapelle|baptistère', 'church'),
    (r'\bhalle\b', 'market'),
    (r'\bpont\b', 'bridge'),
]
ROMAN = {'1er': 1, '1ère': 1, '2e': 2, '3e': 3, '4e': 4}


def century_span(text):
    """'12e siècle' → (1100, 1199); '4e quart 15e siècle' → (1475, 1499); '1ère moitié 14e siècle' → (1300, 1349).
    The earliest dated campaign wins (a later rebuilding does not move the building's origin)."""
    best = None
    for part in text.split(';'):
        m = re.search(r'(?:(1er|1ère|2e|3e|4e) (quart|moitié) )?(\d{1,2})e siècle', part)
        if not m:
            continue
        c = int(m.group(3))
        lo, hi = (c - 1) * 100, (c - 1) * 100 + 99
        if m.group(2) == 'quart':
            q = ROMAN[m.group(1)]
            lo, hi = lo + 25 * (q - 1), lo + 25 * q - 1
        elif m.group(2) == 'moitié':
            h = ROMAN[m.group(1)]
            lo, hi = lo + 50 * (h - 1), lo + 50 * h - 1
        if best is None or lo < best[0]:
            best = (lo, hi)
    if best is None and re.search(r'\bMoyen [ÂA]ge\b', text):
        best = (500, 1499)  # "Moyen Age": the register's own period, not a date
    return best


def merimee():
    if not os.path.exists(MERIMEE):
        return []
    r = csv.reader(open(MERIMEE, encoding='utf-8'), delimiter='|')
    h = next(r)
    ix = {k: i for i, k in enumerate(h)}
    g = lambda row, k: row[ix[k]].strip().strip('"')  # noqa: E731
    out = []
    for row in r:
        if len(row) != len(h):
            continue
        den = g(row, 'Denomination_de_l_edifice').lower()
        kind = next((k for pat, k in MERIMEE_KIND if re.search(pat, den)), None)
        if not kind:
            continue
        span = century_span(g(row, 'Siecle_de_la_campagne_principale_de_construction') or g(row, 'Format_abrege_du_siecle_de_construction'))
        if not span or span[0] >= 1500:
            continue  # only buildings whose main campaign is medieval (or earlier)
        ll = g(row, 'coordonnees_au_format_WGS84')
        try:
            lat, lon = (float(x) for x in ll.split(','))
        except ValueError:
            continue
        title = g(row, 'Titre_editorial_de_la_notice') or den
        commune = g(row, 'Commune_forme_editoriale')
        generic = title.split('(')[0].strip().lower() in {'château', 'église', 'chapelle', 'halle', 'pont', 'abbaye', 'prieuré', 'maison forte', 'tour', 'enceinte'}
        out.append({'ref': g(row, 'Reference'), 'kind': kind, 'den': den[:60], 'name': f'{title} ({commune})' if generic and commune else title,
                    'commune': commune, 'lon': round(lon, 5), 'lat': round(lat, 5), 'span': span,
                    'centuries': g(row, 'Siecle_de_la_campagne_principale_de_construction')[:80],
                    'moyenAge': span == (500, 1499)})
    return out


# ── Finland: register of archaeological sites (medieval class) ────────────

FIN_ZIP = os.path.join(RAW, 'finland-heritage', 'original', 'tutkija.zip')
FIN_KIND = [(r'kirkko', 'church'), (r'puolustus', 'fortification'), (r'kylänpaik|asuinpaik|kaupunki', 'settlement'), (r'kulkuväyl|tie', 'road site'),
            (r'hauta', 'burial site'), (r'työ- ja valmistus', 'production site')]


def finland():
    if not os.path.exists(FIN_ZIP):
        return []
    z = zipfile.ZipFile(FIN_ZIP)
    tmp = os.path.join(HERE, '.cache', 'fin_points.gpkg')
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    if not os.path.exists(tmp) or os.path.getmtime(tmp) < os.path.getmtime(FIN_ZIP):
        with open(tmp, 'wb') as fh:
            fh.write(z.read('arkeologiset_kohteet_piste_t.gpkg'))
    tr = Transformer.from_crs('EPSG:3067', 'EPSG:4326', always_xy=True)
    c = sqlite3.connect(tmp)
    out = []
    for fid, tunnus, name, kunta, tyyppi, alatyyppi, ajoitus, url, x, y in c.execute(
            "select fid, mjtunnus, kohdenimi, kunta, tyyppi, alatyyppi, ajoitus, url, x, y from arkeologiset_kohteet_piste_t where ajoitus like '%keskiaika%'"):
        if x is None or y is None:
            continue
        lon, lat = tr.transform(x, y)
        t = f'{tyyppi or ""} {alatyyppi or ""}'.lower()
        kind = next((k for pat, k in FIN_KIND if re.search(pat, t)), 'site')
        out.append({'id': str(tunnus or fid), 'name': name or f'{alatyyppi or tyyppi} ({kunta})', 'kunta': kunta, 'kind': kind, 'type': t.strip()[:60],
                    'period': ajoitus, 'onlyMedieval': ajoitus.strip() == 'keskiaikainen', 'url': url, 'lon': round(lon, 5), 'lat': round(lat, 5)})
    return out


# ── West Bohemia: dated name forms ────────────────────────────────────────

WB = os.path.join(RAW, 'western-bohemia-toponyms', 'original', 'DATASET_Western_Bohemia_place_names.csv')


def western_bohemia():
    if not os.path.exists(WB):
        return []
    out = []
    for r in csv.DictReader(open(WB, encoding='utf-8-sig'), delimiter=';'):
        try:
            lat, lon = float(r['YY']), float(r['XX'])
        except (ValueError, KeyError):
            continue
        y1 = _num(r.get('Year1'))
        out.append({'id': r.get('ID') or r.get('FID'), 'name': r['Name'].strip(), 'de': (r.get('Name2') or '').strip(), 'type': r.get('Type', '').strip(),
                    'first': y1, 'src': (r.get('Source1') or '').strip()[:80], 'form': (r.get('Orig_form_MC') or '').strip(),
                    'lon': round(lon, 5), 'lat': round(lat, 5)})
    return out


# ── England: bridges to c. 1250 ──────────────────────────────────────────

BRIDGES = os.path.join(RAW, 'medieval-bridges', 'original', 'gis', 'Bridges1250.csv')


def bridges():
    if not os.path.exists(BRIDGES):
        return []
    tr = Transformer.from_crs('EPSG:27700', 'EPSG:4326', always_xy=True)
    out = []
    for i, r in enumerate(csv.DictReader(open(BRIDGES, encoding='utf-8', errors='replace'))):
        try:
            lon, lat = tr.transform(float(r['Easting']), float(r['Northing']))
        except (ValueError, KeyError):
            continue
        out.append({'id': str(i + 1), 'name': r['Location'].strip(), 'river': r.get('River', '').strip(), 'first': _num(r.get('Attested')),
                    'form': (r.get('Place_name') or '').strip()[:80], 'uncertain': r['Location'].startswith('?'), 'lon': round(lon, 5), 'lat': round(lat, 5)})
    return out


# ── Local only: TIB Maps of Power; markets and fairs of England & Wales ───

def tib():
    files = sorted(glob.glob(os.path.join(RAW, 'tib-maps-of-power', 'original', 'places-page-*.json')))
    out = []
    for f in files:
        for res in json.load(open(f, encoding='utf-8'))['results']:
            for ft in res['features']:
                g = ft.get('geometry') or {}
                geoms = g.get('geometries') if g.get('type') == 'GeometryCollection' else [g]
                pt = next((x for x in geoms or [] if x and x.get('type') == 'Point'), None)
                if not pt:
                    # An area (a settlement's or fortress's extent): its centroid, marked as such.
                    poly = next((x for x in geoms or [] if x and x.get('type') in ('Polygon', 'MultiPolygon')), None)
                    if not poly:
                        continue
                    c = shape(poly).representative_point()
                    pt = {'type': 'Point', 'coordinates': [c.x, c.y], 'fromArea': True}
                types = [t['label'] for t in ft.get('types') or []]
                hier = ' | '.join(f"{t.get('hierarchy')} > {t['label']}" for t in ft.get('types') or []).lower()
                kind = ('church' if 'church' in hier else 'monastery' if 'monaster' in hier else 'fortification' if 'fortif' in hier or 'military' in hier
                        else 'settlement' if 'settlement' in hier else 'site')
                spans = (ft.get('when') or {}).get('timespans') or []
                first = None
                for s in spans:
                    m = re.match(r'(-?\d{1,4})-', (s.get('start') or {}).get('earliest') or '')
                    if m:
                        first = int(m.group(1)) if first is None else min(first, int(m.group(1)))
                out.append({'id': ft['@id'].rsplit('/', 1)[-1], 'name': ft['properties']['title'], 'kind': kind, 'types': types[:6],
                            'first': first, 'lon': round(pt['coordinates'][0], 5), 'lat': round(pt['coordinates'][1], 5)})
    return out


def markets_fairs():
    path = os.path.join(RAW, 'markets-fairs', 'original')
    out = defaultdict(lambda: {'grants': []})
    for fn, country in (('MFEngland.txt', 'England'), ('MFWales.txt', 'Wales')):
        p = os.path.join(path, fn)
        if not os.path.exists(p):
            continue
        for r in csv.DictReader(open(p, encoding='latin-1')):
            try:
                x, y = float(r['GRIDX']) * 100, float(r['GRIDY']) * 100
            except ValueError:
                continue
            key = (country, r['COUNTY'], r['ID'])  # IDs restart in each county
            rec = out[key]
            rec.update(name=r['MODNAME'].title(), county=r['COUNTY'].title(), x=x, y=y, borough=r['BOROUGH'] == '1', mint=bool(r['MINT'].strip()), country=country)
            first = _num(r.get('DEFYR')) or _num(r.get('CHART_YEAR')) or _num(r.get('FIRST_REC'))
            rec['grants'].append([first, (r['MKT_FAIR'] or '').lower(), r['TYPE'], _num(r.get('ENDYR'))])
    tr = Transformer.from_crs('EPSG:27700', 'EPSG:4326', always_xy=True)
    res = []
    for (country, county, pid), rec in out.items():
        lon, lat = tr.transform(rec['x'], rec['y'])
        ys = [g[0] for g in rec['grants'] if g[0]]
        res.append({'id': f'{country[0]}-{county}-{pid}', 'name': rec['name'], 'county': rec['county'], 'lon': round(lon, 5), 'lat': round(lat, 5),
                    'first': min(ys) if ys else None, 'markets': sum(1 for g in rec['grants'] if g[1] == 'market'),
                    'fairs': sum(1 for g in rec['grants'] if g[1] == 'fair'), 'borough': rec['borough']})
    return res


# Atlas Fontium — Atlas historyczny Polski: the Crown of Poland in the second half of the 16th century (IH PAN).
# Codes and terms as used in the layer's attributes; unknown values are passed through unchanged.
AF_CHARACTER = {'wieś': 'village', 'miasto': 'town', 'osada młyńska': 'mill settlement', 'osada folwarczna': 'manor-farm settlement',
                'osada kuźnicza': 'forge settlement', 'pustka': 'deserted holding', 'przedmieście': 'suburb'}
AF_OWNER = {'s': 'noble-owned', 'k': 'royal', 'd': 'church-owned', 'm': 'burgher-owned'}
AF_SIZE = re.compile(r'do (\d+) mieszkańców')
AF_PERIOD = (1550, 1600)
AF_WORKS = [(re.compile(r'\bfolwark\w*'), 'manor farm'), (re.compile(r'\bkarczm\w*'), 'inn'), (re.compile(r'\bwiatrak\w*'), 'windmill'), (re.compile(r'\bmłyn\s+(\w+)'), r'mill (\1)'),
            (re.compile(r'\bmłyn\b'), 'mill')]


def _af_works(text):
    for rx, en in AF_WORKS:
        text = rx.sub(en, text)
    return text  # the atlas's reference period, "second half of the 16th century"


def atlas_fontium():
    path = os.path.join(RAW, 'atlas-fontium-poland', 'original', 'miejscowosci.geojson')
    if not os.path.exists(path):
        return []
    out = []
    for ft in json.load(open(path, encoding='utf-8'))['features']:
        p, g = ft['properties'], ft.get('geometry') or {}
        name = (p.get('nazwa_16w') or p.get('nazwa_wspo') or '').strip()
        if g.get('type') != 'Point' or not name:
            continue
        lon, lat = g['coordinates'][:2]
        char = (p.get('charakter_') or '').strip()
        owner = ', '.join(AF_OWNER.get(c, c) for c in (p.get('rodzaj_wla') or '').strip())
        size = AF_SIZE.search(p.get('wielkosc_o') or '')
        out.append({'id': str(p['id']), 'name': name, 'modern': (p.get('nazwa_wspo') or '').strip(), 'lon': round(lon, 5), 'lat': round(lat, 5),
                    'character': AF_CHARACTER.get(char, char), 'owner': owner, 'size': f'up to {size.group(1)} inhabitants' if size else None,
                    'parish': 'parafia' in (p.get('funkcje__1') or ''), 'mills': _af_works((p.get('obiekty_go') or '').strip()),
                    'approx': bool((p.get('rodzaj_lok') or '').strip())})
    return out
