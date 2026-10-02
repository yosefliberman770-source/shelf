#!/usr/bin/env python3
"""Ottoman Plovdiv geodataset (Boykov, Zenodo 10.5281/zenodo.10046836, CC BY 4.0): the published RAR holds an Esri file
geodatabase; this turns the layers the atlas uses into GeoJSON points (WGS84).

  python3 scripts/historical-data/plovdiv_extract.py
    reads  data/historical/raw/ottoman-plovdiv/original/Ottoman_Plovdiv_geodata.rar          (unchanged original)
    writes data/historical/raw/ottoman-plovdiv/derived/quarters.geojson   one point per quarter (mahalle) per tax register
                                                                          that counts households there (1472…1614)
           data/historical/raw/ottoman-plovdiv/derived/buildings.geojson  mosques, churches, baths, khans… with their century
Needs libarchive-c (RAR) and pyogrio (FileGDB) — `pip install libarchive-c pyogrio`.
"""
import json
import os
import re
import tempfile

# household columns of the registers as the dataset names them (E_hane is left under its own code)
GROUP = {'Mus_hane': 'Muslim', 'Chr_hane': 'Christian', 'Yah_hane': 'Jewish', 'Gyp_hane': 'Roma'}
D = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'ottoman-plovdiv')


def main():
    import libarchive
    import pyogrio
    from pyproj import Transformer
    from shapely import wkb
    from shapely.ops import unary_union
    tmp = tempfile.mkdtemp()
    cwd = os.getcwd()
    os.chdir(tmp)
    try:
        libarchive.extract_file(os.path.abspath(os.path.join(cwd, D, 'original', 'Ottoman_Plovdiv_geodata.rar')))
    finally:
        os.chdir(cwd)
    gdb = os.path.join(tmp, 'Ottoman_Plovdiv_geodata', 'Plovdiv_public.gdb')
    tr = Transformer.from_crs('EPSG:32635', 'EPSG:4326', always_xy=True)

    def layer(name):
        meta, _, geom, fields = pyogrio.raw.read(gdb, layer=name)
        cols = list(meta['fields'])
        return [(dict(zip(cols, [None if (isinstance(f[i], float) and f[i] != f[i]) else (f[i].item() if hasattr(f[i], 'item') else f[i]) for f in fields])),
                 wkb.loads(bytes(geom[i]))) for i in range(len(geom))]

    def point(g):
        p = g.representative_point()
        lon, lat = tr.transform(p.x, p.y)
        return [round(lon, 6), round(lat, 6)]

    quarters = []
    for lname, _ in pyogrio.list_layers(gdb):
        m = re.fullmatch(r'TotalPop_(\d{4})', lname)
        if not m:
            continue
        year = int(m.group(1))
        by = {}
        for props, g in layer(lname):
            if props.get('Name') and (props.get('Total_pop') or 0) > 0:
                by.setdefault(props['Name'], (props, []))[1].append(g)
        for name, (props, gs) in by.items():  # the quarter's figures repeat on each of its blocks: taken once
            hh = {k: int(props[k]) for k in ('Mus_hane', 'Chr_hane', 'Yah_hane', 'Gyp_hane', 'E_hane') if props.get(k)}
            quarters.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': point(unary_union(gs))},
                             'properties': {'id': f'{name}:{year}', 'name': name, 'year': year, 'total_pop': int(props['Total_pop']),
                                            'households': 'households: ' + ', '.join(f'{v} {GROUP.get(k, k)}' for k, v in hh.items()) +
                                                          f"; population estimate {int(props['Total_pop'])} (author)"}})
    buildings = []
    for lname, cert in (('Buildings_certain_location', 'certain'), ('Buildings_tentative_location', 'tentative')):
        for props, g in layer(lname):
            buildings.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': point(g)},
                              'properties': {'id': f"{lname[10:13]}{int(props['No']) if props.get('No') else len(buildings)}", 'name': props.get('Name'), 'type': props.get('Type'),
                                             'patron': props.get('Patron') if props.get('Patron') not in (None, 'unidentified') else None,
                                             'century': props.get('Century'), 'century_text': f"{props['Century']}th century" if props.get('Century') else None,
                                             'location': cert}})
    os.makedirs(os.path.join(D, 'derived'), exist_ok=True)
    for name, feats in (('quarters', quarters), ('buildings', buildings)):
        json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(D, 'derived', f'{name}.geojson'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('quarters', len(quarters), 'buildings', len(buildings))


if __name__ == '__main__':
    main()
