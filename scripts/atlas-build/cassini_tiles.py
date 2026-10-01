"""Roads of the Cassini map (c. 1756–1815; Perret et al., Harvard Dataverse, CC0) as tiles."""
import os

import registers
import tiler


def build_cassini_roads(tiles_dir):
    # Roads drawn on dated historical maps: Cassini (France, 1756–1815) and Lutsch (Transylvania, 1751).
    import generic
    feats = registers.cassini_roads() + registers.lutsch_roads()
    credits = ['Perret, Gribaudi & Barthelemy, 18th century Cassini roads and cities (Harvard Dataverse, CC0)',
               'Lutsch map of Transylvania 1751, roads and mountain paths (Harvard Dataverse, CC BY-NC-SA 4.0)']
    # Line datasets read through spec files (data/historical/specs, "geometry": "lines", public only).
    for sp in generic.specs(public=True, geometry='lines'):
        if 'roads-cassini' in (sp.get('layers') or []):
            feats += generic.line_features(sp)
            credits.append(f"{sp['title']} ({sp['licence']})")
    return tiler.build(os.path.join(tiles_dir, 'cassini-roads.pmtiles'), 'roads', feats, 11, 'Roads in dated sources', '; '.join(credits))


def build_spec_areas(tiles_dir, private_dir=None):
    """Dated historical territorial units read through spec files ("geometry": "polygons"): the public ones into
    historical-units.pmtiles; those whose licence keeps them off the public site into the private pack (private-units.pmtiles)."""
    import generic
    out = {}
    for public, d, name in ((True, tiles_dir, 'historical-units.pmtiles'), (False, private_dir, 'private-units.pmtiles')):
        if d is None:
            continue
        feats, credits = [], []
        for sp in generic.specs(public=public, geometry='polygons'):
            feats += generic.area_features(sp)
            credits.append(f"{sp['title']} ({sp['licence']})")
        if feats:
            os.makedirs(d, exist_ok=True)
            out[name] = tiler.build(os.path.join(d, name), 'units', feats, 10, 'Historical territorial units in dated sources', '; '.join(credits))
    return out


def build_inscriptions(tiles_dir):
    """Find-spots of dated Latin inscriptions (LIST v1.2), one point per find-spot, counts per century."""
    spots, stats = registers.list_inscriptions()
    feats = []
    for x in spots:
        p = {'i': f"li:{x['id']}", 'n': x['name'], 'k': 'inscription', 'src': 'lirelist', 'ni': x['n'],
             'ty': ', '.join(t for t, _ in x['types'].most_common(3))[:80], **({'m': x['modern'][:50]} if x.get('modern') else {}),
             **({'pv': x['prov'][:40]} if x.get('prov') else {}), **({'pl': str(x['pl'])} if x.get('pl') else {})}
        for c, n in x['cent'].items():
            p[f'c{c}'] = n
        mz = 5 if x['n'] >= 100 else 6 if x['n'] >= 20 else 7 if x['n'] >= 5 else 8
        feats.append(({'type': 'Point', 'coordinates': [x['lon'], x['lat']]}, p, mz))
    t = tiler.build(os.path.join(tiles_dir, 'inscriptions.pmtiles'), 'findspots', feats, 10, 'Find-spots of dated Latin inscriptions',
                    'LIST v1.2 — Latin Inscriptions in Space and Time (Kaše, Heřmánková, Sobotková; SDAM Aarhus), from EDH and EDCS, CC BY 4.0')
    return {**t, 'inscriptions': stats}


GALICIA = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'galicia-buildings')
CELL = 0.01  # degrees (about 1.1 km north–south, 0.7 km east–west at 50° N)


def build_building_density(tiles_dir):
    """Buildings drawn on the Second Military Survey of Galicia and Austrian Silesia (Kaim et al., Mendeley Data, CC BY 4.0;
    1.3 M points), counted per 0.01° cell and per survey-sheet years (each building carries the years of its map sheet,
    1837–1864). A cell is shown over those survey years only; buildings whose sheet gives no date are left out."""
    import shapefile
    from collections import Counter
    base = os.path.join(GALICIA, 'derived', 'buildings_GASID')
    if not os.path.exists(base + '.shp'):  # the published 7z, unpacked once into derived/
        import subprocess
        import sys
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), '..', 'historical-data', 'galicia_extract.py')], check=True)
    from pyproj import CRS, Transformer
    r = shapefile.Reader(base)
    tr = Transformer.from_crs(CRS.from_wkt(open(base + '.prj').read()), 'EPSG:4326', always_xy=True)
    cells, homes, undated = Counter(), Counter(), 0
    for i, rec in enumerate(r.iterRecords(fields=['type', 'Year1', 'Year2'])):
        y1, y2 = int(rec[1] or 0), int(rec[2] or 0)
        if not y1:
            undated += 1
            continue
        x, y = r.shape(i).points[0]
        lon, lat = tr.transform(x, y)
        key = (round(lon / CELL), round(lat / CELL), y1, y2 or y1)
        cells[key] += 1
        if str(rec[0]) == '1':  # 1 = residential, 2 = outbuilding (map legend)
            homes[key] += 1
    feats = []
    for (cx, cy, y1, y2), n in cells.items():
        p = {'i': f'gasid:{cx}:{cy}:{y1}', 'src': 'gasid', 'c': n, 'h': homes[(cx, cy, y1, y2)], 'ef': y1, 'et': y2,
             'per': f'Second Military Survey sheet, surveyed {y1}' + (f'–{y2}' if y2 != y1 else '')}
        feats.append(({'type': 'Point', 'coordinates': [round(cx * CELL, 4), round(cy * CELL, 4)]}, p, 5))
    t = tiler.build(os.path.join(tiles_dir, 'building-density.pmtiles'), 'cells', feats, 10, 'Buildings on dated survey maps',
                    'Kaim et al., Mid-19th-century building structure locations in Galicia and Austrian Silesia (Mendeley Data, CC BY 4.0)')
    t['undatedLeftOut'] = undated
    return t
