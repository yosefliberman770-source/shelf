// World Historical Gazetteer proxy. The WHG token lives only here, in the
// WHG_API_TOKEN environment variable; the browser talks to /api/historical/*
// and never sees it. Follows WHG's documented API behaviour:
//   - POST /reconcile takes up to 50 queries per request (batch, don't loop)
//   - a per-query `gateway` object means "upstream didn't answer" → retry later, never "no match"
//   - 429 carries Retry-After; 4xx other than 429 is terminal (don't retry)
//   - /entity/place:{id}/api answers 451 for sources that forbid redistribution → respect it
// Docs: https://docs.whgazetteer.org/content/technical/apis.html

const WHG = process.env.WHG_BASE_URL ?? 'https://whgazetteer.org';
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
  attribution?: { source?: string; license?: string; licenseUrl?: string; url?: string; redistributable?: boolean };
}

type RawCandidate = {
  id?: string; name?: string; alt_names?: string[]; description?: string; score?: number; match?: boolean; confidence?: number;
  has_geom?: boolean; namespace?: string; ccodes?: string[]; repr_point?: [number, number]; place_types?: unknown[];
};
type RawAttribution = Record<string, { name?: string; source?: string; license?: string; license_url?: string; source_url?: string; url?: string; redistributable?: boolean }>;

function attributionFor(ns: string | undefined, attr: RawAttribution | undefined): WireCandidate['attribution'] {
  const a = ns ? attr?.[ns] : undefined;
  if (!a) return ns ? { source: ns } : undefined;
  return { source: a.name ?? a.source ?? ns, license: a.license, licenseUrl: a.license_url, url: a.source_url ?? a.url, redistributable: a.redistributable };
}

export function normaliseCandidate(c: RawCandidate, attr?: RawAttribution): WireCandidate | undefined {
  if (!c.id || !c.name) return undefined;
  const point = Array.isArray(c.repr_point) && c.repr_point.length === 2 && c.repr_point.every((v) => typeof v === 'number') ? c.repr_point : undefined;
  return {
    id: c.id,
    name: c.name,
    altNames: (c.alt_names ?? []).filter((x) => typeof x === 'string').slice(0, 30),
    description: c.description,
    score: typeof c.score === 'number' ? c.score : undefined,
    match: c.match === true,
    // "Absent" and "0" mean different things in WHG — keep absence as undefined.
    confidence: typeof c.confidence === 'number' && Number.isFinite(c.confidence) ? c.confidence : undefined,
    hasGeom: c.has_geom === true,
    namespace: c.namespace,
    ccodes: (c.ccodes ?? []).filter((x) => typeof x === 'string'),
    point,
    placeTypes: (c.place_types ?? []).map((t) => (typeof t === 'string' ? t : (t as { label?: string })?.label)).filter((x): x is string => !!x),
    attribution: attributionFor(c.namespace, attr),
  };
}

export async function placeSearch(queries: SearchQuery[]): Promise<{ results: ({ candidates: WireCandidate[] } | { error: string })[] }> {
  if (!Array.isArray(queries) || !queries.length) throw new HistoricalError('queries must be a non-empty array', 400);
  if (queries.length > WHG_BATCH) throw new HistoricalError(`At most ${WHG_BATCH} queries per request`, 400);
  const body: Record<string, { query: string; limit: number }> = {};
  queries.forEach((q, i) => {
    const name = String(q?.name ?? '').trim().slice(0, 200);
    if (!name) throw new HistoricalError('Every query needs a name', 400);
    body[`q${i}`] = { query: name, limit: Math.min(Math.max(Number(q.limit) || 8, 1), 20) };
  });
  const r = await whgFetch('/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries: body }) });
  if (r.status === 429) throw new HistoricalError('Historical place lookup is busy. Try again shortly.', 503, Number(r.headers.get('retry-after')) || 30);
  if (r.status === 401 || r.status === 403) throw new HistoricalError('The server’s World Historical Gazetteer access was refused (token invalid or daily limit reached).', 502);
  if (r.status >= 500) throw new HistoricalError('Historical place lookup unavailable. Try again.', 503, Number(r.headers.get('retry-after')) || undefined);
  if (!r.ok) throw new HistoricalError(`World Historical Gazetteer rejected the request (${r.status}).`, 502);
  const json = (await r.json()) as Record<string, unknown> & { attribution?: RawAttribution };
  const attr = json.attribution;
  return {
    results: queries.map((_, i) => {
      const entry = json[`q${i}`] as { result?: RawCandidate[]; gateway?: { answered?: boolean } } | undefined;
      // `gateway` present = upstream failure for this query. Not a miss; the client retries.
      if (!entry || entry.gateway) return { error: 'gateway' };
      return { candidates: (entry.result ?? []).map((c) => normaliseCandidate(c, attr)).filter((c): c is WireCandidate => !!c) };
    }),
  };
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
  attribution?: WireCandidate['attribution'];
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
  if (!r.ok) throw new HistoricalError(`World Historical Gazetteer rejected the request (${r.status}).`, 502);
  const f = (await r.json()) as Lpf;
  const spans = f.when?.timespans ?? [];
  const starts = spans.map((s) => isoYear(s.start?.in ?? s.start?.earliest ?? s.start?.latest)).filter((x): x is number => x !== undefined);
  const ends = spans.map((s) => isoYear(s.end?.in ?? s.end?.latest ?? s.end?.earliest)).filter((x): x is number => x !== undefined);
  const attr = Array.isArray(f.attribution) ? (f.attribution[0] as { name?: string; license?: string; url?: string } | undefined) : (f.attribution as { name?: string; license?: string; url?: string } | undefined);
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
    attribution: attr ? { source: attr.name, license: attr.license, url: attr.url } : undefined,
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
