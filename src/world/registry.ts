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
    note: 'Skipped for now at the owner’s request (2026-09-30).',
  },
  {
    id: 'damast', name: 'DAMAST (Dhimmis & Muslims)', provider: 'LMU Munich', url: 'https://damast.geschichte.uni-muenchen.de/', tier: 'A', kind: 'reconstruction', access: 'catalogued',
    coverage: [{ regions: NEAR_EAST, from: 600, to: 1500, types: { religious: 'excellent', cultural: 'moderate' } }],
    license: 'CC BY 4.0 (Zenodo)', attribution: 'DAMAST, LMU Munich', download: 'Docker image on Zenodo', geometry: 'Points', temporal: 'Dated evidence', provenance: 'Source-based', status: 'University project',
    limitations: ['Distributed as an application image'], updates: 'Static', verified: '2026-09-29: Zenodo record', note: 'Candidate for the religious layer.',
  },
  {
    id: 'domesday', name: 'Domesday Shires and Hundreds of England', provider: 'S. Brookes, Landscapes of Governance (UCL); Archaeology Data Service', url: 'https://doi.org/10.5284/1058999', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: ['british-isles'], from: 1066, to: 1106, types: { administrative: 'excellent', political: 'moderate' } }],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Brookes, S. (2020) Domesday Shires and Hundreds of England, ADS', commercial: true,
    download: 'ADS collection 1003676 (original ZIPs in data/historical/raw/domesday)', geometry: 'Polygons: 35 shires, 21 intermediate districts, 810 hundreds/wapentakes', temporal: 'The 1086 arrangement',
    provenance: 'Retrogressive reconstruction from the Alecto Domesday maps and 1851 parish boundaries', status: 'Leverhulme research project',
    limitations: ['Units as believed to exist in 1086 only', 'Thin in Durham, Northumberland, Westmorland, Cumberland (wards); partial for Wales'], updates: 'Static', verified: '2026-09-30: original ZIPs uploaded, checksums recorded, CC BY 4.0',
  },
  {
    id: 'gough', name: 'The Routes and Roads of the Gough Map', provider: 'E. Oksanen & S. Brookes; Archaeology Data Service', url: 'https://doi.org/10.5284/1124312', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: ['british-isles'], from: 1350, to: 1450, types: { roads: 'moderate', routes: 'moderate', settlements: 'limited', places: 'limited' } }],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Oksanen, E., Brookes, S. (2024) The Routes and Roads of the Gough Map: GIS Database, ADS', commercial: true,
    download: 'ADS collection 1007268', geometry: '179 way stations, 188 red lines (schematic), 455 matched route segments', temporal: 'The Gough Map, c. 1400',
    provenance: 'Map features matched to documentary, archaeological, place-name and cartographic evidence', status: 'University research project',
    limitations: ['A selection of routes, not the whole network', 'Red lines are schematic', 'Some codes (route period) not explained in the files'], updates: 'Static', verified: '2026-09-30: original ZIPs checked, CC BY 4.0',
  },
  {
    id: 'inland-navigation', name: 'Inland Navigation in England and Wales before 1348', provider: 'E. Oksanen, Early Medieval Atlas; Archaeology Data Service', url: 'https://doi.org/10.5284/1057497', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: ['british-isles'], from: 1000, to: 1348, types: { physical: 'moderate', routes: 'moderate', trade: 'moderate' } }],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Oksanen, E. (2019) Inland Navigation in England and Wales before 1348, ADS', commercial: true,
    download: 'ADS collection 1003427', geometry: 'Waterway lines (direct and indirect evidence), heads of navigation, river-traffic place-names', temporal: '11th century – 1348; latest dates per head of navigation',
    provenance: 'Documentary, archaeological and place-name references per record', status: 'University research project',
    limitations: ['Courses follow modern or boundary lines where unknown', 'Indirect evidence is mostly undatable place-names'], updates: 'Static', verified: '2026-09-30: original ZIPs checked, CC BY 4.0',
  },
  {
    id: 'rural-settlement', name: 'Atlas of Rural Settlement in England GIS', provider: 'Roberts & Wrathmell; English Heritage (now Historic England)', url: 'https://doi.org/10.5284/1031493', tier: 'A', kind: 'reconstruction', access: 'catalogued',
    coverage: [{ regions: ['british-isles'], from: 1000, to: 1900, types: { settlements: 'moderate', cultural: 'moderate', physical: 'moderate' } }],
    license: '© English Heritage — download for personal and business use', attribution: 'Roberts, B. K. & Wrathmell, S., Atlas of Rural Settlement in England GIS (English Heritage)',
    download: 'ADS / Historic England (manual download; uploaded by the owner)', geometry: 'Settlement provinces, sub-provinces, local regions; 10,513 nucleations; terrain', temporal: 'Mapped from 19th-century OS maps; not dated per feature',
    provenance: 'Roberts & Wrathmell 2000 atlas, digitised 2011', status: 'Heritage agency dataset', limitations: ['Terms do not permit republishing', 'A characterisation, not a dated record'], updates: 'Static',
    note: 'Processed for local builds only (VITE_SHELF_LOCAL_DATA=1): the terms allow personal and business use, not republishing on a public site.',
  },
  { id: 'medieval-bridges', name: 'Bridges of Medieval England to c.1250', provider: 'Brookes, Rye & Oksanen; Archaeology Data Service', url: 'https://doi.org/10.5284/1053676', tier: 'A', kind: 'reconstruction', access: 'offline', coverage: [{ regions: ['british-isles'], from: 600, to: 1250, types: { roads: 'moderate', places: 'limited' } }], license: 'CC BY 4.0', attribution: 'Brookes, S., Rye, E., Oksanen, E. (2019) Bridges of Medieval England to c.1250, ADS', commercial: true, geometry: 'Points', temporal: 'First attestations', provenance: 'Documents, surveys, place-names', status: 'University research project', limitations: [], updates: 'Static', note: 'Layer "Medieval archaeological sites" and gazetteer bridges1250 (since the 2026-10 second audit pass).' },
  { id: 'tribal-hidage', name: 'Beyond the Tribal Hidage — burial census', provider: 'Harrington & Brookes; Archaeology Data Service', url: 'https://doi.org/10.5284/1136515', tier: 'A', kind: 'reconstruction', access: 'catalogued', coverage: [{ regions: ['british-isles'], from: 450, to: 650, types: { archaeological: 'moderate' } }], license: 'CC BY 4.0', attribution: 'Harrington, S., Brookes, S. (2025) Census Data from Beyond the Tribal Hidage, ADS', commercial: true, geometry: 'Site table with coordinates', temporal: 'Early Anglo-Saxon (c. 450–650)', provenance: 'Excavation records', status: 'University research project', limitations: ['Burial sites only; no kingdom polygons'], updates: 'Static', note: 'Raw data held in data/historical/raw; not yet processed into a layer.' },
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
    license: 'WHG: CC BY-NC 4.0; each contributing source has its own licence (and some forbid redistribution)', licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/', attribution: 'World Historical Gazetteer and its contributing datasets', commercial: false,
    api: 'Reconciliation Service API v0.2 (POST /reconcile, token, via Shelf’s server) and the public index search', geometry: 'Points, some polygons', temporal: 'Time spans where contributed', provenance: 'Contributing source (namespace) per record, with its licence', status: 'Scholarly aggregation framework',
    limitations: ['Aggregates sources of mixed quality — candidate evidence for reconciliation, never the identification itself', 'Three sources (CHGIS, Native Land, Ancient Parishes) forbid redistribution'], updates: 'Continuous',
    verified: '2026-09-30: /reconcile manifest v0.2, /api/sources (28 namespaces), public index JSON 200',
    note: 'External reconciliation source — not downloaded. Queried per place name, results cached on the device.',
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
  {
    id: 'wikidata-sites', name: 'Wikidata medieval sites snapshot', provider: 'Wikimedia (queried through QLever, Univ. of Freiburg)', url: 'https://www.wikidata.org/', tier: 'D', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: EUROPE, from: 400, to: 1650, types: { religious: 'moderate', military: 'moderate', settlements: 'limited', names: 'moderate' } }, { regions: ['anatolia-levant', 'egypt-north-africa'], from: 400, to: 1650, types: { religious: 'limited', military: 'limited' } }],
    license: 'CC0', attribution: 'Wikidata (CC0)', commercial: true, api: 'SPARQL (QLever mirror)', download: 'data/historical/raw/wikidata-medieval (queries saved beside results)',
    geometry: 'Points (present-day site)', temporal: 'Founding (P571), first written mention (P1249), dissolution (P576); year precision used', provenance: 'Statement references (variable); the snapshot keeps each item id',
    status: 'Collaborative knowledge base', limitations: ['Uneven: 9,400 Czech settlements have a first-mention date, a few hundred French ones', 'Only ~16% of castles have a founding date', '"Castle" includes later châteaux and Schlösser', 'No dissolution recorded for many houses'],
    updates: 'Snapshot; re-run scripts/historical-data/wikidata_snapshot.py', verified: '2026-09-30: QLever snapshot of 31,800 castles, 20,100 monasteries, 2,100 cathedrals, 750 dioceses, 5,300 fortifications (<1500), 30,300 settlements (first mention 400–1600)',
  },
  {
    id: 'germaniasacra', name: 'Germania Sacra: Klöster und Stifte des Alten Reiches', provider: 'Göttingen Academy of Sciences and Humanities; SUB Göttingen', url: 'https://klosterdatenbank.germania-sacra.de/', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: ['central-europe', 'france-low-countries', 'italy'], from: 700, to: 1810, types: { religious: 'excellent', administrative: 'moderate' } }],
    license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', attribution: 'Germania Sacra, Klöster und Stifte des Alten Reiches (NAWG)', commercial: true,
    api: 'https://api.gs.sub.uni-goettingen.de (JSON, GeoJSON)', download: 'data/historical/raw/germania-sacra', geometry: 'Points (7,473 locations); 67 diocese polygons', temporal: 'Each order’s tenure as written plus termini post/ante quos',
    provenance: 'Academy research database with bibliography per house', status: 'Long-running academy project', limitations: ['Holy Roman Empire only', 'Diocese borders for no stated date'], updates: 'Continuous', verified: '2026-09-30: API 200; licence on the Datenservice page',
  },
  {
    id: 'buringh', name: 'European urban population, 700–2000', provider: 'E. Buringh (Utrecht University); DANS', url: 'https://doi.org/10.17026/dans-xzy-u62q', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: EUROPE, from: 700, to: 2000, types: { settlements: 'excellent' } }],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Buringh, E. (2021) European urban population, 700–2000, DANS', commercial: true,
    download: 'data/historical/raw/buringh-urban', geometry: 'Points (0.01°)', temporal: 'Estimate per century (half-century after 1500)', provenance: 'Per-figure source and estimate type (proxied / imputed)',
    status: 'Published research dataset', limitations: ['Many figures proxied or imputed', 'Some coordinates wrong in the source (corrected only when confirmed by Wikidata, else dropped)', 'Towns only'], updates: 'Static', verified: '2026-09-30: DANS API 200, CC0, 2,262 towns',
  },
  {
    id: 'hced', name: 'Historical Conflict Event Dataset', provider: 'C. Miller et al. (ANU); Harvard Dataverse', url: 'https://doi.org/10.7910/DVN/6ZFC0V', tier: 'A', kind: 'events', access: 'offline',
    coverage: [{ regions: 'world', from: -1468, to: 2024, types: { battles: 'moderate' } }],
    license: 'CC0', attribution: 'Miller et al. (2022), Historical Conflict Event Dataset', commercial: true, download: 'data/historical/raw/hced', geometry: 'Points', temporal: 'Year',
    provenance: 'Warfare encyclopedias; geolocated, checked against Geacron and Dincecco & Onorato', status: 'Published research dataset', limitations: ['Year only', 'English-language encyclopedia coverage'], updates: 'Versioned', verified: '2026-09-30: Dataverse API 200, CC0; 1,070 pre-1600 battles added that Wikidata lacks',
  },
  { id: 'periodo', name: 'PeriodO', provider: 'PeriodO project', url: 'https://perio.do/', tier: 'C', kind: 'reference', access: 'catalogued', coverage: [{ regions: 'world', from: -100000, to: 2024, types: { names: 'moderate' } }], license: 'CC0', attribution: 'PeriodO', commercial: true, download: 'data/historical/raw/periodo', geometry: 'Spatial coverage by place name', temporal: 'Period start/end ranges from scholarly sources', provenance: 'Citation per definition', status: 'Scholarly gazetteer of periods', limitations: ['Not yet used by the app'], updates: 'Continuous', verified: '2026-09-30: d.json 200 (7.8 MB)', note: 'Held raw for checking what a period name means per region.' },
  // ── Added in the second audit pass (2026-10) ──
  {
    id: 'princes-townspeople', name: 'Princes and Townspeople (Deutsches Städtebuch towns)', provider: 'Bogucka, Cantoni, Mohr, Weigand (LMU/TUM); Harvard Dataverse', url: 'https://doi.org/10.7910/DVN/ZGSJED', tier: 'A', kind: 'reconstruction', access: 'offline',
    coverage: [{ regions: ['central-europe'], from: 1100, to: 1806, types: { settlements: 'excellent', political: 'excellent', trade: 'moderate', administrative: 'moderate' } }],
    license: 'CC0', attribution: 'Bogucka, Cantoni, Mohr, Weigand, Princes and Townspeople (Harvard Dataverse)', commercial: true, download: 'data/historical/raw/princes-townspeople',
    geometry: 'Points and town borders', temporal: 'First mention, foundation, charter (with uncertainty/range), market grants; ruler per year from 1300', provenance: 'Deutsches Städtebuch entries, coded',
    status: 'Published research dataset', limitations: ['Only towns that later became cities', '1937 German borders only'], updates: 'Versioned', verified: '2026-10-01: 6 Dataverse records, CC0 each',
  },
  { id: 'merimee', name: 'Mérimée — protected monuments of France', provider: 'Ministère de la Culture (POP)', url: 'https://www.pop.culture.gouv.fr/', tier: 'B', kind: 'reconstruction', access: 'offline', coverage: [{ regions: ['france-low-countries'], from: 500, to: 1500, types: { religious: 'excellent', military: 'moderate', trade: 'limited' } }], license: 'Licence Ouverte 2.0', attribution: 'Ministère de la Culture, base Mérimée', commercial: true, download: 'data.gouv.fr (CSV, 100 MB)', geometry: 'Points (WGS84)', temporal: 'Century of main and secondary building campaigns', provenance: 'Protection files', status: 'National register', limitations: ['Protected buildings only', 'Building date, not site origin'], updates: 'Weekly', verified: '2026-10-01: data.gouv.fr API, licence lov2' },
  { id: 'finland-heritage', name: 'Finnish Heritage Agency register (Muinaisjäännösrekisteri)', provider: 'Museovirasto', url: 'https://www.museovirasto.fi/', tier: 'B', kind: 'reconstruction', access: 'offline', coverage: [{ regions: ['northern-europe'], from: -9000, to: 1900, types: { archaeological: 'excellent', religious: 'moderate', military: 'moderate' } }], license: 'CC BY 4.0', attribution: 'Museovirasto (CC BY 4.0)', commercial: true, download: 'tutkija.zip (GeoPackage, daily)', geometry: 'Points, areas (ETRS-TM35FIN)', temporal: 'Period classes', provenance: 'National register', status: 'National register', limitations: ['Period classes only'], updates: 'Daily', verified: '2026-10-01: download page licence text' },
  { id: 'western-bohemia-toponyms', name: 'Toponymic Data for Western Bohemia up to AD 1500', provider: 'V. Janovská; Zenodo', url: 'https://doi.org/10.5281/zenodo.21479034', tier: 'A', kind: 'reference', access: 'offline', coverage: [{ regions: ['central-europe'], from: 1000, to: 1500, types: { names: 'excellent', settlements: 'moderate' } }], license: 'CC BY 4.0', attribution: 'Janovská (2026), Zenodo', commercial: true, geometry: 'Points', temporal: 'First and second attestation years with sources', provenance: 'Charters and registers', status: 'Research dataset', limitations: ['West Bohemia only'], updates: 'Versioned', verified: '2026-10-01: Zenodo record, licence file read' },
  { id: 'markets-fairs', name: 'Gazetteer of Markets and Fairs in England and Wales to 1516', provider: 'S. Letters (CMH, IHR); SAS-Space', url: 'https://sas-space.sas.ac.uk/106/', tier: 'A', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['british-isles'], from: 600, to: 1516, types: { trade: 'excellent' } }], license: 'Not stated (SAS-Space: UNSPECIFIED)', attribution: 'Letters, Gazetteer of Markets and Fairs', geometry: 'OS grid points', temporal: 'Grant / first record years', provenance: 'Charter rolls and other records', status: 'Research database', limitations: ['Licence not verified'], updates: 'Static', verified: '2026-10-01: files downloaded; licence field UNSPECIFIED', note: 'Local builds only until a licence is confirmed.' },
  { id: 'tib-maps-of-power', name: 'TIB Maps of Power (Byzantine historical geography)', provider: 'Tabula Imperii Byzantini, ÖAW', url: 'https://maps-of-power.oeaw.ac.at/', tier: 'A', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['balkans-greece', 'anatolia-levant'], from: 300, to: 1500, types: { places: 'excellent', settlements: 'excellent', religious: 'moderate', military: 'moderate' } }], license: 'Not stated for the data (photos CC BY 4.0)', attribution: 'TIB Maps of Power (ÖAW)', api: 'OpenAtlas API (Linked Places)', geometry: 'Points, areas, lines', temporal: 'Attestation timespans', provenance: 'TIB volumes and field survey', status: 'Academy project', limitations: ['Data licence not stated'], updates: 'Continuous', verified: '2026-10-01: API snapshot of 5,522 places', note: 'Local builds only until ÖAW confirms a data licence. Highest-value source for Byzantium found.' },
  // ── Checked in the 2026-09-30 audit, not (yet) used ──
  { id: 'atlas-fontium', name: 'Atlas Fontium / OntoHGIS (Poland, 16th c.)', provider: 'Institute of History, Polish Academy of Sciences', url: 'https://atlasfontium.pl/', tier: 'A', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['central-europe', 'eastern-europe'], from: 1500, to: 1600, types: { settlements: 'excellent', administrative: 'excellent', religious: 'excellent', roads: 'moderate' } }], license: 'Not stated (GeoNode resources report “not_specified”, restriction code “intellectualPropertyRights”)', attribution: 'Atlas Fontium, IH PAN', api: 'GeoNode WFS: geonode.ontohgis.pl', geometry: 'Points, polygons, lines', temporal: 'c. 1580 snapshot (16th-c. tax registers)', provenance: 'Tax registers', status: 'Academy research project', limitations: ['Licence not stated'], updates: 'Occasional', verified: '2026-09-30: WFS GetFeature 200 for all 11 16th-c. layers (24,092 settlements); licence not specified', note: 'Acquired for local builds only (settlements and parish seats in the local-only site tiles, dated by the atlas period); not published in this public repository until IH PAN confirms a licence.' },
  { id: 'engel-hungary', name: 'Engel Pál: Magyarország a középkor végén (renewed edition)', provider: 'ABTK / ELTE', url: 'https://abtk.hu/', tier: 'A', kind: 'reconstruction', access: 'catalogued', coverage: [{ regions: ['central-europe', 'balkans-greece'], from: 1400, to: 1526, types: { settlements: 'excellent', military: 'excellent', religious: 'excellent' } }], license: 'Unverified', attribution: 'Engel Pál, ABTK', geometry: 'GIS (format unverified)', temporal: 'c. 1500; landholding 1498', provenance: 'Charters', status: 'Research institute publication', limitations: ['Licence and file format not verified'], updates: 'Static (2020 edition)', note: 'Downloaded 2026-10-01 (vault: engel-hungary): a Windows GIS program whose database is encrypted; its only export is attribute tables without coordinates. Not integrated.' },
  { id: 'dicotopo', name: 'DicoTopo (Dictionnaires topographiques de France)', provider: 'CTHS & École nationale des chartes', url: 'https://dicotopo.cths.fr/', tier: 'A', kind: 'reference', access: 'excluded', coverage: [{ regions: ['france-low-countries'], from: 500, to: 1900, types: { names: 'excellent', settlements: 'moderate' } }], license: 'CC BY-NC-ND 3.0 FR', attribution: 'DicoTopo, CTHS / ENC', commercial: false, api: 'https://dicotopo.cths.fr/api/1.0 (JSON:API)', download: 'github.com/chartes/dico-topo (XML)', geometry: 'Points (commune)', temporal: 'Dated old name forms', provenance: 'Departmental topographical dictionaries', status: 'Scholarly', limitations: ['No derivatives (ND): cannot be republished in transformed form'], updates: 'Occasional', verified: '2026-09-30: API search 200', note: 'Private data pack: 22,366 communes with first dated attestation and 6,774 castles, churches and religious houses (by commune), from the XML volumes. ND licence: used privately, never republished.' },
  { id: 'dk-fund', name: 'Fund og Fortidsminder (Denmark)', provider: 'Slots- og Kulturstyrelsen', url: 'https://www.kulturarv.dk/fundogfortidsminder/', tier: 'B', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['northern-europe'], from: -10000, to: 1900, types: { archaeological: 'excellent', religious: 'moderate', military: 'moderate' } }], license: 'Not verified (no licence statement found on the download page, 2026-10-01)', attribution: 'Slots- og Kulturstyrelsen', commercial: true, api: 'WFS', download: 'CSV / shapefile', geometry: 'Points, polygons', temporal: 'Period classes', provenance: 'National register', status: 'National heritage register', limitations: ['Monument register, not a historical gazetteer'], updates: 'Continuous', note: 'Private data pack: 10,772 Viking-age and medieval monuments (castles, churches, monasteries, farms, roads, wrecks, coin finds) with the register’s date ranges.' },
  { id: 'kulturminnesok', name: 'Kulturminnesøk / Askeladden (Norway)', provider: 'Riksantikvaren', url: 'https://www.kulturminnesok.no/', tier: 'B', kind: 'reconstruction', access: 'offline', coverage: [{ regions: ['northern-europe'], from: -10000, to: 1900, types: { archaeological: 'excellent', religious: 'moderate' } }], license: 'NLOD (reported)', attribution: 'Riksantikvaren', geometry: 'Points, polygons', temporal: 'Period classes', provenance: 'National register', status: 'National heritage register', limitations: ['Licence reported, not verified from the download itself'], updates: 'Continuous', note: 'Public (NLOD, confirmed in Geonorge metadata): 8,941 Migration-period to medieval monuments, each dated by the register’s period code.' },
  { id: 'ran-romania', name: 'Repertoriul Arheologic Național (Romania)', provider: 'CIMEC / Institutul Național al Patrimoniului', url: 'https://ran.cimec.ro/', tier: 'B', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['balkans-greece', 'eastern-europe'], from: 300, to: 1650, types: { archaeological: 'excellent', settlements: 'moderate', religious: 'moderate', military: 'moderate' } }], license: 'OGL per data.gov.ro (not verified)', attribution: 'RAN, CIMEC', geometry: 'Points', temporal: 'Period and century per component', provenance: 'National register', status: 'National heritage register', limitations: ['Positions are site points; periods are broad unless a century is stated'], updates: 'Continuous', verified: '2026-09-30: 29,052 sites listed; positions from the ArcGIS service behind map.cimec.ro', note: 'Private data pack: 2,865 migration-period and medieval sites.' },
  { id: 'ebidat', name: 'EBIDAT castle database', provider: 'Europäisches Burgeninstitut (Deutsche Burgenvereinigung)', url: 'https://www.ebidat.de/', tier: 'A', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['central-europe', 'northern-europe'], from: 700, to: 1800, types: { military: 'excellent' } }], license: 'Not stated', attribution: 'EBIDAT, Europäisches Burgeninstitut', geometry: 'Points', temporal: 'Begin and end of use to the half or quarter century', provenance: 'Castle research literature', status: 'Research database', limitations: ['No bulk export: snapshotted page by page'], updates: 'Continuous', verified: '2026-09-30: castle pages with dating and coordinates', note: 'Private data pack: 8,263 castles of Germany and central Europe, 87% dated.' },
  { id: 'darmc', name: 'DARMC scholarly datasets', provider: 'Harvard University (M. McCormick et al.)', url: 'https://dataverse.harvard.edu/dataverse/darmc', tier: 'B', kind: 'events', access: 'excluded', coverage: [{ regions: ['british-isles', 'france-low-countries', 'italy', 'iberia', 'central-europe'], from: 1, to: 1500, types: { trade: 'moderate', archaeological: 'moderate' } }], license: 'Not stated', attribution: 'McCormick et al., DARMC', geometry: 'Points', temporal: 'Date ranges per record', provenance: 'Scholarly compilations', status: 'Research datasets', limitations: ['Selective compilations'], updates: 'Static', verified: '2026-09-30: Dataverse files downloaded', note: 'Private data pack: shipwrecks, Carolingian coin hoards, Anglo-Saxon settlements.' },
  { id: 'sweden-lamningar', name: 'Lämningar i Sverige (Kulturmiljöregistret)', provider: 'Riksantikvarieämbetet', url: 'https://pub.raa.se/nedladdning/datauttag/lamningar_v1/', tier: 'B', kind: 'reconstruction', access: 'excluded', coverage: [{ regions: ['northern-europe'], from: -10000, to: 1900, types: { archaeological: 'excellent', settlements: 'moderate', religious: 'moderate' } }], license: 'Not verified', attribution: 'Riksantikvarieämbetet', geometry: 'Points, polygons', temporal: 'Register dating', provenance: 'National register', status: 'National heritage register', limitations: ['Monument register, not a gazetteer'], updates: 'Continuous', verified: '2026-09-30: national GeoPackage downloaded', note: 'Private data pack: Iron-age and medieval remains.' },
  { id: 'nordic-spatial-humanities', name: 'Nordic Spatial Humanities (saints’ cult places, Icelandic Saga Map)', provider: 'Nordic Spatial Humanities consortium (Zenodo)', url: 'https://doi.org/10.5281/zenodo.14871254', tier: 'B', kind: 'reference', access: 'offline', coverage: [{ regions: ['northern-europe'], from: 800, to: 1600, types: { religious: 'moderate', names: 'moderate', settlements: 'limited' } }], license: 'CC BY 4.0', attribution: 'Nordic Spatial Humanities', geometry: 'Points', temporal: 'First attestation; saga places by the saga age', provenance: 'Scholarly databases', status: 'Research data', limitations: ['Church attestations mostly Swedish; saga places are literary'], updates: 'Static', verified: '2026-09-30: Zenodo source-data.zip', note: 'Public: 764 Nordic cult places and saga places.' },
  { id: 'regesta-imperii', name: 'Regesta Imperii', provider: 'Academy of Sciences and Literature, Mainz', url: 'https://www.regesta-imperii.de/', tier: 'A', kind: 'events', access: 'catalogued', coverage: [{ regions: ['central-europe', 'italy', 'france-low-countries'], from: 750, to: 1519, types: { political: 'excellent', names: 'moderate' } }], license: 'CC BY 4.0', attribution: 'Regesta Imperii', commercial: true, api: 'REST / CSV', geometry: 'Issuing places (normalised to Wikidata/GeoNames; coordinates unverified)', temporal: 'Exact charter dates', provenance: 'Charters', status: 'Academy project', limitations: ['Coordinates not verified'], updates: 'Continuous', note: 'Wave 2: rulers’ itineraries (where an emperor was on a date).' },
  { id: 'poland16c', name: 'Settlements of 16th-century Poland (via WHG)', provider: 'IH PAN (Panecki, Szady)', url: 'https://whgazetteer.org/', tier: 'A', kind: 'reconstruction', access: 'live', coverage: [{ regions: ['central-europe', 'eastern-europe'], from: 1500, to: 1600, types: { settlements: 'excellent' } }], license: 'Not shown by WHG', attribution: 'IH PAN, via World Historical Gazetteer', geometry: 'Points (24,498)', temporal: '16th c.', provenance: 'Tax registers', status: 'Research dataset in WHG', limitations: ['Only through WHG lookups; no bulk export found'], updates: 'Static', verified: '2026-09-30: listed in WHG /api/datasets/' },
  { id: 'gov', name: 'GOV — Genealogical Gazetteer', provider: 'Verein für Computergenealogie', url: 'https://gov.genealogy.net/', tier: 'D', kind: 'reference', access: 'catalogued', coverage: [{ regions: ['central-europe', 'eastern-europe', 'northern-europe'], from: 1000, to: 2024, types: { administrative: 'excellent', places: 'excellent', names: 'moderate' } }], license: 'Unverified', attribution: 'GOV', api: 'SOAP web service', geometry: 'Points', temporal: 'Dated administrative membership', provenance: 'Contributors, sources per entry', status: 'Collaborative', limitations: ['Bot check blocks automated access', 'Licence unverified'], updates: 'Continuous', note: 'About 1.2 million entries with dated parish/administrative hierarchies — Wave 2 if a licence and bulk route are confirmed.' },
  { id: 'ohm', name: 'OpenHistoricalMap', provider: 'OHM community', url: 'https://www.openhistoricalmap.org/', tier: 'D', kind: 'reconstruction', access: 'live', coverage: [{ regions: 'world', from: 1500, to: 2024, types: { places: 'limited', settlements: 'limited', roads: 'limited', political: 'limited' } }, { regions: ['north-america', 'central-europe'], from: 1700, to: 2024, types: { settlements: 'moderate', roads: 'moderate', political: 'moderate' } }], license: 'CC0', attribution: 'OpenHistoricalMap contributors', commercial: true, geometry: 'Vector tiles', temporal: 'Start/end dates', provenance: 'Source tags (variable)', status: 'Collaborative', limitations: ['Uneven coverage'], updates: 'Continuous' },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
