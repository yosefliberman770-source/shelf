// Every map layer the atlas can show, which scholarly dataset each one comes
// from, and how each one follows the timeline. Layers are independent: each
// can be switched on or off, and adding a layer or a dataset means adding an
// entry here — the map, panel and attribution read this catalogue.
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { eventNear, existedIn, type HistYear, ohmExisted } from './time';

export type GroupId = 'places' | 'physical' | 'infrastructure' | 'political' | 'military' | 'economic';
export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'places', label: 'Places' },
  { id: 'physical', label: 'Physical geography' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'political', label: 'Political' },
  { id: 'military', label: 'Military' },
  { id: 'economic', label: 'Economic & cultural' },
];

export type DatasetId = 'pleiades' | 'awmc' | 'cliopatria' | 'wikidata' | 'naturalearth' | 'ohm' | 'terrain';

/** How each dataset is credited on the map. Full licences are in public/atlas/manifest.json. */
export const DATASET_CREDIT: Record<DatasetId, { name: string; url: string; license: string }> = {
  pleiades: { name: 'Pleiades', url: 'https://pleiades.stoa.org/', license: 'CC BY 3.0' },
  awmc: { name: 'Ancient World Mapping Center', url: 'https://awmc.unc.edu/', license: 'ODbL' },
  cliopatria: { name: 'Cliopatria / Seshat', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', license: 'CC BY 4.0' },
  wikidata: { name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0' },
  naturalearth: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com/', license: 'public domain' },
  ohm: { name: 'OpenHistoricalMap', url: 'https://www.openhistoricalmap.org/copyright', license: 'CC0' },
  terrain: { name: 'Terrain Tiles (Mapzen/AWS, SRTM & others)', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md', license: 'see sources' },
};

export interface LayerCtx {
  year: HistYear;
  /** Where the data packs are served, e.g. "/shelf/atlas/". */
  base: string;
  /** Show events within ± this many years. */
  eventWindow: number;
  /** A war picked in the Military panel (Wikidata id). */
  war?: string;
}

export interface AtlasLayerDef {
  id: string;
  group: GroupId;
  /** Also listed in another group (e.g. ports are both a place and infrastructure). */
  alsoIn?: GroupId[];
  label: string;
  /** What the layer shows, in a line — including its limits. */
  hint: string;
  datasets: DatasetId[];
  defaultOn: boolean;
  /** Years the data covers; outside them the panel says there's nothing to show. */
  coverage?: [HistYear, HistYear];
  /** Set when no suitable open scholarly dataset exists yet. The toggle is shown but disabled. */
  unavailable?: string;
  sources: string[];
  specs: (ctx: LayerCtx) => LayerSpecification[];
}

// ── Palette (muted, map-like; works on the parchment base) ────────────────
const C = {
  settlement: '#7a4a1e', city: '#5b2c0f', town: '#7a4a1e', village: '#9c7a57', port: '#1f6f8b', fort: '#8b2e2e', arch: '#8a7d5a',
  river: '#4f8fb3', lake: '#9cc3d6', mountain: '#6d5a44', pass: '#a0522d', coast: '#5f7f8f', ancientCoast: '#1d4e66',
  road: '#9b2226', roadOhm: '#bb6a2b', bridge: '#444444',
  empire: '#b03a2e', kingdom: '#2e7d32', republic: '#1565c0', otherState: '#7b6a58', province: '#6d4c41', territory: '#8e44ad', border: '#5d4037',
  battle: '#c62828', siege: '#6a1b9a', campaign: '#ef6c00', war: '#000000',
  market: '#b8860b', religious: '#6b3fa0', cultural: '#c0582a', halo: '#fbf7ee',
};
const FONT = ['OpenHistorical'];
const FONT_BOLD = ['OpenHistorical Bold'];
const FONT_ITALIC = ['OpenHistorical Italic'];

/** Pleiades covers the ancient world; undated Pleiades records are shown only up to 640 CE, faintly. */
const PLEIADES_UNDATED_UNTIL = 640;
/** AWMC/Barrington data covers the Greek and Roman world, c. 750 BCE – 640 CE. */
const BARRINGTON: [HistYear, HistYear] = [-750, 640];

const u = (k = 'u'): ExpressionSpecification => ['coalesce', ['get', k], 0];
/** Fainter when uncertain, when rough, or when the date isn't recorded. */
const certaintyOpacity = (strong = 0.95): ExpressionSpecification => ['case',
  ['>=', u(), 1], strong * 0.55,
  ['!', ['any', ['has', 'f'], ['has', 't']]], strong * 0.5,
  ['==', ['get', 'db'], 'names'], strong * 0.7,
  strong];

// ── Shared sources ────────────────────────────────────────────────────────
export const SOURCE_SPECS: Record<string, (ctx: LayerCtx) => SourceSpecification> = {
  'pleiades-places': (c) => ({ type: 'geojson', data: c.base + 'pleiades-places.json', attribution: credit('pleiades') }),
  'pleiades-lines': (c) => ({ type: 'geojson', data: c.base + 'pleiades-lines.json', attribution: credit('pleiades') }),
  'pleiades-provinces': (c) => ({ type: 'geojson', data: c.base + 'pleiades-provinces.json', attribution: credit('pleiades') }),
  'awmc-roads': (c) => ({ type: 'geojson', data: c.base + 'awmc-roads.json', attribution: credit('awmc') }),
  'awmc-shoreline': (c) => ({ type: 'geojson', data: c.base + 'awmc-shoreline.json', attribution: credit('awmc') }),
  'awmc-inland-water': (c) => ({ type: 'geojson', data: c.base + 'awmc-inland-water.json', attribution: credit('awmc') }),
  'awmc-snapshots': (c) => ({ type: 'geojson', data: c.base + 'awmc-snapshots.json', attribution: credit('awmc') }),
  'wikidata-events': (c) => ({ type: 'geojson', data: c.base + 'wikidata-events.json', attribution: credit('wikidata') }),
  'ne-rivers': (c) => ({ type: 'geojson', data: c.base + 'ne-rivers.json', attribution: credit('naturalearth') }),
  // Borders are split into time slices; the map swaps the file as the year moves.
  cliopatria: () => ({ type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: credit('cliopatria') }),
  // A war picked in the Military panel, numbered in date order (built by the map).
  'war-sequence': () => ({ type: 'geojson', data: { type: 'FeatureCollection', features: [] } }),
  ohm: () => ({ type: 'vector', tiles: ['https://vtiles.openhistoricalmap.org/maps/ohm/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, attribution: credit('ohm') }),
  terrain: () => ({ type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 12, attribution: credit('terrain') }),
};

export function credit(id: DatasetId): string {
  const d = DATASET_CREDIT[id];
  return `<a href="${d.url}" target="_blank" rel="noreferrer">${d.name}</a> (${d.license})`;
}

// ── Layer builders ────────────────────────────────────────────────────────
function pleiadesPoints(id: string, cat: string, color: string, ctx: LayerCtx, opts: { labelZoom?: number; radius?: number; minzoom?: number } = {}): LayerSpecification[] {
  const filter = ['all', ['in', cat, ['get', 'l']], existedIn(ctx.year, { undated: { until: PLEIADES_UNDATED_UNTIL } })] as FilterSpecification;
  const r = opts.radius ?? 3.5;
  return [
    {
      id: `${id}-pt`, type: 'circle', source: 'pleiades-places', filter, minzoom: opts.minzoom ?? 3,
      paint: {
        // Small when zoomed out: thousands of sites would otherwise hide the map.
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, r * 0.3, 5, r * 0.55, 8, r * 1.3, 12, r * 2],
        // Rough locations are drawn hollow; precise ones filled.
        'circle-color': color,
        'circle-opacity': ['case', ['==', ['get', 'p'], 0], 0.12, certaintyOpacity()],
        'circle-stroke-color': color,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['==', ['get', 'p'], 0], 0.8, 0], 7, ['case', ['==', ['get', 'p'], 0], 1.4, 0.6]],
        'circle-stroke-opacity': certaintyOpacity(),
      },
    },
    {
      id: `${id}-label`, type: 'symbol', source: 'pleiades-places', filter, minzoom: opts.labelZoom ?? 7,
      layout: {
        'text-field': ['case', ['>=', u(), 1], ['concat', ['get', 'n'], ' ?'], ['get', 'n']],
        'text-font': FONT,
        'text-size': 11.5, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true,
      },
      paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.4, 'text-opacity': certaintyOpacity(1) },
    },
  ];
}

function ohmPlaces(id: string, types: string[], color: string, minzoom: number, size: number, ctx: LayerCtx): LayerSpecification[] {
  const filter = ['all', ['in', ['get', 'type'], ['literal', types]], ohmExisted(ctx.year)] as FilterSpecification;
  return [
    { id: `${id}-pt`, type: 'circle', source: 'ohm', 'source-layer': 'place_points_centroids', filter, minzoom, paint: { 'circle-radius': size, 'circle-color': color, 'circle-stroke-color': C.halo, 'circle-stroke-width': 1 } },
    { id: `${id}-label`, type: 'symbol', source: 'ohm', 'source-layer': 'place_points_centroids', filter, minzoom, layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': size * 3.2, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
  ];
}

function polityClass(id: string, match: ExpressionSpecification, color: string, ctx: LayerCtx): LayerSpecification[] {
  const filter = ['all', match, existedIn(ctx.year)] as FilterSpecification;
  return [
    { id: `${id}-fill`, type: 'fill', source: 'cliopatria', filter, paint: { 'fill-color': color, 'fill-opacity': 0.13 } },
    { id: `${id}-edge`, type: 'line', source: 'cliopatria', filter, paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 7, 1.6], 'line-opacity': 0.65, 'line-blur': 0.6 } },
    { id: `${id}-label`, type: 'symbol', source: 'cliopatria', filter, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 14], 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 8, 'symbol-placement': 'point', 'text-optional': true }, paint: { 'text-color': color, 'text-opacity': 0.8, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
  ];
}

function events(id: string, kind: string, color: string, ctx: LayerCtx): LayerSpecification[] {
  const filter = ['all', ['==', ['get', 'k'], kind], eventNear(ctx.year, ctx.eventWindow)] as FilterSpecification;
  return [
    { id: `${id}-pt`, type: 'circle', source: 'wikidata-events', filter, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 8, 6], 'circle-color': color, 'circle-opacity': ['case', ['>=', u(), 1], 0.5, 0.9], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } },
    { id: `${id}-label`, type: 'symbol', source: 'wikidata-events', filter, minzoom: 4, layout: { 'text-field': ['concat', ['get', 'n'], '\n', ['case', ['<', ['get', 'y'], 0], ['concat', ['to-string', ['-', 0, ['get', 'y']]], ' BCE'], ['concat', ['to-string', ['get', 'y']], ' CE']]], 'text-font': FONT_BOLD, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },
  ];
}

// ── The catalogue ─────────────────────────────────────────────────────────
export const LAYERS: AtlasLayerDef[] = [
  // PLACES
  {
    id: 'settlements', group: 'places', label: 'Ancient settlements', datasets: ['pleiades'], defaultOn: true, coverage: [-3000, 1500],
    hint: 'Cities, towns and villages of the ancient world. Pleiades doesn’t record size, so they aren’t split into city/town/village. Hollow = rough location; faded = uncertain or undated.',
    sources: ['pleiades-places'], specs: (c) => pleiadesPoints('settlements', 'settlement', C.settlement, c, { labelZoom: 6, radius: 3.6 }),
  },
  {
    id: 'cities', group: 'places', label: 'Cities', datasets: ['ohm'], defaultOn: true,
    hint: 'Places mapped as cities in OpenHistoricalMap, shown only when their dates cover the year. Coverage is strongest after 1500; sparse in antiquity.',
    sources: ['ohm'], specs: (c) => ohmPlaces('cities', ['city'], C.city, 4, 3.6, c),
  },
  {
    id: 'towns', group: 'places', label: 'Towns', datasets: ['ohm'], defaultOn: true,
    hint: 'Towns from OpenHistoricalMap (dated features only).', sources: ['ohm'], specs: (c) => ohmPlaces('towns', ['town'], C.town, 7, 2.8, c),
  },
  {
    id: 'villages', group: 'places', label: 'Villages', datasets: ['ohm'], defaultOn: false,
    hint: 'Villages and hamlets from OpenHistoricalMap (dated features only; zoom in to see them).', sources: ['ohm'], specs: (c) => ohmPlaces('villages', ['village', 'hamlet'], C.village, 10, 2.2, c),
  },
  {
    id: 'ports', group: 'places', alsoIn: ['infrastructure'], label: 'Ports & harbours', datasets: ['pleiades'], defaultOn: true, coverage: [-3000, 1500],
    hint: 'Ports, harbours, anchorages and lighthouses recorded in Pleiades.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('ports', 'port', C.port, c, { labelZoom: 6, radius: 3.4 }),
  },
  {
    id: 'forts', group: 'places', label: 'Forts', datasets: ['pleiades'], defaultOn: false, coverage: [-3000, 1500],
    hint: 'Forts, fortlets, hillforts, castles and military camps recorded in Pleiades.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('forts', 'fort', C.fort, c, { labelZoom: 8, radius: 2.8 }),
  },
  {
    id: 'archaeological', group: 'places', label: 'Archaeological sites', datasets: ['pleiades'], defaultOn: false, coverage: [-3000, 1500],
    hint: 'Archaeological sites, tells, ruins, tumuli and nuraghi recorded in Pleiades.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('archaeological', 'archaeological', C.arch, c, { labelZoom: 9, radius: 2.6 }),
  },

  // PHYSICAL GEOGRAPHY
  {
    id: 'terrain', group: 'physical', label: 'Terrain', datasets: ['terrain'], defaultOn: true,
    hint: 'Shaded relief from modern elevation data. Mountains haven’t moved much; coastlines and rivers have.', sources: ['terrain'],
    specs: () => [{ id: 'terrain-hillshade', type: 'hillshade', source: 'terrain', paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#5a4a3a', 'hillshade-highlight-color': '#fffaf0', 'hillshade-accent-color': '#6d5a44' } }],
  },
  {
    id: 'coast-modern', group: 'physical', label: 'Coastlines (modern)', datasets: ['naturalearth'], defaultOn: false,
    hint: 'Today’s coastline, for comparison with ancient shores.', sources: [],
    specs: () => [{ id: 'coast-modern-line', type: 'line', source: 'ne-land', paint: { 'line-color': C.coast, 'line-width': 0.8, 'line-dasharray': [2, 2] } }],
  },
  {
    id: 'coast-ancient', group: 'physical', label: 'Ancient coastlines', datasets: ['awmc'], defaultOn: true, coverage: BARRINGTON,
    hint: 'Shorelines of the Greek and Roman world by period (Barrington Atlas via AWMC). Lighter lines are marked as less accurate in the source.', sources: ['awmc-shoreline'],
    specs: (c) => [{ id: 'coast-ancient-line', type: 'line', source: 'awmc-shoreline', filter: existedIn(c.year, { undated: { until: 640 } }) as FilterSpecification, paint: { 'line-color': C.ancientCoast, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 9, 1.8], 'line-opacity': ['case', ['>=', u(), 1], 0.4, ['==', ['get', 'as'], 1], 0.4, 0.85] } }],
  },
  {
    id: 'rivers', group: 'physical', label: 'Rivers', datasets: ['naturalearth', 'pleiades'], defaultOn: true,
    hint: 'Blue: rivers as they run today (Natural Earth) — many have shifted since antiquity. Darker named lines: ancient river courses recorded in Pleiades.', sources: ['ne-rivers', 'pleiades-lines'],
    specs: (c) => [
      { id: 'rivers-modern', type: 'line', source: 'ne-rivers', filter: ['<=', ['get', 'sr'], ['step', ['zoom'], 5, 4, 7, 6, 10]] as FilterSpecification, paint: { 'line-color': C.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 9, 1.6], 'line-opacity': 0.55 } },
      { id: 'rivers-ancient', type: 'line', source: 'pleiades-lines', filter: ['all', ['==', ['get', 'k'], 'river'], existedIn(c.year, { undated: 'show' })] as FilterSpecification, paint: { 'line-color': '#2b6f95', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 9, 2.4], 'line-opacity': certaintyOpacity(0.9) } },
      { id: 'rivers-label', type: 'symbol', source: 'ne-rivers', minzoom: 5, filter: ['has', 'n'] as FilterSpecification, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 11 }, paint: { 'text-color': '#2b6f95', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
    ],
  },
  {
    id: 'lakes', group: 'physical', label: 'Lakes & wetlands', datasets: ['awmc', 'pleiades'], defaultOn: true,
    hint: 'Lakes, seasonal (dry) lakes, marshes and flood areas mapped by AWMC for the ancient world (outlines are modern-based), plus lakes named in Pleiades.', sources: ['awmc-inland-water', 'pleiades-places'],
    specs: (c) => [
      { id: 'lakes-fill', type: 'fill', source: 'awmc-inland-water', filter: ['in', ['get', 'k'], ['literal', ['lake', 'water', 'dry lake', 'dry lakr', 'swamp', 'inundation area']]] as FilterSpecification,
        paint: { 'fill-color': ['match', ['get', 'k'], ['swamp', 'inundation area'], '#a9c7a0', ['dry lake', 'dry lakr'], '#d7cdb0', C.lake], 'fill-opacity': 0.8 } },
      ...pleiadesPoints('lakes', 'lake', '#2b6f95', c, { labelZoom: 7, radius: 2 }),
    ],
  },
  {
    id: 'mountains', group: 'physical', label: 'Mountains', datasets: ['pleiades'], defaultOn: false,
    hint: 'Mountains, hills and volcanoes named in ancient sources (Pleiades).', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('mountains', 'mountain', C.mountain, c, { labelZoom: 6, radius: 2.8 }),
  },
  {
    id: 'passes', group: 'physical', label: 'Mountain passes', datasets: ['pleiades'], defaultOn: false,
    hint: 'Passes recorded in Pleiades (e.g. Alpine passes).', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('passes', 'pass', C.pass, c, { labelZoom: 6, radius: 3 }),
  },

  // INFRASTRUCTURE
  {
    id: 'roads-ancient', group: 'infrastructure', label: 'Ancient road network', datasets: ['awmc'], defaultOn: true, coverage: BARRINGTON,
    hint: 'Roads of the Greek and Roman world from the Barrington Atlas (AWMC). Dashed where the source gives no period (shown up to 640 CE); faded where the period is marked uncertain.', sources: ['awmc-roads'],
    specs: (c) => [
      { id: 'roads-ancient-dated', type: 'line', source: 'awmc-roads', filter: existedIn(c.year) as FilterSpecification, paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 9, 2.2], 'line-opacity': ['case', ['>=', u(), 1], 0.45, 0.85] } },
      { id: 'roads-ancient-undated', type: 'line', source: 'awmc-roads', filter: (c.year >= -750 && c.year <= 640 ? ['!', ['has', 'f']] : ['has', '__never']) as FilterSpecification, paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 9, 1.6], 'line-opacity': 0.4, 'line-dasharray': [3, 2] } },
    ],
  },
  {
    id: 'roads', group: 'infrastructure', label: 'Roads (dated, all eras)', datasets: ['ohm'], defaultOn: false,
    hint: 'Major roads mapped in OpenHistoricalMap with dates — mostly medieval and modern, some ancient.', sources: ['ohm'],
    specs: (c) => [{ id: 'roads-ohm', type: 'line', source: 'ohm', 'source-layer': 'transport_lines', minzoom: 5, filter: ['all', ['in', ['get', 'type'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]], ohmExisted(c.year)] as FilterSpecification, paint: { 'line-color': C.roadOhm, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 12, 2.5] } }],
  },
  {
    id: 'bridges', group: 'infrastructure', label: 'Bridges', datasets: ['pleiades'], defaultOn: false, coverage: [-3000, 1500],
    hint: 'Bridges recorded in Pleiades.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('bridges', 'bridge', C.bridge, c, { labelZoom: 9, radius: 2.4 }),
  },

  // POLITICAL
  {
    id: 'empires', group: 'political', label: 'Empires', datasets: ['cliopatria', 'wikidata'], defaultOn: true,
    hint: 'Polities Wikidata classes as empires, with territory from Cliopatria. One scholarly version of each border — real frontiers were rarely this sharp.', sources: ['cliopatria'],
    specs: (c) => polityClass('empires', ['==', ['get', 'c'], 'empire'], C.empire, c),
  },
  {
    id: 'kingdoms', group: 'political', label: 'Kingdoms', datasets: ['cliopatria', 'wikidata'], defaultOn: true,
    hint: 'Polities Wikidata classes as kingdoms or realms (territory: Cliopatria).', sources: ['cliopatria'], specs: (c) => polityClass('kingdoms', ['==', ['get', 'c'], 'kingdom'], C.kingdom, c),
  },
  {
    id: 'republics', group: 'political', label: 'Republics', datasets: ['cliopatria', 'wikidata'], defaultOn: true,
    hint: 'Polities Wikidata classes as republics (territory: Cliopatria).', sources: ['cliopatria'], specs: (c) => polityClass('republics', ['==', ['get', 'c'], 'republic'], C.republic, c),
  },
  {
    id: 'other-states', group: 'political', label: 'Other states & peoples', datasets: ['cliopatria'], defaultOn: true,
    hint: 'City-states, leagues, confederations and polities whose type isn’t recorded in Wikidata.', sources: ['cliopatria'],
    specs: (c) => polityClass('other-states', ['!', ['in', ['coalesce', ['get', 'c'], ''], ['literal', ['empire', 'kingdom', 'republic', 'province']]]], C.otherState, c),
  },
  {
    id: 'provinces', group: 'political', label: 'Provinces', datasets: ['pleiades', 'awmc', 'cliopatria'], defaultOn: false,
    hint: 'Named provinces and regions with outlines (Pleiades), Roman provincial outlines for 200 CE and c. 300 CE (AWMC — names not in that dataset; shown within 50 years of their date), and provinces in Cliopatria.', sources: ['pleiades-provinces', 'awmc-snapshots', 'cliopatria'],
    specs: (c) => [
      { id: 'provinces-pleiades', type: 'line', source: 'pleiades-provinces', filter: existedIn(c.year) as FilterSpecification, paint: { 'line-color': C.province, 'line-width': 1.1, 'line-dasharray': [4, 2], 'line-opacity': certaintyOpacity(0.8) } },
      { id: 'provinces-pleiades-label', type: 'symbol', source: 'pleiades-provinces', filter: existedIn(c.year) as FilterSpecification, minzoom: 4, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 11, 'text-optional': true }, paint: { 'text-color': C.province, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
      { id: 'provinces-awmc', type: 'line', source: 'awmc-snapshots', filter: ['all', ['==', ['get', 'k'], 'province'], ['<=', ['abs', ['-', ['get', 'f'], c.year]], 50]] as FilterSpecification, paint: { 'line-color': C.province, 'line-width': 0.9, 'line-dasharray': [2, 2], 'line-opacity': 0.7 } },
      ...polityClass('provinces-clio', ['==', ['get', 'c'], 'province'], C.province, c),
    ],
  },
  {
    id: 'territories', group: 'political', label: 'Imperial extents (snapshots)', datasets: ['awmc'], defaultOn: false,
    hint: 'AWMC outlines of particular moments — Persian Empire, Alexander’s empire, Rome in 60 BCE, 117 CE and 200 CE, Hasmonean and Herodian kingdoms. Shown within 50 years of the moment each depicts; the label gives its date.', sources: ['awmc-snapshots'],
    specs: (c) => {
      const filter = ['all', ['==', ['get', 'k'], 'extent'], ['<=', ['abs', ['-', ['get', 'f'], c.year]], 50]] as FilterSpecification;
      return [
        { id: 'territories-fill', type: 'fill', source: 'awmc-snapshots', filter, paint: { 'fill-color': C.territory, 'fill-opacity': 0.08 } },
        { id: 'territories-edge', type: 'line', source: 'awmc-snapshots', filter, paint: { 'line-color': C.territory, 'line-width': 1.6, 'line-dasharray': [5, 2], 'line-opacity': 0.8 } },
        { id: 'territories-label', type: 'symbol', source: 'awmc-snapshots', filter, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 12, 'text-max-width': 10 }, paint: { 'text-color': C.territory, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
      ];
    },
  },
  {
    id: 'borders', group: 'political', label: 'Historical borders', datasets: ['cliopatria', 'ohm'], defaultOn: true,
    hint: 'Outlines of every polity in the chosen year (Cliopatria), plus country borders mapped in OpenHistoricalMap (dated features, mainly after 1500).', sources: ['cliopatria', 'ohm'],
    specs: (c) => [
      { id: 'borders-clio', type: 'line', source: 'cliopatria', filter: existedIn(c.year) as FilterSpecification, paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 7, 1.2], 'line-opacity': 0.55 } },
      { id: 'borders-ohm', type: 'line', source: 'ohm', 'source-layer': 'land_ohm_lines', filter: ['all', ['==', ['get', 'admin_level'], 2], ohmExisted(c.year)] as FilterSpecification, paint: { 'line-color': C.border, 'line-width': 1.2, 'line-dasharray': [3, 1.5], 'line-opacity': 0.7 } },
    ],
  },

  // MILITARY
  {
    id: 'battles', group: 'military', label: 'Battles', datasets: ['wikidata'], defaultOn: true,
    hint: 'Battles with a recorded place and date (Wikidata). Faded where the date is only known to the decade or century.', sources: ['wikidata-events'], specs: (c) => events('battles', 'battle', C.battle, c),
  },
  {
    id: 'sieges', group: 'military', label: 'Sieges', datasets: ['wikidata'], defaultOn: true,
    hint: 'Sieges with a recorded place and date (Wikidata).', sources: ['wikidata-events'], specs: (c) => events('sieges', 'siege', C.siege, c),
  },
  {
    id: 'campaigns', group: 'military', label: 'Campaigns', datasets: ['wikidata'], defaultOn: false,
    hint: 'Military campaigns Wikidata places at a single point (usually where they began or were centred) — not their route.', sources: ['wikidata-events'], specs: (c) => events('campaigns', 'campaign', C.campaign, c),
  },
  {
    id: 'wars', group: 'military', label: 'Wars', datasets: ['wikidata'], defaultOn: true,
    hint: 'Lists the wars going on in the chosen year. Pick one to see all its battles and sieges on the map, numbered in date order.', sources: ['war-sequence'],
    specs: () => [
      { id: 'wars-pt', type: 'circle', source: 'war-sequence', paint: { 'circle-radius': 9, 'circle-color': '#ffffff', 'circle-stroke-color': C.battle, 'circle-stroke-width': 2 } },
      { id: 'wars-num', type: 'symbol', source: 'war-sequence', layout: { 'text-field': ['to-string', ['get', 'ord']], 'text-font': FONT_BOLD, 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': C.battle } },
      { id: 'wars-label', type: 'symbol', source: 'war-sequence', minzoom: 4, layout: { 'text-field': ['concat', ['get', 'n'], ' (', ['get', 'yl'], ')'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': C.battle, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
    ],
  },
  {
    id: 'movements', group: 'military', label: 'Military movements', datasets: [], defaultOn: false,
    unavailable: 'No open scholarly dataset of army routes is available. Pick a war under “Wars” to see its battles numbered in date order — the order of events, not the route taken.',
    hint: '', sources: [], specs: () => [],
  },

  // ECONOMIC & CULTURAL
  {
    id: 'trade-routes', group: 'economic', label: 'Trade routes', datasets: [], defaultOn: false,
    unavailable: 'No open scholarly trade-route dataset with dated routes is available yet, so none are drawn rather than guessed. Ports, markets and the ancient road network show the infrastructure trade used.',
    hint: '', sources: [], specs: () => [],
  },
  {
    id: 'markets', group: 'economic', label: 'Markets & fora', datasets: ['pleiades'], defaultOn: false, coverage: [-3000, 1500],
    hint: 'Agoras, fora, market halls (macella) and shops recorded in Pleiades.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('markets', 'market', C.market, c, { labelZoom: 9, radius: 3 }),
  },
  {
    id: 'religious', group: 'economic', label: 'Religious sites', datasets: ['pleiades'], defaultOn: false, coverage: [-3000, 1500],
    hint: 'Temples, sanctuaries, shrines, churches, monasteries, mosques and synagogues recorded in Pleiades.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('religious', 'religious', C.religious, c, { labelZoom: 9, radius: 2.8 }),
  },
  {
    id: 'cultural', group: 'economic', label: 'Theatres, stadia & gymnasia', datasets: ['pleiades'], defaultOn: false, coverage: [-3000, 1500],
    hint: 'Theatres, odea, amphitheatres, circuses, stadia and gymnasia recorded in Pleiades — the closest recorded data to “cultural centres”.', sources: ['pleiades-places'], specs: (c) => pleiadesPoints('cultural', 'cultural', C.cultural, c, { labelZoom: 9, radius: 2.8 }),
  },
];

export const layerById = (id: string) => LAYERS.find((l) => l.id === id);
export const DEFAULT_LAYERS = LAYERS.filter((l) => l.defaultOn && !l.unavailable).map((l) => l.id);

/** Order in which layers are drawn, bottom to top (areas under lines under points). */
export const DRAW_ORDER = ['terrain', 'lakes', 'empires', 'kingdoms', 'republics', 'other-states', 'territories', 'provinces', 'borders', 'coast-modern', 'coast-ancient', 'rivers', 'roads', 'roads-ancient',
  'archaeological', 'religious', 'cultural', 'markets', 'bridges', 'mountains', 'passes', 'forts', 'villages', 'towns', 'ports', 'settlements', 'cities', 'campaigns', 'sieges', 'battles', 'wars'];

export const PALETTE = C;
