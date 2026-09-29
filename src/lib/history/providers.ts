// Place providers. WHG is reached only through Shelf's own server (the token
// never reaches the browser). Wikidata needs no key and is the fallback when
// no Shelf server with WHG access is available — e.g. on GitHub Pages.
import { bboxOf } from './geometry';
import type { Attribution, Geometry, HistoricalPlace, PlaceCandidate, PlaceProvider, PlaceQuery } from './types';

// ── Where Shelf's server lives ─────────────────────────────────────────

const API_KEY = 'shelf.historyApi';

/** Base URL of a Shelf server ("" = same site). Set in Settings when the app is hosted elsewhere. */
export function historyApiBase(): string {
  try { return (localStorage.getItem(API_KEY) ?? '').replace(/\/+$/, ''); } catch { return ''; }
}
export function setHistoryApiBase(url: string) {
  try { if (url.trim()) localStorage.setItem(API_KEY, url.trim()); else localStorage.removeItem(API_KEY); } catch { /* ignore */ }
  statusCache = undefined;
}

let statusCache: { at: number; value: Promise<{ whg: boolean }> } | undefined;
/** Is a Shelf server with WHG configured reachable? (Cached for 5 minutes.) */
export function historyServerStatus(): Promise<{ whg: boolean }> {
  if (!statusCache || Date.now() - statusCache.at > 5 * 60_000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    statusCache = {
      at: Date.now(),
      value: fetch(`${historyApiBase()}/api/historical/status`, { signal: ctrl.signal })
        .then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as { whg?: boolean }) : {}))
        .then((j) => ({ whg: !!j.whg }))
        .catch(() => ({ whg: false }))
        .finally(() => clearTimeout(t)),
    };
  }
  return statusCache.value;
}

// ── World Historical Gazetteer (via Shelf's server) ────────────────────

/** Candidate shape returned by server/historical.ts. */
export interface WireCandidate {
  id: string;
  name: string;
  altNames: string[];
  description?: string;
  score?: number;
  match?: boolean;
  confidence?: number;
  hasGeom?: boolean;
  namespace?: string;
  ccodes: string[];
  point?: [number, number];
  placeTypes: string[];
  attribution?: { source?: string; license?: string; licenseUrl?: string; url?: string; redistributable?: boolean };
}

export interface WireFeature {
  id: string;
  title?: string;
  names: string[];
  geometry?: Geometry;
  ccodes: string[];
  types: string[];
  start?: number;
  end?: number;
  description?: string;
  attribution?: WireCandidate['attribution'];
  /** Set when the source doesn't permit redistribution (HTTP 451 upstream). */
  restricted?: { source?: string; url?: string; license?: string };
}

export class ProviderUnavailable extends Error {}

const WHG_ATTR: Attribution = { source: 'World Historical Gazetteer', url: 'https://whgazetteer.org/' };

function whgPlace(c: WireCandidate, name: string): HistoricalPlace {
  const underlying: Attribution | undefined = c.attribution?.source ? { source: c.attribution.source, license: c.attribution.license, licenseUrl: c.attribution.licenseUrl, url: c.attribution.url, redistributable: c.attribution.redistributable } : undefined;
  return {
    id: `whg:${c.id}`,
    canonicalName: c.name,
    matchedName: name,
    alternativeNames: c.altNames ?? [],
    longitude: c.point?.[0],
    latitude: c.point?.[1],
    locationPrecision: c.point ? (c.hasGeom ? 'extent' : 'exact') : 'unknown',
    placeType: c.placeTypes?.[0],
    description: c.description,
    countryCodes: c.ccodes ?? [],
    source: 'World Historical Gazetteer',
    sourceId: c.id,
    confidence: 'UNRESOLVED',
    attribution: underlying ? [WHG_ATTR, underlying] : [WHG_ATTR],
    url: `https://whgazetteer.org/entity/${c.id.startsWith('place:') ? c.id : `place:${c.id}`}/`,
  };
}

export const whgProvider: PlaceProvider = {
  id: 'whg',
  name: 'World Historical Gazetteer',
  async available() { return (await historyServerStatus()).whg; },
  async search(queries, signal) {
    const out: PlaceCandidate[][] = [];
    // WHG takes up to 50 queries per request; our server enforces the same.
    for (let i = 0; i < queries.length; i += 50) {
      const batch = queries.slice(i, i + 50);
      let r: Response;
      try {
        r = await fetch(`${historyApiBase()}/api/historical/place-search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ queries: batch.map((q) => ({ name: q.name, limit: 8 })) }),
          signal,
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        throw new ProviderUnavailable('Historical place lookup unavailable. Try again.');
      }
      if (!r.ok) throw new ProviderUnavailable(r.status === 503 || r.status === 502 || r.status === 429 ? 'Historical place lookup unavailable. Try again.' : `Historical place lookup failed (${r.status}).`);
      const j = (await r.json()) as { results: ({ candidates: WireCandidate[] } | { error: string })[] };
      j.results.forEach((res, k) => {
        if ('error' in res) throw new ProviderUnavailable('Historical place lookup unavailable. Try again.');
        out.push(res.candidates.map((c) => ({ place: whgPlace(c, batch[k].name), score: c.score, nameConfidence: c.confidence, exactName: c.match })));
      });
    }
    return out;
  },
  async get(sourceId, signal) {
    const r = await fetch(`${historyApiBase()}/api/historical/place?id=${encodeURIComponent(sourceId)}`, { signal }).catch(() => undefined);
    if (!r || !r.ok) return undefined;
    const f = (await r.json()) as WireFeature;
    if (f.restricted) return undefined;
    const box = f.geometry ? bboxOf(f.geometry) : undefined;
    return {
      id: `whg:${f.id}`,
      canonicalName: f.title ?? f.names[0] ?? f.id,
      matchedName: f.title ?? '',
      alternativeNames: f.names,
      geometry: f.geometry,
      boundingBox: box,
      latitude: box ? (box[1] + box[3]) / 2 : undefined,
      longitude: box ? (box[0] + box[2]) / 2 : undefined,
      locationPrecision: f.geometry ? (f.geometry.type === 'Point' ? 'exact' : 'extent') : 'unknown',
      placeType: f.types[0],
      description: f.description,
      countryCodes: f.ccodes,
      historicalStartYear: f.start,
      historicalEndYear: f.end,
      source: 'World Historical Gazetteer',
      sourceId: f.id,
      confidence: 'UNRESOLVED',
      attribution: [WHG_ATTR, ...(f.attribution?.source ? [{ source: f.attribution.source, license: f.attribution.license, licenseUrl: f.attribution.licenseUrl, url: f.attribution.url }] : [])],
    };
  },
};

// ── Wikidata (keyless fallback) ────────────────────────────────────────

const WD = 'https://www.wikidata.org/w/api.php';
const WD_ATTR: Attribution = { source: 'Wikidata', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', url: 'https://www.wikidata.org/' };

type WdClaim = { mainsnak: { datavalue?: { value: unknown } }; qualifiers?: Record<string, { datavalue?: { value: unknown } }[]>; rank?: string };
interface WdEntity { id: string; labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; claims?: Record<string, WdClaim[]>; sitelinks?: Record<string, unknown> }

function wdYear(v: unknown): number | undefined {
  const t = (v as { time?: string } | undefined)?.time;
  const m = t ? /^([+-])(\d+)-/.exec(t) : null;
  if (!m) return undefined;
  const y = (m[1] === '-' ? -1 : 1) * Number(m[2]);
  return y === 0 ? undefined : y; // Wikidata uses historical numbering (no year 0) for BCE
}

async function wdEntities(ids: string[], signal?: AbortSignal): Promise<WdEntity[]> {
  if (!ids.length) return [];
  const r = await fetch(`${WD}?action=wbgetentities&ids=${ids.join('|')}&props=labels|descriptions|aliases|claims|sitelinks&languages=en&format=json&origin=*`, { signal });
  if (!r.ok) throw new ProviderUnavailable('Place lookup unavailable. Try again.');
  const j = (await r.json()) as { entities: Record<string, WdEntity> };
  return ids.map((id) => j.entities[id]).filter(Boolean);
}

function wdPlace(e: WdEntity, name: string): HistoricalPlace | undefined {
  const c = e.claims ?? {};
  const coord = c.P625?.[0]?.mainsnak.datavalue?.value as { latitude: number; longitude: number } | undefined;
  if (!coord) return undefined;
  const label = e.labels?.en?.value ?? e.id;
  return {
    id: `wikidata:${e.id}`,
    canonicalName: label,
    matchedName: name,
    alternativeNames: (e.aliases?.en ?? []).map((a) => a.value).slice(0, 20),
    latitude: coord.latitude,
    longitude: coord.longitude,
    locationPrecision: 'approximate',
    placeType: e.descriptions?.en?.value,
    description: e.descriptions?.en?.value,
    countryCodes: [],
    historicalStartYear: wdYear(c.P571?.[0]?.mainsnak.datavalue?.value) ?? wdYear(c.P580?.[0]?.mainsnak.datavalue?.value),
    historicalEndYear: wdYear(c.P576?.[0]?.mainsnak.datavalue?.value) ?? wdYear(c.P582?.[0]?.mainsnak.datavalue?.value),
    source: 'Wikidata',
    sourceId: e.id,
    confidence: 'UNRESOLVED',
    attribution: [WD_ATTR],
    url: `https://www.wikidata.org/wiki/${e.id}`,
  };
}

/** How well-known an entity is (number of Wikipedia editions), for tie-breaking. */
export const wikidataProminence = new Map<string, number>();

export const wikidataProvider: PlaceProvider = {
  id: 'wikidata',
  name: 'Wikidata',
  async available() { return typeof navigator === 'undefined' || navigator.onLine !== false; },
  async search(queries, signal) {
    const out: PlaceCandidate[][] = [];
    for (const q of queries) {
      const r = await fetch(`${WD}?action=wbsearchentities&search=${encodeURIComponent(q.name)}&language=en&uselang=en&type=item&limit=10&format=json&origin=*`, { signal }).catch((e) => { if ((e as Error).name === 'AbortError') throw e; throw new ProviderUnavailable('Place lookup unavailable. Try again.'); });
      if (!r.ok) throw new ProviderUnavailable('Place lookup unavailable. Try again.');
      const hits = ((await r.json()) as { search?: { id: string; match?: { type?: string; text?: string } }[] }).search ?? [];
      const ents = await wdEntities(hits.map((h) => h.id), signal);
      const cands: PlaceCandidate[] = [];
      for (const e of ents) {
        const p = wdPlace(e, q.name);
        if (!p) continue;
        wikidataProminence.set(p.id, Object.keys(e.sitelinks ?? {}).length);
        const exact = [p.canonicalName, ...p.alternativeNames].some((n) => n.toLowerCase() === q.name.toLowerCase());
        cands.push({ place: p, exactName: exact });
      }
      out.push(cands);
    }
    return out;
  },
  async get(sourceId, signal) {
    const [e] = await wdEntities([sourceId], signal);
    return e ? wdPlace(e, '') : undefined;
  },
};

/**
 * "Historical context": which state a place belonged to at a given year, from
 * Wikidata's dated "country" statements. Returns nothing rather than guessing.
 */
export async function wikidataContextAt(qid: string, year: number, signal?: AbortSignal): Promise<string[]> {
  const [e] = await wdEntities([qid], signal);
  const claims = e?.claims?.P17 ?? [];
  const ids: string[] = [];
  for (const cl of claims) {
    const id = (cl.mainsnak.datavalue?.value as { id?: string } | undefined)?.id;
    const s = wdYear(cl.qualifiers?.P580?.[0]?.datavalue?.value);
    const en = wdYear(cl.qualifiers?.P582?.[0]?.datavalue?.value);
    if (!id || (s === undefined && en === undefined)) continue; // undated statements say nothing about this year
    if ((s === undefined || s <= year) && (en === undefined || year <= en)) ids.push(id);
  }
  if (!ids.length) return [];
  const labels = await wdEntities(ids.slice(0, 3), signal);
  return labels.map((x) => x.labels?.en?.value).filter((x): x is string => !!x);
}

export const PLACE_PROVIDERS: PlaceProvider[] = [whgProvider, wikidataProvider];

export type { PlaceQuery };
