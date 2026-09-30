# Kulturminner — lokaliteter, enkeltminner og sikringssoner (Norwegian heritage register)

- **Official source:** Riksantikvaren, distributed by Geonorge (whole-country GML order).
- **Dataset page:** https://kartkatalog.geonorge.no/metadata/c72906a0-2bc2-41d7-bea2-c92d368e3c49
- **Version / date:** GML extract of 2026-09-28; code lists from register.geonorge.no.
- **Licence:** Norsk lisens for offentlige data (NLOD) — "Åpne data" (Geonorge metadata). — https://data.norge.no/nlod/no/1.0 (see LICENSE.md)
- **Geographic coverage:** Norway.
- **Historical date range:** All periods; Shelf keeps monuments the register dates to the Migration period, Viking Age or Middle Ages (period codes 044–053).
- **Download date:** 2026-09-30
- **Total size:** 297.2 MB in 5 files

## What it contains

Localities and individual monuments with type, original function, dating code and quality, geometry.

## Processed into Shelf

Settlements, churches and churchyards, forts, trade sites, burial mounds and house sites with a period of at most 700 years → public tiles and place index (8,941).

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py norway-kulturminner` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/Kulturminner_0000_Norge_4258_Kulturminner_GML.zip` | 296.9 MB | no | https://nedlasting.geonorge.no/api/order (dataset c72906a0-2bc2-41d7-bea2-c92d368e3c49, whole country, GML) | `daaf645d654eb13ea2cf8c7f4bb8849089d22f495d28a872e2ec7f43400bdb0f` |
| `original/cl-kulturminnedatering.json` | 30.1 KB | yes | https://register.geonorge.no/sosi-kodelister/kulturminner/kulturminnedatering.json | `ffc115eaf01697765fbddf304633c899d9815cab88e0f4e40057ccc650846cbb` |
| `original/cl-kulturminneenkeltminneart.json` | 336.5 KB | yes | https://register.geonorge.no/sosi-kodelister/kulturminner/kulturminneenkeltminneart.json | `2c01f521d378d0b86d5c0e10faa1cf6bb5ba487cfecf1d162713c49e24d0c2c8` |
| `original/cl-kulturminnefunksjon.json` | 12.8 KB | yes | https://register.geonorge.no/sosi-kodelister/kulturminner/kulturminnefunksjon.json | `f65dee9885b36c3ba20a2f3d4eb3b6ce258f5a7e12982a63c7cbbb0002e3841f` |
| `original/cl-kulturminnekategori.json` | 7.3 KB | yes | https://register.geonorge.no/sosi-kodelister/kulturminner/kulturminnekategori.json | `f9d0c8cd4cdbe1972153dd23889fd023903927dc2b853d40e618e8024699f855` |

## How to cite

Riksantikvaren, Kulturminnesøk / Askeladden, via Geonorge (NLOD).
