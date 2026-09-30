# Medieval Europe: historical-data audit (second pass, 30 September – 1 October 2026)

This replaces the first-pass report of 30 September. The first pass acquired
Wikidata, Germania Sacra, Buringh, HCED and PeriodO and reported coverage. It
did not settle whether each of the 166 original seed candidates had really been
checked, and it trusted its own imports too much. This pass therefore:

1. reconciles every one of the 166 candidates with the evidence actually
   gathered;
2. measures the quality of what was imported, and fixes the errors found with
   general rules rather than special cases;
3. re-checks every licence;
4. acquires specialist sources for the weakest regions where they could be
   reached;
5. tests the running app at twelve dates across eleven regions.

**Status after the recovery pass (below): substantially improved, not
complete.** The first two passes treated Shelf as if it were a public data
distributor. Data without a licence to republish was either not acquired or
kept to "local builds", which never reach the phone. The recovery pass
revisited every candidate that had been skipped, deferred or never
downloaded, and used what is obtainable and historically useful.

Still weak or absent, because suitable data could not be obtained:
- **Hungary.** Engel's atlas is encrypted inside a Windows program.
- **Bulgaria and Anatolia.** No usable dataset was found.
- **Roads and landscape almost everywhere.**
- **Political units below kingdom level outside the Empire and Poland.**

Section H lists what remains, with the measured numbers.

---

## R. Recovery pass: data skipped because of licensing or access

Shelf is a private, personal app. The practical question for each skipped
candidate was: *is the data obtainable and historically useful?* If it was,
it was acquired, checksummed, processed and integrated. Licence
classification was recorded but no longer used as a reason to skip.

### R.1 How private data reaches the app

The phone loads the public site, so "local builds only" data never reached it
(see diagnosis R33). Now:

- **The pack.** Datasets that must not be republished are built into one file,
  `data/private-pack/shelf-private-data.pack`, by
  `scripts/atlas-build/private_pack.py`. The file is git-ignored, and its raw
  files stay in the vault's git-ignored folders.
- **Loading it.** Under the map, "Your private data" → **Load private data
  file** stores the pack on the device, in the browser's storage. After that,
  the layers and place lookups use it exactly like the public data:
  - map tiles are read from the file by byte range;
  - place records are merged with the public ones for each map cell and name
    shard.
- **Removing or replacing it** takes one button.
- **Nothing private is in the public build.** Tests check this:
  - the public place index has no private records;
  - `public/` has no private tiles;
  - the pack folder is git-ignored.

### R.2 Recovered (acquired and integrated)

| Dataset | Region | What it adds | Records | Where |
| --- | --- | --- | --- | --- |
| **RAN**, Romania's national archaeological register (CIMEC) | Romania | Migration-period and medieval settlements, churches, monasteries and fortifications, dated by period or stated century. data.gov.ro still refuses connections; taken from the register's own site and map service. | 2,865 | private |
| **DicoTopo**, Dictionnaire topographique (CTHS / École des chartes) | France (53 départements) | 22,366 communes with their **first dated attestation**, earliest form and dated old forms (median first attestation: 1146). Also 6,774 castles, churches and religious houses located by commune (marked approximate). | 29,140 | private (no-derivatives licence) |
| **EBIDAT**, castle database of the European Castle Institute | Germany, Austria, Czechia, Slovakia, Hungary, Latvia… | 8,264 castles in the snapshot, 87% of them dated by the start and end of their use, to the half or quarter century; Wikidata dates 16% of castles. Mostly Germany, plus Austria (152), Hungary (74), Czechia (57), Slovakia (46) and Latvia (30). One castle with an impossible position in the source is left out. | 8,263 | private |
| **Fund og Fortidsminder**, Denmark | Denmark | Viking-age and medieval castles, churches, monasteries, farms and pit houses, roads, wrecks, and 3,954 coin finds and hoards (economy), each with the register's date range. | 10,772 | private |
| **Swedish ancient remains** (Riksantikvarieämbetet) | Sweden | 764,974 remains in the national GeoPackage, which has no dating field. Only the 5,300 whose own description names a period are kept, dated by that period (medieval 2,751, Viking Age 1,094, Migration period 483…). Nothing is dated from its type alone. | 5,300 | private |
| **Norwegian heritage register** (Riksantikvaren) | Norway | Migration-period, Viking-age and medieval settlements, churches and churchyards, forts, trade sites, burial mounds and house sites, each dated by the register's period. Licence is open (NLOD), so it is public. | 8,941 | **public** |
| **Nordic Spatial Humanities** (incl. Icelandic Saga Map) | Nordic countries, Iceland | Parish churches with first attestation and medieval diocese, and places named in the sagas (dated by the saga age they describe). Licence CC BY 4.0, so it is public. | 764 | **public** |
| **DARMC** (Harvard) | Europe, Mediterranean | 483 dated shipwrecks after 400 with cargo, 278 Carolingian coin hoards (751–987) and 82 Anglo-Saxon settlements. | 843 | private |
| **Atlas Fontium**, Poland c. 1550–1600 (IH PAN) | Crown of Poland | Settlements and parish seats (as before), now also roads (two weight classes), rivers, forests, lakes, voivodeships, districts, dioceses and parishes as map layers. | 26,204 + lines | private |

### R.3 Previously local-only, now usable on the phone

All of these now come through the private data pack:
- TIB Maps of Power (Byzantine Balkans and Greece): 2,809 records.
- Markets and Fairs of England and Wales to 1516: 2,371.
- Atlas Fontium.
- The Atlas of Rural Settlement in England (map layer).
- The Danish register.

### R.4 Measured with and without the private data

The generated matrices below (E.2, F.2, G.2) repeat the coverage measure with
the private pack counted. These are the raw record counts from the final
build of this pass.

| Region, theme, period | Public only | With your private data | From |
| --- | --- | --- | --- |
| France, settlements, 1000–1199 | 291 | **14,618** | DicoTopo first attestations |
| France, military, 1000–1199 | 671 | 1,470 | DicoTopo castles |
| Germany, military, 1000–1199 | 490 | **2,775** | EBIDAT |
| Scandinavia, settlements, 800–999 | 1,030 | 2,706 | Danish, Swedish registers |
| Scandinavia, religion, 1000–1199 | 1,485 | 2,877 | Danish, Swedish registers |
| Scandinavia, economy, 800–999 | 312 | 1,012 | Danish coin finds and hoards |
| Romania, settlements, 1000–1199 | 74 | 856 | RAN |
| Romania, military, 1200–1399 | 17 | 128 | RAN |
| Hungary, military, 1200–1399 | 10 | 73 | EBIDAT (Hungarian castles) |
| Greece, settlements, 800–999 | 25 | 139 | TIB |
| Austria, military, 1200–1399 | 155 | 300 | EBIDAT |
| Hungary, settlements, 1200–1399 | 71 | 71 | — (Engel locked) |
| Poland, settlements, 1000–1199 | 181 | 181 | — (Atlas Fontium is 1550–1600) |
| Bulgaria, settlements, 1200–1399 | 23 | 37 | TIB |
| Anatolia, settlements, 1200–1399 | 5 | 5 | — |

The public counts already include the recovered public datasets: Norway's
register and the Nordic data.

### R.5 Not recovered, and why (from the 82 never-downloaded candidates)

The per-candidate outcome is in the last column of A.1. In summary:

- **The data does not exist as a dataset (33 candidates).** Examples:
  - medieval Iberian kingdoms, counties and taifas;
  - Italian communes, city-states and roads;
  - Italian and Iberian monasteries and dioceses;
  - Ukraine and Belarus;
  - royal sites;
  - Scandinavian hundreds.
- **Reference material, not data (14):** maps, text databases, formats,
  aggregators.
- **Access problems (15):**
  - Greece's Archaeological Cadastre (a web app without a bulk route);
  - regional Spanish registers (next wave);
  - Malanima's Italian towns (PDF tables);
  - Villuga 1546 (no data file located);
  - Croatia.
- **Bot or network blocks (4):**
  - GOV;
  - ADS manual downloads (the owner can fetch these by hand);
  - Estonia's register (403);
  - TAY for Anatolia, which fails the network proxy's certificate check.
- **Technical (2): Engel's Hungary.** It was downloaded, but its database is
  encrypted inside a Windows GIS program whose only export is attribute tables
  without coordinates. Breaking that encryption is not an option.
- **Not useful for a history map (21):** people databases (PASE), museum
  objects, epigraphy without geodata, modelled routes, and duplicates of
  integrated data.

### R.6 Gaps caused by lack of data, not by licensing decisions

After the recovery pass, the weak regions and themes that remain are weak
because no obtainable dataset exists or the one that exists is locked:

- **Hungary.** Engel is locked. EBIDAT adds Hungarian castles once its
  snapshot completes.
- **Bulgaria.** TIB has only 23 places by 1399. There is no national register
  with a bulk route.
- **Anatolia.** No open Byzantine or Seljuk gazetteer; TAY is blocked here and
  mostly prehistoric.
- **Ukraine and Belarus.**
- **Medieval roads outside northern Europe and England.** No reconstruction
  exists as data. Atlas Fontium's roads are 16th-century.
- **Landscape before 1500.** Only England's rivers, Viabundus waterways and
  the 16th-century Polish forests.

Tables marked *generated* are written by the scripts named in them from the
data Shelf holds. They are not typed by hand. Rerun the script and the table
updates.

Related documents:
- `docs/HISTORICAL_COVERAGE_MEASURED.md`: the full region × theme × period
  counts.
- `docs/HISTORICAL_GEOGRAPHY_DIAGNOSIS.md`: root causes of the errors found
  (R26–R34 are from these passes).
- `docs/HISTORICAL_ATLAS.md`: layers and licences as the app uses them.
- `data/historical/raw/<dataset>/SOURCE.md` and `LICENSE.md`: provenance and
  licence per dataset.
- `data/historical/audit/`: the machine-readable audit files:
  - `seed-candidates.json`
  - `reconciliation_entries.py` and `reconciliation.json`
  - `import-audit.json`
  - `vault-audit.json`

---

## A. Reconciliation of the 166 original candidates

The original list is the 166 bullets of the audit brief's seed list, in their
original order (`data/historical/audit/seed-candidates.json`). Nothing was
dropped or replaced. Some bullets name one dataset, and some name a theme ("Castles",
"Roads"). A theme bullet is answered with the sources found for it.

**How to read the evidence levels.** A candidate counts as "investigated" only
when an official project page was located. It counts as "verified" only when
the dataset itself was seen to exist (a record, file listing or API response).
It counts as "downloadable" only when a download or API call was actually made
and returned data.

The licence is classed as follows:
- **confirmed**: the licence text or licence field was read.
- **not verified**: no licence was found, or it was read only through a
  search result.
- **explicit restriction**: the licence itself limits use, for example to
  non-commercial use, no derivatives, or individual use only.

Access problems are stated separately in "Why / why not": bot checks, time-outs,
login walls, or a Windows program instead of a data file. "No licence found" is
never treated as "private use only". Such data is kept local-only (usable in
Shelf on this device, not republished in this public repository) until a
licence is found.

Totals, from the generated table (A.1):
- **166 candidates**, all found.
- **Located on an official page:** 163.
- **Dataset verified to exist:** 157.
- **Download or API tested:** 102 (84 before the recovery pass).
- **Licence:**
  - confirmed: 51
  - not verified: 87 (including licences seen only through a search result)
  - explicit restriction: 7
  - per source (theme rows): 19
  - not applicable: 2
- **Quality assessed:** 37.
- **Acquired:** 56. **Integrated:** 48, some through the private data file
  (before the recovery pass: 34 and 28).

Before the recovery pass, 82 candidates had never been tested by download or
API. R.5 and the last column of A.1 give each one's outcome. They fell into
four groups:
- bullets that name a theme rather than a dataset;
- duplicates of a source already acquired;
- projects with no dataset to download (text, scans or maps only);
- sources behind a bot check or an unreachable server.

Each row says which.

The full table is A.1, at the end of this document (it is long).

---

## B. Quality audit of what was imported

### B.1 Wikidata (the 94,000-record claim)

The first pass reported "about 94,000" Wikidata sites. The measured numbers
(from `scripts/historical-data/audit_imports.py` → `import-audit.json`, and the
built index):

| Step | Records |
| --- | --- |
| Items in the snapshot (all queries) | 118,500 |
| Items of a site kind (castle, monastery, cathedral, diocese, university, fortification, bridge, settlement) | 82,107 |
| Dropped: start after 1650 (not medieval evidence) | 3,791 |
| Dropped: no label in any language | 30 |
| **In the place index now** | **77,836** |

Findings by kind:
- **Castles (31,762).**
  - Only 15.8% have a founding or first-mention date.
  - 8,411 are typed as ruins or sites and 1,746 as châteaux or palaces.
    Many of those are post-medieval country houses under the class "castle".
  - Only 499 have an end date.
- **Monasteries (20,130).**
  - 35.8% are dated.
  - Only 2,948 (14.6%) record a dissolution, so most are drawn on to the
    present. After the Reformation and the secularisations that is often
    wrong. The layer's hint says so.
- **Dioceses (747).**
  - 334 were created after 1650 and are dropped.
  - 208 are titular sees. These are sees that no longer exist, placed at their
    ancient city. Their inception is the titular re-creation, usually after
    1650, so they are dropped with the rest.
  - 414 are present-day dioceses with no end.
- **Settlements (25,533).**
  - Every one is dated (that is how they were queried), but 13,839 are typed as
    Czech or Ukrainian administrative units (municipal parts, cadastral areas).
    They are real villages whose date is a first mention. However, they make
    Czechia look better covered than any other country (7,726 settlements in
    1200–1399, against France's 333). That imbalance is Wikidata's, not
    history's.
  - Their start came from "inception" (P571) for 244 items where it disagrees
    by ≥100 years with the first mention.
  - **Fixed:** a settlement's start is never treated as a founding. See B.3.
- **Same name within 2 km:** 618 pairs. Most are a castle and its village, or a
  monastery and its church. They are different things and are kept. Duplicates
  of one site between datasets are merged (see B.5).

**Bias.** Coverage follows where heritage registers were imported into
Wikidata, not where medieval sites were:
- Czechia, Romania, Germany and Ukraine are heavy.
- France and the Balkans are light.

The region matrix (E) shows this. Wikidata is therefore used as a gazetteer and
a dated point layer. It is not evidence that a region was empty.

### B.2 Buringh urban population

Measured from the build:
- **2,262 towns** and 42,968 town-years. Of the town-years, 17,719 were
  imputed and 2,641 proxied by the author. The popup says which.
- **Coordinate quality:**
  - For the 1,313 towns confirmed by name and left unmodified, the median
    distance to Wikidata's position is 1.08 km. 34 are 5–12 km off.
  - 12 were repaired (lost decimal points) and 127 moved to a same-named town.
  - 25 were dropped because no same-named town could confirm a position
    (Minsk, Coutances, Thionville…).
  - That is about 7% with a bad position: a systematic problem in the source,
    not an isolated one.
- **Rules, tested for every town:**
  - Every change is stated in the popup, with the distance.
  - No two towns sit on the same spot under the same name.
  - An English name never comes from an ancient predecessor (Marseille is not
    "Massalia") or from an administrative area (the Metropolitan City of Rome is
    not Rome).
- **Dated start:** a town is drawn while its estimate is above zero. Its first
  mention (Wikidata) is shown as evidence, not as a founding.

### B.3 Temporal semantics (fixed in this pass)

- **First mention ≠ start.** Before a first mention, a place is now
  **unattested** ("first recorded in 1100 — it may be older, but nothing places
  it at this date"). It is not "later" (did not exist yet).
  - Only an explicit founding or construction date means "did not exist before".
  - On the map, unattested records are hidden by default. They are drawn hollow
    when the reader asks for unevidenced records.
- **Evidence period ≠ always.** A record dated only by an evidence period is
  shown lighter, and only inside that period. Examples:
  - the building campaign of a French monument;
  - a Finnish register class;
  - the 16th-century snapshot of the Polish atlas.
- **End date alone ≠ existed before it** (found by the app check). 583 Wikidata
  sites record only an end, such as a dissolution or a destruction.
  - The map had drawn them at every earlier date: Castel Paterno, "ended 1600",
    appeared at 3000 BCE.
  - Now they are unevidenced before their end, like an undated record. The map
    and the place lookup follow the same rule.
- **Earliest evidence of any kind.** The Empire's town data (Princes and
  Townspeople) sometimes dates a charter or foundation before its "first
  mention". The codebook codes "Middle Ages" as 1500 "at the latest". The town
  had been drawn only from that later date: Eisenach 1500, although chartered
  by 1080.
  - A town now starts at its earliest dated evidence, and the basis says what
    that evidence is.
  - This is tested for all 2,390 towns: no charter is dated before the start.

### B.4 Names

The hierarchy is:
1. English.
2. A Latin-script label, in the NAME_LANGS order.
3. A romanization by a named national or international standard.
4. The original script.

No name is invented, and no label is discarded: all are kept as alternative
names.

The first pass had dropped 1,252 Wikidata sites whose only labels were in
Cyrillic, Greek or Georgian. They are now kept and romanized. The popup names
the scheme used:
- Ukrainian national 2010
- BGN/PCGN Russian and Belarusian (simplified)
- Bulgarian Streamlined 2009
- Macedonian official
- Serbian Latin
- ELOT 743
- Georgian national 2002

Arabic, Hebrew and Armenian have no reliable automatic romanization (vowels are
not written, or schemes vary). Such records keep their own-script name.

Measured in the built index, for Wikidata:
- English: 67,228
- Latin-script label: 9,887
- Romanized: 693
- Original script: 28

### B.5 Duplicates and overlaps between datasets

Each rule is stated and applied at build time. Merged records keep both
identifiers.

| Pair | Rule | Merged |
| --- | --- | --- |
| Wikidata ↔ Germania Sacra | monastery/cathedral within 400 m | 4,745 (2,728 houses added) |
| Wikidata ↔ Mérimée | same kind within 250 m | 2,360 (9,875 monuments added) |
| Wikidata ↔ Western Bohemia | settlement within 2 km with the same Czech name | 980 (form + year attached; 839 added) |
| Wikidata events ↔ HCED | within 50 km and ±1 year, or the same name | 1,328 (1,070 added) |
| Buringh ↔ Wikidata | same main name + distance (for English name and position check) | 1,450 matched |
| HRE towns ↔ Wikidata | as Buringh; positions never moved | 1,391 English names |

Not merged (documented):
- HRE towns ↔ Buringh towns. Both are shown, in different layers: charters and
  rulers versus population.
- Viabundus ↔ Wikidata settlements.

A place lookup groups records of one place across datasets and chooses one
lead record.

### B.6 Historical quality of the specialist sources

- **Germania Sacra** is an academy database with a bibliography per house and
  each order's tenure (TPQ/TAQ). It is the best monastery source in this build.
  Its diocese polygons have no date.
- **Princes and Townspeople** covers 2,390 towns from the *Deutsches
  Städtebuch*. It gives charters, first mentions and legal families, and the
  ruling territory each year from 1300. The authors consider records before
  1300 less complete, and the popup says so.
- **Mérimée** dates only the building campaigns, by century. A church "13th
  century" is shown for that century only, as an evidence period.
- **Finland register:** medieval period classes only.
- **Western Bohemia toponyms:** attested name forms with year and source.
- **Bridges of medieval England:** first attestation to c. 1250.
- **Atlas Fontium** (new, local-only): the Crown of Poland in the second half
  of the 16th century, from tax registers. Fill rates: 16th-century name 98%,
  settlement character 92%, parish 88%, size band 27%.

---

## C. Licence and access audit

The four states are kept separate. A missing licence is **not verified**. It is
not "private use only".

**Confirmed (published in this repository):**

| Dataset | Licence | Evidence |
| --- | --- | --- |
| Wikidata snapshot | CC0 | Wikidata licensing page |
| Buringh urban population | CC0 | DANS record licence field |
| HCED | CC0 | Dataverse licence field |
| Princes and Townspeople | CC0 | licence field of each of the six Dataverse records |
| PeriodO | CC0 | project page |
| Germania Sacra | CC BY-SA 3.0 | Datenservice API documentation (derived tiles share alike) |
| Mérimée | Licence Ouverte 2.0 | data.gouv.fr licence field "lov2" |
| Finland heritage (Museovirasto) | CC BY 4.0 | download page statement |
| Western Bohemia toponyms | CC BY 4.0 | Zenodo record |
| Bridges, Domesday, Gough, Inland Navigation, Tribal Hidage (ADS) | CC BY 4.0 | ADS records |
| Viabundus, Itiner-e, Living with Machines | CC BY 4.0 | Zenodo records / project page |
| Pleiades | CC BY | site statement |
| al-Ṯurayyā | CC BY 4.0 (data), Apache-2.0 (code) | DATA-LICENSE.md |
| Historic England NHLE | OGL v3 | item metadata; the terms page refused automated requests |

**Explicit restriction:**
- **Atlas of Rural Settlement:** "personal and business use", with no
  permission to republish.
  - Tiles are local builds only.
  - The raw ZIP itself **is in this public repository** because it was
    uploaded by the owner. Removing it, or asking Historic England, is the
    owner's decision.
- **CShapes 2.0:** CC BY-NC-SA. Used only to count coverage by region.
- **DicoTopo:** CC BY-NC-ND.
- **Open Domesday:** non-commercial.
- **Icelandic Saga Map:** CC BY-NC.
- **PASE:** individual use only.
- **Euratlas:** commercial.

**Not verified (in the private data pack; raw files kept out of git, tiles
only in the pack):**
- **TIB Maps of Power:** only the photographs are CC BY 4.0.
- **Markets and Fairs to 1516:** SAS-Space "UNSPECIFIED".
- **Atlas Fontium:** GeoNode "not_specified", restriction code
  "intellectualPropertyRights".
- **Fund og Fortidsminder (Denmark).**
  - The first pass wrote "CC0 as stated on the download page". The page states
    no licence, so this is corrected.
- **Riksantikvarieämbetet (Sweden):** the first pass likewise stated a licence;
  now downgraded to not verified.
- **RAN (Romania):** OGL per data.gov.ro, seen only through a search result.
- **EBIDAT:** no licence stated.
- **DARMC:** no licence stated.
- **Engel (Hungary):** not stated.

**Explicit restriction, used privately:** DicoTopo (CC BY-NC-ND). It is in
the private data pack.

**Newly confirmed open (public):**
- Norwegian heritage register: NLOD, per the Geonorge metadata.
- Nordic Spatial Humanities: CC BY 4.0.

For this private app, none of these states stops Shelf from using the data.
They decide only whether it goes in the public build or in the private file
(section R).

**Access restriction (a licence may be fine, but the data could not be
fetched):**
- Anubis bot checks block automated downloads: IISH / DataverseNL (Low
  Countries atlas HALC), EDH, GOV, Nomisma, Arachne.
- data.gov.ro reset the connection (RAN Romania, stated as OGL).
- Engel's Hungary is distributed as a Windows GIS program, not a data file.
- DARMC's Dataverse returned 202 with an empty body.
- PastPlace and Trismegistos did not respond.

---

## D. Integration audit (vault → app)

*Generated* from the vault, the built place index and the tiles. "Integrated"
means rows in the place index or tiles used by a map layer. Every raw file is
checked against its recorded SHA-256.

<!-- VAULT:START (generated by scripts/historical-data/audit_vault.py) -->

| Dataset | Files present / recorded | URL, date, SHA-256 recorded; checksums match | SOURCE.md + LICENSE.md | Local-only (kept out of git) | Processed by | Place-index rows | Tiles | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| al-thurayya | 10/10 | ✓ | ✓ | no | atlas-build/world.py | 2518 | thurayya-places.pmtiles, thurayya-routes.pmtiles | integrated |
| atlas-fontium-poland | 11/11 | ✓ | ✓ | yes | atlas-build/regional.py, sites.py → private data pack | 26204 | private-sites.pmtiles, private-lines.pmtiles | integrated (private data pack) |
| atlas-rural-settlement | 1/1 | ✓ | ✓ | yes | atlas-build/england.py → private data pack | — | rural-settlement.pmtiles | integrated (private data pack) |
| buringh-urban | 3/3 | ✓ | ✓ | no | atlas-build/sites.py | 2237 | towns.pmtiles | integrated |
| cshapes | 7/7 | ✓ | ✓ | no | — | — | — | raw only |
| darmc | 4/4 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 843 | private-sites.pmtiles | integrated (private data pack) |
| dicotopo | 53/53 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 29140 | private-sites.pmtiles | integrated (private data pack) |
| dk-fund-og-fortidsminder | 1/1 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 10772 | private-sites.pmtiles | integrated (private data pack) |
| domesday | 4/4 | ✓ | ✓ | no | atlas-build/england.py | — | domesday.pmtiles | integrated |
| ebidat | 12/12 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 8263 | private-sites.pmtiles | integrated (private data pack) |
| engel-hungary | 1/1 | ✓ | ✓ | yes | — | — | — | raw only |
| finland-heritage | 1/1 | ✓ | ✓ | no | atlas-build/regional.py | 1823 | medieval-sites.pmtiles | integrated |
| gb1900 | 0/0 | — | ✗ | no | — | — | — | metadata only |
| germania-sacra | 3/3 | ✓ | ✓ | no | atlas-build/sites.py | 2502 | medieval-sites.pmtiles, gs-dioceses.pmtiles | integrated |
| gough-map | 4/4 | ✓ | ✓ | no | atlas-build/england.py | — | gough.pmtiles | integrated |
| hced | 2/2 | ✓ | ✓ | no | atlas-build/sites.py → public/atlas/hced-battles.json | — | atlas/hced-battles.json | integrated |
| historic-england | 7/7 | ✓ | ✓ | no | — | — | — | raw only |
| inland-navigation | 5/5 | ✓ | ✓ | no | atlas-build/england.py | — | navigation.pmtiles | integrated |
| itinere | 12/12 | ✓ | ✓ | no | atlas-build/world.py | — | itinere.pmtiles | integrated |
| kepn | 0/0 | — | ✗ | no | — | — | — | metadata only |
| living-with-machines | 11/11 | ✓ | ✓ | no | — | — | — | raw only |
| markets-fairs | 3/3 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 2371 | private-sites.pmtiles | integrated (private data pack) |
| medieval-bridges | 3/3 | ✓ | ✓ | no | atlas-build/regional.py | 258 | medieval-sites.pmtiles | integrated |
| merimee | 1/1 | ✓ | ✓ | no | atlas-build/regional.py | 9875 | medieval-sites.pmtiles | integrated |
| nordic-spatial-humanities | 1/1 | ✓ | ✓ | no | atlas-build/regional.py | 764 | medieval-sites.pmtiles | integrated |
| norway-kulturminner | 5/5 | ✓ | ✓ | no | atlas-build/regional.py | 8941 | medieval-sites.pmtiles | integrated |
| pase | 0/0 | — | ✗ | no | — | — | — | metadata only |
| periodo | 1/1 | ✓ | ✓ | no | — | — | — | raw only |
| pleiades | 7/7 | ✓ | ✓ | no | atlas-build/build.py, world.py | 34458 | pleiades.pmtiles | integrated |
| princes-townspeople | 18/18 | ✓ | ✓ | no | atlas-build/regional.py | 2390 | hre-towns.pmtiles | integrated |
| ran-romania | 89/89 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 2865 | private-sites.pmtiles | integrated (private data pack) |
| scowl | 0/0 | — | ✗ | no | — | — | — | metadata only |
| sweden-lamningar | 1/1 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 5300 | private-sites.pmtiles | integrated (private data pack) |
| tib-maps-of-power | 56/56 | ✓ | ✓ | yes | atlas-build/regional.py → private data pack | 2809 | private-sites.pmtiles | integrated (private data pack) |
| tribal-hidage | 5/5 | ✓ | ✓ | no | — | — | — | raw only |
| viabundus | 21/21 | ✓ | ✓ | no | atlas-build/world.py | 7488 | viabundus-nodes.pmtiles, viabundus-edges.pmtiles | integrated |
| western-bohemia-toponyms | 5/5 | ✓ | ✓ | no | atlas-build/regional.py | 839 | medieval-sites.pmtiles | integrated |
| wikidata-medieval | 26/26 | ✓ | ✓ | no | atlas-build/sites.py | 77836 | medieval-sites.pmtiles | integrated |

<!-- VAULT:END -->

Raw only, and why:
- **CShapes:** used for counting only.
- **Historic England:**
  - Listed buildings are mostly post-medieval.
  - Scheduled monuments are the next step for England.
- **Living with Machines:** 19th-century.
- **PeriodO:** a reference for period names.
- **Tribal Hidage:** early Anglo-Saxon polygons not yet drawn.
- **Engel's Hungary:** encrypted inside a Windows program (R.5).
- **DARMC ancient ports:** mostly ancient.
- **Atlas Fontium's other layers:** now drawn from the private file.

Metadata only: GB1900 (not to be downloaded, at the owner's request), KEPN,
PASE and SCOWL.

---

<!-- MATRICES:START (generated by scripts/historical-data/coverage.py) -->

### E. Regional coverage matrix

Cell = how many of the 8 themes (Settlements, Political, Religion, Military, Roads, Economy, Landscape, Events) are at least moderate in that region and period (thresholds as in `HISTORICAL_COVERAGE_MEASURED.md`); then the themes that are weak or absent in 1200–1399.

| Region | 500–799 | 800–999 | 1000–1199 | 1200–1399 | 1400–1500 | Weak or absent, 1200–1399 |
| --- | --- | --- | --- | --- | --- | --- |
| British Isles | 4/8 | 5/8 | 6/8 | 6/8 | 5/8 | Economy, Landscape |
| France | 7/8 | 4/8 | 5/8 | 6/8 | 6/8 | Economy, Landscape |
| Low Countries | 2/8 | 2/8 | 2/8 | 6/8 | 6/8 | Landscape, Events |
| Germany | 4/8 | 4/8 | 4/8 | 6/8 | 6/8 | Landscape, Events |
| Austria | 1/8 | 0/8 | 2/8 | 3/8 | 3/8 | Political, Roads, Economy, Landscape, Events |
| Switzerland | 1/8 | 0/8 | 2/8 | 4/8 | 4/8 | Roads, Economy, Landscape, Events |
| Italy & Malta | 6/8 | 4/8 | 4/8 | 6/8 | 5/8 | Economy, Landscape |
| Iberia | 5/8 | 5/8 | 5/8 | 6/8 | 5/8 | Economy, Landscape |
| Scandinavia | 3/8 | 2/8 | 5/8 | 6/8 | 5/8 | Landscape, Events |
| Finland & Iceland | 2/8 | 2/8 | 3/8 | 4/8 | 4/8 | Political, Economy, Landscape, Events |
| Poland | 1/8 | 0/8 | 2/8 | 6/8 | 6/8 | Landscape, Events |
| Czechia | 0/8 | 0/8 | 2/8 | 5/8 | 6/8 | Economy, Landscape, Events |
| Slovakia | 0/8 | 0/8 | 0/8 | 2/8 | 2/8 | Political, Religion, Roads, Economy, Landscape, Events |
| Hungary | 1/8 | 0/8 | 0/8 | 1/8 | 1/8 | Political, Religion, Military, Roads, Economy, Landscape, Events |
| Western Balkans | 6/8 | 1/8 | 2/8 | 4/8 | 4/8 | Roads, Economy, Landscape, Events |
| Bulgaria | 2/8 | 0/8 | 0/8 | 0/8 | 0/8 | Settlements, Political, Religion, Military, Roads, Economy, Landscape, Events |
| Romania & Moldova | 3/8 | 0/8 | 1/8 | 1/8 | 1/8 | Political, Religion, Military, Roads, Economy, Landscape, Events |
| Greece | 5/8 | 1/8 | 1/8 | 3/8 | 3/8 | Settlements, Roads, Economy, Landscape, Events |
| Baltic | 0/8 | 0/8 | 0/8 | 4/8 | 3/8 | Religion, Economy, Landscape, Events |
| Belarus | 0/8 | 0/8 | 1/8 | 3/8 | 2/8 | Religion, Military, Economy, Landscape, Events |
| Ukraine | 0/8 | 0/8 | 2/8 | 2/8 | 1/8 | Religion, Military, Roads, Economy, Landscape, Events |
| Western Russia | 2/8 | 1/8 | 2/8 | 5/8 | 5/8 | Economy, Landscape, Events |
| Anatolia | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 | Settlements, Political, Religion, Military, Roads, Economy, Landscape, Events |

#### E.2 With your private data file loaded

The same measure counting the private data pack as well (datasets used privately, not republished).

| Region | 500–799 | 800–999 | 1000–1199 | 1200–1399 | 1400–1500 | Weak or absent, 1200–1399 |
| --- | --- | --- | --- | --- | --- | --- |
| British Isles | 4/8 | 5/8 | 6/8 | 6/8 | 5/8 | Economy, Landscape |
| France | 7/8 | 5/8 | 5/8 | 6/8 | 6/8 | Economy, Landscape |
| Low Countries | 2/8 | 3/8 | 2/8 | 6/8 | 6/8 | Landscape, Events |
| Germany | 4/8 | 5/8 | 4/8 | 6/8 | 6/8 | Landscape, Events |
| Austria | 1/8 | 0/8 | 2/8 | 3/8 | 3/8 | Political, Roads, Economy, Landscape, Events |
| Switzerland | 1/8 | 0/8 | 2/8 | 4/8 | 4/8 | Roads, Economy, Landscape, Events |
| Italy & Malta | 7/8 | 4/8 | 4/8 | 6/8 | 5/8 | Economy, Landscape |
| Iberia | 5/8 | 5/8 | 5/8 | 6/8 | 5/8 | Economy, Landscape |
| Scandinavia | 3/8 | 2/8 | 6/8 | 6/8 | 5/8 | Landscape, Events |
| Finland & Iceland | 2/8 | 2/8 | 3/8 | 4/8 | 4/8 | Political, Economy, Landscape, Events |
| Poland | 1/8 | 0/8 | 2/8 | 6/8 | 6/8 | Landscape, Events |
| Czechia | 0/8 | 0/8 | 2/8 | 5/8 | 6/8 | Economy, Landscape, Events |
| Slovakia | 0/8 | 0/8 | 0/8 | 3/8 | 3/8 | Political, Roads, Economy, Landscape, Events |
| Hungary | 1/8 | 0/8 | 0/8 | 2/8 | 2/8 | Political, Religion, Roads, Economy, Landscape, Events |
| Western Balkans | 6/8 | 2/8 | 4/8 | 4/8 | 4/8 | Roads, Economy, Landscape, Events |
| Bulgaria | 2/8 | 0/8 | 0/8 | 0/8 | 0/8 | Settlements, Political, Religion, Military, Roads, Economy, Landscape, Events |
| Romania & Moldova | 4/8 | 1/8 | 3/8 | 3/8 | 3/8 | Political, Roads, Economy, Landscape, Events |
| Greece | 5/8 | 4/8 | 3/8 | 4/8 | 4/8 | Roads, Economy, Landscape, Events |
| Baltic | 0/8 | 0/8 | 0/8 | 4/8 | 3/8 | Religion, Economy, Landscape, Events |
| Belarus | 0/8 | 0/8 | 1/8 | 3/8 | 2/8 | Religion, Military, Economy, Landscape, Events |
| Ukraine | 0/8 | 0/8 | 2/8 | 2/8 | 1/8 | Religion, Military, Roads, Economy, Landscape, Events |
| Western Russia | 2/8 | 1/8 | 2/8 | 5/8 | 5/8 | Economy, Landscape, Events |
| Anatolia | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 | Settlements, Political, Religion, Military, Roads, Economy, Landscape, Events |

### F. Thematic coverage matrix

Cell = how many of the 23 regions have the theme at least moderate in that period.

| Theme | 500–799 | 800–999 | 1000–1199 | 1200–1399 | 1400–1500 |
| --- | --- | --- | --- | --- | --- |
| Settlements | 13/23 | 8/23 | 13/23 | 20/23 | 20/23 |
| Political | 13/23 | 7/23 | 10/23 | 16/23 | 11/23 |
| Religion | 7/23 | 7/23 | 12/23 | 15/23 | 15/23 |
| Military | 10/23 | 6/23 | 10/23 | 17/23 | 17/23 |
| Roads | 5/23 | 0/23 | 2/23 | 13/23 | 13/23 |
| Economy | 3/23 | 1/23 | 2/23 | 4/23 | 4/23 |
| Landscape | 4/23 | 0/23 | 0/23 | 0/23 | 0/23 |
| Events | 0/23 | 2/23 | 2/23 | 4/23 | 3/23 |
| Names | 11/23 | 9/23 | 16/23 | 21/23 | 22/23 |

#### F.2 With your private data file loaded

| Theme | 500–799 | 800–999 | 1000–1199 | 1200–1399 | 1400–1500 |
| --- | --- | --- | --- | --- | --- |
| Settlements | 14/23 | 10/23 | 15/23 | 21/23 | 21/23 |
| Political | 13/23 | 7/23 | 10/23 | 16/23 | 11/23 |
| Religion | 7/23 | 9/23 | 14/23 | 17/23 | 17/23 |
| Military | 10/23 | 7/23 | 12/23 | 19/23 | 19/23 |
| Roads | 5/23 | 0/23 | 3/23 | 13/23 | 13/23 |
| Economy | 4/23 | 4/23 | 2/23 | 4/23 | 4/23 |
| Landscape | 4/23 | 0/23 | 0/23 | 0/23 | 0/23 |
| Events | 0/23 | 2/23 | 2/23 | 4/23 | 3/23 |
| Names | 11/23 | 10/23 | 16/23 | 21/23 | 22/23 |

### G. Temporal coverage matrix

Records counted per period across all regions (a record spanning several periods counts in each; Political counts polities).

| Theme | 500–799 | 800–999 | 1000–1199 | 1200–1399 | 1400–1500 |
| --- | --- | --- | --- | --- | --- |
| Settlements | 5932 | 4862 | 10584 | 25408 | 31884 |
| Political | 397 | 152 | 196 | 874 | 631 |
| Religion | 1452 | 1625 | 10417 | 16117 | 18386 |
| Military | 1595 | 939 | 2763 | 6508 | 8030 |
| Roads | 1692 | 112 | 225 | 21972 | 22429 |
| Economy | 394 | 370 | 1075 | 1598 | 1944 |
| Landscape | 673 | 54 | 53 | 52 | 53 |
| Events | 161 | 188 | 341 | 623 | 476 |
| Names | 3123 | 2449 | 8008 | 21735 | 28419 |

#### G.2 With your private data file loaded

| Theme | 500–799 | 800–999 | 1000–1199 | 1200–1399 | 1400–1500 |
| --- | --- | --- | --- | --- | --- |
| Settlements | 9598 | 11381 | 29318 | 50345 | 57391 |
| Political | 397 | 152 | 196 | 874 | 631 |
| Religion | 1514 | 1940 | 12985 | 19817 | 22419 |
| Military | 1790 | 1635 | 6740 | 16164 | 18869 |
| Roads | 1712 | 150 | 450 | 22238 | 22688 |
| Economy | 972 | 1350 | 2841 | 4051 | 3726 |
| Landscape | 673 | 54 | 53 | 52 | 53 |
| Events | 161 | 188 | 341 | 623 | 476 |
| Names | 4273 | 7068 | 23962 | 46177 | 54455 |

Included above but only approximate: 22585 records dated only by an evidence period (shown lighter, inside that period). Not counted at all: 64493 records with no dates (hidden at a date unless the reader includes undated records).

<!-- MATRICES:END -->

**England against the rest.** Before the first pass, the medieval layers were
England-only:
- Domesday
- the Gough Map
- inland navigation
- bridges
- rural settlement

These are drawn from tiles and are not counted above. With them, England has:
- roads (the Gough Map)
- rivers (inland navigation)
- administrative units (Domesday)
- bridges
- markets (local)

No other country has all of these. On the place-record themes, the British
Isles now sits with France, Germany and Italy. For roads, economy and landscape
it is still far ahead of everywhere except the Viabundus area.

**The app check** (Playwright, S21 viewport, the built app; the dates and
regions of the brief, at zoom 6, plus zoom 9 at Nuremberg 1300, Lyon 1300,
Sofia 1400 and Buda 1450) found three things:

1. **Towns of the Empire drawn before their recorded start.** Three at 1200
   (Eisenach, Friedberg, Niedenstein). Cause: the first-mention year was used
   even when a charter was earlier. Fixed by rule (B.3) and tested for every
   town.
2. **A castle at 3000 BCE in Italy.** Cause: a record with only an end date was
   treated as existing at every earlier date. Fixed by rule (B.3) for the map
   and the place lookup, and tested.
3. **"Duplicate labels"** (Germany 1300) were a false alarm. The check counted
   labels that MapLibre had hidden by collision. The screenshot shows none.

What the maps show: Scandinavia at 1000 has 2 cities and nothing medieval, and
Anatolia at 1300 has 5 cities. The matrices above say the same.

---

## H. Remaining gaps (measured, 1200–1399 unless stated)

Two figures are given where they differ: public app → with your private data
file (see R.4 and E.2).

**Regions** (counts are settlements / religion / military records):
- **Hungary: 71 / 18 / 10 → 71 / 18 / 73.**
  - EBIDAT adds 74 Hungarian castles.
  - Settlements and religion stay weak: Engel's atlas is encrypted (R.5).
- **Bulgaria: 23 / 25 / 23.** TIB adds a few places. No national register
  with a bulk route exists.
- **Anatolia: 5 / 4 / 15.** Almost empty after 1000.
  - No open Byzantine or Seljuk gazetteer with coordinates.
  - TAY (Anatolia) is blocked here and mostly prehistoric.
- **Romania: improved with private data.** RAN gives 856 settlement records
  for 1000–1199 (was 74) and 128 military records for 1200–1399 (was 17).
  Political units remain absent.
- **Greece: 31 / 109 / 69 in public data.** TIB (private) adds Byzantine
  places, for example settlements for 800–999 go from 25 to 139.
- **Western Balkans:** moderate; TIB adds places in the private file.
- **Before 1200, weak in:**
  - Poland, the Baltic, Belarus, Czechia and Slovakia.
  - Scandinavia is no longer weak before 1200 with private data: 6 of 8
    themes at least moderate in 1000–1199, from Norway's register (public)
    and the Danish and Swedish registers (private).

**Themes:**
- **Roads:** medieval roads still exist only in Viabundus (northern Europe
  1350–1650) and England (Gough Map), plus some roads in the Danish and
  Swedish registers.
  - Atlas Fontium's Polish roads (c. 1580) are now drawn from the private
    file.
  - No reconstruction exists as data for France, Italy, Iberia, the Balkans
    or Hungary.
- **Political:** Cliopatria remains the only polity outline source. Below
  kingdom level there are:
  - the Empire's town rulers;
  - Domesday England;
  - Poland's voivodeships and districts c. 1580 (private).
- **Economy:**
  - Markets for the Empire and France (public) and England (private).
  - Coin finds and hoards for Denmark (3,954) and Carolingian Europe (278),
    and dated shipwrecks (483), all private.
  - Mints and mines are still absent.
- **Landscape:** medieval rivers only for England and the Viabundus
  waterways; forests only in 16th-century Poland (private).
- **Events:** battles are covered. Treaties, councils and coronations are
  thin.

**Time:**
- 500–1000 is still the thinnest period. It is helped by:
  - Norway's Viking-age and Merovingian monuments;
  - the Danish, Swedish and Carolingian hoards;
  - TIB's Byzantine places.
- 64,493 public records have no dates at all (mostly castles and
  monasteries). They are hidden at a date unless asked for. EBIDAT dates
  castles of the Empire that Wikidata leaves undated.

---

## I. Next acquisition wave (each tied to a measured gap)

| Gap (measured) | Source | State | Next step |
| --- | --- | --- | --- |
| Hungary, settlements and religion | Engel, *Magyarország a középkor végén* | encrypted program (vault) | Ask the HUN-REN institute for a data export; nothing else covers Hungary c. 1500 |
| Iberia castles and churches | Regional heritage registers (Catalonia, Aragón, Castilla y León) | not downloaded | Acquire; they are the only Iberian source beyond Wikidata |
| Estonia and the Baltic | Estonian heritage register | refuses automated requests (403) | Download by hand in a browser |
| Greece medieval sites | Greek Archaeological Cadastre | web app, per-site data only | Look for the portal's data API; otherwise per-site scraping |
| Low Countries political history | HALC | bot-blocked | Download by hand |
| England (public) | Historic England Scheduled Monuments (OGL); *Where Power Lies* (ADS, CC BY 4.0) | confirmed | Download (ADS needs a manual download) |
| Rulers' itineraries (Empire, Italy) | Regesta Imperii | CC BY 4.0 | A dated events layer |
| Italy population | Malanima (PDF tables) | exists | Transcribe; compare with Buringh |
| France administrative (early modern) | Bailliages 1789; dioceses 1592–1789 | confirmed | Only for early-modern dates |

## J. Tests and validation

`npx vitest run`: **293 tests pass, 0 fail** (17 files).
- The second pass added tests for end-only records, and made the HRE start
  rule strict for every town.
- The recovery pass added `src/atlas/private-data.test.ts`:
  - a pack in the exact file format is read (header, JSON files, tile byte
    ranges);
  - a non-pack file is refused;
  - layers that need private data are unavailable without the pack and switch
    on with it, with no build flag;
  - private tiles are read from the file, never from the website;
  - the public place index holds no record of any private dataset;
  - `public/` holds no private tiles;
  - the pack folder is git-ignored;
  - a pack built by `private_pack.py` opens in the app.

The medieval-Europe tests (`src/atlas/medieval-europe.test.ts`) run against the
built data, not fixtures. They check:
- Coverage exists outside England in every counted region, and sites resolve
  across regions with their own dates.
- **Towns:**
  - English names are never taken from an ancient predecessor or an
    administrative area.
  - An unconfirmed bad position is dropped, not guessed.
  - Population is interpolated between sample years.
  - A town is drawn only while its estimate is above zero.
- **Layers:** they follow the recorded dates.
  - An undated site is hidden unless asked for.
  - A house is not drawn after its dissolution.
  - A site with only an end is not drawn at earlier dates or offered for them.
- **Start-date meaning:**
  - A first mention gives "unattested" before it, and a founding gives "later".
  - A settlement's Wikidata inception is never a founding.
- **Names:**
  - Cyrillic, Greek and Georgian names are romanized with the scheme named, and
    the own-script name is kept.
  - Scripts without a reliable scheme keep their own-script name.
  - An English name always wins.
- **Merges:** no HCED battle repeats a Wikidata battle, and no Buringh town is
  duplicated.
- **Regional datasets:**
  - HRE ruler spans are ordered.
  - No HRE charter is dated before the town's start (all 2,390 towns).
  - Mérimée and Finland are evidence periods, never foundings.
  - Bohemian forms attach to the matching place.
- **Licences:** local-only data never reaches the public place index.

`src/atlas/geography.test.ts` covers resolution against rivals: a first
mention is not an absence, and attested beats unattested.

Also checked: `tsc -b` and the production build; the real-app check (section
E–G); `audit_vault.py` (checksums, leaks into git).

---

## K. Final audit matrix (datasets acquired or next in line)

Every original candidate is in A.1, with its own evidence levels. This matrix
covers the datasets that are in the vault or next in line.

| Dataset | Original candidate? | Investigated | Verified | Quality audited | Licence audited | Acquired | Integrated | Region | Period | Themes | English names | Major limitations | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wikidata sites | yes | ✓ | ✓ | ✓ (B.1) | ✓ CC0 | ✓ | ✓ | Europe, Near East | 300–1650 | settlements, religion, military, bridges, universities | 86% English; rest label or romanized | documentation bias; 16% of castles dated; dissolutions missing | dissolutions pass; Orthodox monasteries |
| Germania Sacra | yes | ✓ | ✓ | ✓ | ✓ CC BY-SA 3.0 | ✓ | ✓ | Holy Roman Empire | 700–1803 | religion | German (no English in source) | diocese polygons undated | — |
| Buringh | yes | ✓ | ✓ | ✓ (B.2) | ✓ CC0 | ✓ | ✓ | Europe | 700–2000 | settlements, economy | 1,450 of 2,237 | 7% bad positions; imputed values | compare Malanima (Italy) |
| HCED | no (found) | ✓ | ✓ | ✓ | ✓ CC0 | ✓ | ✓ | world | to 1600 used | events | English | year only | — |
| Princes and Townspeople | yes (HRE) | ✓ | ✓ | ✓ | ✓ CC0 | ✓ | ✓ | Holy Roman Empire | 800–1806 | settlements, political, economy | 1,391 English | rulers from 1300 only | territory polygons |
| Mérimée | yes (France) | ✓ | ✓ | ✓ | ✓ LO 2.0 | ✓ | ✓ | France | 500–1500 | religion, military, economy | French | century of building only | — |
| Finland register | yes (Scandinavia) | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | Finland | medieval class | religion, military, settlements | Finnish | period class only | — |
| Western Bohemia toponyms | no (found) | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | W Bohemia | to 1500 | names, settlements | Czech | regional | — |
| Bridges to 1250 | yes (England) | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | England | to 1250 | roads, landscape | English | — | — |
| Viabundus | yes | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | N Europe | 1350–1650 | roads, economy, settlements | local names | north only | — |
| Pleiades | yes | ✓ | ✓ | ✓ | ✓ CC BY | ✓ | ✓ | ancient world | to c. 640 | all | English/Latin | late-antique tail thin | — |
| Itiner-e | yes | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | Roman Empire | Roman | roads | — | Roman only | — |
| al-Ṯurayyā | yes | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | Islamic world | 9th–10th c. | settlements, routes | transliterated | atlas period only | — |
| Domesday, Gough, Inland Navigation | yes | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ | England | 1086; c. 1400; to 1348 | political, roads, landscape | English | England only | — |
| Tribal Hidage | yes | ✓ | ✓ | · | ✓ CC BY 4.0 | ✓ | ✗ raw | S Britain | 450–650 | political | English | not drawn | draw polygons |
| Atlas of Rural Settlement | yes | ✓ | ✓ | ✓ | ✓ restricted | ✓ | private file | England | 19th-c. evidence | landscape | English | no republishing | owner decides on the public ZIP |
| TIB Maps of Power | yes (Byzantium) | ✓ | ✓ | ✓ | ✓ not verified | ✓ | private file | Balkans, Greece | 4th–15th c. | settlements, religion, military | multilingual | licence; no Anatolia | ask ÖAW |
| Markets and Fairs to 1516 | yes (England) | ✓ | ✓ | ✓ | ✓ not verified | ✓ | private file | England, Wales | to 1516 | economy | English | licence | ask IHR |
| Atlas Fontium (Poland) | yes | ✓ | ✓ | ✓ | ✓ not verified | ✓ | private file (settlements, parishes, roads, rivers, forests, units) | Crown of Poland | 1550–1600 | settlements, religion, political, roads, landscape | Polish | licence; after 1500 | ask IH PAN; draw districts and roads |
| PeriodO | yes | ✓ | ✓ | ✓ | ✓ CC0 | ✓ | ✗ reference | world | — | periods | English | — | — |
| CShapes 2.0 | no | ✓ | ✓ | ✓ | ✓ NC-SA | ✓ | counting only | world | 1886– | — | English | modern | — |
| Historic England NHLE | yes | ✓ | ✓ | · | ✓ OGL | ✓ | ✗ raw | England | all | monuments | English | mostly post-medieval | scheduled monuments |
| Engel (Hungary) | yes | ✓ | ✓ | · | ✗ not verified | ✓ (installer) | ✗ | Hungary | c. 1500 | all | Hungarian | encrypted database; export has no coordinates | ask the institute for a data export |
| HALC (Low Countries) | yes | ✓ | ✓ | · | ✗ not verified | ✗ | ✗ | Low Countries | medieval | political | Dutch | bot check | owner download |
| DicoTopo | yes | ✓ | ✓ | ✓ | ✓ NC-ND | ✓ | private file | France (53 dép.) | first attestations 500–1900 | settlements, names, religion, military | French (dated old forms kept) | positions are commune centroids | — |
| RAN (Romania) | yes | ✓ | ✓ | ✓ | not verified | ✓ | private file | Romania | 400–1600 | settlements, religion, military | Romanian | broad periods where no century is given | — |
| EBIDAT | yes | ✓ | ✓ | ✓ | not stated | ✓ | private file | Germany, central Europe | castle use | military | German | 13% undated; few castles outside Germany | — |
| Fund og Fortidsminder | yes | ✓ | ✓ | ✓ | not verified | ✓ | private file | Denmark | 700–1536 | settlements, religion, military, economy, roads | English category + Danish type | no names in the source | — |
| Swedish remains | yes | ✓ | ✓ | ✓ | not verified | ✓ | private file | Sweden | periods named in descriptions | settlements, religion, military | Swedish | only 5,300 of 764,974 are dated | — |
| Norwegian register | yes | ✓ | ✓ | ✓ | ✓ NLOD | ✓ | ✓ public | Norway | 400–1537 | settlements, religion, military, landscape | Norwegian (+ English category) | charcoal pits and stray finds excluded | — |
| Nordic Spatial Humanities | yes (Iceland) | ✓ | ✓ | ✓ | ✓ CC BY 4.0 | ✓ | ✓ public | Nordic, Iceland | 870–1600 | religion, settlements, names | local | church attestations mostly Swedish | — |
| DARMC | yes (economy) | ✓ | ✓ | ✓ | not stated | ✓ | private file | Europe, Mediterranean | 1–1500 | economy, settlements | English | selective compilations | — |

---

### A.1 Reconciliation table (generated)

<!-- RECONCILIATION:START (generated by scripts/historical-data/reconciliation.py) -->

All 166 bullets of the original seed list, in their original order. Evidence levels: **F** found · **O** official project located · **D** dataset verified to exist · **A** download/API tested · **M** metadata inspected · **L** licence checked · **Q** quality assessed · **G** geography assessed · **T** time assessed · **N** names assessed · **S** suitable for Shelf · **C** acquired · **I** integrated.

| Totals | F: 166 | O: 163 | D: 157 | A: 102 | M: 87 | L: 84 | Q: 37 | G: 51 | T: 48 | N: 16 | S: 55 | C: 56 | I: 48 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Licence state: not verified 87, confirmed 51, per source (see the rows it points to) 19, explicit restriction 7, n/a (not a dataset) 1, n/a (owner decision) 1.

Recovery pass (89 candidates revisited): not recovered 45, not useful 21, recovered 21, acquired 2. Reasons they had been left: none 33, access 15, reference 14, covered 10, unclear 5, licence 5, bot 4, technical 2, owner 1.


#### Europe-wide / cross-period

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | World Historical Gazetteer (WHG) | ✓ | ✓ | ✓ | not verified: not shown per dataset by WHG; WHG platform terms | yes (reconciliation) | live lookups | Live lookups through Shelf server proxy (token server-side). /api/datasets/ lists 102 public datasets incl. Poland 16c (24,498), Russian towns 14c (282), Old World Trade (4,117); per-dataset export endpoints returned 404. | Request per-dataset exports (poland16c) from contributors; keep live lookups. |  |
| 2 | Cliopatria | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (repo LICENSE, checked in first build) | yes | yes | Only polity-outline source: one outline per period, no claims/vassalage; used for borders and polity names. | Keep; supplement with regional boundary datasets (HRE, Hungary, Poland) where they exist. |  |
| 3 | Pelagios / Linked Places | ✓ | · | · | n/a (not a dataset): format spec (Linked Places) / network — not a dataset | indirect | no | Pelagios is a network and format, not a dataset; Peripleo returned 502 Bad Gateway; the Linked Places repo on GitHub is outside this session scope (403). | None: datasets in LP format (ToposText, WHG) are assessed individually. | not useful (reference) — Pelagios is a network and a data format, not a dataset. |
| 4 | DARE | ✓ | ✓ | ✓ | not verified: CC BY-SA 3.0 (DARE info page, via search; not re-read on site) | low (duplicate) | no | Roman-period gazetteer based on Barrington — same basis as Pleiades/AWMC already integrated. GeoJSON API works per id (imperium.ahlfeldt.se/api/geojson.php?id=…); full dump URL (dare.ht.lu.se/export_pelagios3.ttl.gz) did not respond; Klokan mirror places_subsites.geojson (0.6 MB) reachable. | Cross-check Pleiades coordinates only if a conflict arises; no integration. |  |
| 5 | DARMC | ✓ | ✓ | ✓ | not verified: per dataset: shipwrecks CC0; roads/ports/hoards/Anglo-Saxon settlements: "limited information" — licence not verified | partial | no | Harvard Dataverse holds 12 DARMC datasets (first pass wrongly recorded DARMC as unreachable). Medieval-relevant: Carolingian coin hoards 751–987 (Coupland 2013), rural Anglo-Saxon settlements (Keil & Hamerow 2014), shipwrecks AD 1–1500. Roman road network 2008 is superseded by Itiner-e (2024). | Acquire hoards + Anglo-Saxon settlements as local-only (licence not verified); shipwrecks (CC0). |  |
| 6 | PastPlace | · | · | · | not verified: — | unknown | no | pastplace.org and visionofbritain.org.uk did not respond (no HTTP response, twice). | Retry later; otherwise GB-only (Vision of Britain) and owner excluded GB1900. | not recovered (access) — pastplace.org and visionofbritain.org.uk still do not respond; GB only and mostly 19th-c. |
| 7 | GeoNames | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (readme.txt at download.geonames.org) | yes (names) | no | Modern gazetteer; value for Shelf is alternateNamesV2 (English/exonym names with language codes) to fill English names where Wikidata lacks them. Not historical. | Acquire alternateNames for European countries; use only for modern English exonyms, never as historical names. |  |
| 8 | Wikidata | ✓ | ✓ | ✓ | confirmed: CC0 | yes, as enrichment | yes | Snapshot of 118,500 items (sites + towns) via QLever. Audited in this pass: see Wikidata quality section — not a substitute for Germania Sacra, Buringh, Viabundus or Pleiades. | Treat as cross-linking/enrichment; prefer specialised sources where present. |  |
| 9 | Getty Thesaurus of Geographic Names (TGN) | ✓ | ✓ | ✓ | not verified: ODC-By 1.0 (Getty docs, earlier audit) | reference | no | SPARQL endpoint and full.zip dump both returned 403 from this environment. | Reach through WHG (which reconciles to TGN). |  |
| 10 | OpenHistoricalMap | ✓ | ✓ | ✓ | confirmed: CC0 | partial | yes (live) | Live vector tiles; dated features only; sparse before 1500. Labels fixed to English/Latin script in an earlier pass. | Keep live. |  |
| 11 | PeriodO | ✓ | ✓ | ✓ | confirmed: CC0 | reference | no (raw only) | Period definitions (7.8 MB). Held raw; not used by the app. | Use to label periods per region in the UI (e.g. what "Late Antique" means for Iberia). |  |
| 12 | Europeana | ✓ | ✓ | ✓ | per source (see the rows it points to): API terms; items carry per-record rights | low | no | Cultural-heritage object aggregator (API works with demo key; 3,152 hits for Cluny). Objects, not geography. | None for geography. |  |
| 13 | ARIADNEplus | ✓ | ✓ | · | per source (see the rows it points to): per contributing dataset | low | no | Aggregator portal of archaeological datasets (portal 200; /api/search gave no response). Useful only for discovering national datasets. | Use for discovery of Balkan/Eastern archaeological inventories. | not useful (reference) — ARIADNE is an aggregator; the national registers it points to were pursued directly (RAN, Denmark, Norway, Sweden). |
| 14 | ADS | ✓ | ✓ | ✓ | per source (see the rows it points to): ADS terms; per collection CC BY 4.0 | yes | yes (4 datasets) | Source of Domesday, Gough, inland navigation, bridges, Tribal Hidage; also holds Where Power Lies, Mapping the Medieval Townscape, Whittlewood, MSRG reports (see those rows). | Acquire the England datasets listed under 44–51 that have GIS. |  |
| 15 | iDAI.gazetteer | ✓ | ✓ | ✓ | not verified: not verified | low | no | search.json API works (Roma → 36 hits). Mostly Mediterranean archaeology; overlaps Pleiades. | None. |  |
| 16 | iDAI.objects | ✓ | · | · | not verified: not verified | no | no | Arachne object database behind an Anubis bot check. Objects, not places. | None. | not useful (bot) — Museum objects, not places; behind an Anubis bot check. |

#### Ancient / Roman / Late Antique

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | Pleiades | ✓ | ✓ | ✓ | confirmed: CC BY 3.0 | yes | yes | Core ancient gazetteer (34,458 records); late-antique tail reaches 640. | Keep. |  |
| 18 | Itiner-e | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | yes | yes | Roman roads (2024, high resolution). | Keep. |  |
| 19 | al-Ṯurayyā | ✓ | ✓ | ✓ | confirmed: Apache-2.0 (after Cornu) | yes | yes | Early Islamic world places and routes (9th–10th c.), incl. al-Andalus. | Keep. |  |
| 20 | Nomisma | ✓ | ✓ | · | not verified: not verified (site behind bot check) | specialized | no | Numismatic concepts and mints (TTL 19.8 MB reachable earlier); mints are a medieval economy signal but Nomisma is overwhelmingly ancient. | Revisit for mints only if a medieval mint dataset is not found. | not recovered (unclear) — Nomisma mints are overwhelmingly ancient; medieval economy came instead from dated coin hoards (Denmark, Carolingian hoards). |
| 21 | ToposText | ✓ | ✓ | ✓ | not verified: attribution requested; no formal licence stated on the downloads page — licence not verified | low (ancient) | no | GeoJSON of places (5.6 MB, 2025-11-20) with text citations; ancient Greek world; overlaps Pleiades. | Optional: link out from Pleiades places. |  |
| 22 | Trismegistos Places | · | · | · | not verified: — | unknown | no | trismegistos.org returned 403 / no response. | None (Egypt-centred ancient places). | not useful (access) — Egypt-centred ancient places; server refuses requests (403). |
| 23 | Trismegistos Texts | · | · | · | not verified: — | no | no | Texts database; not geography. | None. | not useful (reference) — Texts database, not geography. |
| 24 | Vici.org | ✓ | ✓ | · | not verified: CC0 metadata / CC BY-SA text (about page, via search) | low (ancient) | no | Roman archaeological sites; no working bulk export found (data.php and /api/ 404). | None. | not useful (access) — Roman sites without a bulk export; Pleiades and Itiner-e already cover them. |
| 25 | EDH | ✓ | ✓ | ✓ | confirmed: CC BY-SA 4.0 (GitHub mirror README read) | low (ancient) | no | Latin inscriptions with find-spot geography (GeoJSON dump, daily). Roman epigraphy; not medieval. | None for medieval scope. |  |
| 26 | EDCS | ✓ | · | · | not verified: — | no | no | No download; search interface only. | None. | not useful (reference) — Epigraphic search interface; no geodata export. |
| 27 | EDR | ✓ | · | · | not verified: — | no | no | Italian inscriptions; no bulk geodata found. | None. | not useful (reference) — Epigraphic database; no bulk geodata. |
| 28 | EAGLE | ✓ | · | · | not verified: — | no | no | Network of epigraphic databases (resources page 200); no geodata of its own. | None. | not useful (reference) — Network of epigraphic databases; no geodata of its own. |
| 29 | ORBIS | ✓ | ✓ | · | not verified: see project | low | no | Modelled network c. 200 CE; API 403; D3 version on GitHub. | None (model, not attested routes). | not useful (reference) — A modelled route network c. 200 CE, not attested routes. |
| 30 | AWMC | ✓ | ✓ | ✓ | confirmed: ODbL | yes | yes | Roads, shorelines, inland water for the ancient world. | Keep. |  |
| 31 | AWMC/Pleiades GIS resources | ✓ | ✓ | ✓ | confirmed: CC BY / ODbL | yes | yes | Pleiades GIS exports and AWMC Barrington-derived layers — both integrated. | Keep. |  |
| 32 | Pelagios Digital Map of the Roman Empire | ✓ | ✓ | ✓ | confirmed: CC BY-SA 3.0 | duplicate | no | "Pelagios Digital Map of the Roman Empire" is DARE (see row 3). | See DARE. |  |
| 33 | Roman Roads Research Association resources | ✓ | ✓ | · | not verified: not verified | low | no | Roads of Roman Britain project gazetteer page (200); maps, no open GIS download found. | None; Itiner-e covers Roman Britain. | not useful (none) — Maps and articles only; Roman Britain roads are in Itiner-e. |
| 34 | Roman Roads in Britain | ✓ | · | · | not verified: — | covered | no | Roman roads of Britain are in Itiner-e (integrated) and AWMC. | None. | not useful (covered) — Roman roads of Britain are in Itiner-e (integrated). |
| 35 | Tabula Peutingeriana digital projects | ✓ | ✓ | · | not verified: not verified | low | no | tabula-peutingeriana.de has per-segment pages; no bulk data; OmnesViae is a planner built on it with no public data endpoint (404). | None; Itiner-e covers attested roads. | not useful (none) — Per-segment web pages, no bulk data; attested Roman roads are in Itiner-e. |
| 36 | ancient itinerary datasets / OmnesViae | ✓ | ✓ | · | not verified: not verified | low | no | OmnesViae (Roman route planner, 200); no data API. | None. | not useful (reference) — Route planner without a data endpoint. |
| 37 | Barrington Atlas-derived digital resources where legally and technically usable | ✓ | ✓ | ✓ | confirmed: ODbL (AWMC) | yes | yes | AWMC/Pleiades are the legal Barrington-derived resources — integrated. | Keep. |  |

#### Medieval England / Britain

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 38 | Viabundus | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | yes | yes | Northern Europe 1350–1650 towns, roads, waterways, tolls, fairs — the strongest medieval route dataset Shelf has. | Keep. |  |
| 39 | GB1900 | ✓ | ✓ | · | n/a (owner decision): owner decision | — | no | Skipped at the owner's request (1900 names; not medieval). | None. | not recovered (owner) — Skipped at the owner's request (1900 names). |
| 40 | Key to English Place-Names | ✓ | ✓ | ✓ | not verified: online only; no bulk download (earlier audit) | yes (names) | link-out | Key to English Place-Names: dated early spellings per English place; no bulk export. | Live link-out per place. |  |
| 41 | PASE | ✓ | ✓ | · | explicit restriction: individual non-commercial use only; copying prohibited | people, not places | no | PASE records people; terms forbid copying. | Link-out only. | not useful (licence) — PASE records people, not places; its terms forbid copying. Link-out only. |
| 42 | Domesday geographical resources | ✓ | ✓ | ✓ | explicit restriction: Hull Domesday data CC BY-NC-SA (Open Domesday about page, via search; not re-read) | yes | no | Open Domesday: per-place Domesday entries with coordinates (API documented at opendomesday.org/api/; the example place URL returned 404 today, so the API is not confirmed working). | Retry the API; if working, acquire places (England 1086: ~13,400 places) for local use (NC licence). | not recovered (licence) — Open Domesday (non-commercial) would add per-manor detail, but Domesday England is already mapped (shires, hundreds); low marginal value. |
| 43 | Domesday shires/hundreds | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | yes | yes | Domesday shires/hundreds (Brookes 2020). | Keep. |  |
| 44 | Beyond the Tribal Hidage | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | partial | no (raw only) | Burial census 450–650 (sites with coordinates); no kingdom polygons. | Could become an early-medieval burial-sites layer; low priority. |  |
| 45 | Mapping Medieval Countryside / IPM | ✓ | ✓ | ✓ | confirmed: Creative Commons Attribution (KDL CKAN page) | partial | no | IPM calendar TEI-XML vols 18–26 (1399–1447) and an EATS entity file; no coordinates stated — places are names in texts. | Check eats_entities for place identifiers; otherwise text-only (people/land tenure), not a map layer. |  |
| 46 | Mapping Medieval Townscapes | ✓ | ✓ | · | not verified: ADS terms (page blocked by bot check today) | specialized | no | Mapping the Medieval Townscape: GIS of Edward I's 13 new towns in England and Wales (1277–1303): streets, plots, castles, markets. | Owner could download from ADS by hand (automated access blocked); town-plan detail at high zoom. | not recovered (bot) — ADS blocks automated downloads; the owner can download the 13 new towns of Edward I by hand. Town-plan detail only. |
| 47 | Whittlewood | ✓ | ✓ | · | confirmed: ADS Terms of Use and Access (copyright Dyer, Jones, Page) | specialized | no | Whittlewood: detailed GIS for a group of Midland parishes (nucleated vs dispersed settlement) — very local. | Low priority: too local for Shelf's map. | not useful (none) — A handful of Midland parishes — too local for the atlas. |
| 48 | Atlas of Rural Settlement | ✓ | ✓ | ✓ | explicit restriction: Historic England: personal and business use, no republishing | yes (England) | local builds only | Atlas of Rural Settlement: provinces, sub-provinces, local regions and nucleations — characterisation, not a dated map. | Keep local-only. |  |
| 49 | Where Power Lies | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (ADS metadata page read) | yes (England 800–1200) | no | Where Power Lies (Newcastle 2022–24): elite centres c. 800–1200, 24 GIS objects + 1 CSV; first-pass never looked. | Owner downloads the ADS ZIPs by hand (ADS blocks automated access); then integrate as a lordly-centres layer. |  |
| 50 | Medieval Settlement Research Group resources | ✓ | ✓ | · | confirmed: ADS terms | low | no | MSRG annual reports are on ADS; the classic deserted-medieval-village gazetteers (1968/1977/1988 lists, 3,199 sites) exist as publications and an archive at Historic England, not as an open dataset. | Deserted villages for England come through Historic England's scheduled monuments (below). | not recovered (none) — The deserted-village gazetteers are publications and an archive, not open data. |
| 51 | English Medieval Towns resources | ✓ | ✓ | ✓ | not verified: licence unspecified on SAS-Space ("UNSPECIFIED") | yes (economy) | no | Letters, Gazetteer of Markets and Fairs in England and Wales to 1516: 2,254 English and 141 Welsh places, 2,604 markets, 2,934 fairs with OS grid refs, grant year, first record, type, borough, mint, 1334 valuation. MFEngland.txt downloaded and read (5,235 rows). Bogart/Satchell town datasets are c. 1563–1911 (early modern). | Acquire (local-only: licence unspecified) and integrate as markets & fairs layer for England/Wales. |  |
| 52 | Historic Towns Atlas resources | ✓ | ✓ | · | not verified: see Trust site | low | no | British Historic Towns Atlas volumes are free PDF maps, not GIS. | None (maps, not data). | not useful (reference) — PDF town maps, not GIS. |
| 53 | Gough Map GIS | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | yes | yes | Gough Map GIS. | Keep. |  |
| 54 | Inland Navigation in England/Wales before 1348 | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | yes | yes | Inland navigation before 1348. | Keep. |  |
| 55 | Bridges of Medieval England to c.1250 | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | yes | no (raw only) | Bridges to c.1250 downloaded in the first vault pass but NOT integrated — the first report glossed over this. | Integrate as a bridges/fords layer (England). |  |
| 56 | Historic England datasets | ✓ | ✓ | ✓ | confirmed: OGL v3 (HE open data hub; data.gov.uk) | yes | no | Battlefields, parks, wrecks, World Heritage gpkgs in the vault, NOT integrated; the more useful Scheduled Monuments (~20,000, incl. castles, abbeys, deserted villages; OGL) was not downloaded. | Download Scheduled Monuments; integrate battlefields and monuments. |  |
| 57 | Living with Machines datasets | ✓ | ✓ | ✓ | per source (see the rows it points to): per dataset (CC BY / ODbL) | no (1850–1900 OS maps) | no | Living with Machines: 19th-century map annotations; 5.1 GB in the vault; not medieval. | Keep raw; not a medieval source. |  |

#### France

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 58 | French historical gazetteers | ✓ | ✓ | ✓ | explicit restriction: DicoTopo CC BY-NC-ND 3.0 FR (GitHub chartes/dico-topo); API terms same | yes (names) | no | DicoTopo JSON:API works (old name forms with dates, INSEE code, coordinates) — the best French historical-name source. ND forbids distributing transformed data. | Use as live per-place lookup in the app (no copy), or private local copy unmodified. | recovered (licence): dicotopo — DicoTopo (CC BY-NC-ND): bulk XML from the project repository — 22,366 communes with dated first attestation and 6,774 dated castles, churches and religious houses; private use only. |
| 59 | medieval French settlement datasets | ✓ | ✓ | ✓ | not verified: CC BY 3.0 FR (Cassini-EHESS, via search: didomena record 6395wb092; not re-read on site — page returns 403 to automation) | yes | no | "Des chefs-lieux de Cassini aux communes de France (1756–1999)": geolocated cities, towns, villages and abbeys on the Cassini map (c. 1756–89) — the only France-wide settlement layer with historical names found. No open France-wide *medieval* settlement dataset found (regional: IMAGE Grand-Est, BDA, Franche-Comté deserted sites — not downloadable in bulk). | Owner-assisted download from didomena (bot-blocked) or Dataverse mirror; integrate as "France c. 1760 (Cassini)" layer with its own date. |  |
| 60 | Cassini-derived historical geography where appropriate | ✓ | ✓ | ✓ | confirmed: CC0 (Dataverse 28674 licence field); CC0 (sheet 52 reconstruction XP8J6P) | yes (early modern) | no | Perret et al. "18th century Cassini roads and cities" — France-wide road graph (edges/nodes) and cities from the Cassini map; plus a full GIS reconstruction of one sheet (No. 52). 18th-century, not medieval. | Acquire; show only for c. 1700–1815 and say so; use as the France road network for early-modern dates. |  |
| 61 | medieval French administrative boundaries | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Dataverse T8UXHK licence field) | yes (1789) | no | Gay, Gobbi & Goni (2024): bailliages and sénéchaussées of 1789 after Brette (1904), shapefiles + points + tables. Late Ancien Régime, not medieval; the only open France-wide jurisdiction polygons found. No open medieval French county/duchy polygons found. | Acquire; show 1770–1790 only. |  |
| 62 | French historical town/city datasets | ✓ | ✓ | ✓ | confirmed: Mérimée: Licence Ouverte 2.0 (data.gouv.fr) | partial | no | No France-wide medieval town dataset found beyond Buringh (324 French towns 1300) and Cassini chefs-lieux; Atlas historique des villes de France is published maps. | Rely on Buringh + Cassini; revisit bastides/villes neuves datasets. | recovered (none): dicotopo — No France-wide medieval town dataset exists, but DicoTopo now gives 22,366 French communes their first dated attestation (private data). |
| 63 | diocesan and ecclesiastical geography | ✓ | ✓ | ✓ | not verified: CC BY-SA (TheoBurnel/dioc-ses README); Ménestrel: not verified | partial | no | Latin dioceses 1592–1789 GeoJSON (27 MB; seats georeferenced; sources: Wikipedia, Tihon, EarthWorks) — early modern, compiled; Ménestrel lists shapefiles (licence not verified). Germania Sacra covers only the Empire. | Acquire dioc-ses (label 1592–1789, compiled from secondary sources); check Ménestrel licence. |  |
| 64 | castles and fortifications | ✓ | ✓ | ✓ | confirmed: Licence Ouverte 2.0 (data.gouv.fr, Ministère de la Culture) | yes | no | Mérimée "Immeubles protégés MH": ~46k protected buildings with type (château, abbaye, église, halle…), century of main construction campaign, WGS84 coordinates — a dedicated national register, not in Wikidata form. Also "Châteaux de France — recensement consolidé" (ODbL; 10,602; merges Wikidata+Mérimée+OSM — derivative, lower value). | Acquire Mérimée CSV (100 MB, not committed); integrate castles/abbeys/churches/halls with century dating as construction-century (not founding). |  |
| 65 | medieval roads and routes | ✓ | ✓ | ✓ | not verified: CC0 (Cassini roads, Dataverse 28674); Atlas de la Révolution routes de poste 1792 on Nakala: licence not verified | partial | no | No open medieval French road dataset found. Earliest France-wide road networks are Cassini (c. 1760) and routes de poste 1792; Viabundus reaches only NE France. | Use Cassini roads for 1700–1815; document the medieval gap. |  |
| 66 | French archaeological gazetteers | ✓ | ✓ | ✓ | explicit restriction: various; mostly not open | low | no | Patriarche (national archaeological map) is not public; Inrap excavation points (Île-de-France only); BDA (Huma-Num) queryable, bulk licence not verified. | None now. | recovered (licence): dicotopo — Patriarche is not public. DicoTopo (non-commercial, no derivatives — private use) adds 6,774 dated castles, churches and religious houses located by commune. |
| 67 | French historic maps with usable GIS/georeferencing | ✓ | ✓ | · | not verified: IGN/Géoportail WMTS (Cassini, État-major) — licence not verified here | maps | no | Georeferenced Cassini map tiles exist (Géoportail, EHESS); these are maps, not data. | Could be added as a historical base-map overlay (early modern). | not useful (reference) — Georeferenced map tiles, not data. |
| 68 | regional medieval settlement datasets | ✓ | ✓ | ✓ | per source (see the rows it points to): various | low | no | Regional datasets found: IMAGE (Grand-Est medieval sites, database), Franche-Comté abandoned settlements (PDF study), Paris archaeological reference; none bulk-downloadable with a verified licence. | None now. | recovered (none): dicotopo — Regional datasets are PDFs or databases without export; DicoTopo covers 53 départements with dated name forms (private data). |

#### Holy Roman Empire / Germany / Central Europe

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 69 | German historical gazetteers | ✓ | ✓ | ✓ | not verified: GOV: licence not verified (bot check); HOV Sachsen and LAGIS Hessen: free online, no data licence or bulk download found | yes (if accessible) | no | German historical gazetteers exist per Land with dated first mentions: Historisches Ortsverzeichnis von Sachsen (~6,000 places, first mentions with source citations, hov.isgv.de), LAGIS Historisches Ortslexikon Hessen (first mentions, WGS84), GOV (~1.2M, dated administrative membership). None offers a verified bulk download. | Ask ISGV / LAGIS for exports; retry GOV via a browser session. |  |
| 70 | medieval German settlement datasets | ✓ | ✓ | ✓ | confirmed: CC0 (Princes and Townspeople); CC BY-SA 3.0 (Germania Sacra) | yes | no | Princes and Townspeople (Bogucka, Cantoni, Weigand; Harvard Dataverse, 6 parts, all CC0): the ~2,400 towns of the Deutsches Städtebuch with locations, town-charter dates, market-right dates, construction activity and conflict incidents. First pass missed it entirely. Village-level medieval settlement data for Germany exists only per Land (see 68) or via Wikidata first mentions. | Acquire all six parts; integrate towns with charter/market dates. |  |
| 71 | historical Ortsnamen/place-name datasets | ✓ | ✓ | ✓ | not verified: Western Bohemia toponyms: CC BY 4.0 (Zenodo); others not verified | partial | no | Dated historical name forms exist per region: HOV Sachsen and LAGIS Hessen (online only); Western Bohemia toponyms to 1500 (Zenodo 21479034, CSV, 459 KB). No Germany-wide historical Ortsnamen dataset found. | Acquire Western Bohemia; request exports for Saxony/Hesse. |  |
| 72 | medieval HRE political boundaries | ✓ | ✓ | ✓ | confirmed: CC0 (Princes and Townspeople part 2) | yes | no | Princes and Townspeople part 2 "Territorial histories": for each town, the polity and dynasty it belonged to over time (cities_polities 45 MB, cities_dynasties 25 MB, territories_all). This is dated political *control* at town level — no HRE territory polygons, but a far better control record than Cliopatria for the Empire. Euratlas polygons exist but are commercial. | Acquire; attach "belonged to (year range)" to towns and use for political context lookups. |  |
| 73 | duchies, counties, bishoprics, prince-bishoprics | ✓ | ✓ | ✓ | confirmed: CC0 (P&T); CC BY-SA 3.0 (GS dioceses) | partial | no | Duchies/counties/prince-bishoprics as town-level membership (P&T part 2); diocese polygons (Germania Sacra, 67, undated). No open polygons of HRE territories found. | As 71. |  |
| 74 | German medieval town datasets | ✓ | ✓ | ✓ | confirmed: CC0 | yes | no | Princes and Townspeople parts 1 (locations, borders 2019), 3 (town charters), 4 (markets). Buringh has 249 German towns. | Acquire and integrate (see 69). |  |
| 75 | castles and fortifications | ✓ | ✓ | ✓ | not verified: EBIDAT: licence not stated (contact BSB); Burgen am Oberrhein open-data subset (licence not verified) | yes (if licensed) | no | EBIDAT (European Castle Institute): >8,500 castles with dating, function, condition — a specialist source Wikidata does not replace. No bulk download found; the Châteaux rhénans (Upper Rhine) subset is described as open data. | Contact for export; check chateaux-rhenans.eu open data. | recovered (access): ebidat — EBIDAT has no bulk export, but each castle page is public: all castles were snapshotted (dating begin/end, type, function, condition, position) — private data. |
| 76 | medieval roads | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Viabundus) | partial | yes (Viabundus) | Viabundus covers northern Germany (1350–1650). No open dataset of medieval roads for southern Germany found. | Document gap. |  |
| 77 | monasteries and ecclesiastical institutions | ✓ | ✓ | ✓ | confirmed: CC BY-SA 3.0 | yes | yes | Germania Sacra — integrated (7,473 locations; merged with Wikidata for 4,745). | Keep; add GS order-tenure dates to the place history panel. |  |
| 78 | German historical atlases | ✓ | ✓ | · | per source (see the rows it points to): various | maps | no | Geschichtlicher Atlas von Hessen (LAGIS, maps online), Putzger-type atlases — maps, not data. | None. | not useful (reference) — Printed/online historical atlases: maps, not data. |
| 79 | Austrian historical GIS | ✓ | ✓ | ✓ | not verified: HistoGIS: CC BY 4.0 (earlier audit) | partial | live | HistoGIS (ACDH, Vienna): administrative units of the Habsburg lands mostly 19th c.; queried live. No open medieval Austrian GIS found (Historisches Ortslexikon Österreich is published PDFs). | Keep live; document medieval gap. |  |
| 80 | Swiss historical GIS | ✓ | ✓ | ✓ | not verified: opendata.swiss portal (BFS historicised municipality register, from 1848) — licence text not read | low | no | Swiss open data is municipal from 1848; HLS (historical lexicon) is text. No medieval Swiss GIS found. | None. |  |
| 81 | Bohemian/Czech historical geography | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (both Zenodo records) | partial | no | Western Bohemia place names attested to 1500 (Zenodo 21479034); CZ_Retro medieval/early-modern settlement density rasters (Zenodo 3367364, 241 MB, rasters not points); Historický lexikon obcí 1869–2005 (modern). Wikidata has 9,400 Czech settlements with first mentions (largest in Europe). | Acquire Western Bohemia names; CZ_Retro not needed (raster). |  |
| 82 | medieval imperial cities and territories | ✓ | ✓ | ✓ | confirmed: CC0 | yes | no | Imperial cities: P&T territorial histories record imperial status per town and period. | As 71. |  |

#### Italy

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 83 | medieval Italian city datasets | ✓ | ✓ | · | not verified: Malanima: licence not verified (published as PDF tables, CNR database 324) | yes | no | Malanima, Italian Urban Population 1300–1861: >500 Italian towns ≥5,000 inhabitants, per century — a specialist Italian source against which Buringh (394 Italian towns) can be checked. Published as PDF tables, not a machine-readable download. | Transcribe/parse the PDF tables for a cross-check of Buringh in Italy (local use). | not recovered (access) — Malanima's Italian urban population is published as PDF tables; Buringh already has 394 Italian towns. Transcribing would be a cross-check only. |
| 84 | comuni/communes | ✓ | ✓ | · | not verified: — | gap | no | No open GIS of medieval communes found; the 121-city free-commune panel (Law & Econ 2023) is not published as data; modern ISTAT comuni are modern. | Document gap; Cliopatria gives only the largest Italian polities. | not recovered (none) — No GIS of medieval communes exists as data. |
| 85 | city-state geography | ✓ | ✓ | · | not verified: — | gap | no | Same as 83: no open city-state territory polygons found. | Document gap. | not recovered (none) — No city-state territory polygons exist as data. |
| 86 | Papal States | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Cliopatria) | partial | yes (Cliopatria) | Papal States exist as a Cliopatria polity outline; no specialist dataset found. | Keep Cliopatria. |  |
| 87 | Lombard/Frankish/Norman/Sicilian political geography | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Cliopatria) | partial | yes (Cliopatria) | Lombard, Frankish, Norman and Sicilian polities as Cliopatria outlines only; the southern-Italy fiscal GIS (mid-15th c., research paper) is not published. | Document gap. |  |
| 88 | medieval Italian roads | ✓ | ✓ | · | not verified: — | gap | no | Roman roads (Itiner-e) only; Via Francigena "GPX" data are modern walking routes (AEVF), not historical reconstructions — poor fit. No open medieval Italian road network found. | Document gap; do not use modern pilgrim trails as history. | not recovered (none) — No medieval Italian road network exists as data (modern pilgrim trails are not history). |
| 89 | castles | ✓ | ✓ | · | explicit restriction: Tuscany "Atlante dei siti fortificati" (Francovich): not open; Vincoli in Rete: exports possible per search, licence per dataset (some regional layers CC BY 4.0) | partial | no | Regional castle databases exist (Tuscany incastellamento atlas, Romagna/Marche 700 fortified sites) but are not openly downloadable. Vincoli in Rete (MiC) exports protected monuments (csv/kml) — licence per region. | Test Vincoli in Rete export and the MiC Linked Open Data catalogue for monuments with dates. | not recovered (access) — Regional castle atlases are not downloadable; EBIDAT and Wikidata cover what exists. |
| 90 | monasteries | ✓ | ✓ | · | not verified: — | partial | no | No open Italian monastery dataset found (no digital Monasticon Italiae). Wikidata monasteries in Italy: see measured coverage. | Document gap; Wikidata only. | not recovered (none) — No digital Monasticon Italiae. |
| 91 | dioceses | ✓ | ✓ | · | not verified: modern CEI diocese boundaries (d'Apiaggi shapefiles, licence not verified) | low | no | Only present-day diocese boundaries (CEI project, regional shapefiles); no historical Italian diocese GIS found. | Document gap. | not recovered (none) — Only present-day diocese boundaries exist. |
| 92 | ports | ✓ | ✓ | ✓ | confirmed: CC BY 3.0 (Pleiades) / CC BY 4.0 (Viabundus) | partial | no | Ports: Pleiades (ancient), DARMC ancient ports (licence not verified). No medieval Mediterranean port dataset found. | Document gap. |  |
| 93 | historic towns | ✓ | ✓ | ✓ | confirmed: CC0 (Buringh) | partial | yes (Buringh) | Buringh (394 Italian towns); Malanima (PDF). | See 82. |  |
| 94 | archaeological gazetteers | ✓ | ✓ | · | per source (see the rows it points to): per dataset | low | no | Italian archaeological geoportals (ICA repertorio, regional SITAR Rome) — regional, mostly ancient. | None now. | not recovered (reference) — Regional geoportals, mostly ancient, no bulk export. |
| 95 | Italian historical atlases | ✓ | ✓ | · | not verified: — | maps | no | No open data found for Italian historical atlases. | None. | not recovered (none) — No open data behind Italian historical atlases. |
| 96 | regional historical GIS | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Zenodo 22939426) | low (early modern) | no | Early-modern travel-manual geodataset (Scoto, 1650–1700, CC BY 4.0) — routes/places of 17th-c. Italy; Southern Umbria heritage datasets (Zenodo). Nothing medieval region-wide. | Optional early-modern routes layer. |  |

#### Iberia

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 97 | Castile | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. Heritage: Castilla y León BIC datasets (datos.gob.es). | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 98 | León | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 99 | Aragón | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. Heritage: Aragón BIC geographic dataset (datos.gob.es; CSV/JSON points). | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 100 | Navarre | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 101 | Catalonia | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. Heritage: Catalonia cultural-heritage inventory (DIBA open data, >40,000 elements with period; Geoportal del Patrimoni 44,365 protected elements). | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 102 | Portugal | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. Heritage: SIPA/DGPC inventory with WGS84 coordinates (monumentos.gov.pt) — no bulk download found. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 103 | Galicia | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 104 | Andalusia | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 105 | medieval Islamic Iberia | ✓ | ✓ | ✓ | confirmed: Apache-2.0 (al-Ṯurayyā) | yes | yes | al-Ṯurayyā covers al-Andalus towns, regions and routes (9th–10th c., after Cornu) — integrated. "Cartography of al-Andalus landscape" (J. Archaeol. Sci. 2022) is a research paper, data not found. | Keep. |  |
| 106 | taifa geography | ✓ | ✓ | · | not verified: — | gap | Cliopatria | No taifa-period (1031–1090s) boundary data found; Cliopatria has some taifa polities. | Document gap. | not recovered (none) — No taifa boundary data exists. |
| 107 | Christian kingdoms | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 108 | counties | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 109 | marches | ✓ | ✓ | · | not verified: Cliopatria CC BY 4.0; regional heritage portals per dataset (not verified individually) | partial | Cliopatria only | Political units of Iberia exist only as Cliopatria outlines (integrated) and al-Ṯurayyā regions (9th–10th c.). No open GIS of the medieval Iberian kingdoms, counties, marches or taifas was found; research GIS (ADIMO military orders, frontier viewshed studies) is not published as data. | Acquire the regional heritage datasets with verified licences (Catalonia DIBA, Aragón BIC) for castles/churches; document polity-boundary gap. | not recovered (none) — No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source. |
| 110 | medieval cities | ✓ | ✓ | ✓ | confirmed: CC0 (Buringh) | partial | Buringh | Buringh has 262 Spanish and 49 Portuguese towns; Villuga 1546 route gazetteer (Idaho State GIHL, "may be downloaded without charge" — not tested, licence not verified). | Test the Villuga gazetteer download. |  |
| 111 | castles | ✓ | ✓ | · | not verified: regional (not verified individually) | partial | Wikidata only | Castles: regional heritage registers (Catalonia ~600 castles, Aragón BIC, Castilla y León BIC, País Vasco). No Spain-wide open castle dataset (AEAC inventory not open). Wikidata has Iberian castles (see measured coverage). | Acquire Catalonia/Aragón registers. | not recovered (access) — Regional heritage registers (Catalonia, Aragón) not yet downloaded — next wave; Wikidata covers Iberian castles meanwhile. |
| 112 | fortifications | ✓ | ✓ | · | per source (see the rows it points to): as 110 | partial | Wikidata only | As 110. | As 110. | not recovered (access) — As 111. |
| 113 | roads | ✓ | ✓ | · | not verified: Villuga: not verified | partial | Itiner-e, al-Ṯurayyā | Roman roads (Itiner-e) and al-Ṯurayyā routes (al-Andalus) only; Villuga 1546 guide (139 routes) exists as a gazetteer; no medieval Iberian road GIS found. | Test Villuga. | not recovered (none) — Villuga 1546 exists only as a web gazetteer; no data file could be located. |
| 114 | pilgrimage routes | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (CNIG "Caminos de Santiago") | low (modern) | no | CNIG/IGN Caminos de Santiago tracks (CC BY 4.0) are modern waymarked routes recorded by pilgrims — not historical reconstructions; poor fit as medieval evidence. | Optional, labelled "modern waymarked route". |  |
| 115 | monasteries | ✓ | ✓ | · | not verified: — | partial | Wikidata only | No Iberian monastery dataset found; Wikidata only. | Document gap. | not recovered (none) — No Iberian monastery dataset exists. |
| 116 | dioceses | ✓ | ✓ | · | not verified: — | gap | no | No historical Iberian diocese GIS found. | Document gap. | not recovered (none) — No historical Iberian diocese GIS exists. |
| 117 | historical gazetteers | ✓ | ✓ | · | not verified: — | partial | no | Villuga 1546 gazetteer (Idaho State); WHG; no medieval Iberian gazetteer found. | Test Villuga. | not recovered (none) — As 113. |
| 118 | archaeological datasets | ✓ | ✓ | · | not verified: — | low | no | Regional archaeological inventories only (not bulk-downloadable). | None. | not recovered (access) — Regional archaeological inventories without bulk export. |
| 119 | Spanish and Portuguese historical GIS | ✓ | ✓ | · | not verified: — | partial | no | See 110 (regional heritage open data); national CNIG data are modern. | As 110. | not recovered (access) — As 111. |

#### Scandinavia

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 120 | Denmark | ✓ | ✓ | ✓ | not verified: Licence not verified — the first pass wrote "CC0 as stated on the download page"; re-reading the page (2026-10-01) found no licence statement. Corrected. | partial | no (raw, local only) | Fund og Fortidsminder: national register of ancient monuments (GeoPackage FF.zip, 109 MB, updated daily; also SHP/CSV per municipality). | Acquired local-only (raw vault, not in git); integrate medieval churches/castles/deserted villages once the licence is confirmed. |  |
| 121 | Norway | ✓ | ✓ | ✓ | not verified: NLOD reported (not verified from files) | partial | no | Kulturminnesøk/Askeladden (GeoJSON API, ~170k); Norske stadnamn open place-name database (Rygh farm names, 1886 cadastre, historical forms). | Acquire medieval subset; test Norske stadnamn download. |  |
| 122 | Sweden | ✓ | ✓ | ✓ | not verified: RAÄ: "free to use, cite RAÄ as the source" (open-data pages); the specific licence (e.g. CC0) was not found on the pages read — licence not verified | partial | no | Kulturmiljöregistret / Fornsök (>1.8M remains) — medieval churches, castles, town sites; open-data portal. | Acquire the lämningar download and filter to medieval. | recovered (unclear): sweden-lamningar — Riksantikvarieämbetet publishes all ancient remains as one GeoPackage (pub.raa.se); downloaded and filtered to Iron Age / medieval remains (private data). |
| 123 | Finland | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (avoindata.fi) | partial | no | Finnish Heritage Agency register of ancient monuments (Muinaisjäännösrekisteri): file download service, CC BY 4.0; includes medieval churches, castles, villages. | Acquire; filter medieval. |  |
| 124 | Iceland | ✓ | ✓ | ✓ | explicit restriction: CC BY-NC (Icelandic Saga Map, via search) | yes (names) | no | Icelandic Saga Map: places named in texts before 1530, georeferenced (MySQL / GitHub metadata; Nordic Spatial Humanities RDF on Zenodo 14871254). | Acquire (private use, NC) — fills Iceland before 1200. | recovered (licence): nordic-spatial-humanities — The Icelandic Saga Map places come with the Nordic Spatial Humanities release (CC BY 4.0) — public. |
| 125 | medieval settlements | ✓ | ✓ | ✓ | per source (see the rows it points to): per source | partial | Viabundus | Scandinavian medieval settlement data come from heritage registers (DK/NO/SE/FI) and Viabundus (towns 1350–1650). | See 119–122. | recovered (covered): norway-kulturminner, dk-fund-og-fortidsminder, sweden-lamningar — Settlement remains from the Norwegian (public), Danish and Swedish (private) registers. |
| 126 | medieval administrative divisions | ✓ | ✓ | · | not verified: — | gap | no | Medieval herreder/sýslur/härader boundaries: none found as open GIS (Danish historical parishes/hundreds exist as modern-era GIS). | Document gap. | not recovered (none) — No medieval herred/härad boundaries exist as open GIS. |
| 127 | Scandinavian historical gazetteers | ✓ | ✓ | ✓ | per source (see the rows it points to): per source | partial | no | Norske stadnamn (Norway), Danish place-name data (not verified), Swedish ortnamnsregistret (not verified). | Test Norske stadnamn. | acquired (covered): nordic-spatial-humanities — Norwegian place-name database comes inside the Nordic release (710,000 names, no coordinates) — not integrated. |
| 128 | Old Norse place-name resources | ✓ | ✓ | ✓ | per source (see the rows it points to): see 120/123 | partial | no | Old Norse forms: Rygh (historical forms), Icelandic Saga Map. | As 120/123. | recovered (covered): nordic-spatial-humanities — Old Norse place forms from the sagas and chronicles (Nordic release). |
| 129 | medieval churches | ✓ | ✓ | ✓ | per source (see the rows it points to): see 119–122 | partial | no | Medieval churches are recorded in all four national heritage registers. | As 119–122. | recovered (covered): nordic-spatial-humanities, norway-kulturminner, dk-fund-og-fortidsminder — Nordic parish churches with first attestation; Norwegian and Danish medieval churches and churchyards. |
| 130 | monasteries | ✓ | ✓ | ✓ | confirmed: CC0 (Wikidata) | partial | Wikidata | Wikidata monasteries only (Scandinavia 76–83 in 1200–1500 counts); registers add sites. | As 119–122. |  |
| 131 | royal sites | ✓ | ✓ | · | not verified: — | gap | no | No royal-sites dataset found. | Document gap. | not recovered (none) — No royal-sites dataset exists. |
| 132 | Viking/medieval routes | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Viabundus) | partial | Viabundus | Viabundus covers Scandinavian land and sea routes 1350–1650; nothing open for Viking-age routes. | Document gap before 1350. |  |
| 133 | ports | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | partial | Viabundus | Viabundus harbours; Wikidata. | Keep. |  |
| 134 | archaeological settlement datasets | ✓ | ✓ | ✓ | per source (see the rows it points to): see 119–122 | partial | no | National registers. | As 119–122. | recovered (covered): norway-kulturminner, dk-fund-og-fortidsminder, sweden-lamningar, ran-romania — National registers. |
| 135 | historical maps | ✓ | ✓ | · | not verified: — | maps | no | Historical maps: national libraries; not data. | None. | not useful (reference) — Scanned maps, not data. |

#### Eastern Europe / Balkans

| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 136 | Poland | ✓ | ✓ | ✓ | not verified: Atlas Fontium: not specified (GeoNode licence "not_specified", restriction code "intellectualPropertyRights") — not verified | yes | local builds only: settlements + parish seats (local-sites tiles) | Atlas Fontium / OntoHGIS: Crown of Poland, 2nd half of the 16th c. All 11 layers downloaded by WFS (24,092 settlements with character, ownership, owner, size band, parish, mills/inns; parishes, deaneries, archdeaconries, dioceses, districts, voivodeships, roads with weights, rivers, forests, water). Attribute fill: 16th-c. name 98%, character 92%, parish 88%, size 27%. One period for the whole layer — used as an evidence period, never as the places' dates. After 1500, so it does not fill the medieval gap for Poland; it does give c. 1580 settlement, church and administrative geography. | Ask IH PAN for a licence; then publish. Next: districts/voivodeships as a political layer and the roads as a road layer (local builds). | recovered (unclear): atlas-fontium-poland — All 11 layers acquired; settlements and parish seats integrated in the private pack (1550–1600). Districts, roads, rivers and forests are in the vault, not yet drawn. |
| 137 | Czechia/Bohemia | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 (Zenodo) | partial | no | See 80; P&T includes Bohemian towns of the Deutsches Städtebuch? (to verify in data). | As 80. |  |
| 138 | Hungary | ✓ | ✓ | ✓ | not verified: Engel: licence not verified; distributed as a downloadable runtime program, not an open data file | yes (if accessible) | no | Engel Pál, Magyarország a középkor végén (renewed 2020, ELTE/ABTK): >23,000 settlements, towns, market towns, castles, monasteries c. 1500 with 1490s landholding — the specialist source for Hungary. Distributed as a GIS runtime program (Windows), with a user guide PDF; no plain data export confirmed. | Download the runtime package and check whether the data can be exported (local use); ask ABTK about data licence. | acquired (technical): engel-hungary — Engel's atlas was downloaded (vault), but its database is encrypted inside a Windows GIS program whose only export is attribute tables without coordinates. Breaking the encryption is not an option. |
| 139 | Slovakia | ✓ | ✓ | ✓ | not verified: licence not verified | partial | no | Maps of Power (TIB Balkans OpenAtlas) includes medieval churches in Slovakia (Kingdom of Hungary) with dated attestations; Wikidata ~220 Slovak settlements with first mentions. | Acquire Maps of Power (see 146). | recovered (unclear): tib-maps-of-power, ebidat — TIB churches in Slovakia and EBIDAT Slovak castles — private data. |
| 140 | Croatia | ✓ | ✓ | · | not verified: — | partial | no | Croatian Register of Cultural Goods (public register; no open bulk download found). | Document; Wikidata. | not recovered (access) — The Croatian register has no bulk download; EBIDAT and Wikidata cover castles. |
| 141 | Serbia | ✓ | ✓ | ✓ | not verified: licence not verified | partial | no | Serbia: Maps of Power (TIB) covers medieval Serbian lands in part; no open national register download found. | See 146. |  |
| 142 | Bosnia | ✓ | ✓ | · | not verified: — | partial | no | Bosnia: "Stari bosanski gradovi" (1953 PDF list); no open dataset. | Document gap. | not recovered (none) — Only a 1953 printed list of Bosnian fortresses. |
| 143 | Bulgaria | ✓ | ✓ | ✓ | not verified: licence not verified (TIB) | partial | no | Bulgaria: TIB volumes 6 (Thrace) and 12 (Macedonia) are in Maps of Power; no Bulgarian national open heritage dataset found. | See 146. | recovered (unclear): tib-maps-of-power — TIB places of Bulgaria (Thrace, Macedonia volumes) — private data; only 23 by 1399, so Bulgaria stays weak. |
| 144 | Romania | ✓ | ✓ | ✓ | not verified: Open Government Licence (data.gov.ro, via search); site did not respond to direct requests today | yes | no | Repertoriul Arheologic Național (RAN): 27,502 archaeological sites / 25,965 entities with periods (incl. medieval), CSV + EDM XML on data.gov.ro. | Acquire via browser session (data.gov.ro timed out); filter medieval. | recovered (access): ran-romania — RAN: 2,865 migration-period and medieval sites with positions, from the register's own site and map service — private data. |
| 145 | Wallachia | ✓ | ✓ | ✓ | not verified: — | partial | no | Wallachia: RAN (Romania) + Cliopatria. | As 143. | recovered (access): ran-romania — RAN downloaded from the register's own site and map service (data.gov.ro still unreachable) — private data. |
| 146 | Moldavia | ✓ | ✓ | ✓ | not verified: — | partial | no | Moldavia: RAN (Romania part) + Cliopatria; Moldova not covered. | As 143. | recovered (access): ran-romania — As 145 (Romanian Moldavia; the Republic of Moldova is not covered). |
| 147 | Byzantine territories | ✓ | ✓ | ✓ | not verified: licence not verified (API content; images CC BY 4.0) | yes | no | TIB "Maps of Power" OpenAtlas API (ÖAW): 5,522 places, 4,947 with geometry, dated timespans (earliest/latest), types (urban/rural settlement, fortification, church…), TIB volume, Linked Places format. First pass wrongly said "no open coordinates found". | Acquire full snapshot (local-only until licence confirmed) and integrate as Byzantine/Balkan places with attestation dates. |  |
| 148 | Greece | ✓ | ✓ | · | not verified: Archaeological Cadastre: licence not verified | partial | no | Greek Archaeological Cadastre (arxaiologikoktimatologio.gov.gr): 17,000 monuments, 3,100 archaeological sites, downloadable per-site spatial data (LOD). TIB (Greek volumes) via Maps of Power. | Test bulk download; see 146. | not recovered (access) — The Greek Archaeological Cadastre is a single-page app with per-site data only; no bulk route found. |
| 149 | Ukraine | ✓ | ✓ | · | not verified: — | gap | no | No open Rus' archaeological or town dataset found (HURI "Golden Age of Kyivan Rus" is a web map). Wikidata has 2,147 Ukrainian first-mention settlements (heritage import). | Document gap. | not recovered (none) — No open Rus' archaeological or town dataset. |
| 150 | Belarus | ✓ | ✓ | · | not verified: — | gap | no | As 148 (Belarus). | Document gap. | not recovered (none) — As 149. |
| 151 | Baltic regions | ✓ | ✓ | ✓ | not verified: Estonia: open data (andmed.eesti.ee; free reuse) — licence text not re-read | partial | no | Estonian Cultural Monuments Register (GML); Lithuanian Register of Cultural Property (26,213 immovable; no bulk download found); Latvia NCHB list. | Acquire Estonian register. | not recovered (bot): ebidat — Estonia's register refuses automated requests (403); Latvia is partly covered by EBIDAT castles (private data). |
| 152 | historical Rus' territories | ✓ | ✓ | ✓ | not verified: WHG dataset: licence not shown | partial | no | Russian towns of the late 14th c. (WHG, 282, histgeo.nextgis.com); Cliopatria Rus' principalities. | Use via WHG; check nextgis source licence. |  |
| 153 | medieval settlements | ✓ | ✓ | ✓ | per source (see the rows it points to): per source | partial | no | Eastern settlements: RAN (Romania), Atlas Fontium (Poland 16th c.), Engel (Hungary), Wikidata first mentions (Czechia, Ukraine, Romania heavy). | See rows above. | recovered (covered): ran-romania, atlas-fontium-poland — RAN (Romania) and Atlas Fontium (Poland) — private data; Engel (Hungary) remains locked. |
| 154 | historical gazetteers | ✓ | ✓ | · | per source (see the rows it points to): per source | partial | no | Eastern gazetteers: GOV, WHG datasets, Maps of Power. | See rows above. | not recovered (bot) — GOV is behind a bot check; TIB (private data) covers the Byzantine Balkans. |
| 155 | political boundaries | ✓ | ✓ | · | not verified: — | partial | Cliopatria | Political boundaries: Cliopatria only; Engel includes 1490s landholding maps. | See 137. | not recovered (technical) — Engel's 1490s landholding maps are locked in the encrypted program; Atlas Fontium districts (1580) are in the private pack as raw data. |
| 156 | administrative divisions | ✓ | ✓ | ✓ | not verified: Atlas Fontium not specified; HistoGIS CC BY 4.0 | partial | no | Administrative divisions: Atlas Fontium (Poland 16th c.), HistoGIS (Habsburg 19th c.), Engel (Hungarian counties c. 1500). | See 135/137. |  |
| 157 | castles | ✓ | ✓ | ✓ | per source (see the rows it points to): per source | partial | no | Castles: Engel (Hungary), Maps of Power (Balkans), registers (Estonia, Romania RAN), Wikidata. | See rows above. | recovered (covered): ebidat, tib-maps-of-power — EBIDAT castles (incl. Hungary, Slovakia, Czechia, Latvia) and TIB fortifications — private data. |
| 158 | fortifications | ✓ | ✓ | ✓ | per source (see the rows it points to): per source | partial | no | As 156. | As 156. | recovered (covered): ebidat, tib-maps-of-power — As 157. |
| 159 | monasteries | ✓ | ✓ | ✓ | per source (see the rows it points to): per source | partial | no | Monasteries: Maps of Power (Orthodox, Balkans), Engel (Hungary), Wikidata. | See rows above. | recovered (covered): tib-maps-of-power — TIB monasteries of the Byzantine Balkans — private data. |
| 160 | churches | ✓ | ✓ | ✓ | not verified: licence not verified | partial | no | Churches: Maps of Power (dated church attestations incl. Slovakia, Macedonia, Greece). | See 146. |  |
| 161 | roads | ✓ | ✓ | ✓ | confirmed: CC BY 4.0 | partial | Viabundus, Itiner-e | Roads: Viabundus reaches Poland/Baltic/Bohemia (1350–1650); Atlas Fontium roads (16th c., licence n/s); Roman roads in the Balkans (Itiner-e). Nothing open for medieval Balkan/Hungarian roads found. | Document gap. |  |
| 162 | trade routes | ✓ | ✓ | ✓ | not verified: WHG Old World Trade: licence not shown | partial | no | Old World Trade (Ciolek, 4,117 records, via WHG); Viabundus. | Via WHG. |  |
| 163 | archaeological sites | ✓ | ✓ | ✓ | not verified: per source: RAN OGL (via search, not verified); Estonia open (portal, not verified); Finland CC BY 4.0 (confirmed) | partial | no | National archaeological registers (see rows 122, 143, 150). | Acquire those. |  |
| 164 | historical maps | ✓ | ✓ | · | not verified: — | maps | no | Historical maps: not data. | None. | not useful (reference) — Scanned maps, not data. |
| 165 | medieval towns | ✓ | ✓ | ✓ | confirmed: CC0 (Buringh) | partial | Buringh | Buringh towns (Russia 185, Ukraine 72, Poland 70, Hungary 47, Romania 39, Bulgaria 21 in 1300 rows). | Keep. |  |
| 166 | historical place-name datasets | ✓ | ✓ | ✓ | per source (see the rows it points to): CC BY 4.0 (Western Bohemia); others per source | partial | no | Western Bohemia toponyms; Maps of Power names (multilingual); Engel (Hungarian/Latin names). | Acquire Western Bohemia + Maps of Power. |  |

<!-- RECONCILIATION:END -->
