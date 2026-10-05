// Historical dates that keep their uncertainty.
//
// A date is never collapsed into one exact year unless the source gave one.
// "c. 1200" stays "about 1200" (earliest 1175, latest 1225, precision
// "circa"); "12th century" stays a century; a source's broad period stays a
// period. Years follow the app's convention: -218 = 218 BCE, no year 0.
import { shiftYear, yearLabel, type HistYear } from '../atlas/time';

export type DatePrecision = 'day' | 'year' | 'circa' | 'decade' | 'century' | 'range' | 'period' | 'unknown';
export type DateQualifier = 'exact' | 'circa' | 'before' | 'after' | 'between' | 'during';

export interface HistDate {
  /** Earliest possible year (undefined = open). */
  earliest?: HistYear;
  /** Latest possible year (undefined = open). */
  latest?: HistYear;
  /** A preferred or estimated year, only when the source gives one. */
  preferred?: HistYear;
  precision: DatePrecision;
  qualifier: DateQualifier;
  /** The source's own wording or period name ("Roman", "889 ~ 892"). */
  label?: string;
  /** Who says so. */
  source?: string;
  /** Other sources' dates for the same thing, kept rather than averaged. */
  conflicts?: HistDate[];
}

export const UNKNOWN_DATE: HistDate = { precision: 'unknown', qualifier: 'exact' };

export const exactYear = (y: HistYear, source?: string): HistDate => ({ earliest: y, latest: y, preferred: y, precision: 'year', qualifier: 'exact', source });
export const yearRange = (a: HistYear | undefined, b: HistYear | undefined, opts: Partial<HistDate> = {}): HistDate =>
  a === undefined && b === undefined ? { ...UNKNOWN_DATE, ...opts } : { earliest: a, latest: b, precision: 'range', qualifier: 'between', ...opts };
/** "About y": ± slack years, never shown as exact. */
export const circa = (y: HistYear, slack = 25, source?: string): HistDate => ({ earliest: shiftYear(y, -slack), latest: shiftYear(y, slack), preferred: y, precision: 'circa', qualifier: 'circa', source });
export function century(n: number, bce = false, source?: string): HistDate {
  // 12th century CE = 1101–1200; 3rd century BCE = 300–201 BCE.
  const a: HistYear = bce ? -(n * 100) : (n - 1) * 100 + 1;
  const b: HistYear = bce ? -((n - 1) * 100 + 1) : n * 100;
  return { earliest: a, latest: b, precision: 'century', qualifier: 'during', label: `${ordinal(n)} century${bce ? ' BCE' : ''}`, source };
}
export const decade = (start: HistYear, source?: string): HistDate => ({ earliest: start, latest: start + 9, precision: 'decade', qualifier: 'during', label: `${start}s`, source });
/** A dataset's broad period (e.g. Pleiades "Roman" 30 BCE–300 CE). */
export const period = (a: HistYear | undefined, b: HistYear | undefined, label?: string, source?: string): HistDate =>
  a === undefined && b === undefined ? { ...UNKNOWN_DATE, source } : { earliest: a, latest: b, precision: 'period', qualifier: 'during', label, source };

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** How a date relates to a year: definitely within, possibly (uncertain edges), or outside. */
export type DateRelation = 'within' | 'possible' | 'outside' | 'unknown';
export function relation(d: HistDate | undefined, year: HistYear): DateRelation {
  if (!d || d.precision === 'unknown') return 'unknown';
  const lo = d.earliest ?? -Infinity;
  const hi = d.latest ?? Infinity;
  if (year < lo || year > hi) return 'outside';
  // Exact dates and ranges bounded on both sides are "within"; circa, open-ended and broad periods only "possible".
  if (d.precision === 'year' || d.precision === 'day' || ((d.precision === 'range' || d.precision === 'decade') && d.earliest !== undefined && d.latest !== undefined)) return 'within';
  return 'possible';
}

/** Plain wording that keeps the uncertainty. */
export function formatDate(d: HistDate | undefined): string {
  if (!d || d.precision === 'unknown') return 'date not recorded';
  const Y = yearLabel;
  switch (d.precision) {
    case 'day':
    case 'year': return d.preferred !== undefined ? Y(d.preferred) : Y(d.earliest!);
    case 'circa': return `about ${Y(d.preferred ?? d.earliest!)}`;
    case 'decade':
    case 'century': return d.label ?? `${Y(d.earliest!)}–${Y(d.latest!)}`;
    case 'period':
    case 'range': {
      const body = d.earliest !== undefined && d.latest !== undefined ? `${Y(d.earliest)} – ${Y(d.latest)}` : d.earliest !== undefined ? `from ${Y(d.earliest)}` : `until ${Y(d.latest!)}`;
      if (d.qualifier === 'before') return `before ${Y(d.latest!)}`;
      if (d.qualifier === 'after') return `after ${Y(d.earliest!)}`;
      return d.precision === 'period' ? `${d.label ? `${d.label}: ` : ''}${body} (broad period)` : body;
    }
  }
}

// ── Reading dates out of text and sources ────────────────────────────────

const ERA_BCE = /\b(?:BCE|B\.C\.E\.|BC|B\.C\.)/i;
const WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21 };

/**
 * Parse a date phrase: "218 BC", "c. 1200", "circa 1200 AD", "12th century",
 * "the third century BC", "218–201 BC", "1350s", "before 500", "after 1066".
 * Returns undefined when nothing is recognised — never a guess.
 */
export function parseDate(text: string, source?: string): HistDate | undefined {
  // Typographic minus signs (−, –, ‒, —) before a lone year are minus signs, not ranges (PA-014).
  const t = text.trim().replace(/(^|[\s(\[])[\u2212\u2012\u2013\u2014](?=\d)/g, '$1-');
  // Hijri years ("AH 600", "600 AH", "1099 H.") are converted, never read as CE (PA-014).
  const hijri = t.match(/\bA\.?\s?H\.?\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:A\.?\s?H\.?|H\.)(?=\s|$|[,;)])/);
  if (hijri) {
    const ah = Number(hijri[1] ?? hijri[2]);
    const ce = Math.round(ah * 0.970229 + 621.5643);
    return { ...circa(ce, 1, source), label: `${ah} AH (about ${ce} CE)` };
  }
  // A lone negative number is a BCE year ("-500"), as in the build's data.
  const neg = t.match(/^-(\d{1,4})$/);
  if (neg) return exactYear(-Number(neg[1]), source);
  // Catalogue conventions (map libraries): "[18--]" / "18--" a century, "176-?" / "176-" a decade, "c1760", "[1760?]".
  let c = t.match(/^\[?(\d{2})--\??\]?$/);
  if (c) return { earliest: Number(c[1]) * 100, latest: Number(c[1]) * 100 + 99, precision: 'century', qualifier: 'between', label: `${c[1]}00s`, source };
  c = t.match(/^\[?(\d{3})-\??\]?$/);
  if (c) return { ...decade(Number(c[1]) * 10, source), label: `${c[1]}0s${t.includes('?') ? ' (uncertain)' : ''}` };
  c = t.match(/^\[?c(\d{3,4})\??\]?$/i) ?? t.match(/^\[(\d{3,4})\?\]$/);
  if (c) return circa(Number(c[1]), 5, source);
  // An abbreviated range: "1760-65" is 1760–1765, "1066–87" 1066–1087, "1798-02" 1798–1802 (PA-013).
  const ab = t.match(/^\[?(\d{3,4})\s*[–—-]\s*(\d{1,2})\]?$/);
  if (ab && !ERA_BCE.test(t)) {
    const a = Number(ab[1]);
    let b = Number(ab[1].slice(0, ab[1].length - ab[2].length) + ab[2]);
    if (b < a) b += 10 ** ab[2].length;
    return { earliest: a, latest: b, precision: 'range', qualifier: 'between', source };
  }
  const bce = ERA_BCE.test(t);
  const sign = (n: number) => (bce ? -n : n);
  let m = t.match(/(\d{1,2})(?:st|nd|rd|th)\s+century/i) ?? t.match(new RegExp(`\\b(${Object.keys(WORDS).join('|')})\\s+century`, 'i'));
  if (m) {
    const n = /\d/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()];
    return century(n, bce, source);
  }
  m = t.match(/\b(\d{3,4})s\b/);
  if (m && !bce) return decade(Number(m[1]), source);
  m = t.match(/\b(\d{1,4})\s*(?:[–—-]|to)\s*(\d{1,4})\b/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    if (bce) { [a, b] = [-a, -b]; }
    return { earliest: Math.min(a, b), latest: Math.max(a, b), precision: 'range', qualifier: 'between', source };
  }
  m = t.match(/\b(?:c\.|ca\.|circa|about|around|approximately)\s*(\d{1,4})\b/i);
  if (m) return circa(sign(Number(m[1])), 25, source);
  m = t.match(/\bbefore\s+(\d{1,4})\b/i);
  if (m) return { latest: sign(Number(m[1])), precision: 'range', qualifier: 'before', source };
  m = t.match(/\bafter\s+(\d{1,4})\b/i);
  if (m) return { earliest: sign(Number(m[1])), precision: 'range', qualifier: 'after', source };
  m = t.match(/\b(\d{1,4})\b/);
  if (m && (bce || /\b(?:AD|CE|A\.D\.)\b/i.test(t) || m[1].length >= 3)) return exactYear(sign(Number(m[1])), source);
  return undefined;
}

/** CHGIS/TGAZ "889 ~ 892" (BCE years are negative). */
export function fromTgaz(years: string | undefined): HistDate {
  const m = years?.match(/(-?\d+)\s*~\s*(-?\d+)/);
  return m ? { earliest: Number(m[1]), latest: Number(m[2]), precision: 'range', qualifier: 'between', label: years, source: 'CHGIS' } : { ...UNKNOWN_DATE, source: 'CHGIS' };
}

/** HistoGIS ISO dates with accuracy codes: "D" day, "M" month, "Y" year. */
export function fromIsoRange(start?: string, end?: string, accuracy?: string, source?: string): HistDate {
  const y = (s?: string) => (s ? Number(s.slice(0, s.startsWith('-') ? 5 : 4)) : undefined);
  return { earliest: y(start), latest: y(end), precision: accuracy === 'D' || accuracy === 'M' ? 'day' : 'range', qualifier: 'between', label: start && end ? `${start} – ${end}` : undefined, source };
}

/** Keep every source's date: the first becomes the main one, the rest are recorded as conflicts if they differ. */
export function mergeDates(dates: HistDate[]): HistDate | undefined {
  const known = dates.filter((d) => d.precision !== 'unknown');
  if (!known.length) return dates[0];
  const [main, ...rest] = known;
  const differ = rest.filter((d) => d.earliest !== main.earliest || d.latest !== main.latest);
  return differ.length ? { ...main, conflicts: differ } : main;
}
