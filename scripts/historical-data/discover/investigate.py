#!/usr/bin/env python3
"""Investigate candidates from the inventory automatically, and record what was found as an investigation state.

  python3 scripts/historical-data/discover/investigate.py [--limit N] [--min-relevance R] [--workers W]
    → data/historical/discovery/investigations.jsonl.gz   one line per investigated candidate (latest wins)

States (in order of depth; a candidate keeps the deepest it reached):
  discovered, catalogue-only            in the inventory, nothing beyond the catalogue record (set by inventory.py)
  metadata-inspected                    the repository's own API was asked for the file list / service description
  data-inspected                        a sample of the data itself was read and profiled
  promising                             the data has positions AND dates of its own
  high-priority                         promising AND it targets cells the coverage matrix shows weak
  insufficient-temporal                 positions but no dates of its own (in fields or values)
  insufficient-spatial                  dates but no positions / geometry
  acquisition-attempted, acquired, validated, integrated, rejected, blocked, duplicate, irrelevant
                                        set from decisions.json (people's / earlier passes' decisions), never guessed here
Every state carries its evidence (file names, column names, sample values), so it can be checked.

Order: highest "need" first — relevance × how weak the coverage cells it names are (coverage-centuries.json).
"""
import csv
import gzip
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..', '..')
DISC = os.path.join(ROOT, 'data', 'historical', 'discovery')
OUT = os.path.join(DISC, 'investigations.jsonl.gz')
UA = 'ShelfResearch/1.0 (personal historical atlas; https://github.com/yosefliberman770-source/shelf)'
MAX_BYTES = 40_000_000
GEO_EXT = {'gpkg', 'geojson', 'shp', 'kml', 'kmz', 'gml', 'json', 'fgb', 'sqlite', 'gdb'}
TAB_EXT = {'csv', 'tsv', 'txt', 'xlsx', 'xls', 'ods', 'dbf', 'tab'}
ARCH_EXT = {'zip'}

# Inventory region groups → coverage-matrix regions.
REGION_MAP = {
    'France': ['France'], 'Germany': ['Germany'], 'Italy': ['Italy'], 'Spain': ['Spain'], 'Portugal': ['Portugal'],
    'England': ['England', 'Wales', 'Scotland'], 'Ireland': ['Ireland'], 'Low Countries': ['Low Countries'],
    'Scandinavia': ['Denmark', 'Sweden', 'Norway'], 'Finland & Iceland': ['Finland', 'Iceland'], 'Poland': ['Poland'],
    'Czechia & Slovakia': ['Czechia', 'Slovakia'], 'Hungary': ['Hungary'], 'Romania & Moldova': ['Romania & Moldova'],
    'Balkans': ['Bulgaria', 'Serbia, Kosovo & Montenegro', 'Croatia', 'Slovenia', 'Bosnia & Herzegovina', 'North Macedonia & Albania'],
    'Greece & Cyprus': ['Greece', 'Cyprus'], 'Baltic': ['Lithuania', 'Latvia', 'Estonia'], 'East Slavic': ['Ukraine', 'Belarus', 'Western Russia'],
    'Anatolia & Caucasus': ['Turkey', 'Caucasus'], 'Levant, Egypt & Maghreb': ['Levant', 'Egypt', 'Maghreb'], 'Austria & Switzerland': ['Austria', 'Switzerland'],
}

# Column-name signals (many languages).
LAT = re.compile(r'^(lat|latitude|y|y_coord|ycoord|lat_dd|breite|lat_wgs84|wgs84_lat|coord_y|y_wgs84|szeroko|šířka|latitud|latitudine)$|(^|_)lat(itude)?($|_)', re.I)
LON = re.compile(r'^(lon|lng|long|longitude|x|x_coord|xcoord|lon_dd|länge|laenge|lon_wgs84|wgs84_lon|coord_x|x_wgs84|długo|délka|longitud|longitudine)$|(^|_)(lon|lng|longitude)($|_)', re.I)
DATE_COL = re.compile(r'_pe$|date|year|jahr|datier|datace|datov|datum|chronolog|period|perioad|periodo|périod|centur|jahrh|siècle|secolo|siglo|stulec|století|század|vek\b|век|'
                      r'from|to$|start|end|begin|anno|epoch|époque|epoca|zeit|founded|built|erected|first_?ment|attest|fecha|rok|év|god|leto|dating|tpq|taq|ante|post|age\b', re.I)
NAME_COL = re.compile(r'name|nom\b|nome|nazwa|név|naziv|nimi|navn|namn|title|titel|place|toponym|ort\b|lieu|luogo|lugar|miejsc|helység|settlement|site', re.I)
YEARISH = re.compile(r'(?<!\d)(1[0-9]{3}|[2-9][0-9]{2})(?!\d)|\b([IVX]{1,5})\.?\s*(?:sz|st|jh|century|siècle|secolo|w\.|stol)|\b\d{1,2}(?:st|nd|rd|th)\s*c|\b\d{1,2}\.\s*(?:jh|jahrh|század|stol)', re.I)
PERIOD_VAL = re.compile(r'mediev|middle age|mittelalter|médiév|medioev|średniow|středov|középkor|roman|römisch|romain|byzant|ottoman|osman|neolith|bronze|iron age|eisenzeit|'
                        r'hallstatt|latène|la tène|migration|merowing|karoling|viking|early modern|neuzeit|renaiss|baroque|barock|'
                        # period vocabularies of heritage records (NI SMR "E.CHRIST.", "POST-MED", "C17TH"; English, Irish, Islamic dynasties)
                        r'christian|e\.\s?christ|post[- _]?med|anglo[- ]saxon|\bnorman\b|\btudor\b|\bgeorgian\b|victorian|carolingian|gallo-roman|frankish|\bavars?\b|árpád|piast|přemysl|hussite|'
                        r'habsburg|safavid|mamluk|ayyubid|umayyad|abbasid|fatimid|crusader|seljuk|\bc\d{2}(?:st|nd|rd|th)\b', re.I)

_host_locks = defaultdict(threading.Lock)
_host_last = defaultdict(float)


def fetch(url, limit=MAX_BYTES, accept='*/*', timeout=90):
    """GET with a per-host pause; returns (bytes, content-type) or (None, reason). Stops at `limit` bytes."""
    host = urllib.parse.urlparse(url).netloc
    with _host_locks[host]:
        wait = 0.8 - (time.time() - _host_last[host])
        if wait > 0:
            time.sleep(wait)
        _host_last[host] = time.time()
    for attempt in range(3):
        b_, info = _fetch_once(url, limit, accept, timeout)
        if b_ is not None or not re.search(r'EOF|reset|timed out|Temporary|50[234]', str(info)):
            return b_, info
        time.sleep(3 * (attempt + 1))
    return b_, info


def _fetch_once(url, limit, accept, timeout):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            cl = r.headers.get('Content-Length')
            if cl and cl.isdigit() and int(cl) > limit:
                return None, f'too large ({int(cl) / 1e6:.0f} MB)'
            b = r.read(limit + 1)
            if len(b) > limit:
                return None, f'too large (>{limit / 1e6:.0f} MB)'
            return b, r.headers.get('Content-Type', '')
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}'
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:80]


def fetch_head(url, n=2_000_000):
    """The first n bytes of a (large) file, for profiling its header and first rows."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Range': f'bytes=0-{n - 1}'})
        with urllib.request.urlopen(req, timeout=90) as r:
            b = r.read(n)
        return b.rsplit(b'\n', 1)[0], 'partial'
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:80]


def jget(url):
    b, ct = fetch(url, 20_000_000, 'application/json')
    if b is None:
        return None, ct
    try:
        return json.loads(b.decode('utf-8', 'replace')), None
    except ValueError:
        return None, 'not JSON'


# ── stage 1: file lists from the repository's own API ─────────────────────

def files_of(c):
    """[(name, size, url)] and a note, from the hosting repository's API."""
    doi = (c.get('doi') or '').lower()
    url = c.get('url') or ''
    if not doi:
        m = re.search(r'(?:dx\.)?doi\.org/(10\.[^\s?#]+)', url, re.I)
        if m:
            doi = urllib.parse.unquote(m.group(1)).lower()
    if c.get('files') and isinstance(c['files'], list) and isinstance(c['files'][0], dict):
        return [(f.get('n') or f.get('name'), f.get('s') or f.get('size'), f.get('u') or f.get('url')) for f in c['files']], 'catalogue file list'
    m = re.search(r'zenodo\.(\d+)', doi) or re.search(r'zenodo\.org/(?:records?|doi/10\.5281/zenodo\.)/?(\d+)', url)
    if m:
        d, err = jget(f'https://zenodo.org/api/records/{m.group(1)}')
        if d is None:
            return None, f'zenodo: {err}'
        return [(f.get('key'), f.get('size'), (f.get('links') or {}).get('self')) for f in d.get('files') or []], 'zenodo API'
    m = re.search(r'figshare\.(\d+)', doi) or re.search(r'figshare\.com/.*/(\d+)', url)
    if m:
        d, err = jget(f'https://api.figshare.com/v2/articles/{m.group(1)}')
        if d is None:
            return None, f'figshare: {err}'
        return [(f.get('name'), f.get('size'), f.get('download_url')) for f in d.get('files') or []], 'figshare API'
    host = None
    if (c.get('repository') or '').startswith('Dataverse '):
        host = c['repository'].split(' ', 1)[1]
    elif 'dataverse' in url or 'dataset.xhtml' in url or 'datastations.nl' in url or c['channel'] == 'harvard-dataverse':
        host = urllib.parse.urlparse(url).netloc or 'dataverse.harvard.edu'
    if host and doi:
        d, err = jget(f'https://{host}/api/datasets/:persistentId/?persistentId=doi:{doi}')
        if d is None:
            return None, f'dataverse: {err}'
        fs = ((d.get('data') or {}).get('latestVersion') or {}).get('files') or []
        return [((f.get('dataFile') or {}).get('filename'), (f.get('dataFile') or {}).get('filesize'), f"https://{host}/api/access/datafile/{(f.get('dataFile') or {}).get('id')}")
                for f in fs], f'dataverse API ({host})'
    m = re.search(r'osf\.io/([a-z0-9]{5})', doi + ' ' + url)
    if m:
        d, err = jget(f'https://api.osf.io/v2/nodes/{m.group(1)}/files/osfstorage/')
        if d is None:
            return None, f'osf: {err}'
        return [((x.get('attributes') or {}).get('name'), (x.get('attributes') or {}).get('size'), (x.get('links') or {}).get('download')) for x in d.get('data') or []], 'OSF API'
    m = re.search(r'data\.europa\.eu/data/datasets/([^/?#]+)', url)
    if m:
        d, err = jget(f'https://data.europa.eu/api/hub/search/datasets/{m.group(1)}')
        if d is None:
            return None, f'europa: {err}'
        out = []
        for x in (d.get('result') or {}).get('distributions') or []:
            u = (x.get('download_url') or x.get('access_url') or [None])
            u = u[0] if isinstance(u, list) else u
            fmt = (x.get('format') or {}).get('label') or ''
            name = (x.get('title') or {}).get('en') if isinstance(x.get('title'), dict) else x.get('title')
            out.append((f"{name or 'distribution'}.{fmt.lower()}", x.get('byte_size'), u))
        return out, 'data.europa.eu API'
    if re.search(r'/(FeatureServer|MapServer)(/\d+)?/?$', url, re.I):
        return [('service', None, url)], 'ArcGIS service'
    m = re.search(r'(10\.1594/pangaea\.\d+)', doi + ' ' + url.lower())
    if m:
        return [(f'{m.group(1).rsplit("/", 1)[-1]}.tab', None, f'https://doi.pangaea.de/{m.group(1).upper().replace("PANGAEA", "PANGAEA")}?format=textfile')], 'PANGAEA text export'
    m = re.search(r'nakala\.fr/(?:data/)?(10\.34847/nkl\.[a-z0-9]+)', url) or re.search(r'(10\.34847/nkl\.[a-z0-9]+)', doi)
    if m:
        d, err = jget(f'https://api.nakala.fr/datas/{m.group(1)}/files')
        if d is None:
            return None, f'nakala: {err}'
        return [(f.get('name'), f.get('size'), f"https://api.nakala.fr/data/{m.group(1)}/{f.get('sha1')}") for f in d], 'Nakala API'
    if 'datadryad.org' in url or doi.startswith('10.5061/dryad'):
        d, err = jget(f'https://datadryad.org/api/v2/datasets/{urllib.parse.quote("doi:" + doi, safe="")}/versions')
        vs = ((d or {}).get('_embedded') or {}).get('stash:versions') or []
        if vs:
            fl, err = jget('https://datadryad.org' + vs[-1]['_links']['stash:files']['href'])
            fs = ((fl or {}).get('_embedded') or {}).get('stash:files') or []
            return [(f.get('path'), f.get('size'), 'https://datadryad.org' + f['_links']['stash:download']['href']) for f in fs], 'Dryad API'
        return None, f'dryad: {err or "no versions"}'
    m = re.search(r'data\.mendeley\.com/datasets/([a-z0-9]+)/(\d+)', url) or re.search(r'10\.17632/([a-z0-9]+)\.(\d+)', doi)
    if m:
        d, err = jget(f'https://data.mendeley.com/public-api/datasets/{m.group(1)}/files?folder_id=root&version={m.group(2)}')
        if d is None:
            return None, f'mendeley: {err}'
        return [(f.get('filename'), f.get('size'), (f.get('content_details') or {}).get('download_url')) for f in d], 'Mendeley Data API'
    m = re.search(r'arcgis\.com/home/item\.html\?id=([0-9a-f]{32})', url)
    if m:
        d, err = jget(f'https://www.arcgis.com/sharing/rest/content/items/{m.group(1)}?f=json')
        if d is None:
            return None, f'arcgis item: {err}'
        if d.get('url') and re.search(r'/(FeatureServer|MapServer)', d['url']):
            return [('service', None, d['url'])], 'ArcGIS item → service'
        ext = {'CSV': 'csv', 'Shapefile': 'zip', 'GeoJson': 'geojson', 'KML': 'kml', 'Microsoft Excel': 'xlsx', 'GeoPackage': 'gpkg'}.get(d.get('type'))
        if ext:
            return [(f"{d.get('name') or m.group(1)}.{ext}" if not str(d.get('name', '')).lower().endswith(ext) else d['name'], d.get('size'),
                     f'https://www.arcgis.com/sharing/rest/content/items/{m.group(1)}/data')], 'ArcGIS item data'
        return [], f"ArcGIS item of type {d.get('type')}"
    if doi:
        # DataCite's own record sometimes lists the content files (contentUrl) of repositories without a file API.
        d, err = jget(f'https://api.datacite.org/dois/{urllib.parse.quote(doi)}')
        cu = (((d or {}).get('data') or {}).get('attributes') or {}).get('contentUrl') or []
        if cu:
            return [(u.rsplit('/', 1)[-1], None, u) for u in cu], 'DataCite contentUrl'
    return None, 'no file API for this repository (landing page only)'


# ── stage 2: profile a data sample ───────────────────────────────────────

def ext_of(name):
    n = (name or '').lower().split('?')[0]
    return n.rsplit('.', 1)[-1] if '.' in n else ''


def profile_rows(cols, rows, geometry=False, crs=None):
    """What a table holds: coordinate/geometry, dates of its own, names; with the evidence."""
    cols = [str(x or '') for x in cols]
    n = len(rows)
    lat = next((i for i, x in enumerate(cols) if LAT.search(x.strip())), None)
    lon = next((i for i, x in enumerate(cols) if LON.search(x.strip())), None)
    coords = False
    if lat is not None and lon is not None and rows:
        ok = 0
        for r in rows[:300]:
            try:
                float(str(r[lat]).replace(',', '.'))
                float(str(r[lon]).replace(',', '.'))
                ok += 1
            except (ValueError, IndexError, TypeError):
                pass
        coords = ok >= max(1, min(len(rows), 300) * 0.5)
    date_cols = [i for i, x in enumerate(cols) if DATE_COL.search(x)]
    dated = 0
    samples = []
    for r in rows[:500]:
        vals = [str(r[i]) for i in date_cols if i < len(r) and r[i] not in (None, '')]
        if not vals:
            # dates written in other columns (descriptions)
            vals = [str(v) for v in r if isinstance(v, str) and PERIOD_VAL.search(v)][:1]
        hit = [v for v in vals if YEARISH.search(v) or PERIOD_VAL.search(v)]
        if hit:
            dated += 1
            if len(samples) < 4:
                samples.append(hit[0][:60])
    share = dated / max(1, min(n, 500))
    name_col = next((cols[i] for i, x in enumerate(cols) if NAME_COL.search(x)), None)
    return {'rows': n, 'columns': cols[:40], 'spatial': bool(geometry or coords), 'geometry': geometry, 'coordCols': [cols[lat], cols[lon]] if coords else None,
            'crs': crs, 'dateCols': [cols[i] for i in date_cols][:8], 'datedShare': round(share, 2), 'dateSamples': samples, 'nameCol': name_col}


def read_dbf(b, maxrows=600):
    import shapefile
    r = shapefile.Reader(dbf=io.BytesIO(b))
    cols = [f[0] for f in r.fields[1:]]
    rows = []
    for i, rec in enumerate(r.iterRecords()):
        if i >= maxrows:
            break
        rows.append(list(rec))
    return cols, rows, len(r)


def profile_bytes(name, b):
    e = ext_of(name)
    if e in ('csv', 'tsv', 'txt', 'tab'):
        t = b[:2_000_000].decode('utf-8', 'replace') if not b[:3] == b'\xef\xbb\xbf' else b[3:2_000_000].decode('utf-8', 'replace')
        if t.lstrip().startswith('/*') and '*/' in t:
            t = t.split('*/', 1)[1].lstrip('\r\n')  # PANGAEA text export: metadata header, then the table
        try:
            dialect = csv.Sniffer().sniff(t[:20000], delimiters=',;\t|')
        except csv.Error:
            dialect = csv.excel_tab if '\t' in t[:2000] else csv.excel
        rr = list(csv.reader(io.StringIO(t), dialect))
        if len(rr) < 2:
            return None
        return profile_rows(rr[0], rr[1:2000])
    if e in ('xlsx',):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(b), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rr = [list(r) for _, r in zip(range(2000), ws.iter_rows(values_only=True))]
        return profile_rows(rr[0], rr[1:]) if len(rr) > 1 else None
    if e in ('xls',):
        import xlrd
        wb = xlrd.open_workbook(file_contents=b)
        sh = wb.sheet_by_index(0)
        rr = [sh.row_values(i) for i in range(min(sh.nrows, 2000))]
        return profile_rows(rr[0], rr[1:]) if len(rr) > 1 else None
    if e in ('geojson', 'json'):
        try:
            d = json.loads(b.decode('utf-8', 'replace'))
        except ValueError:
            return None
        feats = d.get('features') if isinstance(d, dict) else None
        if not feats:
            return None
        cols = sorted({k for f in feats[:500] for k in (f.get('properties') or {})})
        rows = [[(f.get('properties') or {}).get(k) for k in cols] for f in feats[:2000]]
        p = profile_rows(cols, rows, geometry=any(f.get('geometry') for f in feats[:50]))
        p['rows'] = len(feats)
        return p
    if e in ('kml',):
        t = b.decode('utf-8', 'replace')
        n = t.count('<Placemark')
        dated = len(re.findall(r'<(?:TimeSpan|TimeStamp|when|begin)\b', t))
        return {'rows': n, 'spatial': '<coordinates>' in t, 'geometry': True, 'dateCols': ['KML TimeSpan'] if dated else [], 'datedShare': round(dated / max(1, n), 2),
                'dateSamples': re.findall(r'<(?:when|begin)>([^<]{1,30})', t)[:4], 'columns': sorted(set(re.findall(r'<SimpleData name="([^"]+)"', t)))[:40]}
    if e in ('gpkg', 'sqlite'):
        with tempfile.NamedTemporaryFile(suffix='.gpkg') as tf:
            tf.write(b)
            tf.flush()
            con = sqlite3.connect(tf.name)
            try:
                tabs = [r[0] for r in con.execute("select table_name from gpkg_contents where data_type='features'")]
            except sqlite3.Error:
                tabs = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
            best = None
            for t in tabs[:6]:
                cols = [r[1] for r in con.execute(f'pragma table_info("{t}")')]
                rows = [list(r) for r in con.execute(f'select * from "{t}" limit 2000')]
                n = con.execute(f'select count(*) from "{t}"').fetchone()[0]
                rows = [[x if not isinstance(x, bytes) else '' for x in r] for r in rows]
                p = profile_rows(cols, rows, geometry=any(c.lower() in ('geom', 'geometry', 'shape') for c in cols))
                p['rows'], p['table'] = n, t
                if best is None or (p['datedShare'], p['rows']) > (best['datedShare'], best['rows']):
                    best = p
            con.close()
            return best
    if e == 'dbf':
        cols, rows, n = read_dbf(b)
        p = profile_rows(cols, rows)
        p['rows'] = n
        return p
    if e in ('zip',):
        z = zipfile.ZipFile(io.BytesIO(b))
        names = z.namelist()
        best = None
        for nm in names:
            ee = ext_of(nm)
            if ee == 'dbf':
                cols, rows, n = read_dbf(z.read(nm))
                shp = nm[:-4] + '.shp' in names or nm[:-4] + '.SHP' in names
                prj = next((z.read(x).decode('latin-1')[:200] for x in names if x.lower() == nm[:-4].lower() + '.prj'), None)
                p = profile_rows(cols, rows, geometry=shp, crs=prj)
                p['rows'], p['file'] = n, nm
            elif ee in ('csv', 'geojson', 'gpkg', 'kml', 'xlsx', 'tsv') and z.getinfo(nm).file_size < MAX_BYTES:
                p = profile_bytes(nm, z.read(nm))
                if p:
                    p['file'] = nm
            else:
                continue
            if p and (best is None or (p['spatial'], p['datedShare'], p['rows']) > (best['spatial'], best['datedShare'], best['rows'])):
                best = p
        if best:
            best['zipMembers'] = len(names)
        return best
    return None


def profile_arcgis(url):
    base = re.sub(r'/?$', '', url)
    d, err = jget(base + '?f=json')
    if d is None:
        return None, f'service: {err}'
    layers = d.get('layers') or ([{'id': None}] if d.get('fields') else [])
    best = None
    for L in layers[:8]:
        lu = base if L.get('id') is None else f"{base}/{L['id']}"
        meta, _ = jget(lu + '?f=json') if L.get('id') is not None else (d, None)
        if not meta or not meta.get('fields'):
            continue
        q, _ = jget(lu + '/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=300&f=json')
        cnt, _ = jget(lu + '/query?where=1%3D1&returnCountOnly=true&f=json')
        cols = [f['name'] for f in meta['fields']]
        rows = [[(ft.get('attributes') or {}).get(k) for k in cols] for ft in (q or {}).get('features') or []]
        p = profile_rows(cols, rows, geometry=bool(meta.get('geometryType')))
        p['rows'] = (cnt or {}).get('count', len(rows))
        p['layer'] = meta.get('name')
        if best is None or (p['datedShare'], p['rows']) > (best['datedShare'], best['rows']):
            best = p
    return best, None if best else 'no feature layers'


def choose_file(files):
    """The most promising file to profile: structured geodata first, then tables; small enough to fetch."""
    rank = {'gpkg': 0, 'geojson': 1, 'zip': 2, 'kml': 3, 'csv': 4, 'tsv': 4, 'xlsx': 5, 'xls': 6, 'json': 7, 'dbf': 8, 'txt': 9, 'tab': 9}
    ok = [(rank[ext_of(n)], s or 0, n, u) for n, s, u in files if ext_of(n) in rank and u
          and (not s or int(s) <= MAX_BYTES or ext_of(n) in ('csv', 'tsv', 'txt', 'tab'))]
    return sorted(ok)[0] if ok else None


# ── states ────────────────────────────────────────────────────────────────

def need_index():
    """(coverage region, category, checkpoint) → how far below 70 the cell is (0 if not weak)."""
    p = os.path.join(ROOT, 'data', 'historical', 'coverage-centuries.json')
    need = {}
    for c in json.load(open(p, encoding='utf-8'))['cells']:
        if c['score'] is not None:
            need[(c['region'], c['category'], c['year'])] = max(0, 70 - c['score']) / 70
    return need


def need_of(c, need):
    regs = [r for g in c.get('regions') or [] for r in REGION_MAP.get(g, [])]
    if not regs:
        return 0.0
    cats = c.get('categories') or []
    pers = c.get('periods') or []
    vals = [need.get((r, k, y), 0) for r in regs for k in cats for y in pers]
    return round(sum(vals) / max(1, len(vals)) * min(1, len(vals) / 6), 3) if vals else 0.0


# Measurement series at sampling stations (water chemistry, isotopes, catches, sediment cores): positions and dates, but
# not historical places — the automated pass used to score them "promising".
ENV_SERIES = re.compile(r'water chemistry|isotop|bycatch|sediment|pollen|δ1[358]|stable isotope|plankton|biomass|'
                        r'occurrence download|bathymetr|grain[- ]size|ice core|geochem|hydrolog', re.I)  # dendro/radiocarbon may date buildings and sites: kept


def judge(p, c, need_v):
    if ENV_SERIES.search(c.get('title') or ''):
        return 'irrelevant', 'measurement series at sampling stations, not historical places (title)'
    if not p:
        return 'data-inspected', 'could not read the sample in a known format'
    sp, tm = p.get('spatial'), (p.get('datedShare') or 0) >= 0.2
    if sp and tm:
        return ('high-priority' if need_v >= 0.25 else 'promising'), f"positions ({'geometry' if p.get('geometry') else p.get('coordCols')}) and dates ({p.get('dateCols') or 'in values'}, {int(100 * p['datedShare'])}% of sampled rows)"
    if sp:
        return 'insufficient-temporal', f"positions but {int(100 * (p.get('datedShare') or 0))}% of sampled rows carry a date"
    if tm:
        return 'insufficient-spatial', 'dates but no coordinates or geometry (could be linked by place name)'
    return 'data-inspected', 'neither positions nor dates found in the sample'


def investigate(c, need):
    rec = {'id': c['id'], 'title': c['title'][:200], 'url': c.get('url'), 'doi': c.get('doi'), 'channel': c['channel'], 'at': time.strftime('%Y-%m-%d'),
           'need': need_of(c, need), 'relevance': c.get('relevance')}
    files, note = files_of(c)
    rec['metadata'] = {'source': note}
    if files is None:
        rec['state'] = 'catalogue-only' if 'landing page' in note else 'metadata-inspected'
        rec['why'] = note
        return rec
    rec['metadata'].update({'files': len(files), 'geoFiles': sum(ext_of(n) in GEO_EXT for n, _, _ in files), 'tableFiles': sum(ext_of(n) in TAB_EXT for n, _, _ in files),
                            'zips': sum(ext_of(n) in ARCH_EXT for n, _, _ in files), 'sample': [n for n, _, _ in files[:8]],
                            'bytes': sum(int(s) for _, s, _ in files if str(s or '').isdigit())})
    if files and files[0][0] == 'service':
        p, err = profile_arcgis(files[0][2])
        rec['data'] = p or {'error': err}
    else:
        ch = choose_file(files)
        if not ch:
            rec['state'] = 'metadata-inspected'
            rec['why'] = 'no structured data file small enough to sample (' + (', '.join(sorted({ext_of(n) for n, _, _ in files}))[:80] or 'no files') + ')'
            return rec
        _, size, name, u = ch
        b, ct = fetch(u)
        if b is None and 'too large' in str(ct) and ext_of(name) in ('csv', 'tsv', 'txt', 'tab'):
            b, ct = fetch_head(u)  # a text table too large to fetch whole: its first 2 MB are enough to profile
        if b is None:
            rec['state'] = 'metadata-inspected'
            rec['why'] = f'file {name}: {ct}'
            return rec
        try:
            p = profile_bytes(name, b)
        except Exception as e:  # noqa: BLE001
            p = None
            rec['readError'] = str(e)[:120]
        rec['data'] = dict(p or {}, file=name, bytes=len(b))
    st, why = judge(rec.get('data') if rec.get('data') and not rec['data'].get('error') else None, c, rec['need'])
    rec['state'], rec['why'] = st, why
    return rec


def read_all(path):
    """Every complete record of an appended .jsonl.gz, including those after a member left unfinished by a killed run."""
    import zlib
    if not os.path.exists(path):
        return []
    raw, pos, chunks = open(path, 'rb').read(), 0, []
    while True:
        pos = raw.find(b'\x1f\x8b\x08', pos)
        if pos < 0:
            break
        d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        try:
            chunks.append(d.decompress(raw[pos:]))
        except zlib.error:
            pos += 3
            continue
        pos = len(raw) - len(d.unused_data) if d.eof else pos + 3
    out = []
    for line in b''.join(chunks).decode('utf-8', 'replace').split('\n'):
        try:
            out.append(json.loads(line))
        except ValueError:
            continue  # blank, or the cut-off last line of an unfinished member
    return out


def main():
    args = sys.argv[1:]
    opt = lambda k, d: type(d)(args[args.index(k) + 1]) if k in args else d  # noqa: E731
    limit, minrel, workers = opt('--limit', 3000), opt('--min-relevance', 50), opt('--workers', 8)
    recheck_states = set(opt('--recheck-states', '').split(',')) - {''}
    need = need_index()
    done = {r['id']: r for r in read_all(OUT)}
    if done:
        # rewritten as one clean gzip stream: a run killed mid-write leaves an unfinished member, after which gzip
        # readers stop — everything appended later would be invisible to them
        with gzip.open(OUT + '.tmp', 'wt', encoding='utf-8') as f:
            for r in done.values():
                f.write(json.dumps(r, ensure_ascii=False, default=str) + '\n')
        os.replace(OUT + '.tmp', OUT)
    cands = []
    for line in gzip.open(os.path.join(DISC, 'inventory.jsonl.gz'), 'rt', encoding='utf-8'):
        c = json.loads(line)
        redo = '--redo' in args and c['id'] in done and re.search(r'error:|EOF|landing page|HTTP 5', done[c['id']].get('why', ''))
        # --recheck-states a,b: sample again what an earlier pass left in those states (e.g. after the period vocabulary grew)
        recheck = c['id'] in done and done[c['id']].get('state') in recheck_states
        if recheck:
            redo = True
        if (c['id'] in done and not redo) or c.get('relevance', 0) < minrel or not c.get('regions') or \
                (c.get('state') not in ('catalogue-only', 'metadata-inspected', 'data-inspected', None) and not recheck):
            continue
        if c['channel'] in ('loc-maps', 'europeana-maps', 'rumsey-maps', 'ogm', 'harvard-geodata', 'wikidata-register', 'shelf-audit', 're3data'):
            continue  # maps go to the map index; registers/repositories are followed as discovery chains, not sampled
        cands.append(c)
    cands.sort(key=lambda c: -(c.get('relevance', 0) / 100 + 2 * need_of(c, need)))
    todo = cands[:limit]
    print('candidates eligible', len(cands), 'investigating', len(todo), 'already investigated', len(done), flush=True)
    lock = threading.Lock()
    out = gzip.open(OUT, 'at', encoding='utf-8')
    counts = Counter()
    t0 = time.time()

    def one(ic):
        i, c = ic
        try:
            r = investigate(c, need)
        except Exception as e:  # noqa: BLE001
            r = {'id': c['id'], 'title': c['title'][:200], 'state': 'metadata-inspected', 'why': f'error: {str(e)[:100]}', 'at': time.strftime('%Y-%m-%d')}
        with lock:
            out.write(json.dumps(r, ensure_ascii=False, default=str) + '\n')
            out.flush()
            counts[r['state']] += 1
            if i % 100 == 0:
                print(i, dict(counts), f'{time.time() - t0:.0f}s', flush=True)
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(one, enumerate(todo)))
    out.close()
    print('done', dict(counts), flush=True)


if __name__ == '__main__':
    main()
