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

## 4. What changed (by root cause)

| # | Now | Where |
| --- | --- | --- |
| R1 | Every mention carries its **text evidence**: cue strength (place-type cues like "city of", "kingdom of"; movement/direction cues like "went to", "near", which are *loose*; weak prepositions), the kind of entity the wording implies, multi-word names, demonyms. A single capitalised ordinary English word (SCOWL word list, 63k words — not a hand list) is looked up only with a place-type cue or when an offline dataset knows it. Screening runs before any lookup in the reader's Map tab, "Map this chapter" and the whole-book analysis. | `atlas/mention.ts`, `lib/history/placeDetect.ts` (`screenMentions`) |
| R2 | Online answers need **spelling evidence**: the exact name or a full alias (abbreviations like "Mass." or "PA" and prefix hits don't count). Wikidata descriptions are no longer used as a place type. A lone far-away match is LOW, not accepted. | `lib/history/assess.ts`, `lib/history/providers.ts` |
| R3 | **The book's geography is a prior.** Places already identified in the book (your choices, places you opened, the book analysis) and unambiguous names in the same passage form a context; between same-named places, one clearly nearer that context wins, with the distance in the reason. All period gazetteers are consulted at any date; only records that start *after* the date are excluded, so places persist past a dataset's window (flagged "recorded for an earlier period only"). | `atlas/geocontext.ts`, `atlas/gazetteer.ts` (`matchName`), `world/placeEvidence.ts` |
| R4 | **Entity types.** Continents, seas and geographic lands (Italy, Greece, Gaul, Anatolia…) resolve as regions, never as a town or state that shares the name; a period province of the same name (Asia → the Roman province) or a state that existed at the date is offered as another reading. Polities are searched by name and by demonym ("Castilian" → Crown of Castile, "Norman" → Duchy of Normandy), and only placed when they existed at the date. Candidates of an incompatible type are dropped (a sea can't be a village). | `atlas/mention.ts` (`MACRO`, `matchPolity`), `atlas/resolve.ts` |
| R5 | **Name roles.** A place keeps the book's wording (when the record lists it), an English name, the record's own title, names attested at the date, and names in their own scripts. The display policy is: book's wording → English name → Latin-script title → Latin-script name → title; the card says which rule chose it. When the written name is later than the date ("Constantinople" in 500 BCE) the reason says so and gives the names recorded then. | `atlas/names.ts`, `atlas/gazetteer.ts` |
| R6 | **Undated is not "always".** Time fit is explicit (`within / near / earlier / later / undated`). Undated records are hidden from dated map views by default; an "Include undated records" switch shows them faintly and only inside the dataset's own core period. An undated record inside that period is accepted with confidence only when the book's other places agree with it. | `atlas/time.ts`, `atlas/catalog.ts`, `atlas/resolve.ts` |
| R7 | **Cliopatria's hierarchy is kept.** Groupings (parenthesised collections) are outlined, not filled as rival states, and are reported as "part of". Independent polities whose outlines overlap substantially in the same years are flagged **contested**; small detached pieces far from a polity's main territory become **outlying** features (faint, dashed, unlabelled). Each polity version has one label point inside its largest part. Colours belong to the polity (by Seshat/Wikidata identity, stable through time) and neighbours get different colours. | `scripts/atlas-build/build.py` (`cliopatria`, `polity_relations`), `atlas/catalog.ts`, `atlas/context.ts` (`politiesAt`) |
| R8 | **Importance.** Pleiades places get an importance class from the record itself (names, links and sites recorded — Pleiades has no population data); it sets tile zoom, dot size and label order. Polity labels appear by area and zoom. All labels share one band ordered by a hierarchy (polities → cities → provinces → local units → the rest). | `scripts/atlas-build/world.py` (`pleiades_importance`), `atlas/catalog.ts` (`labelKey`), `atlas/AtlasMap.tsx` |
| R9 | Wikidata descriptions are labelled **"today:"**, WHG country codes as "modern country", and place cards show them as "Today (present-day description)". | `components/history/*` |
| R10 | **Real deep zoom** from each collection's IIIF image server (OpenSeadragon, loaded only when a map is opened), stopping at the scan's full resolution and saying so; servers without tiles fall back to one image zoomable only to its own pixel size. The viewer shows scan size, zoom level and georeference status. Search results are ranked by: names the place, catalogued country matches the area on screen (so "Rome, N.Y." ranks below Rome in Italy), coverage scale (building plans flagged, world maps demoted), date and whether it can be overlaid — with a "why here" line. Overlays remain limited to georeferenced maps with a measured fit error. | `components/history/DeepZoom.tsx`, `world/maps.ts` (`relevance`) |
| R11 | Unavailable layers state their reason ("no suitable open dataset exists", "licence doesn't allow publishing it here", "not added to Shelf yet"); empty-area notes name the catalogued source and the registry's reason it isn't used. | `atlas/catalog.ts` (`UNAVAILABLE_LABEL`), `world/evidence.ts` |
| R12 | Non-Latin names are isolated (Unicode FSI…PDI in text, `<bdi>` in the UI), never reversed. | `atlas/names.ts`, place cards |

Answers cached on a phone under the old rules are looked up again (versioned cache keys and book-analysis version).

### Tests

`src/atlas/geography.test.ts` tests each rule with cases that were **not** among the observed symptoms:
other ordinary words (Mill, Bank, Church, Chapel), other demonyms (Castilian, Frankish, Norman), other seas and
lands (Adriatic, Balkans, Anatolia), a period province sharing a continent's name (Asia), a modern exonym
(Constantinople), Arabic and Hebrew isolation, a later town at an earlier date (Lübeck), the same name in two
books (Rome in Italy vs Mecklenburg), other prefix/abbreviation traps (Bathurst, "Penn."), hierarchy and contested
territory (Winchester 900, East Yorkshire 1100), and map relevance (a same-named town in another country; a
building plan). Browser checks covered 3000 BCE–2000 CE across Italy, England, Iberia, the Baltic, Mesopotamia,
Greenland and western Europe at zooms 2–7, and the map viewer at full resolution.

### Known limits

- Irregular demonyms whose stem differs from the polity's name (Venetian → Venice) aren't derived; they fall back
  to the other rules.
- Cliopatria outlines are simplified (≈ 6 km); a coastal town can fall just outside its state (reported as
  "at the edge of").
- Importance for Pleiades is a proxy for prominence in the record, not size. Datasets with real classes
  (Viabundus towns, al-Ṯurayyā capitals/towns) use their own.
- Map relevance by country uses the Library of Congress's catalogue field; other collections don't provide one.
