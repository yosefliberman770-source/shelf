# EBIDAT — castle database of the European Castle Institute

- **Official source:** Europäisches Burgeninstitut (Deutsche Burgenvereinigung). Pages snapshotted by scripts/historical-data/ebidat_snapshot.py.
- **Dataset page:** https://www.ebidat.de/
- **Version / date:** Snapshot 2026-09-30: 8,264 castles (overview and main-data page per id, ids 1–12000).
- **Licence:** Not stated. — https://www.ebidat.de/impressum.html (see LICENSE.md)
- **Geographic coverage:** Germany, Austria, Czechia, Slovakia, Hungary, Latvia, Denmark, Finland, the Netherlands.
- **Historical date range:** Castles dated by the start and end of their use, usually to a half or quarter century.
- **Download date:** 2026-09-30
- **Total size:** 14.3 MB in 12 files

## What it contains

Name, state, region, type, classification, function, dating begin/end, condition, history, position.

## Processed into Shelf

Castles with their dating span (start = earliest year the dating allows) → private data pack.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py ebidat` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/pages-00.jsonl.gz` | 712.5 KB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=1..1000 | `223f7a31c1841491d4fb7dadcc5cc0c328742b134ccb34fc8019b35a0758dd90` |
| `original/pages-01.jsonl.gz` | 1.3 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=1001..2000 | `52711a616c5a376ab98d5b762dbfcd4f5a8e787fa369274fee525ab8a2ac3939` |
| `original/pages-02.jsonl.gz` | 1.4 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=2001..3000 | `fa1c53eacf794b8e7388ccac23b9b8cd8fd6992ce5235984931b66bf09cca65d` |
| `original/pages-03.jsonl.gz` | 1.4 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=3001..4000 | `2680a7876b9e633fa6149454b7004ad71a2a8c7f9cc3dc6d2ce348771f69e152` |
| `original/pages-04.jsonl.gz` | 1.5 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=4001..5000 | `a5a440638f272fb0738fb077e279f35f39dff472c5da3d5ba14862401f08078b` |
| `original/pages-05.jsonl.gz` | 1.4 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=5001..6000 | `b18597d18af4efdf0378bddd279673d9511f482241bbccb106a38c8c2bbf34c7` |
| `original/pages-06.jsonl.gz` | 1.0 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=6001..7000 | `d7d499b6addd2b78b48b8983bc2008be9ea65128f35acc2649f2fad75abca640` |
| `original/pages-07.jsonl.gz` | 1.2 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=7001..8000 | `4af859c4d7cd18a109d41c6c96ea99bfbfe741193b4a4a93951d4c21e0fcd387` |
| `original/pages-08.jsonl.gz` | 1.3 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=8001..9000 | `be81b333ea2a2e3e0fdfe7c4422df6b5579eac7f9ea1eb9c24b3597976c7dc93` |
| `original/pages-09.jsonl.gz` | 1.1 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=9001..10000 | `a961923796c9201ad19b69e04c06d3022047388306f8ea9e71e3fb0dcdc25d17` |
| `original/pages-10.jsonl.gz` | 1.8 MB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=10001..11000 | `65fdeb9885da6ec11827ea6769026d7bdd1af5d897df2b00a6b849ce9bf0862d` |
| `original/pages-11.jsonl.gz` | 75.1 KB | yes | https://www.ebidat.de/cgi-bin/ebidat.pl?id=11001..12000 | `6af6af82e6ca00bb460444a5d3b9909abfec86edaf4a26a860bf0fce19b4cf5b` |

## How to cite

EBIDAT — Burgendatenbank des Europäischen Burgeninstitutes, https://www.ebidat.de/
