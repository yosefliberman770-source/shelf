// What Shelf's own place index actually holds, per region and period — measured from the index by
// scripts/atlas-build/coverage_index.py, not declared by a dataset. A declared extent ("Wikidata: places, worldwide")
// says where a source could have records; these counts say where Shelf has them. Coverage shown to the reader is
// capped by them, so an empty map is never described as well covered.
import type { HistYear } from '../atlas/time';
import { PERIODS, type PeriodId, type Quality, type RegionId, periodAt, regionAt, regionLabel } from './axes';
import MEASURED from './coverage-measured.json';

const BY_REGION = (MEASURED as { regions: Record<string, { dated: Partial<Record<PeriodId, number>>; undated: number }> }).regions;

/** Dated records in the index for a region over a span of years (the busiest period the span touches). */
export function measuredCount(region: RegionId | undefined, from: HistYear, to: HistYear): number {
  if (!region) return 0;
  const r = BY_REGION[region];
  if (!r) return 0;
  return Math.max(0, ...PERIODS.filter((p) => p.from <= to && p.to >= from).map((p) => r.dated[p.id] ?? 0));
}

/** The best coverage Shelf can honestly claim from what it holds: none, then limited, moderate, or uncapped. */
export function measuredCap(count: number): Quality {
  if (count === 0) return 'none';
  if (count < 100) return 'limited';
  if (count < 1000) return 'moderate';
  return 'excellent';
}

/** For a point and a year: the region, its label, and how many dated places Shelf holds there in that period. */
export function placeCoverageAt(lon: number, lat: number, year: HistYear): { region?: RegionId; label: string; period: string; count: number } {
  const region = regionAt(lon, lat);
  const p = PERIODS.find((x) => x.id === periodAt(year))!;
  return { region, label: regionLabel(region), period: p.label, count: measuredCount(region, p.from, p.to) };
}

/** Data types whose coverage is measured from the place index. */
export const MEASURED_TYPES = new Set(['places', 'names', 'settlements']);
