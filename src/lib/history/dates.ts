// Historical years. Internally a year is an integer with NO year zero:
//   218 BCE → -218,  1 BCE → -1,  1 CE → 1,  1066 CE → 1066.
// OpenHistoricalMap (like ISO 8601) counts a year zero, so it gets its own
// conversion in toOhmYear(): 1 BCE → 0, 218 BCE → -217.

export interface HistoricalDate {
  year: number;
  /** "c. 218 BC", "the 3rd century BC", a decade… */
  approximate?: boolean;
}

const ERA_BCE = /^(b\.?\s?c\.?\s?e?\.?|bce|bc)$/i;
const ERA_CE = /^(a\.?\s?d\.?|c\.?\s?e\.?|ce|ad)$/i;

/**
 * Parse a written date: "218 BC", "218 BCE", "c. 50 B.C.", "AD 43", "43 CE",
 * "1066", "-218", "3rd century BC". Returns undefined for anything else
 * (and for year 0, which does not exist).
 */
export function parseHistoricalDate(input: string): HistoricalDate | undefined {
  const s = input.trim().replace(/\s+/g, ' ');
  if (!s) return undefined;
  const approx = /^(c\.|ca\.?|circa|about|around)\s*/i.test(s);
  const body = s.replace(/^(c\.|ca\.?|circa|about|around)\s*/i, '');

  // Centuries: "3rd century BC" → middle of the century, marked approximate.
  const cent = /^(\d{1,2})(?:st|nd|rd|th)\s+century(?:\s+(.+))?$/i.exec(body);
  if (cent) {
    const n = Number(cent[1]);
    const era = cent[2]?.trim() ?? '';
    if (!n || (era && !ERA_BCE.test(era) && !ERA_CE.test(era))) return undefined;
    return ERA_BCE.test(era) ? { year: -(n * 100 - 50), approximate: true } : { year: n * 100 - 50, approximate: true };
  }

  // Signed number: "-218" means 218 BCE in this app's convention.
  const signed = /^(-?)(\d{1,5})$/.exec(body);
  if (signed) {
    const n = Number(signed[2]);
    if (!n) return undefined;
    return { year: signed[1] ? -n : n, approximate: approx || undefined };
  }

  // Era before the number ("AD 43", "BC 218") or after ("218 BC", "43 C.E.").
  const pre = /^([a-z. ]{2,6})\s*(\d{1,5})$/i.exec(body);
  const post = /^(\d{1,5})\s*([a-z. ]{2,7})$/i.exec(body);
  const m = post ? { n: post[1], era: post[2] } : pre ? { n: pre[2], era: pre[1] } : undefined;
  if (!m) return undefined;
  const n = Number(m.n);
  const era = m.era.trim();
  if (!n) return undefined;
  if (ERA_BCE.test(era)) return { year: -n, approximate: approx || undefined };
  if (ERA_CE.test(era)) return { year: n, approximate: approx || undefined };
  return undefined;
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

export interface DateMention { year: number; approximate?: boolean; index: number; text: string }

/**
 * Years written in a passage: "in 218 BC", "216 B.C.", "AD 43", "the 3rd century
 * BC" and plain four-digit years like "in 1453". Bare numbers under 1000 are
 * ignored (they're usually counts, not years).
 */
/** Words that may follow a year in running text ("the battle of 1066 was…"); any other lower-case word after "of N" makes N a count. */
const AFTER_YEAR = new Set(('the a an and or but nor so yet when while as at in on by to for from with without into onto upon after before until since during about against among between ' +
  'he she it they we i you his her its their our was were is are had has have would could should might must did does do been being which that who whom whose where').split(' '));

/** "an army of 1200 men", "a fleet of 1500 ships": after "of", a number followed by a noun is a count, not a year (PA-007). */
function isCountAfterOf(text: string, m: RegExpMatchArray): boolean {
  if (!/^of\s/i.test(m[0])) return false;
  const next = text.slice((m.index ?? 0) + m[0].length).match(/^\s+([a-z]+)/);
  return !!next && !AFTER_YEAR.has(next[1]);
}

export function findDatesInText(text: string): DateMention[] {
  const out: DateMention[] = [];
  const re = /\b(?:(c\.|ca\.|circa)\s*)?(?:(\d{1,2})(?:st|nd|rd|th)\s+century\s+(B\.?\s?C\.?(?:E\.?)?|A\.?D\.?|C\.?E\.?)|(\d{1,4})\s?(B\.?\s?C\.?(?:E\.?)?|A\.?\s?D\.?|C\.?\s?E\.?)(?![a-z])|(A\.?\s?D\.?)\s?(\d{1,4})|(?:in|by|of|from|until|till|since|after|before|around)\s+(1\d{3}|20[0-2]\d|[5-9]\d{2}))\b/gi;
  for (const m of text.matchAll(re)) {
    let parsed: HistoricalDate | undefined;
    if (m[2]) parsed = parseHistoricalDate(`${m[2]}th century ${m[3]}`);
    else if (m[4]) parsed = parseHistoricalDate(`${m[4]} ${m[5]}`);
    else if (m[7]) parsed = parseHistoricalDate(`AD ${m[7]}`);
    else if (m[8]) parsed = Number(m[8]) >= 1000 && !isCountAfterOf(text, m) ? { year: Number(m[8]) } : undefined;
    if (parsed) out.push({ ...parsed, approximate: parsed.approximate || !!m[1] || undefined, index: m.index ?? 0, text: m[0] });
  }
  return out;
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
