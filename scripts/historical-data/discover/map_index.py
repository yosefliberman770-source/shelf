#!/usr/bin/env python3
"""Index of public, georeferenced historical map scans that can be laid over the map through their library's WMS.

  python3 scripts/historical-data/discover/map_index.py <dir with ogm-* clones>
    → public/world/maps/georef-index.json

From the OpenGeoMetadata (GeoBlacklight / Aardvark) catalogues of Harvard and other universities: records that are
public, georeferenced rasters with a WMS service and layer id, whose footprint touches Europe or the Mediterranean,
and whose map year (gbl_indexYear_im, else a 4-digit year in the title) is 1950 or earlier. A map is a snapshot of its
own year — the app shows it as such and never dates map content from it. Each row:
  [id, title, year, yearTo (a range the title gives, else the same year), [w, s, e, n], wms url, layer, holder, record page]
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
OUT = os.path.join(ROOT, 'public', 'world', 'maps', 'georef-index.json')
EUROPE = (-25, 25, 60, 72)
WMS = 'http://www.opengis.net/def/serviceType/ogc/wms'


def envelope(s):
    m = re.match(r'ENVELOPE\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)', s or '')
    if not m:
        return None
    w, e, n, s_ = map(float, m.groups())  # ENVELOPE(minX, maxX, maxY, minY)
    return [w, s_, e, n]


def page_for(d):
    for i in d.get('dct_identifier_sm') or []:
        if isinstance(i, str) and i.startswith('http'):
            return i
    refs = json.loads(d.get('dct_references_s') or '{}')
    return refs.get('http://schema.org/url') or ''


def main(scratch):
    rows, seen = [], set()
    for f in glob.iglob(os.path.join(scratch, 'ogm-*', '**', '*.json'), recursive=True):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(d, dict) or d.get('dct_accessRights_s') != 'Public':
            continue
        try:
            refs = json.loads(d.get('dct_references_s') or '{}')
        except ValueError:
            continue
        wms, layer = refs.get(WMS), d.get('gbl_wxsIdentifier_s')
        if not wms or not layer:
            continue
        georef = d.get('gbl_georeferenced_b') is True or re.search(r'georeferenced', ' '.join(d.get('dct_description_sm') or []), re.I)
        raster = re.search(r'geotiff|raster|image', f"{d.get('dct_format_s', '')} {d.get('dct_title_s', '')}", re.I)
        if not (georef and raster):
            continue
        bb = envelope(d.get('dcat_bbox') or d.get('locn_geometry'))
        if not bb or bb[2] < EUROPE[0] or bb[0] > EUROPE[2] or bb[3] < EUROPE[1] or bb[1] > EUROPE[3]:
            continue
        if (bb[2] - bb[0]) > 120:
            continue  # world maps: too small-scale to be useful as an overlay
        years = [y for y in (d.get('gbl_indexYear_im') or []) if isinstance(y, int)]
        if not years:
            m = re.search(r'\b(1[4-9]\d\d)\b', d.get('dct_title_s') or '')
            years = [int(m.group(1))] if m else []
        if not years or min(years) > 1950:
            continue
        key = (wms, layer)
        if key in seen:
            continue
        seen.add(key)
        holder = (d.get('dct_publisher_sm') or [d.get('schema_provider_s') or ''])[0]
        title = d.get('dct_title_s') or ''
        rng = re.search(r'\b(1[4-9]\d\d)\s*[-–]\s*(1[4-9]\d\d)\b', title)
        y1 = max(int(rng.group(2)), min(years)) if rng else max(years)
        rows.append([d.get('id'), re.sub(r'\s*\(Raster Image\)\s*$', '', title)[:160], min(years), y1, [round(v, 4) for v in bb],
                     wms.replace('http://', 'https://'), layer, holder[:80], page_for(d)])
    rows.sort(key=lambda r: (r[2], r[1]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'built': 'OpenGeoMetadata catalogues (Harvard and others)', 'columns': ['id', 'title', 'year', 'yearTo', 'bbox', 'wms', 'layer', 'holder', 'page'], 'maps': rows},
              open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    from collections import Counter
    print(len(rows), Counter(r[7] for r in rows).most_common(8), Counter(r[2] // 100 * 100 for r in rows))


if __name__ == '__main__':
    main(sys.argv[1])
