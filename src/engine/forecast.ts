// Deterministic forecasting engine. Authoritative for progress, pace,
// required pace, completion dates and deadline status. AI never computes these.
import type { DateKey, Item, ReadingSession, WeekSchedule } from '../db/types';
import { addDays, diffDays, type DayRules, eligibleDays } from './dates';
import { type LibraryIndex, isUnfinished } from './model';
import { constantSchedule, deadlineDelta, type Projection, project, requiredPace } from './schedule';
import { UNITS } from './units';

export type PaceSource = 'current' | 'average' | 'target' | 'default' | 'none';
export type DeadlineStatus = 'none' | 'ahead' | 'on-track' | 'behind' | 'overdue' | 'done' | 'unreachable';

/** Sum of amounts by date, optionally mapped to another quantity. */
export function dailyTotals(sessions: ReadingSession[], map?: (s: ReadingSession) => number | undefined): Map<DateKey, number> {
  const m = new Map<DateKey, number>();
  for (const s of sessions) {
    const v = map ? map(s) : s.amount;
    if (v === undefined || !Number.isFinite(v)) continue;
    m.set(s.date, (m.get(s.date) ?? 0) + v);
  }
  return m;
}

/**
 * Pace per eligible day over a trailing window. The window ends today if
 * something was read today, otherwise yesterday (so an unread morning doesn't
 * drag the average down). It never starts before `since`.
 */
export function windowPace(
  totals: Map<DateKey, number>,
  today: DateKey,
  windowDays: number,
  rules: DayRules,
  since?: DateKey,
): number | undefined {
  if (totals.size === 0) return undefined;
  const end = (totals.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  let start = addDays(end, -(windowDays - 1));
  if (since && since > start) start = since;
  if (start > end) {
    // Started today: use today's amount as the pace sample.
    const t = totals.get(today) ?? 0;
    return t > 0 ? t : undefined;
  }
  let sum = 0;
  for (const [k, v] of totals) if (k >= start && k <= end) sum += v;
  const days = eligibleDays(start, end, rules);
  if (days <= 0) return undefined;
  const pace = sum / days;
  return pace > 0 ? pace : undefined;
}

export interface ItemForecast {
  itemId: string;
  total?: number;
  completed: number;
  remaining?: number;
  percent?: number;
  averagePace?: number;
  currentPace?: number;
  targetPace?: number;
  pace?: number;
  paceSource: PaceSource;
  requiredPace?: number;
  readingDaysRemaining?: number;
  estimatedFinish?: DateKey;
  deadline?: DateKey;
  status: DeadlineStatus;
  /** Reading days ahead (+) or behind (−) the deadline. */
  delta?: number;
  /** Units per hour for this item (timed sessions). */
  speedPerHour?: number;
  /** Estimated reading time remaining in seconds. */
  timeRemainingSec?: number;
  totalTimeSec: number;
  sessionCount: number;
  startedOn?: DateKey;
  finishedOn?: DateKey;
  todayAmount: number;
  /** Suggested amount for today given the goal (target or required pace). */
  todayTarget?: number;
}

export function itemForecast(idx: LibraryIndex, item: Item): ItemForecast {
  const today = idx.today;
  const rules = idx.planningRules;
  const inst = idx.currentInstance(item);
  const sessions = inst ? idx.sessionsByInstance.get(inst.id) ?? [] : [];
  const total = item.total && item.total > 0 ? item.total : undefined;
  const completed = idx.position(item);
  const remaining = total !== undefined ? Math.max(0, total - completed) : undefined;
  const percent = total ? Math.min(1, completed / total) : undefined;
  const totals = dailyTotals(sessions);
  const startedOn = inst?.startedOn ?? sessions[0]?.date;

  let averagePace: number | undefined;
  if (startedOn && sessions.length) {
    const lastDay = inst?.finishedOn ?? ((totals.get(today) ?? 0) > 0 ? today : addDays(today, -1));
    const end = lastDay < startedOn ? startedOn : lastDay;
    const days = eligibleDays(startedOn, end, rules);
    const sum = sessions.reduce((a, s) => a + s.amount, 0);
    if (days > 0 && sum > 0) averagePace = sum / days;
  }
  const currentPace = windowPace(totals, today, idx.settings.paceWindowDays, rules, startedOn);
  const targetPace = item.dailyTarget && item.dailyTarget > 0 ? item.dailyTarget : undefined;

  let pace: number | undefined;
  let paceSource: PaceSource = 'none';
  if (currentPace) [pace, paceSource] = [currentPace, 'current'];
  else if (averagePace) [pace, paceSource] = [averagePace, 'average'];
  else if (targetPace) [pace, paceSource] = [targetPace, 'target'];
  else if (UNITS[item.unit].family === 'pages' && idx.settings.defaultPace > 0)
    [pace, paceSource] = [idx.settings.defaultPace, 'default'];

  // Speed from timed sessions of this item, else the user's family speed.
  let speedPerHour: number | undefined;
  let timedAmt = 0;
  let timedSec = 0;
  let totalTimeSec = 0;
  for (const s of sessions) {
    if (s.durationSec) totalTimeSec += s.durationSec;
    if (s.durationSec && s.durationSec >= 60 && s.amount > 0) {
      timedAmt += s.amount;
      timedSec += s.durationSec;
    }
  }
  if (timedSec >= 300) speedPerHour = timedAmt / (timedSec / 3600);
  else {
    const fam = idx.familySpeedPerMinute(UNITS[item.unit].family);
    if (fam) speedPerHour = fam * 60;
  }
  if (UNITS[item.unit].time) speedPerHour = 60; // listening: 60 minutes per hour

  const done = item.status === 'read' || (remaining !== undefined && remaining <= 0 && completed > 0);
  const deadline = item.deadline;

  let readingDaysRemaining: number | undefined;
  let estimatedFinish: DateKey | undefined;
  let projection: Projection | undefined;
  if (done) {
    readingDaysRemaining = 0;
    estimatedFinish = inst?.finishedOn;
  } else if (remaining !== undefined && pace) {
    projection = project(remaining, constantSchedule(pace), startDayFor(totals, today, pace), rules);
    readingDaysRemaining = remaining / pace;
    estimatedFinish = projection.date;
  }

  let status: DeadlineStatus = 'none';
  let delta: number | undefined;
  let reqPace: number | undefined;
  if (done) status = 'done';
  else if (deadline && remaining !== undefined) {
    const from = (totals.get(today) ?? 0) > 0 ? addDays(today, 1) : today;
    reqPace = requiredPace(remaining, from, deadline, rules);
    if (deadline < today) status = 'overdue';
    else if (!estimatedFinish) status = pace ? 'unreachable' : 'none';
    else {
      delta = deadlineDelta(estimatedFinish, deadline, rules);
      status = delta === undefined ? 'none' : delta > 0 ? 'ahead' : delta === 0 ? 'on-track' : 'behind';
    }
  }

  const todayAmount = totals.get(today) ?? 0;
  const goalPace = reqPace && (!targetPace || reqPace > targetPace) ? reqPace : targetPace ?? pace;
  const todayTarget = done || goalPace === undefined ? undefined : Math.ceil(goalPace);

  return {
    itemId: item.id,
    total,
    completed,
    remaining,
    percent,
    averagePace,
    currentPace,
    targetPace,
    pace,
    paceSource,
    requiredPace: reqPace,
    readingDaysRemaining,
    estimatedFinish,
    deadline,
    status,
    delta,
    speedPerHour,
    timeRemainingSec: remaining !== undefined && speedPerHour ? (remaining / speedPerHour) * 3600 : undefined,
    totalTimeSec,
    sessionCount: sessions.length,
    startedOn,
    finishedOn: inst?.finishedOn,
    todayAmount,
    todayTarget,
  };
}

/**
 * Start projecting today if today's reading hasn't reached the pace yet,
 * otherwise from tomorrow (today's capacity has effectively been used).
 */
function startDayFor(totals: Map<DateKey, number>, today: DateKey, pace: number): DateKey {
  return (totals.get(today) ?? 0) >= pace ? addDays(today, 1) : today;
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregate forecasts: folders, projects, the whole library.

export interface AggregateInput {
  items: Item[];
  deadline?: DateKey;
  /** Planned pace (page-equivalents per eligible day). */
  plannedPace?: number;
  schedule?: WeekSchedule;
}

export interface AggregateForecast {
  itemCount: number;
  completedCount: number;
  inProgressCount: number;
  /** Page-equivalents across items with a known conversion. */
  total: number;
  completed: number;
  remaining: number;
  percent?: number;
  currentPace?: number;
  plannedPace?: number;
  pace?: number;
  paceSource: PaceSource;
  requiredPace?: number;
  /** requiredPace − currentPace (positive = need to read more per day). */
  paceChange?: number;
  readingDays?: number;
  estimatedFinish?: DateKey;
  deadline?: DateKey;
  status: DeadlineStatus;
  delta?: number;
  /** Items whose remaining amount can't be expressed in pages. */
  separate: { item: Item; remaining?: number }[];
  /** Items with unknown length. */
  unknownLength: Item[];
  remainingTimeSec?: number;
}

export function aggregateForecast(idx: LibraryIndex, input: AggregateInput): AggregateForecast {
  const today = idx.today;
  const rules = idx.planningRules;
  const ids = new Set(input.items.map((i) => i.id));
  let total = 0;
  let completed = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  const separate: AggregateForecast['separate'] = [];
  const unknownLength: Item[] = [];

  for (const item of input.items) {
    if (item.status === 'read') completedCount++;
    if (item.status === 'reading') inProgressCount++;
    if (item.status === 'dnf') continue;
    if (!item.total) {
      unknownLength.push(item);
      continue;
    }
    const pos = item.status === 'read' ? item.total : Math.min(item.total, idx.position(item));
    const peTotal = idx.pageEquivalent(item, item.total);
    if (peTotal === undefined) {
      if (item.status !== 'read') separate.push({ item, remaining: item.total - pos });
      continue;
    }
    total += peTotal;
    completed += idx.pageEquivalent(item, pos) ?? 0;
  }
  const remaining = Math.max(0, total - completed);

  const sessions = idx.sessions.filter((s) => ids.has(s.itemId));
  const totals = dailyTotals(sessions, (s) => {
    const it = idx.items.get(s.itemId);
    return it ? idx.pageEquivalent(it, s.amount) : undefined;
  });
  const currentPace = windowPace(totals, today, idx.settings.paceWindowDays, rules);
  const plannedPace = input.plannedPace && input.plannedPace > 0 ? input.plannedPace : undefined;

  let pace: number | undefined;
  let paceSource: PaceSource = 'none';
  if (currentPace) [pace, paceSource] = [currentPace, 'current'];
  else if (plannedPace) [pace, paceSource] = [plannedPace, 'target'];
  else if (idx.settings.defaultPace > 0) [pace, paceSource] = [idx.settings.defaultPace, 'default'];

  const schedule = input.schedule ?? (pace ? constantSchedule(pace) : undefined);
  const start = (totals.get(today) ?? 0) > 0 ? addDays(today, 1) : today;
  let readingDays: number | undefined;
  let estimatedFinish: DateKey | undefined;
  if (remaining <= 0 && total > 0) {
    readingDays = 0;
  } else if (schedule && total > 0) {
    const p = project(remaining, schedule, start, rules);
    readingDays = p.reachable ? p.readingDays : undefined;
    estimatedFinish = p.date;
  }

  const deadline = input.deadline;
  let status: DeadlineStatus = 'none';
  let delta: number | undefined;
  let reqPace: number | undefined;
  if (total > 0 && remaining <= 0) status = 'done';
  else if (deadline) {
    reqPace = requiredPace(remaining, start, deadline, rules);
    if (deadline < today) status = 'overdue';
    else if (!estimatedFinish) status = 'unreachable';
    else {
      delta = deadlineDelta(estimatedFinish, deadline, rules);
      status = delta === undefined ? 'none' : delta > 0 ? 'ahead' : delta === 0 ? 'on-track' : 'behind';
    }
  }

  const ppm = idx.pagesPerMinute();
  return {
    itemCount: input.items.length,
    completedCount,
    inProgressCount,
    total,
    completed,
    remaining,
    percent: total > 0 ? completed / total : undefined,
    currentPace,
    plannedPace,
    pace,
    paceSource,
    requiredPace: reqPace,
    paceChange: reqPace !== undefined && pace !== undefined ? reqPace - pace : undefined,
    readingDays,
    estimatedFinish,
    deadline,
    status,
    delta,
    separate,
    unknownLength,
    remainingTimeSec: ppm ? (remaining / ppm) * 60 : undefined,
  };
}

export function folderForecast(idx: LibraryIndex, folderId: string): AggregateForecast {
  const f = idx.folders.get(folderId);
  return aggregateForecast(idx, { items: idx.itemsInFolder(folderId), deadline: f?.deadline, plannedPace: f?.goalPace });
}

export function projectForecast(idx: LibraryIndex, projectId: string): AggregateForecast {
  const p = idx.projects.get(projectId);
  if (!p) return aggregateForecast(idx, { items: [] });
  return aggregateForecast(idx, { items: idx.itemsInProject(p), deadline: p.deadline, plannedPace: p.pace, schedule: p.schedule });
}

export function libraryForecast(idx: LibraryIndex): AggregateForecast {
  return aggregateForecast(idx, { items: idx.itemList().filter(isUnfinished) });
}

/** "At N/day → X reading days → date" rows for the library mathematics table. */
export function paceTable(idx: LibraryIndex, remaining: number, paces: number[]): { pace: number; readingDays: number; date?: DateKey; calendarDays: number }[] {
  return paces.map((pace) => {
    const p = project(remaining, constantSchedule(pace), idx.today, idx.planningRules);
    return { pace, readingDays: remaining / pace, date: p.date, calendarDays: p.calendarDays };
  });
}

/** Overall reading pace (page-equivalents per eligible day) across the library. */
export function overallPace(idx: LibraryIndex, windowDays = idx.settings.paceWindowDays): number | undefined {
  const totals = dailyTotals(idx.sessions, (s) => {
    const it = idx.items.get(s.itemId);
    return it ? idx.pageEquivalent(it, s.amount) : undefined;
  });
  return windowPace(totals, idx.today, windowDays, idx.planningRules);
}

export function daysSince(idx: LibraryIndex, key: DateKey | undefined): number | undefined {
  return key ? diffDays(key, idx.today) : undefined;
}
