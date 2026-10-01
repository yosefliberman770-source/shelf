#!/usr/bin/env python3
"""UrbanOccupationsOETR temettuat geosample (Zenodo 10.5281/zenodo.13220585, CC BY 4.0): household agricultural holdings
recorded in the Ottoman temettuat (income) registers of the 1840s, in six regions (Ankara, Bursa, Edirne, Manisa, Plovdiv, Ruse).

  python3 scripts/historical-data/temettuat_villages.py
    reads  data/historical/raw/oetr-temettuat/original/temettuat_cultivation_6_region_rural_geosample.xlsx   (unchanged)
    writes data/historical/raw/oetr-temettuat/derived/villages.csv   one row per village: position, region, number of
           recorded holdings and the most frequent land uses as the register names them (bağ = vineyard, tarla = field …)
"""
import csv
import os
from collections import Counter, defaultdict

import openpyxl

D = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'oetr-temettuat')
GLOSS = {'bağ': 'vineyard', 'tarla': 'field', 'mezru tarla': 'sown field', 'hali tarla': 'fallow field', 'bahçe': 'garden', 'harab bağ': 'ruined vineyard',
         'harab bahçe': 'ruined garden', 'çayır': 'meadow', 'dut': 'mulberry', 'dutluk': 'mulberry grove', 'zeytin': 'olive', 'zeytinlik': 'olive grove',
         'çeltik': 'rice field', 'cehrilik': 'dyer\'s buckthorn field', 'bostan': 'vegetable garden', 'değirmen': 'mill'}


def main():
    ws = openpyxl.load_workbook(os.path.join(D, 'original', 'temettuat_cultivation_6_region_rural_geosample.xlsx'), read_only=True, data_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    h = next(rows)
    vill, uses, holdings = {}, defaultdict(Counter), Counter()
    for r in rows:
        p = dict(zip(h, r))
        if p.get('Longitude') in (None, '') or p.get('Latitude') in (None, ''):
            continue
        k = (p['Region'], p['SubDistrict'], p['Location'])
        vill.setdefault(k, (p['GeoCode'], p['Longitude'], p['Latitude']))
        holdings[k] += 1
        if p.get('Cultivation'):
            uses[k][str(p['Cultivation']).strip()] += 1
    os.makedirs(os.path.join(D, 'derived'), exist_ok=True)
    with open(os.path.join(D, 'derived', 'villages.csv'), 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['geocode', 'village', 'subdistrict', 'region', 'lon', 'lat', 'holdings', 'land_uses'])
        for k, (code, lon, lat) in sorted(vill.items()):
            top = ', '.join(f"{GLOSS.get(u, u)} ({n})" for u, n in uses[k].most_common(4))
            w.writerow([code, k[2], k[1], k[0], lon, lat, holdings[k], top])
    print('villages', len(vill))


if __name__ == '__main__':
    main()
