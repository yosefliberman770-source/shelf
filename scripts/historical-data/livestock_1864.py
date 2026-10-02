#!/usr/bin/env python3
"""Join the 1864 livestock census of European Russia (Farmlands: Counting Sheep, Harvard Dataverse doi:10.7910/DVN/OTTZQY)
to its province polygons by gazetteer id, into raw/russia-livestock-1864/derived/provinces_livestock_1864.shp (same CRS,
.prj copied) with one added field, 'livestock': the province's total head of livestock as the source's totals table gives it."""
import csv
import os
import shutil
import zipfile

import shapefile

RAW = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'russia-livestock-1864')

if __name__ == '__main__':
    out = os.path.join(RAW, 'derived')
    os.makedirs(out, exist_ok=True)
    zipfile.ZipFile(os.path.join(RAW, 'original', 'farmlands_provinces.zip')).extractall(out)
    counts = {}
    with open(os.path.join(RAW, 'original', 'livestock_european-russia_1864_totals.tab'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['ttl_q']:
                counts[r['igazID']] = int(float(r['ttl_q']))
    src = shapefile.Reader(os.path.join(out, 'farmlands_provinces'))
    dst = shapefile.Writer(os.path.join(out, 'provinces_livestock_1864'), shapeType=src.shapeType)
    for fl in src.fields[1:]:
        dst.field(*fl)
    dst.field('livestock', 'N', 12)
    for sr in src.iterShapeRecords():
        dst.shape(sr.shape)
        dst.record(*sr.record, counts.get(str(sr.record['igazID'])))
    dst.close()
    shutil.copy(os.path.join(out, 'farmlands_provinces.prj'), os.path.join(out, 'provinces_livestock_1864.prj'))
    print(len(src), 'provinces')
