// Loading the atlas data packs (public/atlas/), once per session, plus the
// small geometry helpers the lookups share.

const cache = new Map<string, Promise<unknown>>();

export const atlasBase = () => `${import.meta.env.BASE_URL}atlas/`;

/** Fetch a pack once; a failed fetch is forgotten so it can be retried. */
export function getJSON<T>(url: string): Promise<T> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url) as Promise<T>;
}
export const pack = <T>(file: string) => getJSON<T>(atlasBase() + file);

export type Pos = [number, number]; // [lon, lat]
export interface Feature<P = Record<string, unknown>> {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown } | null;
  properties: P;
}
export interface FC<P = Record<string, unknown>> { type: 'FeatureCollection'; features: Feature<P>[] }

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
/** Great-circle distance in km. */
export function km(a: Pos, b: Pos): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const MILE_KM = 1.609344;

function inRing(p: Pos, ring: Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (p: Pos, rings: Pos[][]) => inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h));

/** Is the point inside a (Multi)Polygon geometry? */
export function contains(g: Feature['geometry'], p: Pos): boolean {
  if (!g) return false;
  if (g.type === 'Polygon') return inPolygon(p, g.coordinates as Pos[][]);
  if (g.type === 'MultiPolygon') return (g.coordinates as Pos[][][]).some((poly) => inPolygon(p, poly));
  return false;
}

/** Shortest distance in km from a point to a (Multi)LineString (approximate, fine at these scales). */
export function distanceToLine(g: Feature['geometry'], p: Pos): number {
  if (!g) return Infinity;
  const lines = g.type === 'LineString' ? [g.coordinates as Pos[]] : g.type === 'MultiLineString' ? (g.coordinates as Pos[][]) : [];
  const kx = 111.32 * Math.cos(rad(p[1]));
  const ky = 110.57;
  let best = Infinity;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const ax = (line[i - 1][0] - p[0]) * kx;
      const ay = (line[i - 1][1] - p[1]) * ky;
      const bx = (line[i][0] - p[0]) * kx;
      const by = (line[i][1] - p[1]) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
