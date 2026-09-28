// Goal progress and the annual Reading DNA profile.
import type { DateKey, Goal } from '../db/types';
import { addDays, diffDays, eligibleDays, endOfMonth, endOfYear, monthKey, startOfMonth, startOfWeek, startOfYear } from './dates';
import type { LibraryIndex } from './model';
import { activeDays, finishedIn, overview, sessionMinutes, sessionPages, sessionsIn, speed } from './stats';
import { computeStreaks } from './streaks';
import { pagesOf } from './units';

export function goalWindow(goal: Goal, today: DateKey): { from: DateKey; to: DateKey } {
  switch (goal.period) {
    case 'daily':
      return { from: today, to: today };
    case 'weekly': {
      const from = startOfWeek(today);
      return { from, to: addDays(from, 6) };
    }
    case 'monthly':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'annual': {
      const y = goal.year ? `${goal.year}-06-01` : today;
      return { from: startOfYear(y), to: endOfYear(y) };
    }
  }
}

export interface GoalProgress {
  goal: Goal;
  value: number;
  target: number;
  ratio: number;
  from: DateKey;
  to: DateKey;
  /** Expected value by today if progressing evenly over eligible days. */
  expected: number;
  /** Projection to the end of the window at the current rate. */
  projected: number;
  /** Required per remaining eligible day. */
  requiredPerDay?: number;
}

export function goalProgress(idx: LibraryIndex, goal: Goal): GoalProgress {
  const { from, to } = goalWindow(goal, idx.today);
  let value = 0;
  if (goal.metric === 'books') value = finishedIn(idx, { from, to }).length;
  else {
    for (const s of sessionsIn(idx, { from, to })) {
      if (goal.metric === 'pages') value += sessionPages(idx, s) ?? 0;
      else if (goal.metric === 'minutes') value += sessionMinutes(idx, s);
      else if (goal.metric === 'units') value += s.amount;
      else if (goal.metric === 'sessions') value += 1;
    }
  }
  const rules = idx.planningRules;
  const totalDays = Math.max(1, eligibleDays(from, to, rules));
  const elapsed = idx.today < from ? 0 : eligibleDays(from, idx.today > to ? to : idx.today, rules);
  const expected = (goal.target * elapsed) / totalDays;
  const projected = elapsed > 0 ? (value / elapsed) * totalDays : value;
  const remainingDays = idx.today > to ? 0 : eligibleDays(idx.today, to, rules);
  const left = Math.max(0, goal.target - value);
  return {
    goal,
    value,
    target: goal.target,
    ratio: goal.target > 0 ? value / goal.target : 0,
    from,
    to,
    expected,
    projected,
    requiredPerDay: remainingDays > 0 ? left / remainingDays : undefined,
  };
}

export function goalMetricLabel(g: Pick<Goal, 'metric'>, n = 2): string {
  const one = n === 1;
  switch (g.metric) {
    case 'pages': return one ? 'page' : 'pages';
    case 'minutes': return one ? 'minute' : 'minutes';
    case 'books': return one ? 'book' : 'books';
    case 'units': return one ? 'unit' : 'units';
    case 'sessions': return one ? 'session' : 'sessions';
  }
}

export interface ReadingDNA {
  label: string;
  books: number;
  pages: number;
  hours: number;
  avgBookPages?: number;
  avgRating?: number;
  peakMonth?: string;
  avgSessionMin?: number;
  longestStreak: number;
  fastestSpeed?: number;
  topCategory?: string;
  topAuthor?: string;
  activeDays: number;
  sessions: number;
  covers: { id: string; title: string; cover?: string }[];
  hasData: boolean;
}

export function readingDNA(idx: LibraryIndex, year?: number): ReadingDNA {
  const r = year ? { from: `${year}-01-01`, to: `${year}-12-31` } : {};
  const ov = overview(idx, r);
  const fin = finishedIn(idx, r);
  const lens = fin.map((f) => pagesOf(f.item)).filter((x): x is number => !!x);
  const ratings = fin.map((f) => f.rating).filter((x): x is number => !!x);
  const monthPages = new Map<string, number>();
  const ss = sessionsIn(idx, r);
  for (const s of ss) monthPages.set(monthKey(s.date), (monthPages.get(monthKey(s.date)) ?? 0) + (sessionPages(idx, s) ?? 0));
  let peak: [string, number] | undefined;
  for (const e of monthPages) if (!peak || e[1] > peak[1]) peak = e;

  // Fastest per-book speed (min 30 minutes timed).
  let fastest: number | undefined;
  for (const list of idx.sessionsByItem.values()) {
    const inRange = list.filter((s) => (!r.from || s.date >= r.from) && (!r.to || s.date <= r.to));
    const sec = inRange.reduce((a, s) => a + (s.durationSec ?? 0), 0);
    if (sec < 1800) continue;
    const v = speed(idx, inRange);
    if (v && (!fastest || v > fastest)) fastest = v;
  }

  const cat = new Map<string, number>();
  const auth = new Map<string, number>();
  for (const f of fin) {
    const c = f.item.genres[0] ?? idx.folderPath(f.item.folderIds[0] ?? '')[0]?.name;
    if (c) cat.set(c, (cat.get(c) ?? 0) + 1);
    for (const a of idx.authorNames(f.item)) auth.set(a, (auth.get(a) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const days = activeDays(ss);
  const streak = year ? computeStreaks(days, year === Number(idx.today.slice(0, 4)) ? idx.today : `${year}-12-31`, idx.streakRules).longest : ov.longestStreak;
  return {
    label: year ? String(year) : 'Lifetime',
    books: fin.length,
    pages: ov.pages,
    hours: ov.minutes / 60,
    avgBookPages: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : undefined,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined,
    peakMonth: peak && peak[1] > 0 ? peak[0] : undefined,
    avgSessionMin: ov.avgSessionMin,
    longestStreak: streak,
    fastestSpeed: fastest,
    topCategory: top(cat),
    topAuthor: top(auth),
    activeDays: days.size,
    sessions: ss.length,
    covers: fin.map((f) => ({ id: f.item.id, title: f.item.title, cover: f.item.coverData ?? f.item.coverUrl })),
    hasData: ss.length > 0 || fin.length > 0,
  };
}

export function daysLeftInYear(today: DateKey): number {
  return diffDays(today, endOfYear(today)) + 1;
}
