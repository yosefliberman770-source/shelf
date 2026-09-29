// Years in the atlas follow the app's convention: -218 = 218 BCE, 1 = 1 CE,
// and there is no year 0. Some sources count astronomically (1 BCE = 0), so
// conversions live here and nowhere else.
import type { ExpressionSpecification } from 'maplibre-gl';

export type HistYear = number;

/** 218 BCE (-218) → -217 astronomical. */
export const toAstro = (y: HistYear) => (y < 0 ? y + 1 : y);
/** -217 astronomical → -218 (218 BCE). */
export const fromAstro = (a: number): HistYear => (a <= 0 ? a - 1 : a);
/** Middle of the year as a decimal, as OpenHistoricalMap tiles store dates. */
export const decimalYear = (y: HistYear) => toAstro(y) + 0.5;

/** Add years across the BCE/CE boundary without landing on year 0. */
export const shiftYear = (y: HistYear, by: number): HistYear => fromAstro(toAstro(y) + by);

export function yearLabel(y: HistYear): string {
  return y < 0 ? `${-y} BCE` : `${y} CE`;
}

export const MIN_YEAR: HistYear = -3400;
export const MAX_YEAR: HistYear = new Date().getFullYear();
export const clampYear = (y: HistYear) => Math.max(MIN_YEAR, Math.min(MAX_YEAR, y === 0 ? 1 : y));

/**
 * Filter for features that existed in year y, from their own from/to fields.
 * `undated` decides what happens to features that carry no dates at all.
 */
export function existedIn(y: HistYear, opts: { from?: string; to?: string; undated?: 'show' | 'hide' | { until: HistYear } } = {}): ExpressionSpecification {
  const f = opts.from ?? 'f';
  const t = opts.to ?? 't';
  const dated: ExpressionSpecification = ['any', ['has', f], ['has', t]];
  const inRange: ExpressionSpecification = ['all',
    ['any', ['!', ['has', f]], ['<=', ['get', f], y]],
    ['any', ['!', ['has', t]], ['>=', ['get', t], y]]];
  const undated = opts.undated ?? 'hide';
  const show = undated === 'show' || (typeof undated === 'object' && y <= undated.until);
  return show ? ['any', ['!', dated], inRange] : ['all', dated, inRange];
}

/** Events (single-year features) within ±window years of y. */
export function eventNear(y: HistYear, window: number, field = 'y'): ExpressionSpecification {
  const lo = shiftYear(y, -window);
  const hi = shiftYear(y, window);
  return ['all', ['>=', ['get', field], lo], ['<=', ['get', field], hi]];
}

/**
 * OpenHistoricalMap features that existed on the decimal date. Only features
 * with a start date are shown, so undated modern roads or towns never appear
 * on an ancient map.
 */
export function ohmExisted(y: HistYear): ExpressionSpecification {
  const d = decimalYear(y);
  return ['all',
    ['has', 'start_decdate'],
    ['<=', ['get', 'start_decdate'], d],
    ['any', ['!', ['has', 'end_decdate']], ['>', ['get', 'end_decdate'], d]]];
}
