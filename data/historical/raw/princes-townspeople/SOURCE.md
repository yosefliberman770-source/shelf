# Princes and Townspeople: A Collection of Historical Statistics on German Territories and Cities (parts 1–6)

- **Official source:** Edyta P. Bogucka, Davide Cantoni, Cathrin Mohr, Matthias Weigand (TU Munich / LMU Munich); Harvard Dataverse.
- **Dataset page:** https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/ZGSJED (and DVN/GZPPVE, TYAGVO, FJ8ZZQ, JIAC0S, ZN1QNS)
- **DOI:** https://doi.org/10.7910/DVN/ZGSJED
- **Version / date:** Part 1 v3 (2021), part 2 v4 (2024), parts 3–4 v1 (2020), part 5 v2 (2024), part 6 v1 (2021) — the latest versions when downloaded.
- **Licence:** Creative Commons CC0 1.0 (each Dataverse record) — https://creativecommons.org/publicdomain/zero/1.0/ (see LICENSE.md)
- **Geographic coverage:** The Holy Roman Empire / German Empire within the borders of Germany 1937 (incl. Danzig): the 2,390 cities of the Deutsches Städtebuch.
- **Historical date range:** First mentions from the early Middle Ages; ruling territory per year 1300–1918 (reliable from 1300 per the documentation).
- **Download date:** 2026-09-30
- **Total size:** 81.4 MB in 18 files

## What it contains

City locations and 2019 borders; territorial histories (ruling lineage per city per year, dynasties, territory codes); town charters and first mentions (with date uncertainty and range, legal families); market grants by type; construction activity; conflict incidents. Documentation PDFs for each part.

## Processed into Shelf

public/world/tiles/hre-towns.pmtiles and place-index gazetteer `hre` (scripts/atlas-build/regional.py): first mention, charter, first market grant and ruler spans. Construction and conflict tables are held raw, not yet used.

## Known limitations

Only towns that later became cities (Städtebuch); villages are not covered. Coverage limited to 1937 German borders (Bohemia, Austria, Switzerland, Low Countries excluded). Dates come from the Städtebuch entries, coded with uncertainty/range fields.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py princes-townspeople` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/cities_dynasties.tab` | 23.8 MB | yes | https://dataverse.harvard.edu/api/access/datafile/10047015 | `7d1d71e5cfce0df1327bc95b0e5a70ead23201f0d49a5a588c8c47d8e2c505d5` |
| `original/cities_polities.tab` | 43.3 MB | no | https://dataverse.harvard.edu/api/access/datafile/10047016 | `a7385a1c6f217c810d147f898a1cab14774f2c61c1aed791dfd616de58480c8f` |
| `original/city_borders_2019.zip` | 551.4 KB | yes | https://dataverse.harvard.edu/api/access/datafile/4099960 | `4f12e1861523428bba464da1a573f9ff71613efd4fe9c6ac5db156681e392a4f` |
| `original/city_documentation.pdf` | 1.8 MB | yes | https://dataverse.harvard.edu/api/access/datafile/5588457 | `e5df2f74971d6730828ade8712c67ca805d4ec5bbab0e2dc209ed51304d7da63` |
| `original/city_locations.tab` | 362.2 KB | yes | https://dataverse.harvard.edu/api/access/datafile/5588458 | `1c9a5f736f4f623e81fe4d308498dede36c2cb932200637f427c66fdd2661114` |
| `original/conflict_incidents.tab` | 647.4 KB | yes | https://dataverse.harvard.edu/api/access/datafile/5588455 | `a5d8da46316160328bd040e24fbe4afaa1880a06673e9f743924051b5af01621` |
| `original/conflict_incidents_documentation.pdf` | 399.9 KB | yes | https://dataverse.harvard.edu/api/access/datafile/5588456 | `fed280a7493bdbdb9f1872ed9bf3909085c063fca95441e511496db204d1e7c2` |
| `original/construction.tab` | 2.9 MB | yes | https://dataverse.harvard.edu/api/access/datafile/10047022 | `1be481534c3ffcf3bd9b6573b99331647e7d41b14f341bca4744d38e582b45e9` |
| `original/construction_documentation.pdf` | 125.9 KB | yes | https://dataverse.harvard.edu/api/access/datafile/10047032 | `1a864910914cee8c61d6941df107152f897f7b625131c9fb20366c9943b7beaf` |
| `original/legal_families.tab` | 3.0 KB | yes | https://dataverse.harvard.edu/api/access/datafile/3806259 | `53fbb1e7d4bb6c868c90fd8945bc883f45260c2457af1b33eed3d9895f7cf7cf` |
| `original/markets.tab` | 1.0 MB | yes | https://dataverse.harvard.edu/api/access/datafile/3806263 | `7e7927d1130d224139dd4a0c3affe94d5ccfeea714d9c729bb693bec7b045ed8` |
| `original/markets_documentation.pdf` | 78.8 KB | yes | https://dataverse.harvard.edu/api/access/datafile/3806264 | `0939645bd896ca9eab91fed3988e0d432b3e636be2ce79f031836359182c33e5` |
| `original/territories_all.tab` | 4.8 MB | yes | https://dataverse.harvard.edu/api/access/datafile/10047017 | `8da0a9fc9c32aa01cea7c2e6c2a0c460b16411bedcb0b46883756365f7c0f3fc` |
| `original/territory_blueprints.tab` | 409.1 KB | yes | https://dataverse.harvard.edu/api/access/datafile/3806256 | `11c577dc9bccf447e34bad20a90918bbca868dc1662b15b60842afb83da740bf` |
| `original/territory_codes.tab` | 207.0 KB | yes | https://dataverse.harvard.edu/api/access/datafile/4099956 | `903f546da18efc50aedce4e906e9ca2cbded7ec2584ee2b94d99b65dafde128c` |
| `original/territory_documentation.pdf` | 342.4 KB | yes | https://dataverse.harvard.edu/api/access/datafile/10047031 | `c94b237254549e9e37b2f3bc62962838e4d38ae48108bead7a6dee2dddfe8520` |
| `original/towncharter.tab` | 666.0 KB | yes | https://dataverse.harvard.edu/api/access/datafile/3806261 | `ad069820fcfa0a5e36e79c6c781ecee74f9e16a5ef1bb1bd4150e716ed0fed98` |
| `original/towncharter_documentation.pdf` | 77.1 KB | yes | https://dataverse.harvard.edu/api/access/datafile/3806260 | `f9e9a457422c73a3c22b0f354e4cb5f864d3ed97b300ac9baf4133767e6bfead` |

## How to cite

Bogucka, E. P., Cantoni, D., Mohr, C., Weigand, M. Princes and Townspeople: A Collection of Historical Statistics on German Territories and Cities. Harvard Dataverse. https://doi.org/10.7910/DVN/ZGSJED
