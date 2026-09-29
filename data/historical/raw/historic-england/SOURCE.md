# National Heritage List for England (NHLE) — Historic England open data

- **Official source:** Historic England Open Data Hub: https://opendata-historicengland.hub.arcgis.com/ (item 767f279327a24845bf47dfe5eae9862b)
- **Dataset page:** https://opendata-historicengland.hub.arcgis.com/datasets/767f279327a24845bf47dfe5eae9862b
- **Version / date:** Export made on the download date (Historic England says the data is updated daily). Re-downloading gives a newer export with a different checksum.
- **Licence:** Open Government Licence v3.0, under the Historic England Open Data Hub Terms and Conditions — https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ (see LICENSE.md)
- **Geographic coverage:** England.
- **Historical date range:** Designated heritage from prehistory to the 20th century; designation dates from the 1880s onward.
- **Download date:** 2026-09-29
- **Total size:** 301.7 MB in 7 files

## What it contains

GeoPackage exports (British National Grid, EPSG:27700) of the six requested designations: Listed Buildings (points, 379,685, and polygons for entries listed or amended since April 2011), Scheduled Monuments, Registered Parks and Gardens, Registered Battlefields, Protected Wreck Sites and World Heritage Sites.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py historic-england` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/Battlefields.gpkg` | 616.0 KB | yes | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=8 | `f816265133937bafabaafa6cda154e8ae06834c100bf750155639af3dd9e99e8` |
| `original/Listed_Building_points.gpkg` | 98.2 MB | no | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=0 | `1197b966654a328aad288da8ae31e1de5e6c5dfc2bc85098dd203c94a67ffa2d` |
| `original/Listed_Building_polygons.gpkg` | 142.7 MB | no | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=3 | `5c8d5bcb47fb1b6d85c2947a4eb823e285f556740a976c2f0023afd8f2855c11` |
| `original/Parks_and_Gardens.gpkg` | 13.5 MB | yes | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=7 | `e39875d7101c3e161cbc55fdfb1277b31d950609409d8e122cac3112dad207b4` |
| `original/Protected_Wreck_Sites.gpkg` | 308.0 KB | yes | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=9 | `9b7cd267ea3e6ae2327f5acec97f1b91131168c6fb692cbaa446b018f1a3a939` |
| `original/Scheduled_Monuments.gpkg` | 43.1 MB | no | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=6 | `fb8554874537483e2e5b61053141367821615757edfd235ed12e09317330d060` |
| `original/World_Heritage_Sites.gpkg` | 3.3 MB | yes | https://opendata-historicengland.hub.arcgis.com/api/download/v1/items/767f279327a24845bf47dfe5eae9862b/geoPackage?redirect=true&layers=10 | `8fde04089945aabc572330739f3f73c43b27b2c9514ce02a6aa624cd7c6eacae` |

## How to cite

© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. National Heritage List for England.
