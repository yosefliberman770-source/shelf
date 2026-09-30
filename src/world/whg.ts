// World Historical Gazetteer as an external reconciliation source.
//
// WHG is not downloaded: a place name read in a book is looked up when it is
// needed, and the answer is cached on the device so re-reading or re-analysing
// a book doesn't query WHG again. Every record keeps where it came from — WHG
// id, contributing source (namespace or dataset), names, location, dates, type,
// licence, links — and is treated as a *candidate attestation*, never as the
// identification itself (see placeEvidence.ts, which weighs it against the
// offline gazetteers).
//
// Two routes, chosen automatically:
//   • "reconcile": WHG's Reconciliation Service API (v0.2), through Shelf's own
//     server, which holds the WHG token (never the browser). Batched up to 50
//     names per request; dates come from WHG's data extension.
//   • "index": WHG's public place-index search (no token, CORS open) — used when
//     no Shelf server with a token is available, e.g. on GitHub Pages.
//
// Sources whose licence forbids redistribution (WHG: redistributable = false)
// are kept only as a stub — id, name, source, licence and a link to the source —
// never their names, coordinates or dates.
//
// Failures (offline, timeout, rate limit, daily quota, upstream gateway) give
// status "unavailable" and are never cached, and never read as "no such place".
import { db } from '../db/db';
import { norm } from '../lib/history/assess';
import { historyApiBase, historyServerStatus } from '../lib/history/providers';

export const WHG_BASE = 'https://whgazetteer.org';
export const WHG_DOCS = 'https://docs.whgazetteer.org/content/technical/apis.html';
/** WHG's own licence for the index it publishes. Each source has its own on top. */
export const WHG_LICENCE: WhgLicence = { spdx: 'CC-BY-NC-4.0', label: 'Creative Commons Attribution-NonCommercial 4.0 International', url: 'https://creativecommons.org/licenses/by-nc/4.0/' };

const TTL_DAYS = 30;
const TIMEOUT_MS = 12_000;
const CACHE_VERSION = 'v2';

export interface WhgLicence {
  spdx?: string;
  label?: string;
  url?: string;
  /** null = the rights holder states no position (not the same as "no"). */
  commercial?: boolean | null;
  shareAlike?: boolean | null;
  attributionRequired?: boolean | null;
}

export interface WhgAttestation {
  /** WHG id, e.g. "place:gn:745044" (reconcile) or "index:5077835" (public index). */
  whgId: string;
  title: string;
  /** Historical names / toponyms WHG holds for this record. */
  names: string[];
  /** [lon, lat] */
  point?: [number, number];
  /** Year spans the source attests (no year 0; negative = BCE). Empty = not dated. */
  timespans: [number, number][];
  types: string[];
  ccodes: string[];
  /** Source namespace (reconcile: gn, tgn, wd, pl, ohm…) or contributed dataset label (index). */
  namespace?: string;
  /** Human name of the contributing source. */
  source: string;
  licence?: WhgLicence;
  /** WHG's own statement: may this source's records be passed on? undefined = not stated. */
  redistributable?: boolean;
  /** Source forbids redistribution: names, location and dates withheld. */
  restricted?: boolean;
  links: { whg?: string; api?: string; original?: string; closeMatch?: string[] };
  /** WHG's relative ranking within one query (0–100). */
  score?: number;
  /** WHG's absolute name-match quality (0–100); undefined when WHG didn't measure it. */
  confidence?: number;
  exactMatch?: boolean;
  /** Public index: a "parent" record groups the "child" records WHG considers the same place. */
  role?: 'parent' | 'child';
  groupId?: string;
  via: 'reconcile' | 'index';
}

export type WhgStatus = 'ok' | 'unavailable' | 'not-configured';

export interface WhgLookup {
  name: string;
  status: WhgStatus;
  attestations: WhgAttestation[];
  /** When WHG was asked (ISO); for a cached answer, when it was first asked. */
  accessed: string;
  /** Which API answered, and its version. */
  api: string;
  route?: 'reconcile' | 'index';
  fromCache?: boolean;
  error?: string;
  /** Seconds to wait before asking again (rate limit / daily quota). */
  retryAfter?: number;
}

export interface WhgOptions {
  signal?: AbortSignal;
  /** Force a route (tests, settings). Default: reconcile when Shelf's server has a WHG token, else the public index. */
  route?: 'reconcile' | 'index';
  /** Skip the cache for this lookup. */
  refresh?: boolean;
}

// ── Cooling off after a rate limit or quota answer ─────────────────────────
let coolUntil = 0;
export function resetWhgCooldown() { coolUntil = 0; }

class WhgUnavailable extends Error {
  retryAfter?: number;
  constructor(message: string, retryAfter?: number) { super(message); this.retryAfter = retryAfter; }
}

async function timedFetch(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new WhgUnavailable(ctrl.signal.aborted ? 'World Historical Gazetteer took too long to answer.' : 'World Historical Gazetteer couldn’t be reached.');
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

function checkStatus(r: Response): void {
  if (r.ok) return;
  const retry = Number(r.headers.get('retry-after')) || undefined;
  if (r.status === 429 || r.status === 503 || r.status === 502 || r.status === 504) {
    if (retry) coolUntil = Date.now() + retry * 1000;
    throw new WhgUnavailable(r.status === 429 ? 'World Historical Gazetteer is busy (rate limit).' : 'World Historical Gazetteer is unavailable right now.', retry);
  }
  if (r.status === 501) throw new WhgUnavailable('not-configured');
  throw new WhgUnavailable(`World Historical Gazetteer answered ${r.status}.`);
}

// ── Normalising what WHG returns ───────────────────────────────────────────

/** Withhold a record's content when its source forbids redistribution. */
function guard(a: WhgAttestation): WhgAttestation {
  if (a.redistributable !== false) return a;
  return { ...a, names: [], point: undefined, timespans: [], types: [], restricted: true };
}

const entityUrl = (id: string) => `${WHG_BASE}/entity/${id.startsWith('place:') ? id : `place:${id}`}/`;

/** Candidate shape returned by server/historical.ts (placeSearch). */
interface WireCandidate {
  id: string; name: string; altNames?: string[]; description?: string; score?: number; match?: boolean; confidence?: number;
  namespace?: string; ccodes?: string[]; point?: [number, number]; placeTypes?: string[]; timespans?: [number, number][]; names?: string[];
  attribution?: { source?: string; namespace?: string; license?: string; licenseLabel?: string; licenseUrl?: string; url?: string; redistributable?: boolean; permitsCommercial?: boolean | null; shareAlike?: boolean | null; attributionRequired?: boolean | null };
}

export function fromReconcile(c: WireCandidate): WhgAttestation {
  const at = c.attribution;
  return guard({
    whgId: c.id,
    title: c.name,
    names: [...new Set([c.name, ...(c.altNames ?? []), ...(c.names ?? [])].filter(Boolean))].slice(0, 40),
    point: c.point,
    timespans: c.timespans ?? [],
    types: c.placeTypes ?? [],
    ccodes: c.ccodes ?? [],
    namespace: c.namespace,
    source: at?.source ?? c.namespace ?? 'World Historical Gazetteer',
    licence: at && (at.license || at.licenseUrl) ? { spdx: at.license, label: at.licenseLabel, url: at.licenseUrl, commercial: at.permitsCommercial, shareAlike: at.shareAlike, attributionRequired: at.attributionRequired } : undefined,
    redistributable: at?.redistributable,
    links: { whg: entityUrl(c.id), api: `${entityUrl(c.id)}api`, original: at?.url },
    score: c.score, confidence: c.confidence, exactMatch: c.match,
    via: 'reconcile',
  });
}

type IndexGeometry = { type: string; coordinates?: unknown; geometries?: IndexGeometry[] };
interface IndexFeature { geometry?: IndexGeometry; properties: Record<string, unknown> }
interface IndexResponse {
  features?: IndexFeature[];
  attribution?: { datasets?: Record<string, { name?: string; citation?: string; rights_holder?: string; source_url?: string; license?: unknown; redistributable?: boolean }>; sources?: Record<string, { name?: string; source_url?: string; license?: { spdx_id?: string; url?: string } | null; redistributable?: boolean }> };
}

function firstPoint(g?: IndexGeometry): [number, number] | undefined {
  if (!g) return undefined;
  if (g.type === 'Point' && Array.isArray(g.coordinates)) return g.coordinates as [number, number];
  if (g.type === 'MultiPoint' && Array.isArray(g.coordinates)) return (g.coordinates as [number, number][])[0];
  for (const x of g.geometries ?? []) { const p = firstPoint(x); if (p) return p; }
  return undefined;
}
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? (v.match(/'([^']*)'/g) ?? []).map((x) => x.slice(1, -1)) : []);
function spansOf(v: unknown): [number, number][] {
  const raw: [number, number][] = Array.isArray(v)
    ? (v as { gte?: number; lte?: number }[]).filter((t) => typeof t?.gte === 'number' || typeof t?.lte === 'number').map((t) => [t.gte ?? t.lte!, t.lte ?? t.gte!] as [number, number])
    : typeof v === 'string' ? [...v.matchAll(/'gte':\s*(-?\d+),\s*'lte':\s*(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]) : [];
  // The index stores astronomical years (0 = 1 BCE); the app has no year 0.
  const fix = (y: number) => (y <= 0 ? y - 1 : y);
  const seen = new Set<string>();
  return raw.map(([a, b]) => [fix(Math.min(a, b)), fix(Math.max(a, b))] as [number, number]).filter((s) => !seen.has(s.join()) && (seen.add(s.join()), true)).sort((a, b) => a[0] - b[0]).slice(0, 40);
}

export function fromIndex(d: IndexResponse): WhgAttestation[] {
  const datasets = d.attribution?.datasets ?? {};
  return (d.features ?? []).map((f) => {
    const p = f.properties;
    const ds = String(p.dataset ?? '');
    const meta = datasets[ds];
    const role = p.index_role === 'parent' ? 'parent' : p.index_role === 'child' ? 'child' : undefined;
    const links = (Array.isArray(p.links) ? p.links : []) as { identifier?: string; type?: string }[];
    const close = links.filter((l) => l.identifier && /close|exact/i.test(l.type ?? '')).map((l) => String(l.identifier));
    const lic = meta?.license;
    return guard({
      whgId: `index:${p.place_id ?? p.index_id}`,
      title: String(p.title ?? ''),
      names: [...new Set([String(p.title ?? ''), ...listOf(p.variants)].filter(Boolean))].slice(0, 40),
      point: firstPoint(f.geometry),
      timespans: spansOf(p.timespans),
      types: listOf(p.placetypes),
      ccodes: listOf(p.ccodes).filter(Boolean),
      namespace: ds || undefined,
      source: meta?.name ?? (ds || 'World Historical Gazetteer'),
      licence: lic && typeof lic === 'object' ? { spdx: (lic as { spdx_id?: string }).spdx_id, url: (lic as { url?: string }).url } : typeof lic === 'string' ? { spdx: lic } : undefined,
      redistributable: typeof meta?.redistributable === 'boolean' ? meta.redistributable : undefined,
      links: { whg: close[0] ? entityUrl(close[0]) : undefined, api: close[0] ? `${entityUrl(close[0])}api` : undefined, original: meta?.source_url || undefined, closeMatch: close.length ? close : undefined },
      role,
      // Parents and their children share a group, so the same place isn't counted twice.
      groupId: role === 'parent' ? String(p.place_id ?? p.index_id) : undefined,
      via: 'index' as const,
      _children: Array.isArray(p.child_place_ids) ? (p.child_place_ids as unknown[]).map(String) : undefined,
    } as WhgAttestation & { _children?: string[] });
  }).map((a, _i, all) => {
    // Children name their parent group.
    const own = (a as WhgAttestation & { _children?: string[] });
    if (own.role === 'child') {
      const pid = own.whgId.replace('index:', '');
      const parent = all.find((x) => (x as WhgAttestation & { _children?: string[] })._children?.includes(pid));
      if (parent) own.groupId = parent.groupId;
    }
    return own;
  }).map(({ _children: _drop, ...a }: WhgAttestation & { _children?: string[] }) => a);
}

// ── Cache ──────────────────────────────────────────────────────────────────

const cacheKey = (route: string, name: string) => `whg:${CACHE_VERSION}:${route}:${norm(name)}`;

async function fromCache(route: string, name: string): Promise<WhgLookup | undefined> {
  const hit = await db.worldCache.get(cacheKey(route, name)).catch(() => undefined);
  if (hit && Date.now() - hit.at < TTL_DAYS * 86_400_000) return { ...(hit.data as WhgLookup), fromCache: true };
  return undefined;
}
async function toCache(route: string, l: WhgLookup) {
  // Only successful answers; restricted records are already reduced to stubs.
  if (l.status !== 'ok') return;
  await db.worldCache.put({ id: cacheKey(route, l.name), data: { ...l, fromCache: undefined }, at: Date.now() }).catch(() => {});
}

// ── Lookups ────────────────────────────────────────────────────────────────

async function chooseRoute(opts: WhgOptions): Promise<'reconcile' | 'index'> {
  if (opts.route) return opts.route;
  return (await historyServerStatus().catch(() => ({ whg: false }))).whg ? 'reconcile' : 'index';
}

const INDEX_API = 'WHG public place index (/api/index/)';
const RECONCILE_API = 'WHG Reconciliation Service API v0.2 (via Shelf’s server)';

async function viaIndex(name: string, signal?: AbortSignal): Promise<WhgLookup> {
  const url = `${WHG_BASE}/api/index/?name=${encodeURIComponent(name)}`;
  const r = await timedFetch(url, { headers: { Accept: 'application/json' } }, signal);
  checkStatus(r);
  const text = await r.text();
  let d: IndexResponse;
  try { d = JSON.parse(text) as IndexResponse; } catch { throw new WhgUnavailable('World Historical Gazetteer answered with something other than data (it may be busy).'); }
  return { name, status: 'ok', attestations: fromIndex(d), accessed: new Date().toISOString(), api: INDEX_API, route: 'index' };
}

async function viaReconcile(names: string[], signal?: AbortSignal): Promise<WhgLookup[]> {
  const out: WhgLookup[] = [];
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const r = await timedFetch(`${historyApiBase()}/api/historical/place-search`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries: batch.map((name) => ({ name, limit: 10 })), temporal: true }),
    }, signal);
    checkStatus(r);
    const j = (await r.json()) as { results: ({ candidates: WireCandidate[] } | { error: string })[]; service?: { version?: string; accessed?: string } };
    const accessed = j.service?.accessed ?? new Date().toISOString();
    const api = j.service?.version ? `WHG Reconciliation Service API v${j.service.version} (via Shelf’s server)` : RECONCILE_API;
    batch.forEach((name, k) => {
      const res = j.results?.[k];
      if (!res || 'error' in res) out.push({ name, status: 'unavailable', attestations: [], accessed, api, route: 'reconcile', error: 'World Historical Gazetteer’s upstream source didn’t answer. Try again later.' });
      else out.push({ name, status: 'ok', attestations: res.candidates.map(fromReconcile), accessed, api, route: 'reconcile' });
    });
  }
  return out;
}

/** Look up several names at once (batched, cached). Never throws for WHG trouble — returns status "unavailable". */
export async function whgLookupMany(names: string[], opts: WhgOptions = {}): Promise<Map<string, WhgLookup>> {
  const out = new Map<string, WhgLookup>();
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const route = await chooseRoute(opts);
  const todo: string[] = [];
  for (const n of wanted) {
    const hit = opts.refresh ? undefined : await fromCache(route, n);
    if (hit) out.set(n, hit); else todo.push(n);
  }
  if (!todo.length) return out;
  const api = route === 'reconcile' ? RECONCILE_API : INDEX_API;
  const unavailable = (name: string, e: unknown): WhgLookup => {
    if ((e as Error)?.name === 'AbortError') throw e;
    const w = e instanceof WhgUnavailable ? e : undefined;
    if (w?.message === 'not-configured') return { name, status: 'not-configured', attestations: [], accessed: new Date().toISOString(), api, route, error: 'No Shelf server with a World Historical Gazetteer token is configured.' };
    return { name, status: 'unavailable', attestations: [], accessed: new Date().toISOString(), api, route, error: w?.message ?? 'World Historical Gazetteer couldn’t be reached.', retryAfter: w?.retryAfter };
  };
  if (Date.now() < coolUntil) {
    const wait = Math.ceil((coolUntil - Date.now()) / 1000);
    for (const n of todo) out.set(n, unavailable(n, new WhgUnavailable('World Historical Gazetteer asked Shelf to wait before asking again.', wait)));
    return out;
  }
  if (route === 'reconcile') {
    try {
      for (const l of await viaReconcile(todo, opts.signal)) { out.set(l.name, l); await toCache(route, l); }
    } catch (e) {
      for (const n of todo) out.set(n, unavailable(n, e));
    }
    return out;
  }
  // Public index: one name per request, a few at a time.
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const n = todo[next++];
      if (Date.now() < coolUntil) { out.set(n, unavailable(n, new WhgUnavailable('World Historical Gazetteer asked Shelf to wait before asking again.', Math.ceil((coolUntil - Date.now()) / 1000)))); continue; }
      try { const l = await viaIndex(n, opts.signal); out.set(n, l); await toCache(route, l); } catch (e) { out.set(n, unavailable(n, e)); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
  return out;
}

export async function whgLookup(name: string, opts: WhgOptions = {}): Promise<WhgLookup> {
  return (await whgLookupMany([name], opts)).get(name.trim()) ?? { name, status: 'unavailable', attestations: [], accessed: new Date().toISOString(), api: INDEX_API, error: 'No name to look up.' };
}

/** Does an attestation fit a year? Undated records are "unknown", never "outside". */
export function whgFitsYear(a: WhgAttestation, year: number, slack = 25): 'within' | 'outside' | 'unknown' {
  if (!a.timespans.length) return 'unknown';
  return a.timespans.some(([lo, hi]) => lo - slack <= year && year <= hi + slack) ? 'within' : 'outside';
}

/** Does the name as written match one of the record's names? */
export function whgNameMatch(a: WhgAttestation, written: string): 'exact' | 'variant' | 'none' {
  const w = norm(written);
  if (norm(a.title) === w) return 'exact';
  if (a.names.some((n) => norm(n) === w)) return 'variant';
  return 'none';
}
