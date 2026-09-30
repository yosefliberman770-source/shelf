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

## 4. What changed

See the commit and the sections in HISTORICAL_ATLAS.md ("Temporal model", "Resolving a name from a book",
"Names", "Political entities", "Map hierarchy", "Historical maps"). Tests in `src/atlas/geography.test.ts`
and the other test files exercise each general rule with cases that were not among the observed symptoms.
