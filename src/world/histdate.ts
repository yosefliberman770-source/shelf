// Historical dates that keep their uncertainty.
//
// A date is never collapsed into one exact year unless the source gave one.
// "c. 1200" stays "about 1200" (earliest 1175, latest 1225, precision
// "circa"); "12th century" stays a century; a source's broad period stays a
// period. Years follow the app's convention: -218 = 218 BCE, no year 0.
import { chronologyDependent, shiftYear, yearLabel, type HistYear } from '../atlas/time';

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
  /** The calendar the source wrote it in, when not the Gregorian/Julian year count (a Hijri year is converted, and says so). */
  calendar?: 'hijri';
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

/** Plain wording that keeps the uncertainty; a year before 763 BCE is marked chronology-dependent (AR-7). */
export function formatDate(d: HistDate | undefined): string {
  if (!d || d.precision === 'unknown') return 'date not recorded';
  const body = formatBody(d);
  return chronologyDependent(d.earliest ?? d.latest) ? `${body} (chronology-dependent)` : body;
}

function formatBody(d: HistDate): string {
  const Y = yearLabel;
  switch (d.precision) {
    case 'day':
    case 'year': return d.preferred !== undefined ? Y(d.preferred) : Y(d.earliest!);
    case 'circa': return `about ${Y(d.preferred ?? d.earliest!)}${d.calendar === 'hijri' && d.label ? ` (${d.label.split(' (')[0]})` : ''}`;
    case 'decade':
    case 'century': return d.label ?? `${Y(d.earliest!)}–${Y(d.latest!)}`;
    case 'period':
    case 'range': {
      const body = d.earliest !== undefined && d.latest !== undefined ? `${Y(d.earliest)} – ${Y(d.latest)}` : d.earliest !== undefined ? `from ${Y(d.earliest)}` : `until ${Y(d.latest!)}`;
      if (d.qualifier === 'before') return `before ${Y(d.latest!)}`;
      if (d.qualifier === 'after') return `after ${Y(d.earliest!)}`;
      return d.precision === 'period' ? `${d.label ? `${d.label}: ` : ''}${body} (broad period)` : body;
    }
    default: return 'date not recorded';
  }
}

// ── Reading dates out of text and sources ────────────────────────────────
//
// One grammar with the build (scripts/atlas-build/dates.py): src/world/date-battery.json holds both to the same answer
// for every case, so a map, a card and the build never read the same words differently (TM-1). The order of the steps and
// every pattern below mirror the Python; change both together.

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21 };
const PART: Record<string, [number, number]> = { early: [0, 33], 'first half': [0, 50], '1st half': [0, 50], mid: [33, 66], middle: [33, 66], 'second half': [50, 100], '2nd half': [50, 100], late: [66, 100], end: [75, 100], beginning: [0, 25], start: [0, 25] };
const WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21 };
// Before Christ in English, German (v. Chr.), Latin (a. Chr.), Italian/Spanish (a.C.), French (av. J.-C.), Czech/Slovak (př. n. l.),
// Polish (p.n.e.), Scandinavian (f.Kr.), Russian (до н. э.), Hungarian (i. e.).
const BCE = /(?<![a-z])(bc|bce|b\.\s?c\.?(?:\s?e\.?)?(?![a-z])|v\.\s?chr|a\.\s?chr|a\.\s?c\.?(?![a-z])|av\.?\s?j\.?-?\s?c|av\.\s?n\.\s?è|pr\.\s?n\.\s?l|př\.\s?n\.\s?l|p\.\s?n\.\s?e|f\.\s?kr|до н\.\s?э|i\.\s?e\.)/i;
const CE = /(?<![a-z])(ad|ce|a\.\s?d\.?|c\.\s?e\.|n\.\s?chr|d\.\s?c\.|ap\.\s?j\.?-?\s?c|n\.\s?e\.|e\.\s?kr|n\.\s?l\.)(?![a-z])/i;
const CIRCA = /(?<![a-z])(circa|about|around|approximately|approx\.?|um|gegen|vers|environ|około|ок\.?|cca\.?|~)(?![a-z])/i;
const NOT_BEFORE = /\b(not before|nicht vor|non ante|pas avant)\b/i;
const NOT_AFTER = /\b(not after|nicht nach|non post|pas après)(?![a-z])/i;
const AFTER = /(?<![a-zà-ÿ])(after|post|nach|après|apres|po|od|from|since|seit)(?![a-zà-ÿ])/i;
const BEFORE = /\b(before|ante|vor|avant|przed|do|until|bis)\b/i;
const NO_DATE = new Set(['nan', 'none', 'null', 'unknown', 'undetermined', 'neznámé', 'unbekannt', 'inconnu', '-', '?', 'n.d.', 'n. d.', 's.d.', 'o.j.', 'sine anno', 's.a.']);
const CW = String.raw`(?:c\b|c\.|cent|century|centuries|jh|jahrh|siècle|siecle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|století|stor|st\.|vek|век)`;
const HIJRI = /\bA\.?\s?H\.?\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:A\.?\s?H\.?|H\.)(?=\s|$|[,;)])/;
const ROMAN_YEAR = /^M{1,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

function centuryWindow(n: number, bce = false, part?: string): [number, number] {
  let a = (n - 1) * 100 + 1;
  let b = n * 100;
  if (part) {
    const [p0, p1] = PART[part];
    [a, b] = [a + p0, p1 < 100 ? a + p1 - 1 : b];
  }
  return bce ? [-b, -a] : [a, b];
}

/** The Common Era year in which most of Hijri year ah falls. */
export const hijriToCe = (ah: number) => Math.floor(ah * 0.970229 + 621.5643 + 0.5);

function romanValue(s: string) {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let i = 0; i < s.length; i++) n += i + 1 < s.length && v[s[i + 1]] > v[s[i]] ? -v[s[i]] : v[s[i]];
  return n;
}

function normalise(text: string) {
  let t = text.trim().replace(/(^|[\s(\[:;,])[−‒–—](?=\d)/g, '$1-');
  let m = t.match(/^\[(.*)\]$/);
  if (m) t = m[1].trim();
  m = t.match(/^(\d{1,2}),(\d{3})$/);
  if (m) t = m[1] + m[2];
  m = t.match(/^(-?\d{1,4})\.0+$/);
  if (m) t = m[1];
  return t;
}

type Parsed = [number | undefined, number | undefined, 'year' | 'circa' | 'years' | 'century' | 'from year' | 'until year'];

/** The shared grammar's answer, as the Python gives it: (from, to, how), or undefined for no date. */
export function parseDating(text: string): Parsed | undefined {
  let t = normalise(text);
  if (!t || NO_DATE.has(t.toLowerCase())) return undefined;
  let m = t.match(/^(-?\d{1,4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const y = Number(m[1]);
    return y ? [y, y, 'year'] : undefined;
  }
  m = t.match(/^(-?\d{1,4})\s*(?:(?:[–—:]|\s-\s|\bto\b)\s*(-?\d{1,4}))?$/);
  if (m && (t.startsWith('-') || (m[2] ?? '').startsWith('-'))) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a === 0 || b === 0 || a > b) return undefined;
    return [a, b, a !== b ? 'years' : 'year'];
  }
  if (ROMAN_YEAR.test(t)) {
    const y = romanValue(t);
    return [y, y, 'year'];
  }
  m = t.match(HIJRI);
  if (m) {
    const ce = hijriToCe(Number(m[1] ?? m[2]));
    return [ce, ce, 'circa'];
  }
  if ((m = t.match(/^(\d{2})--\??$/))) return [Number(m[1]) * 100, Number(m[1]) * 100 + 99, 'years'];
  if ((m = t.match(/^(\d{3})-\??$/))) return [Number(m[1]) * 10, Number(m[1]) * 10 + 9, 'years'];
  if ((m = t.match(/^c(\d{3,4})\??$/i) ?? t.match(/^(\d{3,4})\s*\?$/))) return [Number(m[1]), Number(m[1]), 'circa'];
  let low = t.toLowerCase();
  const bce = BCE.test(low);
  const era = bce || CE.test(low);
  t = t.replace(/(?<![A-Za-z])(?:ca|c)\.?\s*(?=\d)/gi, 'circa ');
  low = t.toLowerCase();
  const cents: [number, number][] = [];
  for (const c of low.matchAll(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*[-–/]\s*(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?\s*` + CW, 'g'))) {
    const [a, b] = [Number(c[1]), Number(c[2])];
    if (a >= 1 && a <= b && b <= 21) cents.push([!bce ? centuryWindow(a)[0] : -b * 100, !bce ? centuryWindow(b)[1] : -(a - 1) * 100 - 1]);
  }
  for (const c of low.matchAll(new RegExp(String.raw`\b([ivxl]{1,6})\.?\s*[-–/]\s*([ivxl]{1,6})\.?\s*` + CW, 'g'))) {
    const [a, b] = [ROMAN[c[1]], ROMAN[c[2]]];
    if (a && b && a <= b) cents.push([centuryWindow(a, bce)[0], centuryWindow(b, bce)[1]]);
  }
  for (const c of low.matchAll(new RegExp(String.raw`(?:(early|late|mid|middle|first half|1st half|second half|2nd half|end|beginning)(?:\s+of)?\s+(?:the\s+)?)?\b(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?\s*` + CW, 'g'))) {
    const part = c[1]?.trim();
    cents.push(centuryWindow(Number(c[2]), bce, part && part in PART ? part : undefined));
  }
  for (const c of low.matchAll(new RegExp(String.raw`\b(${Object.keys(WORDS).join('|')})\s+century`, 'g'))) cents.push(centuryWindow(WORDS[c[1]], bce));
  for (const c of low.matchAll(/\b([ivxl]{1,6})\.?\s*(?:c\b|c\.|cent|century|jh|siècle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|st\.|vek|век|e\b|ème)/g)) {
    const n = ROMAN[c[1]];
    if (n) cents.push(centuryWindow(n, bce));
  }
  let years = [...t.matchAll(/(?<![\d.,])(\d{3,4})(?![\d.,])/g)].map((x) => Number(x[1])).filter((y) => y >= 100 && y <= 2100);
  if (era) years.push(...[...t.matchAll(/(?<![\d.,\p{L}\p{N}_])(\d{1,2})(?![\d.,]|\s*(?:st|nd|rd|th|e|er|ème)\b|\p{L})/gu)].map((x) => Number(x[1])).filter((y) => y > 0));
  for (const x of t.matchAll(/(?<![\d.,/-])(\d{4})\s*[-–/]\s*(\d{1,2})(?![\d.,])(?!\s*[-–/.]\s*\d)/g)) {
    const a = Number(x[1]);
    let end = Number(x[1].slice(0, 4 - x[2].length) + x[2]);
    if (end <= a) end += 10 ** x[2].length;
    if (a < end && end <= 2100) years.push(end);
  }
  for (const x of t.matchAll(/(?<![\d.,])(\d{3})0'?s\b/g)) years.push(Number(`${x[1]}0`), Number(`${x[1]}9`));
  if (bce) years = years.map((y) => -y);
  if (cents.length && !years.length) return [Math.min(...cents.map((c) => c[0])), Math.max(...cents.map((c) => c[1])), 'century'];
  if (!years.length) return undefined;
  let lo = Math.min(...years);
  let hi = Math.max(...years);
  if (cents.length) [lo, hi] = [Math.min(lo, ...cents.map((c) => c[0])), Math.max(hi, ...cents.map((c) => c[1]))];
  if (new Set(years).size === 1 && !cents.length) {
    if (NOT_BEFORE.test(low)) return [lo, undefined, 'from year'];
    if (NOT_AFTER.test(low)) return [undefined, hi, 'until year'];
    if (AFTER.test(low)) return [lo, undefined, 'from year'];
    if (BEFORE.test(low) && !/\bod\b/.test(low)) return [undefined, hi, 'until year'];
    if (CIRCA.test(low) || /\d\s*\?/.test(low)) return [lo, hi, 'circa'];
  }
  return [lo, hi, lo !== hi ? 'years' : 'year'];
}

/**
 * Parse a date phrase: "218 BC", "500 v. Chr.", "c. 1200", "12th century", "218–201 BC", "1350s", "before 500",
 * "nach 1300", "1750 or 1751", "AH 600", "[18--]". Returns undefined when nothing is recognised — never a guess.
 */
export function parseDate(text: string, source?: string): HistDate | undefined {
  const p = parseDating(text);
  if (!p) return undefined;
  const [a, b, how] = p;
  const t = normalise(text);
  if (how === 'year') return exactYear(a!, source);
  if (how === 'circa') {
    const hijri = t.match(HIJRI);
    if (hijri) return { ...circa(a!, 1, source), label: `${hijri[1] ?? hijri[2]} AH (about ${a} CE)`, calendar: 'hijri' };
    return circa(a!, /^c\d|\?$/i.test(t) ? 5 : 25, source);
  }
  if (how === 'from year') return { earliest: a, precision: 'range', qualifier: 'after', source };
  if (how === 'until year') return { latest: b, precision: 'range', qualifier: 'before', source };
  if (/^\d{2}--\??$/.test(t)) return { earliest: a, latest: b, precision: 'century', qualifier: 'between', label: `${t.slice(0, 2)}00s`, source };
  if (/^\d{3}-\??$/.test(t)) return { ...decade(a!, source), label: `${t.slice(0, 3)}0s${t.includes('?') ? ' (uncertain)' : ''}` };
  if (how === 'century') {
    for (let n = 1; n <= 21; n++) {
      for (const bce of [false, true]) {
        const c = century(n, bce, source);
        if (c.earliest === a && c.latest === b) return c;
      }
    }
    return { earliest: a, latest: b, precision: 'century', qualifier: 'during', label: t, source };
  }
  if (b! - a! === 9 && a! % 10 === 0 && /\d0'?s\b/.test(t)) return decade(a!, source);
  return { earliest: a, latest: b, precision: 'range', qualifier: 'between', source };
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
