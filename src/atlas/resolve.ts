// Resolving a place name read in the book into one record the whole reader
// uses — the text popup, the map, notes and "places you've met".
//
// Order: the reader's own pick for this book → continents and seas → political
// entities (and demonyms) → the offline gazetteers (scored by date, entity type
// and the book's own geography) → online sources (World Historical Gazetteer /
// Wikidata), which are consulted only when the text itself supports the name
// being a place, and whose answers must match the name exactly and fit the
// period and the book's geography. Every result carries its sources, its name
// roles and a plain account of why it was chosen. Coordinates, names and dates
// come only from datasets — never from AI.
import { db } from '../db/db';
import { choiceKey, legacyChoiceKeys } from '../lib/history/keys';
import { historicalPlaces } from '../lib/history/placeService';
import type { Confidence, HistoricalPlace, PlaceQuery } from '../lib/history/types';
import { km } from './data';
import { type GazName, type GazPlace, GAZETTEERS, gazetteerInfo, existedAround, getPlace, kindOf, matchName, normName, placesByName, type PlaceConfidence, type Relation } from './gazetteer';
import { bookGeoContext, contextDistance, type GeoContext } from './geocontext';
import { politiesAt, polityConvention } from './context';
import { relocatePlace } from './keymap';
import { type EntityKind, isCommonWord, loadCommonWords, macroRegion, type MacroRegion, matchPolity, type MentionEvidence, mentionEvidence, plausibleMention, polityCore, polityLabelAt, type PolityMatch, viaDemonym } from './mention';
import { nameRoles, type NameRoles, pickDisplay } from './names';
import { envelopeWords, type HistYear, yearLabel } from './time';
import { agreeOnLocation, witnesses } from '../world/families';
import { type HistDate, mergeDates, period, yearRange } from '../world/histdate';
import type { EvidenceKind } from '../world/evidence';
import { assessPlace, type Claim, type PlaceEvidence } from '../world/placeEvidence';

/** How the name was found in the book (shown in "Why is this place here?"). */
export type Detection = 'cue' | 'known' | 'ai' | 'selection' | 'search' | 'map';
export const DETECTION_LABEL: Record<Detection, string> = {
  cue: 'Found in the text after a place word (e.g. “to”, “at”, “siege of”)',
  known: 'A place already in your Knowledge Atlas or X-Ray for this book',
  ai: 'Picked out of the text by the AI book analysis (the AI only found the name — the location comes from the dataset)',
  selection: 'You selected it in the text',
  search: 'You searched for it',
  map: 'You chose it on the map',
};

/** Known / approximate / uncertain / disputed — each only when the source says so. */
export type Certainty = 'known' | 'approximate' | 'uncertain' | 'disputed';
export const CERTAINTY_LABEL: Record<Certainty, string> = {
  known: 'Location known',
  approximate: 'Approximate location',
  uncertain: 'Uncertain — the source marks this identification as less certain',
  disputed: 'Disputed location',
};

export interface Source { name: string; url?: string; license?: string; record?: string; note?: string; id?: string; tier?: string; accessed?: string }
/** Two or more sources saying different things about the same place — kept side by side, never averaged. */
export interface Disagreement { field: 'location' | 'date' | 'name' | 'affiliation' | 'population'; claims: { source: string; value: string }[]; note?: string }

export interface ReaderPlace {
  key: string;
  /** The name shown to the reader (see names.ts for the policy). */
  title: string;
  /** What kind of entity this is: a settlement, a polity, a region, a sea… */
  kind: EntityKind;
  /** The dataset record's own title, when it differs from `title`. */
  recordTitle?: string;
  /** All the name roles (as written, English, names at the date, native script, record title). */
  nameRoles?: NameRoles;
  /** For a political entity: its record (Cliopatria) — dates and Wikidata id. */
  polity?: { n: string; f: HistYear; t: HistYear; q?: string };
  /** As written in the book. */
  written: string;
  lat: number;
  lon: number;
  certainty: Certainty;
  from?: HistYear;
  to?: HistYear;
  /** The record's dates with their kind and uncertainty (and other sources' dates as conflicts). */
  when?: HistDate;
  /** Which record each shown field comes from: position, dates, and each type (PR-1, A9-011, X-08). */
  fieldSources?: { position: string; dates?: string; types: Record<string, string> };
  /** Dated roles (Viabundus: town, toll, fair…). */
  roles?: [string, number | null, number | null][];
  evidence?: EvidenceKind;
  disagreements?: Disagreement[];
  names: GazName[];
  partOf: string[];
  related: Relation[];
  types: string[];
  /** A present-day description from an online source (labelled as modern, never used as the historical type). */
  description?: string;
  sources: Source[];
  status: Confidence;
  why: { detection: Detection; matchedName?: string; matchedIsTitle?: boolean; reason: string; method: string; userChosen?: boolean };
  gaz?: GazPlace;
  /** Evidence from all sources, weighed together (placeEvidence.ts), when it was gathered. */
  assessment?: PlaceEvidence;
}

export interface Resolution {
  place?: ReaderPlace;
  status: Confidence;
  /** Alternatives when the name fits several places. */
  candidates: ReaderPlace[];
  reason: string;
  error?: string;
  /** The combined evidence behind this result, when online sources were consulted. */
  evidence?: PlaceEvidence;
  /** Shelf's place data could not be loaded: says nothing about the name; never store this answer. */
  loadFailed?: boolean;
}

/** The atlas's place-match scale on the reader's confidence scale (certain → HIGH … possible → LOW). */
export const CONFIDENCE_OF: Record<PlaceConfidence, Confidence> = { certain: 'HIGH', probable: 'MEDIUM', possible: 'LOW', ambiguous: 'AMBIGUOUS', unresolved: 'UNRESOLVED' };

/** The reader's choice for a name in a book, also under the key it had before names kept their script. */
async function readChoice(bookId: string, name: string) {
  for (const k of [choiceKey(bookId, name), ...legacyChoiceKeys(bookId, name)]) {
    const c = await db.placeChoices.get(k).catch(() => undefined);
    if (c) return c;
  }
  return undefined;
}

/** A gazetteer record's dates, keeping what kind of date they are. */
export function gazDate(p: GazPlace): HistDate {
  const name = gazetteerInfo(p.gazetteer).name;
  if (p.envelope) return period(p.envelope.from, p.envelope.to, ((w) => w[0].toUpperCase() + w.slice(1))(envelopeWords(p.envelope.basis)), name);
  if (p.gazetteer === 'pleiades') return period(p.from, p.to, 'Pleiades periods', name);
  return yearRange(p.from, p.to, { source: name, qualifier: p.to === undefined && p.from !== undefined ? 'after' : 'between' });
}

export function fromGaz(p: GazPlace, written: string, why: ReaderPlace['why'], status: Confidence = 'HIGH', corroborating: GazPlace[] = [], year?: HistYear): ReaderPlace {
  const src = (g: GazPlace): Source => { const info = gazetteerInfo(g.gazetteer); return { name: info.name, url: info.url, license: info.license, record: g.url, id: String(g.id) }; };
  const all = [p, ...corroborating];
  // Other datasets placing the same name at the same spot: note any gap in distance or dates rather than hiding it.
  const disagreements: Disagreement[] = [];
  for (const c of corroborating) {
    const d = km([p.lon, p.lat], [c.lon, c.lat]);
    if (d >= 2) disagreements.push({ field: 'location', claims: [{ source: gazetteerInfo(p.gazetteer).name, value: `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` }, { source: gazetteerInfo(c.gazetteer).name, value: `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}` }], note: `The two records are ${d.toFixed(1)} km apart — datasets often mark different points of the same town.` });
  }
  // Population estimates of one place that differ twice over are a disagreement, not two confirmations (A10-015, X-17).
  for (const c of corroborating) {
    for (const a of p.population ?? []) {
      const b = c.population?.find((x) => x.year === a.year);
      if (b && a.thousands > 0 && b.thousands > 0 && Math.max(a.thousands, b.thousands) / Math.min(a.thousands, b.thousands) >= 2) {
        disagreements.push({ field: 'population', claims: [{ source: gazetteerInfo(p.gazetteer).name, value: `${a.thousands}k in ${a.year}` }, { source: gazetteerInfo(c.gazetteer).name, value: `${b.thousands}k in ${b.year}` }], note: 'The two population estimates differ more than twofold; neither is preferred.' });
        break;
      }
    }
  }
  const roles = nameRoles(p, written, year);
  return {
    key: p.key, title: roles.display, kind: kindOf(p), recordTitle: roles.display !== p.title ? p.title : undefined, nameRoles: roles, written, lat: p.lat, lon: p.lon,
    certainty: p.uncertain >= 1 ? 'uncertain' : p.precise ? 'known' : 'approximate',
    from: p.from, to: p.to, when: mergeDates(all.map(gazDate)), names: p.names, partOf: p.partOf, related: p.related, types: [...new Set(all.flatMap((x) => x.types))],
    fieldSources: {
      position: gazetteerInfo(p.gazetteer).name,
      dates: mergeDates(all.map(gazDate))?.source,
      types: Object.fromEntries([...all].reverse().flatMap((x) => x.types.map((t) => [t, gazetteerInfo(x.gazetteer).name] as const))),
    },
    roles: p.roles ?? corroborating.find((c) => c.roles)?.roles,
    sources: all.map(src),
    // the source's doubt is kept whichever record leads (A9-018); "confirmed" needs an independent family that agrees on
    // the location, not a copy or a sister dataset (A9-001, A9-002, A9-004, A10-016, PR-2)
    evidence: all.some((x) => x.uncertain >= 1) ? 'historical-uncertainty'
      : ((ws) => ws.length >= 2 && agreeOnLocation(ws))(witnesses(all.map((x) => ({ family: x.gazetteer, lon: x.lon, lat: x.lat })))) ? 'confirmed' : 'single-source',
    disagreements,
    status, why, gaz: p,
  };
}

function fromOnline(h: HistoricalPlace, written: string, why: ReaderPlace['why'], status: Confidence): ReaderPlace | undefined {
  if (h.latitude === undefined || h.longitude === undefined) return undefined;
  const title = pickDisplay([h.canonicalName, ...h.alternativeNames], written);
  return {
    key: h.id, title, kind: 'unknown', recordTitle: title !== h.canonicalName ? h.canonicalName : undefined, written, lat: h.latitude, lon: h.longitude,
    certainty: h.locationPrecision === 'exact' ? 'known' : h.locationPrecision === 'uncertain' ? 'uncertain' : 'approximate',
    from: h.historicalStartYear, to: h.historicalEndYear,
    names: h.alternativeNames.map((name) => ({ name })), partOf: [], related: [], types: h.placeType ? [h.placeType] : [], description: h.description,
    sources: h.attribution.map((a) => ({ name: a.dataset ? `${a.source} — ${a.dataset}` : a.source, url: a.url, license: a.license, record: h.url })),
    status, why,
  };
}

/** A WHG attestation as a source line, keeping its provenance. */
export function whgSource(c: Claim, accessed?: string): Source {
  return { name: c.source.replace(/^WHG · /, 'World Historical Gazetteer — '), url: c.url, license: c.licence, record: c.whg?.links.original, id: c.id, tier: 'C', accessed: accessed?.slice(0, 10) };
}

/** Attach the combined evidence to a place: its statements, disagreements, and the other sources that agree. */
function withEvidence(p: ReaderPlace, ev: PlaceEvidence | undefined): ReaderPlace {
  if (!ev) return p;
  const top = ev.clusters.find((c) => km([c.lon, c.lat], [p.lon, p.lat]) < 25);
  const extra = (top?.claims ?? []).filter((c) => c.kind === 'whg' && !c.restricted).map((c) => whgSource(c, ev.whg?.accessed));
  return {
    ...p, assessment: ev,
    sources: [...p.sources, ...extra.filter((x) => !p.sources.some((y) => y.id === x.id))],
    disagreements: [...(p.disagreements ?? []), ...ev.disagreements],
  };
}

/** A place built from the evidence alone (no offline record, no place-service answer). */
function fromEvidence(ev: PlaceEvidence, written: string, why: ReaderPlace['why'], status: Confidence): ReaderPlace | undefined {
  const top = ev.clusters[0];
  const c = top?.claims.find((x) => x.nameMatch !== 'none') ?? top?.claims[0];
  if (!top || !c || c.lat === undefined || c.lon === undefined) return undefined;
  const spans = top.claims.flatMap((x) => x.spans);
  const title = pickDisplay([c.title, ...top.claims.flatMap((x) => x.names)], written);
  return withEvidence({
    key: `whg:${c.id}`, title, kind: 'unknown', recordTitle: title !== c.title ? c.title : undefined, written, lat: c.lat, lon: c.lon, certainty: 'approximate',
    from: spans.length ? Math.min(...spans.map((x) => x[0])) : undefined, to: spans.length ? Math.max(...spans.map((x) => x[1])) : undefined,
    when: spans.length ? yearRange(Math.min(...spans.map((x) => x[0])), Math.max(...spans.map((x) => x[1])), { source: 'World Historical Gazetteer', qualifier: 'between' }) : undefined,
    names: [...new Set(top.claims.flatMap((x) => x.names))].slice(0, 20).map((name) => ({ name })), partOf: [], related: [], types: [...new Set(top.claims.flatMap((x) => x.types))].slice(0, 6),
    sources: [], evidence: top.families.length >= 2 ? 'confirmed' : 'single-source', status, why,
  }, ev);
}

/** A continent or sea: a macro-region, not a place with a point location. */
export function fromMacro(m: MacroRegion, written: string, why: ReaderPlace['why']): ReaderPlace {
  return {
    key: `macro:${normName(m.name)}`, title: m.name, kind: m.kind === 'continent' ? 'continent' : m.kind === 'sea' ? 'sea' : 'region', written, lat: m.center[1], lon: m.center[0], certainty: 'approximate',
    names: [], partOf: [], related: [], types: [m.kind], sources: [{ name: 'Shelf’s list of continents, seas and geographic lands (general geography, not a historical dataset)' }],
    evidence: 'single-source', status: 'HIGH', why,
  };
}

/** A political entity (Cliopatria): dated, with a reconstructed territory; its point is only a label position. */
export function fromPolity(pm: PolityMatch, written: string, why: ReaderPlace['why'], status: Confidence, year?: HistYear): ReaderPlace | undefined {
  const p = pm.polity;
  // The label point at the date being read about: a polity's largest outline can be far from home (Portugal's 1885 one is Angola).
  const at = polityLabelAt(p, year);
  if (!at) return undefined;
  const name = p.n.replace(/^\(|\)$/g, '');
  const gaps = p.s && p.s.length > 1 ? ` Cliopatria has outlines for it only in ${p.s.map(([f, t]) => `${yearLabel(f)}–${yearLabel(t)}`).join(', ')}.` : '';
  return {
    // Shown by its everyday name ("Greece"); the source's formal title stays as the record title. A Wikidata id shared
    // with another polity is not its key (ID-1): the key is the name.
    key: `polity:${p.q && !p.qx ? p.q : normName(p.n)}:${p.f}`, title: p.cn ?? name, recordTitle: p.cn ? name : undefined, kind: 'polity', written, lat: at[1], lon: at[0], certainty: 'approximate',
    polity: { n: name, f: p.f, t: p.t, q: p.qx ? undefined : p.q }, from: p.f, to: p.t, when: yearRange(p.f, p.t, { source: 'Cliopatria', qualifier: 'between' }),
    names: [], partOf: [], related: [], types: ['polity'],
    sources: [{ name: 'Cliopatria (Seshat Global History Databank)', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', license: 'CC BY 4.0', record: p.q && !p.qx ? `https://www.wikidata.org/wiki/${p.q}` : undefined,
      note: `Territory reconstructed by Cliopatria; the point is only where its label sits${year !== undefined ? ` in ${yearLabel(year)}` : ''}.${gaps}${p.qx ? ' Cliopatria gives it a Wikidata id that another polity also holds, so no Wikidata names or link are used for it.' : ''}` }],
    evidence: 'single-source', status, why,
  };
}

/**
 * A country's name at a date when no polity of that name had an outline then ("Egypt" in 1300, "Germany" in 1500,
 * "Turkey" in 1900): the land the name refers to, and who held it at the date — never a later or earlier state
 * given as if it existed (ID-5, A12-007, A16-003, C5). The land is placed where Cliopatria labels the latest
 * polity of that name; who held it is read from the outlines at that point and date.
 */
export async function landAt(polities: PolityMatch[], written: string, year: HistYear, why: (reason: string, method: string) => ReaderPlace['why']): Promise<Resolution | undefined> {
  // Only a later (or current) state of that name says what land the name means at the date: an ancient polity with a
  // matching alias does not ("The United Kingdom", Wikidata's alias for Israel's United Monarchy, is not Britain in 1850).
  const named = polities.filter((x) => (x.via === 'name' || x.via === 'alias') && x.fit !== 'within' && !x.polity.g && x.polity.t >= year);
  if (!named.length) return undefined;
  const w = normName(written);
  // The state whose everyday name is the word itself first ("China" → the People's Republic, not Taiwan's Republic of China).
  const latest = [...named].sort((a, b) => Number(normName(b.polity.cn ?? '') === w) - Number(normName(a.polity.cn ?? '') === w) || b.polity.t - a.polity.t || Number(!!a.polity.qx) - Number(!!b.polity.qx))[0].polity;
  const at = polityLabelAt(latest, latest.t);
  if (!at) return undefined;
  const holders = await politiesAt(at, year).catch(() => []);
  const recorded = named.slice(0, 3).map((x) => `${x.polity.cn ?? x.polity.n.replace(/^\(|\)$/g, '')} (${(x.polity.s ?? [[x.polity.f, x.polity.t]]).map(([f, t]) => `${yearLabel(f)}–${yearLabel(t)}`).join(', ')})`).join('; ');
  const near = named.filter((x) => x.fit === 'near').map((x) => `${x.polity.n} is recorded only from ${yearLabel(x.polity.f)}${x.polity.f > year ? '' : ` to ${yearLabel(x.polity.t)}`}, not at this date.`).join(' ');
  const held = holders.filter((h) => !h.g).map((h) => `${h.edge ? 'at the edge of ' : ''}${h.cn ?? h.n.replace(/^\(|\)$/g, '')}${h.partOf?.length ? `, part of ${h.partOf.join(' and ')}` : ''}${polityConvention(h.n) ? ` (${polityConvention(h.n)})` : ''}`);
  const reason = `No polity called “${written}” has an outline in ${yearLabel(year)} in Cliopatria (it records ${recorded}). ${near ? `${near} ` : ''}`
    + (held.length ? `Shown as the land of that name: in ${yearLabel(year)} the spot where Cliopatria labels ${latest.cn ?? latest.n} lay in ${held.join(' and ')}.`
      : `Shown as the land of that name. In ${yearLabel(year)} Cliopatria has no outline there — it lies between outlines, so who held it then isn’t recorded.`);
  const title = written.trim();
  const place: ReaderPlace = {
    key: `land:${normName(title)}`, title, kind: 'region', written, lat: at[1], lon: at[0], certainty: 'approximate',
    names: [], partOf: holders.filter((h) => !h.g).map((h) => h.cn ?? h.n.replace(/^\(|\)$/g, '')), related: [], types: ['region'],
    sources: [{ name: 'Cliopatria (Seshat Global History Databank)', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', license: 'CC BY 4.0', note: 'The land is placed at the label point of the latest polity of that name; who held it comes from the outlines at the date.' }],
    evidence: 'single-source', status: held.length ? 'MEDIUM' : 'LOW', why: why(reason, 'Country name → the land at the date (Cliopatria outlines)'),
  };
  const holderPlaces = holders.filter((h) => !h.g).map((h) => fromPolity({ polity: { ...h, x: at[0], y: at[1], core: polityCore(h.n) }, via: 'name', fit: 'within' }, written, why(`${h.n} held this land in ${yearLabel(year)} (Cliopatria).`, 'Polity holding the land (Cliopatria)'), 'LOW', year)).filter((x): x is ReaderPlace => !!x);
  const namePlaces = named.filter((x) => x.fit === 'near').map((x) => fromPolity(x, written, why(`${x.polity.n} is recorded ${yearLabel(x.polity.f)}–${yearLabel(x.polity.t)} — not at the date being read about.`, 'Polity name (Cliopatria)'), 'LOW', year)).filter((x): x is ReaderPlace => !!x);
  return { place, status: place.status, candidates: [...holderPlaces, ...namePlaces], reason };
}

/**
 * The one candidate inside the country or region the text names right after the place ("York in England",
 * "Boston, Lincolnshire"): a continent/sea/land region by its extent, a polity by its outline at the date.
 */
async function qualifierPick(written: string, passage: string, cands: GazPlace[], year?: HistYear): Promise<{ place: GazPlace; area: string } | undefined> {
  const esc = written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(`\\b${esc}(,| in)\\s+(?:the\\s+)?(\\p{Lu}[\\p{L}'’-]+(?:\\s+\\p{Lu}[\\p{L}'’-]+)?)`, 'u').exec(passage);
  if (!hit) return undefined;
  const area = hit[2];
  const inside: GazPlace[] = [];
  const macro = macroRegion(area);
  if (macro) {
    const [w, so, e, n] = macro.bbox;
    inside.push(...cands.filter((c) => c.lon >= w && c.lon <= e && c.lat >= so && c.lat <= n));
  } else if (year !== undefined) {
    const matches = await matchPolity(area, year);
    let pols = matches.filter((x) => x.fit === 'within' && (x.via === 'name' || x.via === 'alias')).map((x) => x.polity.n.replace(/^\(|\)$/g, ''));
    // A country name with no state of that name at the date ("Egypt" in 1200): whoever held that land then.
    if (!pols.length) pols = ((await landAt(matches, area, year, (reason, method) => ({ detection: 'cue', reason, method })))?.candidates ?? []).filter((c) => c.polity && c.polity.f <= year && year <= c.polity.t).map((c) => c.polity!.n);
    if (!pols.length) return undefined;
    for (const c of cands) {
      const at = await politiesAt([c.lon, c.lat], year).catch(() => []);
      const bare = (n: string) => n.replace(/^\(|\)$/g, '');
      // The state itself, not a grouping it belongs to: "(Kingdom of England)" also spans its colonies.
      if (at.some((h) => !h.g && (pols.includes(bare(h.n)) || pols.includes(h.n)))) inside.push(c);
    }
  }
  // Several records of one town (each dataset's own copy) count as one place.
  return inside.length && inside.every((c) => km([c.lon, c.lat], [inside[0].lon, inside[0].lat]) <= 5) ? { place: inside[0], area } : undefined;
}

/** A polity named after a city ("Sultanate of Malacca" for "Malacca") whose outline at the date no longer holds that city. */
async function lostNamesake(pm: PolityMatch, written: string, year: HistYear): Promise<boolean> {
  const w = normName(written);
  if (pm.via !== 'name' || pm.polity.core !== w || normName(pm.polity.n.replace(/^\(|\)$/g, '')) === w) return false;
  const cities = (await placesByName(written).catch(() => [])).filter((x) => x.isTitle && kindOf(x.place) === 'settlement' && x.place.precise);
  if (!cities.length) return false;
  const held = await Promise.all(cities.slice(0, 3).map((c) => politiesAt([c.place.lon, c.place.lat], year).catch(() => [])));
  return held.every((hs) => !hs.some((h) => h.n === pm.polity.n || (h.m ?? '').split(';').includes(pm.polity.n)));
}

/** A gazetteer place as the online service's record type, so a reader's pick can be remembered per book. */
function toHistorical(p: ReaderPlace): HistoricalPlace {
  return {
    id: p.key, canonicalName: p.title, matchedName: p.written, alternativeNames: p.names.map((n) => n.name), latitude: p.lat, longitude: p.lon,
    locationPrecision: p.certainty === 'known' ? 'exact' : p.certainty === 'uncertain' ? 'uncertain' : 'approximate', placeType: p.types[0], countryCodes: [],
    historicalStartYear: p.from, historicalEndYear: p.to, source: p.sources[0]?.name ?? '', sourceId: p.key.split(':').slice(1).join(':'), confidence: 'HIGH',
    attribution: p.sources.map((s) => ({ source: s.name, license: s.license, url: s.url })), url: p.sources[0]?.record,
  };
}

export async function choosePlace(bookId: string | undefined, written: string, p: ReaderPlace): Promise<ReaderPlace> {
  const chosen = { ...p, written, status: 'HIGH' as Confidence, why: { ...p.why, userChosen: true, reason: 'You chose this place for this name in this book.' } };
  if (bookId) await historicalPlaces.choosePlace({ name: written, bookId }, toHistorical(chosen));
  return chosen;
}

export async function resolvePlace(written: string, opts: { year?: HistYear; bookId?: string; detection: Detection; passage?: string; nearby?: string[]; chapter?: string; bookTitle?: string; online?: boolean; signal?: AbortSignal; mention?: MentionEvidence; context?: GeoContext }): Promise<Resolution> {
  const why = (reason: string, method: string, extra: Partial<ReaderPlace['why']> = {}): ReaderPlace['why'] => ({ detection: opts.detection, reason, method, ...extra });
  const year = opts.year;
  // 1. The reader's own pick for this name in this book.
  if (opts.bookId) {
    const c = await readChoice(opts.bookId, written);
    const h = c?.place as HistoricalPlace | undefined;
    // An offline record is re-read from today's data, never served from the copy saved when it was chosen; a record
    // that is no longer in the data is not served at all (the name is resolved afresh).
    const offlineKey = !!h && GAZETTEERS.some((x) => h.id.startsWith(`${x.id}:`));
    if (h) {
      // A record from an older data build is found again by its name and position before giving up on it (C3).
      const g = await getPlace(h.id).catch(() => undefined) ?? (offlineKey ? await relocatePlace(h.id, h.canonicalName, h.longitude !== undefined && h.latitude !== undefined ? [h.longitude, h.latitude] : undefined).catch(() => undefined) : undefined);
      if (offlineKey && !g) {
        // fall through: the chosen record has left the data
      } else {
      const p = g ? fromGaz(g, written, why('You chose this place for this name in this book.', 'Your choice', { userChosen: true }), 'HIGH', [], year) : fromOnline(h, written, why('You chose this place for this name in this book.', 'Your choice', { userChosen: true }), 'HIGH');
      if (p) return { place: p, status: 'HIGH', candidates: [], reason: p.why.reason };
      }
    }
  }
  // What the text itself says: how strong the place wording is, what type of entity it implies.
  const automatic = opts.detection === 'cue' || opts.detection === 'ai';
  const mention = opts.mention ?? (automatic ? mentionEvidence(written, opts.passage) : undefined);
  const expected = mention?.expected;

  // 2. Continents and seas are macro-regions — never a town or province that shares the name.
  // Where the book is set, as far as is already known.
  const context = opts.context ?? await bookGeoContext({ bookId: opts.bookId, nearby: opts.nearby, year, exclude: written }).catch(() => undefined);

  // 3. Political entities (Cliopatria) — by name, alias or demonym, all from recorded data
  //    (Cliopatria names; Wikidata aliases and demonyms), ranked by date and the book's geography.
  const polities = await matchPolity(written, year, { context }).catch(() => [] as PolityMatch[]);
  // A polity is only "the" answer when it existed at the date. Without a date
  // its existence can't be checked, so it is at most a possibility (LOW),
  // unless the words themselves name a polity (a demonym, "the Kingdom of …").
  // Only a polity with an outline at the date: one recorded 24 years later is a date mismatch, not the answer (A16-003).
  const livePolity = polities.find((x) => x.fit === 'within' || (x.fit === 'undated-year' && (expected === 'polity' || !!mention?.demonym)));
  // Two different polities fit the words and the date equally, and the book's places don't separate them.
  // (The book's places settle it only when one polity's territory holds them and the other's doesn't.)
  const same = (a: PolityMatch['polity'], b: PolityMatch['polity']) => (a.q && b.q && !a.qx && !b.qx ? a.q === b.q : a.n === b.n);
  const rivals = livePolity ? polities.filter((x) => x.fit === livePolity.fit && x.via === livePolity.via && !x.polity.n.startsWith('(') && !same(x.polity, livePolity.polity)
    && !(livePolity.holdsBook && x.holdsBook === false)) : [];
  const possiblePolity = livePolity ?? polities.find((x) => x.fit === 'undated-year');
  const polityPlace = (pm: PolityMatch, status: Confidence) => fromPolity(pm, written, why(viaDemonym(pm.via)
    ? `“${written}” is an adjective for ${pm.polity.n.replace(/^\(|\)$/g, '')}, a polity Cliopatria records ${yearLabel(pm.polity.f)}–${yearLabel(pm.polity.t)}.`
    : `${pm.polity.n.replace(/^\(|\)$/g, '')} is a polity Cliopatria records ${yearLabel(pm.polity.f)}–${yearLabel(pm.polity.t)}${pm.fit === 'within' ? ', which includes the date being read about' : pm.fit === 'undated-year' ? ' — the date being read about isn’t known, so whether it existed then can’t be checked' : ''}${pm.via === 'alias' ? ' (matched through a name Wikidata records for it)' : ''}.`, pm.via === 'demonym' ? 'Recorded demonym → polity (Wikidata, Cliopatria)' : pm.via === 'stem' ? 'Adjective → polity by spelling (Cliopatria)' : pm.via === 'alias' ? 'Alias → polity (Wikidata, Cliopatria)' : 'Polity name (Cliopatria)'), status, year);

  const macro = macroRegion(written);
  if (macro && expected !== 'settlement' && expected !== 'polity') {
    const what = macro.kind === 'sea' ? 'sea or ocean' : macro.kind === 'continent' ? 'continent' : 'geographic region (a land, not a state)';
    const place = fromMacro(macro, written, why(`“${written}” is the name of a ${what}, so it is shown as a region, not matched to a town, province or state that happens to share the name.`, 'General geography'));
    // Other readings valid at the date: a state of that name, or a period province/region of
    // exactly that name ("Asia" in a Roman book may be the province of Asia).
    const alt = macro.kind === 'region' && livePolity ? polityPlace(livePolity, 'LOW') : undefined;
    const period = year === undefined ? undefined : await matchName(written, year).catch(() => undefined);
    const regions = (period?.candidates ?? []).filter((c) => kindOf(c) === 'region' && existedAround(c, year!, 50))
      .map((c) => fromGaz(c, written, why(`${gazetteerInfo(c.gazetteer).name} records a ${(c.types[0] ?? 'region').replace(/-\d$/, '')} named “${c.title}”${c.from !== undefined || c.to !== undefined ? ` around ${yearLabel(year!)}` : ` (${envelopeWords(c.envelope!.basis)})`}.`, `${gazetteerInfo(c.gazetteer).name} name match`), 'LOW', [], year));
    const candidates = [...regions, ...(alt ? [alt] : [])];
    const note = candidates.length ? ` It could also mean ${candidates.map((c) => `“${c.recordTitle ?? c.title}”${c.types[0] ? ` (${c.types[0].replace(/-\d$/, '')})` : ''}`).join(' or ')} — choose it if that fits the passage.` : '';
    return { place: { ...place, why: { ...place.why, reason: place.why.reason + note } }, status: 'HIGH', candidates, reason: place.why.reason + note };
  }
  if (livePolity && rivals.length && (expected === 'polity' || expected === 'region' || mention?.demonym)) {
    const cands = [livePolity, ...rivals].slice(0, 5).map((x) => polityPlace(x, 'AMBIGUOUS')).filter((x): x is ReaderPlace => !!x);
    return { status: 'AMBIGUOUS', candidates: cands, reason: `“${written}” could refer to ${cands.map((c) => c.title).join(' or ')} at this date, and the places already in this book don’t say which.` };
  }
  if (livePolity && (expected === 'polity' || expected === 'region' || mention?.demonym)) {
    // Confident only when the words match a recorded name/alias/demonym and the book's own places don't
    // lie outside that polity at the date; a spelling-only match, or one the book's places contradict, is "likely".
    const place = polityPlace(livePolity, livePolity.via === 'stem' || livePolity.holdsBook === false ? 'MEDIUM' : 'HIGH');
    if (place) return { place, status: place.status, candidates: polities.filter((x) => x !== livePolity).slice(0, 4).map((x) => polityPlace(x, 'LOW')).filter((x): x is ReaderPlace => !!x), reason: place.why.reason };
  }
  // A demonym never becomes a town or an online lookup.
  if (mention?.demonym && !polities.length) return { status: 'UNRESOLVED', candidates: [], reason: `“${written}” reads as an adjective, and no polity or region with that stem is recorded${year !== undefined ? ` around ${yearLabel(year)}` : ''}.` };

  // 4. Period gazetteers, offline — scored by date, entity type and the book's geography.
  let local: Resolution | undefined;
  const m = await matchName(written, year, { context, expected }).catch(() => undefined);
  if (m?.loadFailed) return { status: 'UNRESOLVED', candidates: [], reason: m.reason, loadFailed: true };
  if (m?.status === 'unique' && m.place) {
    // Identity and dates are weighed together once, in the gazetteer (placeConfidence), and only mapped here.
    const status = CONFIDENCE_OF[m.confidence];
    const method = `${[m.place, ...m.corroborating].map((p) => gazetteerInfo(p.gazetteer).name).join(' + ')} name match`;
    const place = fromGaz(m.place, written, why(m.reason, method, { matchedName: m.matchedName?.name, matchedIsTitle: m.matchedName?.isTitle }), status, m.corroborating, year);
    const alsoPolity = livePolity ? polityPlace(livePolity, 'LOW') : undefined;
    return { place, status, candidates: [...m.candidates.filter((c) => c.key !== m.place!.key).map((c) => fromGaz(c, written, place.why, 'LOW', [], year)), ...(alsoPolity ? [alsoPolity] : [])], reason: m.reason };
  }
  // "…to York in England", "Boston, Lincolnshire": a country or region named with the place settles which one (A12-019).
  if (m?.status === 'ambiguous' && opts.passage) {
    const q = await qualifierPick(written, opts.passage, m.candidates, year).catch(() => undefined);
    if (q) {
      const place = fromGaz(q.place, written, why(`${m.reason} The text places “${written}” in ${q.area}, and only this one lies there${year !== undefined ? ` in ${yearLabel(year)}` : ''}.`, `${gazetteerInfo(q.place.gazetteer).name} name match + the area named in the text`), 'MEDIUM', [], year);
      return { place, status: 'MEDIUM', candidates: m.candidates.filter((c) => c.key !== q.place.key).map((c) => fromGaz(c, written, place.why, 'LOW', [], year)), reason: place.why.reason };
    }
  }
  if (m?.status === 'ambiguous') local = { status: 'AMBIGUOUS', candidates: m.candidates.map((c) => fromGaz(c, written, why(m.reason, `${gazetteerInfo(c.gazetteer).name} name match`), 'AMBIGUOUS', [], year)), reason: m.reason };
  // No settlement of that name: a polity valid at the date is the answer — unless the name is a city's and the
  // polity named after it no longer held that city (ID-4: "Malacca" in 1700 is not the Sultanate of Malacca).
  if (!local && livePolity && year !== undefined && await lostNamesake(livePolity, written, year)) {
    const place = polityPlace(livePolity, 'LOW');
    return { status: 'LOW', candidates: place ? [place] : [], reason: `${livePolity.polity.n} is named after ${written}, but in ${yearLabel(year)} Cliopatria’s outline for it doesn’t include ${written} — it is offered only as a possibility.` };
  }
  // No polity of that name at the date: the land the name refers to, and who held it then.
  if (!local && !livePolity && year !== undefined) {
    const land = await landAt(polities, written, year, why);
    if (land) return land;
  }
  if (!local && livePolity) {
    const place = polityPlace(livePolity, 'MEDIUM');
    if (place) return { place, status: 'MEDIUM', candidates: [], reason: place.why.reason };
  }
  // Without a date, a polity of that name is only a possibility — shown to the reader, never placed on its own.
  if (!local && possiblePolity && opts.online === false) {
    const place = polityPlace(possiblePolity, 'LOW');
    if (place) return { status: 'LOW', candidates: [place], reason: place.why.reason };
  }
  if (opts.online === false) return local ?? { status: 'UNRESOLVED', candidates: [], reason: m?.reason ?? `“${written}” isn’t in the offline gazetteers.` };

  // 5. Online sources — only if the text itself supports this being a place.
  if (mention) {
    await loadCommonWords();
    const ok = plausibleMention({ ...mention, commonWord: isCommonWord(written.trim().split(/\s+/)[0]) }, written, !!local);
    if (!ok.ok) return local ?? { status: 'UNRESOLVED', candidates: [], reason: ok.reason ?? '' };
  }
  // Weigh every source together (offline gazetteers + World Historical Gazetteer). WHG only adds evidence; it never decides alone.
  const ev = await assessPlace(written, { year, local: m?.candidates ?? [], signal: opts.signal, context }).catch((e) => { if ((e as Error).name === 'AbortError') throw e; return undefined; });
  if (local && ev?.status === 'identified' && ev.confidence !== 'weak') {
    // The offline records disagree among themselves; the combined evidence may favour one of them.
    const keys = new Set(ev.clusters[0].claims.filter((c) => c.gaz && local!.candidates.some((x) => x.key === c.gaz!.key)).map((c) => c.gaz!.key));
    if (keys.size === 1) {
      const chosen = local.candidates.find((x) => x.key === [...keys][0])!;
      const reason = `${m!.reason} Weighing all sources: ${ev.statements.filter((x) => /independent sources|fits the date|Confidence|near the other places/.test(x)).join(' ')}`.trim();
      const place = withEvidence({ ...chosen, status: 'MEDIUM', why: { ...chosen.why, reason, method: `${chosen.sources[0].name} + World Historical Gazetteer evidence` } }, ev);
      return { place, status: 'MEDIUM', candidates: local.candidates.filter((x) => x.key !== chosen.key).map((x) => ({ ...x, status: 'LOW' as Confidence })), reason, evidence: ev };
    }
  }
  if (local) local = { ...local, candidates: local.candidates.map((x) => withEvidence(x, ev)), evidence: ev };
  // The online place service (WHG via Shelf's server, else Wikidata), with the book's date and geography.
  const q: PlaceQuery = { name: written, date: year, surroundingText: opts.passage?.slice(0, 1200), nearbyPlaceNames: opts.nearby?.slice(0, 10), chapterTitle: opts.chapter, bookTitle: opts.bookTitle, bookId: opts.bookId, language: 'en', contextPoints: context?.points.map(([lon, lat]) => ({ lat, lon })) };
  const res = await historicalPlaces.resolvePlaceName(q, { signal: opts.signal }).catch((e) => { if ((e as Error).name === 'AbortError') throw e; return undefined; });
  if (!res || res.error || (!res.place && !res.candidates.length)) {
    if (local) return local;
    // Nothing from the place service: the combined evidence may still point to one place (never above "likely").
    if (ev && ev.status === 'identified' && ev.confidence !== 'weak') {
      const status: Confidence = ev.confidence === 'strong' ? 'MEDIUM' : 'LOW';
      const place = fromEvidence(ev, written, why(ev.statements.slice(0, 3).join(' '), 'World Historical Gazetteer attestations, weighed together'), status);
      if (place) return { place, status, candidates: [], reason: place.why.reason, evidence: ev };
    }
    if (ev && ev.status === 'ambiguous') {
      const cands = ev.clusters.slice(0, 8).map((c) => fromEvidence({ ...ev, clusters: [c] }, written, why(ev.statements.find((x) => x.includes('doesn’t settle')) ?? '', 'World Historical Gazetteer attestation'), 'AMBIGUOUS')).filter((x): x is ReaderPlace => !!x);
      if (cands.length) return { status: 'AMBIGUOUS', candidates: cands, reason: `“${written}” could be ${cands.length} different places.`, evidence: ev };
    }
    const maybe = !local && possiblePolity && !livePolity ? polityPlace(possiblePolity, 'LOW') : undefined;
    if (maybe) return { status: 'LOW', candidates: [maybe], reason: maybe.why.reason, evidence: ev };
    return { status: 'UNRESOLVED', candidates: [], reason: res?.reason || (ev?.statements.find((x) => x.startsWith('No record')) ?? ''), error: res?.error ?? (res ? undefined : 'Historical place lookup unavailable. Try again.'), evidence: ev };
  }
  const onlineWhy = (h: HistoricalPlace) => why(res.reason ?? '', `${h.source} search`);
  let place = res.place && (res.status === 'HIGH' || res.status === 'MEDIUM' || res.userChosen) ? fromOnline(res.place, written, onlineWhy(res.place), res.status) : undefined;
  // The offline candidates can settle it when the online match agrees with one of them (same name, within 25 km).
  if (place && local) {
    const same = local.candidates.find((c) => km([c.lon, c.lat], [place!.lon, place!.lat]) < 25);
    if (same) place = { ...same, status: res.status, why: { ...same.why, reason: `${res.reason ?? ''} ${same.sources[0].name} records a place with this name at the same spot.`.trim(), method: `${res.place!.source} search, confirmed by ${same.sources[0].name}` }, sources: [...same.sources, ...place.sources] };
  }
  if (place) return { place: withEvidence(place, ev), status: res.status, candidates: res.candidates.map((c) => fromOnline(c.place, written, onlineWhy(c.place), 'LOW')).filter((x): x is ReaderPlace => !!x), reason: res.reason ?? '', evidence: ev };
  const cands = [...(local?.candidates ?? []), ...res.candidates.map((c) => fromOnline(c.place, written, onlineWhy(c.place), 'AMBIGUOUS')).filter((x): x is ReaderPlace => !!x)];
  return { status: cands.length > 1 ? 'AMBIGUOUS' : res.status, candidates: cands.slice(0, 12), reason: local?.reason ?? res.reason ?? '', evidence: ev };
}

/** How far a place is from what the book already places on the map (km; Infinity without context). */
export const distanceFromBook = (ctx: GeoContext | undefined, p: { lat: number; lon: number }) => contextDistance(ctx, [p.lon, p.lat]);

/** Quick offline check used while reading: is this name one unique place in the period's gazetteer? */
export async function offlineUnique(names: string[], year: HistYear): Promise<Map<string, GazPlace>> {
  const out = new Map<string, GazPlace>();
  for (const n of [...new Set(names)]) {
    if (out.has(normName(n))) continue;
    const m = await matchName(n, year).catch(() => undefined);
    // Underline only clear cases: one place, located with confidence, and its dates support the year (certain or
    // probable — a place first recorded only later, or with no dates at all, is not underlined as if it were known then).
    if (m?.status === 'unique' && m.place && m.candidates.length === 1 && m.place.uncertain === 0 && (m.confidence === 'certain' || m.confidence === 'probable')) out.set(normName(n), m.place);
  }
  return out;
}
