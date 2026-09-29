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

/** Georeferenced maps covering an area, most local first (world maps last). */
export async function searchAllmaps(bbox: [number, number, number, number], signal?: AbortSignal): Promise<HistMap[]> {
  const d = await cachedJSON<AllmapsMap[]>(`https://api.allmaps.org/maps?intersects=${bbox.map((v) => v.toFixed(3)).join(',')}&limit=60`, 14, signal);
  const viewArea = Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) * 111 * 111 * 1e6;
  return d
    .filter((m) => m.gcps?.length >= 3)
    .sort((a, b) => (a._allmaps?.area ?? Infinity) - (b._allmaps?.area ?? Infinity))
    .filter((m) => (m._allmaps?.area ?? 0) < viewArea * 400)
    .slice(0, 20)
    .map((m) => {
      const canvas = m.resource.partOf?.[0];
      const manifest = canvas?.partOf?.[0];
      const title = label(manifest?.label) ?? label(canvas?.label) ?? 'Untitled map';
      const holder = m.resource.id.includes('davidrumsey') ? COLLECTION.rumsey.name : m.resource.id.includes('loc.gov') ? COLLECTION.loc.name : new URL(m.resource.id).hostname;
      return {
        id: `allmaps:${m.id}`, title, date: yearFrom(title), subjects: [], collection: 'allmaps' as const, holder,
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

export interface Overlay { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]]; errorKm: number; points: number; note: string }

export function fitOverlay(g: Georef, maxWidth = 1600): Overlay | undefined {
  if (g.gcps.length < 4) return undefined;
  // Normalise pixel and map coordinates for numerical stability.
  const P = g.gcps.map((c) => c.px);
  const Q = g.gcps.map((c) => merc(c.geo));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const px0 = [mean(P.map((p) => p[0])), mean(P.map((p) => p[1]))];
  const q0 = [mean(Q.map((q) => q[0])), mean(Q.map((q) => q[1]))];
  const ps = Math.max(...P.map((p) => Math.hypot(p[0] - px0[0], p[1] - px0[1]))) || 1;
  const qs = Math.max(...Q.map((q) => Math.hypot(q[0] - q0[0], q[1] - q0[1]))) || 1;
  const A: number[][] = [];
  const b: number[] = [];
  g.gcps.forEach((_, i) => {
    const x = (P[i][0] - px0[0]) / ps;
    const y = (P[i][1] - px0[1]) / ps;
    const X = (Q[i][0] - q0[0]) / qs;
    const Y = (Q[i][1] - q0[1]) / qs;
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  });
  const h = solve(A, b);
  if (!h) return undefined;
  const map = ([u, v]: [number, number]): [number, number] => {
    const x = (u - px0[0]) / ps;
    const y = (v - px0[1]) / ps;
    const w = h[6] * x + h[7] * y + 1;
    return unmerc([((h[0] * x + h[1] * y + h[2]) / w) * qs + q0[0], ((h[3] * x + h[4] * y + h[5]) / w) * qs + q0[1]]);
  };
  // Error: fitted vs. stated position of each control point, in km.
  const errs = g.gcps.map((c) => {
    const [lon, lat] = map(c.px);
    const dx = (lon - c.geo[0]) * 111.32 * Math.cos((c.geo[1] * Math.PI) / 180);
    const dy = (lat - c.geo[1]) * 110.57;
    return Math.hypot(dx, dy);
  });
  const errorKm = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  // Crop to the map's own area (its mask) so margins and titles aren't stretched over the land.
  const xs = (g.mask ?? [[0, 0], [g.width, g.height]]).map((p) => p[0]);
  const ys = (g.mask ?? [[0, 0], [g.width, g.height]]).map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(g.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(g.height, Math.ceil(Math.max(...ys)));
  const coords = [map([x0, y0]), map([x1, y0]), map([x1, y1]), map([x0, y1])] as Overlay['coordinates'];
  if (coords.flat().some((v) => !Number.isFinite(v))) return undefined;
  const width = Math.min(maxWidth, x1 - x0);
  return {
    url: `${g.imageService}/${x0},${y0},${x1 - x0},${y1 - y0}/${width},/0/default.jpg`, coordinates: coords, errorKm, points: g.gcps.length,
    note: `Placed with a best-fit projective transform from ${g.gcps.length} control points (Allmaps georeference${g.transformation ? `, drawn there with a ${g.transformation === 'thinPlateSpline' ? 'thin-plate spline' : g.transformation}` : ''}). Typical error here ≈ ${errorKm < 1 ? `${Math.round(errorKm * 1000)} m` : `${errorKm.toFixed(errorKm < 10 ? 1 : 0)} km`}.`,
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
  // Closest in date first; undated last.
  const mid = opts.from !== undefined && opts.to !== undefined ? (opts.from + opts.to) / 2 : undefined;
  const dist = (m: HistMap) => (m.date.precision === 'unknown' || mid === undefined ? 1e9 : Math.abs((m.date.preferred ?? m.date.earliest ?? 0) - mid));
  maps.sort((a, b) => Number(!!b.georef) - Number(!!a.georef) || dist(a) - dist(b));
  return { maps, errors };
}

export const mapDateLabel = (m: HistMap) => (m.date.precision === 'unknown' ? 'date not in the record' : m.date.preferred !== undefined ? yearLabel(m.date.preferred) : m.date.label ?? `${m.date.earliest}–${m.date.latest}`);
