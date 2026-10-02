#!/usr/bin/env python3
"""Harvard holdings in the inventory: Harvard Geospatial Library (OpenGeoMetadata edu.harvard) and Harvard Dataverse.

  python3 scripts/historical-data/discover/harvard_report.py → data/historical/discovery/harvard.json
"""
import gzip
import json
import os
import re
from collections import Counter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
INV = os.path.join(ROOT, 'data', 'historical', 'discovery', 'inventory.jsonl.gz')
OUT = os.path.join(ROOT, 'data', 'historical', 'discovery', 'harvard.json')


def in_europe(b):
    return b and b[2] >= -25 and b[0] <= 60 and b[3] >= 28 and b[1] <= 72


def main():
    hgl, dv = [], []
    for line in gzip.open(INV, 'rt', encoding='utf-8'):
        c = json.loads(line)
        if c['channel'] == 'harvard-geodata':
            hgl.append(c)
        elif c['channel'] == 'harvard-dataverse' or 'harvard-dataverse' in c.get('alsoIn', []):
            dv.append(c)
    eu = [c for c in hgl if in_europe(c.get('bbox'))]
    yr = lambda c: c.get('year') if isinstance(c.get('year'), int) else None  # noqa: E731
    hist = [c for c in eu if yr(c) and yr(c) <= 1950]
    raster = [c for c in hist if re.search(r'geotiff|tiff|raster|jpeg|image', ' '.join(c['formats']).lower())]
    vector = [c for c in eu if re.search(r'shapefile|geopackage|geojson|vector', ' '.join(c['formats']).lower())]
    public = lambda cs: [c for c in cs if (c.get('accessRights') or '').lower().startswith('public')]  # noqa: E731
    by_century = Counter((yr(c) // 100) * 100 for c in hist)
    rep = {
        'harvardGeospatialLibrary': {
            'records': len(hgl), 'inEuropeMediterranean': len(eu), 'historicalMaps(year<=1950)': len(hist),
            'georeferencedRasters': len(raster), 'publicGeoreferencedRasters': len(public(raster)), 'vectorLayersInEurope': len(vector),
            'publicVectorLayersInEurope': len(public(vector)), 'mapYearByCentury': dict(sorted(by_century.items())),
            'publishers': Counter(c.get('institution') for c in eu).most_common(15),
            'oldestEuropeanMaps': [{'title': c['title'], 'year': yr(c), 'url': c.get('url'), 'formats': c['formats'], 'access': c.get('accessRights')}
                                   for c in sorted(hist, key=lambda c: yr(c))[:60]],
            'europeanVectorLayers': [{'title': c['title'], 'year': yr(c), 'url': c.get('url'), 'access': c.get('accessRights')}
                                     for c in sorted(vector, key=lambda c: -c['relevance'])[:80]],
        },
        'harvardDataverse': {
            'candidates': len(dv), 'relevance>=50': sum(c['relevance'] >= 50 for c in dv),
            'top': [{'title': c['title'], 'doi': c.get('doi'), 'dataverse': c.get('institution'), 'relevance': c['relevance'], 'regions': c['regions'], 'periods': c['periods'][:6]}
                    for c in sorted(dv, key=lambda c: -c['relevance'])[:150]],
        },
    }
    json.dump(rep, open(OUT, 'w'), ensure_ascii=False, indent=1, default=list)
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if not isinstance(vv, list)} for k, v in rep.items()}, ensure_ascii=False, default=list)[:2500])


if __name__ == '__main__':
    main()
