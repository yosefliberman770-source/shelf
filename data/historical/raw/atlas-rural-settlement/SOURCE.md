# Atlas of Rural Settlement in England GIS (Roberts & Wrathmell)

- **Official source:** English Heritage (now Historic England), data by Andrew Lowerre, Eddie Lyons, Brian K. Roberts and Stuart Wrathmell; distributed by ADS and Historic England.
- **Dataset page:** https://archaeologydataservice.ac.uk/archives/view/atlasrural_he_2015/downloads.cfm
- **DOI:** https://doi.org/10.5284/1031493
- **Version / date:** Shapefile dissemination package, README dated January 2011 (English Heritage); ADS collection 2015. Based on Roberts & Wrathmell, An Atlas of Rural Settlement in England (2000; corrected reprint 2003).
- **Licence:** Atlas of Rural Settlement in England GIS terms and conditions (© English Heritage) — download for personal and business use — https://archaeologydataservice.ac.uk/archives/view/atlasrural_he_2015/ (see LICENSE.md)
- **Geographic coverage:** England (with a background outline of England and Wales).
- **Historical date range:** Settlement patterns mapped mainly from mid-nineteenth-century Ordnance Survey maps, used to study medieval and earlier rural settlement. Not a dated snapshot of any one year.
- **Download date:** 2026-09-30
- **Total size:** 12.6 MB in 1 files

## What it contains

The complete Shapefile package: settlement provinces (31 polygons), sub-provinces (60), local regions (276, with dispersion descriptions), nucleations (10,513 villages and hamlets by category), dispersion/hamlet scores (4,004 sample points), terrain types, terrain zones and escarpments, an England–Wales background, UK GEMINI metadata, ArcGIS project and layer files, the province descriptions (PDF), documentation and data dictionary (PDFs), terms and conditions (PDF) and READ_ME.txt.

## Processed into Shelf

public/world/tiles/rural-settlement.pmtiles (layer `rural`; `k` = province / subprovince / local / nucleation), built by scripts/atlas-build/england.py — git-ignored and not deployed. The map layer “Rural settlement provinces (England)” is disabled unless Shelf is built locally with VITE_SHELF_LOCAL_DATA=1.

## Known limitations

A characterisation of settlement patterns, not a record of when places existed. Terrain layers were not processed (not needed yet). English Heritage says the data should be checked against other sources before relying on it.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py atlas-rural-settlement` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/atlas-gis-shapefile.zip` | 12.6 MB | yes | https://archaeologydataservice.ac.uk/archives/view/atlasrural_he_2015/downloads.cfm | `be6fdf6e49084763d83fbf35e0d8c172294553e76fb193878423ed3c1d06f42e` |

### Provenance

- `original/atlas-gis-shapefile.zip`: Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/atlas-gis-shapefile.zip.zip). Saved here as atlas-gis-shapefile.zip (the phone added a second “.zip”); contents unchanged.

## How to cite

Lowerre, A., Lyons, E., Roberts, B. K., Wrathmell, S. (2015) Atlas of Rural Settlement in England GIS [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1031493
