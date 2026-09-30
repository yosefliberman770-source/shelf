// The Historical Map Archive: original maps made at the time (not modern
// reconstructions), found in institutional collections, and — where someone
// has georeferenced them — laid over the reconstruction.
//
//   Library of Congress  loc.gov JSON search, IIIF images
//   David Rumsey         LUNA search JSON, IIIF manifests
//   Allmaps              georeferences (control points) for IIIF maps, searchable by area
//
// An original map shows what its maker knew, believed and chose to show, in
// the conventions of its time. The app always labels it that way.
import { yearLabel } from '../atlas/time';
import { type HistDate, parseDate, UNKNOWN_DATE } from './histdate';
import { cachedJSON } from './live';

export type MapCollection = 'loc' | 'rumsey' | 'allmaps';
export const COLLECTION: Record<MapCollection, { name: string; rights: string; url: string }> = {
  loc: { name: 'Library of Congress, Geography and Map Division', rights: 'See the item record (many maps have no known restrictions)', url: 'https://www.loc.gov/maps/' },
  rumsey: { name: 'David Rumsey Map Collection, Stanford Libraries', rights: 'CC BY-NC-SA 3.0 (David Rumsey Map Collection terms)', url: 'https://www.davidrumsey.com/' },
  allmaps: { name: 'Georeferenced via Allmaps', rights: 'Image rights as in the holding collection', url: 'https://allmaps.org/' },
};

export interface HistMap {
  id: string;
  title: string;
  date: HistDate;
  creator?: string;
  subjects: string[];
  collection: MapCollection;
  /** Where the image comes from (the holding collection, for Allmaps results). */
  holder: string;
  thumb?: string;
  /** IIIF Image API service (no trailing slash). */
  iiif?: string;
  manifest?: string;
  page: string;
  rights: string;
  /** Allmaps annotation found for it (undefined = not checked yet, null = none). */
  georef?: Georef | null;
}

export interface Georef {
  annotation: string;
  imageService: string;
  width: number;
  height: number;
  gcps: { px: [number, number]; geo: [number, number] }[];
  mask?: [number, number][];
  transformation?: string;
}

const yearFrom = (s?: string): HistDate => (s ? parseDate(s) ?? UNKNOWN_DATE : UNKNOWN_DATE);

// ── Library of Congress ───────────────────────────────────────────────────

interface LocResult { id: string; title: string; date?: string; image_url?: string[]; subject?: string[]; contributor?: string[]; location?: string[] }
export async function searchLoc(q: string, from?: number, to?: number, signal?: AbortSignal): Promise<HistMap[]> {
  const p = new URLSearchParams({ q, fo: 'json', c: '25' });
  if (from !== undefined || to !== undefined) p.set('dates', `${Math.max(1000, from ?? 1000)}/${Math.min(2030, to ?? 2030)}`);
  const d = await cachedJSON<{ results?: LocResult[] }>(`https://www.loc.gov/maps/?${p}`, 14, signal);
  return (d.results ?? []).filter((r) => r.image_url?.length).map((r) => {
    const img = r.image_url!.find((u) => u.includes('/iiif/')) ?? r.image_url![0];
    const iiif = img.includes('/image-services/iiif/') ? img.split('/full/')[0] : undefined;
    return {
      id: `loc:${r.id}`, title: r.title, date: yearFrom(r.date), creator: r.contributor?.[0], subjects: r.subject?.slice(0, 6) ?? [], collection: 'loc' as const, holder: COLLECTION.loc.name,
      thumb: iiif ? `${iiif}/full/300,/0/default.jpg` : r.image_url![0], iiif, page: r.id, rights: COLLECTION.loc.rights,
      manifest: `${r.id.replace(/\/$/, '')}/manifest.json`,
    };
  });
}

// ── David Rumsey ──────────────────────────────────────────────────────────

interface LunaResult { id: string; displayName: string; urlSize2?: string; iiifManifest?: string; fieldValues?: Record<string, string | string[]>[] }
export async function searchRumsey(q: string, from?: number, to?: number, signal?: AbortSignal): Promise<HistMap[]> {
  const d = await cachedJSON<{ results?: LunaResult[] }>(`https://www.davidrumsey.com/luna/servlet/as/search?q=${encodeURIComponent(q)}&lc=RUMSEY~8~1&bs=40`, 14, signal);
  const field = (r: LunaResult, k: string) => { const v = r.fieldValues?.find((f) => k in f)?.[k]; return Array.isArray(v) ? v[0] : v; };
  return (d.results ?? []).map((r) => {
    const date = yearFrom(field(r, 'Date') ?? field(r, 'Pub Date'));
    return {
      id: `rumsey:${r.id}`, title: r.displayName, date, creator: field(r, 'Author'), subjects: [field(r, 'Type')].filter((x): x is string => !!x), collection: 'rumsey' as const, holder: COLLECTION.rumsey.name,
      thumb: r.urlSize2, iiif: `https://www.davidrumsey.com/luna/servlet/iiif/${r.id}`, manifest: r.iiifManifest, page: `https://www.davidrumsey.com/luna/servlet/detail/${r.id}`, rights: COLLECTION.rumsey.rights,
    };
  }).filter((m) => from === undefined || to === undefined || m.date.precision === 'unknown' || ((m.date.latest ?? Infinity) >= from && (m.date.earliest ?? -Infinity) <= to));
}

// ── Allmaps (georeferenced maps) ──────────────────────────────────────────

interface AllmapsMap { id: string; resource: { id: string; width: number; height: number; partOf?: { label?: Record<string, string[]>; partOf?: { id: string; label?: Record<string, string[]> }[] }[] }; gcps: { resource: [number, number]; geo: [number, number] }[]; resourceMask?: [number, number][]; transformation?: { type: string }; _allmaps?: { area?: number } }
const label = (l?: Record<string, string[]>) => (l ? Object.values(l)[0]?.[0] : undefined);
/** Diagonal of the area a map's control points cover, in km. */
function extentKm(geo: [number, number][]): number {
  const lons = geo.map((g) => g[0]);
  const lats = geo.map((g) => g[1]);
  const dx = (Math.max(...lons) - Math.min(...lons)) * 111.32 * Math.cos(((Math.max(...lats) + Math.min(...lats)) / 2) * (Math.PI / 180));
  const dy = (Math.max(...lats) - Math.min(...lats)) * 110.57;
  return Math.hypot(dx, dy);
}

/** Georeferenced maps covering an area, most local first (world maps last). */
export async function searchAllmaps(bbox: [number, number, number, number], signal?: AbortSignal): Promise<HistMap[]> {
  // Allmaps takes the box latitude first: minLat,minLon,maxLat,maxLon (verified against its API).
  const box = [bbox[1], bbox[0], bbox[3], bbox[2]].map((v) => v.toFixed(3)).join(',');
  const viewArea = Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) * 111 * 111 * 1e6 * Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180);
  // Local maps first (maps covering at most ~50× the view), then — if there are few — the smallest regional ones.
  const local = await cachedJSON<AllmapsMap[]>(`https://api.allmaps.org/maps?intersects=${box}&limit=40&maxarea=${Math.round(Math.max(viewArea * 50, 5e8))}`, 14, signal).catch(() => [] as AllmapsMap[]);
  const wide = local.length >= 8 ? [] : await cachedJSON<AllmapsMap[]>(`https://api.allmaps.org/maps?intersects=${box}&limit=60`, 14, signal);
  const seenIds = new Set<string>();
  return [...local, ...wide]
    .filter((m) => m.gcps?.length >= 3 && !seenIds.has(m.id) && (seenIds.add(m.id), true))
    // Safety check: keep only maps whose own control points reach the area asked about.
    .filter((m) => { const g = m.gcps.map((c) => c.geo); const pad = 2; return Math.min(...g.map((x) => x[0])) <= bbox[2] + pad && Math.max(...g.map((x) => x[0])) >= bbox[0] - pad && Math.min(...g.map((x) => x[1])) <= bbox[3] + pad && Math.max(...g.map((x) => x[1])) >= bbox[1] - pad; })
    .map((m) => ({ m, extent: extentKm(m.gcps.map((g) => g.geo)) }))
    .sort((a, b) => a.extent - b.extent)
    .slice(0, 20)
    .map(({ m }) => m)
    .map((m) => {
      const canvas = m.resource.partOf?.[0];
      const manifest = canvas?.partOf?.[0];
      const title = label(manifest?.label) ?? label(canvas?.label) ?? 'Untitled map';
      const holder = m.resource.id.includes('davidrumsey') ? COLLECTION.rumsey.name : m.resource.id.includes('loc.gov') ? COLLECTION.loc.name : new URL(m.resource.id).hostname;
      const across = extentKm(m.gcps.map((g) => g.geo));
      return {
        id: `allmaps:${m.id}`, title: `${title}${across > 800 ? ` (spans about ${Math.round(across / 100) * 100} km)` : ''}`, date: yearFrom(title), subjects: [], collection: 'allmaps' as const, holder,
        thumb: `${m.resource.id}/full/300,/0/default.jpg`, iiif: m.resource.id, manifest: manifest?.id, page: m.id.replace('annotations.allmaps.org/maps', 'viewer.allmaps.org/?url=https://annotations.allmaps.org/maps'),
        rights: m.resource.id.includes('davidrumsey') ? COLLECTION.rumsey.rights : COLLECTION.allmaps.rights,
        georef: { annotation: m.id, imageService: m.resource.id, width: m.resource.width, height: m.resource.height, gcps: m.gcps.map((g) => ({ px: g.resource, geo: g.geo })), mask: m.resourceMask, transformation: m.transformation?.type },
      };
    });
}

/** Look up whether someone georeferenced this map (Allmaps), from its IIIF manifest. */
export async function findGeoref(map: HistMap, signal?: AbortSignal): Promise<Georef | null> {
  if (map.georef !== undefined) return map.georef;
  if (!map.manifest) return null;
  try {
    const d = await cachedJSON<{ items?: { id: string; target: { source: { id: string; width: number; height: number }; selector?: { value?: string } }; body: { transformation?: { type: string }; features: { properties: { resourceCoords: [number, number] }; geometry: { coordinates: [number, number] } }[] } }[] }>(`https://annotations.allmaps.org/?url=${encodeURIComponent(map.manifest)}`, 30, signal);
    const it = d.items?.[0];
    if (!it) return null;
    const pts = it.target.selector?.value?.match(/points="([^"]+)"/)?.[1];
    return {
      annotation: it.id, imageService: it.target.source.id, width: it.target.source.width, height: it.target.source.height,
      gcps: it.body.features.map((f) => ({ px: f.properties.resourceCoords, geo: f.geometry.coordinates })),
      mask: pts ? pts.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]) : undefined, transformation: it.body.transformation?.type,
    };
  } catch {
    return null; // 404 = not georeferenced; other errors are treated the same (no overlay offered)
  }
}

// ── Laying a map over the reconstruction ──────────────────────────────────
//
// MapLibre places an image by its four corners, i.e. a projective transform.
// We fit one to the georeference's control points (least squares, in Web
// Mercator) and report how far the fitted points land from where the
// control points say they should — the overlay's measured error.

const R = 6378137;
const merc = ([lon, lat]: [number, number]): [number, number] => [(lon * Math.PI * R) / 180, R * Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360))];
const unmerc = ([x, y]: [number, number]): [number, number] => [(x / (Math.PI * R)) * 180, ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI];

function solve(A: number[][], b: number[]): number[] | undefined {
  // Least squares via normal equations (8 unknowns), Gaussian elimination.
  const n = A[0].length;
  const M = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0)), A.reduce((s, row, k) => s + row[i] * b[k], 0)]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return undefined;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export interface Overlay { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]]; errorKm: number; extentKm: number; points: number; note: string }
/** Why a georeferenced map can't be laid over the map (too few points, or too distorted for a simple fit). */
export type OverlayResult = { ok: true; overlay: Overlay } | { ok: false; reason: string };

/** Fit, then refuse overlays whose measured error is large for the map's size — a misplaced old map is worse than none. */
export function overlayFor(g: Georef, limits: ImageLimits = {}): OverlayResult {
  if (g.gcps.length < 4) return { ok: false, reason: `Georeferenced with only ${g.gcps.length} control points — too few to place reliably.` };
  const o = fitOverlay(g, 1600, limits);
  if (!o) return { ok: false, reason: 'Its control points can’t be fitted (they may lie almost in a line).' };
  if (o.errorKm > Math.max(5, o.extentKm * 0.04)) return { ok: false, reason: `Too distorted to place with a simple fit (typical error ≈ ${Math.round(o.errorKm)} km on a map ${Math.round(o.extentKm)} km across). View it instead, or open it in Allmaps.` };
  return { ok: true, overlay: o };
}

/** An image server's own size limits (IIIF info.json: maxArea / maxWidth / maxHeight), so requests stay within them. */
export interface ImageLimits { maxArea?: number; maxWidth?: number; maxHeight?: number }
export async function imageLimits(service: string, signal?: AbortSignal): Promise<ImageLimits> {
  try {
    const d = await cachedJSON<{ maxArea?: number; maxWidth?: number; maxHeight?: number; profile?: unknown[] }>(`${service}/info.json`, 30, signal);
    const p = (Array.isArray(d.profile) ? d.profile.find((x) => typeof x === 'object') : undefined) as ImageLimits | undefined;
    return { maxArea: d.maxArea ?? p?.maxArea, maxWidth: d.maxWidth ?? p?.maxWidth, maxHeight: d.maxHeight ?? p?.maxHeight };
  } catch { return {}; }
}
/** The largest output width for a region that the server allows. */
export function allowedWidth(rw: number, rh: number, want: number, lim: ImageLimits = {}): number {
  let w = Math.min(want, rw, lim.maxWidth ?? Infinity);
  if (lim.maxHeight) w = Math.min(w, Math.floor((lim.maxHeight * rw) / rh));
  if (lim.maxArea) w = Math.min(w, Math.floor(Math.sqrt((lim.maxArea * rw) / rh)));
  return Math.max(1, Math.floor(w));
}
/** A viewer-size image URL (whole map) within the server's limits. */
export async function viewerUrl(service: string, signal?: AbortSignal): Promise<string> {
  const lim = await imageLimits(service, signal);
  if (!lim.maxArea && !lim.maxWidth) return `${service}/full/!2000,2000/0/default.jpg`;
  const side = Math.floor(Math.min(2000, lim.maxWidth ?? 2000, lim.maxArea ? Math.sqrt(lim.maxArea) : 2000));
  return `${service}/full/!${side},${side}/0/default.jpg`;
}

export function fitOverlay(g: Georef, maxWidth = 1600, limits: ImageLimits = {}): Overlay | undefined {
  if (g.gcps.length < 4) return undefined;
  // Normalise pixel and map coordinates for numerical stability.
  const P = g.gcps.map((c) => c.px);
  const Q = g.gcps.map((c) => merc(c.geo));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const px0 = [mean(P.map((p) => p[0])), mean(P.map((p) => p[1]))];
  const q0 = [mean(Q.map((q) => q[0])), mean(Q.map((q) => q[1]))];
  const ps = Math.max(...P.map((p) => Math.hypot(p[0] - px0[0], p[1] - px0[1]))) || 1;
  const qs = Math.max(...Q.map((q) => Math.hypot(q[0] - q0[0], q[1] - q0[1]))) || 1;
  const norm = g.gcps.map((_, i) => ({ x: (P[i][0] - px0[0]) / ps, y: (P[i][1] - px0[1]) / ps, X: (Q[i][0] - q0[0]) / qs, Y: (Q[i][1] - q0[1]) / qs }));
  const toGeo = (fx: (x: number, y: number) => [number, number]) => ([u, v]: [number, number]): [number, number] => {
    const [X, Y] = fx((u - px0[0]) / ps, (v - px0[1]) / ps);
    return unmerc([X * qs + q0[0], Y * qs + q0[1]]);
  };
  // Affine fit (no perspective): stable even when the control points cover only part of the sheet.
  const ax = solve(norm.map((n) => [n.x, n.y, 1]), norm.map((n) => n.X));
  const ay = solve(norm.map((n) => [n.x, n.y, 1]), norm.map((n) => n.Y));
  if (!ax || !ay) return undefined;
  const affine = toGeo((x, y) => [ax[0] * x + ax[1] * y + ax[2], ay[0] * x + ay[1] * y + ay[2]]);
  // Projective fit: used only if clearly better and its corners stay sane (perspective can blow up outside the points).
  const A: number[][] = [];
  const b: number[] = [];
  for (const n of norm) {
    A.push([n.x, n.y, 1, 0, 0, 0, -n.x * n.X, -n.y * n.X]); b.push(n.X);
    A.push([0, 0, 0, n.x, n.y, 1, -n.x * n.Y, -n.y * n.Y]); b.push(n.Y);
  }
  const h = g.gcps.length >= 6 ? solve(A, b) : undefined;
  const projective = h ? toGeo((x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; }) : undefined;
  // Error: fitted vs. stated position of each control point, in km.
  const rms = (f: (p: [number, number]) => [number, number]) => {
    const errs = g.gcps.map((c) => {
      const [lon, lat] = f(c.px);
      return Math.hypot((lon - c.geo[0]) * 111.32 * Math.cos((c.geo[1] * Math.PI) / 180), (lat - c.geo[1]) * 110.57);
    });
    return Math.sqrt(errs.reduce((s2, e) => s2 + e * e, 0) / errs.length);
  };
  // Crop to the map's own area (its mask) so margins and titles aren't stretched over the land.
  const xs = (g.mask ?? [[0, 0], [g.width, g.height]]).map((p) => p[0]);
  const ys = (g.mask ?? [[0, 0], [g.width, g.height]]).map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(g.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(g.height, Math.ceil(Math.max(...ys)));
  const corners = (f: (p: [number, number]) => [number, number]) => [f([x0, y0]), f([x1, y0]), f([x1, y1]), f([x0, y1])] as Overlay['coordinates'];
  const area = (c: Overlay['coordinates']) => Math.abs(c.reduce((s2, p, i) => { const q = c[(i + 1) % 4]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const convex = (c: Overlay['coordinates']) => { const sg = c.map((p, i) => { const q = c[(i + 1) % 4]; const r = c[(i + 2) % 4]; return Math.sign((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])); }); return sg.every((v) => v === sg[0]); };
  const aErr = rms(affine);
  const aC = corners(affine);
  let useProjective = false;
  let coords = aC;
  let errorKm = aErr;
  if (projective) {
    const pErr = rms(projective);
    const pC = corners(projective);
    const ratio = area(pC) / Math.max(1e-12, area(aC));
    if (pErr < aErr * 0.6 && convex(pC) && ratio > 0.6 && ratio < 1.6 && pC.flat().every(Number.isFinite)) { useProjective = true; coords = pC; errorKm = pErr; }
  }
  if (coords.flat().some((v) => !Number.isFinite(v))) return undefined;
  const width = allowedWidth(x1 - x0, y1 - y0, maxWidth, limits);
  return {
    url: `${g.imageService}/${x0},${y0},${x1 - x0},${y1 - y0}/${width},/0/default.jpg`, coordinates: coords, errorKm, extentKm: extentKm(g.gcps.map((c) => c.geo)), points: g.gcps.length,
    note: `Placed with a best-fit ${useProjective ? 'projective' : 'affine'} transform from ${g.gcps.length} control points (Allmaps georeference${g.transformation ? `, drawn there with a ${g.transformation === 'thinPlateSpline' ? 'thin-plate spline' : g.transformation}` : ''}). Typical error here ≈ ${errorKm < 1 ? `${Math.round(errorKm * 1000)} m` : `${errorKm.toFixed(errorKm < 10 ? 1 : 0)} km`}.`,
  };
}

/** One search across the collections for a place (or area) and dates. */
export async function searchMaps(opts: { q?: string; bbox?: [number, number, number, number]; from?: number; to?: number; subject?: string; signal?: AbortSignal }): Promise<{ maps: HistMap[]; errors: string[] }> {
  const q = [opts.q, opts.subject].filter(Boolean).join(' ').trim();
  const errors: string[] = [];
  const jobs: Promise<HistMap[]>[] = [];
  if (q) {
    jobs.push(searchLoc(q, opts.from, opts.to, opts.signal).catch(() => { errors.push('Library of Congress couldn’t be reached.'); return []; }));
    jobs.push(searchRumsey(q, opts.from, opts.to, opts.signal).catch(() => { errors.push('David Rumsey Map Collection couldn’t be reached.'); return []; }));
  }
  if (opts.bbox) jobs.push(searchAllmaps(opts.bbox, opts.signal).catch(() => { errors.push('Allmaps couldn’t be reached.'); return []; }));
  const all = (await Promise.all(jobs)).flat();
  const inRange = (m: HistMap) => opts.from === undefined || m.date.precision === 'unknown' || ((m.date.latest ?? Infinity) >= opts.from && (m.date.earliest ?? -Infinity) <= (opts.to ?? Infinity));
  const seen = new Set<string>();
  const maps = all.filter((m) => inRange(m) && !seen.has(m.iiif ?? m.id) && (seen.add(m.iiif ?? m.id), true));
  // Maps whose title names the place first, then ones that can be overlaid, then closest in date (undated last).
  const mid = opts.from !== undefined && opts.to !== undefined ? (opts.from + opts.to) / 2 : undefined;
  const dist = (m: HistMap) => (m.date.precision === 'unknown' || mid === undefined ? 1e9 : Math.abs((m.date.preferred ?? m.date.earliest ?? 0) - mid));
  const needle = (opts.q ?? '').toLowerCase().trim();
  const named = (m: HistMap) => (needle && m.title.toLowerCase().includes(needle) ? 0 : 1);
  maps.sort((a, b) => named(a) - named(b) || Number(!!b.georef) - Number(!!a.georef) || dist(a) - dist(b));
  return { maps, errors };
}

export const mapDateLabel = (m: HistMap) => (m.date.precision === 'unknown' ? 'date not in the record' : m.date.preferred !== undefined ? yearLabel(m.date.preferred) : m.date.label ?? `${m.date.earliest}–${m.date.latest}`);
