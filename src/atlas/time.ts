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

// ── Temporal validity ──────────────────────────────────────────────────────
//
// A record's dates say when its source attests it. Missing dates are NOT
// "valid at all times": an undated record is `undated` — it can still identify
// a place, but it never counts as existing in a given year. A missing start or
// end means "open on that side *within the dataset's own period*": a source
// only speaks for the period it covers, so the window caps open ranges.

//
// Four kinds of temporal knowledge, kept apart:
//   A. known dates        — the record's own dates (from/to)
//   B/C. a period         — no dates of its own, but evidence bounds when it
//                           existed: dated records linked to it, the larger
//                           place it belongs to, or a source/dataset whose own
//                           period is defined (the Barrington Atlas; Viabundus
//                           1350–1650; al-Ṯurayyā 9th–10th c.). Eligible inside
//                           that period, shown as approximate — never outside it.
//   D. unknown            — no evidence at all. Not placed in dated views.

/** Why a record without dates is still bounded in time. */
export type EnvelopeBasis = 'related' | 'part-of' | 'source' | 'dataset' | 'names';
export interface Envelope { from?: HistYear; to?: HistYear; basis: EnvelopeBasis }
export const ENVELOPE_LABEL: Record<EnvelopeBasis, string> = {
  related: 'dated records linked to it (sites at it, roads it lies on, connections)',
  'part-of': 'the dated larger place or region it is recorded as part of',
  source: 'the period covered by the reference work it comes from',
  dataset: 'the period the whole dataset covers',
  names: 'the dates of its recorded names',
};

/**
 * within = attested at the year; near = within the slack; period = no dates of
 * its own but inside the period its evidence allows; earlier / later = outside
 * its dates (or period); undated = no temporal evidence at all.
 */
export type TimeFit = 'within' | 'near' | 'period' | 'earlier' | 'later' | 'undated';

export function timeFit(span: { from?: HistYear; to?: HistYear; envelope?: Envelope }, year: HistYear, opts: { slack?: number; window?: [HistYear, HistYear] } = {}): TimeFit {
  if (span.from === undefined && span.to === undefined) {
    const e = span.envelope;
    if (!e) return 'undated';
    const lo = e.from ?? opts.window?.[0] ?? -Infinity;
    const hi = e.to ?? opts.window?.[1] ?? Infinity;
    // No slack: the period is already the widest the evidence allows.
    return year < lo ? 'later' : year > hi ? 'earlier' : 'period';
  }
  const lo = span.from ?? opts.window?.[0] ?? -Infinity;
  const hi = span.to ?? opts.window?.[1] ?? Infinity;
  if (lo <= year && year <= hi) return 'within';
  const slack = opts.slack ?? 0;
  if (lo - slack <= year && year <= hi + slack) return 'near';
  return year > hi ? 'earlier' : 'later';
}

/** Attested at (or near) the year by its own dates. */
export const attestedAt = (span: { from?: HistYear; to?: HistYear; envelope?: Envelope }, year: HistYear, opts: { slack?: number; window?: [HistYear, HistYear] } = {}) => {
  const f = timeFit(span, year, opts);
  return f === 'within' || f === 'near';
};
/** Can be shown at the year: attested, or inside the period its evidence allows (then shown as approximate). */
export const eligibleAt = (span: { from?: HistYear; to?: HistYear; envelope?: Envelope }, year: HistYear, opts: { slack?: number; window?: [HistYear, HistYear] } = {}) => {
  const f = timeFit(span, year, opts);
  return f === 'within' || f === 'near' || f === 'period';
};

/**
 * Filter for features that existed in year y, from their own from/to fields.
 * `undated` decides what happens to features that carry no dates at all.
 */
export function existedIn(y: HistYear, opts: { from?: string; to?: string; undated?: 'show' | 'hide' | { within: [HistYear, HistYear] }; window?: [HistYear, HistYear]; envelope?: { from: string; to: string } } = {}): ExpressionSpecification {
  const f = opts.from ?? 'f';
  const t = opts.to ?? 't';
  const dated: ExpressionSpecification = ['any', ['has', f], ['has', t]];
  if (opts.envelope) {
    // Records without dates but with an evidence period: shown inside it only.
    const { from: ef, to: et } = opts.envelope;
    const hasEnv: ExpressionSpecification = ['any', ['has', ef], ['has', et]];
    const inEnv: ExpressionSpecification = ['all', ['!', dated], hasEnv,
      ['any', ['!', ['has', ef]], ['<=', ['get', ef], y]], ['any', ['!', ['has', et]], ['>=', ['get', et], y]],
      ...(opts.window ? [['boolean', y >= opts.window[0] && y <= opts.window[1]] as ExpressionSpecification] : [])];
    const rest = existedIn(y, { ...opts, envelope: undefined });
    // "undated" now means no evidence at all (neither dates nor a period).
    const noEvidence: ExpressionSpecification = ['all', ['!', dated], ['!', hasEnv]];
    return ['any', inEnv, ['all', ['any', dated, noEvidence], rest]];
  }
  // An open side is capped by the dataset's own window, never unbounded.
  const w = opts.window;
  const inRange: ExpressionSpecification = ['all',
    ['any', ['!', ['has', f]], ['<=', ['get', f], y]],
    ['any', ['!', ['has', t]], ['>=', ['get', t], y]],
    ...(w ? [['boolean', y >= w[0] && y <= w[1]] as ExpressionSpecification] : [])];
  const undated = opts.undated ?? 'hide';
  // Undated records only where the source's documented semantics say they apply ('show'),
  // or — when the reader asks to see undated records — inside the dataset's own period.
  const show = undated === 'show' || (typeof undated === 'object' && y >= undated.within[0] && y <= undated.within[1]);
  return show ? ['any', ['!', dated], inRange] : ['all', dated, inRange];
}

/** Events within ±window years of y. Events with an end year (y2) count for their whole span. */
export function eventNear(y: HistYear, window: number, field = 'y'): ExpressionSpecification {
  const lo = shiftYear(y, -window);
  const hi = shiftYear(y, window);
  return ['all', ['<=', ['get', field], hi], ['>=', ['coalesce', ['get', `${field}2`], ['get', field]], lo]];
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
