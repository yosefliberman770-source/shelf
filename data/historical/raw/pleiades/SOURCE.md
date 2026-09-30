# Pleiades: a gazetteer of past places

- **Official source:** Pleiades (Institute for the Study of the Ancient World, NYU, and contributors). Official downloads: https://atlantides.org/downloads/pleiades/
- **Dataset page:** https://atlantides.org/downloads/pleiades/
- **Version / date:** Daily export of 29 September 2026 (files are dated in their names).
- **Licence:** Creative Commons Attribution (CC BY) — https://creativecommons.org/licenses/ (see LICENSE.md)
- **Geographic coverage:** The ancient Mediterranean, Near East and beyond (Europe, North Africa, western and central Asia).
- **Historical date range:** Mainly c. 1000 BCE – AD 640, with some earlier and later places.
- **Download date:** 2026-09-29
- **Total size:** 211.6 MB in 7 files

## What it contains

The complete GIS package (pleiades_gis_data.zip: places, names, locations and connections as CSV/GIS tables), the comprehensive JSON of all places (pleiades-places-*.json.gz) and the errata JSON, and the daily CSV dumps of places, names and locations with their README.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py pleiades` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/dumps/README.txt` | 2.0 KB | yes | https://atlantides.org/downloads/pleiades/dumps/README.txt | `17f99a59f8d53417ff6fb0c3ff8ebc5184c2ae8a7a466971cf656af24e98c492` |
| `original/dumps/pleiades-locations-20260929.csv.gz` | 37.7 MB | no | https://atlantides.org/downloads/pleiades/dumps/pleiades-locations-20260929.csv.gz | `92d4dd7cbf1c2a86c025a99334939f836d182730485f5ac1d89a1b972bc5fb3b` |
| `original/dumps/pleiades-names-20260929.csv.gz` | 3.6 MB | yes | https://atlantides.org/downloads/pleiades/dumps/pleiades-names-20260929.csv.gz | `9dded1fa1603a305ac2632022263c45a170c2e1cce7a164dfaf28ed49377a981` |
| `original/dumps/pleiades-places-20260929.csv.gz` | 6.5 MB | yes | https://atlantides.org/downloads/pleiades/dumps/pleiades-places-20260929.csv.gz | `5c9703bfed29de46a54c4a7310fc7fb9459339a5cc537028c073240e5aac84ec` |
| `original/gis/pleiades_gis_data.zip` | 33.9 MB | no | https://atlantides.org/downloads/pleiades/gis/pleiades_gis_data.zip | `7c0ef2f1483cec0618e0a7c41cfbb15a66307fac46ec5a839fb3672e7eecaf28` |
| `original/json/pleiades-errata-20260929.json.gz` | 82.2 KB | yes | https://atlantides.org/downloads/pleiades/json/pleiades-errata-20260929.json.gz | `25c5648847a034e88c3273e232aefd7ec81c5fb018108f38c89b16afc3a4b001` |
| `original/json/pleiades-places-20260929.json.gz` | 129.7 MB | no | https://atlantides.org/downloads/pleiades/json/pleiades-places-20260929.json.gz | `514e1f524d07b35a2b88a8e6f7e9ff3e4dbc229d1717599cb87d6bc5be7903d1` |

## How to cite

Pleiades: A Gazetteer of Past Places. https://pleiades.stoa.org/ (daily export, 29 September 2026).
