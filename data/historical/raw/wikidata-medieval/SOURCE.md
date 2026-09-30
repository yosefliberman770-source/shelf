# Wikidata snapshot: medieval and early sites of Europe, the Mediterranean and the Near East

- **Official source:** Wikidata (Wikimedia Foundation and contributors), queried through the QLever Wikidata endpoint (University of Freiburg), https://qlever.dev/wikidata
- **Dataset page:** https://www.wikidata.org/
- **Version / date:** Query snapshot; the exact SPARQL queries are saved in original/queries/. Re-run with scripts/historical-data/wikidata_snapshot.py.
- **Licence:** Creative Commons CC0 1.0 (public domain dedication) — https://creativecommons.org/publicdomain/zero/1.0/ (see LICENSE.md)
- **Geographic coverage:** Europe, the Mediterranean and the Near East (lon −32…62, lat 24…72).
- **Historical date range:** Castles, monasteries, cathedrals and dioceses of any date (with Wikidata's founding / dissolution dates where recorded); battles and sieges before 1600; fortifications founded before 1500; universities and bridges founded before 1600; settlements with a first written mention or founding date 400–1600.
- **Download date:** 2026-09-30
- **Total size:** 27.3 MB in 21 files

## What it contains

Per kind: the item, coordinates, English label, founding date (P571), earliest written record (P1249), dissolution (P576), point in time / start / end (P585, P580, P582), religious order (P611), diocese (P708), part of (P361, e.g. the war of a battle), instance-of classes and sitelink count; a second file with the item's labels in 27 European languages and Latin; and English labels of the orders, classes, dioceses and wars referred to.

## Processed into Shelf

public/world/tiles/medieval-sites.pmtiles and the place index (gazetteer `wikidata`), built by scripts/atlas-build/sites.py.

## Known limitations

Coverage follows what Wikipedians and national heritage imports have entered, not historical reality: e.g. 9,400 Czech settlements have a first-mention date but only a few hundred French ones, although France has far more medieval villages. Many castles and monasteries have no founding date (only 16% of castles), and the "castle" class also holds later château / Schloss country houses. Dates are often the first mention, the start of building, or a refoundation — Wikidata does not always say which. Coordinates are of the present site or ruin. Battle locations are Wikidata's, not a battlefield survey.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py wikidata-medieval` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/battle.names.tsv` | 384.1 KB | yes | https://qlever.dev/api/wikidata (POST queries/battle.names.rq) | `36529a100c8b41e26ca9f7c4de54b223c3283d1c2e43a0b387881a9a91bcf8b4` |
| `original/battle.tsv` | 397.9 KB | yes | https://qlever.dev/api/wikidata (POST queries/battle.rq) | `bc21e8128cbcc2c0861c31c9b2d4602c3002880305c8bda7407e82a0804d6a8c` |
| `original/bridge.names.tsv` | 34.8 KB | yes | https://qlever.dev/api/wikidata (POST queries/bridge.names.rq) | `b7bc2d18aa43d445c8f01fa7ecfdc83df001c8bf5961e9e3482e784c2e0dc652` |
| `original/bridge.tsv` | 63.2 KB | yes | https://qlever.dev/api/wikidata (POST queries/bridge.rq) | `098f7a10ef7800bf28baff20b307cd0272a1c4b8cc3ee6edfa5f8015cb0848ea` |
| `original/castle.names.tsv` | 2.6 MB | yes | https://qlever.dev/api/wikidata (POST queries/castle.names.rq) | `20c6a3340db1d5a6ec40ac0b309cd900b8499fb45848f50bffc2995fb6f07e83` |
| `original/castle.tsv` | 5.2 MB | yes | https://qlever.dev/api/wikidata (POST queries/castle.rq) | `6596f24db7791acdf7f41907f3d8a31d81303936e7e1e05a5a0a1c06371a75a9` |
| `original/cathedral.names.tsv` | 477.0 KB | yes | https://qlever.dev/api/wikidata (POST queries/cathedral.names.rq) | `ef304f54af55abca773a35d27fba679267af4ff70eca20c979d1106dca05e92a` |
| `original/cathedral.tsv` | 478.7 KB | yes | https://qlever.dev/api/wikidata (POST queries/cathedral.rq) | `2edcb632536c8064a7df250bd053e6e9acd383d7e58325cd9e178a3e5cfffa27` |
| `original/diocese.names.tsv` | 210.5 KB | yes | https://qlever.dev/api/wikidata (POST queries/diocese.names.rq) | `e2d99c7d1695202986b9844dafd54a7e31a4b54bb9a2eb9d5855cf5adc620ed6` |
| `original/diocese.tsv` | 146.6 KB | yes | https://qlever.dev/api/wikidata (POST queries/diocese.rq) | `e37183083e58187a15eade98cde9d827f88f76ae25cca154630d54bca51a9107` |
| `original/fortification.names.tsv` | 551.7 KB | yes | https://qlever.dev/api/wikidata (POST queries/fortification.names.rq) | `9b044a0b7e65366391abeb5456f913da1a4bb6d310854787a279992162250850` |
| `original/fortification.tsv` | 1015.0 KB | yes | https://qlever.dev/api/wikidata (POST queries/fortification.rq) | `535520379c1c8bd397b2b758996d6cfa728ef121d3b2dc13359eb822490209ad` |
| `original/labels.tsv` | 476.7 KB | yes | https://qlever.dev/api/wikidata (labels of referenced items) | `130ac84c25fdef53db0ea6e61a8d15ad077e0f5b8c703a6b7d3d3bb69b1d28cc` |
| `original/monastery.names.tsv` | 1.8 MB | yes | https://qlever.dev/api/wikidata (POST queries/monastery.names.rq) | `d45c59f9f7aa67488fbd926ca7acbcbcf4788770450e50b981e20df75a6fa05f` |
| `original/monastery.tsv` | 3.8 MB | yes | https://qlever.dev/api/wikidata (POST queries/monastery.rq) | `83dbdef5bb8a9267352a43c35ee88c872a0f475325e24578c461ca8b54137c16` |
| `original/settlement.names.tsv` | 3.6 MB | yes | https://qlever.dev/api/wikidata (POST queries/settlement.names.rq) | `9aee76c806cfd0f569cfa97a4374f2fbfaf68cbfae7b15a3decaf9c38bd3e1cc` |
| `original/settlement.tsv` | 5.5 MB | yes | https://qlever.dev/api/wikidata (POST queries/settlement.rq) | `93cdea750dfa508c9d08ff157a892f8b5916be5f8676257855171a47b9d732e9` |
| `original/siege.names.tsv` | 189.6 KB | yes | https://qlever.dev/api/wikidata (POST queries/siege.names.rq) | `1d515ab109526db866fdf19d5c053d0f1418b3559914a89a81563f006a1d5597` |
| `original/siege.tsv` | 253.3 KB | yes | https://qlever.dev/api/wikidata (POST queries/siege.rq) | `50c7a79d824302c42f9e2f588de3bfcc46265aee2c4b0f70c96a6dc5e1e17e84` |
| `original/university.names.tsv` | 68.5 KB | yes | https://qlever.dev/api/wikidata (POST queries/university.names.rq) | `912f77a97dd4f43bdad7bd8b8cff5d429e5d181b3fc409d2cd5927e16656b637` |
| `original/university.tsv` | 34.3 KB | yes | https://qlever.dev/api/wikidata (POST queries/university.rq) | `191ea22ccbeac4dccae30cc919e8d09dde1c73e9747e8470cac4defb2245787c` |

## How to cite

Wikidata contributors, Wikidata (snapshot via QLever). https://www.wikidata.org/
