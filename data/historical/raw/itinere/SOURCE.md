# Itiner-e: A High-Resolution Dataset of Roads of the Roman Empire

- **Official source:** Itiner-e project (Pau de Soto, Adam Pažout, Tom Brughmans, Peter Bjerregaard Vahlstrup and others; Aarhus University). Project site: https://itiner-e.org/
- **Dataset page:** https://zenodo.org/records/17122148 and https://itiner-e.org/about (nightly export)
- **DOI:** https://doi.org/10.5281/zenodo.17122148
- **Version / date:** Static version 2024, release 1.3 (Zenodo, 15 September 2025), documented in de Soto et al. 2025, Scientific Data, https://doi.org/10.1038/s41597-025-06140-z. Plus the nightly full export from itiner-e.org on the download date.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** The Roman Empire (Europe, North Africa, the Near East).
- **Historical date range:** c. 300 BCE – 300 CE.
- **Download date:** 2026-09-29
- **Total size:** 289.0 MB in 12 files

## What it contains

The complete static release: all roads as GeoPackage, GeoJSON and a full shapefile set, the bibliography (BibTeX) and a field description (DOCX). nightly-export/ holds the project's own full nightly export (NDJSON, one route segment per line, including rivers and sea lanes and nearby Pleiades places), which grows as the project adds data.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py itinere` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `nightly-export/route-segments.ndjson` | 37.3 MB | no | https://itiner-e.org/route-segments/download | `1bdcd1f13e99caecacae31aa0e3c49797889406473a0ddb0ffb0fcee03d9932b` |
| `original/Data field description.docx` | 17.6 KB | yes | https://zenodo.org/api/records/17122148/files/Data%20field%20description.docx/content | `0f486847ab54e2675bbd9b0087998c0833f0e22876459a6d82b6c4c30485359a` |
| `original/Itiner-e bibliography.bib` | 242.9 KB | yes | https://zenodo.org/api/records/17122148/files/Itiner-e%20bibliography.bib/content | `8c819a8238664666042b1f538dc319f364f13358715322b40d29bac21ec3b0a7` |
| `original/itinere_roads.cpg` | 5 bytes | yes | https://zenodo.org/api/records/17122148/files/itinere_roads.cpg/content | `3ad3031f5503a4404af825262ee8232cc04d4ea6683d42c5dd0a2f2a27ac9824` |
| `original/itinere_roads.dbf` | 13.1 MB | yes | https://zenodo.org/api/records/17122148/files/itinere_roads.dbf/content | `e0cc5cf8c67c6b40782d5f7fea023d6c09470adbb412b100baa7badb4a417a60` |
| `original/itinere_roads.geojson` | 74.4 MB | no | https://zenodo.org/api/records/17122148/files/itinere_roads.geojson/content | `4f8f5cf99f387bab2c509b1bf50143e9a3117691e316f2f46a9bb1d3d4b1cc34` |
| `original/itinere_roads.gpkg` | 32.1 MB | no | https://zenodo.org/api/records/17122148/files/itinere_roads.gpkg/content | `1b9470aaec696b0827e7aecad20badc74df2652ae8a62464baea4f07ae4855e7` |
| `original/itinere_roads.prj` | 354 bytes | yes | https://zenodo.org/api/records/17122148/files/itinere_roads.prj/content | `cff1c1763dd47707d0f59447c952f2c850b2cf31446d81b3bacd06f76574f794` |
| `original/itinere_roads.sbn` | 136.7 KB | yes | https://zenodo.org/api/records/17122148/files/itinere_roads.sbn/content | `ec4c5ff1aad2c155e48433441ec914d970025b0d5daee3c223538f9122f773fd` |
| `original/itinere_roads.sbx` | 5.8 KB | yes | https://zenodo.org/api/records/17122148/files/itinere_roads.sbx/content | `d72846126e8a80e5b0193e001a63e714f6ee3e006dc46b39be918f60ad141f60` |
| `original/itinere_roads.shp` | 131.6 MB | no | https://zenodo.org/api/records/17122148/files/itinere_roads.shp/content | `4d564c58a04c637fd8080375a1e87c35cf712e2d11a0480278db44549a1abf10` |
| `original/itinere_roads.shx` | 115.5 KB | yes | https://zenodo.org/api/records/17122148/files/itinere_roads.shx/content | `a25d03a4240619fe799526f98c4005e28ec34809848bbdb4ec18dc58ac96f606` |

## How to cite

de Soto, P. et al. (2025) A High-Resolution Dataset of Roads of the Roman Empire: Itiner-e static version 2024. Zenodo. https://doi.org/10.5281/zenodo.17122148
