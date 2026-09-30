// Cross-checking a place against specialist regional sources (CHGIS for China).
// Cross-checking against the World Historical Gazetteer and the offline
// gazetteers together is done by placeEvidence.ts.
import { km } from '../atlas/data';
import type { ReaderPlace } from '../atlas/resolve';
import type { HistYear } from '../atlas/time';
import { regionAt } from './axes';
import { type ChgisPlace, chgisSearch } from './live';

/** CHGIS records for a Chinese place around the year, near the resolved point. */
export async function chgisFor(place: ReaderPlace, year?: HistYear, signal?: AbortSignal): Promise<ChgisPlace[]> {
  if (regionAt(place.lon, place.lat) !== 'china') return [];
  const names = [...new Set([place.written, place.title, ...place.names.map((n) => n.name)])].filter((n) => n && n.length < 30).slice(0, 4);
  const out: ChgisPlace[] = [];
  for (const n of names) {
    const rs = await chgisSearch(n, year, signal).catch(() => []);
    for (const r of rs) if (r.lat !== undefined && km([place.lon, place.lat], [r.lon!, r.lat]) < 60 && !out.some((o) => o.id === r.id)) out.push(r);
  }
  return out;
}
