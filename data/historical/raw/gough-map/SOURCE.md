# The Routes and Roads of the Gough Map: GIS Database

- **Official source:** Archaeology Data Service (ADS). Creators: Eljas Oksanen (University of Helsinki), Stuart Brookes (UCL Institute of Archaeology).
- **Dataset page:** https://archaeologydataservice.ac.uk/archives/collections/view/1007268/downloads.cfm
- **DOI:** https://doi.org/10.5284/1124312
- **Version / date:** First released 13 November 2024 (data created 2015–2024).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** England and Wales (Great Britain as drawn on the Gough Map).
- **Historical date range:** The Gough Map (c. 14th–15th century), with routes matched to Roman, medieval and post-medieval evidence.
- **Download date:** 2026-09-30
- **Total size:** 129.8 KB in 3 files

## What it contains

Complete GIS set: the red lines drawn on the map (gough_red_lines), the settlements they connect (gough_way_stations, 179 points) and the reconstructed routeways (gough_routes), as zipped shapefiles; plus the general guide, the map image and introduction (PDFs) and a website image (PNG).

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py gough-map` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/Gough_Map_website_intro.pdf` | 113.3 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-7268-1/dissemination/Gough_Map_website_intro.pdf | `7cad8ed9bd9101d9ebbacc006d2a9cb3384418f6c34598be0f2e7649243b30a0` |
| `original/gough_red_lines.zip` | 9.2 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-7268-1/dissemination/gough_red_lines.zip | `0f31837dd1cbd87487380063802de9db3d303d870003eaef874a825bcc02a397` |
| `original/gough_way_stations.zip` | 7.3 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-7268-1/dissemination/gough_way_stations.zip | `0dca818e95c7f860d7a87b5832afd8f4c4b2b7d9dd4f11b879f6c477491848dc` |

**Not yet downloaded:** `original/Gough_Map_general_guide.pdf`, `original/Gough_Map_image.pdf`, `original/Gough_Map_website_image.png`, `original/gough_routes.zip`

## How to cite

Oksanen, E., Brookes, S. (2024) The Routes and Roads of the Gough Map: GIS Database [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1124312
