// Historical years. Internally a year is an integer with NO year zero:
//   218 BCE → -218,  1 BCE → -1,  1 CE → 1,  1066 CE → 1066.
// OpenHistoricalMap (like ISO 8601) counts a year zero, so it gets its own
// conversion in toOhmYear(): 1 BCE → 0, 218 BCE → -217.

import { parseDate } from '../../world/histdate';

export interface HistoricalDate {
  year: number;
  /** "c. 218 BC", "the 3rd century BC", a decade… */
  approximate?: boolean;
}

/**
 * Parse a written date for the year box: "218 BC", "500 v. Chr.", "c. 50 B.C.", "AD 43", "1066", "-218",
 * "3rd century BC", "AH 600". The same grammar as the map archive and the build (src/world/histdate.ts parseDate);
 * a bare number is a year here ("43"). Anything but one exact year is marked approximate: a century or span gives its
 * middle, "before"/"after" its stated year. Undefined for anything else (and for year 0, which does not exist).
 */
export function parseHistoricalDate(input: string): HistoricalDate | undefined {
  const s = input.trim().replace(/\s+/g, ' ');
  const bare = /^(\d{1,5})$/.exec(s);
  if (bare) return Number(bare[1]) ? { year: Number(bare[1]) } : undefined;
  const d = parseDate(s);
  if (!d || d.precision === 'unknown') return undefined;
  if (d.precision === 'year' || d.precision === 'day') return { year: d.preferred ?? d.earliest! };
  if (d.preferred !== undefined) return { year: d.preferred, approximate: true };
  if (d.earliest !== undefined && d.latest !== undefined) return { year: Math.trunc((d.earliest + d.latest) / 2) || d.latest, approximate: true };
  const y = d.earliest ?? d.latest;
  return y === undefined ? undefined : { year: y, approximate: true };
}

/** -218 → "218 BCE", 1066 → "1066 CE". Style "bc" gives BC/AD instead. */
export function formatHistoricalDate(year: number | undefined, opts: { approximate?: boolean; style?: 'bce' | 'bc' } = {}): string {
  if (year === undefined || !Number.isFinite(year) || year === 0) return 'Historical date unknown';
  const c = opts.approximate ? 'c. ' : '';
  if (opts.style === 'bc') return year < 0 ? `${c}${-year} BC` : `${c}AD ${year}`;
  return year < 0 ? `${c}${-year} BCE` : `${c}${year} CE`;
}

/** Step a year without ever landing on the non-existent year 0. */
export function addYears(year: number, delta: number): number {
  let y = year + delta;
  // Crossing from BCE to CE (or back) skips zero.
  if (year < 0 && y >= 0) y += 1;
  else if (year > 0 && y <= 0) y -= 1;
  return y;
}

/** Year for OpenHistoricalMap / ISO 8601 (which has a year 0 = 1 BCE). */
export function toOhmYear(year: number): number {
  return year < 0 ? year + 1 : year;
}

/** OpenHistoricalMap date string, e.g. -218 → "-0217", 1066 → "1066". */
export function toOhmDate(year: number): string {
  const y = toOhmYear(year);
  const abs = String(Math.abs(y)).padStart(4, '0');
  return y < 0 ? `-${abs}` : abs;
}

export interface DateMention { year: number; approximate?: boolean; index: number; text: string; /** a written span ("between 1270 and 1290") */ from?: number; to?: number }

/** Spans written in a passage: "between 1270 and 1290", "1270–90", "the 12th–13th centuries", "218–201 BC" — read
 *  whole by the shared date grammar, never as their first year or their last century (A12-008). */
const SPAN_RE = /\bbetween\s+(?:c\.\s*)?\d{3,4}\s+and\s+\d{3,4}(?:\s*(?:BC|BCE|B\.C\.|AD|CE))?|\b\d{3,4}\s*[–—-]\s*\d{2,4}(?:\s*(?:BC|BCE|B\.C\.?|AD|CE))?(?![\d-])|\b\d{1,2}(?:st|nd|rd|th)\s*[–—-]\s*\d{1,2}(?:st|nd|rd|th)\s+centur(?:y|ies)(?:\s+(?:BC|BCE|B\.C\.?|AD|CE))?/gi;
function spansIn(text: string): DateMention[] {
  const out: DateMention[] = [];
  for (const m of text.matchAll(SPAN_RE)) {
    const d = parseDate(m[0]);
    if (!d || d.earliest === undefined || d.latest === undefined || d.earliest === d.latest) continue;
    out.push({ year: Math.trunc((d.earliest + d.latest) / 2) || d.latest, approximate: true, index: m.index ?? 0, text: m[0], from: d.earliest, to: d.latest });
  }
  return out;
}

/** Words that may follow a year in running text ("the battle of 1066 was…"); any other lower-case word after a number makes it a count. */
const AFTER_YEAR = new Set(('the a an and or but nor so yet when while as at in on by to for from with without into onto upon after before until since during about against among between ' +
  'he she it they we i you his her its their our was were is are had has have would could should might must did does do been being which that who whom whose where ' +
  'there this these those then also both only even still however').split(' '));

/** "an army of 1200 men", "by 300 ships": a number followed by a lower-case noun is a count, not a year (PA-007, TM-4). */
function isCount(text: string, end: number): boolean {
  const next = text.slice(end).match(/^\s+([a-z]+)/);
  return !!next && !AFTER_YEAR.has(next[1]);
}

/** An era word right after a number: the number is read with its era ("in 1000 BC"), never as a CE year. */
const ERA_AFTER = /^\s?(?:B\.?\s?C\.?|BCE\b|A\.?\s?D\.?|C\.?\s?E\.?(?![a-z])|v\.\s?Chr|a\.\s?C\.)/i;
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?';
const DATE_RE = new RegExp('\\b(?:' + [
  String.raw`(?:(c\.|ca\.|circa)\s*)?(?:(\d{1,2})(?:st|nd|rd|th)\s+century\s+(B\.?\s?C\.?(?:E\.?)?|A\.?D\.?|C\.?E\.?))`,
  String.raw`(\d{1,4})\s?(B\.?\s?C\.?(?:E\.?)?|A\.?\s?D\.?|C\.?\s?E\.?)(?![a-z])`,
  String.raw`(A\.?\s?D\.?)\s?(\d{1,4})`,
  String.raw`(in|by|of|from|until|till|since|after|before|around|about|circa|c\.)\s+(?:the\s+year\s+)?(\d{3,4})(?![\d,.]\d)`,
  String.raw`(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?${MONTH}\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{3,4})(?!\d)`,
  String.raw`the\s+year\s+(\d{3,4})`,
  String.raw`(?:the\s+)?(\d{3}0'?s)(?![a-z])`,
].join('|') + ')', 'gi');

/**
 * Years written in a passage: "in 218 BC", "216 B.C.", "AD 43", "the 3rd century BC", "in 1453", "in 793", "May 1453",
 * "14 October 1066", "the year 410", "the 1200s". A number before an era word is read with its era — "in 1000 BC" is
 * 1000 BCE, never 1000 CE (A12-002). Three-digit years count after a dating word ("in", "by", "around"…), not after
 * "of" or "from", where they are usually counts (A12-012, A8-030); a number followed by a noun is a count (TM-4).
 */
export function findDatesInText(text: string): DateMention[] {
  const out: DateMention[] = spansIn(text);
  const inSpan = (i: number) => out.some((sp) => sp.from !== undefined && i >= sp.index && i < sp.index + sp.text.length);
  const re = new RegExp(DATE_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index;
    const end = at + m[0].length;
    let parsed: HistoricalDate | undefined;
    if (m[2]) parsed = parseHistoricalDate(`${m[2]}th century ${m[3]}`);
    else if (m[4]) parsed = parseHistoricalDate(`${m[4]} ${m[5]}`);
    else if (m[7]) parsed = parseHistoricalDate(`AD ${m[7]}`);
    else if (m[9]) {
      // "in 1000 BC": the number belongs to its era — scan again from the number itself.
      if (ERA_AFTER.test(text.slice(end))) { re.lastIndex = at + m[8].length; continue; }
      const y = Number(m[9]);
      const ok = (y >= 1000 && y <= 2029) || (y >= 100 && y < 1000 && !/^(?:of|from)$/i.test(m[8]));
      parsed = ok && !isCount(text, end) ? { year: y } : undefined;
    } else if (m[12]) {
      const y = Number(m[12]);
      parsed = y >= 100 && y <= 2029 && !ERA_AFTER.test(text.slice(end)) ? { year: y } : undefined;
    } else if (m[13]) {
      const y = Number(m[13]);
      parsed = y >= 100 && y <= 2029 && !isCount(text, end) ? { year: y } : undefined;
    } else if (m[14]) {
      const d = parseDate(m[14]);
      if (d?.earliest !== undefined && d.latest !== undefined && !inSpan(at)) out.push({ year: Math.trunc((d.earliest + d.latest) / 2), approximate: true, index: at, text: m[0], from: d.earliest, to: d.latest });
      continue;
    }
    if (parsed && !inSpan(at) && !inSpan(end - 1)) out.push({ ...parsed, approximate: parsed.approximate || !!m[1] || undefined, index: at, text: m[0] });
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * The date that governs a position in the text (e.g. a place mention): the
 * last date written before it — narrative dates apply to what follows — or,
 * if none comes before, the first one after it.
 */
export function nearestDate(text: string, at: number): DateMention | undefined {
  const all = findDatesInText(text);
  const before = all.filter((d) => d.index <= at);
  return before.length ? before[before.length - 1] : all.find((d) => d.index > at);
}
