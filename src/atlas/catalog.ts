// Every map layer the atlas can show, which scholarly dataset each one comes
// from, and how each one follows the timeline. Layers are independent: each
// can be switched on or off, and adding a layer or a dataset means adding an
// entry here — the map, panel and attribution read this catalogue.
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { eventNear, existedIn, type HistYear, ohmExisted } from './time';

/** Why a layer can't be shown: each reason is stated as it is, never lumped together as "no data". */
export type UnavailableKind = 'no-dataset' | 'licence' | 'online-only' | 'not-integrated';
export const UNAVAILABLE_LABEL: Record<UnavailableKind, string> = {
  'no-dataset': 'no suitable open dataset exists',
  licence: 'licence doesn’t allow publishing it here',
  'online-only': 'available online only',
  'not-integrated': 'not added to Shelf yet',
};

export type GroupId = 'places' | 'physical' | 'infrastructure' | 'political' | 'military' | 'economic';
export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'places', label: 'Places' },
  { id: 'physical', label: 'Physical geography' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'political', label: 'Political' },
  { id: 'military', label: 'Military' },
  { id: 'economic', label: 'Economic & cultural' },
];

export type DatasetId = 'pleiades' | 'awmc' | 'cliopatria' | 'wikidata' | 'naturalearth' | 'ohm' | 'terrain' | 'itinere' | 'viabundus' | 'althurayya'
  | 'domesday' | 'gough' | 'navigation' | 'ruralsettlement';

/** How each dataset is credited on the map. Full licences are in public/atlas/manifest.json. */
export const DATASET_CREDIT: Record<DatasetId, { name: string; url: string; license: string }> = {
  pleiades: { name: 'Pleiades', url: 'https://pleiades.stoa.org/', license: 'CC BY 3.0' },
  awmc: { name: 'Ancient World Mapping Center', url: 'https://awmc.unc.edu/', license: 'ODbL' },
  cliopatria: { name: 'Cliopatria / Seshat', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', license: 'CC BY 4.0' },
  wikidata: { name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0' },
  naturalearth: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com/', license: 'public domain' },
  ohm: { name: 'OpenHistoricalMap', url: 'https://www.openhistoricalmap.org/copyright', license: 'CC0' },
  terrain: { name: 'Terrain Tiles (Mapzen/AWS, SRTM & others)', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md', license: 'see sources' },
  itinere: { name: 'Itiner-e (Brughmans et al. 2024)', url: 'https://itiner-e.org/', license: 'CC BY 4.0' },
  viabundus: { name: 'Viabundus 2', url: 'https://www.viabundus.eu/', license: 'CC BY 4.0' },
  althurayya: { name: 'al-Ṯurayyā Gazetteer (after G. Cornu)', url: 'https://althurayya.github.io/', license: 'Apache-2.0' },
  domesday: { name: 'Domesday Shires and Hundreds (Brookes 2020, ADS)', url: 'https://doi.org/10.5284/1058999', license: 'CC BY 4.0' },
  gough: { name: 'Routes and Roads of the Gough Map (Oksanen & Brookes 2024, ADS)', url: 'https://doi.org/10.5284/1124312', license: 'CC BY 4.0' },
  navigation: { name: 'Inland Navigation before 1348 (Oksanen 2019, ADS)', url: 'https://doi.org/10.5284/1057497', license: 'CC BY 4.0' },
  ruralsettlement: { name: 'Atlas of Rural Settlement in England GIS (Roberts & Wrathmell, English Heritage)', url: 'https://doi.org/10.5284/1031493', license: '© English Heritage — personal use' },
};

/**
 * Datasets whose terms don't allow republishing: their tiles exist only in
 * local builds (VITE_SHELF_LOCAL_DATA=1) and are never deployed.
 */
const LOCAL_DATA = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SHELF_LOCAL_DATA === '1';

export interface LayerCtx {
  year: HistYear;
  /** Where the data packs are served, e.g. "/shelf/atlas/". */
  base: string;
  /** Where the World packs (tiles, place index) are served, e.g. "/shelf/world/". Defaults next to base. */
  world?: string;
  /** Show events within ± this many years. */
  eventWindow: number;
  /**
   * Also draw records that carry no dates — only inside their dataset's own period,
   * hollow and faint. Off by default: an undated record is not evidence that
   * something existed in the chosen year.
   */
  showUndated?: boolean;
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
  /** Why it's unavailable, in short — shown next to the layer name. */
  unavailableKind?: UnavailableKind;
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

/** Pleiades' core period (its period vocabulary runs from the Archaic to Late Antiquity). Undated Pleiades records can only be shown inside it, on request. */
const PLEIADES_CORE: [HistYear, HistYear] = [-750, 640];
/** AWMC/Barrington data covers the Greek and Roman world, c. 750 BCE – 640 CE. */
const BARRINGTON: [HistYear, HistYear] = [-750, 640];

const u = (k = 'u'): ExpressionSpecification => ['coalesce', ['get', k], 0];
/** Fainter when uncertain, when rough, or when the date isn't recorded. */
const certaintyOpacity = (strong = 0.95): ExpressionSpecification => ['case',
  ['>=', u(), 1], strong * 0.55,
  ['!', ['any', ['has', 'f'], ['has', 't']]], strong * 0.5,
  ['==', ['get', 'db'], 'names'], strong * 0.7,
  strong];

/** Vector tiles in a PMTiles archive, fetched by range request: only the tiles on screen are downloaded. */
const worldBase = (c: LayerCtx) => c.world ?? c.base.replace(/atlas\/$/, 'world/');
const pmtiles = (c: LayerCtx, file: string, id: DatasetId, maxzoom: number): SourceSpecification => {
  const path = `${worldBase(c)}tiles/${file}`;
  const abs = typeof location === 'undefined' ? `http://localhost${path}` : new URL(path, location.href).href;
  return { type: 'vector', url: `pmtiles://${abs}`, attribution: credit(id), maxzoom } as SourceSpecification;
};
/** Level of detail comes from the tiles themselves: each feature only appears from the zoom its dataset's own attributes warrant. */

// ── Shared sources ────────────────────────────────────────────────────────
export const SOURCE_SPECS: Record<string, (ctx: LayerCtx) => SourceSpecification> = {
  'pleiades-places': (c) => pmtiles(c, 'pleiades.pmtiles', 'pleiades', 10),
  itinere: (c) => pmtiles(c, 'itinere.pmtiles', 'itinere', 10),
  'viabundus-edges': (c) => pmtiles(c, 'viabundus-edges.pmtiles', 'viabundus', 11),
  'viabundus-nodes': (c) => pmtiles(c, 'viabundus-nodes.pmtiles', 'viabundus', 11),
  'thurayya-places': (c) => pmtiles(c, 'thurayya-places.pmtiles', 'althurayya', 10),
  'thurayya-routes': (c) => pmtiles(c, 'thurayya-routes.pmtiles', 'althurayya', 10),
  domesday: (c) => pmtiles(c, 'domesday.pmtiles', 'domesday', 10),
  gough: (c) => pmtiles(c, 'gough.pmtiles', 'gough', 11),
  navigation: (c) => pmtiles(c, 'navigation.pmtiles', 'navigation', 11),
  'rural-settlement': (c) => pmtiles(c, 'rural-settlement.pmtiles', 'ruralsettlement', 10),
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
  const filter = ['all', ['in', cat, ['get', 'l']], existedIn(ctx.year, { undated: ctx.showUndated ? { within: PLEIADES_CORE } : 'hide' })] as FilterSpecification;
  const r = opts.radius ?? 3.5;
  const imp: ExpressionSpecification = ['match', ['coalesce', ['get', 'im'], 1], 4, 1.5, 3, 1.15, 2, 0.9, 0.7];
  return [
    {
      id: `${id}-pt`, type: 'circle', source: 'pleiades-places', 'source-layer': 'places', filter, minzoom: opts.minzoom ?? 3,
      paint: {
        // Small when zoomed out: thousands of sites would otherwise hide the map.
        // Size by importance class (from the build: names, links and sites recorded for the place).
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['*', r * 0.3, imp], 5, ['*', r * 0.5, imp], 8, ['*', r * 1.05, imp], 12, ['*', r * 1.7, imp]],
        // Rough locations are drawn hollow; precise ones filled.
        'circle-color': color,
        'circle-opacity': ['case', ['==', ['get', 'p'], 0], 0.12, certaintyOpacity()],
        'circle-stroke-color': color,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['==', ['get', 'p'], 0], 0.8, 0], 7, ['case', ['==', ['get', 'p'], 0], 1.4, 0.6]],
        'circle-stroke-opacity': certaintyOpacity(),
      },
    },
    {
      id: `${id}-label`, type: 'symbol', source: 'pleiades-places', 'source-layer': 'places', filter, minzoom: Math.min(5, opts.labelZoom ?? 7),
      layout: {
        // Pleiades titles unnamed sites "Untitled": keep the dot, skip the label.
        'text-field': ['case', ['==', ['get', 'n'], 'Untitled'], '', ['>=', u(), 1], ['concat', ['get', 'n'], ' ?'], ['get', 'n']],
        'text-font': ['case', ['>=', ['coalesce', ['get', 'im'], 1], 4], ['literal', FONT_BOLD], ['literal', FONT]],
        // Prominent places are named first; the rest only once there's room (size 0 = not shown yet).
        'text-size': ['step', ['zoom'],
          ['case', ['>=', ['coalesce', ['get', 'im'], 1], 4], 11.5, 0],
          6, ['case', ['>=', ['coalesce', ['get', 'im'], 1], 3], 11.5, 0],
          Math.max(7, opts.labelZoom ?? 7), ['case', ['>=', ['coalesce', ['get', 'im'], 1], 2], 11.5, 0],
          Math.max(9, (opts.labelZoom ?? 7) + 2), 11.5],
        'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'im'], 1]],
        'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true,
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

/**
 * Political colours. Each polity has a fixed palette index from the build
 * (by its Seshat/Wikidata identity, so a state keeps its colour through time),
 * chosen so neighbours and overlapping polities differ. Colour identifies the
 * polity; it does not encode its type (empire/kingdom/… are separate layers
 * and are named in the legend and the details).
 */
export const POLITY_PALETTE = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d68910', '#16a085', '#a04000', '#2c3e50', '#c2185b', '#7d8c1f', '#5d6d7e', '#1f618d'];
/** Darker text versions of the same colours, readable on the parchment base. */
const POLITY_TEXT = ['#8e2419', '#1b5e89', '#1b7a43', '#5f2d77', '#8f5a05', '#0e6b59', '#6e2c00', '#1a252f', '#880e4f', '#556113', '#3d4955', '#123f5f'];
const polityColour = (pal: string[]): ExpressionSpecification => ['match', ['%', ['coalesce', ['get', 'ci'], 0], pal.length], ...pal.slice(1).flatMap((c, i) => [i + 1, c]), pal[0]] as unknown as ExpressionSpecification;
const isOutline: ExpressionSpecification = ['!=', ['geometry-type'], 'Point'];
/** Label size by the polity's area: only large polities are named at world scale; small ones appear as you zoom in. */
const areaLabelSize: ExpressionSpecification = ['step', ['zoom'],
  ['case', ['>=', ['get', 'a'], 400000], 11, 0],
  3, ['case', ['>=', ['get', 'a'], 120000], 12, 0],
  4, ['case', ['>=', ['get', 'a'], 30000], 12, 0],
  5, ['case', ['>=', ['get', 'a'], 8000], 13, 0],
  6, ['case', ['>=', ['get', 'a'], 2000], 13, 0],
  7, 13];

function polityClass(id: string, match: ExpressionSpecification, _color: string, ctx: LayerCtx): LayerSpecification[] {
  const alive = existedIn(ctx.year);
  const area = ['all', match, alive, isOutline, ['!', ['has', 'lbl']]] as ExpressionSpecification;
  // Members and independent polities are filled. A grouping (Cliopatria's
  // parenthesised collections: an empire's provinces, a heptarchy, a
  // personal union) is only outlined around its members — it isn't a rival.
  const filled = ['all', area, ['!', ['has', 'g']]] as FilterSpecification;
  const grouping = ['all', area, ['has', 'g']] as FilterSpecification;
  const labels = ['all', match, alive, ['has', 'lbl']] as FilterSpecification;
  // Contested outlines (overlapping another polity in the source) and small
  // outlying pieces far from the main territory are drawn fainter and dashed.
  const doubtful: ExpressionSpecification = ['any', ['has', 'x'], ['has', 'op']];
  return [
    { id: `${id}-fill`, type: 'fill', source: 'cliopatria', filter: filled, paint: { 'fill-color': polityColour(POLITY_PALETTE), 'fill-opacity': ['case', ['has', 'op'], 0.07, ['has', 'x'], 0.1, 0.16] } },
    { id: `${id}-edge`, type: 'line', source: 'cliopatria', filter: filled, paint: { 'line-color': polityColour(POLITY_PALETTE), 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 7, 1.6], 'line-opacity': ['case', doubtful, 0.5, 0.7], 'line-blur': 0.6 } },
    { id: `${id}-edge-doubt`, type: 'line', source: 'cliopatria', filter: ['all', filled, doubtful] as FilterSpecification, paint: { 'line-color': polityColour(POLITY_TEXT), 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.6 } },
    { id: `${id}-group`, type: 'line', source: 'cliopatria', filter: grouping, paint: { 'line-color': polityColour(POLITY_TEXT), 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 7, 2.2], 'line-dasharray': [4, 2], 'line-opacity': 0.55 } },
    { id: `${id}-label`, type: 'symbol', source: 'cliopatria', filter: labels, layout: {
      // Groupings are named without Cliopatria's parentheses, in italic, so they read as "a grouping", not a state.
      'text-field': ['case', ['has', 'g'], ['slice', ['get', 'n'], 1, ['-', ['length', ['get', 'n']], 1]], ['get', 'n']],
      'text-font': ['case', ['has', 'g'], ['literal', FONT_ITALIC], ['literal', FONT_BOLD]],
      'text-size': areaLabelSize, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 8,
      'symbol-placement': 'point', 'symbol-sort-key': ['-', 0, ['get', 'a']], 'text-padding': 6, 'text-optional': true,
    }, paint: { 'text-color': polityColour(POLITY_TEXT), 'text-opacity': ['case', ['has', 'x'], 0.6, 0.85], 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
  ];
}

function events(id: string, kind: string | string[], color: string, ctx: LayerCtx): LayerSpecification[] {
  const filter = ['all', typeof kind === 'string' ? ['==', ['get', 'k'], kind] : ['in', ['get', 'k'], ['literal', kind]], eventNear(ctx.year, ctx.eventWindow)] as FilterSpecification;
  return [
    { id: `${id}-pt`, type: 'circle', source: 'wikidata-events', filter, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 8, 6], 'circle-color': color, 'circle-opacity': ['case', ['>=', u(), 1], 0.5, 0.9], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } },
    { id: `${id}-label`, type: 'symbol', source: 'wikidata-events', filter, minzoom: 4, layout: { 'text-field': ['concat', ['get', 'n'], '\n', ['case', ['<', ['get', 'y'], 0], ['concat', ['to-string', ['-', 0, ['get', 'y']]], ' BCE'], ['concat', ['to-string', ['get', 'y']], ' CE']]], 'text-font': FONT_BOLD, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },
  ];
}

/** Viabundus covers 1350–1650 (a little either side is kept so the edges of the period still show). */
const VIABUNDUS: [HistYear, HistYear] = [1250, 1700];
/** Viabundus documents that records without dates apply to its core period, 1350–1650 — and only that. */
const VIABUNDUS_CORE: [HistYear, HistYear] = [1350, 1650];
/** al-Ṯurayyā follows Cornu's atlas of the 9th–10th centuries. */
const THURAYYA: [HistYear, HistYear] = [700, 1100];
/** Domesday Book records 1086; its units are shown twenty years either side, and labelled as 1086. */
const DOMESDAY: [HistYear, HistYear] = [1066, 1106];
/** The Gough Map is dated c. 1400 (ADS introduction); shown for the later fourteenth and fifteenth centuries. */
const GOUGH: [HistYear, HistYear] = [1350, 1450];
/** Navigation evidence from the eleventh century to 1348. */
const NAVIGATION: [HistYear, HistYear] = [1000, 1348];
const inWindow = (y: HistYear, w: [HistYear, HistYear]): FilterSpecification => (y >= w[0] && y <= w[1] ? ['boolean', true] : ['boolean', false]) as FilterSpecification;

/** Itiner-e segments: shown when the year falls within the segment's dates widened by the dataset's own error margins. */
function itinereFilter(y: HistYear): ExpressionSpecification {
  const lo: ExpressionSpecification = ['-', ['coalesce', ['get', 'f'], -99999], ['coalesce', ['get', 'fe'], 0]];
  const hi: ExpressionSpecification = ['+', ['coalesce', ['get', 't'], 99999], ['coalesce', ['get', 'te'], 0]];
  const dated: ExpressionSpecification = ['any', ['has', 'f'], ['has', 't']];
  return ['any', ['all', dated, ['<=', lo, y], ['>=', hi, y]], ['all', ['!', dated], ['boolean', y >= -800 && y <= 700]]];
}
/** Fainter when only the error margin (not the core dates) reaches the year, or when undated. */
function itinereOpacity(y: HistYear): ExpressionSpecification {
  return ['case',
    ['!', ['any', ['has', 'f'], ['has', 't']]], 0.35,
    ['all', ['<=', ['coalesce', ['get', 'f'], -99999], y], ['>=', ['coalesce', ['get', 't'], 99999], y]], ['match', ['get', 'c'], 'Certain', 0.95, 'Conjectured', 0.75, 0.45],
    0.4];
}

// ── The catalogue ─────────────────────────────────────────────────────────
export const LAYERS: AtlasLayerDef[] = [
  // PLACES
  {
    id: 'settlements', group: 'places', label: 'Ancient settlements', datasets: ['pleiades'], defaultOn: true, coverage: [-3000, 1500],
    hint: 'Cities, towns and villages of the ancient world. Pleiades records no population, so dot size shows how prominent a place is in the record (names, linked places and sites recorded there); prominent places appear and are named first. Hollow = rough location; faded = uncertain.',
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

  {
    id: 'medieval-places', group: 'places', label: 'Medieval towns & places (N. Europe)', datasets: ['viabundus'], defaultOn: true, coverage: VIABUNDUS,
    hint: 'Towns, settlements and other places of northern Europe, 1350–1650 (Viabundus). Towns larger; a town is shown as one from the year its town status is recorded. Undated records are shown for the whole period, as Viabundus intends.', sources: ['viabundus-nodes'],
    specs: (c) => {
      const filter = ['all', inWindow(c.year, VIABUNDUS), existedIn(c.year, { undated: { within: VIABUNDUS_CORE }, window: VIABUNDUS })] as FilterSpecification;
      const town: ExpressionSpecification = ['all', ['in', 'town', ['get', 'l']], ['any', ['!', ['has', 'tf']], ['<=', ['get', 'tf'], c.year]]];
      return [
        { id: 'medieval-places-pt', type: 'circle', source: 'viabundus-nodes', 'source-layer': 'nodes', filter, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', town, 2.2, 0.8], 9, ['case', town, 5, 2.4], 11, ['case', town, 6, 3.2]], 'circle-color': ['case', town, C.city, C.village], 'circle-stroke-color': C.halo, 'circle-stroke-width': 0.8 } },
        { id: 'medieval-places-label', type: 'symbol', source: 'viabundus-nodes', 'source-layer': 'nodes', filter, minzoom: 6, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_BOLD, 'text-size': ['step', ['zoom'], ['case', town, 12, 0], 8, ['case', town, 12, 10.5]], 'symbol-sort-key': ['case', town, 0, 1], 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': ['case', town, C.city, C.village], 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
  },
  {
    id: 'islamic-places', group: 'places', label: 'Early Islamic world places', datasets: ['althurayya'], defaultOn: true, coverage: THURAYYA,
    hint: 'Towns, capitals, way-stations and regions of the 9th–10th-century Islamic world, georeferenced from Georgette Cornu’s atlas (al-Ṯurayyā). The dates are the atlas’s period, not individual founding dates.', sources: ['thurayya-places'],
    specs: (c) => {
      const filter = inWindow(c.year, THURAYYA);
      const big: ExpressionSpecification = ['in', ['get', 'k'], ['literal', ['capitals', 'towns']]];
      return [
        { id: 'islamic-places-pt', type: 'circle', source: 'thurayya-places', 'source-layer': 'places', filter, paint: { 'circle-radius': ['case', ['==', ['get', 'k'], 'capitals'], 5, big, 3.2, 2], 'circle-color': ['match', ['get', 'k'], 'capitals', '#1b5e20', 'towns', '#2e7d32', 'waystations', '#8d6e63', '#6d8b74'], 'circle-stroke-color': C.halo, 'circle-stroke-width': 0.8 } },
        { id: 'islamic-places-label', type: 'symbol', source: 'thurayya-places', 'source-layer': 'places', filter, minzoom: 5, layout: { 'text-field': ['get', 'n'], 'text-font': ['case', ['==', ['get', 'k'], 'capitals'], ['literal', FONT_BOLD], ['literal', FONT]], 'text-size': ['step', ['zoom'], ['case', big, 12, 0], 7, ['case', big, 12, 10]], 'symbol-sort-key': ['match', ['get', 'k'], 'capitals', 0, 'towns', 1, 2], 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#1b5e20', 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
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
    specs: (c) => [{ id: 'coast-ancient-line', type: 'line', source: 'awmc-shoreline', filter: existedIn(c.year, { undated: { within: BARRINGTON } }) as FilterSpecification, paint: { 'line-color': C.ancientCoast, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 9, 1.8], 'line-opacity': ['case', ['>=', u(), 1], 0.4, ['==', ['get', 'as'], 1], 0.4, 0.85] } }],
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
    id: 'roads-roman', group: 'infrastructure', label: 'Roman roads (Itiner-e)', datasets: ['itinere'], defaultOn: true, coverage: [-800, 700],
    hint: 'The most detailed open dataset of Roman roads (Itiner-e). Each segment has its own dates with error margins: it appears when the year falls within them — faded if only the error margin reaches the year. Solid = certain, lighter = conjectured, dashed = hypothetical; blue = river and sea lanes. Tap a road for its sources.', sources: ['itinere'],
    specs: (c) => {
      const filter = itinereFilter(c.year) as FilterSpecification;
      const water: ExpressionSpecification = ['in', ['get', 'k'], ['literal', ['River', 'Sea Lane']]];
      return [
        { id: 'roads-roman-land', type: 'line', source: 'itinere', 'source-layer': 'roads', filter: ['all', filter, ['!', water], ['!=', ['get', 'c'], 'Hypothetical']] as FilterSpecification, paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'k'], 'Main Road'], 0.8, 0.4], 9, ['case', ['==', ['get', 'k'], 'Main Road'], 2.6, 1.4]], 'line-opacity': itinereOpacity(c.year) } },
        { id: 'roads-roman-hypothetical', type: 'line', source: 'itinere', 'source-layer': 'roads', filter: ['all', filter, ['!', water], ['==', ['get', 'c'], 'Hypothetical']] as FilterSpecification, paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 9, 1.4], 'line-opacity': 0.45, 'line-dasharray': [2, 2] } },
        { id: 'roads-roman-water', type: 'line', source: 'itinere', 'source-layer': 'roads', filter: ['all', filter, water] as FilterSpecification, paint: { 'line-color': '#2b6f95', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 9, 1.4], 'line-opacity': 0.5, 'line-dasharray': [1, 2] } },
      ];
    },
  },
  {
    id: 'roads-medieval', group: 'infrastructure', alsoIn: ['economic'], label: 'Medieval roads & waterways (N. Europe)', datasets: ['viabundus'], defaultOn: true, coverage: VIABUNDUS,
    hint: 'Land roads, rivers, canals, coastal routes, ferries and winter roads of northern Europe 1350–1650 (Viabundus) — the Hanseatic trade roads. Viabundus rates each stretch: solid dark = very certain (mostly inside towns), solid = “more or less” on the old road (most), dashed grey = uncertain or not yet checked against old maps.', sources: ['viabundus-edges'],
    specs: (c) => {
      const filter = ['all', inWindow(c.year, VIABUNDUS), existedIn(c.year, { undated: { within: VIABUNDUS_CORE }, window: VIABUNDUS })] as FilterSpecification;
      const water: ExpressionSpecification = ['in', ['get', 'k'], ['literal', ['river', 'canal', 'coast', 'ferry']]];
      return [
        { id: 'roads-medieval-sure', type: 'line', source: 'viabundus-edges', 'source-layer': 'edges', filter: ['all', filter, ['<', ['get', 'c'], 3]] as FilterSpecification, paint: { 'line-color': ['case', water, '#2b6f95', ['==', ['get', 'c'], 1], '#5b2c0f', '#8d5524'], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 2.2], 'line-opacity': 0.8 } },
        { id: 'roads-medieval-unsure', type: 'line', source: 'viabundus-edges', 'source-layer': 'edges', filter: ['all', filter, ['>=', ['get', 'c'], 3]] as FilterSpecification, paint: { 'line-color': ['case', water, '#7fa7bf', '#9e9e9e'], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.6], 'line-opacity': 0.8, 'line-dasharray': [2, 2] } },
      ];
    },
  },
  {
    id: 'roads-ancient', group: 'infrastructure', label: 'Roads (Barrington Atlas / AWMC)', datasets: ['awmc'], defaultOn: false, coverage: BARRINGTON,
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
    id: 'political-events', group: 'political', label: 'Coups & treaties', datasets: ['wikidata'], defaultOn: false,
    hint: 'Coups and treaties Wikidata places at a location with a date (a treaty’s place is usually where it was signed).', sources: ['wikidata-events'], specs: (c) => events('political-events', ['coup', 'treaty'], '#4e342e', c),
  },
  {
    id: 'borders', group: 'political', label: 'Historical borders', datasets: ['cliopatria', 'ohm'], defaultOn: true,
    hint: 'Outlines of every polity in the chosen year (Cliopatria), plus country borders mapped in OpenHistoricalMap (dated features, mainly after 1500).', sources: ['cliopatria', 'ohm'],
    specs: (c) => [
      { id: 'borders-clio', type: 'line', source: 'cliopatria', filter: ['all', existedIn(c.year), isOutline, ['!', ['has', 'g']], ['!', ['has', 'lbl']]] as FilterSpecification, paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 7, 1.2], 'line-opacity': 0.55 } },
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
    id: 'revolts', group: 'military', label: 'Revolts & rebellions', datasets: ['wikidata'], defaultOn: false,
    hint: 'Revolts and rebellions with a recorded place and date (Wikidata); shown for their whole span where an end date is recorded.', sources: ['wikidata-events'], specs: (c) => events('revolts', 'revolt', '#ad1457', c),
  },
  {
    id: 'expeditions', group: 'military', label: 'Expeditions', datasets: ['wikidata'], defaultOn: false,
    hint: 'Expeditions placed at one point by Wikidata (usually where they began or were centred) — not their route.', sources: ['wikidata-events'], specs: (c) => events('expeditions', 'expedition', '#00838f', c),
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
    unavailableKind: 'no-dataset',
    unavailable: 'No open scholarly dataset of army routes is available. Pick a war under “Wars” to see its battles numbered in date order — the order of events, not the route taken.',
    hint: '', sources: [], specs: () => [],
  },

  // ECONOMIC & CULTURAL
  {
    id: 'domesday', group: 'political', label: 'Domesday shires & hundreds (1086)', datasets: ['domesday'], defaultOn: true, coverage: DOMESDAY,
    hint: 'The shires, intermediate districts (Ridings, lathes, rapes…) and hundreds/wapentakes of England as they are believed to have existed in 1086, reconstructed from Domesday Book and later parish boundaries. Shown 1066–1106 and always as the 1086 arrangement — boundaries changed before and after. Coverage is thin in the far north (divided into wards) and in Wales.', sources: ['domesday'],
    specs: (c) => {
      const w = inWindow(c.year, DOMESDAY);
      const k = (v: string): FilterSpecification => ['all', w, ['==', ['get', 'k'], v]] as FilterSpecification;
      return [
        { id: 'domesday-hundreds', type: 'line', source: 'domesday', 'source-layer': 'units', filter: k('hundred'), minzoom: 6, paint: { 'line-color': C.province, 'line-width': 0.6, 'line-opacity': 0.55 } },
        { id: 'domesday-inter', type: 'line', source: 'domesday', 'source-layer': 'units', filter: k('inter'), minzoom: 5, paint: { 'line-color': C.province, 'line-width': 1.1, 'line-opacity': 0.7, 'line-dasharray': [3, 1.5] } },
        { id: 'domesday-shires-fill', type: 'fill', source: 'domesday', 'source-layer': 'units', filter: k('shire'), paint: { 'fill-color': C.province, 'fill-opacity': 0.04 } },
        { id: 'domesday-shires', type: 'line', source: 'domesday', 'source-layer': 'units', filter: k('shire'), paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2.4], 'line-opacity': 0.85 } },
        { id: 'domesday-label', type: 'symbol', source: 'domesday', 'source-layer': 'units', filter: k('shire-label'), layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 13, 'text-optional': true }, paint: { 'text-color': C.province, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
        { id: 'domesday-hundred-label', type: 'symbol', source: 'domesday', 'source-layer': 'units', filter: k('hundred-label'), minzoom: 8, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 10, 'text-optional': true }, paint: { 'text-color': C.province, 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
  },
  {
    id: 'rural-settlement', group: 'places', alsoIn: ['physical'], label: 'Rural settlement provinces (England)', datasets: ['ruralsettlement'], defaultOn: false,
    unavailableKind: LOCAL_DATA ? undefined : 'licence',
    unavailable: LOCAL_DATA ? undefined : 'Not published: the Atlas of Rural Settlement terms allow personal and business use, not republishing on a public site. Available in local builds of Shelf.',
    hint: 'Roberts & Wrathmell’s settlement provinces, sub-provinces and local regions, and the nucleated settlements (villages and hamlets) they mapped from nineteenth-century Ordnance Survey maps. A characterisation of settlement patterns used to study medieval England — not a dated map of any one year.', sources: ['rural-settlement'],
    specs: () => {
      const k = (v: string): FilterSpecification => ['==', ['get', 'k'], v] as FilterSpecification;
      return [
        { id: 'rural-local', type: 'line', source: 'rural-settlement', 'source-layer': 'rural', filter: k('local'), minzoom: 7, paint: { 'line-color': '#6d8b74', 'line-width': 0.7, 'line-opacity': 0.6 } },
        { id: 'rural-subprovince', type: 'line', source: 'rural-settlement', 'source-layer': 'rural', filter: k('subprovince'), paint: { 'line-color': '#4a6b52', 'line-width': 1.2, 'line-opacity': 0.7, 'line-dasharray': [3, 1.5] } },
        { id: 'rural-province', type: 'line', source: 'rural-settlement', 'source-layer': 'rural', filter: k('province'), paint: { 'line-color': '#2f4a36', 'line-width': 2.2, 'line-opacity': 0.8 } },
        { id: 'rural-nucleations', type: 'circle', source: 'rural-settlement', 'source-layer': 'rural', filter: k('nucleation'), minzoom: 7, paint: { 'circle-radius': 1.8, 'circle-color': '#4a6b52', 'circle-opacity': 0.7 } },
      ];
    },
  },
  {
    id: 'gough-map', group: 'infrastructure', label: 'Gough Map routes (c. 1400)', datasets: ['gough'], defaultOn: true, coverage: GOUGH,
    hint: 'England and Wales c. 1400 as the Gough Map shows it: the settlements its red lines connect, the red lines themselves (schematic, dashed red, with the distance numeral the map gives), and the historical roads the lines have been matched to (brown). Only a selection of the medieval network — the map was never complete.', sources: ['gough'],
    specs: (c) => {
      const w = inWindow(c.year, GOUGH);
      const k = (v: string): FilterSpecification => ['all', w, ['==', ['get', 'k'], v]] as FilterSpecification;
      return [
        { id: 'gough-routes', type: 'line', source: 'gough', 'source-layer': 'gough', filter: k('route'), paint: { 'line-color': '#8d5524', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 2.4], 'line-opacity': 0.8 } },
        { id: 'gough-red', type: 'line', source: 'gough', 'source-layer': 'gough', filter: k('red'), maxzoom: 9, paint: { 'line-color': '#c62828', 'line-width': 1.2, 'line-opacity': 0.7, 'line-dasharray': [3, 2] } },
        { id: 'gough-stations', type: 'circle', source: 'gough', 'source-layer': 'gough', filter: k('station'), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 5], 'circle-color': '#c62828', 'circle-stroke-color': C.halo, 'circle-stroke-width': 1, 'circle-opacity': ['case', ['==', ['get', 'lg'], 0], 0.5, 1] } },
        { id: 'gough-stations-label', type: 'symbol', source: 'gough', 'source-layer': 'gough', filter: k('station'), minzoom: 6, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 11, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#8b1a1a', 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
  },
  {
    id: 'inland-navigation', group: 'infrastructure', alsoIn: ['economic', 'physical'], label: 'Navigable rivers before 1348 (England & Wales)', datasets: ['navigation'], defaultOn: true, coverage: NAVIGATION,
    hint: 'Rivers and canals known to have carried boats between the eleventh century and 1348 (Early Medieval Atlas): solid blue = direct documentary or archaeological evidence; dashed = inferred mainly from place-names; points = heads of navigation (with the latest recorded date) and place-names that refer to river traffic. The courses follow modern or parish-boundary lines where the old course isn’t known.', sources: ['navigation'],
    specs: (c) => {
      const w = inWindow(c.year, NAVIGATION);
      const k = (v: string): FilterSpecification => ['all', w, ['==', ['get', 'k'], v]] as FilterSpecification;
      return [
        { id: 'navigation-direct', type: 'line', source: 'navigation', 'source-layer': 'nav', filter: k('direct'), paint: { 'line-color': '#1f6f8b', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 3], 'line-opacity': 0.85 } },
        { id: 'navigation-indirect', type: 'line', source: 'navigation', 'source-layer': 'nav', filter: k('indirect'), paint: { 'line-color': '#5e9ab4', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 2.2], 'line-opacity': 0.75, 'line-dasharray': [2, 2] } },
        { id: 'navigation-heads', type: 'circle', source: 'navigation', 'source-layer': 'nav', filter: k('head'), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 5], 'circle-color': '#0d4f66', 'circle-stroke-color': C.halo, 'circle-stroke-width': 1 } },
        { id: 'navigation-pn', type: 'circle', source: 'navigation', 'source-layer': 'nav', filter: k('pn'), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2, 10, 4], 'circle-color': C.halo, 'circle-stroke-color': '#0d4f66', 'circle-stroke-width': 1.5 } },
        { id: 'navigation-label', type: 'symbol', source: 'navigation', 'source-layer': 'nav', filter: ['all', w, ['in', ['get', 'k'], ['literal', ['head', 'pn']]]] as FilterSpecification, minzoom: 8, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 10.5, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#0d4f66', 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
  },
  {
    id: 'trade-routes', group: 'economic', alsoIn: ['infrastructure'], label: 'Early Islamic routes', datasets: ['althurayya'], defaultOn: true, coverage: THURAYYA,
    hint: 'Route sections between towns and way-stations of the 9th–10th-century Islamic world, from Cornu’s atlas (al-Ṯurayyā). For northern Europe 1350–1650 see “Medieval roads & waterways”. No open dataset covers trade routes elsewhere, so none are drawn there.', sources: ['thurayya-routes'],
    specs: (c) => [{ id: 'trade-routes-line', type: 'line', source: 'thurayya-routes', 'source-layer': 'routes', filter: inWindow(c.year, THURAYYA), paint: { 'line-color': '#2e7d32', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 9, 1.8], 'line-opacity': 0.7, 'line-dasharray': [3, 1.5] } }],
  },
  {
    id: 'tolls-fairs', group: 'economic', label: 'Tolls, fairs & staple markets (N. Europe)', datasets: ['viabundus'], defaultOn: false, coverage: VIABUNDUS,
    hint: 'Places where Viabundus records a toll, an annual fair or staple rights (1350–1650). Each role has its own dates in the source — tap a place for them.', sources: ['viabundus-nodes'],
    specs: (c) => {
      const filter = ['all', inWindow(c.year, VIABUNDUS), existedIn(c.year, { undated: { within: VIABUNDUS_CORE }, window: VIABUNDUS }), ['any', ['in', 'toll', ['get', 'l']], ['in', 'fair', ['get', 'l']], ['in', 'staple', ['get', 'l']]]] as FilterSpecification;
      return [{ id: 'tolls-fairs-pt', type: 'circle', source: 'viabundus-nodes', 'source-layer': 'nodes', filter, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 5], 'circle-color': ['case', ['in', 'staple', ['get', 'l']], '#6a1b9a', ['in', 'fair', ['get', 'l']], C.market, '#37474f'], 'circle-stroke-color': C.halo, 'circle-stroke-width': 1 } }];
    },
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
/**
 * Label hierarchy: where several labels compete for the same space, higher
 * wins (MapLibre places the top-most layer's labels first). Polity names are
 * gated by area and zoom, so they never crowd out towns when zoomed in.
 */
const LABEL_PRIORITY: Record<string, number> = {
  empires: 100, kingdoms: 99, republics: 98, 'other-states': 97, territories: 90, provinces: 85,
  cities: 80, ports: 75, settlements: 72, towns: 70, 'islamic-places': 68, 'medieval-places': 66,
  domesday: 60, battles: 55, sieges: 54, wars: 53, villages: 40,
};
/** Sort key for a layer's labels (priority, then draw order). */
export const labelKey = (id: string) => (LABEL_PRIORITY[id] ?? 50) * 1000 + Math.max(0, DRAW_ORDER.indexOf(id));

export const DRAW_ORDER = ['terrain', 'lakes', 'empires', 'kingdoms', 'republics', 'other-states', 'territories', 'provinces', 'borders', 'domesday', 'rural-settlement', 'coast-modern', 'coast-ancient', 'rivers', 'inland-navigation', 'roads', 'roads-ancient', 'roads-roman', 'roads-medieval', 'gough-map', 'trade-routes',
  'archaeological', 'religious', 'cultural', 'markets', 'tolls-fairs', 'bridges', 'mountains', 'passes', 'forts', 'villages', 'towns', 'islamic-places', 'medieval-places', 'ports', 'settlements', 'cities', 'political-events', 'expeditions', 'revolts', 'campaigns', 'sieges', 'battles', 'wars'];

export const PALETTE = C;
