// Resolving a place name read in the book into one record the whole reader
// uses — the text popup, the map, notes and "places you've met".
//
// Order: the reader's own pick for this book → the period gazetteers
// (offline; only a name the dataset records, only when exactly one place has
// it) → the online place service (World Historical Gazetteer / Wikidata).
// Every result carries its sources and a plain account of why it was chosen.
// Coordinates, names and dates come only from those datasets — never from AI.
import { db } from '../db/db';
import { norm } from '../lib/history/assess';
import { historicalPlaces } from '../lib/history/placeService';
import type { Confidence, HistoricalPlace, PlaceQuery } from '../lib/history/types';
import { km } from './data';
import { type GazName, type GazPlace, gazetteersFor, GAZETTEERS, loadGazetteer, matchName, normName, type Relation } from './gazetteer';
import type { HistYear } from './time';

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

export interface Source { name: string; url?: string; license?: string; record?: string; note?: string }

export interface ReaderPlace {
  key: string;
  title: string;
  /** As written in the book. */
  written: string;
  lat: number;
  lon: number;
  certainty: Certainty;
  from?: HistYear;
  to?: HistYear;
  names: GazName[];
  partOf: string[];
  related: Relation[];
  types: string[];
  description?: string;
  sources: Source[];
  status: Confidence;
  why: { detection: Detection; matchedName?: string; matchedIsTitle?: boolean; reason: string; method: string; userChosen?: boolean };
  gaz?: GazPlace;
}

export interface Resolution {
  place?: ReaderPlace;
  status: Confidence;
  /** Alternatives when the name fits several places. */
  candidates: ReaderPlace[];
  reason: string;
  error?: string;
}

const choiceKey = (bookId: string, name: string) => `${bookId}|${norm(name)}`;

export function fromGaz(p: GazPlace, written: string, why: ReaderPlace['why'], status: Confidence = 'HIGH'): ReaderPlace {
  const info = GAZETTEERS.find((g) => g.id === p.gazetteer)!;
  return {
    key: p.key, title: p.title, written, lat: p.lat, lon: p.lon,
    certainty: p.uncertain >= 1 ? 'uncertain' : p.precise ? 'known' : 'approximate',
    from: p.from, to: p.to, names: p.names, partOf: p.partOf, related: p.related, types: p.types,
    sources: [{ name: info.name, url: info.url, license: info.license, record: p.url }],
    status, why, gaz: p,
  };
}

function fromOnline(h: HistoricalPlace, written: string, why: ReaderPlace['why'], status: Confidence): ReaderPlace | undefined {
  if (h.latitude === undefined || h.longitude === undefined) return undefined;
  return {
    key: h.id, title: h.canonicalName, written, lat: h.latitude, lon: h.longitude,
    certainty: h.locationPrecision === 'exact' ? 'known' : h.locationPrecision === 'uncertain' ? 'uncertain' : 'approximate',
    from: h.historicalStartYear, to: h.historicalEndYear,
    names: h.alternativeNames.map((name) => ({ name })), partOf: [], related: [], types: h.placeType ? [h.placeType] : [], description: h.description,
    sources: h.attribution.map((a) => ({ name: a.dataset ? `${a.source} — ${a.dataset}` : a.source, url: a.url, license: a.license, record: h.url })),
    status, why,
  };
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

export async function resolvePlace(written: string, opts: { year?: HistYear; bookId?: string; detection: Detection; passage?: string; nearby?: string[]; chapter?: string; bookTitle?: string; online?: boolean; signal?: AbortSignal }): Promise<Resolution> {
  const why = (reason: string, method: string, extra: Partial<ReaderPlace['why']> = {}): ReaderPlace['why'] => ({ detection: opts.detection, reason, method, ...extra });
  // 1. The reader's own pick for this name in this book.
  if (opts.bookId) {
    const c = await db.placeChoices.get(choiceKey(opts.bookId, written)).catch(() => undefined);
    const h = c?.place as HistoricalPlace | undefined;
    if (h) {
      const g = h.id.startsWith('pleiades:') ? (await loadGazetteer().catch(() => undefined))?.byId.get(h.id) : undefined;
      const p = g ? fromGaz(g, written, why('You chose this place for this name in this book.', 'Your choice', { userChosen: true })) : fromOnline(h, written, why('You chose this place for this name in this book.', 'Your choice', { userChosen: true }), 'HIGH');
      if (p) return { place: p, status: 'HIGH', candidates: [], reason: p.why.reason };
    }
  }
  // 2. Period gazetteers, offline.
  let local: Resolution | undefined;
  for (const info of gazetteersFor(opts.year)) {
    const g = await loadGazetteer(info.id).catch(() => undefined);
    if (!g) continue;
    const m = matchName(g, written, opts.year);
    if (m.status === 'unique' && m.place) {
      const status: Confidence = m.candidates.length === 1 ? 'HIGH' : 'MEDIUM';
      const place = fromGaz(m.place, written, why(m.reason, `${info.name} name match`, { matchedName: m.matchedName?.name, matchedIsTitle: m.matchedName?.isTitle }), status);
      return { place, status, candidates: m.candidates.filter((c) => c.key !== m.place!.key).map((c) => fromGaz(c, written, place.why, 'LOW')), reason: m.reason };
    }
    if (m.status === 'ambiguous') local = { status: 'AMBIGUOUS', candidates: m.candidates.map((c) => fromGaz(c, written, why(m.reason, `${info.name} name match`), 'AMBIGUOUS')), reason: m.reason };
  }
  if (opts.online === false) return local ?? { status: 'UNRESOLVED', candidates: [], reason: `“${written}” isn’t in the offline gazetteer for this period.` };
  // 3. The online place service (WHG via Shelf's server, else Wikidata).
  const q: PlaceQuery = { name: written, date: opts.year, surroundingText: opts.passage?.slice(0, 1200), nearbyPlaceNames: opts.nearby?.slice(0, 10), chapterTitle: opts.chapter, bookTitle: opts.bookTitle, bookId: opts.bookId, language: 'en' };
  const res = await historicalPlaces.resolvePlaceName(q, { signal: opts.signal }).catch((e) => { if ((e as Error).name === 'AbortError') throw e; return undefined; });
  if (!res || res.error) return local ?? { status: 'UNRESOLVED', candidates: [], reason: '', error: res?.error ?? 'Historical place lookup unavailable. Try again.' };
  const onlineWhy = (h: HistoricalPlace) => why(res.reason ?? '', `${h.source} search`);
  let place = res.place && (res.status === 'HIGH' || res.status === 'MEDIUM' || res.userChosen) ? fromOnline(res.place, written, onlineWhy(res.place), res.status) : undefined;
  // The offline candidates can settle it when the online match agrees with one of them (same name, within 25 km).
  if (place && local) {
    const same = local.candidates.find((c) => km([c.lon, c.lat], [place!.lon, place!.lat]) < 25);
    if (same) place = { ...same, status: res.status, why: { ...same.why, reason: `${res.reason ?? ''} ${same.sources[0].name} records a place with this name at the same spot.`.trim(), method: `${res.place!.source} search, confirmed by ${same.sources[0].name}` }, sources: [...same.sources, ...place.sources] };
  }
  if (place) return { place, status: res.status, candidates: res.candidates.map((c) => fromOnline(c.place, written, onlineWhy(c.place), 'LOW')).filter((x): x is ReaderPlace => !!x), reason: res.reason ?? '' };
  const cands = [...(local?.candidates ?? []), ...res.candidates.map((c) => fromOnline(c.place, written, onlineWhy(c.place), 'AMBIGUOUS')).filter((x): x is ReaderPlace => !!x)];
  return { status: cands.length > 1 ? 'AMBIGUOUS' : res.status, candidates: cands.slice(0, 12), reason: local?.reason ?? res.reason ?? '' };
}

/** Quick offline check used while reading: is this name one unique place in the period's gazetteer? */
export async function offlineUnique(names: string[], year: HistYear): Promise<Map<string, GazPlace>> {
  const out = new Map<string, GazPlace>();
  for (const info of gazetteersFor(year)) {
    const g = await loadGazetteer(info.id).catch(() => undefined);
    if (!g) continue;
    for (const n of names) {
      if (out.has(normName(n))) continue;
      const m = matchName(g, n, year);
      // Underline only clear cases: one place, located on the map with confidence.
      if (m.status === 'unique' && m.place && m.candidates.length === 1 && m.place.uncertain === 0) out.set(normName(n), m.place);
    }
  }
  return out;
}
