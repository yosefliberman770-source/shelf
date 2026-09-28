// Future projections: Future You, the 30/90/365-day forecasts, and the
// What-If Lab. Everything here is deterministic simulation; nothing modifies
// stored data.
import type { DateKey, Item, PlanTarget, WeekSchedule } from '../db/types';
import { addDays, type DayRules, isExcluded, weekday } from './dates';
import { aggregateForecast, overallPace } from './forecast';
import { type LibraryIndex, isUnfinished } from './model';
import { constantSchedule, deadlineDelta, project, requiredPace, scheduleWeeklyTotal } from './schedule';
import { finishedIn } from './stats';
import { pagesOf } from './units';

/** Unfinished items in the order they are likely to be read. */
export function readingOrder(idx: LibraryIndex, items: Item[] = idx.itemList()): Item[] {
  const lane = (i: Item) => (i.status === 'reading' ? 0 : i.queue === 'next' ? 1 : i.status === 'want' ? 2 : 3);
  return items.filter(isUnfinished).sort((a, b) => lane(a) - lane(b) || a.queueOrder - b.queueOrder || a.createdAt - b.createdAt);
}

export interface QueueSim {
  days: number;
  pages: number;
  finished: { item: Item; date: DateKey }[];
  /** Pages ÷ average finished-book length — only when history exists. */
  equivalentBooks?: number;
}

/**
 * Consume `schedule` capacity (page-equivalents) day by day through the
 * reading order. Active books are read in parallel proportionally to their
 * remaining amount, which approximates real multi-book reading.
 */
export function simulateQueue(idx: LibraryIndex, schedule: WeekSchedule, days: number, rules: DayRules = idx.planningRules): QueueSim {
  const order = readingOrder(idx)
    .map((item) => {
      if (!item.total) return undefined;
      const rem = idx.pageEquivalent(item, Math.max(0, item.total - idx.position(item)));
      return rem !== undefined && rem > 0 ? { item, rem } : undefined;
    })
    .filter((x): x is { item: Item; rem: number } => !!x);
  const finished: QueueSim['finished'] = [];
  let pages = 0;
  let k = idx.today;
  let wd = weekday(k);
  for (let d = 0; d < days; d++) {
    let cap = isExcluded(k, rules) ? 0 : schedule[wd];
    pages += cap;
    // Parallel on currently-reading items, then sequential through the queue.
    while (cap > 1e-9 && order.length) {
      const active = order.filter((o) => o.item.status === 'reading');
      const group = active.length ? active : [order[0]];
      const groupRem = group.reduce((a, o) => a + o.rem, 0);
      const use = Math.min(cap, groupRem);
      for (const o of group) o.rem -= use * (o.rem / groupRem);
      cap -= use;
      for (let i = order.length - 1; i >= 0; i--) {
        if (order[i].rem <= 1e-6) {
          finished.push({ item: order[i].item, date: k });
          order.splice(i, 1);
        }
      }
      if (use <= 1e-9) break;
    }
    k = addDays(k, 1);
    wd = (wd + 1) % 7;
  }
  const done = finishedIn(idx).map((f) => pagesOf(f.item)).filter((p): p is number => !!p);
  const avg = done.length >= 3 ? done.reduce((a, b) => a + b, 0) / done.length : undefined;
  return { days, pages, finished, equivalentBooks: avg ? pages / avg : undefined };
}

export interface FutureYou {
  pace?: number;
  horizons: { days: number; label: string; sim: QueueSim }[];
}

export function futureYou(idx: LibraryIndex, paceOverride?: number): FutureYou {
  const pace = paceOverride ?? overallPace(idx);
  if (!pace) return { pace: undefined, horizons: [] };
  const schedule = constantSchedule(pace);
  return {
    pace,
    horizons: [
      { days: 30, label: 'In 30 days', sim: simulateQueue(idx, schedule, 30) },
      { days: 90, label: 'In 90 days', sim: simulateQueue(idx, schedule, 90) },
      { days: 365, label: 'In one year', sim: simulateQueue(idx, schedule, 365) },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// What-If Lab

export interface Scenario {
  /** Replace the pace with a constant amount per reading day. */
  pace?: number;
  /** Add to (or subtract from) the current pace each reading day. */
  paceDelta?: number;
  /** Read a fixed amount of minutes per day, converted with measured speed. */
  minutesPerDay?: number;
  /** Explicit weekly schedule (overrides pace/delta/minutes). */
  schedule?: WeekSchedule;
  /** Extra minutes on specific weekdays (e.g. two hours on Sunday). */
  extraMinutesByWeekday?: Partial<Record<number, number>>;
  /** Additional weekdays that become non-reading days. */
  excludeWeekdays?: number[];
  weekdaysOnly?: boolean;
  addItems?: { count: number; length: number };
  removeItemIds?: string[];
  deadline?: DateKey;
  deadlineShiftDays?: number;
}

export interface ScenarioResult {
  remaining: number;
  schedule?: WeekSchedule;
  weekly: number;
  readingDays?: number;
  finish?: DateKey;
  deadline?: DateKey;
  requiredPace?: number;
  delta?: number;
  meetsDeadline?: boolean;
  totalTimeSec?: number;
  rules: DayRules;
}

export interface TargetInfo {
  label: string;
  items: Item[];
  deadline?: DateKey;
  plannedPace?: number;
  schedule?: WeekSchedule;
}

export function resolveTarget(idx: LibraryIndex, t: PlanTarget): TargetInfo {
  switch (t.kind) {
    case 'library':
      return { label: 'Entire library', items: idx.itemList().filter(isUnfinished) };
    case 'folder': {
      const f = idx.folders.get(t.id);
      return { label: f?.name ?? 'Folder', items: idx.itemsInFolder(t.id), deadline: f?.deadline, plannedPace: f?.goalPace };
    }
    case 'project': {
      const p = idx.projects.get(t.id);
      return { label: p?.name ?? 'Project', items: p ? idx.itemsInProject(p) : [], deadline: p?.deadline, plannedPace: p?.pace, schedule: p?.schedule };
    }
    case 'item': {
      const i = idx.items.get(t.id);
      return { label: i?.title ?? 'Item', items: i ? [i] : [], deadline: i?.deadline, plannedPace: i?.dailyTarget };
    }
  }
}

export function evaluate(idx: LibraryIndex, target: TargetInfo, scenario: Scenario = {}): ScenarioResult {
  const items = target.items.filter((i) => !scenario.removeItemIds?.includes(i.id));
  const base = aggregateForecast(idx, { items, deadline: target.deadline, plannedPace: target.plannedPace, schedule: target.schedule });
  let remaining = base.remaining;
  if (scenario.addItems && scenario.addItems.count > 0) remaining += scenario.addItems.count * scenario.addItems.length;

  const weekdays = new Set(idx.planningRules.weekdays);
  for (const w of scenario.excludeWeekdays ?? []) weekdays.add(w);
  if (scenario.weekdaysOnly) {
    weekdays.add(0);
    weekdays.add(6);
  }
  const rules: DayRules = { weekdays: [...weekdays], dates: idx.planningRules.dates };

  const ppm = idx.pagesPerMinute();
  let schedule: WeekSchedule | undefined = scenario.schedule ?? target.schedule;
  if (!scenario.schedule) {
    let pace = base.pace;
    if (scenario.pace !== undefined) pace = scenario.pace;
    else if (scenario.minutesPerDay !== undefined && ppm) pace = scenario.minutesPerDay * ppm;
    if (scenario.paceDelta) pace = (pace ?? 0) + scenario.paceDelta;
    if (pace !== undefined && (scenario.pace !== undefined || scenario.paceDelta || scenario.minutesPerDay !== undefined || !schedule))
      schedule = constantSchedule(Math.max(0, pace));
  }
  if (schedule && scenario.extraMinutesByWeekday && ppm) {
    schedule = schedule.map((v, d) => v + (scenario.extraMinutesByWeekday?.[d] ?? 0) * ppm) as WeekSchedule;
  }
  if (schedule) schedule = schedule.map((v, d) => (rules.weekdays.includes(d) ? 0 : v)) as WeekSchedule;

  let deadline = scenario.deadline ?? target.deadline;
  if (deadline && scenario.deadlineShiftDays) deadline = addDays(deadline, scenario.deadlineShiftDays);

  const start = idx.today;
  let finish: DateKey | undefined;
  let readingDays: number | undefined;
  if (schedule) {
    const p = project(remaining, schedule, start, rules);
    finish = p.date;
    readingDays = p.reachable ? p.readingDays : undefined;
  }
  const reqPace = deadline ? requiredPace(remaining, start, deadline, rules) : undefined;
  const delta = deadline ? deadlineDelta(finish, deadline, rules) : undefined;
  return {
    remaining,
    schedule,
    weekly: schedule ? scheduleWeeklyTotal(schedule) : 0,
    readingDays,
    finish,
    deadline,
    requiredPace: reqPace,
    delta,
    meetsDeadline: deadline ? !!finish && finish <= deadline : undefined,
    totalTimeSec: ppm ? (remaining / ppm) * 60 : undefined,
    rules,
  };
}

/**
 * Deterministic planner used by the AI What-If Planner: given a target,
 * a number of days and an optional daily time cap, compute the required pace
 * and whether it fits.
 */
export function planWithin(idx: LibraryIndex, target: TargetInfo, days: number, maxMinutesPerDay?: number) {
  const deadline = addDays(idx.today, Math.max(0, days - 1));
  const res = evaluate(idx, target, { deadline });
  const ppm = idx.pagesPerMinute();
  const reqPace = res.requiredPace;
  const minutesNeeded = reqPace !== undefined && ppm ? reqPace / ppm : undefined;
  const capPace = maxMinutesPerDay !== undefined && ppm ? maxMinutesPerDay * ppm : undefined;
  const feasible = maxMinutesPerDay === undefined ? true : minutesNeeded !== undefined ? minutesNeeded <= maxMinutesPerDay + 1e-9 : undefined;
  const atCap = capPace ? evaluate(idx, target, { pace: capPace, deadline }) : undefined;
  return { deadline, remaining: res.remaining, requiredPace: reqPace, minutesNeeded, feasible, capPace, finishAtCap: atCap?.finish, pagesPerMinute: ppm };
}

/** How much can be read in a time budget, at measured speed. */
export function timeBudget(idx: LibraryIndex, minutes: number, item?: Item) {
  let perMin: number | null = null;
  if (item) {
    const ss = idx.sessionsByItem.get(item.id) ?? [];
    let amt = 0;
    let sec = 0;
    for (const s of ss) if (s.durationSec && s.durationSec >= 60) {
      amt += s.amount;
      sec += s.durationSec;
    }
    if (sec >= 300) perMin = amt / (sec / 60);
    else if (item.unit === 'minutes' || item.unit === 'hours') perMin = 1;
    else if (item.unit === 'pages') perMin = idx.pagesPerMinute();
  } else perMin = idx.pagesPerMinute();
  return { amount: perMin ? minutes * perMin : undefined, perMinute: perMin };
}
