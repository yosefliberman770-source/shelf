# Domesday Shires and Hundreds of England

- **Official source:** Archaeology Data Service (ADS). Creator: Stuart Brookes (Landscapes of Governance project, UCL / Nottingham / Winchester).
- **Dataset page:** https://archaeologydataservice.ac.uk/archives/collections/view/1003676/downloads.cfm
- **DOI:** https://doi.org/10.5284/1058999
- **Version / date:** First released 31 January 2020 (data created 2010–2017).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** England and parts of Wales.
- **Historical date range:** AD 1086 (as recorded in Domesday Book).
- **Download date:** 2026-09-30
- **Total size:** 5.6 MB in 4 files

## What it contains

All three ESRI shapefiles offered: DBshires (shires, 35), DBinter (intermediate districts such as lathes and rapes, 21) and DBhundreds (hundreds and wapentakes, 810); plus the general guide (PDF). British National Grid.

## Processed into Shelf

public/world/tiles/domesday.pmtiles (layer `units`; `k` = shire / inter / hundred), built by scripts/atlas-build/england.py. Map layer “Domesday shires & hundreds (1086)”, shown 1066–1106 and always labelled as the 1086 arrangement.

## Known limitations

From the guide: the boundaries are a retrogressive reconstruction — mostly following the Alecto Domesday county maps (1986–92) and re-aggregated from parish boundaries mapped in 1851 — of units "as they are believed to have existed in 1086", not earlier or later arrangements. Domesday coverage is thinner in Durham, Northumberland, Westmorland and Cumberland, where land was divided into wards rather than hundreds; parts of Wales and the far north are absent — a gap in the record, not an absence of places. The guide counts 812 hundreds; the file holds 810 polygons. DBinter groups very different units (Ridings, lathes, rapes, Lincolnshire hundreds) together.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py domesday` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/DBhundreds.zip` | 4.0 MB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3676-1/dissemination/DBhundreds.zip | `7c5752a72580958f7a2f46aacee22f74570834fa06845a03a73b0bea17c2fc52` |
| `original/DBinter.zip` | 302.4 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3676-1/dissemination/DBinter.zip | `a2ff8aa137429c3041d04c542904cbc09566e51ec51b51a5ea7aaf8a47d2e072` |
| `original/DBshires.zip` | 1.1 MB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3676-1/dissemination/DBshires.zip | `20ef0dea52b91f9c91e1dfdb27ab147bec37a17e5aced69b4541a6130c1ac06c` |
| `original/LoG_GeneralGuide.pdf` | 215.3 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3676-1/dissemination/LoG_GeneralGuide.pdf | `ee8cc934ec5cfa49127638b35a7ca9a7d29b2422688b1a34217831355bc7c390` |

### Provenance

- `original/DBhundreds.zip`: Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/DBhundreds.zip).
- `original/DBinter.zip`: Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/DBinter.zip).
- `original/DBshires.zip`: Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/DBshires.zip).

## How to cite

Brookes, S. (2020) Domesday Shires and Hundreds of England [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1058999
