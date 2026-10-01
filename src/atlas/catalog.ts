// Every map layer the atlas can show, which scholarly dataset each one comes
// from, and how each one follows the timeline. Layers are independent: each
// can be switched on or off, and adding a layer or a dataset means adding an
// entry here — the map, panel and attribution read this catalogue.
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { eventNear, existedIn, type HistYear, ohmExisted } from './time';
import { PRIVATE_TILE_PREFIX, privateHas } from './privateData';

/** Why a layer can't be shown: each reason is stated as it is, never lumped together as "no data". */
export type UnavailableKind = 'no-dataset' | 'licence' | 'online-only' | 'not-integrated';
export const UNAVAILABLE_LABEL: Record<UnavailableKind, string> = {
  'no-dataset': 'no suitable open dataset exists',
  licence: 'licence doesn’t allow publishing it here',
  'online-only': 'available online only',
  'not-integrated': 'not added to Shelf yet',
};

export type GroupId = 'places' | 'physical' | 'infrastructure' | 'political' | 'military' | 'economic' | 'modern';
export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'places', label: 'Places' },
  { id: 'physical', label: 'Physical geography' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'political', label: 'Political' },
  { id: 'military', label: 'Military' },
  { id: 'economic', label: 'Economic & cultural' },
  { id: 'modern', label: 'Modern reference (today)' },
];

export type DatasetId = 'pleiades' | 'awmc' | 'cliopatria' | 'wikidata' | 'naturalearth' | 'ohm' | 'terrain' | 'itinere' | 'viabundus' | 'althurayya'
  | 'domesday' | 'gough' | 'navigation' | 'ruralsettlement' | 'germaniasacra' | 'buringh' | 'hced' | 'hre' | 'merimee' | 'finreg' | 'wbohemia' | 'bridges1250' | 'nsh' | 'nokm' | 'localonly' | 'hydrosheds' | 'openfreemap' | 'osm' | 'hydrolakes' | 'physlabels'
  | 'canmore' | 'irlsmr' | 'nid' | 'ivillaris' | 'ottomannfs' | 'generalkarte' | 'cassini' | 'lutsch' | 'sirkd' | 'lirelist';

/** How each dataset is credited on the map. Full licences are in public/atlas/manifest.json. */
export const DATASET_CREDIT: Record<DatasetId, { name: string; url: string; license: string }> = {
  pleiades: { name: 'Pleiades', url: 'https://pleiades.stoa.org/', license: 'CC BY 3.0' },
  awmc: { name: 'Ancient World Mapping Center', url: 'https://awmc.unc.edu/', license: 'ODbL' },
  cliopatria: { name: 'Cliopatria / Seshat', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', license: 'CC BY 4.0' },
  wikidata: { name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0' },
  naturalearth: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com/', license: 'public domain' },
  ohm: { name: 'OpenHistoricalMap', url: 'https://www.openhistoricalmap.org/copyright', license: 'CC0' },
  terrain: { name: 'Mapterhorn terrain (Copernicus GLO-30 and national elevation models; fallback: Mapzen/AWS Terrain Tiles)', url: 'https://mapterhorn.com/attribution', license: 'open data, see sources' },
  hydrosheds: { name: 'HydroRIVERS v1.0 (Lehner & Grill 2013, HydroSHEDS)', url: 'https://www.hydrosheds.org/products/hydrorivers', license: 'CC BY 4.0' },
  lirelist: { name: 'LIST — Latin Inscriptions in Space and Time v1.2 (SDAM, Aarhus; from EDH and EDCS)', url: 'https://doi.org/10.5281/zenodo.10473706', license: 'CC BY 4.0' },
  canmore: { name: 'Canmore — National Record of the Historic Environment (Historic Environment Scotland)', url: 'https://www.trove.scot/', license: 'OGL v3' },
  irlsmr: { name: 'Archaeological Survey of Ireland, Sites and Monuments Record (National Monuments Service)', url: 'https://www.archaeology.ie/', license: 'CC BY 4.0' },
  nid: { name: 'Rejestr zabytków nieruchomych (Narodowy Instytut Dziedzictwa); places from GeoNames', url: 'https://dane.gov.pl/pl/dataset/1130', license: 'CC BY 4.0' },
  ivillaris: { name: 'Index Villaris, 1680 (John Adams; ed. Gadd 2024)', url: 'https://doi.org/10.5281/zenodo.10660024', license: 'CC BY 4.0' },
  ottomannfs: { name: 'Ottoman NFS gazetteer, 1830–1849 (Kabadayı, Boykov, Sefer, Gerrits)', url: 'https://doi.org/10.5281/zenodo.7351936', license: 'CC BY 4.0' },
  generalkarte: { name: 'Gazetteer of the Generalkarte von Mitteleuropa, Balkans (Boykov)', url: 'https://doi.org/10.5281/zenodo.8409506', license: 'CC BY 4.0' },
  cassini: { name: '18th-century Cassini roads and cities (Perret, Gribaudi & Barthelemy)', url: 'https://doi.org/10.7910/DVN/28674', license: 'CC0' },
  sirkd: { name: 'Slovenian register of immovable cultural heritage (RKD)', url: 'https://podatki.gov.si/dataset/register-nepremicne-kulturne-dediscine', license: 'CC BY 4.0 (OPSI open data)' },
  lutsch: { name: 'Features of the Lutsch map of Transylvania, 1751', url: 'https://doi.org/10.7910/DVN/ETORPU', license: 'CC BY-NC-SA 4.0' },
  hydrolakes: { name: 'HydroLAKES v1.0 (Messager et al. 2016); dam dates from Wikidata', url: 'https://www.hydrosheds.org/products/hydrolakes', license: 'CC BY 4.0' },
  physlabels: { name: 'Natural Earth (ranges, plains); Wikidata (peaks)', url: 'https://www.naturalearthdata.com/', license: 'public domain / CC0' },
  osm: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' },
  openfreemap: { name: 'OpenFreeMap © OpenMapTiles, data from OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' },
  itinere: { name: 'Itiner-e (Brughmans et al. 2024)', url: 'https://itiner-e.org/', license: 'CC BY 4.0' },
  viabundus: { name: 'Viabundus 2', url: 'https://www.viabundus.eu/', license: 'CC BY 4.0' },
  althurayya: { name: 'al-Ṯurayyā Gazetteer (after G. Cornu)', url: 'https://althurayya.github.io/', license: 'Apache-2.0' },
  domesday: { name: 'Domesday Shires and Hundreds (Brookes 2020, ADS)', url: 'https://doi.org/10.5284/1058999', license: 'CC BY 4.0' },
  gough: { name: 'Routes and Roads of the Gough Map (Oksanen & Brookes 2024, ADS)', url: 'https://doi.org/10.5284/1124312', license: 'CC BY 4.0' },
  navigation: { name: 'Inland Navigation before 1348 (Oksanen 2019, ADS)', url: 'https://doi.org/10.5284/1057497', license: 'CC BY 4.0' },
  germaniasacra: { name: 'Germania Sacra, Klöster und Stifte des Alten Reiches', url: 'https://klosterdatenbank.germania-sacra.de/', license: 'CC BY-SA 3.0' },
  buringh: { name: 'Buringh, European urban population 700–2000 (DANS)', url: 'https://doi.org/10.17026/dans-xzy-u62q', license: 'CC0' },
  hre: { name: 'Princes and Townspeople (Bogucka, Cantoni, Mohr, Weigand)', url: 'https://doi.org/10.7910/DVN/ZGSJED', license: 'CC0' },
  merimee: { name: 'Mérimée, Ministère de la Culture', url: 'https://www.pop.culture.gouv.fr/', license: 'Licence Ouverte 2.0' },
  finreg: { name: 'Finnish Heritage Agency register', url: 'https://www.museovirasto.fi/', license: 'CC BY 4.0' },
  wbohemia: { name: 'Janovská, Toponymic Data for Western Bohemia to 1500', url: 'https://doi.org/10.5281/zenodo.21479034', license: 'CC BY 4.0' },
  bridges1250: { name: 'Bridges of Medieval England to c.1250 (Brookes, Rye, Oksanen, ADS)', url: 'https://doi.org/10.5284/1053676', license: 'CC BY 4.0' },
  nsh: { name: 'Nordic Spatial Humanities: saints’ cult places, Icelandic Saga Map (Uppsala, Univ. of Iceland et al.)', url: 'https://doi.org/10.5281/zenodo.14871254', license: 'CC BY 4.0' },
  nokm: { name: 'Riksantikvaren, Kulturminner — lokaliteter og enkeltminner (via Geonorge)', url: 'https://kulturminnesok.no/', license: 'NLOD' },
  localonly: { name: 'Your private data file (datasets used privately, not republished)', url: 'https://github.com/yosefliberman770-source/shelf/blob/main/docs/MEDIEVAL_EUROPE_DATA_AUDIT.md', license: 'private use only' },
  hced: { name: 'Historical Conflict Event Dataset (Miller et al. 2022)', url: 'https://doi.org/10.7910/DVN/6ZFC0V', license: 'CC0' },
  ruralsettlement: { name: 'Atlas of Rural Settlement in England GIS (Roberts & Wrathmell, English Heritage)', url: 'https://doi.org/10.5284/1031493', license: '© English Heritage — personal use' },
};

/**
 * Datasets Shelf may use privately but must not republish (no stated licence, or terms that forbid it) come
 * from the owner's private data pack, loaded on the device (privateData.ts) — never from the public site.
 * Layers that need it are available only where the pack holds their tiles.
 */
const privateTile = (file: string) => privateHas(`tiles/${file}`);
const PRIVATE_SITES = () => privateTile('private-sites.pmtiles');
/** The site layers draw the public sites and, where the private pack is loaded, the private ones. */
const siteSources = () => ['medieval-sites', 'register-sites', ...(PRIVATE_SITES() ? ['private-sites'] : [])];

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
  river: '#4f8fb3', riverNet: '#3b7ca6', sea: '#cddde4', land: '#efe7d4', modern: '#77727e', lake: '#9cc3d6', mountain: '#6d5a44', pass: '#a0522d', coast: '#5f7f8f', ancientCoast: '#1d4e66',
  road: '#9b2226', roadOhm: '#bb6a2b', bridge: '#444444',
  empire: '#b03a2e', kingdom: '#2e7d32', republic: '#1565c0', otherState: '#7b6a58', province: '#6d4c41', territory: '#8e44ad', border: '#5d4037',
  battle: '#c62828', siege: '#6a1b9a', campaign: '#ef6c00', war: '#000000',
  market: '#b8860b', religious: '#6b3fa0', cultural: '#c0582a', halo: '#fbf7ee',
};
const FONT = ['OpenHistorical'];
const FONT_BOLD = ['OpenHistorical Bold'];
const FONT_ITALIC = ['OpenHistorical Italic'];

/** AWMC/Barrington data covers the Greek and Roman world, c. 750 BCE – 640 CE. */
const BARRINGTON: [HistYear, HistYear] = [-750, 640];

/** Today's lake names are shown from this year: many lakes and reservoirs, and their names, are modern. */
const MODERN_LAKE_NAMES = 1900;
/** A river's mean discharge (m³/s), which sets its width. */
const RIVER_Q: ExpressionSpecification = ['coalesce', ['get', 'q'], 0];
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
  if (privateTile(file)) return { type: 'vector', url: `pmtiles://${PRIVATE_TILE_PREFIX}${file}`, attribution: credit(id), maxzoom } as SourceSpecification;
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
  // Wikidata sites, merged with Germania Sacra where both describe the same house; credited to both.
  'medieval-sites': (c) => ({ ...pmtiles(c, 'medieval-sites.pmtiles', 'wikidata', 11), attribution: (['wikidata', 'germaniasacra', 'merimee', 'finreg', 'wbohemia', 'bridges1250', 'nsh', 'nokm'] as DatasetId[]).map(credit).join('; ') } as SourceSpecification),
  'urban-population': (c) => pmtiles(c, 'towns.pmtiles', 'buringh', 10),
  'hre-towns': (c) => pmtiles(c, 'hre-towns.pmtiles', 'hre', 10),
  // From the private data pack only (licence not verified, or no republishing): never on the public site.
  'private-sites': (c) => pmtiles(c, 'private-sites.pmtiles', 'localonly', 11),
  'register-sites': (c) => ({ ...pmtiles(c, 'registers.pmtiles', 'canmore', 11), attribution: (['canmore', 'irlsmr', 'nid', 'ivillaris', 'ottomannfs', 'generalkarte', 'cassini', 'lutsch', 'sirkd'] as DatasetId[]).map(credit).join('; ') } as SourceSpecification),
  'cassini-roads': (c) => pmtiles(c, 'cassini-roads.pmtiles', 'cassini', 11),
  inscriptions: (c) => pmtiles(c, 'inscriptions.pmtiles', 'lirelist', 10),
  'private-lines': (c) => pmtiles(c, 'private-lines.pmtiles', 'localonly', 11),
  'gs-dioceses': (c) => pmtiles(c, 'gs-dioceses.pmtiles', 'germaniasacra', 9),
  'hced-battles': (c) => ({ type: 'geojson', data: c.base + 'hced-battles.json', attribution: credit('hced') }),
  'pleiades-lines': (c) => ({ type: 'geojson', data: c.base + 'pleiades-lines.json', attribution: credit('pleiades') }),
  'pleiades-provinces': (c) => ({ type: 'geojson', data: c.base + 'pleiades-provinces.json', attribution: credit('pleiades') }),
  'awmc-roads': (c) => ({ type: 'geojson', data: c.base + 'awmc-roads.json', attribution: credit('awmc') }),
  'awmc-shoreline': (c) => ({ type: 'geojson', data: c.base + 'awmc-shoreline.json', attribution: credit('awmc') }),
  'awmc-inland-water': (c) => ({ type: 'geojson', data: c.base + 'awmc-inland-water.json', attribution: credit('awmc') }),
  'awmc-snapshots': (c) => ({ type: 'geojson', data: c.base + 'awmc-snapshots.json', attribution: credit('awmc') }),
  'wikidata-events': (c) => ({ type: 'geojson', data: c.base + 'wikidata-events.json', attribution: credit('wikidata') }),
  'physical-labels': (c) => ({ type: 'geojson', data: c.base + 'physical-labels.json', attribution: credit('physlabels') }),
  reservoirs: (c) => pmtiles(c, 'reservoirs.pmtiles', 'hydrolakes', 10),
  'osm-land': (c) => pmtiles(c, 'osm-land.pmtiles', 'osm', 8),
  'osm-water': (c) => pmtiles(c, 'osm-water.pmtiles', 'osm', 8),
  'physical-change': (c) => ({ type: 'geojson', data: c.base + 'physical-change.json', attribution: credit('osm') }),
  'ne-rivers': (c) => ({ type: 'geojson', data: c.base + 'ne-rivers.json', attribution: credit('naturalearth') }),
  // Borders are split into time slices; the map swaps the file as the year moves.
  cliopatria: () => ({ type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: credit('cliopatria') }),
  // A war picked in the Military panel, numbered in date order (built by the map).
  'war-sequence': () => ({ type: 'geojson', data: { type: 'FeatureCollection', features: [] } }),
  ohm: () => ({ type: 'vector', tiles: ['https://vtiles.openhistoricalmap.org/maps/ohm/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, attribution: credit('ohm') }),
  // Relief: Mapterhorn (Copernicus 30 m, sharper, 512 px tiles); if it fails, the older AWS tiles (see switchTerrainToFallback).
  terrain: () => (terrainFallback
    ? { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 12, attribution: credit('terrain') }
    : { type: 'raster-dem', tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], encoding: 'terrarium', tileSize: 512, maxzoom: 12, attribution: credit('terrain') }),
  // Sea depth: the older AWS tiles include the sea floor (Mapterhorn does not); low zoom is enough for depth bands.
  bathymetry: () => ({ type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 6, attribution: credit('terrain') }),
  // Modern rivers by size, for zoomed-out views (see docs/BASE_MAP.md).
  hydrorivers: (c) => pmtiles(c, 'hydrorivers.pmtiles', 'hydrosheds', 8),
  // OpenStreetMap water, waterways and water names (free, no key). Also in the base style.
  ofm: () => OFM_SOURCE,
};

/** OpenStreetMap vector tiles via OpenFreeMap: the base map's water, and named rivers and seas. */
export const OFM_SOURCE: SourceSpecification = { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: credit('openfreemap') };

let terrainFallback = false;
/** Switch the relief to the fallback tiles (after the primary ones failed). Returns false if already switched. */
export function switchTerrainToFallback(): boolean {
  if (terrainFallback) return false;
  terrainFallback = true;
  return true;
}

export function credit(id: DatasetId): string {
  const d = DATASET_CREDIT[id];
  return `<a href="${d.url}" target="_blank" rel="noreferrer">${d.name}</a> (${d.license})`;
}

// ── Layer builders ────────────────────────────────────────────────────────
function pleiadesPoints(id: string, cat: string, color: string, ctx: LayerCtx, opts: { labelZoom?: number; radius?: number; minzoom?: number } = {}): LayerSpecification[] {
  // Own dates → shown inside them. No dates but an evidence period (ef/et, from linked records or the
  // source's period — see the build) → shown inside that period, faded. No temporal evidence at all →
  // only when the reader asks to see undated records, and then marked as undated.
  const filter = ['all', ['in', cat, ['get', 'l']], existedIn(ctx.year, { envelope: { from: 'ef', to: 'et' }, undated: ctx.showUndated ? 'show' : 'hide' })] as FilterSpecification;
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

/**
 * OpenHistoricalMap's `name` is the local-language name (Arabic, Hebrew, Chinese, Greek…). Labels use a
 * readable name instead: the English name if recorded, else `name` when it is already in Latin script,
 * else a Latin-script name recorded in another language. When none is recorded, no label is drawn
 * (the dot stays; tapping it shows the original name) — local script is never shown as the map label.
 */
export const OHM_LATIN_LANGS = ['la', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'ca', 'pl', 'sv', 'nb', 'da', 'fi', 'cs', 'hu', 'ro', 'tr', 'id', 'vi', 'eu', 'hr', 'sk', 'sl'];
/**
 * True when the text starts in Latin script: below U+0370 (Latin, Latin-1, Latin Extended A/B, IPA and the
 * modifier letters transliterations use, like ʿ), or Latin Extended Additional (Ḥ, Ṣ, Ạ…, U+1E00–U+1EFF).
 */
const latinStart = (e: ExpressionSpecification): ExpressionSpecification => ['all', ['>', ['length', e], 0],
  ['any', ['<', e, 'Ͱ'], ['all', ['>=', e, 'Ḁ'], ['<', e, 'ἀ']]]];
export const ohmLabel: ExpressionSpecification = ['case',
  ['has', 'name_en'], ['get', 'name_en'],
  latinStart(['to-string', ['coalesce', ['get', 'name'], ''] ]), ['get', 'name'],
  ['coalesce', ...OHM_LATIN_LANGS.map((l) => ['get', `name_${l}`] as ExpressionSpecification), '']] as ExpressionSpecification;

function ohmPlaces(id: string, types: string[], color: string, minzoom: number, size: number, ctx: LayerCtx): LayerSpecification[] {
  const filter = ['all', ['in', ['get', 'type'], ['literal', types]], ohmExisted(ctx.year)] as FilterSpecification;
  return [
    { id: `${id}-pt`, type: 'circle', source: 'ohm', 'source-layer': 'place_points_centroids', filter, minzoom, paint: { 'circle-radius': size, 'circle-color': color, 'circle-stroke-color': C.halo, 'circle-stroke-width': 1 } },
    { id: `${id}-label`, type: 'symbol', source: 'ohm', 'source-layer': 'place_points_centroids', filter, minzoom, layout: { 'text-field': ohmLabel, 'text-font': FONT, 'text-size': size * 3.2, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
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
  // Outlines that overlap another polity's with no recorded relationship to explain it, and small
  // outlying pieces far from the main territory are drawn fainter and dashed.
  const doubtful: ExpressionSpecification = ['any', ['has', 'x'], ['has', 'op']];
  return [
    { id: `${id}-fill`, type: 'fill', source: 'cliopatria', filter: filled, paint: { 'fill-color': polityColour(POLITY_PALETTE), 'fill-opacity': ['case', ['has', 'op'], 0.07, ['has', 'x'], 0.1, 0.16] } },
    { id: `${id}-edge`, type: 'line', source: 'cliopatria', filter: filled, paint: { 'line-color': polityColour(POLITY_PALETTE), 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 7, 1.6], 'line-opacity': ['case', doubtful, 0.5, 0.7], 'line-blur': 0.6 } },
    { id: `${id}-edge-doubt`, type: 'line', source: 'cliopatria', filter: ['all', filled, doubtful] as FilterSpecification, paint: { 'line-color': polityColour(POLITY_TEXT), 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.6 } },
    { id: `${id}-group`, type: 'line', source: 'cliopatria', filter: grouping, paint: { 'line-color': polityColour(POLITY_TEXT), 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 7, 2.2], 'line-dasharray': [4, 2], 'line-opacity': 0.55 } },
    { id: `${id}-label`, type: 'symbol', source: 'cliopatria', filter: labels, layout: {
      // Groupings are named without Cliopatria's parentheses, in italic, so they read as "a grouping", not a state.
      // The everyday name when the source's is a formal title ("Third Hellenic Republic" → Greece; see the build),
      // groupings without Cliopatria's parentheses.
      'text-field': ['case', ['has', 'cn'], ['get', 'cn'], ['has', 'g'], ['slice', ['get', 'n'], 1, ['-', ['length', ['get', 'n']], 1]], ['get', 'n']],
      'text-font': ['case', ['has', 'g'], ['literal', FONT_ITALIC], ['literal', FONT_BOLD]],
      'text-size': areaLabelSize, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 8,
      'symbol-placement': 'point', 'symbol-sort-key': ['-', 0, ['get', 'a']], 'text-padding': 6, 'text-optional': true,
    }, paint: { 'text-color': polityColour(POLITY_TEXT), 'text-opacity': ['case', ['has', 'x'], 0.6, 0.85], 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
  ];
}

function events(id: string, kind: string | string[], color: string, ctx: LayerCtx, extra?: string): LayerSpecification[] {
  const filter = ['all', typeof kind === 'string' ? ['==', ['get', 'k'], kind] : ['in', ['get', 'k'], ['literal', kind]], eventNear(ctx.year, ctx.eventWindow)] as FilterSpecification;
  // A second source adds only what the first lacks (the build drops its duplicates); drawn the same way.
  return ['wikidata-events', ...(extra ? [extra] : [])].flatMap((source, i): LayerSpecification[] => {
    const sid = i ? `${id}-${source}` : id;
    return [
      { id: `${sid}-pt`, type: 'circle', source, filter, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 8, 6], 'circle-color': color, 'circle-opacity': ['case', ['>=', u(), 1], 0.5, 0.9], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } },
      { id: `${sid}-label`, type: 'symbol', source, filter, minzoom: 4, layout: { 'text-field': ['concat', ['get', 'n'], '\n', ['case', ['<', ['get', 'y'], 0], ['concat', ['to-string', ['-', 0, ['get', 'y']]], ' BCE'], ['concat', ['to-string', ['get', 'y']], ' CE']]], 'text-font': FONT_BOLD, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },
    ];
  });
}

// ── Europe-wide medieval sites (Wikidata + Germania Sacra) and towns (Buringh) ──
/** Sites founded up to 1650 (later ones are left out at build time). */
const SITES: [HistYear, HistYear] = [300, 1900];
/** Zoom from which sites with no date at all are drawn (about town level), when the reader includes undated records. */
export const UNDATED_MINZOOM = 9;
/** How long before its first record (or evidence period) a site is drawn, hollow, when the reader includes undated records. */
export const BEFORE_RECORD_YEARS = 60;
/** Years either side of a snapshot listing within which the listed place is drawn (lighter); see sitePoints. */
export const SNAPSHOT_YEARS = 25;

function sitePoints(id: string, kinds: string[], color: string, ctx: LayerCtx, opts: { labelZoom: number; radius: number; sources?: string[] }): LayerSpecification[] {
  // Own dates only (founding / first mention → dissolution, as recorded), or an evidence period (a building-campaign
  // century, a register's period class, a style): shown inside them. Without own evidence at the year nothing is drawn,
  // unless the reader includes undated records — and then:
  //   • first recorded later (or evidence period begins later; a first mention is not a founding): hollow from
  //     BEFORE_RECORD_YEARS before that record, never further back;
  //   • no date at all (or only an end, which says nothing about a beginning): grey "?" dots, only from town-level
  //     zoom and only inside the period the record's dataset covers (w0–w1 from the build; older tiles: this layer's
  //     period) — so they never fill the overview map at every date.
  const y = ctx.year;
  const kind: ExpressionSpecification = ['in', ['get', 'k'], ['literal', kinds]];
  const endOnly: ExpressionSpecification = ['all', ['!', ['has', 'f']], ['has', 't'], ['<', y, ['get', 't']]];
  // A snapshot (a gazetteer or register listing the place in one year: 'sn') says only that it existed then; it is drawn,
  // lighter, within SNAPSHOT_YEARS of that year (a stated display tolerance — the record keeps its one year).
  const snapshot: ExpressionSpecification = ['all', ['has', 'sn'], ['<=', ['abs', ['-', y, ['get', 'ef']]], SNAPSHOT_YEARS]];
  const when: ExpressionSpecification = ['any', snapshot, ['all', ['!', ['has', 'sn']], existedIn(y, { undated: 'hide', envelope: { from: 'ef', to: 'et' } }), ['!', endOnly]]];
  const soon = (field: string): ExpressionSpecification => ['all', ['>', ['get', field], y], ['<=', ['-', ['get', field], BEFORE_RECORD_YEARS], y]];
  const recordedSoon: ExpressionSpecification = ['any',
    ['all', ['has', 'f'], ['!=', ['coalesce', ['get', 'fb'], ''], 'founded'], soon('f'), ['any', ['!', ['has', 't']], ['>=', ['get', 't'], y]]],
    ['all', ['!', ['any', ['has', 'f'], ['has', 't']]], ['has', 'ef'], soon('ef')]];
  const inWindow: ExpressionSpecification = ['all', ['<=', ['coalesce', ['get', 'w0'], SITES[0]], y], ['>=', ['coalesce', ['get', 'w1'], SITES[1]], y]];
  const noStart: ExpressionSpecification = ['any', ['!', ['any', ['has', 'f'], ['has', 't'], ['has', 'ef'], ['has', 'et']]], endOnly];
  const filter = ['all', kind, ctx.showUndated ? ['any', when, recordedSoon] : when] as FilterSpecification;
  const undatedFilter = ['all', kind, inWindow, noStart] as FilterSpecification;
  // Solid only where its own dates place it at the year; lighter when only an evidence period does.
  const dated: ExpressionSpecification = ['any', ['all', ['has', 'f'], ['<=', ['get', 'f'], y]], ['all', ['!', ['has', 'f']], ['has', 't'], ['==', ['get', 't'], y]]];
  const byPeriod: ExpressionSpecification = ['all', ['!', ['any', ['has', 'f'], ['has', 't']]], ['any', ['has', 'ef'], ['has', 'et']], ['<=', ['coalesce', ['get', 'ef'], -99999], y]];
  return (opts.sources ?? siteSources()).flatMap((source): LayerSpecification[] => {
    const sfx = source === 'medieval-sites' ? '' : source === 'private-sites' ? '-private' : `-${source}`;
    return [
      { id: `${id}-pt${sfx}`, type: 'circle', source, 'source-layer': 'sites', filter, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, opts.radius * 0.6, 10, opts.radius * 1.4],
        'circle-color': ['case', dated, color, byPeriod, color, C.halo], 'circle-stroke-color': color, 'circle-stroke-width': ['case', dated, 0.8, 1.4],
        'circle-opacity': ['case', dated, 0.9, byPeriod, 0.6, 0.5] } },
      { id: `${id}-label${sfx}`, type: 'symbol', source, 'source-layer': 'sites', filter, minzoom: opts.labelZoom, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 10.5, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 }, paint: { 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ...(ctx.showUndated ? [
        { id: `${id}-undated${sfx}`, type: 'circle', source, 'source-layer': 'sites', filter: undatedFilter, minzoom: UNDATED_MINZOOM, paint: {
          'circle-radius': opts.radius * 1.6, 'circle-color': '#b8b2a7', 'circle-opacity': 0.55, 'circle-stroke-color': '#8a847a', 'circle-stroke-width': 1 } },
        { id: `${id}-undated-q${sfx}`, type: 'symbol', source, 'source-layer': 'sites', filter: undatedFilter, minzoom: UNDATED_MINZOOM, layout: {
          'text-field': ['step', ['zoom'], '?', opts.labelZoom, ['concat', '? ', ['get', 'n']]], 'text-font': FONT_ITALIC, 'text-size': 10, 'text-anchor': 'left', 'text-offset': [-0.35, 0], 'text-optional': true, 'text-allow-overlap': false },
          paint: { 'text-color': '#6f695f', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
      ] as LayerSpecification[] : []),
    ];
  });
}

/** Buringh's sample years; between two of them the estimate is interpolated. */
export const BURINGH_YEARS = [700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1550, 1600, 1650, 1700, 1750, 1800, 1850, 1900, 1950, 2000];
export const BURINGH: [HistYear, HistYear] = [700, 2000];
/** Estimated inhabitants (thousands) in the year, straight-line between the two nearest sample years. */
export function urbanPopulation(year: HistYear): ExpressionSpecification {
  const y = Math.min(Math.max(year, BURINGH[0]), BURINGH[1]);
  const b = BURINGH_YEARS.find((x) => x >= y)!;
  const a = BURINGH_YEARS[Math.max(0, BURINGH_YEARS.indexOf(b) - 1)];
  const w = b === a ? 1 : (y - a) / (b - a);
  const at = (k: number): ExpressionSpecification => ['coalesce', ['get', `p${k}`], 0];
  return ['+', ['*', 1 - w, at(a)], ['*', w, at(b)]];
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
    hint: 'Cities, towns and villages of the ancient world. Pleiades records no population, so dot size and the order places appear come from their recorded role and evidence — capital, administrative centre, urban place, port, road hub (Itiner-e), sites recorded there — with how well documented they are counting only a little. It is not a size. Hollow = rough location; faded = uncertain.',
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
    id: 'urban-population', group: 'places', label: 'Towns by estimated population (Europe)', datasets: ['buringh'], defaultOn: true, coverage: BURINGH,
    hint: 'About 2,200 European towns with Buringh’s estimate of their population in each century from 700 (half-centuries after 1500), straight-line between sample years. Dot size = estimated inhabitants; a town is drawn only while its estimate is above zero (zero means below the dataset’s threshold, not that nothing was there). Many figures are proxies or imputations. English names are matched to Wikidata; unmatched towns keep the dataset’s own spelling.', sources: ['urban-population'],
    specs: (c) => {
      const pop = urbanPopulation(c.year);
      const filter = ['all', inWindow(c.year, BURINGH), ['>', pop, 0]] as FilterSpecification;
      const r: ExpressionSpecification = ['interpolate', ['linear'], pop, 1, 2.2, 10, 3.6, 40, 5.8, 100, 8, 400, 12];
      return [
        { id: 'urban-population-pt', type: 'circle', source: 'urban-population', 'source-layer': 'towns', filter, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['*', 0.7, r], 8, ['*', 1.2, r]], 'circle-color': C.city, 'circle-opacity': 0.75, 'circle-stroke-color': C.halo, 'circle-stroke-width': 1 } },
        { id: 'urban-population-label', type: 'symbol', source: 'urban-population', 'source-layer': 'towns', filter, minzoom: 4, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_BOLD, 'text-size': ['interpolate', ['linear'], pop, 5, 10.5, 50, 12.5, 200, 14], 'symbol-sort-key': ['-', 0, pop], 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': C.city, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
      ];
    },
  },
  {
    id: 'dated-settlements', group: 'places', label: 'Settlements by first written mention', datasets: ['wikidata', 'wbohemia', 'finreg'], defaultOn: false, coverage: SITES,
    hint: 'Villages and towns shown from the year of their first written mention (or founding) as Wikidata records it — about 25,000 across Europe, but very unevenly: thousands in Czechia, Romania, Germany and Ukraine, few in France, Italy or Spain, because it depends on what has been entered, not on how many places there were. A first mention is not a founding date.', get sources() { return siteSources(); },
    specs: (c) => sitePoints('dated-settlements', ['settlement'], C.village, c, { labelZoom: 9, radius: 2.4 }),
  },
  {
    id: 'gazetteer-settlements', group: 'places', label: 'Settlements in historical gazetteers & registers', datasets: ['ivillaris', 'ottomannfs', 'generalkarte', 'cassini', 'lutsch', 'canmore', 'nid', 'sirkd'], defaultOn: true, coverage: SITES,
    hint: 'Places listed in dated historical sources, each shown for the year or period its source gives — never earlier: England and Wales in Index Villaris (1680); the Ottoman Empire’s population registers (1830–1849, each place in its register’s year); the Balkans on the Austro-Hungarian Generalkarte (sheet editions c. 1880–1918); France on the Cassini map (surveyed 1756–1789); Transylvania on the Lutsch map (1751); Scottish settlements by the period Canmore assigns; Polish manors and town layouts by their recorded construction date. A place listed in one year is drawn (lighter) within 25 years of it.',
    sources: ['register-sites'],
    specs: (c) => sitePoints('gazetteer-settlements', ['settlement'], C.village, c, { labelZoom: 9, radius: 2.4, sources: ['register-sites'] }),
  },
  {
    id: 'inscriptions', group: 'places', alsoIn: ['economic'], label: 'Latin inscriptions (find-spots, 100–799)', datasets: ['lirelist'], defaultOn: true, coverage: [100, 799],
    hint: 'Places where Latin inscriptions dated to the century shown were found (epitaphs, dedications, milestones, honorific and building inscriptions), from the LIST dataset (Epigraphic Database Heidelberg and Clauss–Slaby). A find-spot appears only in centuries with inscriptions dated there — only inscriptions dated to within 150 years are used — never across the gaps between them. Larger dots: more inscriptions of that century.',
    sources: ['inscriptions'],
    specs: (c) => {
      const cent = Math.floor(Math.max(100, Math.min(799, c.year)) / 100) * 100;
      const n: ExpressionSpecification = ['coalesce', ['get', `c${cent}`], 0];
      const filter = ['all', inWindow(c.year, [100, 799]), ['>', n, 0]] as FilterSpecification;
      return [
        { id: 'inscriptions-pt', type: 'circle', source: 'inscriptions', 'source-layer': 'findspots', filter, paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['interpolate', ['linear'], n, 1, 1.2, 50, 3], 9, ['interpolate', ['linear'], n, 1, 2.5, 50, 6]] as ExpressionSpecification,
          'circle-color': '#6d6875', 'circle-opacity': 0.75, 'circle-stroke-color': C.halo, 'circle-stroke-width': 0.6 } },
        { id: 'inscriptions-label', type: 'symbol', source: 'inscriptions', 'source-layer': 'findspots', filter, minzoom: 8, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 10, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#55505c', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
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
    // Neutral grey shadows read as landform rather than as a colour; the "igor" method keeps ridges crisp without a plastic look.
    specs: () => [
      // Zoomed out, a light tint by height (lowland, upland, mountain), fading out by zoom 10.
      { id: 'terrain-tint', type: 'color-relief', source: 'terrain', maxzoom: 10, paint: { 'color-relief-opacity': ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 0.7, 10, 0] as ExpressionSpecification,
        'color-relief-color': ['interpolate', ['linear'], ['elevation'], 0, 'rgba(110,140,90,0.10)', 300, 'rgba(110,140,90,0)', 700, 'rgba(150,115,75,0.07)', 1500, 'rgba(130,105,85,0.14)', 2500, 'rgba(235,235,240,0.30)'] as ExpressionSpecification } } as LayerSpecification,
      { id: 'terrain-hillshade', type: 'hillshade', source: 'terrain', paint: { 'hillshade-method': 'igor', 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.45, 12, 0.35], 'hillshade-shadow-color': '#4a4744', 'hillshade-highlight-color': 'rgba(255,255,255,0.5)', 'hillshade-accent-color': '#4a4744' } }],
  },
  {
    id: 'sea-depth', group: 'physical', label: 'Sea depth', datasets: ['terrain'], defaultOn: true,
    hint: 'Deeper sea is drawn darker (bands from 500 m down), from elevation data that includes the sea floor (Mapzen/AWS). Shallow coastal shelves are not shaded.', sources: ['bathymetry'],
    specs: () => [{ id: 'sea-depth-fill', type: 'color-relief', source: 'bathymetry', paint: { 'color-relief-opacity': ['interpolate', ['linear'], ['zoom'], 3, 1, 9, 0.6, 12, 0.3] as ExpressionSpecification,
      'color-relief-color': ['interpolate', ['linear'], ['elevation'], -6000, 'rgba(40,85,125,0.30)', -3000, 'rgba(40,85,125,0.22)', -1500, 'rgba(50,95,135,0.14)', -500, 'rgba(60,105,145,0.07)', -450, 'rgba(60,105,145,0)'] as ExpressionSpecification } } as LayerSpecification],
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
    id: 'rivers', group: 'physical', label: 'Rivers', datasets: ['hydrosheds', 'openfreemap', 'naturalearth', 'pleiades'], defaultOn: true,
    hint: 'Blue: rivers as they run today — large rivers first, tributaries as you zoom in (HydroRIVERS; closer in, OpenStreetMap). Many have shifted since antiquity. Darker named lines: ancient river courses recorded in Pleiades.', sources: ['hydrorivers', 'ofm', 'ne-rivers', 'pleiades-lines'],
    specs: (c) => [
      // Zoomed out: the river network by upstream area, as wide as the river is large (mean discharge, m³/s).
      // Its lines come from a 500 m elevation model, so from zoom 8 they give way to the exact OpenStreetMap rivers.
      { id: 'rivers-modern', type: 'line', source: 'hydrorivers', 'source-layer': 'rivers', maxzoom: 8.6, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.riverNet, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7.8, 0.9, 8.6, 0] as ExpressionSpecification,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, ['interpolate', ['linear'], RIVER_Q, 0, 0.6, 1000, 1.1, 6000, 2], 8, ['interpolate', ['linear'], RIVER_Q, 0, 0.9, 50, 1.2, 1000, 2.6, 6000, 4]] as ExpressionSpecification } },
      { id: 'rivers-osm', type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 7.8, filter: ['==', ['get', 'class'], 'river'] as FilterSpecification, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.riverNet, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7.8, 0, 8.6, 0.9] as ExpressionSpecification, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 12, 1.8, 15, 2.6] as ExpressionSpecification } },
      { id: 'rivers-ancient', type: 'line', source: 'pleiades-lines', filter: ['all', ['==', ['get', 'k'], 'river'], existedIn(c.year, { undated: 'show' })] as FilterSpecification, paint: { 'line-color': '#2b6f95', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 9, 2.4], 'line-opacity': certaintyOpacity(0.9) } },
      // Names: up to zoom 11 from Natural Earth's named rivers (OpenStreetMap stores rivers in short pieces, too short
      // on screen to carry a name until then); from zoom 11 from OpenStreetMap's named rivers (English name if any).
      { id: 'rivers-label', type: 'symbol', source: 'ne-rivers', minzoom: 5, maxzoom: 11, filter: ['has', 'n'] as FilterSpecification,
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 250, 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10.5, 10, 11.5] as ExpressionSpecification, 'text-letter-spacing': 0.06 },
        paint: { 'text-color': '#2b6f95', 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      { id: 'rivers-label-osm', type: 'symbol', source: 'ofm', 'source-layer': 'waterway', minzoom: 11, filter: ['all', ['==', ['get', 'class'], 'river'], ['has', 'name']] as FilterSpecification,
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': FONT_ITALIC, 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11.5, 14, 12.5] as ExpressionSpecification, 'text-letter-spacing': 0.06 },
        paint: { 'text-color': '#2b6f95', 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
    ],
  },
  {
    id: 'water-change', group: 'physical', label: 'Reclaimed land (as water before)', datasets: ['osm'], defaultOn: true,
    hint: 'Land made from sea or lakes — the Zuiderzee polders (Flevoland, 1942–1968), the Haarlemmermeer (1852), the Beemster, Purmer and Schermer (17th century), Venice’s Tronchetto (c. 1960) — is drawn as water in the years it was water. Outlines and early extents are approximate; before the dates given, today’s land is shown.',
    sources: ['physical-change'],
    specs: (c) => {
      const filter = ['all', ['==', ['get', 'k'], 'became-land'], ['<=', ['get', 'f'], c.year], ['<', c.year, ['get', 'y']]] as FilterSpecification;
      return [
        { id: 'water-change-fill', type: 'fill', source: 'physical-change', filter, paint: { 'fill-color': C.sea, 'fill-antialias': false } },
        { id: 'water-change-line', type: 'line', source: 'physical-change', minzoom: 7, filter, paint: { 'line-color': C.coast, 'line-width': 0.8, 'line-dasharray': [3, 3], 'line-opacity': 0.45 } },
      ];
    },
  },
  {
    id: 'reservoirs-past', group: 'physical', label: 'Reservoirs only after their dams', datasets: ['hydrolakes'], defaultOn: true,
    hint: 'Reservoirs (dammed lakes) are drawn as the land they flooded until their dam was built. Dates from Wikidata; reservoirs with no recorded date are treated as built after 1800 (assumed).', sources: ['reservoirs'],
    specs: (c) => {
      const filter = ['<', c.year, ['get', 'y']] as FilterSpecification;
      return [
        { id: 'reservoirs-past-fill', type: 'fill', source: 'reservoirs', 'source-layer': 'reservoirs', filter, paint: { 'fill-color': C.land, 'fill-opacity': 0.88 } },
        { id: 'reservoirs-past-line', type: 'line', source: 'reservoirs', 'source-layer': 'reservoirs', minzoom: 8, filter, paint: { 'line-color': C.coast, 'line-width': 0.7, 'line-dasharray': [2, 3], 'line-opacity': 0.5 } },
      ];
    },
  },
  {
    id: 'mountain-names', group: 'physical', label: 'Mountain ranges & peaks (names)', datasets: ['physlabels'], defaultOn: true,
    hint: 'Today’s names of mountain ranges, plateaus, plains and deltas (Natural Earth), and of peaks by how far they rise above their surroundings (Wikidata).', sources: ['physical-labels'],
    specs: () => [
      { id: 'mountain-names-region', type: 'symbol', source: 'physical-labels', filter: ['all', ['!=', ['get', 'k'], 'peak'], ['<=', ['get', 'z'], ['zoom']]] as FilterSpecification,
        layout: { 'text-field': ['upcase', ['get', 'n']], 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9.5, 8, 12] as ExpressionSpecification, 'text-letter-spacing': 0.25, 'text-max-width': 8 },
        paint: { 'text-color': ['match', ['get', 'k'], 'range', '#6b5d4f', 'plateau', '#6b5d4f', '#7a6f5f'] as ExpressionSpecification, 'text-halo-color': C.halo, 'text-halo-width': 1.2, 'text-opacity': 0.85 } },
      { id: 'mountain-names-peak', type: 'symbol', source: 'physical-labels', minzoom: 7, filter: ['all', ['==', ['get', 'k'], 'peak'], ['<=', ['get', 'z'], ['zoom']]] as FilterSpecification,
        layout: { 'text-field': ['case', ['has', 'e'], ['concat', '▲ ', ['get', 'n'], '\n', ['to-string', ['get', 'e']], ' m'], ['concat', '▲ ', ['get', 'n']]] as ExpressionSpecification, 'text-font': FONT, 'text-size': 10, 'symbol-sort-key': ['-', 0, ['get', 'p']] as ExpressionSpecification },
        paint: { 'text-color': '#5e5246', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
    ],
  },
  {
    id: 'modern-names', group: 'modern', label: 'Today’s place names', datasets: ['openfreemap'], defaultOn: false,
    hint: 'Names of cities, towns and villages as they are today, in grey, for orientation only — they say nothing about whether a place existed at the year shown. Historical names always take precedence.', sources: ['ofm'],
    specs: () => (['city', 'town', 'village'] as const).map((cls, i) => ({
      id: `modern-names-${cls}`, type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: [4, 8, 11][i],
      filter: (cls === 'city' ? ['all', ['==', ['get', 'class'], 'city'], ['<=', ['coalesce', ['get', 'rank'], 10], ['step', ['zoom'], 3, 6, 6, 7, 10]]] : ['==', ['get', 'class'], cls]) as FilterSpecification,
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': FONT, 'text-size': [11, 10, 9.5][i], 'text-padding': 6, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] as ExpressionSpecification },
      paint: { 'text-color': C.modern, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
    }) as LayerSpecification),
  },
  {
    id: 'modern-roads', group: 'modern', label: 'Today’s main roads', datasets: ['openfreemap'], defaultOn: false,
    hint: 'Motorways and main roads as they are today, thin and grey, for orientation only.', sources: ['ofm'],
    specs: () => [{ id: 'modern-roads-line', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 6,
      filter: ['step', ['zoom'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]], 9, ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]]] as FilterSpecification,
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9a97a0', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 1.6] as ExpressionSpecification, 'line-opacity': 0.7 } }],
  },
  {
    id: 'water-names', group: 'physical', label: 'Seas & lakes (names)', datasets: ['openfreemap'], defaultOn: true,
    hint: 'Today’s names of seas, gulfs and straits, for orientation (OpenStreetMap); lake names only from 1900, as many lakes and their names are modern (the IJsselmeer dates from 1932). Historical names come from the historical layers.', sources: ['ofm'],
    specs: (c) => [
      { id: 'water-names-sea', type: 'symbol', source: 'ofm', 'source-layer': 'water_name', filter: ['in', ['get', 'class'], ['literal', ['ocean', 'sea', 'bay', 'strait', 'gulf']]] as FilterSpecification,
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': FONT_ITALIC, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10.5, 8, 14] as ExpressionSpecification, 'text-letter-spacing': 0.18, 'text-max-width': 7 },
        paint: { 'text-color': '#3f7396', 'text-halo-color': 'rgba(255,255,255,0.45)', 'text-halo-width': 1 } },
      ...(c.year < MODERN_LAKE_NAMES ? [] : [{ id: 'water-names-lake', type: 'symbol', source: 'ofm', 'source-layer': 'water_name', minzoom: 6, filter: ['==', ['get', 'class'], 'lake'] as FilterSpecification,
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': FONT_ITALIC, 'text-size': 11, 'text-max-width': 6, 'text-letter-spacing': 0.05 },
        paint: { 'text-color': '#3f7396', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } } as LayerSpecification]),
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
    id: 'roads-cassini', group: 'infrastructure', label: 'Roads on the Cassini map (France, c. 1756–1815)', datasets: ['cassini'], defaultOn: true, coverage: [1756, 1815],
    hint: 'The road network of France as drawn on the Cassini map (sheets surveyed 1756–1789, published to 1815), digitised by Perret, Gribaudi & Barthelemy. Shown only within those years; the dataset does not give each sheet’s year. Fainter: marked uncertain in the source.', sources: ['cassini-roads'],
    specs: (c) => {
      const filter = inWindow(c.year, [1756, 1815]);
      return [{ id: 'roads-cassini-line', type: 'line', source: 'cassini-roads', 'source-layer': 'roads', filter,
        paint: { 'line-color': '#8d5524', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 10, 1.8], 'line-opacity': ['case', ['==', ['get', 'u'], 1], 0.45, 0.8] } }];
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
    id: 'battles', group: 'military', label: 'Battles', datasets: ['wikidata', 'hced'], defaultOn: true,
    hint: 'Battles with a recorded place and date (Wikidata), plus battles before 1600 that only the Historical Conflict Event Dataset records (year only; located from the battle’s name, then checked by its authors). Faded where the date is only known to the decade or century.', sources: ['wikidata-events', 'hced-battles'], specs: (c) => events('battles', 'battle', C.battle, c, 'hced-battles'),
  },
  {
    id: 'sieges', group: 'military', label: 'Sieges', datasets: ['wikidata', 'hced'], defaultOn: true,
    hint: 'Sieges with a recorded place and date (Wikidata), plus sieges before 1600 only the Historical Conflict Event Dataset records.', sources: ['wikidata-events', 'hced-battles'], specs: (c) => events('sieges', 'siege', C.siege, c, 'hced-battles'),
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
    id: 'castles', group: 'military', alsoIn: ['places'], label: 'Castles & fortifications (Europe)', datasets: ['wikidata', 'merimee', 'finreg'], defaultOn: true, coverage: SITES,
    hint: 'Castles, tower houses, mottes, town walls and other fortifications from Wikidata, shown from their recorded founding date or first mention. Most castles in Wikidata have no such date (about 5,000 of 32,000 do), so most appear only with “Include undated records” — hollow. France adds castles and fortified houses from the Mérimée register, dated by their main building campaign (lighter dots); Finland adds strongholds its register classes as medieval. Zoom in to see them all.', get sources() { return siteSources(); },
    specs: (c) => sitePoints('castles', ['castle', 'fortification'], C.fort, c, { labelZoom: 9, radius: 2.8 }),
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
    get unavailableKind() { return privateTile('rural-settlement.pmtiles') ? undefined : 'licence' as const; },
    get unavailable() { return privateTile('rural-settlement.pmtiles') ? undefined : 'Needs your private data file: the Atlas of Rural Settlement terms allow personal and business use, not republishing on a public site.'; },
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
    id: 'religious-houses', group: 'economic', alsoIn: ['places'], label: 'Monasteries, churches, cathedrals & universities (Europe)', datasets: ['wikidata', 'germaniasacra', 'merimee', 'finreg'], defaultOn: true, coverage: SITES,
    hint: 'Abbeys, priories, convents, friaries and other religious houses, cathedrals, bishops’ sees and early universities, from Wikidata — joined, for the Holy Roman Empire, with Germania Sacra’s monastery database, which dates each order’s tenure of each house. Shown from the recorded founding or first mention to the recorded dissolution. Where no dissolution is recorded the house is drawn on to the present, which is often wrong after the Reformation or secularisation. France adds protected medieval churches, abbeys and cathedrals from the Mérimée register, dated by the century of their main building campaign (lighter dots: the building dates from then — the site may be older); Finland adds churches the national register classes as medieval.', get sources() { return siteSources(); },
    specs: (c) => sitePoints('religious-houses', ['monastery', 'cathedral', 'diocese', 'university', 'church'], C.religious, c, { labelZoom: 8, radius: 2.8 }),
  },
  {
    id: 'hre-towns', group: 'political', alsoIn: ['places'], label: 'Towns of the Empire: charters & rulers', datasets: ['hre'], defaultOn: true, coverage: [800, 1806],
    hint: 'The ~2,400 towns of the Deutsches Städtebuch (Princes and Townspeople): drawn light from the first written mention, dark from the town charter. Tap a town for its ruling territory in the chosen year (recorded every year from 1300 — the dataset’s own reliable period), its charter’s legal family and its first market grant. Territories are recorded as ruling lineages, as the dataset does.', sources: ['hre-towns'],
    specs: (c) => {
      const y = c.year;
      const chartered: ExpressionSpecification = ['all', ['has', 'ch'], ['<=', ['get', 'ch'], y]];
      const recorded = ['any', chartered, ['all', ['has', 'f'], ['<=', ['get', 'f'], y]]] as FilterSpecification;
      return [
        { id: 'hre-towns-pt', type: 'circle', source: 'hre-towns', 'source-layer': 'towns', filter: recorded, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['case', chartered, 2.6, 1.6], 10, ['case', chartered, 5.5, 3.4]], 'circle-color': ['case', chartered, '#3e2723', '#a1887f'], 'circle-stroke-color': C.halo, 'circle-stroke-width': 0.8 } },
        { id: 'hre-towns-label', type: 'symbol', source: 'hre-towns', 'source-layer': 'towns', filter: recorded, minzoom: 7, layout: { 'text-field': ['get', 'n'], 'text-font': FONT, 'text-size': ['case', chartered, 11, 10], 'symbol-sort-key': ['case', chartered, 0, 1], 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#3e2723', 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
  },
  {
    id: 'poland-1580-landscape', group: 'physical', alsoIn: ['infrastructure'], label: 'Poland c. 1580: roads, rivers & forests (private data)', datasets: ['localonly'], defaultOn: false, coverage: [1500, 1650],
    get unavailableKind() { return privateTile('private-lines.pmtiles') ? undefined : 'licence' as const; },
    get unavailable() { return privateTile('private-lines.pmtiles') ? undefined : 'Needs your private data file (Atlas Fontium has no stated licence to republish).'; },
    hint: 'The Crown of Poland in the second half of the 16th century, from the Institute of History’s Atlas historyczny Polski (Atlas Fontium): roads (in the atlas’s two weight classes), rivers, forest cover and lakes as reconstructed from tax registers and maps. One period for the whole map — it shows c. 1550–1600, not earlier.',
    sources: ['private-lines'],
    specs: (c) => {
      const w = ['all', ['boolean', c.year >= 1500 && c.year <= 1650]] as FilterSpecification;
      const k = (v: string) => ['all', w, ['==', ['get', 'k'], v]] as FilterSpecification;
      return [
        { id: 'pl1580-forest', type: 'fill', source: 'private-lines', 'source-layer': 'features', filter: k('forest'), paint: { 'fill-color': '#7a9a5a', 'fill-opacity': 0.3 } },
        { id: 'pl1580-water', type: 'fill', source: 'private-lines', 'source-layer': 'features', filter: k('water'), paint: { 'fill-color': '#9cc3d5', 'fill-opacity': 0.8 } },
        { id: 'pl1580-river', type: 'line', source: 'private-lines', 'source-layer': 'features', filter: k('river'), paint: { 'line-color': '#2b6f95', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 10, 1.6] } },
        { id: 'pl1580-road', type: 'line', source: 'private-lines', 'source-layer': 'features', filter: k('road'), paint: { 'line-color': '#8d5524', 'line-width': ['case', ['==', ['get', 'w'], '1'], 1.8, 1], 'line-dasharray': [3, 1.5] } },
      ];
    },
  },
  {
    id: 'poland-1580-units', group: 'political', label: 'Poland c. 1580: voivodeships, districts, dioceses & parishes (private data)', datasets: ['localonly'], defaultOn: false, coverage: [1500, 1650],
    get unavailableKind() { return privateTile('private-lines.pmtiles') ? undefined : 'licence' as const; },
    get unavailable() { return privateTile('private-lines.pmtiles') ? undefined : 'Needs your private data file (Atlas Fontium has no stated licence to republish).'; },
    hint: 'Administrative and church units of the Crown of Poland in the second half of the 16th century (Atlas Fontium): voivodeships, districts (powiaty), dioceses and parishes. Shown for c. 1500–1650 only.',
    sources: ['private-lines'],
    specs: (c) => {
      const w = ['all', ['boolean', c.year >= 1500 && c.year <= 1650]] as FilterSpecification;
      const k = (v: string) => ['all', w, ['==', ['get', 'k'], v]] as FilterSpecification;
      return [
        { id: 'pl1580-parish', type: 'line', source: 'private-lines', 'source-layer': 'features', filter: k('parish'), minzoom: 8, paint: { 'line-color': C.religious, 'line-width': 0.5, 'line-opacity': 0.5 } },
        { id: 'pl1580-diocese', type: 'line', source: 'private-lines', 'source-layer': 'features', filter: k('diocese'), paint: { 'line-color': C.religious, 'line-width': 1.4, 'line-dasharray': [4, 2] } },
        { id: 'pl1580-district', type: 'line', source: 'private-lines', 'source-layer': 'features', filter: k('district'), paint: { 'line-color': C.province, 'line-width': 0.9, 'line-dasharray': [2, 1.5] } },
        { id: 'pl1580-voivodeship', type: 'line', source: 'private-lines', 'source-layer': 'features', filter: k('voivodeship'), paint: { 'line-color': C.province, 'line-width': 2 } },
        { id: 'pl1580-unit-label', type: 'symbol', source: 'private-lines', 'source-layer': 'features', filter: ['all', w, ['in', ['get', 'k'], ['literal', ['voivodeship', 'district']]]] as FilterSpecification, minzoom: 6, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 11, 'text-optional': true, 'symbol-placement': 'point' }, paint: { 'text-color': C.province, 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
      ];
    },
  },
  {
    id: 'medieval-markets', group: 'economic', label: 'Market rights & fairs (charters)', get datasets() { return ['hre', 'merimee', ...(PRIVATE_SITES() ? ['localonly' as DatasetId] : [])] as DatasetId[]; }, defaultOn: false, coverage: [600, 1806],
    get hint() { return `Places shown from the year their first market or fair is recorded: towns of the Holy Roman Empire (first market grant, Princes and Townspeople) and French medieval market halls (Mérimée).${PRIVATE_SITES() ? ' Your private data adds the markets and fairs of England and Wales to 1516 (Letters) and other recorded markets.' : ' England and Wales (Letters, Gazetteer of Markets and Fairs to 1516) need your private data file: that dataset’s licence is not stated.'} Viabundus tolls and fairs are a separate layer.`; },
    get sources() { return ['hre-towns', 'medieval-sites', ...(PRIVATE_SITES() ? ['private-sites'] : [])]; },
    specs: (c) => {
      const y = c.year;
      const granted = ['all', ['has', 'm'], ['<=', ['get', 'm'], y]] as FilterSpecification;
      const circle = (id: string, source: string, sourceLayer: string, filter: FilterSpecification): LayerSpecification => ({
        id, type: 'circle', source, 'source-layer': sourceLayer, filter,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.2, 10, 5], 'circle-color': C.market, 'circle-stroke-color': C.halo, 'circle-stroke-width': 1 },
      });
      return [
        circle('medieval-markets-hre', 'hre-towns', 'towns', granted),
        ...sitePoints('medieval-markets', ['market'], C.market, c, { labelZoom: 9, radius: 2.6 }),
        ...(PRIVATE_SITES() ? [circle('medieval-markets-private', 'private-sites', 'sites', ['all', ['==', ['get', 'k'], 'market'], granted] as FilterSpecification)] : []),
      ];
    },
  },
  {
    id: 'medieval-archaeology', group: 'places', label: 'Archaeology & monuments: registers, bridges, mills, wrecks', datasets: ['finreg', 'bridges1250', 'nokm', 'canmore', 'irlsmr', 'nid'], defaultOn: false, coverage: SITES,
    hint: 'Sites national registers date to the Viking Age or Middle Ages — Finland and Norway (burial mounds, house sites, farm mounds, boat landings), each shown for its register period — and England’s bridges and fords attested before c. 1250; Scotland’s monument record (Canmore), each site for the period it names; Ireland’s monuments record (dated only where the monument class names a date — the rest only with “Include undated records”); Poland’s register of monuments, from the century it records for construction (placed at their village or town). With your private data: Danish, Swedish and Romanian registers, coin hoards (Denmark; Carolingian hoards 751–987) and dated shipwrecks.', get sources() { return siteSources(); },
    specs: (c) => sitePoints('medieval-archaeology', ['site', 'bridge', 'hoard', 'wreck', 'road', 'mill', 'mine', 'harbour', 'building'], C.arch, c, { labelZoom: 10, radius: 2.2 }),
  },
  {
    id: 'empire-dioceses', group: 'political', alsoIn: ['economic'], label: 'Dioceses of the Empire (Germania Sacra)', datasets: ['germaniasacra'], defaultOn: false, coverage: [900, 1803],
    hint: 'Diocese borders of the Holy Roman Empire as reconstructed by Germania Sacra. The reconstruction is for no single stated date, so it is shown for the whole period 900–1803 — dioceses were founded, divided and changed within it.', sources: ['gs-dioceses'],
    specs: (c) => [
      { id: 'empire-dioceses-line', type: 'line', source: 'gs-dioceses', 'source-layer': 'dioceses', filter: inWindow(c.year, [900, 1803]), paint: { 'line-color': C.religious, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 9, 2], 'line-opacity': 0.7, 'line-dasharray': [4, 2] } },
      { id: 'empire-dioceses-label', type: 'symbol', source: 'gs-dioceses', 'source-layer': 'dioceses', filter: inWindow(c.year, [900, 1803]), minzoom: 5, layout: { 'text-field': ['get', 'n'], 'text-font': FONT_ITALIC, 'text-size': 11, 'text-optional': true, 'symbol-placement': 'point' }, paint: { 'text-color': C.religious, 'text-halo-color': C.halo, 'text-halo-width': 1.3 } },
    ],
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
  cities: 80, 'urban-population': 78, ports: 75, settlements: 72, towns: 70, 'islamic-places': 68, 'medieval-places': 66,
  'religious-houses': 45, castles: 44, 'hre-towns': 64, 'medieval-markets': 42, 'medieval-archaeology': 37, 'dated-settlements': 38, 'empire-dioceses': 36,
  domesday: 60, battles: 55, sieges: 54, wars: 53, villages: 40,
  // Modern base-map names: river names keep the middle rank they always had (below towns, kingdoms and battles);
  // sea and lake names give way to every historical label.
  'water-names': 20, 'mountain-names': 22, 'modern-names': 10,
};
/** Sort key for a layer's labels (priority, then draw order). */
export const labelKey = (id: string) => (LABEL_PRIORITY[id] ?? 50) * 1000 + Math.max(0, DRAW_ORDER.indexOf(id));

export const DRAW_ORDER = ['terrain', 'lakes', 'empires', 'kingdoms', 'republics', 'other-states', 'territories', 'provinces', 'borders', 'empire-dioceses', 'poland-1580-units', 'domesday', 'rural-settlement', 'sea-depth', 'reservoirs-past', 'coast-modern', 'coast-ancient', 'poland-1580-landscape', 'rivers', 'water-change', 'water-names', 'mountain-names', 'inland-navigation', 'modern-roads', 'roads', 'roads-ancient', 'roads-roman', 'roads-medieval', 'gough-map', 'roads-cassini', 'trade-routes',
  'archaeological', 'religious', 'cultural', 'markets', 'tolls-fairs', 'bridges', 'mountains', 'passes', 'forts', 'medieval-archaeology', 'dated-settlements', 'gazetteer-settlements', 'inscriptions', 'religious-houses', 'castles', 'medieval-markets', 'hre-towns', 'villages', 'towns', 'islamic-places', 'medieval-places', 'ports', 'settlements', 'urban-population', 'cities', 'modern-names', 'political-events', 'expeditions', 'revolts', 'campaigns', 'sieges', 'battles', 'wars'];

export const PALETTE = C;
