// Gazetteers: offline lookup of historical place names, by period and region.
//
// Several specialist gazetteers are built into one tiled index
// (public/world/places): Pleiades for the ancient world, Viabundus for
// northern Europe 1350–1650, al-Ṯurayyā for the early Islamic world. Each row
// keeps its own source, identifier, dates and certainty. The app only ever
// loads the name shard or map cells a question needs — never the whole
// index. Names are linked to a place only when its dataset records that name
// for it; places from different datasets are treated as the same place only
// when they carry the name *and* lie within a few kilometres of each other.
import { getJSON, km, type Pos } from './data';
import { contextDistance, type GeoContext } from './geocontext';
import type { EntityKind } from './mention';
import { attestedAt, eligibleAt, type Envelope, type EnvelopeBasis, ENVELOPE_LABEL, type HistYear, type StartKind, timeFit, type TimeFit } from './time';

export interface GazName { name: string; from?: HistYear; to?: HistYear; lang?: string }
export type GazetteerId = 'pleiades' | 'viabundus' | 'althurayya' | 'wikidata' | 'germaniasacra' | 'buringh' | 'hre' | 'merimee' | 'finreg' | 'wbohemia' | 'bridges1250';
export interface Relation { title: string; key?: string; type: string; reverse?: boolean }
export interface GazPlace {
  /** "<gazetteer>:<id>", e.g. "pleiades:423025" */
  key: string;
  gazetteer: GazetteerId;
  id: number | string;
  title: string;
  lon: number;
  lat: number;
  precise: boolean;
  types: string[];
  from?: HistYear;
  to?: HistYear;
  /** The dates are the dataset's overall period (e.g. al-Ṯurayyā's 9th–10th c.), not this place's. */
  datasetPeriod?: boolean;
  /** No dates of its own, but a period its evidence allows (see time.ts). Absent = no temporal evidence. */
  envelope?: Envelope;
  /** 0 certain, 1 less certain, 2 uncertain (the source's own rating). */
  uncertain: number;
  names: GazName[];
  /** Places this one is recorded as part of (region, province…), by title. */
  partOf: string[];
  /** Other relationships the dataset records ("succeeds", "port of", "near"…), both directions. */
  related: Relation[];
  /** Dated roles (Viabundus: town 1250–, toll 1400–1500…). */
  roles?: [string, number | null, number | null][];
  /** What the start date means, as the source words it ("founded", "first mention", "Germania Sacra" tenure). */
  dateBasis?: string;
  /** Whether the start date is when it began ("founded") or only when evidence for it begins ("attested"). */
  startKind?: StartKind;
  /** Estimated inhabitants in thousands per sample year (Buringh), with how each was estimated. */
  population?: { year: number; thousands: number; estimate?: string }[];
  /** A correction the build made to the source, stated. */
  note?: string;
  url: string;
}

export interface GazetteerInfo {
  id: GazetteerId; name: string; license: string; url: string;
  coverage: [HistYear, HistYear];
  /** The period the dataset is really about; an undated record is only plausible inside it. */
  core: [HistYear, HistYear];
  /** Rough box [W, S, E, N] of where the dataset has records. */
  box: [number, number, number, number];
  describe: string;
  record: (id: number | string) => string;
}

/** The gazetteer registry (see also src/world/registry.ts). A new dataset is one entry plus its rows in the index. */
export const GAZETTEERS: GazetteerInfo[] = [
  { id: 'pleiades', name: 'Pleiades', license: 'CC BY 3.0', url: 'https://pleiades.stoa.org/', coverage: [-3000, 1500], core: [-750, 640], box: [-20, 5, 90, 60], describe: 'Ancient places, their names and dates.', record: (id) => `https://pleiades.stoa.org/places/${id}` },
  { id: 'viabundus', name: 'Viabundus', license: 'CC BY 4.0', url: 'https://www.viabundus.eu/', coverage: [1250, 1700], core: [1350, 1650], box: [-2, 45, 32, 66], describe: 'Towns, settlements, tolls, fairs and harbours of northern Europe, 1350–1650.', record: () => 'https://www.viabundus.eu/' },
  { id: 'althurayya', name: 'al-Ṯurayyā', license: 'Apache-2.0 (after G. Cornu)', url: 'https://althurayya.github.io/', coverage: [700, 1100], core: [800, 1000], box: [-10, 10, 80, 45], describe: 'Places of the early Islamic world (9th–10th c.), after Cornu’s atlas.', record: () => 'https://althurayya.github.io/' },
  { id: 'wikidata', name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/', coverage: [300, 1900], core: [500, 1650], box: [-32, 24, 62, 72], describe: 'Castles, monasteries, cathedrals, dioceses, fortifications, bridges and settlements with a recorded founding date or first mention, across Europe and the Mediterranean (snapshot).', record: (id) => `https://www.wikidata.org/wiki/${id}` },
  { id: 'germaniasacra', name: 'Germania Sacra', license: 'CC BY-SA 3.0', url: 'https://klosterdatenbank.germania-sacra.de/', coverage: [400, 1810], core: [700, 1803], box: [2, 43, 20, 56], describe: 'Monasteries and canonries of the Holy Roman Empire with the dated tenure of each religious order.', record: (id) => `https://klosterdatenbank.germania-sacra.de/gsn/${id}` },
  { id: 'hre', name: 'Princes and Townspeople (Deutsches Städtebuch)', license: 'CC0', url: 'https://doi.org/10.7910/DVN/ZGSJED', coverage: [700, 1806], core: [1100, 1806], box: [4, 45, 24, 56], describe: 'Towns of the Holy Roman Empire: first written mention, town charter, market grants and the ruling territory each year from 1300.', record: () => 'https://doi.org/10.7910/DVN/TYAGVO' },
  { id: 'merimee', name: 'Mérimée (French protected monuments)', license: 'Licence Ouverte 2.0', url: 'https://www.pop.culture.gouv.fr/', coverage: [400, 1900], core: [1000, 1500], box: [-5, 41, 10, 51.5], describe: 'Castles, religious buildings, bridges and market halls protected in France, dated by the century of their main building campaign.', record: (id) => `https://www.pop.culture.gouv.fr/notice/merimee/${id}` },
  { id: 'finreg', name: 'Finnish register of archaeological sites', license: 'CC BY 4.0', url: 'https://www.museovirasto.fi/', coverage: [-500, 1900], core: [1150, 1550], box: [19, 59, 32, 70.5], describe: 'Sites the Finnish Heritage Agency classes as medieval (churches, strongholds, village sites…), dated only by period classes.', record: () => 'https://www.kyppi.fi/' },
  { id: 'wbohemia', name: 'Western Bohemia toponyms to 1500', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.21479034', coverage: [900, 1500], core: [1100, 1500], box: [12, 49, 14.5, 50.6], describe: 'Place names of West Bohemia with their first attested year and historical form.', record: () => 'https://doi.org/10.5281/zenodo.21479034' },
  { id: 'bridges1250', name: 'Bridges of Medieval England to c.1250', license: 'CC BY 4.0', url: 'https://doi.org/10.5284/1053676', coverage: [600, 1300], core: [700, 1250], box: [-6, 49.9, 2, 55.9], describe: 'Bridges and fords attested in documents and place-names before c. 1250.', record: () => 'https://doi.org/10.5284/1053676' },
  { id: 'buringh', name: 'Buringh (European urban population)', license: 'CC0', url: 'https://doi.org/10.17026/dans-xzy-u62q', coverage: [700, 2000], core: [700, 1850], box: [-25, 27, 60, 71], describe: 'About 2,200 European towns with estimated population per century, 700–2000.', record: () => 'https://doi.org/10.17026/dans-xzy-u62q' },
];
export const gazetteerInfo = (id: GazetteerId) => GAZETTEERS.find((g) => g.id === id)!;
/** Gazetteers whose period covers the year (all of them when the year is unknown). */
export const gazetteersFor = (year?: HistYear) => GAZETTEERS.filter((g) => year === undefined || (year >= g.coverage[0] && year <= g.coverage[1]));

/** Lower-case, without accents or a leading "the", so "Lutétia" = "lutetia". Must match norm() in scripts/atlas-build/world.py. */
export const normName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/^the\s+/, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
/** Name-index shard for a normalised name. Must match shard() in world.py. */
export function nameShard(n: string): string {
  let out = '';
  for (const ch of Array.from(n).slice(0, 2)) out += /[a-z0-9]/.test(ch) ? ch : `x${(ch.codePointAt(0)! % 16).toString(16)}`;
  return out || '_';
}

const PLEIADES_REL: Record<string, [string, string]> = {
  // Pleiades' own definitions (pleiades.stoa.org/vocabularies/relationship-types); reverse = seen from the other place.
  succeeds: ['succeeds', 'succeeded by'], same_as: ['possibly the same as', 'possibly the same as'], capital: ['capital of', 'has as capital'], port_of: ['port of', 'has port'],
  founded: ['founded by', 'founded'], near: ['near', 'near'], at: ['at', 'site of'], on: ['on', 'has on it'], crosses: ['crosses', 'crossed by'],
  flows_into: ['flows into', 'receives'], route_next: ['next on route to', 'next on route from'], abuts: ['borders', 'borders'], bounds: ['bounds', 'bounded by'],
  communicates: ['connected with', 'connected with'], related: ['related to', 'related to'],
};
export const relationLabel = (r: Relation) => (PLEIADES_REL[r.type] ?? [r.type.replace(/_/g, ' '), r.type.replace(/_/g, ' ')])[r.reverse ? 1 : 0];

/** Types that are not places one can put a pin on for a reader's name. */
const NOT_A_LOCATION = new Set(['people', 'ethnic-group', 'unknown', 'false', 'label']);

// ── The tiled index ───────────────────────────────────────────────────────

type Row = [GazetteerId, number | string, string, number, number, 0 | 1, string, number | null, number | null, number,
  [string, number | null, number | null, string][], string[], [number | string, string, string, 0 | 1][], RowExtra | null];
/** Per-dataset extras: Viabundus roles, dataset periods, envelopes; site kind, date basis, orders, population. */
interface RowExtra {
  roles?: [string, number | null, number | null][]; period?: [number, number]; env?: [number | null, number | null, EnvelopeBasis]; z?: number;
  k?: string; st?: string; fb?: string; nl?: string; o?: string[]; gs?: string; q?: string; fix?: string;
  pop?: Record<string, number>; est?: Record<string, string>;
}
type NameEntry = [string, GazetteerId, number | string, string, 0 | 1];

const CELL = 2;
const base = () => `${import.meta.env.BASE_URL}world/places/`;
export const cellOf = (lon: number, lat: number) => `${Math.floor((lon + 180) / CELL)}_${Math.floor((lat + 90) / CELL)}`;

/** A small bounded cache, so exploring the whole map never keeps everything in memory. */
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k: string, v: V) { this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!); }
}
const cells = new Lru<Promise<GazPlace[]>>(120);
const shards = new Lru<Promise<NameEntry[]>>(40);
const idShards = new Lru<Promise<Record<string, string>>>(16);

function toPlace(r: Row): GazPlace {
  const [src, id, title, lon, lat, precise, types, from, to, unc, names, partOf, related, extra] = r;
  const info = gazetteerInfo(src);
  return {
    key: `${src}:${id}`, gazetteer: src, id, title, lon, lat, precise: precise === 1,
    types: types ? types.split(',') : [],
    from: from ?? undefined, to: to ?? undefined,
    // Records without dates carry the period their evidence allows: linked records, the source's
    // period, or the dataset's documented period (al-Ṯurayyā 9th–10th c., undated Viabundus nodes).
    envelope: from === null && to === null
      ? (extra?.env ? { from: extra.env[0] ?? undefined, to: extra.env[1] ?? undefined, basis: extra.env[2] } : extra?.period ? { from: extra.period[0], to: extra.period[1], basis: 'dataset' as const } : undefined)
      : undefined,
    datasetPeriod: from === null && to === null && (!!extra?.period || extra?.env?.[2] === 'dataset'),
    uncertain: unc, names: names.map(([name, a, b, lang]) => ({ name, from: a ?? undefined, to: b ?? undefined, lang: lang || undefined })),
    partOf, related: related.map(([rid, type, t, rev]) => ({ title: t, key: `${src}:${rid}`, type, reverse: rev === 1 })),
    roles: extra?.roles, url: extra?.q && src !== 'wikidata' ? `https://www.wikidata.org/wiki/${extra.q}` : info.record(id),
    dateBasis: extra?.fb,
    // Only an explicit founding / construction date means "did not exist before". Attestation periods
    // (Pleiades), first recorded roles (Viabundus), first mentions and tenure dates mean evidence begins then.
    startKind: extra?.fb === 'founded' ? 'founded' : 'attested',
    population: extra?.pop ? Object.entries(extra.pop).map(([y, v]) => ({ year: Number(y), thousands: v, estimate: extra.est?.[y] })) : undefined,
    note: extra?.fix,
  };
}

export function placesInCell(cell: string): Promise<GazPlace[]> {
  let p = cells.get(cell);
  if (!p) {
    p = getJSON<Row[]>(`${base()}c/${cell}.json`).then((rows) => rows.map(toPlace)).catch(() => []);
    cells.set(cell, p);
  }
  return p;
}
function nameEntries(norm: string): Promise<NameEntry[]> {
  const s = nameShard(norm);
  let p = shards.get(s);
  if (!p) {
    p = getJSON<NameEntry[]>(`${base()}n/${s}.json`).catch(() => []);
    shards.set(s, p);
  }
  return p;
}

// CRC-32, to find which id shard holds a place (matches zlib.crc32 in world.py).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(s: string): number {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(s)) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One place by key ("pleiades:423025"). */
export async function getPlace(key: string): Promise<GazPlace | undefined> {
  const i = key.indexOf(':');
  const src = key.slice(0, i);
  const id = key.slice(i + 1);
  if (!GAZETTEERS.some((g) => g.id === src)) return undefined;
  const shard = `${src}-${crc32(id) % 16}`;
  let p = idShards.get(shard);
  if (!p) { p = getJSON<Record<string, string>>(`${base()}i/${shard}.json`).catch(() => ({})); idShards.set(shard, p); }
  const cell = (await p)[id];
  if (!cell) return undefined;
  return (await placesInCell(cell)).find((x) => x.key === key);
}

/** Every place (in any gazetteer) with this exact name; isTitle = it's the record's main name. */
export async function placesByName(name: string): Promise<{ place: GazPlace; isTitle: boolean }[]> {
  const k = normName(name);
  if (k.length < 2) return [];
  const hits = (await nameEntries(k)).filter((e) => e[0] === k);
  const byCell = new Map<string, NameEntry[]>();
  for (const e of hits) byCell.set(e[3], [...(byCell.get(e[3]) ?? []), e]);
  const out: { place: GazPlace; isTitle: boolean }[] = [];
  await Promise.all([...byCell].map(async ([cell, es]) => {
    const ps = await placesInCell(cell);
    for (const e of es) { const p = ps.find((x) => x.gazetteer === e[1] && x.id === e[2]); if (p) out.push({ place: p, isTitle: e[4] === 1 }); }
  }));
  return out.filter((h) => !h.place.types.every((t) => NOT_A_LOCATION.has(t)));
}

/** Places whose names start with the text (search). Title matches first. */
export async function searchPlaces(q: string, limit = 20): Promise<{ place: GazPlace; matched: string }[]> {
  const k = normName(q);
  if (k.length < 2) return [];
  const es = (await nameEntries(k)).filter((e) => e[0].startsWith(k)).sort((a, b) => Number(b[0] === k) - Number(a[0] === k) || b[4] - a[4]).slice(0, limit * 2);
  const out: { place: GazPlace; matched: string }[] = [];
  const seen = new Set<string>();
  for (const e of es) {
    const key = `${e[1]}:${e[2]}`;
    if (seen.has(key)) continue;
    const p = (await placesInCell(e[3])).find((x) => x.key === key);
    if (!p) continue;
    seen.add(key);
    out.push({ place: p, matched: e[0] });
    if (out.length >= limit) break;
  }
  return out;
}

/** Places within `radiusKm`, nearest first; with a year, only those attested around then (undated ones only when asked for). Loads only the cells it needs. */
export async function nearbyPlaces(at: Pos, radiusKm: number, opts: { year?: HistYear; slack?: number; exclude?: string; filter?: (p: GazPlace) => boolean; undated?: boolean } = {}): Promise<{ place: GazPlace; km: number }[]> {
  const dLat = radiusKm / 110.57;
  const dLon = radiusKm / (111.32 * Math.max(0.1, Math.cos((at[1] * Math.PI) / 180)));
  const x0 = Math.floor((at[0] - dLon + 180) / CELL);
  const x1 = Math.floor((at[0] + dLon + 180) / CELL);
  const y0 = Math.floor((at[1] - dLat + 90) / CELL);
  const y1 = Math.floor((at[1] + dLat + 90) / CELL);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}_${y}`);
  const all = (await Promise.all(keys.slice(0, 36).map(placesInCell))).flat();
  const out: { place: GazPlace; km: number }[] = [];
  for (const p of all) {
    if (p.key === opts.exclude || Math.abs(p.lat - at[1]) > dLat || Math.abs(p.lon - at[0]) > dLon) continue;
    if (opts.year !== undefined && !existedAround(p, opts.year, opts.slack ?? 0) && !(opts.undated && p.from === undefined && p.to === undefined && !p.envelope)) continue;
    if (opts.filter && !opts.filter(p)) continue;
    const d = km(at, [p.lon, p.lat]);
    if (d <= radiusKm) out.push({ place: p, km: d });
  }
  return out.sort((a, b) => a.km - b.km);
}

/**
 * Was the place attested around this year? Undated records are NOT counted as
 * existing (they are "undated", see timeFit). An open start or end is capped by
 * the gazetteer's own period.
 */
export function existedAround(p: { from?: HistYear; to?: HistYear; envelope?: Envelope; gazetteer?: GazetteerId }, year: HistYear, slack = 0): boolean {
  // Attested at the year, or inside the period its evidence allows (callers show that as approximate).
  return eligibleAt(p, year, { slack, window: p.gazetteer ? gazetteerInfo(p.gazetteer).coverage : undefined });
}

/** Names the place had around a year, according to the dataset's own name dates (undated names aren't tied to a period, so they're kept). */
export function namesAround(p: GazPlace, year?: HistYear): GazName[] {
  if (year === undefined) return p.names;
  return p.names.filter((n) => (n.from === undefined && n.to === undefined) || attestedAt(n, year, { slack: 50 }));
}

// ── Matching a name from the book ─────────────────────────────────────────

export type MatchStatus = 'unique' | 'ambiguous' | 'none';
export interface NameMatch {
  status: MatchStatus;
  place?: GazPlace;
  candidates: GazPlace[];
  /** Records of the same place in other datasets (same name, within a few km). */
  corroborating: GazPlace[];
  /** How the chosen record's dates relate to the year. */
  fit?: TimeFit | 'no-year';
  /** Which recorded name matched ("Carthage" → recorded name of Carthago). */
  matchedName?: GazName & { isTitle: boolean };
  reason: string;
}

const SAME_PLACE_KM = 8;
const srcList = (ids: GazetteerId[]) => [...new Set(ids)].map((id) => gazetteerInfo(id).name).join(' and ');

/** What kind of entity a gazetteer record is, from its dataset's own type words. */
export function kindOf(p: GazPlace): EntityKind {
  const t = p.types.join(' ').toLowerCase();
  if (/\b(province|region|regions|people|ethnic|territory|area|district|diocese|kingdom|state)\b/.test(t)) return 'region';
  if (/\b(settlement|urban|polis|town|towns|city|capitals?|village|villages|vicus|waystations?|port|harbou?r)\b/.test(t)) return 'settlement';
  if (/\briver\b/.test(t)) return 'river';
  if (/\bisland\b/.test(t)) return 'island';
  if (/\b(mountain|hill|volcano|pass)\b/.test(t)) return 'mountain';
  if (/\b(lake|lagoon|marsh)\b/.test(t)) return 'lake';
  return p.types.length ? 'site' : 'unknown';
}
const COMPATIBLE: Record<EntityKind, EntityKind[]> = {
  settlement: ['settlement', 'site', 'unknown'], polity: ['region', 'polity'], region: ['region', 'polity'], continent: ['region'], sea: [],
  river: ['river'], island: ['island', 'region'], mountain: ['mountain'], lake: ['lake'], site: ['site', 'settlement', 'unknown'], unknown: [],
};

/** How a record's own dates relate to the year being read about. */
export function recordFit(p: GazPlace, year?: HistYear): TimeFit | 'no-year' {
  if (year === undefined) return 'no-year';
  return timeFit(p, year, { slack: 50, window: gazetteerInfo(p.gazetteer).coverage });
}

export interface MatchOptions {
  /** Where the book is set, so far (points of already identified places). */
  context?: GeoContext;
  /** The entity type the wording implies ("the city of X" → settlement). */
  expected?: EntityKind;
}

/**
 * Match a name as written in the book against the offline gazetteers.
 *
 * Records are *scored*, not dropped for lack of dates: an undated record, or a
 * place a dataset records only for an earlier period (towns persist), can still
 * be the place meant — only records attested exclusively *after* the year are
 * excluded, as are records of the wrong kind of entity for the wording. Records
 * from different datasets within a few km are one place. A place is chosen only
 * when one candidate remains, or when the book's own geography clearly favours
 * one; otherwise the result is ambiguous and the reader decides.
 */
export async function matchName(written: string, year?: HistYear, opts: MatchOptions = {}): Promise<NameMatch> {
  const all = await placesByName(written);
  const names = srcList(GAZETTEERS.map((g) => g.id));
  if (!all.length) return { status: 'none', candidates: [], corroborating: [], reason: `No place called “${written}” in ${names}.` };
  const notLater = all.filter((h) => recordFit(h.place, year) !== 'later');
  if (!notLater.length) return { status: 'none', candidates: [], corroborating: [], reason: `The places called “${written}” in ${srcList(all.map((h) => h.place.gazetteer))} are only recorded after ${year !== undefined ? (year < 0 ? `${-year} BCE` : `${year} CE`) : 'this date'}.` };
  const typed = opts.expected ? notLater.filter((h) => COMPATIBLE[opts.expected!].includes(kindOf(h.place))) : notLater;
  const pool = typed.length ? typed : notLater;
  // Group records that are the same place: different datasets within a few km.
  const groups: { place: GazPlace; isTitle: boolean }[][] = [];
  for (const h of pool) {
    const g = groups.find((gr) => gr.some((x) => x.place.gazetteer !== h.place.gazetteer && km([x.place.lon, x.place.lat], [h.place.lon, h.place.lat]) <= SAME_PLACE_KM));
    if (g) g.push(h); else groups.push([h]);
  }
  // The record to show from a group: attested at the year first, titled first.
  const fitRank = (p: GazPlace) => ({ within: 0, near: 1, period: 2, 'no-year': 3, undated: 4, earlier: 5, unattested: 6, later: 7 })[recordFit(p, year)];
  // Then a record with dates of its own over one dated only by its dataset's period (a Buringh town).
  const ownDates = (p: GazPlace) => (p.from !== undefined || p.to !== undefined ? 0 : p.datasetPeriod ? 2 : 1);
  const lead = (gr: { place: GazPlace; isTitle: boolean }[]) => [...gr].sort((a, b) => fitRank(a.place) - fitRank(b.place) || Number(b.isTitle) - Number(a.isTitle) || ownDates(a.place) - ownDates(b.place))[0];
  const k = normName(written);
  let chosen: { place: GazPlace; isTitle: boolean }[] | undefined;
  let why = '';
  if (groups.length === 1) chosen = groups[0];
  else {
    // The book's geography: one candidate clearly nearer the places already identified.
    const ctx = opts.context;
    if (ctx?.points.length) {
      const dist = groups.map((g) => Math.min(...g.map((x) => contextDistance(ctx, [x.place.lon, x.place.lat]))));
      const order = dist.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
      if (order[0].d < 1500 && order[1].d > 3 * order[0].d + 300) { chosen = groups[order[0].i]; why = `It is the one near the other places in this book (${Math.round(order[0].d)} km from one of them; the next is ${Math.round(order[1].d)} km away).`; }
    }
    if (!chosen) {
      // Evidence at the date beats absence of evidence: when only one place of that name is attested around
      // the year and every other one is first recorded later, the attested one is meant.
      const attestedNow = (g: { place: GazPlace }[]) => g.some((x) => ['within', 'near', 'period'].includes(recordFit(x.place, year)));
      const live = groups.filter(attestedNow);
      if (year !== undefined && live.length === 1 && groups.every((g) => g === live[0] || g.every((x) => recordFit(x.place, year) === 'unattested'))) {
        chosen = live[0];
        why = `The only place called “${written}” attested around ${year < 0 ? `${-year} BCE` : `${year} CE`}; the other${groups.length > 2 ? 's are' : ' is'} first recorded later.`;
      }
    }
    if (!chosen) {
      // A single group where the name is the main title, against at most one other place listing it as an alternative.
      const titled = groups.filter((gr) => gr.some((x) => x.isTitle));
      if (titled.length === 1 && groups.length - 1 <= 1 && lead(titled[0]).place.precise) { chosen = titled[0]; why = `The only place in ${srcList(pool.map((h) => h.place.gazetteer))} whose main name is “${written}”.`; }
    }
  }
  const where = srcList(pool.map((h) => h.place.gazetteer));
  if (!chosen) return { status: 'ambiguous', candidates: groups.map((g) => lead(g).place).slice(0, 12), corroborating: [], reason: `${groups.length} different places in ${where} are recorded with the name “${written}”, and nothing in the book yet says which is meant.` };
  const main = lead(chosen);
  const nm = main.isTitle ? { name: main.place.title, isTitle: true } : { ...(main.place.names.find((n) => normName(n.name) === k) ?? { name: written }), isTitle: false };
  const others = chosen.filter((x) => x !== main).map((x) => x.place);
  const fit = recordFit(main.place, year);
  // The name itself may be later (or earlier) than the date: say so, with the names attested then.
  const yl = (y: number) => (y < 0 ? `${-y} BCE` : `${y} CE`);
  const nameWhen = year !== undefined && !nm.isTitle && ((nm.from !== undefined && year < nm.from - 50) || (nm.to !== undefined && year > nm.to + 50))
    ? ` ${nm.from !== undefined && nm.from >= 1700 && year < 1650
      // Gazetteers date present-day exonyms to the modern period; that is a label, not a first attestation.
      ? `“${nm.name}” is a modern name for this place`
      : `The name “${nm.name}” is recorded ${nm.from !== undefined && year < nm.from ? `only from ${yl(nm.from)}` : `only until ${yl(nm.to!)}`}`}${((then) => (then.length ? `; around ${yl(year)} it is recorded as ${then.join(', ')}` : `; the record’s own name is “${main.place.title}”`))(namesAround(main.place, year).filter((n) => (n.from !== undefined || n.to !== undefined) && normName(n.name) !== k).map((n) => `“${n.name}”`).slice(0, 3))}.`
    : '';
  const when = nameWhen + (fit === 'earlier' ? ` ${gazetteerInfo(main.place.gazetteer).name} records it for an earlier period only (to ${main.place.to !== undefined ? (main.place.to < 0 ? `${-main.place.to} BCE` : `${main.place.to} CE`) : 'the end of its coverage'}); places usually persist, but its later history is outside that dataset.` : fit === 'undated' ? ' The record has no dates, and nothing linked to it gives a period.' : fit === 'unattested' ? (main.place.from === undefined ? ` ${gazetteerInfo(main.place.gazetteer).name} records only its end (${yl(main.place.to!)}), not when it began — nothing places it at this date.` : ` ${gazetteerInfo(main.place.gazetteer).name} first records it in ${yl(main.place.from)}${main.place.dateBasis ? ` (${main.place.dateBasis})` : ''} — it may be older, but nothing places it at this date.`) : fit === 'period' && main.place.envelope ? ` The record has no dates of its own; ${main.place.envelope.from !== undefined ? yl(main.place.envelope.from) : '…'}–${main.place.envelope.to !== undefined ? yl(main.place.envelope.to) : '…'} is the period of ${ENVELOPE_LABEL[main.place.envelope.basis]}.` : '');
  return {
    status: 'unique', place: main.place, candidates: groups.map((g) => lead(g).place).slice(0, 12), corroborating: others, matchedName: nm, fit,
    reason: `${why || `The only place in ${where} recorded with the name “${written}”.`}${others.length ? ` ${srcList(others.map((o) => o.gazetteer))} records it at the same spot.` : ''}${when}`,
  };
}
