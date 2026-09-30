# Museovirasto spatial data: archaeological sites and protected buildings (research dataset)

- **Official source:** Finnish Heritage Agency (Museovirasto).
- **Dataset page:** https://www.museovirasto.fi/fi/palvelut-ja-ohjeet/tietojarjestelmat/kulttuuriympariston-tietojarjestelmat/kulttuuriympaeristoen-paikkatietoaineistot
- **Version / date:** Daily export as downloaded (files dated 2026-09-30).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** Finland.
- **Historical date range:** Stone Age to modern, by period class.
- **Download date:** 2026-09-30
- **Total size:** 36.5 MB in 1 files

## What it contains

GeoPackages of archaeological sites (points and areas; 112,707 point records), protected buildings, nationally significant environments and world heritage (ETRS-TM35FIN).

## Processed into Shelf

Sites whose period classes include "keskiaikainen" (medieval), 1,823, as gazetteer `finreg` and sites, dated by the period classes only.

## Known limitations

Period classes, not dates; the class bounds used by Shelf (medieval c. 1150–1550, Iron Age –1150, historical 1150–) are approximate.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py finland-heritage` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/tutkija.zip` | 36.5 MB | no | https://mverkkodatashare.blob.core.windows.net/share/tutkija.zip | `98c31ac26dc2a7028fd4eabb7579c3a035e163a366d5a148470a115ee93376de` |

## How to cite

Museovirasto, Muinaisjäännösrekisteri (CC BY 4.0).
