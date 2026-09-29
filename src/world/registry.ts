// The Historical Data Source Registry — one entry per dataset or collection,
// recording what it covers, how good it is for each kind of question, how
// Shelf can reach it, and its licence. The coverage matrix and source
// selection are computed from these entries, so a new dataset is added by
// adding an entry (and, to use it, an adapter). See
// docs/HISTORICAL_DATA_AUDIT.md for the audit behind each entry.
import type { HistYear } from '../atlas/time';
import type { DataType, Quality, RegionId } from './axes';

/** A: specialist scholarly · B: institutional collection · C: general reference · D: collaborative. */
export type Tier = 'A' | 'B' | 'C' | 'D';
export const TIER_LABEL: Record<Tier, string> = {
  A: 'Specialist scholarly dataset',
  B: 'Institutional collection',
  C: 'General reference',
  D: 'Collaborative / crowd-sourced',
};
/** offline: built into Shelf · live: queried from the phone · catalogued: known, not used yet · excluded: licence/access. */
export type Access = 'offline' | 'live' | 'catalogued' | 'excluded';
/** Reconstruction (modern scholarship) vs original cartography (maps made at the time). */
export type SourceKind = 'reconstruction' | 'cartography' | 'reference' | 'events';

export interface Coverage { regions: RegionId[] | 'world'; from: HistYear; to: HistYear; types: Partial<Record<DataType, Quality>> }

export interface SourceEntry {
  id: string;
  name: string;
  provider: string;
  url: string;
  tier: Tier;
  kind: SourceKind;
  access: Access;
  coverage: Coverage[];
  license: string;
  licenseUrl?: string;
  attribution: string;
  /** Can the data be used commercially (false = NC licence). */
  commercial?: boolean;
  api?: string;
  download?: string;
  geometry: string;
  temporal: string;
  provenance: string;
  status: string;
  limitations: string[];
  updates: string;
  /** What was checked in the audit (date and result). */
  verified?: string;
  /** Why it is catalogued or excluded rather than used. */
  note?: string;
}

const MED: RegionId[] = ['italy', 'iberia', 'france-low-countries', 'balkans-greece', 'anatolia-levant', 'egypt-north-africa', 'british-isles', 'central-europe'];
const NEAR_EAST: RegionId[] = ['mesopotamia-iran', 'arabia', 'anatolia-levant', 'egypt-north-africa'];
const EUROPE: RegionId[] = ['british-isles', 'iberia', 'france-low-countries', 'italy', 'central-europe', 'northern-europe', 'balkans-greece', 'eastern-europe'];

export const SOURCES: SourceEntry[] = [
  // ── Tier A ──
  {
    id: 'pleiades', name: 'Pleiades', provider: 'ISAW (NYU) & Ancient World Mapping Center', url: 'https://pleiades.stoa.org/', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [
      { regions: MED, from: -3000, to: 640, types: { places: 'excellent', names: 'excellent', settlements: 'excellent', archaeological: 'moderate', military: 'moderate', religious: 'moderate', physical: 'moderate', roads: 'limited', administrative: 'limited', cultural: 'limited' } },
      { regions: [...NEAR_EAST, 'central-asia'], from: -3000, to: 640, types: { places: 'moderate', names: 'moderate', settlements: 'moderate', archaeological: 'limited' } },
      { regions: MED, from: 641, to: 1500, types: { places: 'limited', names: 'limited' } },
    ],
    license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', attribution: 'Pleiades: A Gazetteer of Past Places', commercial: true,
    api: 'JSON per place (CORS)', download: 'Daily GIS package', geometry: 'Representative point per place; some lines and polygons; precise/rough with accuracy radius',
    temporal: 'Broad archaeological periods per location and per name', provenance: 'Creators, bibliographic references and revision history per record',
    status: 'Peer-edited scholarly gazetteer', limitations: ['No settlement size or importance', 'Dates are periods, not founding/abandonment dates', 'Province outlines too coarse for point tests'],
    updates: 'Continuous (daily export)', verified: '2026-09-29: place JSON 200, CORS *',
  },
  {
    id: 'awmc', name: 'Ancient World Mapping Center geodata', provider: 'University of North Carolina', url: 'https://awmc.unc.edu/', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: [...MED, ...NEAR_EAST], from: -750, to: 640, types: { physical: 'excellent', roads: 'moderate', political: 'limited', administrative: 'limited' } }],
    license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: 'Ancient World Mapping Center (Barrington Atlas–derived), ODbL', commercial: true,
    download: 'GitHub', geometry: 'Lines and polygons (Barrington Atlas scale)', temporal: 'Barrington periods (Archaic–Late Antique)', provenance: 'Derived from the Barrington Atlas',
    status: 'University research centre', limitations: ['Some attributes undocumented', 'Inland water based on modern OSM'], updates: 'Occasional', verified: '2026-09-29: GitHub download',
  },
  {
    id: 'itinere', name: 'Itiner-e: the digital atlas of ancient roads', provider: 'Brughmans, de Soto, Pažout & Bjerregaard Vahlstrup', url: 'https://itiner-e.org/', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: [...MED, ...NEAR_EAST], from: -300, to: 640, types: { roads: 'excellent', routes: 'moderate' } }],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Itiner-e: the digital atlas of ancient roads (Brughmans et al. 2024), CC BY 4.0', commercial: true,
    download: 'NDJSON of all segments; Zenodo 10.5281/zenodo.17122148', geometry: 'Road segments with citable URIs', temporal: 'Limited road dating', provenance: 'Per-segment sources and certainty',
    status: 'Scholarly, community-edited', limitations: ['Work in progress', 'Few roads are closely dated'], updates: 'Ongoing', verified: '2026-09-29: download 200; licence on About page',
  },
  {
    id: 'viabundus', name: 'Viabundus', provider: 'Universities of Göttingen, Groningen, Münster, Lund et al.', url: 'https://www.viabundus.eu/', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: ['central-europe', 'northern-europe', 'france-low-countries'], from: 1350, to: 1650, types: { places: 'excellent', names: 'moderate', settlements: 'excellent', roads: 'excellent', routes: 'excellent', trade: 'excellent', physical: 'moderate' } }],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Viabundus map of premodern European transport and mobility 2 (CC BY 4.0)', commercial: true,
    download: 'Zenodo 10.5281/zenodo.16611998', geometry: 'Nodes (points), road and waterway edges, town outlines', temporal: 'Dated nodes and edges', provenance: 'Literature references per record',
    status: 'Multi-university research project', limitations: ['Work in progress', 'Northern Europe only'], updates: 'Versioned releases', verified: '2026-09-29: Zenodo record, CC BY 4.0',
  },
  {
    id: 'althurayya', name: 'al-Ṯurayyā Gazetteer', provider: 'M. Romanov & M. Seydi, after G. Cornu', url: 'https://althurayya.github.io/', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: [...NEAR_EAST, 'iberia', 'central-asia'], from: 800, to: 1000, types: { places: 'moderate', names: 'moderate', settlements: 'moderate', routes: 'moderate', trade: 'limited' } }],
    license: 'Apache-2.0 (repository); data after Cornu, Atlas du monde arabo-islamique', attribution: 'al-Ṯurayyā Gazetteer (Romanov & Seydi), after G. Cornu', commercial: true,
    download: 'GeoJSON on GitHub (CORS)', geometry: 'Points; route sections', temporal: 'Period of the atlas (9th–10th c.), not per place', provenance: 'Cornu atlas identifiers per toponym',
    status: 'Scholarly digital humanities project', limitations: ['Georeferenced from an atlas', 'One period for all records'], updates: 'Occasional', verified: '2026-09-29: 2,518 places, CORS *',
  },
  {
    id: 'chgis', name: 'China Historical GIS (TGAZ)', provider: 'Harvard University & Fudan University', url: 'https://chgis.hudci.org/tgaz/', tier: 'A', kind: 'reconstruction', access: 'live',
    coverage: [{ regions: ['china'], from: -222, to: 1911, types: { places: 'excellent', names: 'excellent', administrative: 'excellent', settlements: 'moderate' } }],
    license: 'CHGIS terms of use (queried live, not redistributed)', attribution: 'CHGIS, Harvard University & Fudan University', api: 'TGAZ placename search (CORS)',
    geometry: 'Points', temporal: 'Year range per unit', provenance: 'Parent unit and feature type per record', status: 'University research project', limitations: ['Chinese/pinyin names', 'Sparse before 222 BCE'],
    updates: 'Versioned', verified: '2026-09-29: TGAZ JSON 200, CORS *',
  },
  {
    id: 'histogis', name: 'HistoGIS', provider: 'Austrian Centre for Digital Humanities (ACDH-CH)', url: 'https://histogis.acdh.oeaw.ac.at/', tier: 'A', kind: 'reconstruction', access: 'live',
    coverage: [{ regions: EUROPE, from: 1815, to: 1919, types: { political: 'excellent', administrative: 'excellent' } }, { regions: ['anatolia-levant'], from: 1815, to: 1919, types: { political: 'moderate', administrative: 'limited' } }],
    license: 'Not stated in the API (queried live, not redistributed)', attribution: 'HistoGIS, ACDH-CH', api: 'where-was by point and date (CORS)',
    geometry: 'Polygons', temporal: 'Start/end dates with accuracy code', provenance: 'Per-source description of the historical maps used', status: 'Academy research centre',
    limitations: ['Mostly Central/Southern Europe', '1815–1919'], updates: 'Occasional', verified: '2026-09-29: Skopje 1912-06-01 → Ottoman Empire (Europe Stateborders 1910)',
  },
  {
    id: 'cliopatria', name: 'Cliopatria', provider: 'Seshat Global History Databank', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: 'world', from: -3400, to: 2024, types: { political: 'moderate' } }, { regions: [...EUROPE, ...NEAR_EAST, 'china', 'south-asia'], from: -1000, to: 2024, types: { political: 'excellent' } }],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Cliopatria, Seshat Global History Databank (CC BY 4.0)', commercial: true,
    download: 'GitHub', geometry: 'Polygons (simplified by Shelf)', temporal: 'Start/end year per shape', provenance: 'Per-polity sources in the dataset', status: 'Scholarly databank',
    limitations: ['One reconstruction per polity', 'Simplified outlines'], updates: 'Versioned',
  },
  {
    id: 'cshapes', name: 'CShapes 2.0', provider: 'ETH Zürich (International Conflict Research)', url: 'https://icr.ethz.ch/data/cshapes/', tier: 'A', kind: 'reconstruction', access: 'catalogued',
    coverage: [{ regions: 'world', from: 1886, to: 2019, types: { political: 'excellent' } }],
    license: 'CC BY-NC-SA 4.0', attribution: 'Schvitz et al., CShapes 2.0', commercial: false, download: 'Website', geometry: 'Polygons', temporal: 'Daily validity', provenance: 'Documented codebook',
    status: 'University research group', limitations: ['Non-commercial licence'], updates: 'Versioned', verified: '2026-09-29: licence on site', note: 'Held back: non-commercial licence.',
  },
  {
    id: 'hgis-indias', name: 'HGIS de las Indias', provider: 'University of Vienna et al.', url: 'https://www.hgis-indias.net/', tier: 'A', kind: 'reconstruction', access: 'catalogued',
    coverage: [{ regions: ['latin-america'], from: 1701, to: 1808, types: { places: 'excellent', settlements: 'excellent', administrative: 'moderate', religious: 'moderate' } }],
    license: 'See project', attribution: 'HGIS de las Indias', geometry: 'Points', temporal: 'Dated', provenance: 'Archival sources', status: 'Research project', limitations: ['No direct download found'], updates: '—',
    verified: '2026-09-29: website 200', note: 'Reached through World Historical Gazetteer where contributed.',
  },
  {
    id: 'gb1900', name: 'GB1900 gazetteer', provider: 'GB1900 volunteers, University of Portsmouth, NLS', url: 'https://www.visionofbritain.org.uk/data/', tier: 'A', kind: 'reconstruction', access: 'catalogued',
    coverage: [{ regions: ['british-isles'], from: 1888, to: 1914, types: { places: 'excellent', names: 'excellent', settlements: 'excellent' } }],
    license: 'CC BY-SA 4.0 (docs)', attribution: 'GB1900', geometry: 'Points', temporal: 'Map edition dates', provenance: 'OS six-inch map sheets', status: 'Crowd-transcribed from OS maps', limitations: ['Not reachable from the build environment'], updates: 'Static',
    note: 'Candidate for a Britain c. 1900 pack.',
  },
  {
    id: 'damast', name: 'DAMAST (Dhimmis & Muslims)', provider: 'LMU Munich', url: 'https://damast.geschichte.uni-muenchen.de/', tier: 'A', kind: 'reconstruction', access: 'catalogued',
    coverage: [{ regions: NEAR_EAST, from: 600, to: 1500, types: { religious: 'excellent', cultural: 'moderate' } }],
    license: 'CC BY 4.0 (Zenodo)', attribution: 'DAMAST, LMU Munich', download: 'Docker image on Zenodo', geometry: 'Points', temporal: 'Dated evidence', provenance: 'Source-based', status: 'University project',
    limitations: ['Distributed as an application image'], updates: 'Static', verified: '2026-09-29: Zenodo record', note: 'Candidate for the religious layer.',
  },
  { id: 'dare', name: 'DARE — Digital Atlas of the Roman Empire', provider: 'J. Åhlfeldt', url: 'https://imperium.ahlfeldt.se/', tier: 'A', kind: 'reconstruction', access: 'catalogued', coverage: [{ regions: MED, from: -200, to: 500, types: { places: 'moderate', roads: 'moderate' } }], license: 'CC BY-SA (docs)', attribution: 'DARE, Johan Åhlfeldt', geometry: 'Points, tiles', temporal: 'Roman', provenance: 'Barrington-based', status: 'Scholarly individual project', limitations: ['Overlaps Pleiades'], updates: 'Occasional', note: 'Overlaps Pleiades.' },
  { id: 'orbis', name: 'ORBIS', provider: 'Stanford University', url: 'https://orbis.stanford.edu/', tier: 'A', kind: 'reconstruction', access: 'catalogued', coverage: [{ regions: MED, from: 0, to: 300, types: { routes: 'moderate' } }], license: 'See project', attribution: 'ORBIS, Stanford', geometry: 'Network', temporal: 'c. 200 CE', provenance: 'Modelled', status: 'University model', limitations: ['Modelled costs, not attested journeys'], updates: 'Static', note: 'A model, not a record of routes.' },
  { id: 'syriaca', name: 'Syriaca.org gazetteer', provider: 'Syriaca.org', url: 'https://syriaca.org/geo/', tier: 'A', kind: 'reconstruction', access: 'catalogued', coverage: [{ regions: NEAR_EAST, from: 0, to: 1500, types: { places: 'moderate', religious: 'moderate' } }], license: 'CC BY 3.0 (docs)', attribution: 'Syriaca.org', geometry: 'Points', temporal: 'Dated attestations', provenance: 'Bibliography', status: 'Scholarly', limitations: [], updates: 'Occasional', verified: '2026-09-29: reachable, CORS *' },
  { id: 'euratlas', name: 'Euratlas Periodis', provider: 'Euratlas-Nüssli', url: 'https://www.euratlas.net/', tier: 'A', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: EUROPE, from: 1, to: 2000, types: { political: 'excellent' } }], license: 'Commercial', attribution: 'Euratlas', commercial: false, geometry: 'Polygons per century', temporal: 'Century snapshots', provenance: 'Publisher', status: 'Commercial atlas', limitations: ['Paid licence'], updates: '—', note: 'Excluded: paid licence.' },

  // ── Tier B: original cartography ──
  {
    id: 'loc', name: 'Library of Congress — Geography & Map Division', provider: 'Library of Congress', url: 'https://www.loc.gov/maps/', tier: 'B', kind: 'cartography', access: 'live',
    coverage: [{ regions: 'world', from: 1500, to: 1990, types: { maps: 'excellent' } }, { regions: ['north-america'], from: 1600, to: 1990, types: { maps: 'excellent' } }],
    license: 'Per item (many “no known restrictions”)', attribution: 'Library of Congress, Geography and Map Division', api: 'loc.gov JSON search (CORS), IIIF images',
    geometry: 'Not georeferenced (catalogue place terms)', temporal: 'Publication date per map', provenance: 'Full catalogue record', status: 'National library', limitations: ['Place search is by catalogue terms, not coordinates'], updates: 'Continuous',
    verified: '2026-09-29: search JSON 200, CORS *',
  },
  {
    id: 'rumsey', name: 'David Rumsey Map Collection', provider: 'David Rumsey Map Center, Stanford', url: 'https://www.davidrumsey.com/', tier: 'B', kind: 'cartography', access: 'live',
    coverage: [{ regions: 'world', from: 1500, to: 1950, types: { maps: 'excellent' } }],
    license: 'CC BY-NC-SA 3.0 (docs)', attribution: 'David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries', commercial: false, api: 'LUNA search JSON and IIIF (CORS)',
    geometry: 'Many maps georeferenced (via Allmaps / Georeferencer)', temporal: 'Publication date', provenance: 'Catalogue record', status: 'Institutional collection', limitations: ['Non-commercial image licence'], updates: 'Continuous',
    verified: '2026-09-29: LUNA JSON 200, IIIF manifest 200, CORS *',
  },
  {
    id: 'allmaps', name: 'Allmaps georeferences', provider: 'Allmaps', url: 'https://allmaps.org/', tier: 'B', kind: 'cartography', access: 'live',
    coverage: [{ regions: 'world', from: 1500, to: 1990, types: { maps: 'moderate' } }, { regions: EUROPE, from: 1500, to: 1990, types: { maps: 'excellent' } }],
    license: 'Annotations open; each image keeps its collection’s licence', attribution: 'Georeference via Allmaps', api: 'maps?intersects=W,S,E,N (CORS)',
    geometry: 'Ground control points per map', temporal: 'From the source collection', provenance: 'Annotation id and version', status: 'Open georeferencing infrastructure', limitations: ['Coverage depends on who georeferenced what'], updates: 'Continuous',
    verified: '2026-09-29: bbox search 200 with control points',
  },
  { id: 'nls', name: 'National Library of Scotland maps', provider: 'NLS', url: 'https://maps.nls.uk/', tier: 'B', kind: 'cartography', access: 'catalogued', coverage: [{ regions: ['british-isles'], from: 1560, to: 1970, types: { maps: 'excellent' } }], license: 'Per layer', attribution: 'National Library of Scotland', geometry: 'Georeferenced layers', temporal: 'Edition dates', provenance: 'Catalogue', status: 'National library', limitations: ['Bot check blocked access from the build environment'], updates: 'Continuous' },
  { id: 'oldmapsonline', name: 'Old Maps Online', provider: 'Klokan Technologies & partners', url: 'https://www.oldmapsonline.org/', tier: 'B', kind: 'cartography', access: 'catalogued', coverage: [{ regions: 'world', from: 1500, to: 1950, types: { maps: 'excellent' } }], license: 'Per collection', attribution: 'Old Maps Online', geometry: 'Footprints', temporal: 'Map dates', provenance: 'Links to holders', status: 'Aggregator', limitations: ['No public API; Cloudflare challenge'], updates: 'Continuous', note: 'Link out only.' },

  // ── Tier C ──
  {
    id: 'whg', name: 'World Historical Gazetteer', provider: 'Univ. of Pittsburgh, Univ. of London & partners', url: 'https://whgazetteer.org/', tier: 'C', kind: 'reference', access: 'live',
    coverage: [{ regions: 'world', from: -3000, to: 2000, types: { places: 'moderate', names: 'moderate' } }],
    license: 'Per contributed dataset', attribution: 'World Historical Gazetteer and its contributing datasets', api: 'index search (CORS)',
    geometry: 'Points, some polygons', temporal: 'Time spans where contributed', provenance: 'Contributing dataset per record; TGN-backed parents', status: 'Scholarly aggregation framework',
    limitations: ['Aggregates sources of mixed quality — used for discovery and cross-checking'], updates: 'Continuous', verified: '2026-09-29: index JSON 200, CORS *',
  },
  { id: 'tgn', name: 'Getty Thesaurus of Geographic Names', provider: 'Getty Research Institute', url: 'https://www.getty.edu/research/tools/vocabularies/tgn/', tier: 'C', kind: 'reference', access: 'catalogued', coverage: [{ regions: 'world', from: -3000, to: 2024, types: { places: 'moderate', names: 'excellent' } }], license: 'ODC-By', attribution: 'Getty TGN', geometry: 'Points', temporal: 'Some dated names', provenance: 'Sources per name', status: 'Institutional vocabulary', limitations: ['No CORS; SPARQL blocked from the build environment'], updates: 'Monthly', note: 'Reached through WHG.' },
  { id: 'geonames', name: 'GeoNames', provider: 'GeoNames', url: 'https://www.geonames.org/', tier: 'C', kind: 'reference', access: 'catalogued', coverage: [{ regions: 'world', from: 1900, to: 2024, types: { places: 'excellent', names: 'moderate' } }], license: 'CC BY 4.0', attribution: 'GeoNames', geometry: 'Points', temporal: 'Modern', provenance: 'Mixed', status: 'Reference', limitations: ['Modern; needs a registered username'], updates: 'Daily' },
  { id: 'naturalearth', name: 'Natural Earth', provider: 'Natural Earth', url: 'https://www.naturalearthdata.com/', tier: 'C', kind: 'reference', access: 'offline', coverage: [{ regions: 'world', from: 1990, to: 2100, types: { physical: 'moderate' } }], license: 'Public domain', attribution: 'Made with Natural Earth', commercial: true, geometry: 'Lines, polygons', temporal: 'Modern', provenance: 'Cartographic', status: 'Reference', limitations: ['Modern coastlines and rivers'], updates: 'Occasional' },

  // ── Tier D ──
  {
    id: 'wikidata', name: 'Wikidata', provider: 'Wikimedia', url: 'https://www.wikidata.org/', tier: 'D', kind: 'events', access: 'offline',
    coverage: [{ regions: 'world', from: -3000, to: 2024, types: { battles: 'moderate', places: 'moderate', names: 'limited', political: 'limited' } }, { regions: EUROPE, from: -500, to: 2024, types: { battles: 'excellent' } }],
    license: 'CC0', attribution: 'Wikidata (CC0)', commercial: true, api: 'SPARQL (CORS)', geometry: 'Points', temporal: 'Dates with precision', provenance: 'References per statement (variable)',
    status: 'Collaborative knowledge base', limitations: ['Crowd-sourced; check important facts'], updates: 'Continuous', verified: '2026-09-29: SPARQL 200, CORS *',
  },
  { id: 'ohm', name: 'OpenHistoricalMap', provider: 'OHM community', url: 'https://www.openhistoricalmap.org/', tier: 'D', kind: 'reconstruction', access: 'live', coverage: [{ regions: 'world', from: 1500, to: 2024, types: { places: 'limited', settlements: 'limited', roads: 'limited', political: 'limited' } }, { regions: ['north-america', 'central-europe'], from: 1700, to: 2024, types: { settlements: 'moderate', roads: 'moderate', political: 'moderate' } }], license: 'CC0', attribution: 'OpenHistoricalMap contributors', commercial: true, geometry: 'Vector tiles', temporal: 'Start/end dates', provenance: 'Source tags (variable)', status: 'Collaborative', limitations: ['Uneven coverage'], updates: 'Continuous' },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
