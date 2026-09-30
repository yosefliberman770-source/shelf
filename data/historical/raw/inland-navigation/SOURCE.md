# Inland Navigation in England and Wales before 1348: GIS Database

- **Official source:** Archaeology Data Service (ADS). Creator: Eljas Oksanen (Early Medieval Atlas).
- **Dataset page:** https://archaeologydataservice.ac.uk/archives/collections/view/1003427/downloads.cfm
- **DOI:** https://doi.org/10.5284/1057497
- **Version / date:** First released 8 November 2019.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ (see LICENSE.md)
- **Geographic coverage:** England and Wales.
- **Historical date range:** 11th century to 1348.
- **Download date:** 2026-09-29, 2026-09-30
- **Total size:** 1.8 MB in 5 files

## What it contains

Navigable rivers and canals: direct evidence (documents, finds, canal building; 542 segments), indirect evidence (mainly place-names; 110), heads of navigation (249, with latest dates and references), and place-names relating to river traffic (65) — each a shapefile in a ZIP; plus the general guide (PDF). British National Grid.

## Processed into Shelf

public/world/tiles/navigation.pmtiles (layer `nav`; `k` = direct / indirect / head / pn), built by scripts/atlas-build/england.py. Map layer “Navigable rivers before 1348”, shown 1000–1348.

## Known limitations

Courses follow modern Ordnance Survey rivers, parish or county boundaries where the medieval course is unknown (the `Course` field says which). Indirect evidence rests mostly on place-names and cannot be dated precisely. Evidence-class codes (DE, IE, KB) and dates like “PN” or “post-1348” are kept exactly as recorded. Rivers not listed may simply lack surviving evidence.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py inland-navigation` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/gis/direct_evidence.zip` | 1.1 MB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3427-1/dissemination/gis/direct_evidence.zip | `4b61c3ced1656996c30dcf3adc72bcc946e207e3969985e35d3eab88f537bf06` |
| `original/gis/heads_of_navigation.zip` | 60.4 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3427-1/dissemination/gis/heads_of_navigation.zip | `16bc17f27bf0c6fa27efabd01eaf5e60af5ef84cfdfabd24100e3deab89dc303` |
| `original/gis/indirect_evidence.zip` | 424.5 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3427-1/dissemination/gis/indirect_evidence.zip | `bee51b7b9740aeef429fdf9551ee3b0d68c5949a5d7de2696776147b61fbcbf1` |
| `original/gis/pn_river_traffic.zip` | 22.3 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3427-1/dissemination/gis/pn_river_traffic.zip | `66b01e2db6b37a8e03370158868e6a01a0567ee4a765fc60e16e919cba16797a` |
| `original/pdf/general_guide.pdf` | 244.7 KB | yes | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-3427-1/dissemination/pdf/general_guide.pdf | `a53b2780f11a375ef81d62abdb703a5b7aded9fc0f7f34fe95ce2e130e6f9327` |

### Provenance

- `original/gis/direct_evidence.zip`: Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/direct_evidence.zip).
- `original/gis/heads_of_navigation.zip`: Downloaded from the official URL by fetch.py. Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/heads_of_navigation.zip). The uploaded copy is byte-identical.
- `original/gis/indirect_evidence.zip`: Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/indirect_evidence.zip).
- `original/gis/pn_river_traffic.zip`: Downloaded from the official URL by fetch.py. Downloaded in a browser from the ADS collection page and uploaded to the repository by its owner on 2026-09-30 (commit 2656dbe, data/historical/incoming/pn_river_traffic.zip). The uploaded copy is byte-identical.

**Not yet downloaded:** `original/png/inland_navigation.png`

## How to cite

Oksanen, E. (2019) Inland Navigation in England and Wales before 1348: GIS Database [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1057497
