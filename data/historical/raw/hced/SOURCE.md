# Historical Conflict Event Dataset (HCED)

- **Official source:** Charles Miller (Australian National University) and co-authors, Harvard Dataverse.
- **Dataset page:** https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/6ZFC0V
- **DOI:** https://doi.org/10.7910/DVN/6ZFC0V
- **Version / date:** Dataverse version 5; data file "HCED Data v3.csv".
- **Licence:** Creative Commons CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ (see LICENSE.md)
- **Geographic coverage:** Worldwide.
- **Historical date range:** 1468 BC – present.
- **Download date:** 2026-09-30
- **Total size:** 2.1 MB in 2 files

## What it contains

About 7,000 battles and sieges with year, coordinates, participants, war, winner and loser, theatre, scale, and the reference work (mostly encyclopedias of warfare). The explainer file describes the replication files, which were not downloaded.

## Processed into Shelf

Battles not already in the Wikidata snapshot are added to the medieval-sites tiles (scripts/atlas-build/sites.py).

## Known limitations

Geolocated first with Google Maps from battle names, then checked by hand; the authors list locations that differ from other datasets by more than 100 km. Year only; no exact dates. Coverage follows English-language warfare encyclopedias.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py hced` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/HCED Data v3.csv` | 2.1 MB | yes | https://dataverse.harvard.edu/api/access/datafile/13390255 | `92a22e49c20d02a1d7ecf3fbdbb5e3ca94b7327b7620ee79dd01909857805b79` |
| `original/HCED explainer.txt` | 2.4 KB | yes | https://dataverse.harvard.edu/api/access/datafile/6909628 | `7cd17664755fdc2a887df22c8bae8b47f722e1339a62fe3f979adfb25cbabe25` |

## How to cite

Miller, C. et al. (2022) Conflict Events Worldwide Since 1468BC: Introducing the Historical Conflict Event Dataset. Journal of Conflict Resolution. https://doi.org/10.1177/00220027221119085 ; data: https://doi.org/10.7910/DVN/6ZFC0V
