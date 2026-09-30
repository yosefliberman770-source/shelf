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
import { norm } from '../lib/history/assess';
import { historicalPlaces } from '../lib/history/placeService';
import type { Confidence, HistoricalPlace, PlaceQuery } from '../lib/history/types';
import { km } from './data';
import { type GazName, type GazPlace, gazetteerInfo, existedAround, getPlace, kindOf, undatedInCore, matchName, normName, type Relation } from './gazetteer';
import { bookGeoContext, contextDistance, type GeoContext } from './geocontext';
import { type EntityKind, isCommonWord, loadCommonWords, macroRegion, type MacroRegion, matchPolity, type MentionEvidence, mentionEvidence, plausibleMention, type PolityMatch } from './mention';
import { nameRoles, type NameRoles, pickDisplay } from './names';
import { type HistYear, yearLabel } from './time';
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
export interface Disagreement { field: 'location' | 'date' | 'name' | 'affiliation'; claims: { source: string; value: string }[]; note?: string }

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
}

const choiceKey = (bookId: string, name: string) => `${bookId}|${norm(name)}`;

/** A gazetteer record's dates, keeping what kind of date they are. */
export function gazDate(p: GazPlace): HistDate {
  const name = gazetteerInfo(p.gazetteer).name;
  if (p.datasetPeriod) return period(p.from, p.to, 'Period of the whole dataset, not of this place', name);
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
  const roles = nameRoles(p, written, year);
  return {
    key: p.key, title: roles.display, kind: kindOf(p), recordTitle: roles.display !== p.title ? p.title : undefined, nameRoles: roles, written, lat: p.lat, lon: p.lon,
    certainty: p.uncertain >= 1 ? 'uncertain' : p.precise ? 'known' : 'approximate',
    from: p.from, to: p.to, when: mergeDates(all.map(gazDate)), names: p.names, partOf: p.partOf, related: p.related, types: [...new Set(all.flatMap((x) => x.types))],
    roles: p.roles ?? corroborating.find((c) => c.roles)?.roles,
    sources: all.map(src),
    evidence: p.uncertain >= 1 ? 'historical-uncertainty' : corroborating.length ? 'confirmed' : 'single-source',
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
export function fromPolity(pm: PolityMatch, written: string, why: ReaderPlace['why'], status: Confidence): ReaderPlace | undefined {
  const p = pm.polity;
  if (p.x === undefined || p.y === undefined) return undefined;
  const name = p.n.replace(/^\(|\)$/g, '');
  return {
    key: `polity:${p.q ?? normName(p.n)}:${p.f}`, title: name, kind: 'polity', written, lat: p.y, lon: p.x, certainty: 'approximate',
    polity: { n: name, f: p.f, t: p.t, q: p.q }, from: p.f, to: p.t, when: yearRange(p.f, p.t, { source: 'Cliopatria', qualifier: 'between' }),
    names: [], partOf: [], related: [], types: ['polity'],
    sources: [{ name: 'Cliopatria (Seshat Global History Databank)', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', license: 'CC BY 4.0', record: p.q ? `https://www.wikidata.org/wiki/${p.q}` : undefined, note: 'Territory reconstructed by Cliopatria; the point is only where its label sits.' }],
    evidence: 'single-source', status, why,
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

export async function resolvePlace(written: string, opts: { year?: HistYear; bookId?: string; detection: Detection; passage?: string; nearby?: string[]; chapter?: string; bookTitle?: string; online?: boolean; signal?: AbortSignal; mention?: MentionEvidence; context?: GeoContext }): Promise<Resolution> {
  const why = (reason: string, method: string, extra: Partial<ReaderPlace['why']> = {}): ReaderPlace['why'] => ({ detection: opts.detection, reason, method, ...extra });
  const year = opts.year;
  // 1. The reader's own pick for this name in this book.
  if (opts.bookId) {
    const c = await db.placeChoices.get(choiceKey(opts.bookId, written)).catch(() => undefined);
    const h = c?.place as HistoricalPlace | undefined;
    if (h) {
      const g = await getPlace(h.id).catch(() => undefined);
      const p = g ? fromGaz(g, written, why('You chose this place for this name in this book.', 'Your choice', { userChosen: true }), 'HIGH', [], year) : fromOnline(h, written, why('You chose this place for this name in this book.', 'Your choice', { userChosen: true }), 'HIGH');
      if (p) return { place: p, status: 'HIGH', candidates: [], reason: p.why.reason };
    }
  }
  // What the text itself says: how strong the place wording is, what type of entity it implies.
  const automatic = opts.detection === 'cue' || opts.detection === 'ai';
  const mention = opts.mention ?? (automatic ? mentionEvidence(written, opts.passage) : undefined);
  const expected = mention?.expected;

  // 2. Continents and seas are macro-regions — never a town or province that shares the name.
  // 3. Political entities (Cliopatria) — by name, or by demonym ("Aragonese" → Aragon).
  const polities = await matchPolity(written, year).catch(() => [] as PolityMatch[]);
  // A polity is only "the" answer when it existed at the date. Without a date
  // its existence can't be checked, so it is at most a possibility (LOW),
  // unless the words themselves name a polity (a demonym, "the Kingdom of …").
  const livePolity = polities.find((x) => x.fit === 'within' || x.fit === 'near' || (x.fit === 'undated-year' && (expected === 'polity' || !!mention?.demonym)));
  const possiblePolity = livePolity ?? polities.find((x) => x.fit === 'undated-year');
  const polityPlace = (pm: PolityMatch, status: Confidence) => fromPolity(pm, written, why(pm.via === 'demonym'
    ? `“${written}” is an adjective for ${pm.polity.n.replace(/^\(|\)$/g, '')}, a polity Cliopatria records ${yearLabel(pm.polity.f)}–${yearLabel(pm.polity.t)}.`
    : `${pm.polity.n.replace(/^\(|\)$/g, '')} is a polity Cliopatria records ${yearLabel(pm.polity.f)}–${yearLabel(pm.polity.t)}${pm.fit === 'within' ? ', which includes the date being read about' : pm.fit === 'undated-year' ? ' — the date being read about isn’t known, so whether it existed then can’t be checked' : ''}.`, pm.via === 'demonym' ? 'Demonym → polity (Cliopatria)' : 'Polity name (Cliopatria)'), status);

  const macro = macroRegion(written);
  if (macro && expected !== 'settlement' && expected !== 'polity') {
    const what = macro.kind === 'sea' ? 'sea or ocean' : macro.kind === 'continent' ? 'continent' : 'geographic region (a land, not a state)';
    const place = fromMacro(macro, written, why(`“${written}” is the name of a ${what}, so it is shown as a region, not matched to a town, province or state that happens to share the name.`, 'General geography'));
    // Other readings valid at the date: a state of that name, or a period province/region of
    // exactly that name ("Asia" in a Roman book may be the province of Asia).
    const alt = macro.kind === 'region' && livePolity ? polityPlace(livePolity, 'LOW') : undefined;
    const period = year === undefined ? undefined : await matchName(written, year).catch(() => undefined);
    const regions = (period?.candidates ?? []).filter((c) => kindOf(c) === 'region' && (existedAround(c, year!, 50) || undatedInCore(c, year!)))
      .map((c) => fromGaz(c, written, why(`${gazetteerInfo(c.gazetteer).name} records a ${(c.types[0] ?? 'region').replace(/-\d$/, '')} named “${c.title}”${existedAround(c, year!, 50) ? ` around ${yearLabel(year!)}` : ' (undated, within the period it covers)'}.`, `${gazetteerInfo(c.gazetteer).name} name match`), 'LOW', [], year));
    const candidates = [...regions, ...(alt ? [alt] : [])];
    const note = candidates.length ? ` It could also mean ${candidates.map((c) => `“${c.recordTitle ?? c.title}”${c.types[0] ? ` (${c.types[0].replace(/-\d$/, '')})` : ''}`).join(' or ')} — choose it if that fits the passage.` : '';
    return { place: { ...place, why: { ...place.why, reason: place.why.reason + note } }, status: 'HIGH', candidates, reason: place.why.reason + note };
  }
  if (livePolity && (expected === 'polity' || expected === 'region' || mention?.demonym)) {
    const place = polityPlace(livePolity, 'HIGH');
    if (place) return { place, status: 'HIGH', candidates: polities.filter((x) => x !== livePolity).slice(0, 4).map((x) => polityPlace(x, 'LOW')).filter((x): x is ReaderPlace => !!x), reason: place.why.reason };
  }
  // A demonym never becomes a town or an online lookup.
  if (mention?.demonym && !polities.length) return { status: 'UNRESOLVED', candidates: [], reason: `“${written}” reads as an adjective, and no polity or region with that stem is recorded${year !== undefined ? ` around ${yearLabel(year)}` : ''}.` };

  // Where the book is set, as far as is already known.
  const context = opts.context ?? await bookGeoContext({ bookId: opts.bookId, nearby: opts.nearby, year, exclude: written }).catch(() => undefined);

  // 4. Period gazetteers, offline — scored by date, entity type and the book's geography.
  let local: Resolution | undefined;
  const m = await matchName(written, year, { context, expected }).catch(() => undefined);
  if (m?.status === 'unique' && m.place) {
    const attested = m.fit === 'within' || m.fit === 'near' || m.fit === 'no-year';
    // An undated record inside the dataset's own period counts when the book's geography agrees with it.
    const fitsBook = !!context?.points.length && contextDistance(context, [m.place.lon, m.place.lat]) < 1500;
    const plausibleUndated = m.fit === 'undated' && year !== undefined && undatedInCore(m.place, year) && fitsBook;
    const status: Confidence = m.candidates.length === 1 && (attested || plausibleUndated) ? 'HIGH' : 'MEDIUM';
    const method = `${[m.place, ...m.corroborating].map((p) => gazetteerInfo(p.gazetteer).name).join(' + ')} name match`;
    const place = fromGaz(m.place, written, why(m.reason, method, { matchedName: m.matchedName?.name, matchedIsTitle: m.matchedName?.isTitle }), status, m.corroborating, year);
    const alsoPolity = livePolity ? polityPlace(livePolity, 'LOW') : undefined;
    return { place, status, candidates: [...m.candidates.filter((c) => c.key !== m.place!.key).map((c) => fromGaz(c, written, place.why, 'LOW', [], year)), ...(alsoPolity ? [alsoPolity] : [])], reason: m.reason };
  }
  if (m?.status === 'ambiguous') local = { status: 'AMBIGUOUS', candidates: m.candidates.map((c) => fromGaz(c, written, why(m.reason, `${gazetteerInfo(c.gazetteer).name} name match`), 'AMBIGUOUS', [], year)), reason: m.reason };
  // No settlement of that name: a polity valid at the date is the answer.
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
    // Underline only clear cases: one place, located on the map with confidence.
    if (m?.status === 'unique' && m.place && m.candidates.length === 1 && m.place.uncertain === 0) out.set(normName(n), m.place);
  }
  return out;
}
