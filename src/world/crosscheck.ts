// Cross-checking a place against other sources, keeping disagreements.
//
// World Historical Gazetteer gathers records of the same name from many
// datasets (Getty TGN, Black's atlas, trade-route gazetteers, …). Records at
// the same spot corroborate; the same name a moderate distance away is shown
// as "possibly the same place, located differently"; far-away places with the
// name are simply other places. Dates that don't overlap are kept side by side.
import { km } from '../atlas/data';
import type { Disagreement, ReaderPlace } from '../atlas/resolve';
import type { HistYear } from '../atlas/time';
import { regionAt } from './axes';
import { formatDate } from './histdate';
import { type ChgisPlace, chgisSearch, spanLabel, type WhgRecord, whgIndex } from './live';

export interface CrossCheck {
  agreeing: (WhgRecord & { km: number })[];
  nearbyDifferent: (WhgRecord & { km: number })[];
  elsewhere: number;
  disagreements: Disagreement[];
  error?: string;
}

const SAME_KM = 25;
const MAYBE_KM = 150;

export async function crossCheck(place: ReaderPlace, signal?: AbortSignal): Promise<CrossCheck> {
  const names = [...new Set([place.title, place.written].filter(Boolean))];
  let recs: WhgRecord[] = [];
  try {
    recs = (await Promise.all(names.map((n) => whgIndex(n, signal)))).flat();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { agreeing: [], nearbyDifferent: [], elsewhere: 0, disagreements: [], error: 'World Historical Gazetteer couldn’t be reached, so this place wasn’t cross-checked.' };
  }
  const seen = new Set<string>();
  const located = recs.filter((r) => r.lat !== undefined && r.lon !== undefined && !seen.has(r.placeId) && (seen.add(r.placeId), true)).map((r) => ({ ...r, km: km([place.lon, place.lat], [r.lon!, r.lat!]) }));
  const agreeing = located.filter((r) => r.km <= SAME_KM).sort((a, b) => a.km - b.km);
  const nearbyDifferent = located.filter((r) => r.km > SAME_KM && r.km <= MAYBE_KM).sort((a, b) => a.km - b.km);
  const disagreements: Disagreement[] = [];
  // Dates: a corroborating record whose time spans never overlap ours.
  const lo = place.when?.earliest;
  const hi = place.when?.latest;
  if (lo !== undefined && hi !== undefined) {
    for (const r of agreeing) {
      if (!r.timespans.length) continue;
      const overlaps = r.timespans.some(([a, b]) => a <= hi && b >= lo);
      if (!overlaps) disagreements.push({ field: 'date', claims: [{ source: place.sources[0]?.name ?? 'this record', value: formatDate(place.when) }, { source: `WHG · ${r.dataset}`, value: r.timespans.map(spanLabel).join(', ') }], note: 'The datasets date this place differently. They may be recording different phases or evidence.' });
    }
  }
  for (const r of nearbyDifferent.slice(0, 3)) {
    disagreements.push({ field: 'location', claims: [{ source: place.sources[0]?.name ?? 'this record', value: `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}` }, { source: `WHG · ${r.dataset}`, value: `${r.lat!.toFixed(2)}, ${r.lon!.toFixed(2)} (${Math.round(r.km)} km away)` }], note: `“${r.title}” in ${r.dataset} is ${Math.round(r.km)} km away — possibly a different place, or the same place located differently (e.g. ancient site vs. later town).` });
  }
  return { agreeing, nearbyDifferent, elsewhere: located.length - agreeing.length - nearbyDifferent.length, disagreements };
}

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
