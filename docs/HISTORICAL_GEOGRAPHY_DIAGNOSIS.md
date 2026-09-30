# Historical geography: diagnosis and corrections

This records how Shelf's historical-geography pipeline actually worked, what
was wrong with it, and what was changed. The observed symptoms were treated
as evidence of general failures, not as cases to patch.

## 1. The pipeline as it was

```
BOOK TEXT
 └ placeDetect.detectPlaces()        capitalised word(s) after a "cue" word, or a known X-Ray/atlas name
    └ resolve.resolvePlace()
       1. the reader's own pick for the book
       2. gazetteer.matchName()      offline name index (Pleiades, Viabundus, al-Ṯurayyā), filtered by
                                     each dataset's *coverage window* and by existedAround()
       3. placeService              online: WHG (via Shelf's server) or Wikidata wbsearchentities
          └ assess.assessCandidates() spelling evidence → rivals → date/nearby tie-breaks → status
       4. placeEvidence              WHG + offline records grouped and weighed (added last round)
    └ ReaderPlace { title, … }       one name: the dataset record's title
 └ AtlasMap / catalog               MapLibre layers; each layer filters by year (existedIn) and zoom
 └ PlacePopup / place card          title + names list + politiesAt() + evidence
HISTORICAL MAPS
 └ maps.searchMaps()                LoC + Rumsey text search, Allmaps by bounding box
 └ MapViewer                        one IIIF image ≤ 2000 px, CSS-scaled up to 8×
 └ overlayFor()/fitOverlay()        affine/projective fit from Allmaps control points, quality gate
```

Where things are represented:

| Concern | Where it lived | Problem |
| --- | --- | --- |
| Historical time | `dateContextFor()` (passage → chapter → book), passed as `year` | Used by matchName and as a *tie-breaker* online; not a prior; undated = valid |
| Geographic context | `nearby` names, only once they were already resolved | No regional prior from the book's other places |
| Semantic context | The cue word before a capitalised word | No sense of word class, entity type or register |
| Confidence | `assessCandidates` status; `placeEvidence` confidence | A 0.45 letter-pair similarity counted as "spelling evidence" |
| Missing information | `existedAround()` → `true`; `existedIn(undated)` → shown | Missing dates became "always" |
| Disagreement | `fromGaz` notes distance; `placeEvidence` lists conflicts | Polity overlaps not detected at all |
| Several plausible candidates | AMBIGUOUS (good) — unless a prefix hit stood alone | A single lexical hit had no rivals, so it won |
| What the user sees | `ReaderPlace.title` | Always the dataset title |

## 2. Root causes (each explains several symptoms)

| # | Root cause | Symptoms it produces |
| --- | --- | --- |
| R1 | **Candidate generation took capitalisation after very common words ("of", "in", "at") as evidence of a place**, with no test of whether the word is an ordinary noun or an institution. | "Mass" (at Mass), "Guild" (of the Guild), many false links |
| R2 | **Online matching was lexical only.** Wikidata `wbsearchentities` is a prefix/alias search; a letter-pair similarity of 0.45 counted as spelling evidence; any item with coordinates counted as a place; a lone hit had no rivals, so it was accepted at MEDIUM. Date and region were only tie-breakers among rivals, and undated modern places always passed. | Guild → Guilderland, mass → Massachusetts, Bethlehem → Bethlehem NY |
| R3 | **The book's geography and period were not priors.** Nothing asked "is this candidate in the part of the world, and the period, this book is about?". Datasets were dropped wholesale outside their coverage window (Pleiades after 1500), so persistent ancient places fell through to modern-biased online sources. | Bethlehem NY in an early-modern book; modern places for medieval text |
| R4 | **Entity types were ignored.** A continent, a region, a kingdom and a settlement were all "a place with a name". Settlement gazetteers matched continent names; polities (Cliopatria) and demonyms were never consulted. | Europe → a Roman province in Thrace (Bulgaria); Aragon/Aragonese not recognised |
| R5 | **One name did every job.** `ReaderPlace.title` was the record title of whichever dataset matched, and it was shown everywhere. Pleiades stores modern English names as names *dated 1700–2100*, so the modern name was also "invalid" for earlier years. | Exeter shown as Isca Dumnoniorum; Arabic/Chinese record titles shown as primary names |
| R6 | **Missing dates meant "all of history".** `existedAround()` returned true for undated records; the Pleiades layers showed undated places for every year up to 640 CE — back to 3400 BCE; open-ended ranges were unbounded. | Roman/Italian places at 3000 BCE; anachronistic nearby lists and "what changed" |
| R7 | **Polity data lost its structure.** Cliopatria's collection records ("(Anglo-Saxon England)" with Components/MemberOf) were drawn and listed alongside their members; overlapping, non-nested polities (the source's own Norway outline 1066–1187 includes part of East Yorkshire) were shown as plain fact; labels were placed once per polygon part per tile; colours came from a 4-way class, not the entity. | Anglo-Saxon England vs Wessex confusion; "Norway" in Yorkshire; Denmark repeated over Greenland; tiny polities labelled at world scale |
| R8 | **No feature importance.** All points of a layer had the same weight apart from a coarse minzoom; labels had no sort key; datasets' own classes weren't mapped to one hierarchy. | Dense, generic settlement clouds; Corsica/Gibraltar-type labels too early |
| R9 | **Modern descriptions were shown as historical facts.** Wikidata descriptions ("city in …") were used as the place *type*; WHG country codes appeared unlabelled. | Modern Greece / Italy framing ancient places |
| R10 | **Historical map viewer faked resolution.** One ≤ 2000 px image, scaled up to 8× with CSS. Results carried little metadata; relevance ignored coverage. | Blurry "zoom", maps hard to tell apart |
| R11 | **One availability message for every reason.** Any unavailable layer read "no open dataset", even when the data exists but is licence-restricted or not yet integrated. | "no open data set" for restricted data |
| R12 | **No bidirectional isolation** for right-to-left names mixed into Latin text lists. | Arabic/Hebrew names garbled |

## 3. Failure analysis (symptom → immediate → underlying → general fix)

| Symptom | Immediate cause | Underlying cause | General fix |
| --- | --- | --- | --- |
| "mass" → Massachusetts | "at Mass" matched a place cue; Wikidata alias match | R1, R2 | Candidates need place evidence (cue strength + not a common noun/institution + not sentence-initial-only); online answers need exact name/alias match, a geographic entity type, and period/region plausibility |
| "Guild" → Guilderland | prefix search + 0.45 similarity accepted | R2 | Only exact names/aliases count; prefix hits are never accepted |
| Bethlehem → NY | Pleiades dropped after 1500; online ranking/aggregation favoured modern records | R2, R3 | Places persist beyond a dataset's window; the book's region and period score candidates; modern foundations after the year are excluded |
| Europe → Thrace | continent name matched a Pleiades province title | R4 | Entity-type-aware resolution: macro-regions and continents are recognised as such; a province/settlement can't take a continent's name without context |
| Aragon(ese) missing | polities not searched; no demonyms | R4 | Political entities are resolvable (Cliopatria names with dates), demonyms/adjectives map to their polity or region |
| Exeter → Isca Dumnoniorum | title shown | R5 | Name roles: as written, common English, historical at the date, dataset title; display policy picks a readable name and keeps the rest |
| Roman places at 3000 BCE | undated shown up to 640 | R6 | Undated means undated: excluded from dated views, available in an explicit "undated" view, never counted as existing |
| Anglo-Saxon England vs Wessex | collection drawn alongside members | R7 | Keep MemberOf/Components; draw members, list the collection as "part of" |
| Norway in Yorkshire | source outline overlaps England | R7 | Detect overlaps between non-nested polities → shown as contested/overlapping reconstructions, both named |
| Denmark × n over Greenland | label per polygon part | R7, R8 | One label point per polity per time slice, ranked by area; minzoom from size |
| Crowded settlements | same weight for all | R8 | Internal classes (major city → hamlet, fort, port, sanctuary, site…) with rank-based minzoom, radius and label priority |
| "no open data set" | fixed suffix | R11 | Status from the source registry: not integrated / restricted licence / online only / no dataset |

## 4. Final diagnosis (after the review pass)

### 4.1 The actual underlying problems

The original root causes R1–R12 above, plus six found in the review pass — several of them introduced or left
half-fixed by the first round of corrections:

| # | Problem | How it showed |
| --- | --- | --- |
| R13 | **One universal fallback for undated records.** The first fix hid undated records, then showed them "inside the dataset's core period" on request — the same shortcut in a new place (undated ⇒ Roman period). The data holds better evidence than that for most of them. | Roman-era places either missing at Roman dates or allowed on a blanket assumption |
| R14 | **Demonyms derived only from spelling.** Adjectives were matched by stem, so irregular ones (Venetian → Venice) failed; the detection pattern skipped "-an" forms (Roman, Norman); "English", "French", "German" were on a never-a-place list. | Venetian unresolved; "Roman" never considered |
| R15 | **Polities ranked by label-point distance.** Between polities of one name the nearest *label point* to the book's places won. A label point is where a name is drawn, not where the polity was. | "Roman" in a Punic-war chapter → Roman Kingdom (its label sits at Rome) |
| R16 | **Chapter places resolved before the date was known.** The atlas works out the date after its first render; the chapter list resolved once, on mount, with no date. | Book places resolved as if undated even when the chapter says "218 BC" |
| R17 | **Every overlap called "contested".** Cliopatria records territory per period and records relationships (allegiance, alliance, vassalage, personal union) — never claims or disputes. | Norway/Yorkshire and 1,400 other overlaps described as disputes the source never states |
| R18 | **Importance = documentation.** The first ranking counted names and links: well documented ≠ important. | Well-studied small sites outranking capitals and ports |

### 4.2 What changed, for each general problem

| # | Now | Where |
| --- | --- | --- |
| R1 | Every mention carries its text evidence: place-type cues ("city of", "kingdom of", "siege of"), **loose** movement/direction cues ("went to", "near" — strong for an unusual name, not for an ordinary word), weak prepositions, multi-word names, demonyms. A single capitalised ordinary English word (SCOWL list, 63k words) is looked up only with a place-type cue or when an offline dataset knows it. Runs before any lookup in every automatic path. | `atlas/mention.ts`, `lib/history/placeDetect.ts` |
| R2 | Online answers need spelling evidence (exact name or full alias; abbreviations and prefixes don't count). A lone far-away match is LOW. | `lib/history/assess.ts`, `lib/history/providers.ts` |
| R3, R15 | The book's places are a prior for **places**: the candidate clearly nearest them wins, with the distance stated. For **polities** they count only as territory: at a known date, a polity whose outline holds the book's places is preferred; with no date they decide nothing and an equal tie is reported as ambiguous. | `atlas/geocontext.ts`, `atlas/gazetteer.ts`, `atlas/mention.ts` (`matchPolity`), `atlas/resolve.ts` |
| R4 | Continents, seas and geographic lands resolve as regions; a same-named period province or a state that existed then is offered as another reading. Type-incompatible candidates are dropped. | `atlas/mention.ts` (`MACRO`), `atlas/resolve.ts` |
| R5 | Name roles and a stated display policy (book's wording → English name → Latin-script title → Latin-script name → title); other names kept; modern exonyms at ancient dates flagged. | `atlas/names.ts`, `atlas/gazetteer.ts` |
| R6, R13 | **Four temporal states** (A dates · B/C evidence period · D unknown), see 4.5. The build derives each undated record's narrowest defensible period from its own dataset's evidence; the map shows B/C records only inside that period, faded and labelled approximate; D records are never placed in dated views (a separate "Include undated records" view shows them, marked). | `scripts/atlas-build/build.py` (`pleiades_envelopes`), `world.py`, `atlas/time.ts`, `atlas/catalog.ts` |
| R7, R17 | Cliopatria's hierarchy kept (groupings outlined, reported as "part of"). Overlaps are explained by a **recorded relationship** when one links the two polities at that time (15 of 1,408); otherwise described as "the source's outlines overlap — it doesn't say whether control was shared, changing or disputed", drawn faint and dashed. Detached pieces far from the main territory are separate, unlabelled, and described neutrally ("the source doesn't say whether it was held, briefly occupied, or is an artefact"). One label per polity version; colours per polity identity, neighbours differ. | `build.py` (`cliopatria`, `polity_relations`), `atlas/catalog.ts`, `atlas/context.ts`, `components/history/atlasParts.tsx` |
| R8, R18 | Prominence from **recorded role**: capital-of links, administrative parent of other places, urban/polis/fortified/settlement/station/villa types, port, Itiner-e road-hub degree (main roads weigh more), sites recorded at the place; documentation adds at most +1. Classes set tile zoom, dot size and label order; the map details say which evidence and that it is not population. Labels share one band ordered by hierarchy; polity labels gated by area and zoom. | `world.py` (`pleiades_importance`), `atlas/catalog.ts`, `atlas/AtlasMap.tsx` |
| R9 | Modern descriptions labelled "today:"; country codes "modern country". | `components/history/*` |
| R10 | IIIF deep zoom to the scan's own resolution (and it says so); relevance by place, catalogued country, coverage scale, date, overlay ability; sheets grouped. | `components/history/DeepZoom.tsx`, `world/maps.ts` |
| R11 | Unavailable layers and empty areas give the actual reason. | `atlas/catalog.ts`, `world/evidence.ts` |
| R12 | Non-Latin names isolated (FSI…PDI, `<bdi>`), never reversed. | `atlas/names.ts` |
| R14 | Polity names, **Wikidata aliases and demonyms** (P1549; fetched per Cliopatria polity at build time from QLever's copy of Wikidata, falling back to Wikidata's own API; cached — 1,053 polities with aliases, 260 with demonyms) and spelling-derived adjectives. All routes are collected and **the date decides first**, then how strongly the words match ("Hungarian" in 1400 → Kingdom of Hungary by spelling, not the later Hungarian Republic by name). Detection covers -an/-ic/-ch adjectives; adjectives followed by language/artefact words ("English translation", "Roman numerals") or after "in"/"into" are not places. A match is confident only when it comes from a recorded name/alias/demonym **and** the book's places don't lie outside that polity at the date; otherwise it is "likely". | `build.py` (`polity_aliases`), `atlas/mention.ts`, `atlas/resolve.ts`, `lib/history/placeDetect.ts` |
| R16 | Chapter places are resolved once the date context exists, and again if the reader changes the date. | `components/history/AtlasPanel.tsx` |

Answers cached on a phone under earlier rules are recomputed (versioned cache keys and book-analysis version).

### 4.3 Which reported examples were symptoms of which problem

| Reported example | Symptom of |
| --- | --- |
| "mass" → Massachusetts; Guild → Guilderland | R1 (ordinary word taken as a place) + R2 (abbreviation/prefix accepted as a match) |
| Bethlehem → Bethlehem NY | R2 + R3 (no book geography; the period gazetteer dropped outside its window) |
| Europe → a place in Bulgaria | R4 (a continent matched a province title) |
| Aragon/Aragonese not recognised | R4 (polities never searched) + R14 (demonyms from spelling only) |
| Exeter shown as Isca Dumnoniorum | R5 (the record title used as the display name) |
| Roman/Italian places at 3000 BCE | R6 (undated = always) — and its over-correction R13 |
| Modern Greece in ancient contexts | R4 + R9 (the state, not the land; modern descriptions shown as types) |
| Anglo-Saxon England vs Wessex | R7 (grouping drawn as a rival) |
| Norwegian geography in Yorkshire | R7 (detached piece labelled as territory) + R17 (then over-described as "contested") |
| Dense, generic settlements | R8 + R18 |
| Corsica/Gibraltar labelled too early; Denmark repeated over Greenland | R7 + R8 (label per polygon part, no area gating) |
| Political colours not distinct | R7 (colour by class, not by polity) |
| Historical-map metadata, viewer and overlay problems | R10 |
| "no open data set" | R11 |
| Arabic/Hebrew bidi; non-English primary names | R12 + R5 |
| (found in review) "Roman" → Roman Kingdom in a 218 BC chapter | R15 + R16 |

### 4.4 What remains uncertain because of the sources

- **Pleiades**: 525 of the 20,340 mapped places have no temporal evidence at all (no dates; nothing dated linked
  to them; not from the Barrington Atlas). They are not placed in dated views. Evidence periods are as wide as
  the evidence: a place known only from the Barrington Atlas is eligible anywhere from the Archaic to the Late
  Antique period (750 BCE – 640 CE, Pleiades' own period bounds), shown faded as approximate.
- **Cliopatria** outlines are per period and simplified (≈ 6 km); they record no claims. Overlaps without a
  recorded relationship remain unexplained by the source, and are shown as such.
- **Prominence** for ancient places comes from recorded role; no source used here records population. Places
  whose role Pleiades doesn't record (e.g. Byzantion's) rank lower than their history deserves.
- **Demonyms** come from what Wikidata records. Where it records none for the polity of the period and the
  spelling differs (e.g. "French" for the Kingdom of France, "Polish" for the Polish–Lithuanian Commonwealth),
  the adjective is not linked to a polity — it isn't guessed. Where Wikidata records a demonym for a
  polity some readers wouldn't expect ("Roman" → Holy Roman Empire in 1100), the book's places temper it:
  in a book set in Constantinople it is only "likely", with the reason shown.
- **Map relevance by country** uses the Library of Congress's catalogue field; other collections don't give one.

### 4.5 What Shelf intentionally does NOT infer

- **No date from nothing.** A record with no temporal evidence gets no period — not "all of history", not "the
  dataset's period", not "Roman". The four states:
  A. own dates → shown inside them;
  B/C. no dates, but a period from evidence (dated linked records; the dated place it is part of; the reference
  work's period; the dataset's documented period, e.g. Viabundus 1350–1650, al-Ṯurayyā 9th–10th c.) → shown only
  inside that period, as approximate;
  D. no evidence → not placed in dated views; visible only through "Include undated records", marked undated.
- **No period from a place's type** (a "villa" is not assumed Roman, a "church" not assumed Christian-era) —
  the source doesn't state it.
- **No claims or disputes** from overlapping outlines; no ownership of detached pieces.
- **No polity from an adjective without recorded support at the date**; no city from a demonym ("Roman" is
  never the city of Rome); no polity chosen by label-point distance; no choice when two fit equally.
- **No population or size** from prominence classes; the map says the ranking is evidence-based.
- **No modern country for an ancient land name** ("Italy" in 218 BCE is the peninsula).
- **Book-derived places vs searches**: names read in a book are resolved with the book's date, cues and
  geography; the atlas search box looks names up in the gazetteers without that context, and says so by
  listing all matches.

### 4.6 Verification

- **Tests**: see the final count below. `src/atlas/geography.test.ts` has a **REGRESSION** section (the reported
  problems) and a **GENERALISATION** section (other ordinary words, other shared names — Alexandria, Tripolis,
  Heraclea, Rome/Mecklenburg — other adjectives — Castilian, Frankish, Norman, Byzantine, Venetian, Danish, Hungarian, Roman at two dates and
in a Byzantine-set book —
  undated records from four datasets and four evidence types, other periods' polities — York 900, Baghdad 900,
  Capua 218 BCE, Paris 1850 — Greek and Cyrillic scripts, label behaviour at several map scales). The map layer
  filters and label sizes are evaluated with MapLibre's own expression engine.
- **Map checks** (phone-sized browser): 3000 BCE (Italy: nothing; Mesopotamia: only dated early sites),
  100 CE (Italy z4: only top-class places; z7: detail, including places placed by evidence period; Britain,
  Levant), 883 (Carolingian Empire, Wessex, Brittany), 1100 (Europe z3; East Yorkshire z7: faint detached
  piece, unlabelled), 1300 (Iberia; north Italy z6: Florence, Papal States, Aquileia), 1850 (Europe; India:
  British Empire, Nepal, residual Mughal Empire). No duplicated polity labels in any view.

- **Final test count**: 224 passed across the suite (63 passed in `geography.test.ts`), 0 failing.
- **Production build** (`SHELF_BASE=/shelf/ npx vite build`, with `tsc -b`): succeeds.
