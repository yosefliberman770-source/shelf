# Germania Sacra: Klöster und Stifte des Alten Reiches (Database of Monasteries)

- **Official source:** Germania Sacra, Niedersächsische Akademie der Wissenschaften zu Göttingen; API run by SUB Göttingen.
- **Dataset page:** https://adw-goe.de/germania-sacra/klosterdatenbank/datenservice/ (API: https://api.gs.sub.uni-goettingen.de)
- **Version / date:** Live API as downloaded (the database is continuously edited).
- **Licence:** Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0) — https://creativecommons.org/licenses/by-sa/3.0/ (see LICENSE.md)
- **Geographic coverage:** The Holy Roman Empire and neighbouring areas (Germany, Austria, Switzerland, the Low Countries, Bohemia, Alsace-Lorraine, northern Italy fringes).
- **Historical date range:** Early Middle Ages to the secularisation (c. 700–1810), with each order's tenure dated.
- **Download date:** 2026-09-30
- **Total size:** 7.2 MB in 3 files

## What it contains

monasteries-locations.geojson: 7,473 located monasteries, canonries and houses (points) with their name, place and each religious order that held them, dated as written in the source (e.g. "zwischen 712 und 714") and as a machine year (beginTPQ / endTPQ); monasteries-list.json: first page of the list endpoint; diocese-borders.geojson: 67 diocese polygons.

## Processed into Shelf

public/world/tiles/medieval-sites.pmtiles (houses) and the place index (gazetteer `germaniasacra`), built by scripts/atlas-build/sites.py.

## Known limitations

Coverage is the Empire only. The diocese borders are the database's own reconstruction for no single stated date. A house that moved has one row per location. Dates are termini post/ante quos, not exact.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py germania-sacra` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/diocese-borders.geojson` | 3.8 MB | yes | https://api.gs.sub.uni-goettingen.de/v1/monasteries/diocese-borders | `694971461ecad3798327ed48b015658a969440f89960b770fc955cc25f92a428` |
| `original/monasteries-list.json` | 6.9 KB | yes | https://api.gs.sub.uni-goettingen.de/v1/monasteries/list | `94b46929af3b7663c6176584a1bcd43432ab379047b81c1bc4ec7eb05ed09d6c` |
| `original/monasteries-locations.geojson` | 3.5 MB | yes | https://api.gs.sub.uni-goettingen.de/v1/monasteries/locations/geojson | `b7ddbd4697d094796faffada7cf437367d0038e9fc6006f65f052fa9b53102bd` |

## How to cite

Germania Sacra, Klöster und Stifte des Alten Reiches, Niedersächsische Akademie der Wissenschaften zu Göttingen. https://klosterdatenbank.germania-sacra.de/
