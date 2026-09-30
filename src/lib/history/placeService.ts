// HistoricalPlaceService — the one door the reader uses for places.
//
//   EPUB text → place name + context → HistoricalPlaceService
//     → provider (World Historical Gazetteer via Shelf's server, or Wikidata)
//     → assess (likely / possible / which one? / not found)
//     → HistoricalPlace → map view
//
// Lookups are cached locally; places the reader picks for an ambiguous name
// are remembered per book so they aren't asked twice. Provider failures are
// never cached, and never break the reader.
import { db } from '../../db/db';
import { assessCandidates, norm } from './assess';
import { mapViewFor, type MapView } from './geometry';
import { PLACE_PROVIDERS, ProviderUnavailable, wikidataContextAt, wikidataProminence, wikidataProvider } from './providers';
import type { HistoricalPlace, PlaceCandidate, PlaceProvider, PlaceQuery, PlaceResolution } from './types';

const CACHE_DAYS = 30;

/** Cache key: name + the century being read about + provider ("rome|-3c|whg"). */
/** Bumped whenever the rules for accepting a match change, so answers cached under the old rules are looked up again. 2: spelling evidence, date and book-geography checks. */
const RESOLVER_VERSION = 2;

export function cacheKey(name: string, date: number | undefined, provider: string): string {
  const era = date === undefined ? 'any' : `${date < 0 ? '-' : ''}${Math.ceil(Math.abs(date) / 100)}c`;
  return `${norm(name)}|${era}|${provider}|v${RESOLVER_VERSION}`;
}
const choiceKey = (bookId: string, name: string) => `${bookId}|${norm(name)}`;

export class HistoricalPlaceService {
  private providers: PlaceProvider[];
  /** Requests in flight, so tapping the same name twice doesn't query twice. */
  private inflight = new Map<string, Promise<PlaceResolution>>();

  constructor(providers: PlaceProvider[] = PLACE_PROVIDERS) {
    this.providers = providers;
  }

  /** The best provider available right now (WHG when Shelf's server offers it). */
  async provider(): Promise<PlaceProvider> {
    for (const p of this.providers) if (await p.available().catch(() => false)) return p;
    return this.providers[this.providers.length - 1] ?? wikidataProvider;
  }

  /** Resolve one name read in a book, using its context. */
  async resolvePlaceName(q: PlaceQuery, opts: { signal?: AbortSignal; refresh?: boolean } = {}): Promise<PlaceResolution> {
    // 1. A place the reader already picked for this name in this book.
    if (q.bookId && !opts.refresh) {
      const choice = await db.placeChoices.get(choiceKey(q.bookId, q.name)).catch(() => undefined);
      if (choice) return { status: 'HIGH', place: { ...(choice.place as HistoricalPlace), matchedName: q.name }, candidates: [], provider: (choice.place as HistoricalPlace).source, userChosen: true, fromCache: true };
    }
    const provider = await this.provider();
    const key = cacheKey(q.name, q.date, provider.id);
    // 2. A recent lookup of the same name for the same period.
    if (!opts.refresh) {
      const hit = await db.placeCache.get(key).catch(() => undefined);
      if (hit && Date.now() - hit.updatedAt < CACHE_DAYS * 86_400_000) return { ...(hit.resolution as PlaceResolution), fromCache: true };
    }
    if (this.inflight.has(key)) return this.inflight.get(key)!;
    const job = this.lookup(q, provider, key, opts.signal).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private async lookup(q: PlaceQuery, provider: PlaceProvider, key: string, signal?: AbortSignal): Promise<PlaceResolution> {
    let candidates: PlaceCandidate[];
    // Look up the other places named nearby in the same request (WHG batches up
    // to 50 names per call), so they can help decide which place this is.
    const extra = (q.nearbyPlaceNames ?? []).filter((n) => norm(n) !== norm(q.name)).slice(0, provider.id === 'whg' ? 10 : 3);
    let nearbyFound: PlaceCandidate[][] = [];
    try {
      const all = await provider.search([q, ...extra.map((name) => ({ name }))], signal);
      candidates = all[0] ?? [];
      nearbyFound = all.slice(1);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // Not cached: a provider being down says nothing about the place.
      return { status: 'UNRESOLVED', candidates: [], provider: provider.id, error: e instanceof ProviderUnavailable ? e.message : 'Historical place lookup unavailable. Try again.' };
    }
    const res = await this.decide(q, candidates ?? [], provider, clearPoints(nearbyFound));
    // Fetch the full record (e.g. a polygon) for the chosen place when the provider has one.
    if (res.place && provider.get && !res.place.geometry && provider.id === 'whg') {
      const full = await provider.get(res.place.sourceId, signal).catch(() => undefined);
      if (full) res.place = mergePlace(res.place, full);
    }
    await db.placeCache.put({ id: key, placeId: res.place?.id, provider: provider.id, dateContext: q.date, resolution: res, updatedAt: Date.now() }).catch(() => {});
    return res;
  }

  private async decide(q: PlaceQuery, candidates: PlaceCandidate[], provider: PlaceProvider, extraPoints: { lat: number; lon: number }[] = []): Promise<PlaceResolution> {
    const nearbyPoints = [...(await this.nearbyPoints(q, provider.id)), ...extraPoints];
    const a = assessCandidates(candidates, { ...q, nearbyPoints, prominence: provider.id === 'wikidata' ? (c) => wikidataProminence.get(c.place.id) : undefined });
    const place = a.chosen ? { ...a.chosen.place, confidence: a.status } : undefined;
    return { status: a.status, place, candidates: a.candidates, provider: provider.id, reason: a.reason };
  }

  /** Locations of other places mentioned nearby that are already resolved (cache only — no extra lookups). */
  private async nearbyPoints(q: PlaceQuery, providerId: string) {
    const pts: { lat: number; lon: number }[] = [];
    for (const n of (q.nearbyPlaceNames ?? []).filter((x) => norm(x) !== norm(q.name)).slice(0, 8)) {
      const choice = q.bookId ? await db.placeChoices.get(choiceKey(q.bookId, n)).catch(() => undefined) : undefined;
      const p = (choice?.place as HistoricalPlace | undefined) ?? ((await db.placeCache.get(cacheKey(n, q.date, providerId)).catch(() => undefined))?.resolution as PlaceResolution | undefined)?.place;
      if (p?.latitude !== undefined && p.longitude !== undefined) pts.push({ lat: p.latitude, lon: p.longitude });
    }
    return pts;
  }

  /** Resolve many names at once (for "Map this chapter"); batched per provider. */
  async resolveMany(queries: PlaceQuery[], signal?: AbortSignal): Promise<PlaceResolution[]> {
    const provider = await this.provider();
    const out: (PlaceResolution | undefined)[] = [];
    const todo: { i: number; q: PlaceQuery }[] = [];
    for (const [i, q] of queries.entries()) {
      const choice = q.bookId ? await db.placeChoices.get(choiceKey(q.bookId, q.name)).catch(() => undefined) : undefined;
      if (choice) { out[i] = { status: 'HIGH', place: choice.place as HistoricalPlace, candidates: [], provider: provider.id, userChosen: true, fromCache: true }; continue; }
      const hit = await db.placeCache.get(cacheKey(q.name, q.date, provider.id)).catch(() => undefined);
      if (hit && Date.now() - hit.updatedAt < CACHE_DAYS * 86_400_000) { out[i] = { ...(hit.resolution as PlaceResolution), fromCache: true }; continue; }
      todo.push({ i, q });
    }
    if (todo.length) {
      let results: PlaceCandidate[][] | undefined;
      try {
        results = await provider.search(todo.map((t) => t.q), signal);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        for (const t of todo) out[t.i] = { status: 'UNRESOLVED', candidates: [], provider: provider.id, error: 'Historical place lookup unavailable. Try again.' };
      }
      if (results) {
        for (const [k, t] of todo.entries()) {
          const res = await this.decide(t.q, results[k] ?? [], provider);
          out[t.i] = res;
          await db.placeCache.put({ id: cacheKey(t.q.name, t.q.date, provider.id), placeId: res.place?.id, provider: provider.id, dateContext: t.q.date, resolution: res, updatedAt: Date.now() }).catch(() => {});
        }
      }
    }
    return out as PlaceResolution[];
  }

  /** Candidates for a name, without deciding (for "Not the right place?"). */
  async searchPlaces(name: string, signal?: AbortSignal): Promise<PlaceCandidate[]> {
    const provider = await this.provider();
    const [c] = await provider.search([{ name }], signal);
    return c ?? [];
  }

  async getPlace(id: string, signal?: AbortSignal): Promise<HistoricalPlace | undefined> {
    const [pid, ...rest] = id.split(':');
    const provider = this.providers.find((p) => p.id === pid);
    return provider?.get?.(rest.join(':'), signal);
  }

  /** Remember the reader's pick for this name in this book. */
  async choosePlace(q: PlaceQuery, place: HistoricalPlace): Promise<PlaceResolution> {
    const chosen = { ...place, matchedName: q.name, confidence: 'HIGH' as const };
    if (q.bookId) await db.placeChoices.put({ id: choiceKey(q.bookId, q.name), bookId: q.bookId, name: q.name, place: chosen, createdAt: Date.now() });
    return { status: 'HIGH', place: chosen, candidates: [], provider: place.source, userChosen: true };
  }

  async forgetChoice(bookId: string, name: string) {
    await db.placeChoices.delete(choiceKey(bookId, name));
  }

  /**
   * What the place belonged to at that year, where a dated source says so
   * (e.g. Rome, 218 BCE → Roman Republic). Empty when unknown — never guessed.
   */
  async getHistoricalContext(place: HistoricalPlace, year: number | undefined, signal?: AbortSignal): Promise<{ polities: string[]; source?: string }> {
    if (year === undefined) return { polities: [] };
    try {
      let qid = place.source === 'Wikidata' ? place.sourceId : undefined;
      if (!qid && place.latitude !== undefined) {
        // Find the same place on Wikidata (same name, within ~25 km) to read its dated statements.
        const [cands] = await wikidataProvider.search([{ name: place.canonicalName }], signal);
        qid = cands?.find((c) => c.place.latitude !== undefined && Math.abs(c.place.latitude - place.latitude!) < 0.25 && Math.abs(c.place.longitude! - place.longitude!) < 0.25)?.place.sourceId;
      }
      if (!qid) return { polities: [] };
      const polities = await wikidataContextAt(qid, year, signal);
      return { polities, source: polities.length ? 'Wikidata (dated “country” statements)' : undefined };
    } catch {
      return { polities: [] };
    }
  }

  getMapLocation(place: HistoricalPlace): MapView | undefined {
    return mapViewFor(place);
  }
}

/** Points for nearby names that are unambiguous on their own (one place, or all candidates together). */
function clearPoints(lists: PlaceCandidate[][]): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (const list of lists) {
    const located = list.filter((c) => c.place.latitude !== undefined && c.place.longitude !== undefined);
    if (!located.length) continue;
    const first = located[0].place;
    const together = located.every((c) => Math.abs(c.place.latitude! - first.latitude!) < 0.5 && Math.abs(c.place.longitude! - first.longitude!) < 0.5);
    if (together) out.push({ lat: first.latitude!, lon: first.longitude! });
  }
  return out;
}

function mergePlace(a: HistoricalPlace, b: HistoricalPlace): HistoricalPlace {
  return {
    ...a,
    geometry: b.geometry ?? a.geometry,
    boundingBox: b.boundingBox ?? a.boundingBox,
    alternativeNames: [...new Set([...a.alternativeNames, ...b.alternativeNames])].slice(0, 30),
    historicalStartYear: a.historicalStartYear ?? b.historicalStartYear,
    historicalEndYear: a.historicalEndYear ?? b.historicalEndYear,
    locationPrecision: b.geometry && b.geometry.type !== 'Point' ? 'extent' : a.locationPrecision,
    attribution: [...a.attribution, ...b.attribution.filter((x) => !a.attribution.some((y) => y.source === x.source))],
  };
}

export const historicalPlaces = new HistoricalPlaceService();
