# Historical Atlas

The reader's map panel is a layered historical atlas (MapLibre GL). Every layer
comes from a named scholarly or open dataset, can be switched on and off on its
own, and follows one timeline. On phones without WebGL, or when the atlas can't
start, the panel falls back to the OpenHistoricalMap view described in
[HISTORICAL_MAP.md](HISTORICAL_MAP.md).

## Code

| File | What it does |
| --- | --- |
| `src/atlas/time.ts` | Years (`-218` = 218 BCE, no year 0), conversion to astronomical years, and the MapLibre filters used for time: `existedIn`, `eventNear`, `ohmExisted`. |
| `src/atlas/catalog.ts` | The layer catalog: groups, datasets and credits, sources, and each layer's MapLibre styles for a given year. |
| `src/atlas/Timeline.tsx` | The timeline: slider, ±1 and ±10 year steps, play, and a zoomable span. |
| `src/atlas/AtlasMap.tsx` | The map: adds and removes layers as they are toggled, updates filters when the year changes, loads border time slices, war sequences, feature cards with sources, and the layer panel. |
| `scripts/atlas-build/build.py` | Downloads the source datasets and writes the simplified data packs in `public/atlas/`. |

Rebuild the data packs with `pip install shapely pyshp` and then
`python3 scripts/atlas-build/build.py` (or pass one step name: `pleiades`, `awmc`,
`cliopatria`, `wikidata`, `naturalearth`). Downloads are cached in
`scripts/atlas-build/.cache/`, which git ignores.

## Layers and the dataset behind each

| Group | Layer | Dataset | Notes |
| --- | --- | --- | --- |
| Places | Ancient settlements, ports, forts, archaeological sites | Pleiades | Pleiades does not classify places by size, so ancient places are not split into cities, towns and villages. |
| Places | Cities, towns, villages | OpenHistoricalMap | Only features with a start date are shown. Coverage is best in later periods. |
| Physical | Terrain | Terrain Tiles (Mapzen/AWS) | Modern elevation data. |
| Physical | Coastlines (modern) / Ancient coastlines | Natural Earth / AWMC | Ancient shorelines are dated by Barrington Atlas period. |
| Physical | Rivers | Natural Earth + Pleiades | Rivers are drawn along their modern courses, and the map labels them as modern. |
| Physical | Lakes & wetlands, mountains, passes | AWMC, Pleiades | |
| Infrastructure | Ancient road network | AWMC | Roads whose period is not recorded are drawn dashed, and only for the ancient period. |
| Infrastructure | Roads (dated, all eras) | OpenHistoricalMap | |
| Infrastructure | Bridges | Pleiades | |
| Political | Empires, kingdoms, republics, other states | Cliopatria (Seshat) | Polity types come from Wikidata classes. Polities without a matching class go under "Other states & peoples". |
| Political | Provinces | Pleiades, AWMC, Cliopatria | |
| Political | Imperial extents | AWMC | These are snapshots of single moments, shown within ±50 years of their date. Dates that aren't given in the source are marked approximate. |
| Political | Historical borders | Cliopatria + OpenHistoricalMap | |
| Military | Battles, sieges, campaigns | Wikidata | Items need both a coordinate and a date. Campaigns are shown as points only. |
| Military | Wars | Wikidata | A selected war numbers its battles and sieges in date order. The numbers are not a route. |
| Military | Military movements | none | Shown as unavailable: no open dataset of dated troop movements exists. |
| Economic & cultural | Trade routes | none | Shown as unavailable: no open, dated, scholarly route dataset suits this map. |
| Economic & cultural | Markets, religious sites, theatres/stadia | Pleiades | |
| Political | Domesday shires & hundreds (1086) | Domesday Shires and Hundreds (Brookes 2020, ADS) | Shown 1066–1106, always as the 1086 arrangement. |
| Infrastructure | Gough Map routes (c. 1400) | Routes and Roads of the Gough Map (Oksanen & Brookes 2024, ADS) | Way stations, schematic red lines, matched routes; 1350–1450. |
| Infrastructure | Navigable rivers before 1348 | Inland Navigation GIS (Oksanen 2019, ADS) | Direct vs place-name evidence, heads of navigation; 1000–1348. |
| Places | Rural settlement provinces (England) | Atlas of Rural Settlement (English Heritage) | Disabled in the public build: its terms allow personal use only. Local builds: `VITE_SHELF_LOCAL_DATA=1`. |

## Licences and attribution

| Dataset | Licence |
| --- | --- |
| [Pleiades](https://pleiades.stoa.org/) | CC BY 3.0 |
| [Ancient World Mapping Center](https://awmc.unc.edu/) geodata | ODbL |
| [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat) | CC BY 4.0 |
| [Wikidata](https://www.wikidata.org/) | CC0 |
| [Natural Earth](https://www.naturalearthdata.com/) | Public domain |
| [OpenHistoricalMap](https://www.openhistoricalmap.org/) (tiles and fonts) | CC0 |
| [Terrain Tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | Various; see the linked page |
| [Domesday Shires and Hundreds](https://doi.org/10.5284/1058999), [Gough Map GIS](https://doi.org/10.5284/1124312), [Inland Navigation GIS](https://doi.org/10.5284/1057497) (ADS) | CC BY 4.0 |
| [Atlas of Rural Settlement in England GIS](https://doi.org/10.5284/1031493) | © English Heritage; personal and business use — not republished |
| [World Historical Gazetteer](https://whgazetteer.org/) (queried, not downloaded) | Index CC BY-NC 4.0; each source its own licence |

Attribution for datasets appears in three places:

- The map's credits (the ⓘ button) list every dataset in use.
- The "Sources & attribution" list names each dataset used by the layers that are switched on.
- Each feature's card names the dataset it came from and links to the source record.

`public/atlas/manifest.json` records the licence, attribution and build notes for every dataset.

## How uncertainty is shown

- **Pleiades places.** Precise locations are drawn as filled dots and rough ones as hollow dots. Places the source marks uncertain are faded and labelled with "?". Pleiades dates are broad periods, not founding dates, and each card says so. Places with no dates at all are shown only up to 640 CE.
- **Borders.** Borders are one reconstruction, and each card says so.
- **Wikidata events.** Events dated only to the decade or century say so on their card.
- **Missing data.** Layers with no data for the chosen year show a coverage note in the layer panel. Layers with no suitable dataset are listed but disabled, with the reason given.

Nothing is drawn unless it is in one of these datasets. The atlas does not interpolate, guess or generate any data with AI.

## The atlas in the reader

The atlas opens over the book as an overlay (`src/components/history/AtlasPanel.tsx`). The EPUB is never reloaded, and the reading position, chapter, text size, settings, highlights and bookmarks are left alone. "Jump to passage" closes the atlas and goes to the passage, and "Back to where you were" returns to the previous page. Phones without WebGL keep the simpler OpenHistoricalMap panel.

| Feature | How it works | Source of truth |
| --- | --- | --- |
| Dotted place names in the text | Underlined only when all of these hold: the chapter gives a date inside a gazetteer's coverage; the name follows a place word ("to", "siege of"…) or is already a known place; exactly one place in the gazetteer carries that name, with a certain location. Ambiguous names such as "Alexandria" stay plain. | Pleiades |
| Place popup | Shows the historical names used around the year, the year and where it came from, the recorded date range, the polity (Cliopatria) and the "part of" region (Pleiades). "Why this place?" explains the match. | Pleiades, Cliopatria |
| Map this chapter / Map this passage | Finds names in reading order and resolves them offline first, then online (WHG or Wikidata). Only confident matches are pinned; unresolved names appear only if you ask. | Pleiades, WHG, Wikidata |
| Route mode | Numbers the places in the order the text names them. An optional dashed line is always labelled "Route reconstructed from the text". | The book's own order |
| Place history | Shows names with their dates, date range, coordinates and certainty, region, polity, recorded events within 20 miles, related places ("succeeds", "port of"…), sources, "Why is this place here?" and private notes. | Pleiades, Cliopatria, Wikidata |
| What am I looking at? | Shows the polity, region, nearest dated settlements and wars with battles nearby in that year. When a simplified border misses a coastal point, it says "at the edge of" instead. Places are listed by distance only, because Pleiades records no city sizes. | Cliopatria, Pleiades, Wikidata |
| Nearby / what's around | Searches a radius of 10, 25, 50 or 100 miles. It can filter to places recorded around the year (undated places are included and marked), and lists roads, rivers and battles. Places that no longer exist are included. | Pleiades, AWMC, Wikidata |
| Events | Lists wars and events named in the chapter and wars with battles near the place. Choosing a war numbers its battles on the map; these numbers are not a route. An event card shows the date, location, part-of, participants (read live from the same Wikidata item) and the source. | Wikidata |
| Timeline | Play/pause, adjustable speed, step ±1 or ±10 years, and "Jump to…" a battle of the selected war or the book's dates. A note while playing says border dates are approximate. | — |
| Compare dates | For one spot, shows the polity at two years and the recorded events in between. | Cliopatria, Wikidata |
| Historical search | Searches places by any recorded name, wars, battles, and kingdoms/empires, plus modern names online. | Pleiades, Wikidata, Cliopatria |
| Saved views, notes, places met | Stored in the app database: `mapBookmarks`, `mapNotes`, `placeVisits` (schema v7). They are included in backups and never sent to any service. | You |

### Names across time

Two names are linked only when a dataset records the link. Pleiades lists "Constantinople" and "Istanbul" as names of Constantinopolis, and records that Constantinopolis *succeeds* Byzantium, which is a separate record. The atlas shows that chain, but it never merges places because their names look alike.

### Certainty on the map

Each certainty level is drawn only when the source says so:

- **Known:** a solid dot.
- **Approximate:** a soft area.
- **Uncertain:** a hollow dot, a dashed ring and "?" after the name.
- **Disputed:** has its own style, but no current dataset marks disputes, so it is not used yet.

### AI

AI (the optional whole-book analysis) may supply place names found in the text, and "Why is this place here?" says so. Coordinates, names, dates, borders, roads and events always come from the datasets above.

### Adding a dataset for another period

- **Gazetteers:** register them in `GAZETTEERS` (`src/atlas/gazetteer.ts`) with a coverage span and a loader. `gazetteersFor(year)` picks the ones to use, so a medieval or early-modern gazetteer plugs in without reader changes.
- **Map layers:** add them to `LAYERS` in `src/atlas/catalog.ts` with `coverage`, `datasets` and credits.
- **Data packs:** built by `scripts/atlas-build/build.py`. The `gazetteer` step prepares the Pleiades records (all names with dates, "part of" and other relationships); the `world` step splits them, with Viabundus and al‑Ṯurayyā, into the tiled packs in `public/world/`. The `polities` step writes `cliopatria/names.json` for search.

## The historical world system

The atlas sits on a wider data system in `src/world/` and `public/world/`. The
full source audit — every dataset considered, its tier, licence, and whether it
is used offline, fetched live, only catalogued, or excluded — is in
[HISTORICAL_DATA_AUDIT.md](HISTORICAL_DATA_AUDIT.md).

| File | What it does |
| --- | --- |
| `src/world/histdate.ts` | Uncertain dates: earliest, latest, preferred year, precision (day to period), source, and conflicts. Parsing, formatting and comparison ("within", "possible", "outside"). |
| `src/world/axes.ts` | The regions, periods and data types used by the coverage matrix. |
| `src/world/registry.ts` | The source registry: each source's tier (A–D), access (offline, live, catalogued, excluded), coverage, licence, and what was verified. |
| `src/world/coverage.ts` | The coverage matrix (region × period × data type) built from the registry. |
| `src/world/select.ts` | Picks the best usable source for a place, date and data type, and names better sources that can't be used. |
| `src/world/evidence.ts` | Evidence labels and the "why is this empty?" explanation. An empty result is never presented as proof that nothing existed. |
| `src/world/live.ts` | Live lookups (CHGIS/TGAZ, HistoGIS), cached in IndexedDB. Failures are not cached. No keys are used or stored. |
| `src/world/whg.ts` | World Historical Gazetteer as an external reconciliation source: the Reconciliation API through Shelf's server (token stays there) or the public index; batching, device cache, time-outs, rate limits; every record keeps its id, source, names, dates, type, licence and links. |
| `src/world/placeEvidence.ts` | Weighs every source together for a name: groups records at the same spot, counts independent sources, checks names and dates against the year, and says who identifies it as what, where they agree or differ, and how sure the result is. |
| `src/world/crosscheck.ts` | CHGIS cross-check for Chinese places. |
| `src/world/changes.ts` | "What changed?" between two dates at one place. |
| `src/world/maps.ts` | The historical map archive: Library of Congress, David Rumsey, and georeferenced maps from Allmaps. Original maps are kept apart from reconstructions. |
| `src/world/bookWorld.ts` | "The world of this book": reads the book section by section in the background, collects places, dates, wars and events with their positions in the text, and resolves them. |
| `scripts/atlas-build/world.py`, `tiler.py` | Build the tiled place index and the vector tiles. |
| `scripts/atlas-build/england.py` | Domesday, Gough Map, inland navigation and rural-settlement tiles, read from the original ZIPs in `data/historical/raw/`. |

### Performance

The whole world is never loaded. Places are stored in 2° cells
(`public/world/places/c/`), with a sharded name index (`places/n/`) and an id
index (`places/i/`); only the cells in view or near a place are fetched, and
recently used cells stay in memory. Dense layers (Pleiades, Itiner-e, Viabundus,
al‑Ṯurayyā) are PMTiles vector tiles, so the map only requests the tiles for the
current view and zoom. The service worker keeps what was fetched for offline use.

### Combining evidence for a place

Shelf doesn't take whichever database answers first. For a name read in a book it gathers every record that could
be the place — Pleiades, Viabundus, al‑Ṯurayyā offline, and the World Historical Gazetteer online — and weighs them
together (`placeEvidence.ts`). The place card's "How sure is this?" then says, for example: Pleiades identifies
this as Capua; WHG has four attestations at the same spot from three other sources; these sources agree; another
source gives a different identification 140 km away; for 216 BCE only one of them fits the date. WHG records are
candidate evidence: they can make an ambiguous offline match "likely", never certain, and a clear offline match
never waits for them. A source with no record is reported as silent, never as proof the place didn't exist.

### Old maps over the modern map

A scanned map can be laid over the map only when Allmaps has control points for
it. Shelf fits an affine transform (or a projective one, when it is clearly
better) to those points, states the fitting error, and refuses maps with too few
points or too large an error. The image is requested at a size the IIIF server
allows. Placement is approximate: it is only as good as the georeference.

### Limits

- Allmaps coverage varies a lot by place; many regions have no georeferenced maps.
- DAMAST, CShapes, HGIS de las Indias, the NLS map layers and Old Maps Online are catalogued but not used. CShapes is non-commercial only. GB1900 is skipped for now.
- The Atlas of Rural Settlement is in local builds only (its terms don't allow republishing).
- In "What changed?", roads and routes are shown on the map only, not listed.
- Live sources (maps, CHGIS, HistoGIS, World Historical Gazetteer) need an internet connection.
