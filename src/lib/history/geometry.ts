// Turning a place's geometry into a map view: a centre and a zoom that fits
// it, rather than one hard-coded zoom for every city, province and empire.
import type { BBox, Geometry, HistoricalPlace } from './types';

function coords(g: Geometry): [number, number][] {
  switch (g.type) {
    case 'Point': return [g.coordinates];
    case 'MultiPoint': case 'LineString': return g.coordinates;
    case 'MultiLineString': case 'Polygon': return g.coordinates.flat();
    case 'MultiPolygon': return g.coordinates.flat(2);
    case 'GeometryCollection': return g.geometries.flatMap(coords);
  }
}

export function bboxOf(g: Geometry): BBox | undefined {
  const pts = coords(g).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!pts.length) return undefined;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY];
}

export function unionBBox(boxes: BBox[]): BBox | undefined {
  if (!boxes.length) return undefined;
  return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
}

/** Zoom level at which a box roughly fills a phone-sized map. */
export function zoomForBBox(b: BBox): number {
  const span = Math.max(b[2] - b[0], (b[3] - b[1]) * 1.4, 0.0001);
  // Each zoom step halves the visible span; ~360° at zoom 0 on a ~256px tile.
  const z = Math.log2(360 / span) - 0.6;
  return Math.max(2, Math.min(15, Math.round(z * 10) / 10));
}

/** Default zooms when only a point is known, by what kind of place it is. */
function pointZoom(type?: string): number {
  const t = (type ?? '').toLowerCase();
  if (/continent|ocean|sea/.test(t)) return 4;
  if (/country|empire|kingdom|state|polity|region|province|nation/.test(t)) return 5;
  if (/river|mountain|range|lake|island/.test(t)) return 7;
  if (/battle|fort|temple|building|monument|site|villa|bridge/.test(t)) return 13;
  if (/village|hamlet/.test(t)) return 12;
  return 10; // cities, towns, settlements
}

export interface MapView { lat: number; lon: number; zoom: number; bbox?: BBox }

/** Where to point the map for a place. Undefined when it has no location. */
export function mapViewFor(p: Pick<HistoricalPlace, 'latitude' | 'longitude' | 'geometry' | 'boundingBox' | 'placeType'>): MapView | undefined {
  const box = p.boundingBox ?? (p.geometry && p.geometry.type !== 'Point' ? bboxOf(p.geometry) : undefined);
  const hasBox = box && (box[2] - box[0] > 0.001 || box[3] - box[1] > 0.001);
  const lat = p.latitude ?? (box ? (box[1] + box[3]) / 2 : undefined);
  const lon = p.longitude ?? (box ? (box[0] + box[2]) / 2 : undefined);
  if (lat === undefined || lon === undefined) return undefined;
  return hasBox ? { lat, lon, zoom: zoomForBBox(box!), bbox: box } : { lat, lon, zoom: pointZoom(p.placeType) };
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatCoords(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}
