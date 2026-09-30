# Medieval Europe: historical-data audit (30 September 2026)

This audit asked which datasets could make Shelf's medieval European geography
accurate and balanced beyond England, with ancient and early-modern data where
it helps. Every entry below was checked by requesting the live service or
downloading the file. Anything that could not be checked is marked
**unverified**. Nothing here is estimated from a dataset's own publicity.

Related documents:
- `docs/HISTORICAL_COVERAGE_MEASURED.md`: the measured coverage matrix
  (region × theme × period), counted from the records Shelf holds.
- `docs/HISTORICAL_DATA_AUDIT.md`: the earlier source-by-source audit.
- `data/historical/raw/<dataset>/SOURCE.md` and `LICENSE.md`: provenance and
  licence for each downloaded file.
- `src/world/registry.ts`: the machine-readable registry.

---

## A. Inventory

Status values:
- **integrated**: drawn on the map and used for place lookups.
- **raw**: stored in the vault only.
- **catalogued**: checked but not downloaded.
- **excluded**: licence or access rules out use.

Quality ratings follow the brief: Excellent / Strong / Useful with limitations
/ Specialized / Reference / Poor fit.

### Acquired in this audit

| Dataset | Institution | Access checked | Licence | Coverage | Entity types | Time model | Size | Status | Rating |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wikidata medieval sites snapshot | Wikimedia; queried through QLever (Univ. Freiburg) | SPARQL on qlever.dev returned 200 in 1–30 s per query (the Wikidata Query Service and entity API returned 429) | CC0 | Europe, the Mediterranean and the Near East | Castles (31,826), monasteries (20,153), cathedrals (2,057), dioceses (754), fortifications founded before 1500 (5,345), battles (1,980) and sieges (1,194) before 1600, universities (149), bridges (328), settlements with a first mention 400–1600 (30,329), present-day cities and towns (used to match English names) | Year of founding (P571), first written mention (P1249), dissolution (P576) | 45 MB TSV, with queries saved | integrated | Useful with limitations |
| Germania Sacra, *Klöster und Stifte des Alten Reiches* | Göttingen Academy (NAWG); SUB Göttingen API | api.gs.sub.uni-goettingen.de returned 200 | CC BY-SA 3.0 (stated on the Datenservice page) | Holy Roman Empire | 7,473 house locations; each order's tenure, both as written and as termini post/ante quos; 67 diocese polygons | TPQ/TAQ per order | 7.6 MB | integrated | Excellent (Empire) |
| Buringh, *European urban population 700–2000* | Utrecht University; DANS | DANS API returned 200 | CC0 (record licence field) | 2,262 European towns | Towns with an estimated population per century (half-century after 1500), historical names, water access | Sample years | 4.9 MB, plus PDF annexes | integrated | Strong |
| HCED, *Historical Conflict Event Dataset* | ANU (C. Miller et al.); Harvard Dataverse | Dataverse API returned 200 | CC0 | Worldwide, 1468 BC to today | 17,761 battles and sieges with war, winner and loser (2,399 before 1600) | Year | 2.2 MB | integrated (only the 1,070 battles Wikidata lacks) | Useful with limitations |
| PeriodO | PeriodO project | d.json returned 200 | CC0 | Worldwide | Scholarly definitions of named periods | Start/end ranges | 7.8 MB | raw (reference) | Reference |

### Checked, not acquired

| Dataset | What was verified | Licence | Why not now | Rating |
| --- | --- | --- | --- | --- |
| Atlas Fontium / OntoHGIS (Poland, 16th c.) | GeoNode WFS GetCapabilities works. 59 resources: settlements, parishes, deaneries, archdeaconries, dioceses, districts, voivodeships, roads, rivers, forests; 18th-c. Kraków; Gaul/Raczyński 1807–12 | GeoNode reports "not_specified"; the download page states none | Licence unknown, and the repository is public, so private use only | Excellent (Poland c. 1580) |
| Settlements of 16th-century Poland in WHG (IH PAN) | Listed in WHG `/api/datasets/`: 24,498 places, 105 districts, 23 provinces | Not shown by WHG | WHG export endpoints returned 404 | Excellent (via WHG lookups) |
| Engel Pál, *Magyarország a középkor végén* (renewed 2020) | ABTK news page announces a free download: over 23,000 settlements, castles and monasteries c. 1500, with landholding in 1498 | **Unverified** | Licence and file format not verified | Excellent (Hungary), if licensed |
| DicoTopo | JSON:API search returns 200, with old name forms, INSEE code and coordinates; bulk XML at github.com/chartes/dico-topo | CC BY-NC-ND 3.0 FR | "No derivatives" rules out republishing transformed data | Excellent for French name forms |
| *Des villages de Cassini aux communes d'aujourd'hui* (EHESS) | Described on didomena.ehess.fr and Harvard Dataverse | **Unverified** | Page returns 403 to automated requests | Strong (France 1756–89) |
| Fund og Fortidsminder (Denmark) | Download page (CSV/SHP) and WFS endpoint found | CC0 as stated on the download page | Monument register, not a gazetteer; Wave 2 | Specialized |
| Kulturminnesøk / Askeladden (Norway) | GeoJSON API documented | NLOD (reported, not verified from the files) | Wave 2 | Specialized |
| Fornsök (Sweden) | Open-data service documented; over 1.8 million remains | **Unverified** | Wave 2 | Specialized |
| Regesta Imperii | REST/CSV and RI-Lab documented; places normalised to Wikidata/GeoNames | CC BY 4.0 | Coordinates unverified; Wave 2 (rulers' itineraries) | Strong (events) |
| GOV (Genealogical Gazetteer) | About 1.2M entries with dated administrative/parish membership; SOAP service | **Unverified** | Anubis bot check blocks automated access | Strong, if accessible |
| Czech toponyms of Western Bohemia to 1500 (Zenodo 21479034); CZ_Retro settlement raster (Zenodo 3367364) | Records found | **Unverified** | Regional; Wave 2 | Specialized |
| Russian towns of the late 14th c. (WHG) | 282 places listed in WHG | Not shown | Via WHG only | Specialized |
| Truhart states (WHG) | 7,028 records listed | Not shown | Via WHG only | Reference |
| Old World Trade (Ciolek, WHG) | 4,117 records listed | Not shown | Via WHG only | Specialized |
| Belgian Historical Gazetteer (WHG) | 3,548 places (1847–55 cadastre) | Not shown | Modern period | Reference |
| RoHGIS Romania 1904–13 (WHG) | 10,036 records | Not shown | Modern period | Reference |
| STUDIUM Leuven, Dati's *Sfera*, Benjamin of Tudela, Ibn Fadlan, Theophanes (WHG) | 9,058 / 369 / 215 / 71 / 35 records | Not shown | Specialized itineraries and sources | Specialized |
| Euratlas cities (WHG) | 3,585 records | Commercial (Euratlas) | Excluded | — |
| TIB / DigTIB (Tabula Imperii Byzantini, ÖAW) | Toponym registers and scans; no open coordinates found | — | No dataset to download | Reference |
| Nomisma | TTL dump returned 200 (19.8 MB) | **Unverified** | Coins and mints; Wave 3 | Specialized |
| iDAI.gazetteer | search.json API works | **Unverified** | Mostly ancient; overlaps Pleiades | Reference |
| ToposText | Site returns 200 | **Unverified** | Ancient texts to places | Reference |
| ARIADNE portal | Returns 200 | Per dataset | Aggregator | Reference |
| DARE | `api/geojson.php` returned HTML, not data | CC BY-SA (docs) | No usable endpoint | Reference |
| Vici.org | `data.php` returned 404 | — | No usable endpoint | — |
| EDH / DANS / GOV pages | Bot check on automated requests | — | Needs a manual download | — |
| DARMC (Dataverse) | Returned 202 with an empty body | — | Not reachable | — |
| PastPlace, Trismegistos | No response | — | Not reachable | — |
| Spanish castles (AEAC inventory, ADIMO) | No open dataset found | — | — | — |
| Italian medieval GIS | Nothing concrete found (only project pages and papers) | — | — | — |

Datasets already in Shelf before this audit, and what they cover:
- Pleiades, AWMC and Itiner-e: the ancient world.
- Viabundus: northern Europe, 1350–1650.
- al-Ṯurayyā: the 9th–10th-century Islamic world.
- Cliopatria: polities.
- Wikidata events: battles, sieges, treaties and other dated events.
- England-only layers:
  - Early Medieval Atlas (Domesday, Gough Map, inland navigation, bridges)
  - Atlas of Rural Settlement: local builds only.

### Quality records for the integrated datasets

**Wikidata sites**
- **Authority:** collaborative. National heritage imports and Wikipedians supply
  most statements.
- **Method:** each class is matched together with its subclasses. For example,
  "castle" includes castle ruins, mottes, tower houses and châteaux.
- **Precision:** the coordinates are those of today's site or ruin. Dates are
  used to the year.
- **Completeness:** very uneven, and the unevenness follows documentation, not
  history:
  - Settlements with a first-mention date: 9,400 in Czechia but only 561 in
    France.
  - Only 16% of castles have a founding date.
- **Bias:** where heritage registers were imported (Czechia, Romania, Germany,
  Ukraine), there is far more.
- **Uncertainty:** Wikidata's date precision is not carried through. A "first
  mention" can be a charter, and a "founding" can be the start of a later
  rebuild.
- **Names:** English labels for 88% of records. The rest use the item's own
  label in a Latin-script language.
- **Strengths:** Europe-wide; stable identifiers; links to everything else.
- **Limitations:**
  - Dissolutions are often missing, so a house may be drawn to the present.
  - Classes overlap (a territorial abbey counts as both cathedral and abbey).
  - Some famous sites fall outside the classes used (Rila Monastery was not
    matched).
- **Recommended use:** a dated point layer and name lookups. Always show the
  date basis.

**Germania Sacra**
- **Authority:** an academy research project with a bibliography for every
  house.
- **Time model:** each order's tenure is kept as written ("zwischen 712 und
  714") and as a year.
- **Completeness:** high within the Empire.
- **Limitations:**
  - The diocese polygons have no stated date.
  - A house that moved has one row per location.
- **Merge with Wikidata:** a Wikidata monastery or cathedral within 400 m is
  treated as the same house (4,745 matched). The other 2,728 houses are added
  with their German names, because the dataset gives no English ones.

**Buringh towns**
- **Authority:** a published economic-history dataset. Each figure records its
  source and whether it was proxied or imputed.
- **Precision:** coordinates rounded to 0.01°.
- **Errors found in the data:**
  - 16 rows had lost the decimal point (latitude 50579 for 50.579).
  - Several towns were far from where they belong (Riga at 21.1°E, Minsk at
    37.6°E, Coutances 663 km off).
- **Handling of bad positions:**
  - A position is repaired only when a same-named Wikidata town confirms it:
    - by restoring the decimal point, or
    - by moving the town to a uniquely named town within 250 km (within 60 km
      the town's other names may also confirm it).
  - A town that cannot be confirmed is left off the map. 25 towns were dropped
    this way, and they are listed by the build.
- **Recommended use:** size of towns by century. This is the only Europe-wide
  importance signal Shelf has that is not a measure of documentation.

**HCED**
- **Method:** battles were placed from their names with Google Maps, then
  checked by hand against Geacron and Dincecco & Onorato.
- **Precision:** year only.
- **Merge with Wikidata:** 1,328 of the pre-1600 battles were already in
  Wikidata's events (within 50 km and ±1 year, or the same name). Only the
  remaining 1,070 are added.

---

## B. Existing coverage (measured)

See `docs/HISTORICAL_COVERAGE_MEASURED.md` for the full tables. A few
examples, 1200–1399:

| Region | Settlements | Religion | Military | Roads |
| --- | --- | --- | --- | --- |
| Germany | 4,909 | 2,705 | 1,036 | 10,982 (Viabundus segments) |
| Czechia | 7,726 | 271 | 391 | — |
| France | 333 | 791 | 628 | 206 |
| Italy | 397 | 508 | 693 | 51 |
| Iberia | 453 | 331 | 601 | — |
| British Isles | 205 | 909 | 476 | — |

Before this audit, medieval Europe outside Viabundus's northern area had
almost nothing dated:
- Settlements came only from Pleiades's late-antique tail.
- Religion and military had no layers at all.

## C. Geographic gaps (measured, 1000–1500)

- **Hungary, Bulgaria and Anatolia** stay weak in every theme. Hungary has
  71–76 settlements, 10–18 religious sites and 10–11 military sites.
  - Engel's Hungary (licence unverified) would fill Hungary.
  - Nothing open fills Byzantine Anatolia and Bulgaria. TIB has no open
    coordinates.
- **Greece:** medieval settlements are weak (24–34) and military sites
  moderate (40–69).
- **Finland and Iceland:** almost nothing before 1200.
- **Low Countries, Germany, Scandinavia, Poland and the Baltic:** strong for
  1350–1650 because of Viabundus. Much weaker before 1250.
- **France:** under-represented in dated settlements. Wikidata has few
  first-mention dates for French communes; DicoTopo has them but is
  "no derivatives".
- **Brittany, Catalonia, Castile, León, Aragón, Navarre and Wallachia:** can't
  be separated in the counts, which use present-day countries, so they fall
  inside France, Spain and Romania.

## D. Temporal gaps

- **500–1000:** weak everywhere except where Pleiades's late-antique records
  reach (Italy, Iberia, France, the Balkans, Greece). Wikidata foundations
  before 1000 are few.
- **1000–1200:** moderate in the west, driven by castles and monasteries. Weak
  in the east.
- **1200–1500:** strongest. Viabundus, Wikidata and Germania Sacra overlap
  here.
- **Undated records**, which are not drawn at a date unless asked for, are
  numerous:
  - over 15,000 in Germany
  - about 9,800 in France
  - about 7,900 in Italy

  Most are castles and monasteries that Wikidata records without a date.

## E. Thematic gaps

- **Political:** Cliopatria is the only polity source. It records one outline
  per period, with no claims or vassalage. Medieval Europe has 1–35 distinct
  polities per region and period.
  - There are no county, duchy or march boundaries anywhere except Domesday
    England and Germania Sacra's dioceses.
- **Economy:** tolls, fairs and staples exist only in the Viabundus area.
  Mines, mills and mints are absent (Nomisma is unverified).
- **Landscape:**
  - Medieval rivers are shown only for England (inland navigation) and
    Viabundus's 1500 waterways.
  - Forests are absent (Atlas Fontium has 16th-c. Polish forests, licence
    unknown).
- **Roads outside the Viabundus area and England:**
  - Only Roman roads (Itiner-e) and early Islamic routes (al-Ṯurayyā).
  - No medieval road network for France, Italy, Iberia or the Balkans; none
    was found open.
- **Events:** battles are now reasonably covered (Wikidata plus HCED).
  Treaties, councils and coronations are thin.
- **Names:** strong where Wikidata items carry labels in many languages. Dated
  historical name forms exist only in Pleiades, Viabundus and (for France)
  DicoTopo.

## F. Highest-value acquisitions next

1. **Engel's Hungary c. 1500.** First confirm the licence. It would turn
   Hungary from weak to strong across settlements, castles and monasteries.
2. **Atlas Fontium Poland.** Ask IH PAN for a licence. It covers
   administrative units and parishes as they actually were c. 1580.
3. **DicoTopo.** Use live lookups of French name forms, which the ND licence
   allows without republishing.
4. **Regesta Imperii itineraries.** Dated places where rulers were: an events
   layer for the Empire and Italy.
5. **GOV.** Dated administrative membership for central Europe, if a bulk route
   and licence are confirmed.
6. **Wikidata, second pass.**
   - Dissolution dates (P576) and "end time" statements for monasteries.
   - Pilgrimage sites, mints, fairs and markets.
   - A class search for Orthodox monasteries not reached through "monastery".

## G. Licences

**Redistributable, and published in this public repository:**
- CC0: Wikidata, Buringh, HCED, PeriodO.
- CC BY-SA 3.0: Germania Sacra. Derived tiles are under the same licence, with
  attribution.
- Already in Shelf: Pleiades (CC BY 3.0), Viabundus (CC BY 4.0), Itiner-e
  (CC BY 4.0), ADS datasets (CC BY 4.0), al-Ṯurayyā (Apache-2.0).

**Private use only, not published:**
- Atlas of Rural Settlement: personal and business use only. Local builds.
- Atlas Fontium and Engel: licence not stated or unverified.
- DicoTopo: non-commercial, no derivatives.

**Excluded:**
- Euratlas: commercial.
- PASE: individual use only, no copying.

## H. English names

- **Wikidata sites:** 88% carry an English label; by kind:
  - castles 92%
  - monasteries 73%
  - settlements 91%
  - cathedrals 99.8%

  The rest show the item's own name in a Latin-script language. The popup says
  "No English name recorded — shown in its own language". Nothing is
  transliterated or translated by Shelf.
- **Buringh towns:**
  - 1,450 of 2,237 are given a present-day English name from Wikidata (Wien →
    Vienna, Praha → Prague, Firenze → Florence, Saloniki → Thessaloniki).
  - To be matched, a Wikidata item must carry Buringh's own main name in some
    language.
  - An ancient predecessor never names the town: Marseille is not "Massalia".
  - An administrative unit never names the town either: the Metropolitan City
    of Rome is not Rome.
  - Unmatched towns keep Buringh's spelling, which is sometimes a transcription
    (e.g. "Gluhov").
- **Germania Sacra houses without a Wikidata match:** German names (e.g.
  "Benediktinerinnenabtei Nonnberg"). The source gives no English.
- **Borrowed titles:** a title borrowed from another dataset is not treated as
  the record's own main name when the reader's text is matched. This prevents a
  borrowed English label from overriding real ambiguity (Rome in Italy against
  Rome in Mecklenburg).

## I. Architecture implications

- No parallel system was added. The existing pieces were extended:
  - **Raw vault:** `data/historical/raw/<id>/original` with manifest and
    checksums. The Wikidata queries are stored beside their results and re-run
    with `scripts/historical-data/wikidata_snapshot.py`.
  - **Normalised runtime:** the place index (`public/world/places`) and PMTiles
    (`public/world/tiles`).
  - **Registry:** `src/world/registry.ts`.
  - **Layer catalogue:** `src/atlas/catalog.ts`.
- The runtime place index grew from about 44,000 to 126,000 records. It
  remains sharded, so the phone fetches one 2° cell or one name shard at a
  time. `medieval-sites.pmtiles` is 16 MB but is range-requested.
- Temporal model, unchanged:
  - A site's own dates are used as recorded.
  - Undated sites are hidden at a date unless the reader includes undated
    records.
  - Buringh towns exist on the map while their estimate is above zero.
- Importance: town size comes from population estimates. Castles and
  monasteries are not ranked by Wikipedia sitelinks (documentation ≠
  importance). Sitelinks are used only to tell apart same-named items on one
  spot.
- Identity and deduplication are resolved at build time with stated rules:
  - Wikidata ↔ Germania Sacra: within 400 m.
  - Wikidata ↔ HCED: within 50 km and ±1 year, or the same name.
  - Buringh ↔ Wikidata: name plus distance.

  Each merged record keeps both identifiers.

## J. Next implementation steps

1. Add the Wave 2 sources in section F whose licences are confirmed, with a
   `region` field in the registry rather than a new folder structure.
2. Show a site's date basis ("first mentioned", "founded", or Germania Sacra
   tenure) in the place history panel too, not only in the map popup.
3. Show Buringh population in the place history panel as a small per-century
   table.
4. Use the measured matrix (`data/historical/coverage-measured.json`) in the
   app's coverage status, replacing the hand-written expectations in
   `src/world/coverage.ts` for Europe.
5. Run a second Wikidata pass: dissolutions, Orthodox monasteries, markets and
   mints.
