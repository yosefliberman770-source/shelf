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

import inputs
import csv
import glob
import html as htmlmod
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
    if not inputs.present(os.path.join(PT, 'city_locations.tab')):
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
    if not inputs.present(MERIMEE):
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
    if not inputs.present(FIN_ZIP):
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
    if not inputs.present(WB):
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
    if not inputs.present(BRIDGES):
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

TIB_REPOSITORY = re.compile(r'\b(national library|state library|library of|bibliot|museum|archive[s]?)\b', re.I)


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
                name = ft['properties']['title']
                # The project also records where its sources are kept today (national libraries, museums, archives):
                # present-day institutions, not places of the Byzantine world.
                if TIB_REPOSITORY.search(name):
                    continue
                out.append({'id': ft['@id'].rsplit('/', 1)[-1], 'name': name, 'kind': kind, 'types': types[:6],
                            'first': first, 'lon': round(pt['coordinates'][0], 5), 'lat': round(pt['coordinates'][1], 5),
                            'area': bool(pt.get('fromArea'))})
    return out


def markets_fairs():
    path = os.path.join(RAW, 'markets-fairs', 'original')
    out = defaultdict(lambda: {'grants': []})
    for fn, country in (('MFEngland.txt', 'England'), ('MFWales.txt', 'Wales')):
        p = os.path.join(path, fn)
        if not inputs.present(p):
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
    if not inputs.present(path):
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


# Norway — the national heritage register (Riksantikvaren, via Geonorge): individual monuments (Enkeltminne) dated by
# the register's period codes. Only periods from the Migration period to the end of the Middle Ages are kept.
NO_PERIODS = {'044': (400, 570, 'Migration period'), '045': (570, 1050, 'Younger Iron Age'), '046': (570, 800, 'Merovingian period'),
              '047': (800, 1050, 'Viking Age'), '050': (1050, 1537, 'Middle Ages'), '051': (1050, 1130, 'Early Middle Ages'),
              '052': (1130, 1350, 'High Middle Ages'), '053': (1350, 1537, 'Late Middle Ages'), '073': (-500, 1537, 'Iron Age – Middle Ages'),
              '074': (570, 1537, 'Younger Iron Age – Middle Ages'), '075': (800, 1537, 'Viking Age – Middle Ages')}
# Original function (register code list "KulturminneFunksjon") → Shelf kind.
NO_KIND = {'1200': 'settlement', '1500': 'fortification', '2700': 'church', '1900': 'market', '2000': 'site', '1700': 'site'}
NO_ZIP = os.path.join(RAW, 'norway-kulturminner', 'original', 'Kulturminner_0000_Norge_4258_Kulturminner_GML.zip')
NO_CACHE = os.path.join(RAW, 'norway-kulturminner', 'derived-medieval.json')


def _no_codes(name):
    path = os.path.join(RAW, 'norway-kulturminner', 'original', f'cl-{name}.json')
    return {x['codevalue']: x['label'] for x in json.load(open(path, encoding='utf-8'))['containeditems']} if os.path.exists(path) else {}


def norway():
    """Viking-age and medieval monuments of Norway. The 2.8 GB GML is streamed from its zip once; the extract is
    cached beside it (keyed on the zip's size and date) so later builds are fast."""
    if not inputs.present(NO_ZIP):
        return []
    stamp = f'{os.path.getsize(NO_ZIP)}-{int(os.path.getmtime(NO_ZIP))}'
    if os.path.exists(NO_CACHE):
        c = json.load(open(NO_CACHE, encoding='utf-8'))
        if c.get('stamp') == stamp:
            return c['items']
    import xml.etree.ElementTree as ET
    arts, funcs = _no_codes('kulturminneenkeltminneart'), _no_codes('kulturminnefunksjon')
    out = []
    with zipfile.ZipFile(NO_ZIP) as z, z.open(z.namelist()[0]) as f:
        for ev, el in ET.iterparse(f, events=('end',)):
            tag = el.tag.rsplit('}', 1)[-1]
            if tag not in ('Enkeltminne', 'Lokalitet', 'Sikringssone'):
                continue
            if tag == 'Enkeltminne':
                v = {c.tag.rsplit('}', 1)[-1]: (c.text or '').strip() for c in el.iter() if c.text and c.text.strip()}
                per = NO_PERIODS.get(v.get('datering', '').zfill(3))
                pos = v.get('posList') or v.get('pos')
                if per and pos:
                    nums = [float(x) for x in pos.split()]
                    lats, lons = nums[0::2], nums[1::2]
                    out.append({'id': v.get('kulturminneId') or v.get('lokalId'), 'site': v.get('lokalitetId'), 'name': v.get('navn', ''),
                                'lat': round(sum(lats) / len(lats), 5), 'lon': round(sum(lons) / len(lons), 5),
                                'period': per, 'datingQuality': v.get('dateringKvalitet'), 'datingMethod': v.get('dateringMetode'),
                                'art': arts.get(v.get('enkeltminneart', ''), v.get('enkeltminneart')),
                                'function': v.get('opprinneligFunksjon'), 'functionLabel': funcs.get(v.get('opprinneligFunksjon', '')),
                                'kind': NO_KIND.get(v.get('opprinneligFunksjon', ''), 'site'), 'link': v.get('linkKulturminnesøk')})
            el.clear()
    json.dump({'stamp': stamp, 'items': out}, open(NO_CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    return out


# Romania — national archaeological register (RAN, CIMEC). Periods as the register writes them; a stated century
# narrows the period. Sites are kept only when a component falls between 400 and 1600.
RAN_EPOCHS = {'epoca migraţiilor': (275, 700), 'epoca migrațiilor': (275, 700), 'epoca post-romană': (275, 600),
              'epoca medievală timpurie': (600, 1000), 'epoca medievală': (1000, 1600), 'evul mediu': (1000, 1600)}
_ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}


def _roman(s):
    v = 0
    for a, b in zip(s, s[1:] + ' '):
        n = _ROMAN.get(a, 0)
        v += -n if _ROMAN.get(b, 0) > n else n
    return v


def _centuries(text):
    """'sec. XV', 'sec. XVII-XVIII', 'secolele al II-lea - al III-lea' → (first year, last year) or None."""
    m = re.findall(r'\b([IVXLC]+)(?:-lea)?\b', text.split('sec', 1)[1]) if 'sec' in text else []
    cs = [_roman(x) for x in m if _roman(x)]
    if not cs:
        return None
    bc = 'a. Chr' in text or 'î.Hr' in text
    lo, hi = (min(cs) - 1) * 100, max(cs) * 100 - 1
    return (-hi, -lo) if bc else (lo, hi)


def _ran_kind(cat, typ):
    t = f'{cat} {typ}'.lower()
    for words, kind in ((('defensiv', 'cetate', 'fortifica', 'castru', 'turn', 'val'), 'fortification'),
                        (('mănăstir', 'manastir'), 'monastery'), (('cult', 'biseric', 'lăcaş', 'capel'), 'church'),
                        (('locuire', 'aşezare', 'așezare', 'sat', 'oraş', 'oraș', 'târg'), 'settlement')):
        if any(w in t for w in words):
            return kind
    return 'site'


def ran():
    base = os.path.join(RAW, 'ran-romania', 'original')
    pts = {}
    for f in glob.glob(os.path.join(base, 'points-*.json')):
        for ft in json.load(open(f, encoding='utf-8')).get('features', []):
            a, g = ft['attributes'], ft.get('geometry') or {}
            if a.get('CODSIT') and g.get('x') is not None:
                pts[a['CODSIT'].strip()] = (round(g['x'], 5), round(g['y'], 5))
    cell = re.compile(r'<!--\s*\*+<<\s*(Cod SIT|Denumire SIT|Categorie SIT|Tip SIT|Judet SIT|Localitate SIT|Tip ansamblu|Epoca SIT)\s*-->(.*?)<!--\s*\*+>>\s*\1\s*-->', re.S)
    out = []
    for f in sorted(glob.glob(os.path.join(base, 'list-page-*.html'))):
        t = open(f, encoding='utf-8', errors='replace').read()
        for tr in re.findall(r'<tr class="RandTextFont">(.*?)</tr>', t, re.S):
            r = {k: re.sub(r'\s+', ' ', htmlmod.unescape(re.sub(r'<[^>]+>', ' ', v))).strip() for k, v in cell.findall(tr)}
            code = r.get('Cod SIT')
            if not code or code not in pts:
                continue
            spans = []
            for part in re.split(r';', r.get('Epoca SIT', '')):
                head = part.split('/')[0].strip().lower()
                c = _centuries(part)
                span = c if c and (head in RAN_EPOCHS or not head or head.startswith('sec')) else RAN_EPOCHS.get(head)
                if span and span[1] >= 400 and span[0] <= 1600:
                    spans.append(span)
            if not spans:
                continue
            name = re.split(r'\.\s', r.get('Denumire SIT', ''), 1)[0][:90]
            out.append({'id': code, 'name': name, 'lon': pts[code][0], 'lat': pts[code][1],
                        'from': max(min(s[0] for s in spans), 300), 'to': min(max(s[1] for s in spans), 1650),
                        'kind': _ran_kind(r.get('Categorie SIT', ''), r.get('Tip SIT', '')), 'type': r.get('Tip SIT', ''),
                        'county': r.get('Judet SIT', ''), 'locality': r.get('Localitate SIT', ''), 'period': r.get('Epoca SIT', '')[:80]})
    return out


# France — Dictionnaire topographique (DicoTopo, CTHS / École des chartes): communes with their old name forms, each
# dated and sourced. The earliest dated form is the commune's first attestation (not a founding). Positions come from
# Wikidata items carrying the INSEE code (current and former communes). Abbeys, priories, castles etc. that the
# dictionary locates only by commune are placed at that commune and marked approximate.
DT_KINDS = [(re.compile(r'abbaye|prieuré|couvent|commanderie|chapitre|monast'), 'monastery'), (re.compile(r'château|châtel|maison forte|tour\b|forteresse|motte'), 'castle'),
            (re.compile(r'église|chapelle'), 'church'), (re.compile(r'\bville\b|bourg\b|village'), 'settlement')]


def _dt_year(date):
    """Earliest year a DicoTopo date expresses: '1018-1030', '1410 environ', 'xvie siècle', 'IXe s.'."""
    d = re.sub(r'<[^>]+>', '', date)
    ys = [int(y) for y in re.findall(r'(?<!\d)(\d{3,4})(?!\d)', d) if 400 <= int(y) <= 1900]
    if ys:
        return min(ys)
    m = re.search(r'\b([ivxlc]+)\s*e?\s*(?:siècle|s\.)', d, re.I)
    return (_roman(m.group(1).upper()) - 1) * 100 if m and _roman(m.group(1).upper()) else None


def dicotopo():
    base = os.path.join(RAW, 'dicotopo', 'original')
    if not inputs.present(os.path.join(base, 'insee-coords.tsv')):
        return []
    coords = {}
    for line in open(os.path.join(base, 'insee-coords.tsv'), encoding='utf-8').read().splitlines()[1:]:
        insee, _item, pt = (line.split('\t') + ['', '', ''])[:3]
        m = re.match(r'POINT\(([-\d.]+) ([-\d.]+)\)', pt)
        if m:
            coords.setdefault(insee.strip('"'), (round(float(m.group(1)), 5), round(float(m.group(2)), 5)))
    clean = lambda x: re.sub(r'\s+', ' ', htmlmod.unescape(re.sub(r'<[^>]+>', '', x))).strip(' ,.;-–')  # noqa: E731
    out = []
    for f in sorted(glob.glob(os.path.join(base, 'DT*.xml'))):
        dep = os.path.basename(f)[2:-4]
        for art in re.findall(r'<article [^>]*>.*?</article>', open(f, encoding='utf-8').read(), re.S):
            aid = re.search(r'id="([^"]+)"', art).group(1)
            name = clean(re.search(r'<vedette>(.*?)</vedette>', art, re.S).group(1)) if '<vedette>' in art else ''
            own = re.search(r'<insee>(\d[\dAB]\d{3})</insee>', art)
            typ = clean(re.search(r'<typologie>(.*?)</typologie>', art, re.S).group(1)) if '<typologie>' in art else ''
            forms = []
            for fa in re.findall(r'<forme_ancienne>(.*?)</forme_ancienne>', art, re.S):
                d = re.search(r'<date>(.*?)</date>', fa, re.S)
                y = _dt_year(d.group(1)) if d else None
                form = clean(re.search(r'<i>(.*?)</i>', fa, re.S).group(1)) if '<i>' in fa else ''
                if y and form:
                    forms.append((y, form))
            if not forms or not name:
                continue
            if own:
                kind, insee, precise = 'settlement', own.group(1), True
            else:
                kind = next((k for rx, k in DT_KINDS if rx.search(typ.lower())), None)
                loc = re.search(r'<commune insee="(\d[\dAB]\d{3})"', art)
                if not kind or kind == 'settlement' or not loc:
                    continue
                insee, precise = loc.group(1), False
            if insee not in coords:
                continue
            forms.sort()
            out.append({'id': aid, 'name': name, 'insee': insee, 'dep': dep, 'lon': coords[insee][0], 'lat': coords[insee][1], 'precise': precise,
                        'kind': kind, 'type': typ[:60], 'first': forms[0][0], 'firstForm': forms[0][1][:80], 'forms': [[fm[:80], y] for y, fm in forms[:8]]})
    return out


# Nordic Spatial Humanities (Zenodo 14871254, CC BY 4.0): (a) medieval parish churches and other cult places of
# the Nordic countries with their first attestation ("notbefore") and medieval diocese; (b) places named in the
# Icelandic sagas (Icelandic Saga Map), dated only by the period the sagas describe.
NSH_ZIP = os.path.join(RAW, 'nordic-spatial-humanities', 'original', 'source-data.zip')
NSH_KIND = {'Parish church': 'church', 'Church': 'church', 'Chapel': 'church', 'Church, Religious Order': 'monastery', 'Monastery': 'monastery',
            'Castle': 'castle', 'Village': 'settlement', 'Town': 'settlement', 'Hospital': 'monastery', 'Holy Well': 'site', 'Guild house': 'site'}
NSH_COUNTRIES = {'Sweden', 'Finland', 'Norway', 'Denmark', 'Iceland', 'Sverige', 'Norge', 'Suomi', 'Danmark', 'Ísland'}
SAGA_KIND = {'farm': 'settlement', 'assembly site': 'site', 'harbour': 'site', 'trading site': 'market', 'city': 'settlement', 'church': 'church'}
SAGA_PERIOD = (870, 1100)  # the settlement and saga age the sagas narrate (they were written in the 13th–14th c.)


def nordic():
    if not inputs.present(NSH_ZIP):
        return []
    out, seen = [], set()
    with zipfile.ZipFile(NSH_ZIP) as z:
        for r in csv.DictReader(io.TextIOWrapper(z.open('saints_place.csv'), encoding='utf-8'), delimiter=';'):
            kind = NSH_KIND.get(r['placetype'])
            nb = int(r['notbefore']) if r['notbefore'].strip().isdigit() else 0
            # The dataset is about the Nordic countries; its few places elsewhere (Lübeck, Rome, Santiago…) are incidental.
            if not kind or r['id'] in seen or not (400 <= nb <= 1600) or r['country'].strip() not in NSH_COUNTRIES:
                continue
            try:
                lon, lat = float(r['longitude']), float(r['latitude'])
            except ValueError:
                continue
            seen.add(r['id'])
            out.append({'id': 'c' + r['id'], 'name': r['placename'], 'lon': round(lon, 5), 'lat': round(lat, 5), 'kind': kind, 'first': nb,
                        'type': r['placetype'], 'diocese': r['diocese_medieval'] if r['diocese_medieval'] not in ('', '\\N') else None,
                        'country': r['country'].strip(), 'q': r['wikidata'].rsplit('/', 1)[-1] if 'wikidata' in r['wikidata'] else None})
        for r in csv.DictReader(io.TextIOWrapper(z.open('Result_15.tsv'), encoding='utf-8'), delimiter='\t'):
            kind = SAGA_KIND.get(r['type'])
            if not kind or ('s' + r['place']) in seen:
                continue
            try:
                lon, lat = float(r['lng']), float(r['lat'])
            except ValueError:
                continue
            seen.add('s' + r['place'])
            out.append({'id': 's' + r['place'], 'name': r['name'], 'lon': round(lon, 5), 'lat': round(lat, 5), 'kind': kind, 'first': None,
                        'period': SAGA_PERIOD, 'type': r['type'], 'saga': r['title']})
    return out


# DARMC scholarly datasets (Harvard; McCormick et al.): shipwrecks AD 1–1500, Carolingian coin hoards 751–987,
# rural Anglo-Saxon settlements. Each record's own date range is used as an evidence period.
DARMC = os.path.join(RAW, 'darmc', 'original')


def _num(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def darmc():
    try:
        import openpyxl
    except ImportError:
        return []
    out = []

    def sheet(fn, idx):
        p = os.path.join(DARMC, fn)
        if not inputs.present(p):
            return []
        ws = openpyxl.load_workbook(p, read_only=True, data_only=True).worksheets[idx]
        rows = ws.iter_rows(values_only=True)
        head = [str(h).strip() if h is not None else '' for h in next(rows)]
        return [dict(zip(head, r)) for r in rows]
    for r in sheet('shipwrecks-1-1500.xlsx', 1):
        lo, hi, lat, lon = _num(r.get('Start Date')), _num(r.get('End Date')), r.get('Latitude'), r.get('Longitude')
        if lo is None or hi is None or not isinstance(lat, (int, float)) or hi < 400:
            continue
        cargo = ', '.join(str(r[k]) for k in ('Cargo 1', 'Cargo 2', 'Cargo 3') if r.get(k) and r[k] != 'nothing reported')
        out.append({'id': f"w{r.get('2008 Wreck ID')}", 'name': f"Shipwreck: {r.get('Name')}", 'lon': round(float(lon), 5), 'lat': round(float(lat), 5),
                    'kind': 'wreck', 'from': lo, 'to': hi, 'type': ('cargo: ' + cargo)[:100] if cargo else 'shipwreck', 'set': 'shipwrecks'})
    for r in sheet('carolingian-hoards-751-987.xlsx', 1):
        lo, hi = _num(r.get('DATE_E')), _num(r.get('DATE_L'))
        lat, lon = r.get('LATITUDE'), r.get('LONGITUDE')
        if lo is None or not isinstance(lat, (int, float)):
            continue
        out.append({'id': f"h{r.get('COUP_ID')}", 'name': f"Coin hoard: {r.get('NAME_COUP')}", 'lon': round(float(lon), 5), 'lat': round(float(lat), 5),
                    'kind': 'hoard', 'from': lo, 'to': hi or lo, 'type': f"{r.get('COINS') or '?'} coins · {r.get('RULERS') or ''}"[:100], 'set': 'carolingian hoards'})
    for r in sheet('anglo-saxon-rural-settlements.xlsx', 1):
        lo, hi = _num(r.get('AS_OCC_ST')), _num(r.get('AS_OCC_EN'))
        lat, lon = r.get('DECLAT'), r.get('DECLONG')
        if lo is None or not isinstance(lat, (int, float)):
            continue
        out.append({'id': f"a{r.get('HAMEROW')}", 'name': str(r.get('NAME')), 'lon': round(float(lon), 5), 'lat': round(float(lat), 5),
                    'kind': 'settlement', 'from': lo, 'to': hi or lo, 'type': 'excavated rural settlement', 'set': 'Anglo-Saxon settlements'})
    return out


# Denmark — Fund og Fortidsminder (Slots- og Kulturstyrelsen): monuments with the register's own date range.
# Only types that say something about medieval geography are kept (not stray finds, pits or culture layers).
DK_ZIP = os.path.join(RAW, 'dk-fund-og-fortidsminder', 'original', 'FF.zip')
DK_CACHE = os.path.join(RAW, 'dk-fund-og-fortidsminder', 'derived-medieval.json')
# English category terms for the titles (the records carry types, not names); the Danish term stays in the details.
DK_EN = {'Borg/Voldsted': 'Castle or earthwork', 'Befæstning': 'Fortification', 'Kirke': 'Church', 'Kapel': 'Chapel', 'Ødekirke': 'Ruined church',
         'Kirkegård': 'Churchyard', 'Ødekirkegård': 'Abandoned churchyard', 'Klosteranlæg': 'Monastery', 'Møntfund': 'Coin find', 'Depotfund': 'Hoard',
         'Runesten': 'Runestone', 'Gård': 'Farm', 'Hus (evt. med stald)': 'House', 'Bosættelse, uspec undergruppe': 'Settlement', 'Grubehus': 'Pit house',
         'Landsby': 'Village', 'By': 'Town', 'Vej': 'Road', 'Vrag': 'Wreck', 'Bro': 'Bridge', 'Vandmølle': 'Water mill', 'Marked': 'Market',
         'Handelsplads': 'Trading place', 'Havn': 'Harbour'}
DK_KIND = {'Borg/Voldsted': 'castle', 'Befæstning': 'fortification', 'Kirke': 'church', 'Kapel': 'church', 'Ødekirke': 'church',
           'Kirkegård': 'church', 'Ødekirkegård': 'church', 'Klosteranlæg': 'monastery', 'Møntfund': 'hoard', 'Depotfund': 'hoard',
           'Runesten': 'site', 'Gård': 'settlement', 'Hus (evt. med stald)': 'settlement', 'Bosættelse, uspec undergruppe': 'settlement',
           'Grubehus': 'settlement', 'Landsby': 'settlement', 'By': 'settlement', 'Vej': 'road', 'Vrag': 'wreck', 'Bro': 'bridge',
           'Vandmølle': 'site', 'Marked': 'market', 'Handelsplads': 'market', 'Havn': 'site'}


def denmark():
    if not inputs.present(DK_ZIP):
        return []
    stamp = f'{os.path.getsize(DK_ZIP)}-{int(os.path.getmtime(DK_ZIP))}'
    if os.path.exists(DK_CACHE) and json.load(open(DK_CACHE)).get('stamp') == stamp:
        return json.load(open(DK_CACHE))['items']
    import tempfile
    from shapely import wkb
    to_wgs = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(DK_ZIP) as z:
        z.extract('ff.gpkg', tmp)
        c = sqlite3.connect(os.path.join(tmp, 'ff.gpkg'))
        geo = {}
        for table in ('lokalitet_punkt', 'lokalitet_areal', 'lokalitet_linje'):
            for sysnr, blob, typ in c.execute(f'select systemnr, geom, lokalitetstype from {table}'):
                if sysnr in geo or not blob:
                    continue
                flags = blob[3]
                env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 7, 0)
                try:
                    g = wkb.loads(bytes(blob[8 + env:]))
                    p = g if g.geom_type == 'Point' else g.representative_point()
                    lon, lat = to_wgs.transform(p.x, p.y)
                    geo[sysnr] = (round(lon, 5), round(lat, 5), typ)
                except Exception:
                    continue
        out = []
        for sysnr, grp, typ, fra, til, txt in c.execute('select systemnr, anlægshovedgruppe, anlægstype, fra_år, til_år, fritekst from anlaeg'):
            kind = DK_KIND.get(typ)
            if not kind or fra is None or til is None or sysnr not in geo or not (fra <= 1536 and til >= 700) or til - fra > 600:
                continue
            lon, lat, loc = geo[sysnr]
            out.append({'id': str(sysnr), 'name': DK_EN.get(typ, typ), 'lon': lon, 'lat': lat, 'kind': kind, 'from': max(fra, 400), 'to': min(til, 1650),
                        'type': f'{typ} ({grp})', 'note': (txt or '')[:100]})
    json.dump({'stamp': stamp, 'items': out}, open(DK_CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    return out


# EBIDAT — castle database of the European Castle Institute. Datings are written like "1.H.13.Jh." (first half of
# the 13th century), "2.V.14.Jh." (second quarter), "13.Jh.", "um 1200" or a year; the span they allow is kept.
EB_PART = {'1.H.': (0, 49), '2.H.': (50, 99), '1.V.': (0, 24), '2.V.': (25, 49), '3.V.': (50, 74), '4.V.': (75, 99),
           '1.D.': (0, 33), '2.D.': (33, 66), '3.D.': (66, 99), 'A.': (0, 24), 'Anf.': (0, 24), 'M.': (40, 60), 'Mitte': (40, 60),
           'E.': (75, 99), 'Ende': (75, 99)}


def ebidat_span(text):
    t = (text or '').strip()
    ys = [int(y) for y in re.findall(r'(?<!\d)(\d{3,4})(?!\d)', t) if 500 <= int(y) <= 1900]
    if ys:
        return min(ys), max(ys)
    m = re.search(r'(\d{1,2})\.\s*Jh', t)
    if not m:
        return None
    base = (int(m.group(1)) - 1) * 100
    part = next((v for k, v in EB_PART.items() if t.startswith(k) or f' {k}' in t), (0, 99))
    return base + part[0], base + part[1]


def ebidat():
    out = []
    import gzip
    for f in sorted(glob.glob(os.path.join(RAW, 'ebidat', 'original', 'pages-*.jsonl.gz'))):
        lines = []
        try:  # a chunk still being written by the snapshot script ends early: use what it has
            for line in gzip.open(f, 'rt', encoding='utf-8'):
                lines.append(line)
        except (EOFError, OSError):
            pass
        for line in lines:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            m = re.search(r'maps/\?q=([-\d.]+),([-\d.]+)', r['main'])
            name = re.search(r'<h2>(.*?)</h2>', r['main'], re.S)
            if not m or not name:
                continue
            d = {htmlmod.unescape(k).strip(': '): re.sub(r'\s+', ' ', htmlmod.unescape(re.sub(r'<[^>]+>', ' ', v))).strip()
                 for k, v in re.findall(r'<div class="gruppe">(.*?)</div>\s*<div class="gruppenergebnis">(.*?)</div>', r.get('data') or '', re.S)}
            begin, end = ebidat_span(d.get('Datierung-Beginn')), ebidat_span(d.get('Datierung-Ende'))
            typ = d.get('Typ', '')
            out.append({'id': str(r['id']), 'name': htmlmod.unescape(re.sub(r'<[^>]+>', '', name.group(1))).strip(), 'lat': round(float(m.group(1)), 5),
                        'lon': round(float(m.group(2)), 5), 'kind': 'fortification' if 'Festung' in typ and 'Burg' not in typ else 'castle',
                        'from': begin[0] if begin else None, 'to': end[1] if end else None,
                        'dating': f"{d.get('Datierung-Beginn', '?')} – {d.get('Datierung-Ende', '?')}",
                        'type': ' · '.join(x for x in (d.get('Klassifizierung'), d.get('Funktion Rechtsstellung'), d.get('Erhaltung - Heutiger Zustand'), d.get('Staat')) if x)})
    return out


# Sweden — Riksantikvarieämbetet, ancient remains (Kulturmiljöregistret). The register has no dating field; only remains
# whose own description names a period are kept, dated by that period (Swedish period conventions). Nothing is dated
# from the type of remain alone.
SE_GPKG = os.path.join(RAW, 'sweden-lamningar', 'original', 'lamningar_sverige.gpkg')
SE_CACHE = os.path.join(RAW, 'sweden-lamningar', 'derived-medieval.json')
SE_PERIODS = [('tidigmedeltid', (1050, 1250)), ('högmedeltid', (1250, 1350)), ('senmedeltid', (1350, 1520)), ('medeltid', (1050, 1520)),
              ('vikingatid', (800, 1050)), ('vendeltid', (550, 800)), ('folkvandringstid', (375, 550)), ('yngre järnålder', (550, 1050))]
SE_KIND = [(re.compile(r'kyrk|kapell|begravningsplats'), 'church'), (re.compile(r'kloster'), 'monastery'), (re.compile(r'borg|slott|befästning|skans'), 'castle'),
           (re.compile(r'bytomt|gårdstomt|boplats|husgrund|stadslager|bebyggelse'), 'settlement'), (re.compile(r'färdväg|väg|bro'), 'road'),
           (re.compile(r'depåfynd|skattfynd|myntfynd'), 'hoard'), (re.compile(r'fartyg|båt'), 'wreck')]


def sweden():
    if not inputs.present(SE_GPKG):
        return []
    stamp = f'{os.path.getsize(SE_GPKG)}-{int(os.path.getmtime(SE_GPKG))}'
    if os.path.exists(SE_CACHE) and json.load(open(SE_CACHE)).get('stamp') == stamp:
        return json.load(open(SE_CACHE))['items']
    from shapely import wkb
    to_wgs = Transformer.from_crs('EPSG:3006', 'EPSG:4326', always_xy=True)
    rx = re.compile('|'.join(k for k, _ in SE_PERIODS), re.I)
    c = sqlite3.connect(SE_GPKG)
    keep = {}
    for uuid, typ, desc, name, socken, url in c.execute('select uuid, lamningstyp, beskrivning, lamningsnamn, socken, url from lamning'):
        m = rx.search(desc or '')
        if not m:
            continue
        word = m.group(0).lower()
        span = next(v for k, v in SE_PERIODS if k == word)
        kind = next((k for r, k in SE_KIND if r.search((typ or '').lower())), 'site')
        keep[uuid] = {'id': uuid, 'name': name or typ or 'Remain', 'kind': kind, 'from': span[0], 'to': span[1], 'period': word,
                      'type': f"{typ}{' · ' + socken + ' parish' if socken else ''}", 'url': url}
    out = []
    for table in ('point', 'polygon', 'linestring'):
        for uuid, blob in c.execute(f'select lamning_uuid, geometri from "{table}"'):
            r = keep.get(uuid)
            if not r or 'lon' in r or not blob:
                continue
            flags = blob[3]
            env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 7, 0)
            try:
                g = wkb.loads(bytes(blob[8 + env:]))
                pt = g if g.geom_type == 'Point' else g.representative_point()
                lon, lat = to_wgs.transform(pt.x, pt.y)
            except Exception:
                continue
            r['lon'], r['lat'] = round(lon, 5), round(lat, 5)
            out.append(r)
    json.dump({'stamp': stamp, 'items': out}, open(SE_CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    return out
