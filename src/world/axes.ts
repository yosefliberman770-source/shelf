// The axes of the coverage matrix and of source selection:
// region × period × data type.
import type { HistYear } from '../atlas/time';

export type RegionId =
  | 'british-isles' | 'iberia' | 'france-low-countries' | 'italy' | 'central-europe' | 'northern-europe' | 'balkans-greece' | 'eastern-europe'
  | 'anatolia-levant' | 'egypt-north-africa' | 'mesopotamia-iran' | 'arabia' | 'central-asia' | 'south-asia' | 'china' | 'japan-korea' | 'southeast-asia'
  | 'sub-saharan-africa' | 'north-america' | 'latin-america' | 'oceania';

/** Rough boxes [W, S, E, N]; the first box that contains a point wins, so smaller regions come first. */
export const REGIONS: { id: RegionId; label: string; box: [number, number, number, number] }[] = [
  { id: 'british-isles', label: 'British Isles', box: [-11, 49.8, 2, 61] },
  { id: 'italy', label: 'Italy', box: [6.5, 36.5, 18.6, 47.1] },
  { id: 'iberia', label: 'Iberia', box: [-10, 35.8, 3.4, 43.9] },
  { id: 'france-low-countries', label: 'France & Low Countries', box: [-5, 42.3, 7.8, 53.6] },
  { id: 'balkans-greece', label: 'Balkans & Greece', box: [13.3, 34.8, 29.7, 46.6] },
  { id: 'central-europe', label: 'Central Europe', box: [5.8, 45.8, 24.2, 55.1] },
  { id: 'northern-europe', label: 'Scandinavia & Baltic', box: [4.5, 53.5, 32, 71.5] },
  { id: 'eastern-europe', label: 'Eastern Europe', box: [22, 44, 60, 62] },
  { id: 'egypt-north-africa', label: 'Egypt & North Africa', box: [-17.5, 19, 36, 37.5] },
  { id: 'anatolia-levant', label: 'Anatolia & Levant', box: [25.5, 29, 45, 42.5] },
  { id: 'arabia', label: 'Arabia', box: [34, 12, 60, 32] },
  { id: 'mesopotamia-iran', label: 'Mesopotamia & Iran', box: [38, 24, 63.5, 40.5] },
  { id: 'central-asia', label: 'Central Asia', box: [46, 35, 90, 56] },
  { id: 'south-asia', label: 'South Asia', box: [60, 5, 97.5, 37.5] },
  { id: 'japan-korea', label: 'Japan & Korea', box: [124, 30, 146, 46] },
  { id: 'china', label: 'China', box: [73, 18, 135, 54] },
  { id: 'southeast-asia', label: 'Southeast Asia', box: [92, -11, 141, 28.5] },
  { id: 'sub-saharan-africa', label: 'Sub-Saharan Africa', box: [-18, -35, 52, 19] },
  { id: 'north-america', label: 'North America', box: [-170, 24, -50, 72] },
  { id: 'latin-america', label: 'Latin America & Caribbean', box: [-118, -56, -34, 33] },
  { id: 'oceania', label: 'Oceania', box: [110, -50, 180, 0] },
];

export function regionAt(lon: number, lat: number): RegionId | undefined {
  return REGIONS.find((r) => lon >= r.box[0] && lon <= r.box[2] && lat >= r.box[1] && lat <= r.box[3])?.id;
}
export const regionLabel = (id?: RegionId) => REGIONS.find((r) => r.id === id)?.label ?? 'this area';

export type PeriodId = 'prehistory' | 'bronze-iron' | 'classical' | 'early-medieval' | 'medieval' | 'early-modern' | 'long-19th' | 'modern';
export const PERIODS: { id: PeriodId; label: string; from: HistYear; to: HistYear }[] = [
  { id: 'prehistory', label: 'Before 3000 BCE', from: -100000, to: -3001 },
  { id: 'bronze-iron', label: '3000–500 BCE', from: -3000, to: -501 },
  { id: 'classical', label: '500 BCE–500 CE', from: -500, to: 500 },
  { id: 'early-medieval', label: '500–1000', from: 501, to: 1000 },
  { id: 'medieval', label: '1000–1500', from: 1001, to: 1500 },
  { id: 'early-modern', label: '1500–1800', from: 1501, to: 1800 },
  { id: 'long-19th', label: '1800–1914', from: 1801, to: 1914 },
  { id: 'modern', label: '1914–today', from: 1915, to: 3000 },
];
export const periodAt = (y: HistYear): PeriodId => PERIODS.find((p) => y >= p.from && y <= p.to)?.id ?? 'modern';
export const periodLabel = (id: PeriodId) => PERIODS.find((p) => p.id === id)!.label;

export type DataType =
  | 'places' | 'names' | 'settlements' | 'political' | 'administrative' | 'physical' | 'roads' | 'routes' | 'archaeological'
  | 'military' | 'battles' | 'trade' | 'religious' | 'cultural' | 'maps';
export const DATA_TYPES: { id: DataType; label: string; note?: string }[] = [
  { id: 'places', label: 'Places' },
  { id: 'names', label: 'Historical names' },
  { id: 'settlements', label: 'Settlements', note: 'cities, towns, villages' },
  { id: 'political', label: 'Political boundaries' },
  { id: 'administrative', label: 'Administrative boundaries' },
  { id: 'physical', label: 'Physical geography', note: 'rivers, coasts, terrain' },
  { id: 'roads', label: 'Roads' },
  { id: 'routes', label: 'Routes & journeys' },
  { id: 'archaeological', label: 'Archaeological sites' },
  { id: 'military', label: 'Military sites & forts' },
  { id: 'battles', label: 'Battles & events' },
  { id: 'trade', label: 'Trade routes & markets' },
  { id: 'religious', label: 'Religious sites' },
  { id: 'cultural', label: 'Cultural geography' },
  { id: 'maps', label: 'Historical maps' },
];

export type Quality = 'excellent' | 'moderate' | 'limited' | 'none';
export const QUALITY_RANK: Record<Quality, number> = { excellent: 3, moderate: 2, limited: 1, none: 0 };
export const QUALITY_MARK: Record<Quality, string> = { excellent: '🟢', moderate: '🟡', limited: '🟠', none: '🔴' };
export const QUALITY_LABEL: Record<Quality, string> = { excellent: 'Excellent', moderate: 'Moderate', limited: 'Limited', none: 'Very limited / no structured data' };
