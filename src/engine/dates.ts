// Date engine. All calendar math uses local-date keys (YYYY-MM-DD) in the
// user's timezone, and never raw millisecond arithmetic across DST changes.
import type { DateKey } from '../db/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

/** Parse a date key into a local Date at noon (noon avoids DST edge cases). */
export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isValidKey(key: unknown): key is DateKey {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = fromKey(key);
  return toKey(d) === key;
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function weekday(key: DateKey): number {
  return fromKey(key).getDay();
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const da = fromKey(a);
  const dbb = fromKey(b);
  return Math.round((dbb.getTime() - da.getTime()) / 86_400_000);
}

export function keyFromMs(ms: number): DateKey {
  return toKey(new Date(ms));
}

export function startOfWeek(key: DateKey, weekStartsOn = 1): DateKey {
  const wd = weekday(key);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

export function startOfMonth(key: DateKey): DateKey {
  return key.slice(0, 8) + '01';
}

export function endOfMonth(key: DateKey): DateKey {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function startOfYear(key: DateKey): DateKey {
  return key.slice(0, 4) + '-01-01';
}

export function endOfYear(key: DateKey): DateKey {
  return key.slice(0, 4) + '-12-31';
}

export function monthKey(key: DateKey): string {
  return key.slice(0, 7);
}

/** Inclusive list of date keys from a to b. */
export function range(a: DateKey, b: DateKey): DateKey[] {
  const out: DateKey[] = [];
  if (a > b) return out;
  let k = a;
  // Guard against runaway ranges.
  for (let i = 0; i < 40_000 && k <= b; i++) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

export interface DayRules {
  /** Weekdays that are excluded (0=Sun). */
  weekdays: number[];
  /** Specific excluded dates. */
  dates: DateKey[];
}

export function isExcluded(key: DateKey, rules: DayRules): boolean {
  return rules.weekdays.includes(weekday(key)) || rules.dates.includes(key);
}

/** Count of non-excluded days in [a, b] inclusive. */
export function eligibleDays(a: DateKey, b: DateKey, rules: DayRules): number {
  if (a > b) return 0;
  const dateSet = new Set(rules.dates);
  const total = diffDays(a, b) + 1;
  if (rules.weekdays.length === 0 && dateSet.size === 0) return total;
  let n = 0;
  let k = a;
  let wd = weekday(a);
  for (let i = 0; i < total; i++) {
    if (!rules.weekdays.includes(wd) && !dateSet.has(k)) n++;
    k = addDays(k, 1);
    wd = (wd + 1) % 7;
  }
  return n;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function monthName(m: number, long = false): string {
  return (long ? MONTHS_LONG : MONTHS)[m];
}

/** "October 12" or "October 12, 2027" if a different year than `ref`. */
export function formatKey(key: DateKey | undefined, ref: DateKey = todayKey(), opts: { short?: boolean } = {}): string {
  if (!key) return '—';
  const d = fromKey(key);
  const month = opts.short ? MONTHS[d.getMonth()] : MONTHS_LONG[d.getMonth()];
  const base = `${month} ${d.getDate()}`;
  return key.slice(0, 4) === ref.slice(0, 4) ? base : `${base}, ${d.getFullYear()}`;
}

export function formatMonth(ym: string, long = false): string {
  const [y, m] = ym.split('-').map(Number);
  return `${monthName(m - 1, long)} ${y}`;
}

export function formatYear(y: number | undefined): string {
  if (y === undefined || Number.isNaN(y)) return '—';
  return y < 0 ? `${-y} BCE` : y < 1000 ? `${y} CE` : String(y);
}

export function relativeDays(key: DateKey, ref: DateKey = todayKey()): string {
  const d = diffDays(ref, key);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}
