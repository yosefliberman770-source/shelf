// The Historical Data Coverage Matrix: region × period × data type.
//
// It describes how much *digital, structured* data exists — not how much
// history happened. Every cell is computed from the Source Registry, and
// keeps two answers apart: what exists anywhere, and what Shelf can use now.
import type { HistYear } from '../atlas/time';
import { type DataType, PERIODS, type PeriodId, type Quality, QUALITY_RANK, REGIONS, type RegionId, regionAt, periodAt } from './axes';
import { measuredCap, measuredCount, MEASURED_TYPES } from './measured';
import { type SourceEntry, SOURCES } from './registry';

export interface CellSource { id: string; name: string; quality: Quality; access: SourceEntry['access']; tier: SourceEntry['tier']; /** Why a catalogued source isn't used (licence, not yet integrated…), from the registry. */ note?: string }
export interface Cell {
  /** Best coverage among all known digital sources. */
  exists: Quality;
  /**
   * Best coverage Shelf holds offline. For places, names and settlements it is capped by what the place index
   * measurably contains here (src/world/measured.ts): a dataset's declared extent alone never makes a region covered.
   */
  inShelf: Quality;
  /** Best coverage among sources Shelf can query online (WHG, CHGIS…), which only help when the phone is online and asked. */
  online: Quality;
  /** For measured types: dated records Shelf holds for this region and span. */
  measured?: number;
  sources: CellSource[];
}

const DOWN: Record<Quality, Quality> = { excellent: 'moderate', moderate: 'limited', limited: 'limited', none: 'none' };
const best = (xs: Quality[]): Quality => xs.reduce<Quality>((a, b) => (QUALITY_RANK[b] > QUALITY_RANK[a] ? b : a), 'none');

/** How well one source covers a region, a span of years and a data type. */
export function sourceQuality(s: SourceEntry, region: RegionId | undefined, from: HistYear, to: HistYear, type: DataType): Quality {
  let q: Quality = 'none';
  for (const c of s.coverage) {
    const t = c.types[type];
    if (!t) continue;
    if (c.regions !== 'world' && (!region || !c.regions.includes(region))) continue;
    const lo = Math.max(from, c.from);
    const hi = Math.min(to, c.to);
    if (lo > hi) continue;
    // Covering only part of the span counts one level lower.
    const part = (hi - lo + 1) / Math.max(1, to - from + 1);
    const got = part < 0.5 ? DOWN[t] : t;
    if (QUALITY_RANK[got] > QUALITY_RANK[q]) q = got;
  }
  return q;
}

export function cellFor(region: RegionId | undefined, from: HistYear, to: HistYear, type: DataType): Cell {
  const sources: CellSource[] = [];
  for (const s of SOURCES) {
    const q = sourceQuality(s, region, from, to, type);
    if (q !== 'none') sources.push({ id: s.id, name: s.name, quality: q, access: s.access, tier: s.tier, note: s.note });
  }
  sources.sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality] || a.tier.localeCompare(b.tier));
  const declared = best(sources.filter((s) => s.access === 'offline').map((s) => s.quality));
  const measured = MEASURED_TYPES.has(type) ? measuredCount(region, from, to) : undefined;
  const cap = measured === undefined ? declared : measuredCap(measured);
  return {
    exists: best(sources.filter((s) => s.access !== 'excluded').map((s) => s.quality)),
    inShelf: QUALITY_RANK[cap] < QUALITY_RANK[declared] ? cap : declared,
    online: best(sources.filter((s) => s.access === 'live').map((s) => s.quality)),
    measured,
    sources,
  };
}

export const cell = (region: RegionId, periodId: PeriodId, type: DataType) => {
  const p = PERIODS.find((x) => x.id === periodId)!;
  return cellFor(region, p.from, p.to, type);
};

/** The cell for a point on the map and a year. */
export function cellAt(lon: number, lat: number, year: HistYear, type: DataType): Cell & { region?: RegionId; period: PeriodId } {
  const region = regionAt(lon, lat);
  const period = periodAt(year);
  // A single year, judged against a window of ±25 years around it.
  return { ...cellFor(region, year - 25, year + 25, type), region, period };
}

export function matrix(types: DataType[]): { region: RegionId; period: PeriodId; type: DataType; cell: Cell }[] {
  const out: { region: RegionId; period: PeriodId; type: DataType; cell: Cell }[] = [];
  for (const r of REGIONS) for (const p of PERIODS) for (const t of types) out.push({ region: r.id, period: p.id, type: t, cell: cell(r.id, p.id, t) });
  return out;
}
