# Wikidata snapshot: medieval and early sites of Europe, the Mediterranean and the Near East

- **Official source:** Wikidata (Wikimedia Foundation and contributors), queried through the QLever Wikidata endpoint (University of Freiburg), https://qlever.dev/wikidata
- **Dataset page:** https://www.wikidata.org/
- **Version / date:** Query snapshot; the exact SPARQL queries are saved in original/queries/. Re-run with scripts/historical-data/wikidata_snapshot.py.
- **Licence:** Creative Commons CC0 1.0 (public domain dedication) — https://creativecommons.org/publicdomain/zero/1.0/ (see LICENSE.md)
- **Geographic coverage:** Europe, the Mediterranean and the Near East (lon −32…62, lat 24…72).
- **Historical date range:** Castles, monasteries, cathedrals and dioceses of any date (with Wikidata's founding / dissolution dates where recorded); battles and sieges before 1600; fortifications founded before 1500; universities and bridges founded before 1600; settlements with a first written mention or founding date 400–1600.
- **Download date:** 2026-09-30
- **Total size:** 52.7 MB in 26 files

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
| `original/battle.names.tsv` | 579.8 KB | yes | https://qlever.dev/api/wikidata (POST queries/battle.names.rq) | `2420394e182814442c84f3b5b819030bef8876c076c1203cb951c077bf4ca911` |
| `original/battle.tsv` | 397.9 KB | yes | https://qlever.dev/api/wikidata (POST queries/battle.rq) | `bc21e8128cbcc2c0861c31c9b2d4602c3002880305c8bda7407e82a0804d6a8c` |
| `original/bridge.names.tsv` | 45.2 KB | yes | https://qlever.dev/api/wikidata (POST queries/bridge.names.rq) | `0df8ec5617b450c3b78c3121bc96e26b1d5e3c4b10967b5c091e809c021df940` |
| `original/bridge.tsv` | 63.2 KB | yes | https://qlever.dev/api/wikidata (POST queries/bridge.rq) | `098f7a10ef7800bf28baff20b307cd0272a1c4b8cc3ee6edfa5f8015cb0848ea` |
| `original/castle.names.tsv` | 3.1 MB | yes | https://qlever.dev/api/wikidata (POST queries/castle.names.rq) | `755e5b77f1216718e9f24be0e727f94e9152c6fafde374f36b22edb49a4e74c7` |
| `original/castle.tsv` | 5.2 MB | yes | https://qlever.dev/api/wikidata (POST queries/castle.rq) | `6596f24db7791acdf7f41907f3d8a31d81303936e7e1e05a5a0a1c06371a75a9` |
| `original/cathedral.names.tsv` | 719.7 KB | yes | https://qlever.dev/api/wikidata (POST queries/cathedral.names.rq) | `02b315752955c2fdeb91248f1c09cbd8da9c0035fc235f6538384fe3f6bc4fab` |
| `original/cathedral.tsv` | 478.7 KB | yes | https://qlever.dev/api/wikidata (POST queries/cathedral.rq) | `2edcb632536c8064a7df250bd053e6e9acd383d7e58325cd9e178a3e5cfffa27` |
| `original/city.names.tsv` | 6.5 MB | yes | https://qlever.dev/api/wikidata (POST queries/city.names.rq) | `9a290bcabd002aecf250cbb3e0073574ffbe5d114819241fcbefe6348e220522` |
| `original/city.tsv` | 3.9 MB | yes | https://qlever.dev/api/wikidata (POST queries/city.rq) | `60ec1c60a4abd06b787147492cc856a56e9ee1e6c286adac43bf6fdd81e3c259` |
| `original/diocese.names.tsv` | 271.2 KB | yes | https://qlever.dev/api/wikidata (POST queries/diocese.names.rq) | `5941170caaf9d3e9ff7ab739e0e3fb14b8a6ddc8498cd40481c78ba48516bea2` |
| `original/diocese.tsv` | 146.6 KB | yes | https://qlever.dev/api/wikidata (POST queries/diocese.rq) | `e37183083e58187a15eade98cde9d827f88f76ae25cca154630d54bca51a9107` |
| `original/fallback.names.tsv` | 8.6 KB | yes | https://qlever.dev/api/wikidata (POST queries/fallback.names.rq) | `d324ca3d2c56845eac3f7122a1373d1d8d6fb3e28a9c585dbd3593287728bb8c` |
| `original/fortification.names.tsv` | 708.0 KB | yes | https://qlever.dev/api/wikidata (POST queries/fortification.names.rq) | `33407df310a66851751a8d800c6fb800411541f78a9b88f9af9728a2692a90e6` |
| `original/fortification.tsv` | 1015.0 KB | yes | https://qlever.dev/api/wikidata (POST queries/fortification.rq) | `535520379c1c8bd397b2b758996d6cfa728ef121d3b2dc13359eb822490209ad` |
| `original/labels.tsv` | 604.2 KB | yes | https://qlever.dev/api/wikidata (labels of referenced items) | `06a24abcd9c66797176c9793936b0e78fc3554eae4e05094bc8382c752aec53b` |
| `original/monastery.names.tsv` | 2.4 MB | yes | https://qlever.dev/api/wikidata (POST queries/monastery.names.rq) | `57f0ad964c303bc12a88c9c0eb2b2556f13ba49274868f35bfa9ed9581c6893b` |
| `original/monastery.tsv` | 3.8 MB | yes | https://qlever.dev/api/wikidata (POST queries/monastery.rq) | `83dbdef5bb8a9267352a43c35ee88c872a0f475325e24578c461ca8b54137c16` |
| `original/settlement.names.tsv` | 5.2 MB | yes | https://qlever.dev/api/wikidata (POST queries/settlement.names.rq) | `4d4833b64de7dfb810feedfdf20130d0e42b4a5caaee0930fd0c24dfc171aabe` |
| `original/settlement.tsv` | 5.5 MB | yes | https://qlever.dev/api/wikidata (POST queries/settlement.rq) | `93cdea750dfa508c9d08ff157a892f8b5916be5f8676257855171a47b9d732e9` |
| `original/siege.names.tsv` | 270.5 KB | yes | https://qlever.dev/api/wikidata (POST queries/siege.names.rq) | `805a5f9d0b189b681fdcbd07179fd2fdebacda2626eef62b2e24b491c0ab4413` |
| `original/siege.tsv` | 253.3 KB | yes | https://qlever.dev/api/wikidata (POST queries/siege.rq) | `50c7a79d824302c42f9e2f588de3bfcc46265aee2c4b0f70c96a6dc5e1e17e84` |
| `original/town.names.tsv` | 7.3 MB | yes | https://qlever.dev/api/wikidata (POST queries/town.names.rq) | `553ffc1b15ae30e5f0061aca7b275f32e8fe9bf25584b22178f53c638002d6ad` |
| `original/town.tsv` | 4.2 MB | yes | https://qlever.dev/api/wikidata (POST queries/town.rq) | `a72801bc1853ad35b880c46d4a5fe59f288b845357016442fbd404b460c9697c` |
| `original/university.names.tsv` | 118.8 KB | yes | https://qlever.dev/api/wikidata (POST queries/university.names.rq) | `493b09bddbc3930e7008f366cd31abb29033c4dcf52d1e7e4e4106c1d1ab0008` |
| `original/university.tsv` | 34.3 KB | yes | https://qlever.dev/api/wikidata (POST queries/university.rq) | `191ea22ccbeac4dccae30cc919e8d09dde1c73e9747e8470cac4defb2245787c` |

## How to cite

Wikidata contributors, Wikidata (snapshot via QLever). https://www.wikidata.org/
