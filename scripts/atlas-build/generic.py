"""Spec-driven loader: one reader for many datasets, so a new source needs a short JSON spec, not new code.

A spec (data/historical/specs/<id>.json) says where the data is, how to read it, and which fields mean what:

  {"id": "trajansgate", "src": "trajansgate", "public": true, "title": "...", "licence": "CC BY 4.0", "url": "...",
   "read": {"path": "trajans-gate/original/tgp.zip", "member": "tgp/tgp.gpkg", "layer": "tgp_sites", "crs": "EPSG:3035"},
   "fields": {"id": "fid", "name": "name", "kind": {"field": "type", "map": {"inn": "building"}, "default": "site"},
              "type": ["type"], "context": ["source"], "approx": {"field": "geocoding_accuracy", "values": ["200-500 m", ">500 m"]}},
   "dating": {"mode": "fields", "from": "start_date", "to": "end_date"}
         or {"mode": "text", "field": "dating"}          (one field holding "13th c.", "1250–1300", "c. 1400", "XIV. sz." …)
         or {"mode": "snapshot", "year": 1751}            (every record listed in one dated source)
         or {"mode": "envelope", "from": 1630, "to": 1655} (every record on one dated survey)
   "keep": {"field": "type", "values": [...]}            (optional filter)
  }

Readers: csv/tsv/txt, xlsx, geojson/json, gpkg, shp (in a zip or not), kml, ArcGIS FeatureServer layer ("read": {"arcgis": url}).
Positions are reprojected from the spec's CRS (or the .prj) with pyproj; lines and polygons give their representative point.

Dating follows the atlas rules: nothing is invented. A century is a window of that century (marked), "c." widens nothing but is
kept in the label, "?" marks the record uncertain in its label, an open end stays open, a missing date leaves the record undated.
"""
from __future__ import annotations

import csv
import glob
import io
import json
import math
import os
import re
import sqlite3
import tempfile
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', '..', 'data', 'historical', 'raw')
SPECS = os.path.join(HERE, '..', '..', 'data', 'historical', 'specs')

ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12, 'xiii': 13,
         'xiv': 14, 'xv': 15, 'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20, 'xxi': 21}
PART = {'early': (0, 33), 'first half': (0, 50), '1st half': (0, 50), 'mid': (33, 66), 'middle': (33, 66), 'second half': (50, 100),
        '2nd half': (50, 100), 'late': (66, 100), 'end': (75, 100), 'beginning': (0, 25), 'start': (0, 25)}
BCE = re.compile(r'\b(bc|bce|b\.c\.|v\.\s?chr|av\.?\s?j\.?-?c|pr\.\s?n\.\s?l|př\.\s?n\.\s?l|i\.\s?e\.|до н\.\s?э)', re.I)


def _century_window(n, bce=False, part=None):
    a, b = (n - 1) * 100 + 1, n * 100
    if part:
        p0, p1 = PART[part]
        a, b = a + p0, a + p1 - 1 if p1 < 100 else b
    return (-b, -a) if bce else (a, b)


def parse_dating(text) -> tuple[int | None, int | None, str] | None:
    """(from, to, how) from a free-text dating, or None if it holds no date. Never more precise than the text."""
    if text is None:
        return None
    if isinstance(text, (int, float)) and not (isinstance(text, float) and math.isnan(text)):
        y = int(text)
        return (y, y, 'year') if -3000 <= y <= 2100 and y != 0 else None
    t = str(text).strip()
    if not t or t.lower() in ('nan', 'none', 'null', 'unknown', 'undetermined', 'neznámé', 'unbekannt', 'inconnu', '-', '?'):
        return None
    low = t.lower()
    bce = bool(BCE.search(low))
    # centuries: "13th c.", "13th century", "13. Jh.", "XIII. sz.", "XIIIe siècle", "XIII w.", "13. stol." — with an optional part
    cents = []
    CW = r'(?:c\b|c\.|cent|century|centuries|jh|jahrh|siècle|siecle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|století|st\.|vek|век)'
    # century ranges: "5th-7th c.", "14-15 c.", "XII-XIII w."
    for m in re.finditer(r'\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*[-–/]\s*(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?\s*' + CW, low):
        a_, b_ = int(m.group(1)), int(m.group(2))
        if 1 <= a_ <= b_ <= 21:
            cents.append((_century_window(a_, bce)[0] if not bce else -b_ * 100, _century_window(b_, bce)[1] if not bce else -(a_ - 1) * 100 - 1))
    for m in re.finditer(r'\b([ivxl]{1,6})\.?\s*[-–/]\s*([ivxl]{1,6})\.?\s*' + CW, low):
        a_, b_ = ROMAN.get(m.group(1)), ROMAN.get(m.group(2))
        if a_ and b_ and a_ <= b_:
            cents.append((_century_window(a_, bce)[0], _century_window(b_, bce)[1]))
    for m in re.finditer(r'(?:(early|late|mid|middle|first half|1st half|second half|2nd half|end|beginning)(?:\s+of)?\s+(?:the\s+)?)?'
                         r'\b(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?\s*(?:c\b|c\.|cent|century|centuries|jh|jahrh|siècle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|století|st\.|vek|век)', low):
        part = (m.group(1) or '').strip() or None
        cents.append(_century_window(int(m.group(2)), bce, part if part in PART else None))
    for m in re.finditer(r'\b([ivxl]{1,6})\.?\s*(?:c\b|c\.|cent|century|jh|siècle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|st\.|vek|век|e\b|ème)', low):
        n = ROMAN.get(m.group(1))
        if n:
            cents.append(_century_window(n, bce))
    years = [int(y) for y in re.findall(r'(?<![\d.,])(\d{3,4})(?![\d.,])', t) if 100 <= int(y) <= 2100]
    if bce:
        years = [-y for y in years]
    if cents and not years:
        return min(a for a, _ in cents), max(b for _, b in cents), 'century'
    if years:
        lo, hi = min(years), max(years)
        if cents:
            lo, hi = min(lo, min(a for a, _ in cents)), max(hi, max(b for _, b in cents))
        if re.search(r'\b(after|post|nach|après|po|od|from|since|seit)\b', low) and len(years) == 1:
            return lo, None, 'from year'
        if re.search(r'\b(before|ante|vor|avant|przed|do|until|bis)\b', low) and len(years) == 1 and not re.search(r'\bod\b', low):
            return None, hi, 'until year'
        return lo, hi, 'years' if lo != hi else 'year'
    return None


# ── readers ───────────────────────────────────────────────────────────────

def _raw(path):
    p = os.path.join(RAW, path)
    return p if os.path.exists(p) else None


def _open_bytes(read):
    p = _raw(read['path'])
    if p is None:
        raise FileNotFoundError(read['path'])
    if read.get('member'):
        z = zipfile.ZipFile(p)
        return z.read(read['member']), read['member']
    return open(p, 'rb').read(), p


def _rows_table(b, name, read):
    e = name.lower().rsplit('.', 1)[-1]
    if e == 'xlsx':
        import openpyxl
        ws = openpyxl.load_workbook(io.BytesIO(b), read_only=True, data_only=True)[read['sheet']] if read.get('sheet') else \
            openpyxl.load_workbook(io.BytesIO(b), read_only=True, data_only=True).worksheets[0]
        rr = [list(r) for r in ws.iter_rows(values_only=True)]
        cols = [str(c or '') for c in rr[0]]
        return [dict(zip(cols, r)) for r in rr[1:]]
    t = b.decode(read.get('encoding', 'utf-8-sig'), 'replace')
    delim = read.get('delimiter') or csv.Sniffer().sniff(t[:20000], delimiters=',;\t|').delimiter
    return list(csv.DictReader(io.StringIO(t), delimiter=delim))


def _geom_point(g):
    """(lon, lat) of a GeoJSON-like or shapely geometry: points as given, other shapes their representative point."""
    from shapely.geometry import shape
    s = g if hasattr(g, 'representative_point') else shape(g)
    if s.is_empty:
        return None
    p = s if s.geom_type == 'Point' else s.representative_point()
    return p.x, p.y


def _gpkg_rows(b, read):
    from shapely import wkb
    with tempfile.NamedTemporaryFile(suffix='.gpkg') as tf:
        tf.write(b)
        tf.flush()
        con = sqlite3.connect(tf.name)
        layer = read.get('layer') or con.execute("select table_name from gpkg_contents where data_type='features'").fetchone()[0]
        gcol, srs = con.execute('select column_name, srs_id from gpkg_geometry_columns where table_name=?', (layer,)).fetchone()
        cols = [r[1] for r in con.execute(f'pragma table_info("{layer}")')]
        out = []
        for r in con.execute(f'select * from "{layer}"'):
            d = dict(zip(cols, r))
            blob = d.pop(gcol, None)
            pt = None
            if blob:
                flags = blob[3]
                env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 7, 0)
                pt = _geom_point(wkb.loads(bytes(blob[8 + env:])))
            d['__pt'] = pt
            out.append(d)
        con.close()
    return out, read.get('crs') or (f'EPSG:{srs}' if srs and srs > 0 else None)


def _shp_rows(read):
    import shapefile
    p = _raw(read['path'])
    if p.lower().endswith('.zip'):
        z = zipfile.ZipFile(p)
        base = read['member'][:-4]
        names = {n.lower(): n for n in z.namelist()}
        get = lambda ext: io.BytesIO(z.read(names[(base + ext).lower()]))  # noqa: E731
        prj = z.read(names[(base + '.prj').lower()]).decode('latin-1') if (base + '.prj').lower() in names else None
        r = shapefile.Reader(shp=get('.shp'), dbf=get('.dbf'), shx=get('.shx'), encoding=read.get('encoding', 'utf-8'))
    else:
        r = shapefile.Reader(p, encoding=read.get('encoding', 'utf-8'))
        prj = open(p[:-4] + '.prj').read() if os.path.exists(p[:-4] + '.prj') else None
    cols = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        d = dict(zip(cols, sr.record))
        d['__pt'] = _geom_point(sr.shape.__geo_interface__) if sr.shape.shapeType else None
        out.append(d)
    return out, read.get('crs') or prj


def _arcgis_rows(read):
    url = read['arcgis'].rstrip('/')
    out, offset = [], 0
    while True:
        u = f'{url}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset={offset}&resultRecordCount=1000'
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'ShelfAtlasBuild/1.0'}), timeout=120) as r:
            d = json.load(r)
        fs = d.get('features') or []
        for f in fs:
            p = dict(f.get('properties') or {})
            p['__pt'] = _geom_point(f['geometry']) if f.get('geometry') else None
            out.append(p)
        if len(fs) < 1000 or not d.get('exceededTransferLimit', len(fs) == 1000):
            break
        offset += len(fs)
    return out, 'EPSG:4326'


def read_rows(spec):
    """[(props, (lon, lat) | None)] in WGS84."""
    read = spec['read']
    crs = read.get('crs')
    if read.get('arcgis'):
        rows, crs = _arcgis_rows(read)
    elif (read.get('member') or read['path']).lower().endswith('.shp'):
        rows, crs = _shp_rows(read)
    else:
        b, name = _open_bytes(read)
        e = name.lower().rsplit('.', 1)[-1]
        if e == 'gpkg':
            rows, crs = _gpkg_rows(b, read)
        elif e in ('geojson', 'json'):
            d = json.loads(b.decode('utf-8-sig'))
            rows = []
            for f in d.get('features') or []:
                p = dict(f.get('properties') or {})
                p['__pt'] = _geom_point(f['geometry']) if f.get('geometry') else None
                rows.append(p)
        elif e == 'kml':
            rows = []
            for pm in re.findall(r'<Placemark\b.*?</Placemark>', b.decode('utf-8', 'replace'), re.S):
                p = {k: v for k, v in re.findall(r'<SimpleData name="([^"]+)">([^<]*)<', pm)}
                p.update({k: v for k, v in re.findall(r'<Data name="([^"]+)">\s*<value>([^<]*)<', pm)})
                nm = re.search(r'<name>(.*?)</name>', pm, re.S)
                p.setdefault('name', nm.group(1).strip() if nm else None)
                for tag in ('begin', 'end', 'when'):
                    m = re.search(rf'<{tag}>([^<]+)</{tag}>', pm)
                    if m:
                        p[f'kml_{tag}'] = m.group(1)
                c = re.search(r'<coordinates>\s*([-\d.]+),([-\d.]+)', pm)
                p['__pt'] = (float(c.group(1)), float(c.group(2))) if c else None
                rows.append(p)
            crs = 'EPSG:4326'
        else:
            rows = _rows_table(b, name, read)
            lon_f, lat_f = read.get('lon'), read.get('lat')
            for p in rows:
                try:
                    p['__pt'] = (float(str(p[lon_f]).replace(',', '.')), float(str(p[lat_f]).replace(',', '.')))
                except (KeyError, TypeError, ValueError):
                    p['__pt'] = None
    if crs and not re.search(r'4326|WGS_?1984|WGS 84"?,\s*DATUM\["?D_WGS_1984"?,\s*SPHEROID[^]]*\]\],\s*PRIMEM[^]]*\],\s*UNIT\["?Degree', str(crs), re.I):
        from pyproj import CRS, Transformer
        tr = Transformer.from_crs(CRS.from_user_input(crs), CRS.from_epsg(4326), always_xy=True)
        for p in rows:
            if p.get('__pt'):
                p['__pt'] = tr.transform(*p['__pt'])
    return rows


# ── spec → register records ───────────────────────────────────────────────

def _field(p, f):
    if isinstance(f, list):
        return ' · '.join(str(p.get(x)) for x in f if p.get(x) not in (None, ''))
    return p.get(f) if f else None


def records(spec):
    """Register records (registers.py schema) from a spec; and counts of what was left out and why."""
    from collections import Counter
    f, dt = spec['fields'], spec['dating']
    out, skipped = [], Counter()
    for i, p in enumerate(read_rows(spec)):
        keep = spec.get('keep')
        if keep and str(p.get(keep['field'])) not in keep['values']:
            skipped['outside the spec filter'] += 1
            continue
        pt = p.get('__pt')
        if not pt or not (-180 <= pt[0] <= 180 and -90 <= pt[1] <= 90) or (pt[0] == 0 and pt[1] == 0):
            skipped['no usable position'] += 1
            continue
        name = str(_field(p, f.get('name')) or '').strip()
        if not name and f.get('nameFallback'):
            name = str(_field(p, f['nameFallback']) or '').strip()
        kf = f.get('kind') or {}
        kv = str(p.get(kf.get('field')) or '').strip().lower() if isinstance(kf, dict) else ''
        kind = (kf.get('map') or {}).get(kv, kf.get('default', 'site')) if isinstance(kf, dict) else kf
        rec = {'src': spec['src'], 'id': str(p.get(f.get('id')) if f.get('id') else i), 'name': (name or spec.get('unnamed', 'Unnamed site'))[:80],
               'kind': kind, 'lon': round(pt[0], 5), 'lat': round(pt[1], 5), 'ty': str(_field(p, f.get('type')) or kind)[:120],
               'ctx': [str(_field(p, c)) for c in f.get('context', []) if _field(p, c)][:2], 'names': []}
        ap = f.get('approx')
        rec['precise'] = not (ap and str(p.get(ap['field'])) in ap['values'])
        uncertain = False
        if dt['mode'] == 'snapshot':
            rec['snap'] = dt['year']
            rec['per'] = dt.get('label') or f"listed in {dt['year']}"
        elif dt['mode'] == 'envelope':
            rec['env'] = (dt['from'], dt['to'])
            rec['per'] = dt.get('label') or f"{dt['from']}–{dt['to']} (source's survey window)"
        else:
            if dt['mode'] == 'fields':
                a, b = p.get(dt['from']), p.get(dt.get('to'))
                pa, pb = parse_dating(a), parse_dating(b) if b not in (None, '') else None
                raw_label = ' – '.join(str(x) for x in (a, b) if x not in (None, ''))
                uncertain = '?' in raw_label
                lo = pa[0] if pa else None
                hi = pb[1] if pb else (pa[1] if pa else None)
                if pa and pa[2] == 'from year':
                    hi = pb[1] if pb else None
            else:
                raw_label = str(p.get(dt['field']) or '')
                uncertain = '?' in raw_label
                pr = parse_dating(raw_label)
                lo, hi = (pr[0], pr[1]) if pr else (None, None)
            if lo is None and hi is None:
                skipped['no date in the record'] += 1
                if not spec.get('keepUndated'):
                    continue
            elif lo is None:
                skipped['only an end date (kept undated)'] += 1
                lo = hi = None
            if lo is not None:
                if hi is not None and hi < lo:
                    skipped['end before start (dates kept as the start only)'] += 1
                    hi = None
                rec['env'] = (lo, hi)
            rec['per'] = f"{raw_label}{' (uncertain in the source)' if uncertain and '?' not in raw_label else ''} ({spec.get('datingLabel', 'source dating')})"[:120]
        out.append(rec)
    return out, dict(skipped)


def specs(public=None):
    out = []
    for p in sorted(glob.glob(os.path.join(SPECS, '*.json'))):
        s = json.load(open(p, encoding='utf-8'))
        if s.get('enabled', True) and (public is None or bool(s.get('public')) == public):
            out.append(s)
    return out


APP_MODULE = os.path.join(HERE, '..', '..', 'src', 'atlas', 'spec-datasets.ts')


def write_app_module(loaded):
    """src/atlas/spec-datasets.ts: each spec's credit, period, extent and map layers, for the app's registries.
    `loaded` is {src: records} from this build; coverage and box come from the records themselves."""
    def q(s):
        return json.dumps(s, ensure_ascii=False)
    lines = ['// Generated by scripts/atlas-build/generic.py from data/historical/specs/*.json during the world build. Do not edit by hand.',
             'export const SPEC_DATASETS = {']
    for s in specs():
        recs = loaded.get(s['src']) or []
        ys = [y for r in recs for y in ((r.get('env') or (None, None)) + ((r['snap'], r['snap']) if r.get('snap') else ())) if y is not None]
        lons, lats = [r['lon'] for r in recs], [r['lat'] for r in recs]
        cov = [min(ys), max(ys)] if ys else [1, 1914]
        box = [round(min(lons), 1), round(min(lats), 1), round(max(lons), 1), round(max(lats), 1)] if recs else [-25, 27, 62, 72]
        lines.append(f"  {s['src']}: {{ name: {q(s['title'])}, license: {q(s['licence'])}, url: {q(s['url'])}, coverage: [{cov[0]}, {cov[1]}] as [number, number], "
                     f"core: [{s.get('core', cov)[0]}, {s.get('core', cov)[1]}] as [number, number], box: [{', '.join(map(str, box))}] as [number, number, number, number], "
                     f"describe: {q(s.get('describe') or s['title'])}, public: {'true' if s.get('public') else 'false'}, layers: {q(s.get('layers') or ['medieval-archaeology'])} as string[] }},")
    lines += ['} as const;', 'export type SpecDatasetId = keyof typeof SPEC_DATASETS;', '']
    open(APP_MODULE, 'w', encoding='utf-8').write('\n'.join(lines))
