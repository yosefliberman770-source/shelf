"""
Vector tiles for the medieval England & Wales datasets (Early Medieval Atlas,
ADS) and the Atlas of Rural Settlement in England, read straight from the
original ZIPs in data/historical/raw/ (never modified; extracted in memory).

  public/world/tiles/domesday.pmtiles          shires, intermediate districts, hundreds (1086)
  public/world/tiles/gough.pmtiles             Gough Map way stations, red lines, matched routes (c. 1400)
  public/world/tiles/navigation.pmtiles        navigable waterways before 1348, heads of navigation, river-traffic place-names
  public/world/tiles/rural-settlement.pmtiles  Roberts & Wrathmell's settlement provinces, sub-provinces, local regions, nucleations
                                               — LOCAL ONLY: its terms allow personal and business use, not republishing,
                                               so the file is git-ignored and not deployed.

All sources are in British National Grid (EPSG:27700) and are converted to
longitude/latitude (EPSG:4326). Every feature keeps its source's own fields
(names, dates, evidence classes, references) under short keys; codes the
datasets don't explain are kept as recorded, never interpreted.

  python3 scripts/atlas-build/england.py
"""
from __future__ import annotations

import io
import json
import os
import zipfile
from datetime import date

import shapefile
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform

import tiler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
RAW = os.path.join(ROOT, 'data', 'historical', 'raw')
OUT = os.path.join(ROOT, 'public', 'world', 'tiles')

BNG = Transformer.from_crs('EPSG:27700', 'EPSG:4326', always_xy=True)


def log(*a):
    print(*a, flush=True)


def read(zip_path: str, stem: str):
    """Yield (geometry in lon/lat, record dict) from one shapefile inside a ZIP, without extracting to disk."""
    z = zipfile.ZipFile(zip_path)
    names = {os.path.basename(n): n for n in z.namelist()}
    part = lambda ext: io.BytesIO(z.read(names[f'{stem}.{ext}']))
    prj = z.read(names[f'{stem}.prj']).decode('latin-1')
    if 'OSGB' not in prj and 'British_National_Grid' not in prj:
        raise ValueError(f'{stem}: unexpected coordinate system: {prj[:80]}')
    r = shapefile.Reader(shp=part('shp'), shx=part('shx'), dbf=part('dbf'), encoding='utf-8', encodingErrors='replace')
    for sr in r.iterShapeRecords():
        if sr.shape.shapeType == shapefile.NULL:
            continue
        g = shape(sr.shape.__geo_interface__)
        if g.has_z:
            g = transform(lambda x, y, z=None: (x, y), g)
        g = transform(lambda x, y: BNG.transform(x, y), g)
        if not g.is_valid:
            g = g.buffer(0)
        yield mapping(g), sr.record.as_dict()


def txt(v, n=200):
    s = str(v if v is not None else '').strip()
    return s[:n]


def props(**kw):
    """Drop empty values so tiles stay small."""
    return {k: v for k, v in kw.items() if v not in ('', None)}


# ── Domesday Shires and Hundreds (Brookes 2020) ─────────────────────────────
def domesday():
    d = os.path.join(RAW, 'domesday', 'original')
    feats = []
    for g, r in read(os.path.join(d, 'DBshires.zip'), 'DBshires'):
        feats.append((g, props(k='shire', n=txt(r.get('County_1'))), 0))
    for g, r in read(os.path.join(d, 'DBinter.zip'), 'DBinter'):
        feats.append((g, props(k='inter', n=txt(r.get('LAYER')), c=txt(r.get('County_1'))), 5))
    for g, r in read(os.path.join(d, 'DBhundreds.zip'), 'DBhundreds'):
        feats.append((g, props(k='hundred', n=txt(r.get('LAYER')), c=txt(r.get('County_1')), i=txt(r.get('TerrID'))), 6))
    n = tiler.build(os.path.join(OUT, 'domesday.pmtiles'), 'units', feats, 10, 'Domesday shires and hundreds (1086)',
                    'Brookes, S. (2020) Domesday Shires and Hundreds of England, ADS, doi:10.5284/1058999 (CC BY 4.0)')
    return {'tiles': n, 'features': {k: sum(1 for f in feats if f[1]['k'] == k) for k in ('shire', 'inter', 'hundred')}}


# ── The Routes and Roads of the Gough Map (Oksanen & Brookes 2024) ─────────
def gough():
    d = os.path.join(RAW, 'gough-map', 'original')
    feats = []
    for g, r in read(os.path.join(d, 'gough_way_stations.zip'), 'gough_way_stations'):
        # legibility: kept as recorded (1 or 0); the guide marks identification uncertainty with it.
        feats.append((g, props(k='station', i=r.get('id'), n=txt(r.get('settlement')).title(), c=txt(r.get('county')), lg=r.get('legibility')), 4))
    for g, r in read(os.path.join(d, 'gough_red_lines.zip'), 'gough_red_lines'):
        # value: the Roman numeral beside the line (a distance, unit uncertain).
        feats.append((g, props(k='red', i=r.get('id'), v=r.get('value'), no=txt(r.get('notes'))), 4))
    for g, r in read(os.path.join(d, 'gough_routes.zip'), 'gough_routes'):
        feats.append((g, props(k='route', i=r.get('id'), pd=r.get('period'), ca=txt(r.get('category')), mg=txt(r.get('margary_no')),
                               ev=txt(r.get('place_name')), no=txt(r.get('comments'))), 5))
    n = tiler.build(os.path.join(OUT, 'gough.pmtiles'), 'gough', feats, 11, 'Gough Map routes and way stations (c. 1400)',
                    'Oksanen, E., Brookes, S. (2024) The Routes and Roads of the Gough Map: GIS Database, ADS, doi:10.5284/1124312 (CC BY 4.0)')
    return {'tiles': n, 'features': {k: sum(1 for f in feats if f[1]['k'] == k) for k in ('station', 'red', 'route')}}


# ── Inland Navigation in England and Wales before 1348 (Oksanen 2019) ──────
def navigation():
    d = os.path.join(RAW, 'inland-navigation', 'original', 'gis')
    feats = []
    for stem, kind in (('direct_evidence', 'direct'), ('indirect_evidence', 'indirect')):
        for g, r in read(os.path.join(d, f'{stem}.zip'), stem):
            feats.append((g, props(k=kind, n=txt(r.get('Name')), h=txt(r.get('Head_N')), co=txt(r.get('Course')), no=txt(r.get('Notes'))), 4 if kind == 'direct' else 5))
    for g, r in read(os.path.join(d, 'heads_of_navigation.zip'), 'heads_of_navigation'):
        # Class (DE / IE / KB …) and Last_Date (a year, "PN", "post-1348" …) are kept exactly as recorded.
        feats.append((g, props(k='head', n=txt(r.get('Head_Navi')), w=txt(r.get('Waterway')), cl=txt(r.get('Class')), ld=txt(r.get('Last_Date')),
                               ob=txt(r.get('Obstruct')), no=txt(r.get('Notes')), rf=txt(r.get('References'))), 6))
    for g, r in read(os.path.join(d, 'pn_river_traffic.zip'), 'pn_river_traffic'):
        feats.append((g, props(k='pn', n=txt(r.get('Headform')), c=txt(r.get('County')), ge=txt(r.get('Generic')), tr=txt(r.get('Transl')),
                               ce=txt(r.get('Century')), cd=txt(r.get('Chrtr_Date')), no=txt(r.get('Notes')), rf=txt(r.get('References'))), 7))
    n = tiler.build(os.path.join(OUT, 'navigation.pmtiles'), 'nav', feats, 11, 'Inland navigation before 1348',
                    'Oksanen, E. (2019) Inland Navigation in England and Wales before 1348: GIS Database, ADS, doi:10.5284/1057497 (CC BY 4.0)')
    return {'tiles': n, 'features': {k: sum(1 for f in feats if f[1]['k'] == k) for k in ('direct', 'indirect', 'head', 'pn')}}


# ── Atlas of Rural Settlement in England GIS (Roberts & Wrathmell; EH 2011) ─
def rural_settlement():
    z = os.path.join(RAW, 'atlas-rural-settlement', 'original', 'atlas-gis-shapefile.zip')
    feats = []
    for g, r in read(z, 'SettlementProvinces'):
        feats.append((g, props(k='province', n=txt(r.get('PROVINCE'))), 0))
    for g, r in read(z, 'SettlementSubProvinces'):
        feats.append((g, props(k='subprovince', n=txt(r.get('SUB_PROV')), p=txt(r.get('PROVINCE')), cd=txt(r.get('SUB_PROV_C'))), 5))
    for g, r in read(z, 'SettlementLocalRegions'):
        feats.append((g, props(k='local', n=txt(r.get('LOC_REG')), s=txt(r.get('SUB_PROV')), p=txt(r.get('PROVINCE')), cd=txt(r.get('LOC_REG_C')), ds=txt(r.get('DISPERSION'))), 7))
    for g, r in read(z, 'Nucleations'):
        feats.append((g, props(k='nucleation', ca=txt(r.get('NUCLCAT_A')), d=txt(r.get('NUCL_DSC'))), 7))
    n = tiler.build(os.path.join(OUT, 'rural-settlement.pmtiles'), 'rural', feats, 10, 'Atlas of Rural Settlement in England',
                    'Roberts, B. K. & Wrathmell, S., Atlas of Rural Settlement in England GIS © English Heritage (personal and business use; not for republication)')
    return {'tiles': n, 'features': {k: sum(1 for f in feats if f[1]['k'] == k) for k in ('province', 'subprovince', 'local', 'nucleation')}, 'published': False}


def build():
    os.makedirs(OUT, exist_ok=True)
    stats = {}
    for name, fn in (('domesday', domesday), ('gough', gough), ('navigation', navigation), ('rural-settlement', rural_settlement)):
        log('England: tiles', name)
        stats[name] = fn()
        log('  ', stats[name])
    stats['built'] = date.today().isoformat()
    stats['sources'] = {
        'domesday': 'Domesday Shires and Hundreds of England, ADS doi:10.5284/1058999 (CC BY 4.0)',
        'gough': 'The Routes and Roads of the Gough Map: GIS Database, ADS doi:10.5284/1124312 (CC BY 4.0)',
        'navigation': 'Inland Navigation in England and Wales before 1348, ADS doi:10.5284/1057497 (CC BY 4.0)',
        'rural-settlement': 'Atlas of Rural Settlement in England GIS, English Heritage 2011 (personal and business use; local builds only)',
    }
    return stats


if __name__ == '__main__':
    # Run on its own: merge into the World manifest rather than replacing what world.py wrote.
    s = build()
    path = os.path.join(ROOT, 'public', 'world', 'manifest.json')
    m = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    m['england'] = s
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
