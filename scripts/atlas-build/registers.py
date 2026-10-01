"""National registers and historical gazetteers added in the 2026-10 discovery pass (docs/HISTORICAL_SOURCES_SEARCH.md).

Each loader reads one dataset from data/historical/raw/<id>/original unchanged and returns records:
  {'src', 'id', 'name', 'kind', 'lon', 'lat', 'precise', 'names': [(form, year, None, lang)], 'ctx': [context names],
   'f', 'fb'            — a dated start and what it is (construction, first attestation…), or
   'env', 'per', 'cw'   — a period the record's own field gives (cw: width of a construction window when the end is open),
   'snap'               — a single year in which a source lists the place (it existed then; before/after unknown),
   'ty'                 — the source's own type / class text}
Nothing is dated from a dataset's overall period. Records without dates stay undated.
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import math
import os
import re
import unicodedata
import zipfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', '..', 'data', 'historical', 'raw')


def raw(ds, *p):
    return os.path.join(RAW, ds, 'original', *p)


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def near_land(bbox):
    """A test (lon, lat) → km out to sea (0 on land), from OpenStreetMap's simplified land polygons within bbox."""
    import shapefile
    from shapely.geometry import Point, box, shape
    from shapely.ops import transform
    from shapely.strtree import STRtree
    R = 6378137.0
    z = zipfile.ZipFile(os.path.join(HERE, '.cache', 'osm_land.zip'))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))  # noqa: E731
    rd = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'))
    to_ll = lambda x, y, zz=None: (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))  # noqa: E731
    clip = box(*bbox)
    geoms = [g for g in (transform(to_ll, shape(sh.__geo_interface__)) for sh in rd.iterShapes()) if g.intersects(clip)]
    tree = STRtree(geoms)

    def km(lon, lat):
        pt = Point(lon, lat)
        if any(geoms[i].contains(pt) for i in tree.query(pt)):
            return 0.0
        d = min((geoms[i].distance(pt) for i in tree.query(pt.buffer(0.5))), default=1)
        return d * 111.0 * max(0.3, math.cos(math.radians(lat)))
    return km


# ── Scotland: Canmore (National Record of the Historic Environment), OGL v3 ─────────────────────────────────
# Period words are Canmore's own (the ScAPA period thesaurus HES uses). Years for the broad periods follow ScAPA's
# definitions and are marked approximate; a named century or year is used as it stands.
SCAPA = {'ROMAN': (79, 410), 'PICTISH': (300, 900), 'EARLY MEDIEVAL': (400, 1100), 'EARLY HISTORIC': (400, 1100), 'VIKING': (795, 1100),
         'NORSE': (795, 1266), 'MEDIEVAL': (900, 1600), 'LATER MEDIEVAL': (1200, 1600), 'POST MEDIEVAL': (1560, 1900),
         'IRON AGE': (-800, 400), 'LATER PREHISTORIC': (-2500, 400), 'FIRST WORLD WAR': (1914, 1918), 'SECOND WORLD WAR': (1939, 1945),
         'JACOBITE': (1689, 1746), 'REFORMATION': (1560, 1600), 'IMPROVEMENT': (1750, 1850)}
ORD = {'1ST': 1, '2ND': 2, '3RD': 3}


def scapa_period(term):
    t = term.strip().upper()
    if t in SCAPA:
        return SCAPA[t]
    m = re.fullmatch(r'(EARLY |MID |LATE )?(\d{1,2})(?:ST|ND|RD|TH) CENTURY(?: AD)?', t)
    if m:
        c = int(m.group(2))
        a = (c - 1) * 100
        part = (m.group(1) or '').strip()
        return {'EARLY': (a, a + 33), 'MID': (a + 33, a + 66), 'LATE': (a + 66, a + 99)}.get(part, (a, a + 99))
    if re.fullmatch(r'1[0-9]{3}', t):
        return int(t), int(t)
    return None


def canmore_kind(t):
    t = t.upper()
    for rx, k in ((r'\bCATHEDRAL\b', 'cathedral'), (r'\b(ABBEY|PRIORY|FRIARY|NUNNERY|MONASTERY|PRECEPTORY|COLLEGIATE CHURCH)\b', 'monastery'),
                  (r'\b(CHURCH|CHAPEL|KIRK|CHURCHYARD|BURIAL GROUND)\b', 'church'), (r'\b(CASTLE|TOWER HOUSE|MOTTE|PEEL|BASTLE)\b', 'castle'),
                  (r'\b(FORT|FORTLET|DUN|BROCH|HILLFORT|FORTIFICATION|BATTERY|RAMPART|ARTILLERY)\b', 'fortification'),
                  (r'\b(WRECK|CRAFT|BOAT|SHIP|AIRCRAFT)\b', 'wreck'), (r'\b(HARBOUR|PIER|QUAY|DOCK|LIGHTHOUSE|JETTY|SLIPWAY)\b', 'harbour'),
                  (r'\bBRIDGE\b|\bFORD\b', 'bridge'), (r'\b(ROAD|TRACK|CAUSEWAY|TURNPIKE)\b', 'road'), (r'\bMARKET\b', 'market'),
                  (r'\b(MILL|KILN|FORGE|SALTPAN|BREWERY|DISTILLERY|TANNERY)\b', 'mill'), (r'\b(QUARRY|MINE|PIT|SHAFT|LEAD WORKS|BLOOMERY)\b', 'mine'),
                  (r'\b(BURGH|TOWN|VILLAGE|TOWNSHIP|SETTLEMENT|FARMSTEAD|CROFT|HAMLET|CLACHAN)\b', 'settlement')):
        if re.search(rx, t):
            return k
    return 'site'


def canmore():
    import shapefile
    from pyproj import Transformer
    tr = Transformer.from_crs(27700, 4326, always_xy=True)
    z = zipfile.ZipFile(raw('canmore-scotland', 'Canmore_Points.zip'))
    dbf = next(n for n in z.namelist() if n.endswith('.dbf'))
    r = shapefile.Reader(dbf=io.BytesIO(z.read(dbf)), encoding='utf-8', encodingErrors='replace')
    out, skipped = [], Counter()
    for rec in r.iterRecords(fields=['CANMOREID', 'NMRSNAME', 'ALTNAME', 'SITETYPE', 'PARISH', 'COUNCIL', 'ACCURACY', 'XCOORD', 'YCOORD']):
        if not rec['XCOORD'] or not rec['YCOORD']:
            skipped['no position'] += 1
            continue
        st = rec['SITETYPE'] or ''
        spans = [p for p in (scapa_period(x) for x in re.findall(r'\(([^()]*?)\)', st)) if p]
        kind = canmore_kind(st)
        if spans:
            lo, hi = min(s[0] for s in spans), max(s[1] for s in spans)
            if hi < 0 or lo > 1914:
                skipped['outside 0–1914'] += 1
                continue
        elif kind in ('site', 'road', 'mine', 'mill', 'wreck', 'harbour'):
            skipped['undated generic record (kept in the raw register)'] += 1
            continue
        lon, lat = tr.transform(rec['XCOORD'], rec['YCOORD'])
        acc = rec['ACCURACY'] or ''
        x = {'src': 'canmore', 'id': str(rec['CANMOREID']), 'name': (rec['NMRSNAME'] or '').title()[:80] or st.title()[:60], 'kind': kind,
             'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': bool(re.search(r'nearest (1|10|100)m', acc)), 'ty': st[:120],
             'ctx': [c for c in (rec['PARISH'], rec['COUNCIL']) if c], 'names': [(rec['ALTNAME'], None, None, '')] if rec['ALTNAME'] else []}
        if spans:
            x['env'] = (lo, hi)
            x['per'] = ', '.join(sorted({p for p in re.findall(r'\(([^()]*?)\)', st) if scapa_period(p)}))[:80] + ' (Canmore period; ScAPA years)'
        out.append(x)
    return out, dict(skipped)


# ── Ireland: Archaeological Survey of Ireland SMR, CC BY 4.0 ─────────────────────────────────────────────────
# Only a class that names its own date is dated (e.g. "House - 17th century", "Settlement deserted - medieval").
IRL_PERIOD = {'early medieval': (400, 1169), 'medieval': (1169, 1550), 'viking/hiberno-norse': (795, 1169), 'anglo-norman': (1169, 1400),
              '16th century': (1500, 1599), '16th/17th century': (1500, 1699), '17th century': (1600, 1699), '17th/18th century': (1600, 1799),
              '18th century': (1700, 1799), '18th/19th century': (1700, 1899), '19th century': (1800, 1899)}


def irl_kind(c):
    c = c.lower()
    for rx, k in ((r'religious house|abbey|priory|friary|nunnery|monastery|preceptory', 'monastery'), (r'cathedral', 'cathedral'),
                  (r'^church|ecclesiastical|chapel|graveyard|holy well', 'church'), (r'castle|tower house|bawn|fortified house', 'castle'),
                  (r'^ringfort|promontory fort|hillfort|fort\b', 'fortification'), (r'settlement|town|village|borough', 'settlement'),
                  (r'^bridge', 'bridge'), (r'^road|togher|trackway', 'road'), (r'^mill|kiln', 'mill'), (r'quarry|mine', 'mine'),
                  (r'harbour|quay|pier', 'harbour'), (r'wreck', 'wreck'), (r'market', 'market')):
        if re.search(rx, c):
            return k
    return 'site'


def ireland_smr():
    out, skipped = [], Counter()
    with open(raw('ireland-smr', 'SMROpenData.csv'), encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            c = r['MONUMENT_CLASS'] or ''
            try:
                lon, lat = float(r['LONGITUDE']), float(r['LATITUDE'])
            except ValueError:
                skipped['no coordinates'] += 1
                continue
            if not (-11 <= lon <= -5.3 and 51.2 <= lat <= 55.5):
                # 103 records share one point in the Atlantic: the source's placeholder for a missing grid reference.
                skipped['placeholder position outside Ireland (kept in the raw register)'] += 1
                continue
            kind = irl_kind(c)
            m = re.search(r' - (.+)$', c)
            per = IRL_PERIOD.get((m.group(1) if m else '').strip().lower())
            if c.startswith('Castle - Anglo-Norman'):
                per = IRL_PERIOD['anglo-norman']
            if not per and kind in ('site', 'road', 'mill', 'mine'):
                continue  # undated generic monument: kept in the raw register only
            x = {'src': 'irlsmr', 'id': r['SMRS'].strip('-'), 'name': (r['TOWNLAND'] or '').title() + f' — {c}', 'kind': kind, 'lon': round(lon, 5),
                 'lat': round(lat, 5), 'precise': True, 'ty': c, 'ctx': [r['TOWNLAND'].title(), r['COUNTY'].title()], 'names': []}
            if per:
                x['env'] = per
                x['per'] = f'{c} (class named by the survey)'
            out.append(x)
    return out, dict(skipped)


# ── Poland: register of immovable monuments (NID), CC BY 4.0; placed at their locality (GeoNames) ─────────────
ROMAN_NUM = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12, 'XIII': 13,
             'XIV': 14, 'XV': 15, 'XVI': 16, 'XVII': 17, 'XVIII': 18, 'XIX': 19, 'XX': 20, 'XXI': 21}


def polish_dating(s):
    """Earliest construction window in an NID 'chronologia' text, as (from, to), or None.
    '2. poł. XIX w.' → (1850, 1899); 'XIV/XV w.' → (1300, 1499); '1820 - 1830' → (1820, 1830); 'ok. 1500' → (1490, 1510)."""
    if not s:
        return None
    s = s.replace('–', '-').replace('—', '-')
    cands = []
    for m in re.finditer(r'(?:(pocz\.|pocz|kon\.|kon|ok\.|poł\.|po|przed)\s*)?(\d)?\s*\.?\s*(poł\.|ćw\.|ćw|tercja|poł)?\s*\b([IVX]{1,5})(?:\s*[/-]\s*([IVX]{1,5}))?\s*w\b', s):
        c1 = ROMAN_NUM.get(m.group(4))
        if not c1:
            continue
        c2 = ROMAN_NUM.get(m.group(5)) if m.group(5) else c1
        a, b = (c1 - 1) * 100, c2 * 100 - 1
        part, n, pre = m.group(3), m.group(2), (m.group(1) or '')
        if part and n and part.startswith('poł'):
            a = a + (int(n) - 1) * 50
            b = a + 49 if c1 == c2 else b
        elif part and n and part.startswith('ćw'):
            a = a + (int(n) - 1) * 25
            b = a + 24 if c1 == c2 else b
        elif pre.startswith('pocz'):
            b = a + 20
        elif pre.startswith('kon'):
            a = b - 20
        cands.append((a, b))
    for m in re.finditer(r'\b(1[0-9]{3})\s*(?:-\s*(1[0-9]{3}|[0-9]{2}))?\b', s):
        a = int(m.group(1))
        b = m.group(2)
        b = (int(b) if len(b) == 4 else a // 100 * 100 + int(b)) if b else a
        approx = re.search(r'ok\.\s*$', s[:m.start()])
        cands.append((a - 10, a + 10) if approx and b == a else (a, max(a, b)))
    return min(cands) if cands else None


NID_KIND = [(r'katedr', 'cathedral'), (r'klasztor|opactw|zesp[oó]ł klasztorny|konwent|eremu', 'monastery'), (r'koś?ci[oó]ł|kaplic|cerkiew|synagog|meczet|zb[oó]r|dzwonnic|plebani', 'church'),
           (r'zamek|zamk|grodzisk|fortyfik|twierdz|fort\b|mury obronne|baszt|bram', 'castle'), (r'układ urbanistyczny|układ przestrzenny|miasto|wieś|zesp[oó]ł dworsk|dw[oó]r|pałac|ratusz|kamienic|zagrod|chałup',
                                                                                              'settlement'),
           (r'most', 'bridge'), (r'młyn|wiatrak|kuźni|browar|gorzelni|spichlerz|huta', 'mill'), (r'kopalni|sztolni', 'mine'), (r'cmentarz', 'church')]


def nid_kind(name, func):
    t = f'{name} {func}'.lower()
    for rx, k in NID_KIND:
        if re.search(rx, t):
            return k
    return 'building'  # a house, granary, park, villa…: a standing building, not an archaeological site


def geonames_pl():
    """(normalised name, voivodeship) → [(lon, lat, population, feature code)] for populated places in Poland."""
    adm1 = {'72': 'dolnośląskie', '73': 'kujawsko-pomorskie', '74': 'lubelskie', '75': 'lubuskie', '76': 'łódzkie', '77': 'małopolskie',
            '78': 'mazowieckie', '79': 'opolskie', '80': 'podkarpackie', '81': 'podlaskie', '82': 'pomorskie', '83': 'śląskie',
            '84': 'świętokrzyskie', '85': 'warmińsko-mazurskie', '86': 'wielkopolskie', '87': 'zachodniopomorskie'}
    idx = defaultdict(list)
    z = zipfile.ZipFile(raw('poland-nid-register', 'geonames-PL.zip'))
    for line in io.TextIOWrapper(z.open('PL.txt'), encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        if f[6] != 'P':
            continue
        v = adm1.get(f[10])
        for n in {f[1], f[2]}:
            idx[(norm(n), v)].append((float(f[5]), float(f[4]), int(f[14] or 0), f[7]))
    return idx


def poland_nid():
    idx = geonames_pl()
    out, unplaced = [], Counter()
    raw_bytes = open(raw('poland-nid-register', 'V_OTWARTE_DANE_ZESTAWIENIE_ZRN.csv'), 'rb').read()
    try:
        text = raw_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw_bytes.decode('cp1250')  # the dane.gov.pl export is Windows-1250
    for r in csv.DictReader(io.StringIO(text), delimiter=';' if text[:3000].count(';') > text[:3000].count(',') else ','):
        place = r.get('MIEJSCOWOSC') or ''
        hits = idx.get((norm(place), (r.get('WOJEWODZTWO') or '').strip().lower()))
        if not hits:
            unplaced['locality not found in GeoNames'] += 1
            continue
        lon0 = sum(h[0] for h in hits) / len(hits)
        lat0 = sum(h[1] for h in hits) / len(hits)
        if len(hits) > 1 and max(math.hypot(h[0] - lon0, h[1] - lat0) for h in hits) > 0.15:
            unplaced['several places of that name in the voivodeship'] += 1
            continue
        when = polish_dating(r.get('CHRONOLOGIA'))
        kind = nid_kind(r.get('NAZWA') or '', r.get('FUNKCJA') or '')
        x = {'src': 'nid', 'id': r['INSPIRE_ID'].rsplit('.', 1)[-1] if r.get('INSPIRE_ID') else f"{place}:{r.get('NAZWA')}",
             'name': f"{(r.get('NAZWA') or '').strip().capitalize()}, {place}"[:80], 'kind': kind, 'lon': round(lon0, 5), 'lat': round(lat0, 5),
             'precise': False, 'ty': f"{r.get('FUNKCJA') or ''} · {r.get('CHRONOLOGIA') or 'date not recorded'}"[:120], 'ctx': [place, r.get('GMINA') or ''],
             'names': [], 'loc': 'locality (village or town) from GeoNames; the register gives no coordinates'}
        if when:
            x['env'] = (when[0], None)
            x['cw'] = when[1] - when[0] + 1
            x['per'] = f"built {r['CHRONOLOGIA']} (NID register)"
        out.append(x)
    return out, dict(unplaced)


# ── England & Wales: Index Villaris (John Adams, 1680), CC BY 4.0 ──────────────────────────────────────────
def index_villaris():
    z = zipfile.ZipFile(raw('index-villaris-1680', 'IndexVillaris1680-v2.0.4.zip'))
    base = next(n for n in z.namelist() if n.endswith('docs/data/index_villaris.csv'))
    tps_n = base.replace('index_villaris.csv', 'index_villaris_tps.csv')
    osm_n = base.replace('index_villaris.csv', 'OSM_matched.csv')
    # index_villaris_tps.csv has no header: uuid, classes, name, county, hundred, Adams's [lat, lon], corrected [lat, lon], WKT.
    tps = {}
    if tps_n in z.namelist():
        for row in csv.reader(io.TextIOWrapper(z.open(tps_n), encoding='utf-8-sig')):
            m = re.match(r'POINT\(([-\d.]+) ([-\d.]+)\)', row[-1]) if row else None
            if m:
                tps[row[0]] = (float(m.group(1)), float(m.group(2)))
    osm = {r['uuid']: r for r in csv.DictReader(io.TextIOWrapper(z.open(osm_n), encoding='utf-8-sig'))}
    # GeoNames GB populated places by normalised name, to place entries that neither OSM matching nor the spline locate well.
    gn = defaultdict(list)
    with zipfile.ZipFile(raw('index-villaris-1680', 'geonames-GB.zip')) as gz:
        for line in io.TextIOWrapper(gz.open('GB.txt'), encoding='utf-8'):
            f = line.rstrip('\n').split('\t')
            if f[6] == 'P':
                for n in {f[1], f[2]}:
                    gn[norm(n)].append((float(f[5]), float(f[4])))
    sea = near_land((-8.5, 49.8, 2.0, 56.0))
    out, skipped = [], Counter()
    for r in csv.DictReader(io.TextIOWrapper(z.open(base), encoding='utf-8-sig')):
        u = r['uuid']
        precise = False
        loc = None
        if u in osm and osm[u].get('lng-OSM') and float(osm[u].get('distance (km)') or 99) < 5:
            lon, lat, precise = float(osm[u]['lng-OSM']), float(osm[u]['lat-OSM']), True
            loc = 'matched to OpenStreetMap by the edition'
        else:
            if u in tps:
                lon, lat = tps[u]  # Adams's coordinates corrected by a thin-plate spline fitted on ~2,000 matched towns
            else:
                m = re.match(r'POINT\(([-\d.]+) ([-\d.]+)\)', r.get('WKT') or '')
                if not m:
                    skipped['no position'] += 1
                    continue
                lon, lat = float(m.group(1)), float(m.group(2))
            # The spline is least reliable at the coasts. A GeoNames place of the same name within 25 km is preferred.
            near = [g for g in gn.get(norm(re.sub(r'^St\.? ', 'Saint ', r['place-name'])), []) + gn.get(norm(r['place-name']), [])
                    if math.hypot((g[0] - lon) * math.cos(math.radians(lat)), g[1] - lat) * 111 < 25]
            if near:
                lon, lat = min(near, key=lambda g: math.hypot((g[0] - lon) * math.cos(math.radians(lat)), g[1] - lat))
                loc = 'located by name in GeoNames, within 25 km of the position derived from Adams\'s coordinates'
            elif sea(lon, lat) > 2:
                skipped['derived position more than 2 km out to sea, no same-name place nearby (kept in the raw data)'] += 1
                continue
            else:
                loc = 'derived from Adams\'s 1680 coordinates (thin-plate spline); approximate'
        cls = r.get('classes') or ''
        kind = 'market' if 'market' in cls else 'settlement'
        out.append({'src': 'ivillaris', 'id': u, 'name': r['place-name'], 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': precise,
                    'snap': 1680, 'per': 'listed in Index Villaris (Adams, 1680)', 'ty': cls.replace('|', ', ') or 'place',
                    'ctx': [c for c in (r.get('hundred'), r.get('county')) if c], 'names': [(r['place-name'], 1680, None, 'en-1680')], 'loc': loc})
    return out, dict(skipped)


# ── Ottoman Empire: NFS population-register gazetteer (1830–1849), CC BY 4.0 ──────────────────────────────
def hijri_to_ce(h):
    """Gregorian year in which Hijri year h began (the year can run into the next)."""
    return int(h * 0.970229 + 621.5643)


def ottoman_nfs():
    import openpyxl
    wb = openpyxl.load_workbook(raw('ottoman-nfs-gazetteer', 'Kabadayi_Boykov_Sefer_Gerrits_Ottoman_NFS_Gazetteer_23112022_16296_populated_places_version_1.xlsx'), read_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    head = list(next(rows))
    out = []
    for v in rows:
        r = dict(zip(head, v))
        if r.get('latitude') is None or r.get('longitude') is None:
            continue
        h = r.get('register_date_in_Hicri')
        y = hijri_to_ce(int(h)) if isinstance(h, (int, float)) and 1200 < h < 1300 else None
        name = r.get('toponym transcribed from NFS.d.') or r.get('toponym_modern') or '?'
        names = [(n, y, None, lang) for n, lang in ((r.get('toponym Ottoman in NFS.d.'), 'ota'), (r.get('toponym_modern'), 'modern')) if n and n != name]
        out.append({'src': 'ottomannfs', 'id': str(r['populated_place_id']), 'name': str(name), 'kind': 'settlement', 'lon': round(float(r['longitude']), 5),
                    'lat': round(float(r['latitude']), 5), 'precise': True, **({'snap': y} if y else {}),
                    'per': f"listed in Ottoman population register NFS.d. {r.get('NFS.d. register_number') or ''} ({int(h)} AH ≈ {y})" if y else None,
                    'ty': f"populated place · kaza {r.get('kaza in NFS.d.') or r.get('kaza_1848_1264') or ''}", 'ctx': [c for c in (r.get('kaza_1848_1264'), r.get('liva_1848_1264')) if c],
                    'names': names})
    return out


# ── Balkans: gazetteer of the Generalkarte von Mitteleuropa 1:200,000 (Boykov), CC BY 4.0 ───────────────────
GK_KIND = {'settlement': 'settlement', 'settlement_chiftlik': 'settlement', 'settlement_huts': 'settlement', 'monastery': 'monastery', 'metochion': 'monastery',
           'church': 'church', 'chapel': 'church', 'teke': 'church', 'fortress': 'castle', 'tower': 'castle', 'tabiya': 'fortification', 'karaul': 'fortification',
           'barracks': 'fortification', 'arsenal': 'fortification', 'bridge': 'bridge', 'han': 'road', 'train station': 'road', 'customs office': 'road',
           'port': 'harbour', 'mine': 'mine', 'ore deposits': 'mine', 'ruins': 'site', 'fishing weir': 'mill', 'fishery': 'mill', 'winery': 'mill'}
GK_PERIOD = (1880, 1918)  # sheet editions of the Generalkarte covering the Balkans; the gazetteer does not say which edition


def generalkarte():
    out, swapped = [], 0
    with open(raw('generalkarte-gazetteer', 'Boykov_Gazetteer_Generalkarte_von_Mitteleuropa_v.1.xls.csv'), encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            try:
                a, b = float(r['longitude']), float(r['latitude'])
            except ValueError:
                continue
            # The two columns are exchanged throughout the source (its "longitude" runs 39.5–45.4, the latitudes of the
            # Balkans; every row's country is a Balkan one): read as (lon, lat) = (latitude column, longitude column).
            lon, lat = (b, a) if 35 <= a <= 48 and 13 <= b <= 30 else (a, b)
            swapped += (lon, lat) == (b, a)
            out.append({'src': 'generalkarte', 'id': f"{r['Country']}:{r['Name']}:{round(lat, 4)}", 'name': r['Name'], 'kind': GK_KIND.get(r['Type'], 'site'),
                        'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': True, 'env': GK_PERIOD,
                        'per': 'shown on the Generalkarte von Mitteleuropa 1:200,000 (Balkan sheets, editions c. 1880–1918)',
                        'ty': r['Type'] + (f" · {r['Description']}" if r.get('Description') else ''), 'ctx': [r['Country']],
                        'names': [(n.strip(), None, None, '') for n in (r.get('AltName') or '').split(';') if n.strip()]})
    return out, swapped


# ── France: towns, villages and abbeys of the Cassini map (Perret et al.), Harvard Dataverse ─────────────────
CASSINI_PERIOD = (1756, 1815)  # sheets surveyed 1756–1789, last published 1815; the dataset does not give each sheet's year


def cassini_places():
    import shapefile
    from shapely.geometry import shape
    z = zipfile.ZipFile(raw('cassini-roads-cities', 'france_cassini_cities.zip'))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))
    prj = z.read(next(n for n in z.namelist() if n.endswith('.prj'))).decode()
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'), encoding='utf-8', encodingErrors='replace')
    tr = _transformer(prj)
    out = []
    for i, rec in enumerate(r.iterRecords()):
        g = shape(r.shape(i).__geo_interface__)
        c = g.centroid
        lon, lat = tr(c.x, c.y)
        t = (rec['city_type'] or '').lower()
        kind = 'fortification' if t == 'fort' else 'settlement'  # city, town, or 'domain' (a seat or estate) on the map
        out.append({'src': 'cassini', 'id': str(rec['id']), 'name': rec['city_name'] or t, 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': True,
                    'env': CASSINI_PERIOD, 'per': 'shown on the Cassini map (sheets surveyed 1756–1789)', 'ty': t + (' · fortified' if rec['fortified'] else ''),
                    'ctx': [], 'names': []})
    return out


def cassini_roads():
    import shapefile
    from shapely.geometry import mapping, shape
    from shapely.ops import transform
    z = zipfile.ZipFile(raw('cassini-roads-cities', 'france_cassini_roads.zip'))
    part = lambda ext: io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.' + ext))))
    prj = z.read(next(n for n in z.namelist() if n.endswith('.prj'))).decode()
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'), encoding='utf-8', encodingErrors='replace')
    tr = _transformer(prj)
    out = []
    for i, rec in enumerate(r.iterRecords()):
        g = transform(lambda x, y, z=None: tr(x, y), shape(r.shape(i).__geo_interface__))
        out.append((mapping(g), {'i': f"cr{rec['id']}", 'k': rec['road_type'] or '', 'u': 1 if rec['uncertain'] else 0, 'ef': CASSINI_PERIOD[0], 'et': CASSINI_PERIOD[1], 'src': 'cassini',
                                 **({'n': rec['road_name'][:60]} if rec['road_name'] else {})}, 5))
    return out


def lutsch_roads():
    """Main roads and mountain paths on the Lutsch map of Transylvania (1751), CC BY-NC-SA 4.0 — a snapshot of 1751."""
    import shapefile
    from shapely.geometry import mapping, shape
    from shapely.ops import transform
    base = raw('lutsch-roads-1751', 'ROADS LUTSCH')
    r = shapefile.Reader(base, encoding='utf-8', encodingErrors='replace')
    tr = _transformer(open(base + '.prj').read())
    out = []
    for i, rec in enumerate(r.iterRecords()):
        sh = r.shape(i)
        if not sh.points:
            continue
        g = transform(lambda x, y, z=None: tr(x, y), shape(sh.__geo_interface__))
        out.append((mapping(g), {'i': f'lr{i}', 'k': (rec['TYPE'] or 'road').lower(), 'u': 0, 'ef': 1751, 'et': 1751, 'sn': 1, 'src': 'lutsch'}, 5))
    return out


def _transformer(prj):
    from pyproj import CRS, Transformer
    t = Transformer.from_crs(CRS.from_wkt(prj), 4326, always_xy=True)
    return lambda x, y: t.transform(x, y)


# ── Transylvania: features on the Lutsch map (1751), Harvard Dataverse ──────────────────────────────────────
def lutsch():
    import shapefile
    base = raw('lutsch-transylvania-1751', 'POINTS LUTSCH')
    r = shapefile.Reader(base, encoding='utf-8', encodingErrors='replace')
    prj = open(base + '.prj').read()
    tr = _transformer(prj)
    kinds = {'SETTLEMENT': 'settlement', 'MONASTERY': 'monastery', 'FORTIFICATION': 'fortification', 'POST STATION': 'road', 'BATTLEFIELD': 'site',
             'MANUFACTORY': 'mill', 'NATURAL RESOURCE': 'mine'}
    out = []
    for i, rec in enumerate(r.iterRecords()):
        pts = r.shape(i).points
        if not pts:
            continue  # a record without a point in the source
        lon, lat = tr(*pts[0])
        t = (rec['TYPE'] or '').upper()
        out.append({'src': 'lutsch', 'id': f'l{i}', 'name': rec['NAME'], 'kind': next((v for k, v in kinds.items() if k in t), 'site'),
                    'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': False, 'snap': 1751, 'per': 'shown on the Lutsch map of Transylvania (1751)',
                    'ty': t.lower(), 'ctx': [], 'names': [(rec['NAME'], 1751, None, 'map form 1751')]})
    return out


# ── Latin inscriptions: LIST v1.2 (SDAM, Aarhus; EDH + EDCS), CC BY 4.0 ─────────────────────────────────────
# One record per find-spot. 'cent' counts, per century (start year), the inscriptions found there whose own dating
# (not_before–not_after) is at most INSCR_MAX_SPAN years wide and overlaps that century. A find-spot is shown only in
# centuries with such inscriptions — never across the gaps between them.
INSCR_MAX_SPAN = 150
INSCR_CENTURIES = range(100, 800, 100)


def list_inscriptions():
    import pyarrow.parquet as pq
    t = pq.ParquetFile(raw('list-latin-inscriptions', 'LIST_v1-2.parquet'))
    cols = ['LIST-ID', 'Longitude', 'Latitude', 'not_before', 'not_after', 'findspot_ancient_clean', 'findspot_modern_clean', 'place',
            'province_label_clean', 'type_of_inscription_auto', 'pleiades_id']
    spots = {}
    stats = Counter()
    for batch in t.iter_batches(batch_size=50000, columns=cols):
        for r in batch.to_pylist():
            lon, lat, a, b = r['Longitude'], r['Latitude'], r['not_before'], r['not_after']
            if lon is None or lat is None or a is None or b is None or (a != a) or (b != b):
                stats['no position or no dating'] += 1
                continue
            a, b = int(a), int(b)
            if b < a:
                stats['ends before it starts (left out)'] += 1
                continue
            if b - a > INSCR_MAX_SPAN:
                stats[f'dated more broadly than {INSCR_MAX_SPAN} years'] += 1
                continue
            cents = [c for c in INSCR_CENTURIES if a <= c + 99 and b >= c]
            if not cents:
                stats['dated outside 100–799'] += 1
                continue
            key = (round(lon, 4), round(lat, 4))
            s = spots.get(key)
            if not s:
                name = r['findspot_ancient_clean'] or r['place'] or r['findspot_modern_clean'] or 'Find-spot'
                s = spots[key] = {'src': 'lirelist', 'id': f'{key[0]}_{key[1]}', 'name': str(name)[:70], 'kind': 'inscription', 'lon': key[0], 'lat': key[1],
                                  'precise': True, 'cent': Counter(), 'types': Counter(), 'n': 0, 'modern': r['findspot_modern_clean'],
                                  'prov': r['province_label_clean'], 'pl': r['pleiades_id']}
            s['n'] += 1
            for c in cents:
                s['cent'][c] += 1
            if r['type_of_inscription_auto']:
                s['types'][r['type_of_inscription_auto']] += 1
            stats['used'] += 1
    return list(spots.values()), dict(stats)


# ── Slovenia: Register nepremične kulturne dediščine (RKD, Ministry of Culture), OPSI open data (CC BY 4.0) ───────
# DATACIJA is the register's own dating, a comma list of terms: centuries with their parts ('druga polovica 19. stol.'),
# years, and archaeological periods. For buildings it dates the fabric → an open construction window from the earliest
# term; for archaeological sites it is the span of use → the union of the named periods. Years for the periods follow
# the Slovenian archaeological convention and are approximate (shown as such). Prehistoric periods and anything
# starting after 1914 are outside the map's range and dropped; undated records stay undated.
SI_PERIOD = {'rimska doba': (-15, 600), 'antika': (-15, 600), 'zgodnja rimska doba': (-15, 250), 'pozna rimska doba': (250, 600),
             'pozna antika': (250, 600), 'srednji vek': (568, 1500), 'zgodnji srednji vek': (568, 1000), 'visoki srednji vek': (1000, 1300),
             'pozni srednji vek': (1300, 1500), 'novi vek': (1500, 1900), 'zgodnji novi vek': (1500, 1800), 'prva svetovna vojna': (1914, 1918)}
SI_PART = {'prva četrtina': (0, 24), 'druga četrtina': (25, 49), 'tretja četrtina': (50, 74), 'zadnja četrtina': (75, 99), 'četrta četrtina': (75, 99),
           'prva polovica': (0, 49), 'druga polovica': (50, 99), 'sredina': (40, 60), 'začetek': (0, 20), 'konec': (80, 99)}


def si_term(t):
    """One DATACIJA term → (from, to, exact_period_name_or_None) or None."""
    t = re.sub(r'\s+', ' ', t.strip().lower())
    if not t or 'pr. n. št' in t:
        return None
    if t in SI_PERIOD:
        return (*SI_PERIOD[t], t)
    m = re.fullmatch(r'prelom (\d{1,2})\. stol\. in (\d{1,2})\. stol\.', t)
    if m:
        a = int(m.group(1)) * 100
        return a - 10, a + 10, None
    m = re.fullmatch(r'(?:(.+?) )?(\d{1,2})\. stol\.', t)
    if m:
        a = (int(m.group(2)) - 1) * 100
        part = SI_PART.get(m.group(1) or '')
        if a == 0:  # the 1st century AD begins in year 1 (there is no year 0)
            return (1 + part[0], max(1, part[1]), None) if part else (1, 99, None)
        if m.group(1) and not part:
            return None
        return (a + part[0], a + part[1], None) if part else (a, a + 99, None)
    m = re.fullmatch(r'(1[0-9]{3}|[1-9][0-9]{2})', t)
    if m:
        return int(t), int(t), None
    return None


def si_kind(zvrst, gesla, name):
    t = f'{gesla} {name}'.lower()
    for rx, k in ((r'samostan|kartuzij|opatij', 'monastery'), (r'stolnic', 'cathedral'), (r'cerkev|kapela\b|kapelica|sinagog', 'church'),
                  (r'gradišče|tabor|obzidj|utrdb|trdnjav|\bgrad\b|grad,|gradu|stolp', 'castle'), (r'\bmost', 'bridge'),
                  (r'mlin|žag|kovačij|fužin|plavž|steklarn|pivovarn', 'mill'), (r'rudnik', 'mine')):
        if re.search(rx, t):
            return k
    if zvrst.startswith('naselja'):
        return 'settlement'
    if zvrst.startswith('arheolo'):
        return 'settlement' if re.search(r'naselbin|naselje', t) else 'site'
    return 'building'


def slovenia_rkd():
    out, skipped = [], Counter()
    for r in csv.DictReader(open(raw('slovenia-rkd-register', 'rnpd.csv'), encoding='utf-8-sig')):
        try:
            lon, lat = float(r['X']), float(r['Y'])
        except ValueError:
            skipped['no coordinates'] += 1
            continue
        if not (12.5 <= lon <= 17 and 45 <= lat <= 47.2):
            skipped['coordinates outside Slovenia'] += 1
            continue
        terms = [x for x in (si_term(s) for s in (r['DATACIJA'] or '').split(',')) if x]
        arch = r['ZVRST'].startswith('arheolo')
        kind = si_kind(r['ZVRST'], r['GESLA'], r['IME'])
        x = {'src': 'sirkd', 'id': r['ESD'], 'name': r['IME'][:80], 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': True,
             'ty': f"{r['GESLA'] or r['TIP']} · {r['DATACIJA'] or 'date not recorded'}"[:120], 'ctx': [r['OBCINA'].title()],
             'names': [(s.strip(), None, None, 'register synonym') for s in (r['SINONIMI'] or '').split(',') if s.strip()][:4]}
        if terms:
            lo = min(a for a, _, _ in terms)
            if lo > 1914:
                skipped['dated after 1914'] += 1
                continue
            if arch:
                hi = max(b for _, b, _ in terms)
                x['env'] = (lo, hi)
                x['per'] = f"{r['DATACIJA']} (register period, years approximate)"
            else:
                first = min(terms, key=lambda t: (t[0], t[1] - t[0]))
                x['env'] = (first[0], None)
                x['cw'] = first[1] - first[0] + 1
                x['per'] = f"built {r['DATACIJA']} (RKD register)"
        elif (r['DATACIJA'] or '').strip():
            skipped['dating only prehistoric or unparsed'] += 1
            continue
        out.append(x)
    return out, dict(skipped)


# ── Latvia: list of state-protected immovable monuments (National Heritage Board, data.gov.lv), CC0 ───────────
# The list has no coordinates: each monument is placed at the town or village its address names (GeoNames), else at
# its parish (pagasts) — approximate, and said so. 'Datejums' is the list's own dating: centuries with their parts,
# years, and archaeological periods (years per the Latvian convention, approximate).
LV_PERIOD = {'senākais dzelzs laikmets': (-500, 1), 'agrais dzelzs laikmets': (1, 400), 'vidējais dzelzs laikmets': (400, 800),
             'vēlais dzelzs laikmets': (800, 1200), 'dzelzs laikmets': (-500, 1200), 'viduslaiki': (1200, 1561), 'jaunie laiki': (1561, 1918)}
ROMAN_SMALL = {'I': 1, 'II': 2, 'III': 3, 'IV': 4}


def lv_terms(s):
    """'Datejums' → list of (from, to)."""
    s = re.sub(r'\s+', ' ', (s or '').replace('–', '-').replace('—', '-')).strip().lower()
    out = []
    # Archaeological periods, alone or as a range 'A - B' (an adjective may share the noun of B).
    if 'laikmets' in s or 'viduslaiki' in s or 'jaunie laiki' in s or 'neolīts' in s:
        for part in s.split(';'):
            ends = [e.strip() for e in part.split('-')]
            if len(ends) == 2 and 'laikmets' in ends[1] and 'laikmets' not in ends[0] and 'viduslaiki' not in ends[0]:
                noun = ends[1].split(' ', 1)[1] if ' ' in ends[1] else ''
                ends[0] = f'{ends[0]} {noun}'.strip()
            rng = [LV_PERIOD.get(e) if e in LV_PERIOD else ((-3000, -500) if re.search('bronzas|neolīt|akmens', e) else None) for e in ends]
            if all(rng):
                out.append((rng[0][0], rng[-1][1]))
    for m in re.finditer(r'(\d{1,2})\.?\s*(?:[/-]\s*(\d{1,2})\.?\s*)?gs\.?\s*(s\.|b\.|v\.|vidus|(\d|i{1,3}|iv)\s*\.?\s*(?:p\.?|puse|c\.?|cet\.?)|(\d0)\.?\s*g\.)?', s):
        c1 = int(m.group(1))
        c2 = int(m.group(2)) if m.group(2) else c1
        if not 1 <= c1 <= 20:
            continue
        a, b = (c1 - 1) * 100, c2 * 100 - 1
        sl = '/' in m.group(0).split('gs')[0]
        suf = (m.group(3) or '').strip()
        if sl:
            a, b = c1 * 100 - 10, c1 * 100 + 10  # '17./18. gs.': the turn of the centuries
        elif suf.startswith('s'):
            b = a + 20
        elif suf.startswith('b'):
            a = b - 20
        elif suf.startswith('v'):
            a, b = a + 40, a + 60
        elif m.group(5):
            a, b = a + int(m.group(5)), a + int(m.group(5)) + 9
        elif m.group(4):
            n = ROMAN_SMALL.get(m.group(4).upper()) or int(m.group(4)) if m.group(4).isdigit() or m.group(4).upper() in ROMAN_SMALL else None
            if n:
                if re.search(r'p\.?|puse', suf):
                    a, b = a + (n - 1) * 50, a + n * 50 - 1
                else:
                    a, b = a + (n - 1) * 25, a + n * 25 - 1
        out.append((max(1, a), b))
    for m in re.finditer(r'\b(1[0-9]{3})\.?\s*-\s*(1[0-9]{3})\b', s):
        out.append((int(m.group(1)), max(int(m.group(1)), int(m.group(2)))))
    s = re.sub(r'\b(1[0-9]{3})\.?\s*-\s*(1[0-9]{3})\b', ' ', s)
    for m in re.finditer(r'(ap\.?\s*)?\b(1[0-9]{3})\b', s):
        y = int(m.group(2))
        if not re.search(rf'{m.group(2)}\.?\s*g\.?\s*s', s):
            out.append((y - 10, y + 10) if m.group(1) else (y, y))
    return out


def lv_kind(name, group):
    t = f'{name} {group}'.lower()
    for rx, k in ((r'klosteris|klostera', 'monastery'), (r'katedrāle|doms\b', 'cathedral'), (r'baznīca|kapela|kapliča|sinagoga|lūgšanu nams', 'church'),
                  (r'pilskalns|pils\b|pilsdrupas|nocietināj|cietoksn|vaļņi', 'castle'), (r'dzirnavas|kalve|fabrika|ceplis', 'mill'), (r'\btilts', 'bridge'),
                  (r'apmetne|ciems|pilsētbūvniecība|vēsturiskais centrs', 'settlement')):
        if re.search(rx, t):
            return k
    return 'site' if 'arheolo' in t else 'building'


def latvia_monuments():
    gp, gadm = defaultdict(list), {}
    with zipfile.ZipFile(raw('latvia-monuments', 'geonames-LV.zip')) as gz:
        for line in io.TextIOWrapper(gz.open('LV.txt'), encoding='utf-8'):
            f = line.rstrip('\n').split('\t')
            ll = (float(f[5]), float(f[4]))
            if f[6] == 'P':
                for n in {f[1], f[2]}:
                    gp[norm(n)].append(ll)
            elif f[7] == 'ADM2':
                gadm[norm(f[1])] = ll
    out, skipped = [], Counter()
    for r in csv.DictReader(open(raw('latvia-monuments', 'saraksts.csv'), encoding='utf-8-sig'), delimiter=';'):
        if r['Veids'] != 'Nav kustams':
            continue  # movable works of art (altars, organs…) are listed under the building that holds them
        parts = [p.strip() for p in (r['Atrasanas_vieta'] or '').split(';')[0].split(',')]
        pag = next((p for p in parts if p.endswith('pag.')), None)
        towns = [p for p in parts[1:] if p and not p.endswith(('pag.', 'nov.')) and not re.search(r'\d|iela|laukums|bulvāris|ceļš', p)]
        if parts and parts[0] and not parts[0].endswith('nov.'):
            towns = [parts[0]] + towns  # Rīga, Daugavpils…: a city outside the municipalities
        ll, loc = None, None
        for t in towns:
            hits = gp.get(norm(t))
            if hits and (len(hits) == 1 or max(math.hypot(h[0] - hits[0][0], h[1] - hits[0][1]) for h in hits) < 0.1):
                ll, loc = hits[0], f'placed at {t} (GeoNames); the list gives an address, not coordinates'
                break
        if not ll and pag:
            ll = gadm.get(norm(pag.replace(' pag.', ' pagasts')))
            loc = f'placed at the centre of {pag.replace(" pag.", " parish")} (GeoNames); approximate' if ll else None
        if not ll:
            skipped['address not found in GeoNames'] += 1
            continue
        terms = lv_terms(r['Datejums'])
        kind = lv_kind(r['Nosaukums'], r['Tipologiska_grupa'])
        x = {'src': 'lvmon', 'id': r['Objekta_Nr'], 'name': r['Nosaukums'].strip()[:80], 'kind': kind, 'lon': round(ll[0], 5), 'lat': round(ll[1], 5),
             'precise': False, 'ty': f"{r['Tipologiska_grupa'].strip()} · {r['Datejums'] or 'date not recorded'}"[:120],
             'ctx': [p for p in parts[:2] if p], 'names': [], 'loc': loc}
        if terms:
            lo = min(a for a, _ in terms)
            if lo > 1914:
                skipped['dated after 1914'] += 1
                continue
            if kind in ('site', 'castle', 'settlement') and 'arheolo' in r['Tipologiska_grupa'].lower():
                x['env'] = (lo, max(b for _, b in terms))
                x['per'] = f"{r['Datejums']} (list dating; period years approximate)"
            else:
                first = min(terms, key=lambda t: (t[0], t[1] - t[0]))
                x['env'] = (first[0], None)
                x['cw'] = first[1] - first[0] + 1
                x['per'] = f"built {r['Datejums']} (Latvian monuments list)"
            if x['env'][1] is not None and x['env'][1] < 0:
                skipped['prehistoric only'] += 1
                continue
        out.append(x)
    return out, dict(skipped)


# ── Croatia: Register of cultural goods (Ministry of Culture and Media, data.gov.hr, Open Licence) ─────────────
# No coordinates: each immovable good is placed at the settlement the register names (GeoNames), approximate.
# 'Vrijeme_nastanka' is the register's own dating: 'A do B' with centuries (st.), years (god.) and BCE (p.n.e.).
def hr_point(t):
    t = t.strip().lower()
    m = re.fullmatch(r'(\d{1,2})\.?\s*st\.?\s*(p\.n\.e\.)?', t)
    if m:
        c = int(m.group(1))
        return ((-c * 100, -(c - 1) * 100 - 1) if m.group(2) else ((c - 1) * 100 or 1, c * 100 - 1))
    m = re.fullmatch(r'(\d{1,2})\.\s*pol\.\s*(\d{1,2})\.?\s*st\.?', t)
    if m:
        a = (int(m.group(2)) - 1) * 100 + (int(m.group(1)) - 1) * 50
        return a, a + 49
    m = re.fullmatch(r'(\d{1,6})\.?\s*god\.?\s*(p\.n\.e\.)?', t)
    if m:
        y = int(m.group(1))
        if m.group(2):
            return -y, -y
        return (y, y) if y >= 100 else None  # '17. god.' is ambiguous (a year 17, or a slip for a century): not used
    return None


def hr_dating(s):
    s = re.sub(r'\s+', ' ', (s or '').strip())
    if not s:
        return None
    s = re.sub(r'^od\s+', '', s)
    parts = [p for p in re.split(r'\s+do\s+', s) if p]
    pts = [hr_point(p) for p in parts]
    if not pts or not all(pts):
        return None
    return pts[0][0], pts[-1][1]


def hr_kind(name, cls):
    t = f'{name} {cls}'.lower()
    for rx, k in ((r'samostan|opatij', 'monastery'), (r'katedral', 'cathedral'), (r'crkv|kapel|sinagog|džamij', 'church'),
                  (r'utvrd|kaštel|\bgrad\b|tvrđ|kula|zidin|gradin', 'castle'), (r'\bmost', 'bridge'), (r'mlin|majdan|rudnik|tvornic', 'mill'),
                  (r'kulturno-povijesna cjelina|naselj|selo', 'settlement')):
        if re.search(rx, t):
            return k
    return 'site' if 'arheolo' in t else 'building'


def croatia_goods():
    gp = defaultdict(list)
    with zipfile.ZipFile(raw('croatia-cultural-goods', 'geonames-HR.zip')) as gz:
        for line in io.TextIOWrapper(gz.open('HR.txt'), encoding='utf-8'):
            f = line.rstrip('\n').split('\t')
            if f[6] == 'P':
                for n in {f[1], f[2]}:
                    gp[norm(n)].append((float(f[5]), float(f[4])))
    out, skipped = [], Counter()
    for r in json.load(open(raw('croatia-cultural-goods', 'data.json'), encoding='utf-8')):
        if not r['Vrsta_kulturnog_dobra'].startswith('nepokretno'):
            continue  # movable goods are kept where they are held, not mapped
        ll, loc = None, None
        for t in (r['Mjesto_smjestaja'], (r['Opcina_grad'] or '').title()):
            hits = gp.get(norm(t or ''))
            if hits and (len(hits) == 1 or max(math.hypot(h[0] - hits[0][0], h[1] - hits[0][1]) for h in hits) < 0.15):
                ll, loc = hits[0], f'placed at {t} (GeoNames); the register gives a place name, not coordinates'
                break
        if not ll:
            skipped['settlement not found or ambiguous in GeoNames'] += 1
            continue
        when = hr_dating(r['Vrijeme_nastanka'])
        kind = hr_kind(r['Naziv'], r['Klasifikacija'])
        x = {'src': 'hrreg', 'id': r['Oznaka_dobra'] or str(r['id']), 'name': (r['Naziv'] or '').strip()[:80], 'kind': kind, 'lon': round(ll[0], 5),
             'lat': round(ll[1], 5), 'precise': False, 'ty': f"{r['Klasifikacija']} · {r['Vrijeme_nastanka'] or 'date not recorded'}"[:120],
             'ctx': [c for c in (r['Mjesto_smjestaja'], r['Zupanija']) if c], 'names': [], 'loc': loc}
        if when:
            if when[0] > 1914:
                skipped['dated after 1914'] += 1
                continue
            if when[1] < 1:
                skipped['prehistoric or BCE only'] += 1
                continue
            if 'arheolo' in r['Klasifikacija']:
                x['env'] = (max(when[0], -800), when[1])
                x['per'] = f"{r['Vrijeme_nastanka']} (register dating)"
            else:
                x['env'] = (when[0], None)
                x['cw'] = when[1] - when[0] + 1  # the register's whole stated span, however broad
                x['per'] = f"built {r['Vrijeme_nastanka']} (Croatian register)"
        elif (r['Vrijeme_nastanka'] or '').strip():
            skipped['dating not parsed (kept undated)'] += 1
        out.append(x)
    return out, dict(skipped)


# ── Balkans: places on the Russian 3-verst military map (Boykov, Zenodo 8411078), CC BY 4.0 ───────────────────
# The map was surveyed by Russian military topographers during and after the war of 1877–78; places are shown for
# that survey period only. As in Boykov's Generalkarte gazetteer, the longitude/latitude columns are exchanged.
R3V_PERIOD = (1877, 1879)
R3V_KIND = {'settlement': 'settlement', 'settlement_huts': 'settlement', 'settlement_chiftlik': 'settlement', 'monastery': 'monastery', 'chapel': 'church',
            'mosque': 'church', 'teke': 'church', 'fortress': 'fortification', 'tower': 'fortification', 'bridge': 'bridge', 'watermill': 'mill',
            'fulling-mill': 'mill', 'ore deposits': 'mine', 'han': 'road', 'ruins': 'site', 'villa': 'building', 'bath': 'building', 'winery': 'building'}


def russian_3verst():
    out, swapped = [], 0
    with open(raw('russian-3verst-gazetteer', 'Russian_3verst.csv'), encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            try:
                a, b = float(r['longitude']), float(r['latitude'])
            except ValueError:
                continue
            lon, lat = (b, a) if 35 <= a <= 48 and 13 <= b <= 32 else (a, b)
            swapped += (lon, lat) == (b, a)
            out.append({'src': 'r3verst', 'id': f"{r['Name']}:{round(lat, 4)}:{round(lon, 4)}", 'name': r['Name'], 'kind': R3V_KIND.get(r['Type'], 'site'),
                        'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': True, 'env': R3V_PERIOD,
                        'per': 'shown on the Russian 3-verst military map (surveyed 1877–1879)',
                        'ty': r['Type'] + (f" · today {r['Description']}" if r.get('Description') else ''), 'ctx': [],
                        'names': [(r['Name'], 1878, None, 'map form (Russian 3-verst map)')] + [(n.strip(), None, None, '') for n in (r.get('AltName') or '').split(';') if n.strip()]
                        + ([(r['Description'], None, None, 'modern name')] if r.get('Description') else [])})
    return out, {'latitude and longitude columns exchanged in the source (corrected)': swapped}


# ── Romania: settlements of the Kingdom of Romania, 1904–1913 (RoHGIS, Zenodo 15613857), CC BY 4.0 ────────────
# Every settlement that existed between the 1904 law on rural communes and the 1913 law on New Dobrogea.
def rohgis_settlements():
    out = []
    with open(raw('rohgis-settlements-1904-1913', 'rohgis_setro_0413.csv'), encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            try:
                lon, lat = float(r['long']), float(r['lat'])
            except ValueError:
                continue
            urban = (r.get('tip') or r.get('categ')) == '06'
            out.append({'src': 'rohgis', 'id': r['rd_a'], 'name': r['nume'], 'kind': 'settlement', 'lon': round(lon, 5), 'lat': round(lat, 5),
                        'precise': True, 'env': (1904, 1913), 'per': 'a settlement of the Kingdom of Romania, 1904–1913 (RoHGIS)',
                        'ty': 'urban settlement' if urban else 'rural settlement', 'ctx': [],
                        'names': [(r['nume'], 1910, None, 'ro-1904-1913')] + [(n.strip(), None, None, 'official variant') for n in (r.get('nume_alt') or '').split(';') if n.strip()]})
    return out


# ── Iceland: TransIce shielings and farms (Fornleifastofnun Íslands, Zenodo 17537206), CC BY 4.0 ──────────────
# Farms: those with an owner recorded in the Jarðabók of 1703 are a 1703 snapshot (listed then). Shielings: the
# dataset's own first mention and abandonment years (first mention is not a founding: the shieling is shown from
# it to its abandonment, or only around that year when no abandonment is recorded); else in use in 1703 if
# the Jarðabók says so. Nothing else is dated.
def iceland_transice():
    import shapefile
    from pyproj import Transformer
    tr = Transformer.from_crs('EPSG:3057', 'EPSG:4326', always_xy=True)
    z = zipfile.ZipFile(raw('transice-iceland', 'TransIce_dataset_WP1.zip'))
    part = lambda n, e: io.BytesIO(z.read(f'TransIce_dataset_WP1/{n}.{e}'))  # noqa: E731
    reader = lambda n, enc: shapefile.Reader(shp=part(n, 'shp'), shx=part(n, 'shx'), dbf=part(n, 'dbf'), encoding=enc, encodingErrors='replace')  # noqa: E731
    out, skipped = [], Counter()
    farms = reader('farms', 'cp1252')  # no .cpg: Windows-1252, as the Icelandic letters show
    for sh, rec in zip(farms.iterShapes(), farms.iterRecords()):
        if not sh.points:
            continue
        lon, lat = tr.transform(*sh.points[0])
        x = {'src': 'transice', 'id': rec['id'], 'name': rec['place_name'] or rec['id'], 'kind': 'settlement', 'lon': round(lon, 5), 'lat': round(lat, 5),
             'precise': True, 'ty': 'farm' + (f" · owner 1703: {rec['owner_1703']}" if rec['owner_1703'] else ''), 'ctx': [], 'names': []}
        if rec['owner_1703']:
            x.update(snap=1703, per='farm listed in the Jarðabók of 1703 (Árni Magnússon and Páll Vídalín)')
            x['names'] = [(x['name'], 1703, None, 'is-1703')]
        else:
            skipped['farm without a 1703 entry (undated)'] += 1
        out.append(x)
    sh_r = reader('shielings', 'utf-8')
    for sh, rec in zip(sh_r.iterShapes(), sh_r.iterRecords()):
        if not sh.points:
            continue
        lon, lat = tr.transform(*sh.points[0])
        x = {'src': 'transice', 'id': rec['id'], 'name': rec['place_name'] or 'Shieling', 'kind': 'site', 'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': True,
             'ty': 'shieling' + (f" · {rec['no_of_ruin']} ruins" if rec['no_of_ruin'] else ''), 'ctx': [], 'names': []}
        fm, ab = rec['first_ment'], rec['abandoned']
        if fm and ab and ab >= fm:
            x.update(env=(fm, ab), per=f'shieling: first mentioned {fm}, abandoned {ab} (TransIce)')
        elif fm:
            x.update(snap=fm, per=f'shieling: first mentioned {fm} (TransIce); nothing recorded before or after')
        elif rec['1703'] == 'Yes':
            x.update(snap=1703, per='shieling in use in 1703 (Jarðabók)')
        out.append(x)
    return out, dict(skipped)


# ── Places in medieval inquisition registers: DISSILOC (DISSINET, Masaryk University; Zenodo 21031406), CC BY-SA 4.0 ──
# A place named in a register existed when the register was written (an attestation). The register's years are
# taken from its own edition title as DISSILOC lists it (README, 'Source registers'); where the title gives only a
# century, that century. Stettin's edition title gives no date: those places stay undated.
DISSILOC_YEARS = {'Ablis': (1308, 1309), 'Bologna': (1291, 1310), 'CarcassonneHHH': (1246, 1247), 'Fournier': (1318, 1325), 'Gui': (1308, 1323),
                  'Seila': (1241, 1242), 'Settimo': (1387, 1387), 'lollard_locations': (1428, 1522), 'Toulouse': (1200, 1299), 'Orvieto': (1200, 1299),
                  'Casasco': (1300, 1399), 'Castellario': (1300, 1399), 'Gallus': (1300, 1399), 'Guglielmites': (1300, 1300)}
DISSILOC_KIND = {'settlement': 'settlement', 'church': 'church', 'religious house': 'monastery', 'castle': 'castle', 'parish': 'church', 'settlement part': 'settlement',
                 'chapel': 'church', 'fortress': 'fortification', 'fortification': 'fortification', 'bridge': 'bridge', 'hermitage': 'monastery'}


def dissiloc():
    """One record per place (DISSILOC's 'preferred' row and its cross-register identifications), attested from its
    earliest to its latest register: a place named in registers of 1246 and 1323 existed in between."""
    rows = list(csv.DictReader(open(raw('dissiloc-inquisition-places', 'dissiloc.tsv'), encoding='utf-8'), delimiter='\t'))
    group = defaultdict(list)
    for r in rows:
        group[r['canonical_id'] or r['id']].append(r)
    out, skipped = [], Counter()
    for gid, rs in group.items():
        head = next((r for r in rs if r['preferred'] == 'TRUE'), rs[0])
        kind = DISSILOC_KIND.get(head['location_type'])
        if not kind:
            skipped['houses, rooms, streets, regions and other features not mapped as places'] += 1
            continue
        if not head['latitude'] or head['coord_source_type'] not in ('original', 'nearby', 'superordinate (immediate)'):
            skipped['no coordinates of its own or of its immediate container'] += 1
            continue
        yrs = [DISSILOC_YEARS[r['case']] for r in rs if r['case'] in DISSILOC_YEARS]
        cases = sorted({r['case'] for r in rs})
        forms = []
        for r in rs:
            # A label may list several forms ('Roma; civitas Rome; de'): keep each real name once.
            for form in (f.strip() for f in (r['label'] or '').split(';')):
                if len(form) >= 3 and form[0].isupper() and form not in [f[0] for f in forms]:
                    y = DISSILOC_YEARS.get(r['case'])
                    forms.append((form, y[0] if y else None, None, f"{r['label_language'] or 'form'} in the {r['case']} register"))
        x = {'src': 'dissiloc', 'id': gid, 'name': (head['label'] or '').split(';')[0].strip(), 'kind': kind, 'lon': float(head['longitude']), 'lat': float(head['latitude']),
             'precise': head['coord_source_type'] == 'original', 'ty': f"{head['location_type']} · named in {', '.join(cases)} inquisition register{'s' if len(cases) > 1 else ''}",
             'ctx': [], 'names': forms[:6]}
        if yrs:
            lo, hi = min(a for a, _ in yrs), max(b for _, b in yrs)
            x.update(env=(lo, hi), per=f"named in inquisition registers of {lo}{'' if lo == hi else '–' + str(hi)} ({', '.join(cases)}; DISSILOC)")
        else:
            skipped['register undated in its edition title (kept undated)'] += 1
        out.append(x)
    return out, dict(skipped)


# ── Sweden: the older geometrical maps, 1630–1655 (Vitterhetsakademien / Riksarkivet; Zenodo 15121019), CC BY 4.0 ──
# Settlement units, churches, mills and other objects drawn on the large-scale land-survey maps of 1630–1655. The
# dataset does not give each map's year, so each record is shown for the survey's own years — evidence that it existed
# then (a 25-year window, the span of the maps it is drawn on).
SWE_PERIOD = (1630, 1655)


def sweden_geometric():
    base = lambda f: raw('sweden-geometric-maps-1630-1655', f)  # noqa: E731
    out, skipped = [], Counter()
    for r in csv.DictReader(open(base('Basic_settlement_unit_v1.0.csv'), encoding='utf-8-sig'), delimiter=';'):
        try:
            lat, lon = float(r['tora_wgs84_lat']), float(r['tora_wgs84_long'])
        except ValueError:
            skipped['settlement unit without coordinates'] += 1
            continue
        out.append({'src': 'swegeo', 'id': f"s{r['toraid']}", 'name': r['tora_prefLabel'], 'kind': 'settlement', 'lon': round(lon, 5), 'lat': round(lat, 5),
                    'precise': r['tora_coordinate_accuracy'] == 'high', 'env': SWE_PERIOD, 'per': 'on the older geometrical maps (Swedish land survey, 1630–1655)',
                    'ty': 'settlement unit' + (f" · map {r['tora_source']}" if r.get('tora_source') else ''), 'ctx': [c for c in (r['parish'], r['tora_province']) if c],
                    'names': [(r['tora_prefLabel'], 1640, None, 'sv (geometrical maps 1630–1655)')] + [(n.strip(), None, None, '') for n in (r['tora_altLabel'] or '').split(',') if n.strip()][:3]})
    for f, kind, label in (('Map_object-church_v1.0.csv', 'church', 'church'), ('Map_object-watermill_v1.0.csv', 'mill', 'watermill'),
                           ('Map_object-windmill_v1.0.csv', 'mill', 'windmill'), ('Map_object-industry_v1.0.csv', 'mill', 'industry'),
                           ('Map_object-ancient_monument_v1.0.csv', 'site', 'ancient monument')):
        for r in csv.DictReader(open(base(f), encoding='utf-8-sig'), delimiter=';'):
            try:
                lat, lon = float(r['wgs84_lat']), float(r['wgs84_long'])
            except ValueError:
                skipped[f'{label} without coordinates'] += 1
                continue
            name = r['note'] or f"{label.capitalize()}, {r.get('namn_deprecated') or ''}".strip(', ')
            out.append({'src': 'swegeo', 'id': f"{label[:3]}{r['id']}", 'name': name[:80], 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5),
                        'precise': r['coordinate_accuracy'] == 'high', 'env': SWE_PERIOD, 'per': 'drawn on the older geometrical maps (Swedish land survey, 1630–1655)',
                        'ty': label + (f" · at {r['namn_deprecated']}" if r.get('namn_deprecated') else ''), 'ctx': [r['namn_deprecated']] if r.get('namn_deprecated') else [], 'names': []})
    return out, dict(skipped)


# ── Tyrol: places in the mining documents Hs. 37 and Hs. 1587 (Text Mining Medieval Mining Texts, Innsbruck;
#    Zenodo 6368451), CC BY 4.0. A place named in a document is attested in that document's years ('approx.' ±10).
def tyrol_mining():
    out, skipped = [], Counter()
    for r in csv.DictReader(open(raw('tyrol-mining-gazetteer', 'historical_place_gazetteer_tyrol_links_202203.csv'), encoding='utf-8-sig'), delimiter=';'):
        try:
            lat, lon = float(r['lat']), float(r['long'])
        except ValueError:
            skipped['not localised in the source'] += 1
            continue
        y = r['year'] or ''
        m = re.search(r'(1[0-9]{3})\s*-\s*(1[0-9]{3})', y)
        if m:
            env = (int(m.group(1)), int(m.group(2)))
        else:
            m = re.search(r'(1[0-9]{3})', y)
            env = ((int(m.group(1)) - 10, int(m.group(1)) + 10) if 'approx' in y else (int(m.group(1)), int(m.group(1)))) if m else None
        x = {'src': 'tyrolmine', 'id': r['place_id'], 'name': r['place_neu'], 'kind': 'settlement', 'lon': round(lon, 5), 'lat': round(lat, 5),
             'precise': r['precision'] == 'exact', 'ty': f"place in mining document {r['document']} ({y})", 'ctx': [c for c in (r['municipality'], r['district']) if c],
             'names': [(n.strip(), env[0] if env else None, None, 'ENHG (document form)') for n in (r['alternate_names'] or '').split('|') if n.strip()][:4]}
        if env:
            x.update(env=env, per=f"named in the Tyrolean mining document {r['document']} ({y})")
        out.append(x)
    return out, dict(skipped)


# ── ARIADNE portal (European archaeology catalogue): records harvested by scripts/historical-data/fetch_ariadne.py ──
# Each record keeps its own periods (from/until, linked to PeriodO). Separate periods of one site (Late Roman and
# Árpád-age, say) stay separate phases — never one span across the gap. Records without a point of their own are
# placed at the municipality their title names (GeoNames, approximate) where that name is unique in the country.
# Licences differ per provider (accessRights): private pack only.
ARIADNE_KIND = [(r'castle|vár\b|burg|fort|hillfort|földvár|kastély|virki', 'castle'), (r'monaster|kolostor|abbey|kloster|klaustur', 'monastery'),
                (r'church|templom|kirche|kirkja|chapel|kápolna', 'church'), (r'settlement|település|village|falu|bær|farm|town|város', 'settlement'),
                (r'mill|malom|mine|bánya|kiln|smiðja|workshop', 'mill'), (r'road|út\b|bridge|híd', 'road'), (r'wreck|ship', 'wreck')]


def ariadne_phases(temporal):
    """Periods of a record → merged phases (overlapping or within 50 years), each (from, to, names)."""
    ps = []
    for t in temporal or []:
        try:
            a, b = int(t.get('from')), int(t.get('until'))
        except (TypeError, ValueError):
            continue
        if b < 1 or a > 1914 or b < a:
            continue
        ps.append((a, b, t.get('periodName') or ''))
    ps.sort()
    out = []
    for a, b, n in ps:
        if out and a <= out[-1][1] + 50:
            out[-1] = (out[-1][0], max(out[-1][1], b), out[-1][2] + ([n] if n not in out[-1][2] else []))
        else:
            out.append((a, b, [n]))
    return out


def ariadne():
    base = raw('ariadne', '')
    out, skipped = [], Counter()
    gn, seen_ids = {}, set()
    for f in sorted(os.listdir(base)) if os.path.isdir(base) else []:
        if not f.endswith('.jsonl.gz'):
            continue
        country = re.sub(r'\.part\d+$', '', f[:-9]).replace('_', ' ')
        cc = {'Hungary': 'HU'}.get(country)
        if cc and cc not in gn:
            idx = defaultdict(list)
            with zipfile.ZipFile(os.path.join(base, f'geonames-{cc}.zip')) as z:
                for line in io.TextIOWrapper(z.open(f'{cc}.txt'), encoding='utf-8'):
                    g = line.split('\t')
                    if g[6] == 'P':
                        for n in {g[1], g[2]}:
                            idx[norm(n)].append((float(g[5]), float(g[4])))
            gn[cc] = idx
        def lines(path):
            try:
                with gzip.open(path, 'rt', encoding='utf-8') as fh:
                    yield from fh
            except (EOFError, OSError):
                skipped['file cut off by an interrupted harvest (complete records kept)'] += 1
        if True:
            for line in lines(os.path.join(base, f)):
                try:
                    h = json.loads(line)
                except ValueError:
                    continue  # a line cut off by an interrupted harvest
                if h['id'] in seen_ids:
                    continue
                seen_ids.add(h['id'])
                d = h['data']
                phases = ariadne_phases(d.get('temporal'))
                if not phases:
                    skipped['no period between 1 and 1914'] += 1
                    continue
                pt = next((s.get('geopoint') for s in d.get('spatial') or [] if s.get('geopoint')), None)
                precise, loc = True, None
                if pt:
                    lon, lat = float(pt['lon']), float(pt['lat'])
                else:
                    town = (d.get('title') or {}).get('text', '').split(',')[0].strip()
                    hits = gn.get(cc, {}).get(norm(town)) if cc else None
                    if not hits or (len(hits) > 1 and max(math.hypot(x[0] - hits[0][0], x[1] - hits[0][1]) for x in hits) > 0.1):
                        skipped['no point, municipality not found or ambiguous'] += 1
                        continue
                    (lon, lat), precise, loc = hits[0], False, f'placed at {town} (GeoNames); the record gives no point'
                subj = ' '.join(s.get('prefLabel', '') for s in (d.get('derivedSubject') or []) + (d.get('nativeSubject') or [])).lower()
                title = (d.get('title') or {}).get('text') or 'Site'
                kind = next((k for rx, k in ARIADNE_KIND if re.search(rx, f'{subj} {title.lower()}')), 'site')
                pub = ((d.get('publisher') or [{}])[0] or {}).get('name') or 'ARIADNE'
                for i, (a, b, names) in enumerate(phases):
                    out.append({'src': 'ariadne', 'id': h['id'][:16] + (f'-{i}' if len(phases) > 1 else ''), 'name': title[:80], 'kind': kind,
                                'lon': round(lon, 5), 'lat': round(lat, 5), 'precise': precise, 'env': (a, b),
                                'per': f"{', '.join(n for n in names if n)} ({pub}, via ARIADNE)", 'ty': (subj[:80] or 'archaeological record'),
                                'ctx': [country], 'names': [], 'loc': loc, 'rights': d.get('accessRights')})
    return out, dict(skipped)


# ── Slovenia: Arkas 2.0 archaeological sites (ZRC SAZU; Zenodo 7820725), CC BY-SA 4.0 ─────────────────────────
# Each site has its own dating in years (Leto_od, Leto_do) and the period it names; used as given.
ARKAS_KIND = {'naselje': 'settlement', 'grobišče': 'site', 'nepremične ostaline': 'site', 'posamična najdba': 'site', 'depo': 'site', 'bivališče': 'settlement'}


def arkas():
    out, skipped = [], Counter()
    for r in csv.DictReader(open(raw('arkas-slovenia', '1_Najdisca_2023-Apr-12_0708.csv'), encoding='utf-8-sig')):
        try:
            a, b = int(float(r['Leto_od'])), int(float(r['Leto_do']))
            lon, lat = float(r['LongX']), float(r['LatY'])
        except ValueError:
            skipped['no years or no position'] += 1
            continue
        if b < 1 or a > 1914:
            skipped['dated outside 1–1914'] += 1
            continue
        kind = ARKAS_KIND.get(r['Vrsta_najdisca'], 'site')
        if re.search(r'grad|utrdb|gradišče', (r['Ime_najdisca'] + ' ' + r['Opredelitev']).lower()):
            kind = 'castle' if kind == 'site' else kind
        out.append({'src': 'arkas', 'id': r['ID_Najdisce'], 'name': r['Ime_najdisca'][:80] or r['Ime_naselja'], 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5),
                    'precise': r['Natancnost_Lokacije'] in ('1', '2'), 'env': (max(a, -800), b),
                    'per': f"{r['Datacija']} (Arkas dating)",
                    'ty': f"{r['Vrsta_najdisca']} · {r['Opredelitev']}"[:120], 'ctx': [c for c in (r['Ime_naselja'], r['Regija']) if c], 'names': []})
    return out, dict(skipped)


# ── Poland-Lithuania: Atlas of the Latin Church c. 1772 (IHGK Lublin, after Litak; Zenodo 10912495), CC BY-NC 4.0 ──
# The atlas reconstructs the Church's structure around 1772: each church and religious house is a 1772 snapshot.
def latin_church_1772():
    z = zipfile.ZipFile(raw('latin-church-1772', 'latin_church_1772-v1.zip'))
    base = next(n for n in z.namelist() if n.endswith('/'))
    out = []
    for f, kind in (('churches.geojson', 'church'), ('monasteries.geojson', 'monastery')):
        for ft in json.loads(z.read(base + f))['features']:
            g = ft.get('geometry') or {}
            pts = g.get('coordinates') or []
            if not pts:
                continue
            x, y = pts[0] if g.get('type') == 'MultiPoint' else pts
            # Coordinates are Web Mercator metres (the file's EPSG:3857), not degrees.
            lon, lat = math.degrees(x / 6378137.0), math.degrees(2 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2)
            p = ft['properties']
            if kind == 'church':
                name = f"{p.get('title') or 'Church'}, {p.get('pl_name')}" if p.get('title') else f"Church, {p.get('pl_name')}"
                ty = f"{'parish church' if p.get('type') == 'świątynia główna' else 'auxiliary church'} · deanery {p.get('deanery')}, diocese {p.get('diocese')}"
            else:
                name = p.get('name') or f"Religious house, {p.get('pl_name')}"
                ty = f"{'nunnery' if p.get('category') == 'z' else 'monastery'} at {p.get('pl_name')}, diocese {p.get('diocese')}"
            out.append({'src': 'latin1772', 'id': f"{kind[0]}{p.get('ob_id')}", 'name': name[:80], 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5),
                        'precise': True, 'snap': 1772, 'per': 'Latin Church in the Polish-Lithuanian Commonwealth c. 1772 (Litak atlas)', 'ty': ty[:120],
                        'ctx': [c for c in (p.get('pl_name'), p.get('diocese')) if c], 'names': []})
    return out


# ── Wikidata (CC0): dated churches, mosques, synagogues, manors, hillforts, caravanserais, and settlements first ──
# recorded 1600–1914 (wikidata_snapshot.py, 2026-10 classes). Items already in the medieval snapshot are left to it.
# Dates are Wikidata's own statements read at their recorded precision: an inception entered as "17th century" is a
# 1601–1700 window, never the year 1600. A first written mention (P1249) is labelled as such, never as a founding.
WD_EXTRA = (('church', 'church'), ('mosque', 'church'), ('synagogue', 'church'), ('hillfort', 'castle'),
            ('caravanserai', 'building'), ('manor', 'building'), ('settlement_late', 'settlement'),
            ('lighthouse', 'lighthouse'), ('port', 'harbour'), ('canal', 'canal'), ('watermill', 'mill'), ('windmill', 'mill'),
            ('mine', 'mine'), ('station', 'station'), ('bridge_late', 'bridge'))
WD_EXTRA_TYPE = {'church': 'church', 'mosque': 'mosque', 'synagogue': 'synagogue', 'hillfort': 'hillfort',
                 'caravanserai': 'caravanserai', 'manor': 'manor house', 'settlement_late': 'settlement',
                 'lighthouse': 'lighthouse', 'port': 'port', 'canal': 'canal', 'watermill': 'watermill', 'windmill': 'windmill',
                 'mine': 'mine', 'station': 'railway station', 'bridge_late': 'bridge'}
WD_OLD_KINDS = ('castle', 'monastery', 'cathedral', 'diocese', 'battle', 'siege', 'fortification', 'university', 'bridge', 'settlement')
# Administrative units filed under "settlement" whose inception is the unit's creation (Sweden's and Finland's 1863
# rural municipalities, Czech cadastral areas, Russian administrative divisions), not a settlement's beginning.
WD_ADMIN = re.compile(r'municipality|administrative|cadastral|district|neighbo(u)?rhood|city block|former settlement')
WD_LANGS = 'mul de fr it es pt ca nl pl cs sk hu ro hr sl sv da nb fi is la lt lv et ga cy eu gl sq tr sr-el sh lb rm fy se hsb'.split()


def _wd_q(cell):
    return cell.strip('<>"').rsplit('/', 1)[-1]


def _wd_year(t):
    m = re.match(r'"?([+-]?\d+)-', t or '')
    return int(m.group(1)) if m else None


def wd_window(y, prec):
    """The years a Wikidata time value covers at its precision: (from, to)."""
    if prec is None or prec >= 9:
        return y, y
    if prec == 8:
        d = y - y % 10
        return d, d + 9
    if prec == 7:
        c = -((-y) // 100) if y > 0 else y // 100  # Wikibase: year Y at century precision is century ceil(Y/100)
        return (c - 1) * 100 + 1, c * 100
    return None  # millennium or coarser: too vague to place in time


def wikidata_extra():
    import translit
    d = os.path.join(RAW, 'wikidata-medieval', 'original')
    labels = {}
    for r in csv.reader(open(os.path.join(d, 'labels.tsv'), encoding='utf-8'), delimiter='\t'):
        if len(r) > 1 and '/entity/' in r[0]:
            labels[_wd_q(r[0])] = r[1].rsplit('@', 1)[0].strip('"')
    seen = set()
    for k in WD_OLD_KINDS:
        p = os.path.join(d, f'{k}.tsv')
        if os.path.exists(p):
            seen.update(_wd_q(line.split('\t', 1)[0]) for line in open(p, encoding='utf-8') if line.startswith('<'))
    out, skipped = [], Counter()
    for src_kind, kind in WD_EXTRA:
        path = os.path.join(d, f'{src_kind}.tsv')
        if not os.path.exists(path):
            continue
        prec = {}
        pp = os.path.join(d, f'{src_kind}.precision.tsv')
        if os.path.exists(pp):
            for r in csv.reader(open(pp, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
                if len(r) >= 4 and r[0].startswith('<'):
                    y = _wd_year(r[2])
                    if y is not None and r[3].strip('"').isdigit():
                        key = (_wd_q(r[0]), r[1].strip('"'), y)
                        prec[key] = min(prec.get(key, 99), int(r[3].strip('"')))
        names = {}
        for r in csv.reader(open(os.path.join(d, f'{src_kind}.names.tsv'), encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
            if len(r) > 1 and r[0].startswith('<'):
                nm = {}
                for part in r[1].strip('"').split('|'):
                    lang, _, lab = part.partition(':')
                    if lab and lang not in nm:
                        nm[lang] = lab.replace('\\"', '"')
                names[_wd_q(r[0])] = nm
        for r in csv.reader(open(path, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
            if not r[0].startswith('<'):
                continue
            q = _wd_q(r[0])
            if q in seen:
                skipped['already in the medieval snapshot or an earlier class'] += 1
                continue
            seen.add(q)
            m = re.match(r'POINT\(([-\d.eE]+) ([-\d.eE]+)\)', r[1])
            if not m:
                continue
            types = [labels.get(_wd_q(x), '') for x in r[13].strip('"').split('|') if x]
            if src_kind == 'settlement_late' and any(WD_ADMIN.search(t.lower()) for t in types):
                skipped['administrative unit, not a settlement'] += 1
                continue
            nm = names.get(q, {})
            en = r[2].rsplit('@', 1)[0].strip('"').replace('\\"', '"') if r[2] else ''
            title = en or next((nm[lg] for lg in WD_LANGS if nm.get(lg)), '')
            name_note = None
            if not title:
                rz = translit.romanize(nm)  # a published standard scheme (Cyrillic, Greek, Georgian), as the Wikidata layer does
                if not rz:
                    skipped['no label in a Latin script or a romanizable one'] += 1
                    continue
                title, name_note = rz[0], f'name romanized from {rz[1]} ({rz[2]})'
            # The earliest dated statement, at its own precision.
            cands = []
            for prop, cell in (('P571', r[3]), ('P1249', r[4])):
                y = _wd_year(cell)
                if y is None:
                    continue
                w = wd_window(y, prec.get((q, prop, y)))
                if w is None:
                    skipped['date only to the millennium'] += 1
                    continue
                cands.append((w, prop))
            if not cands:
                skipped['no usable date'] += 1
                continue
            (lo, hi), prop = min(cands)
            end = _wd_year(r[5])
            if end is not None and end < hi:
                end = None  # an end before the start: the source's dates disagree; the end is not used
            if prop == 'P1249':
                basis = 'first written mention (Wikidata)'
            elif kind == 'settlement':
                basis = 'recorded start (Wikidata inception — may be a first record, not a founding)'
            elif kind == 'station':
                basis = 'opened (Wikidata inception)'
            else:
                basis = 'founded or built (Wikidata inception)'
            if hi > lo:
                basis += f', known only to {lo}–{hi}'
            rec = {'src': 'wdextra', 'id': q, 'name': title[:80], 'kind': kind, 'lon': round(float(m.group(1)), 5), 'lat': round(float(m.group(2)), 5),
                   'precise': True, 'env': (lo, end), 'per': basis,
                   'ty': ' · '.join([WD_EXTRA_TYPE[src_kind]] + [t for t in types[:2] if t and t != WD_EXTRA_TYPE[src_kind]] + ([name_note] if name_note else []))[:120],
                   'ctx': [], 'names': [(v, None, None, lg) for lg, v in sorted(nm.items()) if v != title][:6]}
            if hi > lo:
                rec['cw'] = hi - lo + 1
            out.append(rec)
    return out, dict(skipped)
