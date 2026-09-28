// Descriptive statistics derived purely from recorded sessions and items.
import type { DateKey, Item, ReadingSession } from '../db/types';
import { addDays, diffDays, monthKey, startOfWeek, weekday } from './dates';
import { dailyTotals } from './forecast';
import type { LibraryIndex } from './model';
import { computeStreaks } from './streaks';
import { pagesOf, UNITS } from './units';

export interface RangeFilter {
  from?: DateKey;
  to?: DateKey;
}

export function inRange(d: DateKey, r: RangeFilter): boolean {
  return (!r.from || d >= r.from) && (!r.to || d <= r.to);
}

export function sessionsIn(idx: LibraryIndex, r: RangeFilter, filter?: (item: Item) => boolean): ReadingSession[] {
  return idx.sessions.filter((s) => {
    if (!inRange(s.date, r)) return false;
    if (!filter) return true;
    const it = idx.items.get(s.itemId);
    return !!it && filter(it);
  });
}

/** Page-equivalent amount for a session (undefined when not convertible). */
export function sessionPages(idx: LibraryIndex, s: ReadingSession): number | undefined {
  const it = idx.items.get(s.itemId);
  return it ? idx.pageEquivalent(it, s.amount) : undefined;
}

/** Minutes for a session: timed duration, or audio minutes listened. */
export function sessionMinutes(idx: LibraryIndex, s: ReadingSession): number {
  if (s.durationSec) return s.durationSec / 60;
  const it = idx.items.get(s.itemId);
  if (it && UNITS[it.unit].time) return s.amount;
  return 0;
}

export function pagesByDay(idx: LibraryIndex, sessions = idx.sessions): Map<DateKey, number> {
  return dailyTotals(sessions, (s) => sessionPages(idx, s));
}

export function minutesByDay(idx: LibraryIndex, sessions = idx.sessions): Map<DateKey, number> {
  return dailyTotals(sessions, (s) => sessionMinutes(idx, s));
}

export function activeDays(sessions: ReadingSession[]): Set<DateKey> {
  return new Set(sessions.filter((s) => s.amount > 0 || (s.durationSec ?? 0) > 0).map((s) => s.date));
}

export interface Overview {
  sessions: number;
  activeDays: number;
  pages: number;
  minutes: number;
  currentStreak: number;
  longestStreak: number;
  booksFinished: number;
  avgSessionMin?: number;
  unitsByFamily: Record<string, number>;
}

export function overview(idx: LibraryIndex, r: RangeFilter = {}): Overview {
  const ss = sessionsIn(idx, r);
  let pages = 0;
  let minutes = 0;
  let timed = 0;
  let timedMin = 0;
  const unitsByFamily: Record<string, number> = {};
  for (const s of ss) {
    pages += sessionPages(idx, s) ?? 0;
    const m = sessionMinutes(idx, s);
    minutes += m;
    if (s.durationSec) {
      timed++;
      timedMin += s.durationSec / 60;
    }
    const it = idx.items.get(s.itemId);
    if (it) {
      const fam = UNITS[it.unit].family;
      unitsByFamily[fam] = (unitsByFamily[fam] ?? 0) + s.amount;
    }
  }
  const streaks = computeStreaks(activeDays(idx.sessions), idx.today, idx.streakRules);
  return {
    sessions: ss.length,
    activeDays: activeDays(ss).size,
    pages,
    minutes,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    booksFinished: finishedIn(idx, r).length,
    avgSessionMin: timed ? timedMin / timed : undefined,
    unitsByFamily,
  };
}

export interface Finished {
  item: Item;
  finishedOn: DateKey;
  startedOn?: DateKey;
  rating?: number;
  instanceNumber: number;
}

/** Every completed reading instance, optionally within a date range. */
export function finishedIn(idx: LibraryIndex, r: RangeFilter = {}): Finished[] {
  const out: Finished[] = [];
  for (const ins of idx.snap.instances) {
    if (ins.status !== 'read' || !ins.finishedOn || !inRange(ins.finishedOn, r)) continue;
    const item = idx.items.get(ins.itemId);
    if (!item) continue;
    out.push({ item, finishedOn: ins.finishedOn, startedOn: ins.startedOn, rating: ins.rating, instanceNumber: ins.number });
  }
  return out.sort((a, b) => a.finishedOn.localeCompare(b.finishedOn));
}

export interface Bucket {
  key: string;
  value: number;
  extra?: number;
}

export function byMonth(idx: LibraryIndex, r: RangeFilter, metric: 'pages' | 'minutes' | 'sessions' | 'books'): Bucket[] {
  const m = new Map<string, number>();
  if (metric === 'books') {
    for (const f of finishedIn(idx, r)) m.set(monthKey(f.finishedOn), (m.get(monthKey(f.finishedOn)) ?? 0) + 1);
  } else {
    for (const s of sessionsIn(idx, r)) {
      const v = metric === 'pages' ? sessionPages(idx, s) ?? 0 : metric === 'minutes' ? sessionMinutes(idx, s) : 1;
      m.set(monthKey(s.date), (m.get(monthKey(s.date)) ?? 0) + v);
    }
  }
  return fillMonths(m, r, idx.today);
}

function fillMonths(m: Map<string, number>, r: RangeFilter, today: DateKey): Bucket[] {
  const keys = [...m.keys()].sort();
  const first = r.from ? monthKey(r.from) : keys[0];
  const last = r.to ? monthKey(r.to > today ? today : r.to) : keys[keys.length - 1] ?? monthKey(today);
  if (!first) return [];
  const out: Bucket[] = [];
  let [y, mo] = first.split('-').map(Number);
  for (let i = 0; i < 1200; i++) {
    const k = `${y}-${String(mo).padStart(2, '0')}`;
    if (k > last) break;
    out.push({ key: k, value: m.get(k) ?? 0 });
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return out;
}

export function byWeek(idx: LibraryIndex, r: RangeFilter): Bucket[] {
  const m = new Map<string, number>();
  const days = new Map<string, Set<string>>();
  for (const s of sessionsIn(idx, r)) {
    const w = startOfWeek(s.date);
    m.set(w, (m.get(w) ?? 0) + (sessionPages(idx, s) ?? 0));
    const set = days.get(w) ?? new Set();
    set.add(s.date);
    days.set(w, set);
  }
  return [...m.keys()].sort().map((k) => ({ key: k, value: m.get(k)!, extra: days.get(k)?.size ?? 0 }));
}

/** Minutes by hour-of-day and by weekday, plus the weekday × hour grid. */
export function timeProfile(idx: LibraryIndex, r: RangeFilter = {}) {
  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const sessPerWeekday = new Array(7).fill(0);
  const minPerWeekday = new Array(7).fill(0);
  const pagesPerWeekday = new Array(7).fill(0);
  for (const s of sessionsIn(idx, r)) {
    const wd = weekday(s.date);
    const mins = sessionMinutes(idx, s);
    const weight = mins > 0 ? mins : 0;
    pagesPerWeekday[wd] += sessionPages(idx, s) ?? 0;
    if (weight <= 0) continue;
    // Spread a timed session across the hours it covered.
    let t = s.startedAt;
    let left = weight;
    for (let guard = 0; left > 0 && guard < 48; guard++) {
      const h = new Date(t).getHours();
      const next = new Date(t);
      next.setMinutes(60, 0, 0);
      const chunk = Math.min(left, (next.getTime() - t) / 60000);
      hours[h] += chunk;
      grid[new Date(t).getDay()][h] += chunk;
      left -= chunk;
      t = next.getTime();
    }
    weekdays[wd] += weight;
    sessPerWeekday[wd]++;
    minPerWeekday[wd] += weight;
  }
  const avgSessionByWeekday = minPerWeekday.map((m, i) => (sessPerWeekday[i] ? m / sessPerWeekday[i] : 0));
  return { hours, weekdays, grid, avgSessionByWeekday, pagesPerWeekday };
}

/** Pages per hour across timed page sessions. */
export function speed(idx: LibraryIndex, sessions: ReadingSession[]): number | undefined {
  let pages = 0;
  let sec = 0;
  for (const s of sessions) {
    if (!s.durationSec || s.durationSec < 60) continue;
    const p = sessionPages(idx, s);
    const it = idx.items.get(s.itemId);
    if (p === undefined || !it || UNITS[it.unit].time) continue;
    pages += p;
    sec += s.durationSec;
  }
  return sec >= 300 ? pages / (sec / 3600) : undefined;
}

export function speedByMonth(idx: LibraryIndex, r: RangeFilter): Bucket[] {
  const groups = new Map<string, ReadingSession[]>();
  for (const s of sessionsIn(idx, r)) {
    const k = monthKey(s.date);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.keys()].sort().map((k) => ({ key: k, value: speed(idx, groups.get(k)!) ?? 0 }));
}

export function speedByItem(idx: LibraryIndex): { item: Item; speed: number }[] {
  const out: { item: Item; speed: number }[] = [];
  for (const [id, ss] of idx.sessionsByItem) {
    const item = idx.items.get(id);
    const v = speed(idx, ss);
    if (item && v) out.push({ item, speed: v });
  }
  return out.sort((a, b) => b.speed - a.speed);
}

/** Cumulative page-equivalents over time. */
export function cumulative(idx: LibraryIndex, r: RangeFilter): { key: DateKey; value: number }[] {
  const days = pagesByDay(idx, sessionsIn(idx, r));
  const keys = [...days.keys()].sort();
  let sum = 0;
  return keys.map((k) => ({ key: k, value: (sum += days.get(k)!) }));
}

/** Composition of reading by a dimension, weighted by pages read (or items). */
export function balance(
  idx: LibraryIndex,
  dim: 'genre' | 'tag' | 'folder' | 'contentType' | 'author',
  r: RangeFilter,
  weight: 'pages' | 'minutes' | 'items',
): Bucket[] {
  const m = new Map<string, number>();
  const labelsOf = (it: Item): string[] => {
    switch (dim) {
      case 'genre':
        return it.genres.length ? it.genres : ['Unspecified'];
      case 'tag':
        return it.tagIds.length ? it.tagIds.map((t) => idx.tags.get(t)?.name ?? '?') : ['Untagged'];
      case 'folder': {
        const roots = new Set(it.folderIds.map((f) => idx.folderPath(f)[0]?.name).filter(Boolean) as string[]);
        return roots.size ? [...roots] : ['No folder'];
      }
      case 'contentType':
        return [it.contentType === 'custom' && it.customType ? it.customType : it.contentType];
      case 'author':
        return idx.authorNames(it).length ? idx.authorNames(it) : ['Unknown'];
    }
  };
  if (weight === 'items') {
    for (const it of idx.itemList()) for (const l of labelsOf(it)) m.set(l, (m.get(l) ?? 0) + 1);
  } else {
    for (const s of sessionsIn(idx, r)) {
      const it = idx.items.get(s.itemId);
      if (!it) continue;
      const v = weight === 'pages' ? sessionPages(idx, s) ?? 0 : sessionMinutes(idx, s);
      const labels = labelsOf(it);
      for (const l of labels) m.set(l, (m.get(l) ?? 0) + v / labels.length);
    }
  }
  return [...m.entries()].map(([key, value]) => ({ key, value })).filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
}

export function topN(buckets: Bucket[], n: number, otherLabel = 'Other'): Bucket[] {
  if (buckets.length <= n) return buckets;
  const head = buckets.slice(0, n);
  const rest = buckets.slice(n).reduce((a, b) => a + b.value, 0);
  return [...head, { key: otherLabel, value: rest }];
}

export function ratingBreakdown(idx: LibraryIndex, r: RangeFilter = {}): Bucket[] {
  const counts = new Map<number, number>();
  for (const f of finishedIn(idx, r)) if (f.rating) counts.set(f.rating, (counts.get(f.rating) ?? 0) + 1);
  const out: Bucket[] = [];
  for (let v = 0.5; v <= 5; v += 0.5) out.push({ key: String(v), value: counts.get(v) ?? 0 });
  return out;
}

export function lengthBreakdown(items: Item[]): Bucket[] {
  const bins = [
    ['< 100', 0, 100],
    ['100–199', 100, 200],
    ['200–299', 200, 300],
    ['300–399', 300, 400],
    ['400–499', 400, 500],
    ['500–699', 500, 700],
    ['700+', 700, Infinity],
  ] as const;
  return bins.map(([key, lo, hi]) => ({
    key,
    value: items.filter((i) => {
      const p = pagesOf(i);
      return p !== undefined && p >= lo && p < hi;
    }).length,
  }));
}

export function decadeBreakdown(items: Item[]): Bucket[] {
  const m = new Map<number, number>();
  for (const i of items) if (i.publishedYear !== undefined) {
    const d = Math.floor(i.publishedYear / 10) * 10;
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.keys()].sort((a, b) => a - b).map((d) => ({ key: d < 0 ? `${-d}s BCE` : `${d}s`, value: m.get(d)! }));
}

export function typeBreakdown(items: Item[]): Bucket[] {
  const groups: Record<string, number> = { Print: 0, Ebook: 0, Audio: 0, Other: 0 };
  for (const i of items) {
    if (['book', 'textbook', 'academic', 'comic'].includes(i.contentType)) groups.Print++;
    else if (i.contentType === 'ebook') groups.Ebook++;
    else if (i.contentType === 'audiobook' || i.contentType === 'podcast') groups.Audio++;
    else groups.Other++;
  }
  return Object.entries(groups).map(([key, value]) => ({ key, value })).filter((b) => b.value > 0);
}

export interface BookDuration {
  item: Item;
  days: number;
  pages?: number;
  hours?: number;
}

/** Calendar days from start to finish for finished books. */
export function bookDurations(idx: LibraryIndex, r: RangeFilter = {}): BookDuration[] {
  return finishedIn(idx, r)
    .filter((f) => f.startedOn)
    .map((f) => {
      const ss = idx.sessionsByItem.get(f.item.id) ?? [];
      const sec = ss.reduce((a, s) => a + (s.durationSec ?? 0), 0);
      return { item: f.item, days: diffDays(f.startedOn!, f.finishedOn) + 1, pages: pagesOf(f.item), hours: sec ? sec / 3600 : undefined };
    });
}

/** Everything read within a range, grouped by item. */
export function coverage(idx: LibraryIndex, r: RangeFilter) {
  const m = new Map<string, { item: Item; amount: number; sessions: number; sec: number }>();
  for (const s of sessionsIn(idx, r)) {
    const item = idx.items.get(s.itemId);
    if (!item) continue;
    const e = m.get(item.id) ?? { item, amount: 0, sessions: 0, sec: 0 };
    e.amount += s.amount;
    e.sessions++;
    e.sec += s.durationSec ?? 0;
    m.set(item.id, e);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

export function yearsWithData(idx: LibraryIndex): number[] {
  const ys = new Set<number>();
  for (const s of idx.sessions) ys.add(Number(s.date.slice(0, 4)));
  for (const i of idx.snap.instances) if (i.finishedOn) ys.add(Number(i.finishedOn.slice(0, 4)));
  return [...ys].sort((a, b) => b - a);
}

export function lastNDays(today: DateKey, n: number): DateKey[] {
  const out: DateKey[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}
