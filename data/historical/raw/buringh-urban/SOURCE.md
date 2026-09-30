# European urban population, 700–2000

- **Official source:** E. Buringh (Utrecht University), deposited at DANS Data Station Social Sciences and Humanities.
- **Dataset page:** https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/dans-xzy-u62q
- **DOI:** https://doi.org/10.17026/dans-xzy-u62q
- **Version / date:** Version 1 (production 2020-05-05; distributed 2021-03-31).
- **Licence:** Creative Commons CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ (see LICENSE.md)
- **Geographic coverage:** Europe (2,262 settlements, all present-day European countries).
- **Historical date range:** AD 700–2000, estimates per century (and finer after 1500).
- **Download date:** 2026-09-30
- **Total size:** 5.3 MB in 3 files

## What it contains

One row per city and year: city, historical names and synonyms, country, transport location / water catchment, coordinates, elevation, estimated inhabitants (thousands), the source of the estimate and its nature (e.g. "proxied", imputed). Annexes A and B (PDF) document the sources and method.

## Processed into Shelf

Population estimates for towns in the place index and map sizes (scripts/atlas-build/sites.py).

## Known limitations

Many figures are proxies or city-specific imputations, marked as such; a population of 0 means below the dataset's threshold, not "did not exist". Coordinates are rounded to 0.01°.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py buringh-urban` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/European urban population, 700 - 2000 - Annex A.pdf` | 191.8 KB | yes | https://ssh.datastations.nl/api/access/datafile/20414 | `541f1ecc2342753d83a86ef734aaa220a57d41a6db941699558f4c01f934aa60` |
| `original/European urban population, 700 - 2000 - Annex B.pdf` | 427.6 KB | yes | https://ssh.datastations.nl/api/access/datafile/20413 | `a9563f14abffab4879a3cca1d996c0de97a95a103f232c00ab1a58d57e02a29d` |
| `original/European urban population, 700 - 2000.tab` | 4.7 MB | yes | https://ssh.datastations.nl/api/access/datafile/20415 | `d799dbeaafe7e00f897696cf828e55146394ae1bdd7618aee3d37d0364291a31` |

## How to cite

Buringh, E. (2021) European urban population, 700–2000. DANS. https://doi.org/10.17026/dans-xzy-u62q
