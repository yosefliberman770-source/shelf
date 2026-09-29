# CShapes 2.0

- **Official source:** ETH Zürich, International Conflict Research (Schvitz, Girardin, Rüegger, Weidmann, Cederman, Gleditsch). https://icr.ethz.ch/data/cshapes/
- **Dataset page:** https://icr.ethz.ch/data/cshapes/
- **Version / date:** CShapes 2.0 (see ChangeLog.txt).
- **Licence:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0) — https://creativecommons.org/licenses/by-nc-sa/4.0/ (see LICENSE.md)
- **Geographic coverage:** World (independent states and dependent territories); CShapes-Europe from 1816.
- **Historical date range:** 1886–2019 (Europe from 1816).
- **Download date:** 2026-09-29
- **Total size:** 126.9 MB in 7 files

## What it contains

State borders and capitals with validity dates: shapefile (ZIP), GeoJSON, CSV, the Europe-from-1816 GeoJSON, the codebook (PDF), the readme text and the changelog. The SQL, XLSX and R-package formats were skipped as duplicates.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py cshapes` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/CShapes-2.0.csv` | 42.4 MB | no | https://icr.ethz.ch/data/cshapes/CShapes-2.0.csv | `e78d0b3a40605631f5a136c6155e0dd5290996c59765999e159385fdeaf7b157` |
| `original/CShapes-2.0.geojson` | 25.1 MB | no | https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson | `384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42` |
| `original/CShapes-2.0.txt` | 42.4 MB | no | https://icr.ethz.ch/data/cshapes/CShapes-2.0.txt | `5e5e5d328666b74270944dd41ee40b4196bf3e5152ede8353a84d1282eb19533` |
| `original/CShapes-2.0.zip` | 12.4 MB | yes | https://icr.ethz.ch/data/cshapes/CShapes-2.0.zip | `7048e08742648c8ed5a99454bba17de845746e90035c23d5efcf6d1751f3deb6` |
| `original/CShapes-2.0_Codebook.pdf` | 117.5 KB | yes | https://icr.ethz.ch/data/cshapes/CShapes-2.0_Codebook.pdf | `e132b84d6df02b58eef3c10845ca2b87b1816fa18c5b4a64104cc124afa3ebbd` |
| `original/CShapes-Europe.geojson` | 4.4 MB | yes | https://icr.ethz.ch/data/cshapes/CShapes-Europe.geojson | `9831764d2ad17e37bc009031829265621534de097f7b3e8d6928d1a828436279` |
| `original/ChangeLog.txt` | 3.6 KB | yes | https://icr.ethz.ch/data/cshapes/ChangeLog.txt | `a175866ebfbcedd59072224235ea907fb295d24087bb2c57f1bbb6efcd4000a9` |

## How to cite

Schvitz, G., Girardin, L., Rüegger, S., Weidmann, N. B., Cederman, L.-E., Gleditsch, K. S. (2022) Mapping the International System, 1886-2019: The CShapes 2.0 Dataset. Journal of Conflict Resolution 66(1).
