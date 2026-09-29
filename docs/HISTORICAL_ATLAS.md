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
