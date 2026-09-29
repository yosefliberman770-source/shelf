# al-Ṯurayyā Gazetteer (v1.0)

- **Official source:** al-Ṯurayyā project (Masoumeh Seydi, Maxim Romanov, Leipzig; after Georgette Cornu, Atlas du monde arabo-islamique à l'époque classique, 1983). Official repository: https://github.com/althurayya/althurayya.github.io
- **Dataset page:** https://github.com/althurayya/althurayya.github.io/tree/f244e65ddf782baef08e410870c61c8096ff9f90/master
- **Version / date:** Repository commit f244e65ddf782baef08e410870c61c8096ff9f90 (22 September 2026).
- **Licence:** Data: Creative Commons Attribution 4.0 International (CC BY 4.0), see DATA-LICENSE.md. Code: Apache License 2.0, see LICENSE. — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** The early Islamic world, from al-Andalus and the Maghreb to Central Asia.
- **Historical date range:** Classical Islamic period, 9th–10th centuries CE (after Cornu).
- **Download date:** 2026-09-29
- **Total size:** 26.5 MB in 10 files

## What it contains

The data files the map uses (master/): places (GeoJSON/JSON, in several structures, over 2,000 toponyms), routes (JSON, almost as many route sections) and regions. The World Historical Gazetteer copy could not be checked: whgazetteer.org refused automated access (HTTP 403).

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py al-thurayya` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/DATA-LICENSE.md` | 1.0 KB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/DATA-LICENSE.md | `f99d3f9f9bee98aaabf99bedd8200c4ee7c9e90ae1d32e696b19540163271837` |
| `original/LICENSE` | 11.1 KB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/LICENSE | `f844745981081fa53332541f9370ce9d13471c4e4e1eed6a63cbdeb50383f058` |
| `original/README.md` | 3.8 KB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/README.md | `93a012ac3ebab6b82271d4fe8fadecdee70f090489b4e78de5e4ae5d110edb4d` |
| `original/master/places.geojson` | 3.2 MB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/places.geojson | `9ceef49582106441fc63fc230a17045fdb6f5ef778f77d8c63eebbea2e2137d3` |
| `original/master/places.json` | 3.2 MB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/places.json | `9ceef49582106441fc63fc230a17045fdb6f5ef778f77d8c63eebbea2e2137d3` |
| `original/master/places_full.geojson` | 3.2 MB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/places_full.geojson | `9ceef49582106441fc63fc230a17045fdb6f5ef778f77d8c63eebbea2e2137d3` |
| `original/master/places_new_structure.geojson` | 4.1 MB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/places_new_structure.geojson | `f55abaeab8c67a111bffe8a3d7b5f8d1321b059cbbc279503dea8d1ad9a278eb` |
| `original/master/regions.json` | 4.3 KB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/regions.json | `da705f7d280b82633da78b076a5f13fca07aedc2acd77b55d352bca65861d000` |
| `original/master/routes.json` | 6.4 MB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/routes.json | `40dd41ec54cb84b643a4206b8275660ac06752d5114b2c1bcec047845eb462b3` |
| `original/master/routes_full.json` | 6.4 MB | yes | https://raw.githubusercontent.com/althurayya/althurayya.github.io/f244e65ddf782baef08e410870c61c8096ff9f90/master/routes_full.json | `40dd41ec54cb84b643a4206b8275660ac06752d5114b2c1bcec047845eb462b3` |

## How to cite

Seydi, M., Romanov, M. et al. al-Ṯurayyā Gazetteer, v1.0. https://althurayya.github.io/
