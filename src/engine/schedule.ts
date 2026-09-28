// Pure schedule mathematics: turning a remaining amount and a weekly
// schedule into reading days and calendar completion dates.
import type { DateKey, WeekSchedule } from '../db/types';
import { addDays, type DayRules, eligibleDays, isExcluded, weekday } from './dates';

/** Constant pace on every day except the excluded weekdays. */
export function constantSchedule(pace: number, excludedWeekdays: number[] = []): WeekSchedule {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => (excludedWeekdays.includes(d) ? 0 : pace)) as WeekSchedule;
}

export function scheduleWeeklyTotal(s: WeekSchedule): number {
  return s.reduce((a, b) => a + b, 0);
}

/** Average amount per calendar day of a schedule. */
export function scheduleDailyAverage(s: WeekSchedule): number {
  return scheduleWeeklyTotal(s) / 7;
}

export interface Projection {
  /** Calendar date the remaining amount is finished, if reachable. */
  date?: DateKey;
  /** Reading days needed (fractional on the final partial day). */
  readingDays: number;
  /** Calendar days from start to finish, inclusive of start. */
  calendarDays: number;
  reachable: boolean;
}

const MAX_DAYS = 365 * 60;

/**
 * Walk the calendar from `start` (inclusive), consuming the schedule's
 * capacity each non-excluded day until `remaining` is exhausted.
 */
export function project(remaining: number, schedule: WeekSchedule, start: DateKey, rules: DayRules = { weekdays: [], dates: [] }): Projection {
  if (remaining <= 0) return { date: start, readingDays: 0, calendarDays: 0, reachable: true };
  if (scheduleWeeklyTotal(schedule) <= 0) return { readingDays: Infinity, calendarDays: Infinity, reachable: false };
  const excluded = new Set(rules.dates);
  let left = remaining;
  let readingDays = 0;
  let k = start;
  let wd = weekday(start);
  for (let i = 0; i < MAX_DAYS; i++) {
    const cap = rules.weekdays.includes(wd) || excluded.has(k) ? 0 : schedule[wd];
    if (cap > 0) {
      if (left <= cap + 1e-9) {
        readingDays += left / cap;
        return { date: k, readingDays, calendarDays: i + 1, reachable: true };
      }
      left -= cap;
      readingDays += 1;
    }
    k = addDays(k, 1);
    wd = (wd + 1) % 7;
  }
  return { readingDays: Infinity, calendarDays: Infinity, reachable: false };
}

/** Total schedule capacity between two dates inclusive. */
export function capacityBetween(schedule: WeekSchedule, a: DateKey, b: DateKey, rules: DayRules = { weekdays: [], dates: [] }): number {
  if (a > b) return 0;
  let total = 0;
  let k = a;
  for (let i = 0; i < MAX_DAYS && k <= b; i++) {
    if (!isExcluded(k, rules)) total += schedule[weekday(k)];
    k = addDays(k, 1);
  }
  return total;
}

/**
 * Required pace per eligible day to finish `remaining` between `from` and
 * `deadline` (both inclusive). Undefined when the deadline has passed.
 */
export function requiredPace(remaining: number, from: DateKey, deadline: DateKey, rules: DayRules): number | undefined {
  if (remaining <= 0) return 0;
  const days = eligibleDays(from, deadline, rules);
  if (days <= 0) return undefined;
  return remaining / days;
}

/**
 * Reading days ahead (+) or behind (−) a deadline for a projected finish.
 * Counts eligible days between the two dates.
 */
export function deadlineDelta(projected: DateKey | undefined, deadline: DateKey, rules: DayRules): number | undefined {
  if (!projected) return undefined;
  if (projected === deadline) return 0;
  if (projected < deadline) return eligibleDays(addDays(projected, 1), deadline, rules);
  return -eligibleDays(addDays(deadline, 1), projected, rules);
}
