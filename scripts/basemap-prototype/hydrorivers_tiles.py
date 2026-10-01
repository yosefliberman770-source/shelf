"""Prototype only (docs/BASE_MAP.md): HydroRIVERS v1.0 Europe as river tiles whose zoom comes from upstream area.

  pip install pyshp
  python3 scripts/basemap-prototype/hydrorivers_tiles.py HydroRIVERS_v10_eu.shp hydrorivers-eu.pmtiles

Source: https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_eu_shp.zip (CC-BY 4.0). Measured on 1 Oct 2026:
224,603 segments (upstream area >= 50 km2, lon -25..45, lat 34..72), 24,408 tiles z3-10, 29.8 MB, 195 s.
"""
import os
import sys
import time

import shapefile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'atlas-build'))
import tiler  # noqa: E402

# Upstream area (km2) at which a river appears, and the zoom.
MZ = [(50000, 3), (20000, 4), (5000, 5), (1500, 6), (500, 7), (150, 8), (50, 9)]
r = shapefile.Reader(sys.argv[1])
feats = []
for rec, shp in zip(r.iterRecords(fields=['HYRIV_ID', 'UPLAND_SKM', 'DIS_AV_CMS', 'ORD_STRA']), r.iterShapes()):
    x0, y0, x1, y1 = shp.bbox
    if x1 < -25 or x0 > 45 or y1 < 34 or y0 > 72: continue
    up = rec['UPLAND_SKM']
    mz = next((z for t, z in MZ if up >= t), None)
    if mz is None: continue
    feats.append(({'type': 'LineString', 'coordinates': shp.points}, {'i': rec['HYRIV_ID'], 'u': round(up), 'q': round(rec['DIS_AV_CMS'], 1), 's': rec['ORD_STRA']}, mz))
print(len(feats), 'features', flush=True)
t = time.time()
n = tiler.build(sys.argv[2], 'rivers', feats, 10, 'HydroRIVERS Europe (prototype)', 'HydroRIVERS (Lehner & Grill 2013), CC-BY 4.0', min_zoom=3)
print(n['tiles'], 'tiles', n['features'], 'features', round(time.time() - t), 's', flush=True)
