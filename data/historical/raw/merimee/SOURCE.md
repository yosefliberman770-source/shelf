# Immeubles protégés au titre des Monuments historiques (base Mérimée)

- **Official source:** Ministère de la Culture (France), Plateforme ouverte du patrimoine (POP); published on data.gouv.fr.
- **Dataset page:** https://www.data.gouv.fr/datasets/immeubles-proteges-au-titre-des-monuments-historiques-2/
- **Version / date:** Export updated 2026-09-24 (data.gouv.fr last modified).
- **Licence:** Licence Ouverte / Open Licence 2.0 (Etalab) — https://www.etalab.gouv.fr/licence-ouverte-open-licence/ (see LICENSE.md)
- **Geographic coverage:** France (incl. overseas).
- **Historical date range:** Prehistory to the 20th century; dated by century of construction campaigns.
- **Download date:** 2026-09-30
- **Total size:** 95.5 MB in 1 files

## What it contains

About 46,760 protected buildings with denomination, century of main and secondary building campaigns, history text, commune, WGS84 coordinates (44,502 located).

## Processed into Shelf

Medieval monuments (main campaign before 1500) of the kinds castle, religious building, bridge and market hall — 12,235 — are joined to Wikidata sites within 250 m (2,360) or added as sites (gazetteer `merimee`), dated by their building-campaign century as an evidence period.

## Known limitations

A protection register, not an inventory of medieval sites: unprotected and vanished buildings are absent. The century is when the present building was mainly built; the site may be older.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py merimee` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/merimee.csv` | 95.5 MB | no | https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/merimee.csv | `1866e937c412e61b462a265de88cd1ab4d525b2667e6c5352e1685a0a6637422` |

## How to cite

Ministère de la Culture, base Mérimée — Immeubles protégés au titre des Monuments historiques, Licence Ouverte 2.0.
