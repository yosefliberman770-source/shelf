// Personal records ("Hall of Fame"), computed from recorded data only.
import type { DateKey, Item } from '../db/types';
import { monthKey, startOfWeek } from './dates';
import type { LibraryIndex } from './model';
import { activeDays, bookDurations, finishedIn, minutesByDay, pagesByDay } from './stats';
import { computeStreaks } from './streaks';
import { pagesOf, UNITS } from './units';

export interface RecordEntry {
  id: string;
  label: string;
  value?: number;
  display: string;
  detail?: string;
  date?: DateKey;
  item?: Item;
}

function maxEntry<K>(m: Map<K, number>): [K, number] | undefined {
  let best: [K, number] | undefined;
  for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
  return best;
}

export function personalRecords(idx: LibraryIndex): RecordEntry[] {
  const out: RecordEntry[] = [];
  const pd = pagesByDay(idx);
  const md = minutesByDay(idx);

  const bestDay = maxEntry(pd);
  out.push({ id: 'day', label: 'Most pages in one day', value: bestDay?.[1], display: bestDay ? `${Math.round(bestDay[1])} pages` : '—', date: bestDay?.[0] });

  const weeks = new Map<string, number>();
  for (const [k, v] of pd) weeks.set(startOfWeek(k), (weeks.get(startOfWeek(k)) ?? 0) + v);
  const bestWeek = maxEntry(weeks);
  out.push({ id: 'week', label: 'Most pages in one week', value: bestWeek?.[1], display: bestWeek ? `${Math.round(bestWeek[1])} pages` : '—', date: bestWeek?.[0], detail: bestWeek ? `Week of ${bestWeek[0]}` : undefined });

  let longest: { sec: number; date: DateKey; item?: Item } | undefined;
  for (const s of idx.sessions) {
    const sec = s.durationSec ?? 0;
    if (sec > 0 && (!longest || sec > longest.sec)) longest = { sec, date: s.date, item: idx.items.get(s.itemId) };
  }
  out.push({ id: 'session', label: 'Longest session', value: longest?.sec, display: longest ? fmtMin(longest.sec / 60) : '—', date: longest?.date, item: longest?.item });

  const streak = computeStreaks(activeDays(idx.sessions), idx.today, idx.streakRules);
  out.push({ id: 'streak', label: 'Longest streak', value: streak.longest, display: streak.longest ? `${streak.longest} days` : '—', detail: streak.longestStart ? `${streak.longestStart} → ${streak.longestEnd}` : undefined });

  // Fastest 100 pages: shortest total timed duration covering ≥100 consecutive pages of timed page reading.
  const timed = idx.sessions.filter((s) => {
    const it = idx.items.get(s.itemId);
    return s.durationSec && s.durationSec >= 60 && it && UNITS[it.unit].family === 'pages' && s.amount > 0;
  });
  let best100: number | undefined;
  let lo = 0;
  let pages = 0;
  let sec = 0;
  for (let hi = 0; hi < timed.length; hi++) {
    pages += timed[hi].amount;
    sec += timed[hi].durationSec!;
    while (lo < hi && pages - timed[lo].amount >= 100) {
      pages -= timed[lo].amount;
      sec -= timed[lo].durationSec!;
      lo++;
    }
    if (pages >= 100) {
      const norm = (sec * 100) / pages;
      if (best100 === undefined || norm < best100) best100 = norm;
    }
  }
  out.push({ id: 'fast100', label: 'Fastest 100 pages', value: best100, display: best100 ? fmtMin(best100 / 60) : '—' });

  const durations = bookDurations(idx);
  const fastest = durations.reduce<(typeof durations)[number] | undefined>((a, b) => (!a || b.days < a.days ? b : a), undefined);
  out.push({ id: 'fastbook', label: 'Fastest book', value: fastest?.days, display: fastest ? `${fastest.days} day${fastest.days === 1 ? '' : 's'}` : '—', item: fastest?.item });

  const finished = finishedIn(idx);
  let longestBook: Item | undefined;
  for (const f of finished) if ((pagesOf(f.item) ?? 0) > (longestBook ? pagesOf(longestBook) ?? 0 : 0)) longestBook = f.item;
  out.push({ id: 'longbook', label: 'Longest book completed', value: longestBook ? pagesOf(longestBook) : undefined, display: longestBook ? `${pagesOf(longestBook)} pages` : '—', item: longestBook });

  const booksPerMonth = new Map<string, number>();
  for (const f of finished) booksPerMonth.set(monthKey(f.finishedOn), (booksPerMonth.get(monthKey(f.finishedOn)) ?? 0) + 1);
  const bm = maxEntry(booksPerMonth);
  out.push({ id: 'booksmonth', label: 'Most books in one month', value: bm?.[1], display: bm ? `${bm[1]} books` : '—', detail: bm?.[0] });

  const minPerMonth = new Map<string, number>();
  for (const [k, v] of md) minPerMonth.set(monthKey(k), (minPerMonth.get(monthKey(k)) ?? 0) + v);
  const mm = maxEntry(minPerMonth);
  out.push({ id: 'timemonth', label: 'Most reading time in one month', value: mm?.[1], display: mm && mm[1] > 0 ? fmtMin(mm[1]) : '—', detail: mm?.[0] });

  const prodDay = maxEntry(md);
  out.push({ id: 'prodday', label: 'Most productive day (time)', value: prodDay?.[1], display: prodDay && prodDay[1] > 0 ? fmtMin(prodDay[1]) : '—', date: prodDay?.[0] });

  const pagesPerMonth = new Map<string, number>();
  for (const [k, v] of pd) pagesPerMonth.set(monthKey(k), (pagesPerMonth.get(monthKey(k)) ?? 0) + v);
  const pm = maxEntry(pagesPerMonth);
  out.push({ id: 'prodmonth', label: 'Most productive month', value: pm?.[1], display: pm ? `${Math.round(pm[1])} pages` : '—', detail: pm?.[0] });

  return out;
}

function fmtMin(m: number): string {
  const r = Math.round(m);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  return `${h}h ${r % 60}m`;
}
