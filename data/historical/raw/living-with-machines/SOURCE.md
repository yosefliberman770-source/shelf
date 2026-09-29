# Living with Machines: railspace and building datasets (MapReader)

- **Official source:** Living with Machines (The Alan Turing Institute / British Library), using National Library of Scotland maps. Listed on the NLS Data Foundry: https://data.nls.uk/data/map-spatial-data/living-with-machines-railspace-building/ — the data itself is on Zenodo.
- **Dataset page:** https://data.nls.uk/data/map-spatial-data/living-with-machines-railspace-building/
- **DOI:** https://doi.org/10.5281/zenodo.7147906 (linked from the Data Foundry); https://doi.org/10.5281/zenodo.11241371; https://doi.org/10.5281/zenodo.14522926
- **Version / date:** SIGSPATIAL 2022 data v0.3.3 (5 October 2022); annotations 2024 (22 May 2024); railspace v2 (19 December 2024).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** England, Wales and Scotland.
- **Historical date range:** Ordnance Survey six-inch 2nd edition maps, 1888–1913.
- **Download date:** 2026-09-29
- **Total size:** 466.5 MB in 8 files

## What it contains

sigspatial-2022: the dataset the Data Foundry links to (gold-standard annotations and machine-labelled 100 m patches for railspace and buildings). annotations-2024: post-processed railspace and building annotations, including georeferenced CSVs. railspace-v2: updated railspace predictions for 586,276 patches. Not downloaded: maps.zip and slice_meters_100_100.zip from the 2024 record (3.4 GB of map image tiles, not spatial data).

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py living-with-machines` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/annotations-2024_zenodo-11241371/README.md` | 10.8 KB | yes | https://zenodo.org/api/records/11241371/files/README.md/content | `98882deb69aeb111e5755ad42edb61ee5eb63e295e351e1e5c4e2b711a7af710` |
| `original/annotations-2024_zenodo-11241371/annots_all.csv` | 7.3 MB | yes | https://zenodo.org/api/records/11241371/files/annots_all.csv/content | `9550cb8f4710fa36642a841d6cc6c6816d561cb121c3f2b3b615af5d82e91213` |
| `original/annotations-2024_zenodo-11241371/annots_all_georeferenced.csv` | 37.0 MB | no | https://zenodo.org/api/records/11241371/files/annots_all_georeferenced.csv/content | `af45149656fe0afb465c2b046b70fec0e6aa31707a49d322d6bc0a3f8dd103f2` |
| `original/annotations-2024_zenodo-11241371/annots_building.csv` | 7.5 MB | yes | https://zenodo.org/api/records/11241371/files/annots_building.csv/content | `d625ed7cf2f21c8c50dc287635d8b3a9cbddda94a524490729b55031c32a333b` |
| `original/annotations-2024_zenodo-11241371/annots_building_georeferenced.csv` | 40.6 MB | no | https://zenodo.org/api/records/11241371/files/annots_building_georeferenced.csv/content | `add9efc59b38fb2f0a7f5a4962212c2b3516a9cb014bc5af3352570e5747be25` |
| `original/annotations-2024_zenodo-11241371/annots_railspace_all.csv` | 7.5 MB | yes | https://zenodo.org/api/records/11241371/files/annots_railspace_all.csv/content | `438aac9e17ad29dfcb42a1332d9fdfaa696ccc2320c55253a7ed3da7cd9c6730` |
| `original/annotations-2024_zenodo-11241371/annots_railspace_all_georeferenced.csv` | 37.2 MB | no | https://zenodo.org/api/records/11241371/files/annots_railspace_all_georeferenced.csv/content | `53d4ff2d354b639c9782cc373edd58e96491f3b17d0fe588501c7d435f063ef8` |
| `original/railspace-v2_zenodo-14522926/railspace_predictions_patch_df.csv` | 329.4 MB | no | https://zenodo.org/api/records/14522926/files/railspace_predictions_patch_df.csv/content | `9727e5d6423d256b76ca7c5cf83f9e1998bcdd7bac0c3814341435630bd17329` |

**Not yet downloaded:** `original/railspace-v2_zenodo-14522926/post_processed_railspace_predictions_patch_df.csv`, `original/sigspatial-2022_zenodo-7147906/README`, `original/sigspatial-2022_zenodo-7147906/MapReader_Data_SIGSPATIAL_2022.zip`

## How to cite

Living with Machines / MapReader. MapReader_Data_SIGSPATIAL_2022 (Zenodo 7147906); MapReader_railspace_and_building_annotations_2024 (Zenodo 11241371); MapReader_railspace_v2 (Zenodo 14522926).
