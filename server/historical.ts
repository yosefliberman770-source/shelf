// World Historical Gazetteer proxy. The WHG token lives only here, in the
// WHG_API_TOKEN environment variable; the browser talks to /api/historical/*
// and never sees it. Follows WHG's documented API behaviour:
//   - POST /reconcile takes up to 50 queries per request (batch, don't loop)
//   - a per-query `gateway` object means "upstream didn't answer" → retry later, never "no match"
//   - 429 carries Retry-After; 4xx other than 429 is terminal (don't retry)
//   - /entity/place:{id}/api answers 451 for sources that forbid redistribution → respect it
// Docs: https://docs.whgazetteer.org/content/technical/apis.html

const WHG = process.env.WHG_BASE_URL ?? 'https://whgazetteer.org';
/** The Reconciliation Service version this code follows (GET /reconcile → "versions"), and the docs it was checked against. */
export const WHG_API = { service: 'WHG Reconciliation Service', version: '0.2', docs: 'https://docs.whgazetteer.org/content/technical/apis.html', checked: '2026-09-30' };
const USER_AGENT = process.env.WHG_USER_AGENT ?? 'Shelf-reading-app/1.0 (personal EPUB reader; https://github.com/yosefliberman770-source/shelf)';
export const WHG_BATCH = 50;
const TIMEOUT_MS = 15_000;

export class HistoricalError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function whgConfigured(): boolean {
  return !!process.env.WHG_API_TOKEN?.trim();
}

async function whgFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.WHG_API_TOKEN?.trim();
  if (!token) throw new HistoricalError('World Historical Gazetteer is not configured on this server.', 501);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${WHG}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
  } catch {
    throw new HistoricalError('Historical place lookup unavailable. Try again.', 503);
  } finally {
    clearTimeout(t);
  }
}

// ── Place search (reconciliation) ──────────────────────────────────────

export interface SearchQuery { name: string; limit?: number }

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
  attribution?: WireAttribution;
  /** Year spans from WHG's data extension (whg:temporal_years), when asked for and answered. No year 0. */
  timespans?: [number, number][];
  /** All names WHG holds for the place (whg:names_array), when asked for. */
  names?: string[];
}

/** A source's terms as WHG reports them. Tri-state flags: null = the rights holder states no position. */
export interface WireAttribution {
  source?: string;
  namespace?: string;
  license?: string;
  licenseLabel?: string;
  licenseUrl?: string;
  url?: string;
  citation?: string;
  redistributable?: boolean;
  permitsCommercial?: boolean | null;
  shareAlike?: boolean | null;
  attributionRequired?: boolean | null;
}

type RawCandidate = {
  id?: string; name?: string; alt_names?: string[]; description?: string; score?: number; match?: boolean; confidence?: number;
  has_geom?: boolean; namespace?: string; ccodes?: string[]; repr_point?: [number, number]; place_types?: unknown[];
};
type RawLicense = { spdx_id?: string; label?: string; url?: string; permits_commercial?: boolean | null; share_alike?: boolean | null; attribution_required?: boolean | null } | string | null;
type RawSource = { name?: string; source?: string; citation?: string; license?: RawLicense; license_url?: string; source_url?: string; url?: string; redistributable?: boolean };
/** Documented shape: { sources: { [namespace]: RawSource }, datasets: {…}, whg: {…} }. Older responses keyed sources directly by namespace. */
type RawAttribution = { sources?: Record<string, RawSource>; datasets?: Record<string, RawSource> } & Record<string, unknown>;

const tri = (v: unknown): boolean | null | undefined => (v === true || v === false || v === null ? v : undefined);

export function attributionFor(ns: string | undefined, attr: RawAttribution | undefined): WireAttribution | undefined {
  if (!ns) return undefined;
  const a = (attr?.sources?.[ns] ?? attr?.datasets?.[ns] ?? (attr?.[ns] as RawSource | undefined)) as RawSource | undefined;
  if (!a) return { source: ns, namespace: ns };
  const lic = a.license;
  const L = lic && typeof lic === 'object' ? lic : undefined;
  return {
    source: a.name ?? a.source ?? ns,
    namespace: ns,
    license: L?.spdx_id ?? (typeof lic === 'string' ? lic : undefined),
    licenseLabel: L?.label,
    licenseUrl: L?.url ?? a.license_url,
    url: a.source_url ?? a.url,
    citation: a.citation || undefined,
    redistributable: typeof a.redistributable === 'boolean' ? a.redistributable : undefined,
    permitsCommercial: tri(L?.permits_commercial),
    shareAlike: tri(L?.share_alike),
    attributionRequired: tri(L?.attribution_required),
  };
}

export function normaliseCandidate(c: RawCandidate, attr?: RawAttribution): WireCandidate | undefined {
  if (!c.id || !c.name) return undefined;
  const attribution = attributionFor(c.namespace, attr);
  // A source that forbids redistribution (WHG: redistributable = false): pass on only that a record
  // exists — its id, name and terms — never its other names, location or description.
  const restricted = attribution?.redistributable === false;
  const point = !restricted && Array.isArray(c.repr_point) && c.repr_point.length === 2 && c.repr_point.every((v) => typeof v === 'number') ? c.repr_point : undefined;
  return {
    id: c.id,
    name: c.name,
    altNames: restricted ? [] : (c.alt_names ?? []).filter((x) => typeof x === 'string').slice(0, 30),
    description: restricted ? undefined : c.description,
    score: typeof c.score === 'number' ? c.score : undefined,
    match: c.match === true,
    // "Absent" and "0" mean different things in WHG — keep absence as undefined.
    confidence: typeof c.confidence === 'number' && Number.isFinite(c.confidence) ? c.confidence : undefined,
    hasGeom: c.has_geom === true,
    namespace: c.namespace,
    ccodes: (c.ccodes ?? []).filter((x) => typeof x === 'string'),
    point,
    placeTypes: restricted ? [] : (c.place_types ?? []).map((t) => (typeof t === 'string' ? t : (t as { label?: string })?.label)).filter((x): x is string => !!x),
    attribution,
  };
}

/** Seconds until midnight UTC, when WHG's daily quota resets. */
const untilMidnightUtc = () => { const n = new Date(); return Math.max(60, Math.round((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime()) / 1000)); };

async function failFor(r: Response): Promise<never> {
  if (r.status === 429) throw new HistoricalError('Historical place lookup is busy. Try again shortly.', 503, Number(r.headers.get('retry-after')) || 30);
  if (r.status === 401) {
    // WHG answers 401 both for a bad token and for "Daily API limit (5000 calls) exceeded" (terminal until midnight UTC).
    const detail = String(((await r.json().catch(() => ({}))) as { detail?: unknown }).detail ?? '');
    if (/daily api limit/i.test(detail)) throw new HistoricalError('The World Historical Gazetteer daily limit has been reached. Try again after midnight UTC.', 503, untilMidnightUtc());
    throw new HistoricalError('The server’s World Historical Gazetteer access was refused (token invalid).', 502);
  }
  if (r.status === 403) throw new HistoricalError('The server’s World Historical Gazetteer access was refused.', 502);
  if (r.status >= 500) throw new HistoricalError('Historical place lookup unavailable. Try again.', 503, Number(r.headers.get('retry-after')) || undefined);
  throw new HistoricalError(`World Historical Gazetteer rejected the request (${r.status}).`, 502);
}

/** Pull year spans out of a data-extension value, whatever literal shape it comes in. ISO/astronomical years → no year 0. */
export function parseTemporal(values: unknown): [number, number][] {
  const fix = (y: number) => (y <= 0 ? y - 1 : y);
  const spans: [number, number][] = [];
  const singles: number[] = [];
  const visit = (v: unknown) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (typeof v === 'number' && Number.isFinite(v)) { singles.push(v); return; }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const lo = o.gte ?? o.start ?? o.earliest ?? o.from;
      const hi = o.lte ?? o.end ?? o.latest ?? o.to;
      if (lo !== undefined || hi !== undefined) {
        const a = Number(typeof lo === 'object' && lo ? ((lo as Record<string, unknown>).in ?? (lo as Record<string, unknown>).earliest) : lo);
        const b = Number(typeof hi === 'object' && hi ? ((hi as Record<string, unknown>).in ?? (hi as Record<string, unknown>).latest) : hi);
        if (Number.isFinite(a) || Number.isFinite(b)) spans.push([Number.isFinite(a) ? a : b, Number.isFinite(b) ? b : a]);
        return;
      }
      for (const k of ['str', 'int', 'float', 'name', 'value']) if (k in o) visit(o[k]);
      return;
    }
    if (typeof v === 'string') {
      const pairs = [...v.matchAll(/'?gte'?\s*:\s*(-?\d+)\s*,\s*'?lte'?\s*:\s*(-?\d+)/g)];
      if (pairs.length) { for (const m of pairs) spans.push([Number(m[1]), Number(m[2])]); return; }
      const range = /^\s*(-?\d{1,5})\s*(?:–|-|\/|to|\.\.)\s*(-?\d{1,5})\s*$/.exec(v);
      if (range) { spans.push([Number(range[1]), Number(range[2])]); return; }
      const n = /^\s*(-?\d{1,5})\s*$/.exec(v);
      if (n) singles.push(Number(n[1]));
    }
  };
  visit(values);
  if (!spans.length && singles.length) spans.push([Math.min(...singles), Math.max(...singles)]);
  return spans.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).map(([a, b]) => [fix(Math.min(a, b)), fix(Math.max(a, b))] as [number, number]).slice(0, 40);
}

/**
 * Ask WHG for the dates and full name lists of the candidates, in one data-extension
 * request (not one per place). Optional: if it fails, candidates keep no dates —
 * never invented ones.
 */
async function extendCandidates(ids: string[]): Promise<Map<string, { timespans?: [number, number][]; names?: string[] }>> {
  const out = new Map<string, { timespans?: [number, number][]; names?: string[] }>();
  if (!ids.length) return out;
  try {
    const r = await whgFetch('/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ extend: { ids, properties: [{ id: 'whg:temporal_years' }, { id: 'whg:names_array' }] } }) });
    if (!r.ok) return out;
    const j = (await r.json()) as { rows?: Record<string, Record<string, unknown>> };
    for (const [id, row] of Object.entries(j.rows ?? {})) {
      const spans = parseTemporal(row['whg:temporal_years']);
      const names = (Array.isArray(row['whg:names_array']) ? row['whg:names_array'] : []).flatMap((v) => (typeof v === 'string' ? [v] : typeof (v as { str?: unknown })?.str === 'string' ? [(v as { str: string }).str] : Array.isArray((v as { str?: unknown })?.str) ? ((v as { str: unknown[] }).str.filter((x) => typeof x === 'string') as string[]) : []));
      out.set(id, { timespans: spans.length ? spans : undefined, names: names.length ? [...new Set(names)].slice(0, 40) : undefined });
    }
  } catch {
    /* dates are optional evidence; their absence is reported as "not recorded", not as an error */
  }
  return out;
}

export async function placeSearch(queries: SearchQuery[], opts: { temporal?: boolean } = {}): Promise<{ results: ({ candidates: WireCandidate[] } | { error: string })[]; service: typeof WHG_API & { accessed: string; namespacesSearched?: string[] } }> {
  if (!Array.isArray(queries) || !queries.length) throw new HistoricalError('queries must be a non-empty array', 400);
  if (queries.length > WHG_BATCH) throw new HistoricalError(`At most ${WHG_BATCH} queries per request`, 400);
  const body: Record<string, { query: string; limit: number }> = {};
  queries.forEach((q, i) => {
    const name = String(q?.name ?? '').trim().slice(0, 200);
    if (!name) throw new HistoricalError('Every query needs a name', 400);
    body[`q${i}`] = { query: name, limit: Math.min(Math.max(Number(q.limit) || 8, 1), 20) };
  });
  const r = await whgFetch('/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries: body }) });
  if (!r.ok) await failFor(r);
  const json = (await r.json()) as Record<string, unknown> & { attribution?: RawAttribution };
  const attr = json.attribution;
  const searched = new Set<string>();
  const results = queries.map((_, i): { candidates: WireCandidate[] } | { error: string } => {
    const entry = json[`q${i}`] as { result?: RawCandidate[]; gateway?: { answered?: boolean }; namespaces_searched?: string[] } | undefined;
    // `gateway` present = upstream failure for this query. Not a miss; the client retries.
    if (!entry || entry.gateway) return { error: 'gateway' };
    entry.namespaces_searched?.forEach((n) => searched.add(n));
    return { candidates: (entry.result ?? []).map((c) => normaliseCandidate(c, attr)).filter((c): c is WireCandidate => !!c) };
  });
  if (opts.temporal) {
    // Dates only for sources that allow their records to be passed on.
    const ids = [...new Set(results.flatMap((x) => ('candidates' in x ? x.candidates.filter((c) => c.attribution?.redistributable !== false).map((c) => c.id) : [])))].slice(0, 200);
    const ext = await extendCandidates(ids);
    for (const x of results) if ('candidates' in x) for (const c of x.candidates) { const e = ext.get(c.id); if (e?.timespans) c.timespans = e.timespans; if (e?.names) c.names = e.names; }
  }
  return { results, service: { ...WHG_API, accessed: new Date().toISOString(), namespacesSearched: searched.size ? [...searched] : undefined } };
}

// ── Place retrieval (Linked Places Format) ─────────────────────────────

export interface WireFeature {
  id: string;
  title?: string;
  names: string[];
  geometry?: unknown;
  ccodes: string[];
  types: string[];
  start?: number;
  end?: number;
  description?: string;
  attribution?: WireAttribution;
  restricted?: { source?: string; url?: string; license?: string };
}

/** LPF / ISO 8601 years count a year 0 (= 1 BCE); the app doesn't. */
function isoYear(v: unknown): number | undefined {
  const m = /^(-?)(\d{1,6})/.exec(String(v ?? ''));
  if (!m) return undefined;
  const y = (m[1] ? -1 : 1) * Number(m[2]);
  return y <= 0 ? y - 1 : y;
}

type Lpf = {
  properties?: { title?: string; ccodes?: string[] };
  names?: { toponym?: string }[];
  types?: { label?: string; identifier?: string }[];
  geometry?: unknown;
  when?: { timespans?: { start?: Record<string, unknown>; end?: Record<string, unknown> }[] };
  descriptions?: { value?: string }[];
  attribution?: unknown;
};

export async function placeGet(rawId: string): Promise<WireFeature> {
  const id = String(rawId ?? '').replace(/^place:/, '');
  if (!/^[\w.:-]{1,120}$/.test(id)) throw new HistoricalError('Invalid place id', 400);
  const r = await whgFetch(`/entity/place:${encodeURIComponent(id).replace(/%3A/gi, ':')}/api`);
  if (r.status === 451) {
    // The source's licence doesn't allow WHG to hand over the record. Terminal; say where to get it.
    const j = (await r.json().catch(() => ({}))) as { source?: { name?: string; source_url?: string; license?: string } };
    return { id, names: [], ccodes: [], types: [], restricted: { source: j.source?.name, url: j.source?.source_url, license: j.source?.license } };
  }
  if (r.status === 404) throw new HistoricalError('Place not found', 404);
  if (r.status === 503 || r.status >= 500) throw new HistoricalError('Historical place lookup unavailable. Try again.', 503, Number(r.headers.get('retry-after')) || undefined);
  if (!r.ok) await failFor(r);
  const f = (await r.json()) as Lpf;
  const spans = f.when?.timespans ?? [];
  const starts = spans.map((s) => isoYear(s.start?.in ?? s.start?.earliest ?? s.start?.latest)).filter((x): x is number => x !== undefined);
  const ends = spans.map((s) => isoYear(s.end?.in ?? s.end?.latest ?? s.end?.earliest)).filter((x): x is number => x !== undefined);
  const a = (Array.isArray(f.attribution) ? f.attribution[0] : f.attribution) as Record<string, unknown> | undefined;
  return {
    id,
    title: f.properties?.title,
    names: [...new Set((f.names ?? []).map((n) => n.toponym).filter((x): x is string => !!x))].slice(0, 40),
    geometry: f.geometry ?? undefined,
    ccodes: f.properties?.ccodes ?? [],
    types: (f.types ?? []).map((t) => t.label ?? t.identifier).filter((x): x is string => !!x),
    start: starts.length ? Math.min(...starts) : undefined,
    end: ends.length ? Math.max(...ends) : undefined,
    description: f.descriptions?.[0]?.value,
    attribution: a ? {
      source: (a.name ?? a.source) as string | undefined,
      license: (a.license__spdx_id ?? (typeof a.license === 'string' ? a.license : undefined)) as string | undefined,
      licenseUrl: (a.license__url ?? a.license_url) as string | undefined,
      url: (a.source_url ?? a.url) as string | undefined,
      redistributable: typeof a.redistributable === 'boolean' ? a.redistributable : undefined,
      permitsCommercial: tri(a.license__permits_commercial),
      shareAlike: tri(a.license__share_alike),
      attributionRequired: tri(a.license__attribution_required),
    } : undefined,
  };
}

// ── Protecting the server's daily WHG allowance ────────────────────────

const buckets = new Map<string, { tokens: number; at: number }>();
/** Allow ~200 place queries per minute per client address. */
export function allowQueries(client: string, n: number): boolean {
  const now = Date.now();
  const b = buckets.get(client) ?? { tokens: 200, at: now };
  b.tokens = Math.min(200, b.tokens + ((now - b.at) / 60_000) * 200);
  b.at = now;
  if (b.tokens < n) { buckets.set(client, b); return false; }
  b.tokens -= n;
  buckets.set(client, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}
