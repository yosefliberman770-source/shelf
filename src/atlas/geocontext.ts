// Where a book is set, as far as Shelf already knows — used as a prior when a
// name could be several places. It comes only from places already identified
// for this book (the reader's own choices, places visited on the map, the
// book-world analysis) and from other names in the same passage that the
// offline gazetteers identify unambiguously. Nothing is guessed.
import { db } from '../db/db';
import { km, type Pos } from './data';
import { matchName } from './gazetteer';
import type { HistYear } from './time';

export interface GeoContext {
  /** [lon, lat] of places already identified for this book or passage. */
  points: Pos[];
  /** Where they came from, for the "why" line. */
  from: string[];
}

export const EMPTY_CONTEXT: GeoContext = { points: [], from: [] };

/** Distance (km) from a point to the nearest context point (Infinity without context). */
export const contextDistance = (ctx: GeoContext | undefined, p: Pos) => (ctx?.points.length ? Math.min(...ctx.points.map((q) => km(p, q))) : Infinity);

/**
 * How well a location fits the book's geography, 0–1. Without context every
 * location fits equally (1). With it, places within ~1500 km of an identified
 * place fit; far-away places need other evidence.
 */
export function contextFit(ctx: GeoContext | undefined, p: Pos): number {
  if (!ctx || ctx.points.length < 1) return 1;
  const d = contextDistance(ctx, p);
  return d <= 1500 ? 1 : d <= 3000 ? 0.5 : 0.15;
}

export async function bookGeoContext(opts: { bookId?: string; nearby?: string[]; year?: HistYear; exclude?: string }): Promise<GeoContext> {
  const points: Pos[] = [];
  const from = new Set<string>();
  const add = (lon: number | undefined, lat: number | undefined, src: string) => {
    if (lon === undefined || lat === undefined || !Number.isFinite(lon) || !Number.isFinite(lat)) return;
    points.push([lon, lat]);
    from.add(src);
  };
  if (opts.bookId) {
    const [choices, visits, world] = await Promise.all([
      db.placeChoices.where('bookId').equals(opts.bookId).toArray().catch(() => []),
      db.placeVisits.where('bookId').equals(opts.bookId).toArray().catch(() => []),
      db.bookWorld.get(opts.bookId).catch(() => undefined),
    ]);
    for (const c of choices) { const p = c.place as { latitude?: number; longitude?: number }; add(p.longitude, p.latitude, 'places you chose in this book'); }
    for (const v of visits) add(v.lon, v.lat, 'places you opened from this book');
    for (const [name, r] of Object.entries(world?.resolved ?? {})) if (r && name !== opts.exclude && (r.status === 'HIGH' || r.status === 'MEDIUM')) add(r.lon, r.lat, 'places identified in this book');
  }
  // Other names in the same passage that the offline gazetteers identify without doubt.
  for (const n of (opts.nearby ?? []).filter((x) => x !== opts.exclude).slice(0, 8)) {
    const m = await matchName(n, opts.year).catch(() => undefined);
    if (m?.status === 'unique' && m.place && m.candidates.length === 1) add(m.place.lon, m.place.lat, 'other places named nearby in the text');
  }
  return { points: points.slice(0, 200), from: [...from] };
}
