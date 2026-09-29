# Historical data sources: audit

Audited on 2026-09-29.

**Verified** means the endpoint was requested from Shelf's build environment on that date. The check recorded:

- the HTTP status;
- whether a phone browser may call it directly (CORS);
- the licence, where the response states it.

Everything else comes from the project's own documentation and is marked *(docs)*. Where something could not be checked it says so. This audit decides **which source is best for which question**. It is the basis for the Source Registry (`src/world/registry.ts`), which the app uses to pick sources at run time.

Status column:

- **Offline**: a simplified copy is built into Shelf's data packs.
- **Live**: Shelf queries it from the phone as needed.
- **Catalogued**: recorded in the registry for coverage and future work, but not used yet.
- **Excluded**: licence or access rules out use.

## Summary: best source per question

| Question | Best source(s) | Fallbacks |
| --- | --- | --- |
| Ancient Mediterranean / Near East places and names (−3000 to 640) | **Pleiades** (A) | WHG (C), Wikidata (D) |
| Roman roads | **Itiner-e** (A) | AWMC roads (A), Pleiades lines (A) |
| Ancient coastlines, inland water | **AWMC** (A) | Natural Earth (modern) |
| Early Islamic world places and routes (9th–10th c.) | **al-Ṯurayyā** (A) | Pleiades, WHG |
| Northern European towns, tolls, fairs, roads and waterways (1350–1650) | **Viabundus** (A) | WHG, Wikidata |
| Chinese administrative places with dates (−222 to 1911) | **CHGIS / TGAZ** (A, live) | WHG, Wikidata |
| European state and admin boundaries (1815–1918) | **HistoGIS** (A, live) | Cliopatria, CShapes (NC licence) |
| World polities, long run (−3400 to 2024) | **Cliopatria** (A) | OHM (D) |
| State borders 1886–2019 | CShapes 2.0 (A, NC licence, catalogued) | Cliopatria |
| Battles, sieges, wars with dates | **Wikidata** (D, the only broad structured source) | — |
| Original historical maps, georeferenced | **Allmaps** annotations over David Rumsey, LoC and others (B) | — |
| Original historical maps, catalogue search | **Library of Congress** (B), **David Rumsey** (B) | Old Maps Online (no API) |
| Global name reconciliation, cross-checking | **World Historical Gazetteer** (C framework) | Getty TGN (C), GeoNames (C) |
| Modern reference geography | Natural Earth (public domain) | OSM |

Tiers:

- **A**: specialist scholarly dataset.
- **B**: institutional collection.
- **C**: general reference.
- **D**: collaborative or crowd-sourced.

A lower tier is never used to silently override a higher one. Disagreements are shown instead.

---

## Tier A — specialist scholarly datasets

### Pleiades

- **Project:** Institute for the Study of the Ancient World (NYU) and Ancient World Mapping Center.
- **Coverage:**
  - Area: Greek and Roman world, Near East, Egypt, and some Central Asia.
  - Time: about 3000 BCE to about 640 CE; later records are sparse.
- **Data:** places, including settlements, forts, sanctuaries, ports, mountains, rivers, roads, provinces and regions.
  - **Names:** every attested name, each with its language and its own date range.
  - **Connections:** "part of", "succeeds", "port of", "near" and others. Verified: Constantinopolis *succeeds* Byzantium.
- **Geometry:** a representative point for every place, plus some lines and polygons.
  - Each location is rated precise or rough, with accuracy radii.
  - Associations are rated certain, less certain or uncertain.
- **Dates:** broad archaeological periods (for example "Roman" = 30 BCE–300 CE), not founding or abandonment dates.
- **Access:**
  - API: JSON per place, verified 200 with CORS `*`.
  - Download: daily GIS package, verified.
- **Licence:** CC BY 3.0. Attribution: "Pleiades: A Gazetteer of Past Places".
- **Provenance:** every record lists its creators, its references (bibliography) and revision history.
- **Limits:**
  - No settlement size or importance.
  - Some modern "Untitled" sites.
  - Sparse outside the Mediterranean.
  - Province outlines are too coarse for testing whether a point lies inside (found and corrected in the app).
- **Updates:** continuous (daily export).
- **Status:** **Offline.** Includes the gazetteer index, map points, lines and provinces.

### Ancient World Mapping Center (AWMC) geodata

- **Project:** University of North Carolina, derived from the Barrington Atlas.
- **Data:** roads, ancient shorelines by period, inland water, rivers, and empire and province snapshots.
- **Dates:** Barrington periods (Archaic to Late Antique). Snapshot dates come from their titles.
- **Access:** download from GitHub (verified).
- **Licence:** ODbL 1.0 (share-alike on the database).
- **Limits:**
  - Some attributes are undocumented, so they are not used.
  - The inland water layer is based on modern OpenStreetMap.
- **Status:** **Offline.**

### Itiner-e: the digital atlas of ancient roads

- **Project:** Brughmans, de Soto, Pažout and Bjerregaard Vahlstrup (2024), with a scholarly editorial community.
- **Coverage:** roads across the whole Roman Empire, the most detailed open dataset (docs).
  - Each segment has a citable URI and attributes such as certainty and road type (docs).
- **Access:**
  - Download: `/route-segments/download` returns NDJSON of all segments (verified 200).
  - Zenodo DOI 10.5281/zenodo.17122148.
- **Licence:** CC BY 4.0 (verified on the About page).
- **Limits:** ongoing project; road dating is limited.
- **Status:** **Offline** (vector tiles).

### Viabundus: premodern European transport and mobility (version 2)

- **Project:** Universities of Göttingen, Groningen, Münster, Lund and others. Based on Bruns and Weczerka's *Hansische Handelsstraßen* (1962).
- **Coverage:**
  - Area: northern Europe, from the Low Countries to the Baltic.
  - Time: 1350–1650.
- **Data:**
  - Settlements and towns with dates and alternative names.
  - Tolls, staple markets, fairs and population figures.
  - Land roads and waterways as dated edges.
  - Literature references.
- **Access:** Zenodo 10.5281/zenodo.16611998 (verified). Files include `nodes.csv`, `towns.csv`, `alternativenames.csv`, `edges.geojson` (54 MB) and `literature.csv`.
- **Licence:** CC BY 4.0 (verified).
- **Limits:**
  - Work in progress.
  - Road dating is partly inferred by the project (documented per edge).
- **Status:** **Offline** (places in the gazetteer, roads as vector tiles).

### al-Ṯurayyā gazetteer

- **Project:** Maxim Romanov and Masoumeh Seydi, from Georgette Cornu's *Atlas du monde arabo-islamique à l'époque classique (IXe–Xe siècles)*.
- **Coverage:** the early Islamic world (9th–10th c.).
- **Data:** 2,518 toponyms (verified), each with an Arabic and a transliterated name, region, type and coordinate certainty. It also has route sections.
- **Access:** GeoJSON on GitHub (verified 200, CORS `*`).
- **Licence:** the repository is Apache-2.0 (verified). The data derives from Cornu's atlas, so it is cited as such.
- **Limits:**
  - Coordinates are georeferenced from an atlas.
  - Dates cover the period as a whole, not individual places.
- **Status:** **Offline.**

### China Historical GIS (CHGIS) and TGAZ

- **Project:** Harvard University and Fudan University.
- **Coverage:** China, 222 BCE–1911 CE.
- **Data:** administrative units and settlements, each with:
  - a year range;
  - a parent unit (for example "唐 (Tang)");
  - a feature type (for example "防鎮");
  - point coordinates.
- **Access:**
  - TGAZ API: `https://chgis.hudci.org/tgaz/placename?fmt=json&n=…` (verified 200, CORS `*`). The old `maps.cga.harvard.edu` address now redirects there.
  - Full datasets are on Harvard Dataverse (verified).
- **Licence:** CHGIS terms of use apply (docs). Shelf queries it live and does not redistribute it.
- **Limits:**
  - Names are in Chinese and pinyin.
  - Pre-Qin coverage is sparse.
- **Status:** **Live.**

### HistoGIS

- **Project:** Austrian Centre for Digital Humanities (ACDH-CH).
- **Coverage:** Europe, mainly 1815–1919.
- **Data:** state and administrative boundaries. Each unit has start and end dates with a date-accuracy code and a Wikidata ID.
- **Source provenance:** described per source. Verified example: "Europe Stateborders 1910" is based on maps by Stieler (1892, 1911), Andree and others, from the Rumsey and Woldan collections.
- **Access:** `/api/where-was/?lat=&lng=&when=YYYY-MM-DD` (verified 200, CORS `*`). For Skopje on 1912-06-01 it returned "Ottoman Empire", 1909-02-27 to 1913-05-30.
- **Licence:** not stated in the API response. Shelf uses it live only and shows the source name.
- **Status:** **Live.**

### Cliopatria (Seshat Global History Databank)

- **Coverage:** world polities from 3400 BCE to 2024 CE, 1,633 polities.
- **Access:** download from GitHub.
- **Licence:** CC BY 4.0.
- **Limits:**
  - One reconstruction per polity.
  - Simplified outlines, so coastal cities can fall just outside; Shelf then says "at the edge of".
- **Status:** **Offline.**

### CShapes 2.0 (ETH Zürich, International Conflict Research)

- **Coverage:** state borders and capitals, 1886–2019.
- **Licence:** **CC BY-NC-SA 4.0** (verified). Non-commercial only.
- **Status:** **Catalogued.** Held back because of the NC licence. It could be added for personal, non-commercial use.

### HGIS de las Indias

- **Coverage:** Spanish America, 1701–1808. Administrative, ecclesiastical and settlement data (docs).
- **Access:** the website is reachable (verified). A direct data download was not found. Records are contributed to WHG (docs).
- **Status:** **Catalogued.** Reached through WHG where present.

### GB1900 gazetteer

- **Coverage:** Great Britain, about 1888–1914. Roughly 2.5 million names transcribed from the Ordnance Survey six-inch second-edition maps (docs).
- **Licence:** CC BY-SA 4.0 (docs).
- **Access:** not reachable from the build environment; `visionofbritain.org.uk` timed out.
- **Status:** **Catalogued.**

### DAMAST (Dhimmis and Muslims)

- **Project:** LMU Munich.
- **Coverage:** religious groups in the Middle East, 7th–15th c. (docs).
- **Access:** a Docker image is on Zenodo 10.5281/zenodo.10849667, CC BY 4.0 (verified). The web service was not reachable from here.
- **Status:** **Catalogued.** Candidate for the religious and cultural layer.

### Other specialist sources checked

| Source | Scope (docs) | Access check | Status |
| --- | --- | --- | --- |
| DARE (Digital Atlas of the Roman Empire) | Roman places and tiles | Site reachable, no CORS | Catalogued. Overlaps Pleiades. |
| ORBIS (Stanford) | Roman travel network model | Site reachable, no API | Catalogued. Modelled costs, not attested routes. |
| Syriaca.org gazetteer | Syriac-world places | Reachable, CORS `*` | Catalogued. |
| ToposText | Ancient places linked to texts | Reachable, no API used | Catalogued. |
| Trismegistos Places | Ancient Egypt and beyond | Not reachable | Catalogued. |
| DARMC (Harvard) | Roman and medieval GIS layers | Access denied | Catalogued. |
| Regnum Francorum Online | Carolingian places | Not reachable | Catalogued. |
| Historic Towns Atlases (UK/IE/EU) | Town plans | Not reachable; mostly print or PDF | Catalogued. |
| NHGIS (USA) | Census boundaries 1790– | Reachable; requires registration | Catalogued. |
| Euratlas | Europe borders year 1–2000 | Reachable; **commercial** licence | Excluded. |
| Ottoman gazetteers | Ottoman administrative places | Could not verify a public, current endpoint. NGA GEOnet is a *modern* names server, not historical. | Catalogued as a gap. |

## Tier B — institutional map collections (original cartography)

| Collection | Search API | Images | Licence | Status |
| --- | --- | --- | --- | --- |
| **Library of Congress** | `loc.gov/maps/?q=…&dates=A/B&fo=json` (verified, CORS `*`). Returns dates, subjects, locations and IIIF image URLs. | IIIF | Item rights text; many "no known restrictions" (verified example) | **Live** |
| **David Rumsey Map Collection** | LUNA search JSON (verified, CORS `*`). IIIF manifests (verified, CORS `*`). | IIIF | CC BY-NC-SA 3.0 (docs) | **Live** |
| **Allmaps** | `api.allmaps.org/maps?intersects=W,S,E,N` (verified, CORS). Returns georeference annotations (control points) for IIIF maps, many from Rumsey. | via source IIIF | Annotations open; images keep their collection's terms | **Live** (overlay) |
| National Library of Scotland | Georeferenced OS and other layers | Bot check blocked access from here | Terms per layer | Catalogued |
| NYPL Map Warper | JSON API | Rate-limited from here | Public domain items | Catalogued |
| Old Maps Online | No public API; Cloudflare challenge | — | — | Catalogued (link out) |
| Wikimedia Commons | API with CORS | Rate-limited from here | Per file | Catalogued |

## Tier C — general reference

| Source | Access | Licence | Role |
| --- | --- | --- | --- |
| **World Historical Gazetteer** | `/api/index/?name=` (verified, CORS `*`). Returns reconciled "parent" records (TGN-backed) with child records from contributed datasets, time spans and variants. | CC BY (per contributed dataset) | **Live.** Discovery, reconciliation and cross-checking; not the final authority. |
| Getty TGN | JSON per record reachable, no CORS; SPARQL 403 | ODC-By | Catalogued; reached through WHG |
| GeoNames | Needs a registered username (demo quota exceeded) | CC BY 4.0 | Catalogued (modern names) |
| Natural Earth | Download | Public domain | Offline (modern base map) |

## Tier D — collaborative

| Source | Access | Licence | Role |
| --- | --- | --- | --- |
| **Wikidata** | SPARQL (verified, CORS `*`); QLever mirror | CC0 | Offline events pack; live participants and descriptions; polity classes |
| OpenHistoricalMap | Vector tiles | CC0 | Live tiles (dated features only) |
| OpenStreetMap | Tiles and API | ODbL | Not used (modern) |

## Gaps (digital data, not history)

These are gaps in openly licensed, structured digital data. They are not gaps in the historical record:

- Sub-Saharan Africa before 1800.
- The pre-Columbian Americas.
- Southeast Asia.
- Medieval eastern Europe outside the Hanseatic area.
- Ottoman administrative geography with an open API.
- Villages almost everywhere before 1800.
- Trade routes outside Viabundus and al-Ṯurayyā.
- Military movements (no dataset records dated troop movements).

The app's coverage matrix shows these gaps and says so instead of showing an empty map.
