// Streaks and momentum. Skip days (configured non-reading days) neither
// extend nor break a streak.
import type { DateKey } from '../db/types';
import { addDays, type DayRules, isExcluded } from './dates';

export interface StreakResult {
  current: number;
  longest: number;
  longestStart?: DateKey;
  longestEnd?: DateKey;
  /** True if today still needs reading to keep the streak going. */
  pendingToday: boolean;
}

export function computeStreaks(active: Set<DateKey>, today: DateKey, skip: DayRules): StreakResult {
  if (active.size === 0) return { current: 0, longest: 0, pendingToday: false };

  // Current streak: walk back from today. If today isn't read yet, start from
  // yesterday — the day isn't over.
  let current = 0;
  let k = today;
  const pendingToday = !active.has(today) && !isExcluded(today, skip);
  if (pendingToday) k = addDays(today, -1);
  for (let i = 0; i < 40_000; i++) {
    if (active.has(k)) current++;
    else if (!isExcluded(k, skip)) break;
    k = addDays(k, -1);
    if (k < '1900-01-01') break;
  }

  // Longest: forward pass from the first active day.
  const sorted = [...active].filter((d) => d <= today).sort();
  let longest = 0;
  let longestStart: DateKey | undefined;
  let longestEnd: DateKey | undefined;
  let run = 0;
  let runStart: DateKey | undefined;
  let lastActive: DateKey | undefined;
  if (sorted.length) {
    let d = sorted[0];
    const end = sorted[sorted.length - 1];
    for (let i = 0; i < 40_000 && d <= end; i++) {
      if (active.has(d)) {
        if (run === 0) runStart = d;
        run++;
        lastActive = d;
        if (run > longest) {
          longest = run;
          longestStart = runStart;
          longestEnd = lastActive;
        }
      } else if (!isExcluded(d, skip)) {
        run = 0;
      }
      d = addDays(d, 1);
    }
  }
  return { current, longest: Math.max(longest, current), longestStart, longestEnd, pendingToday };
}

export interface Momentum {
  recent: number;
  previous: number;
  /** Fractional change, e.g. 0.24 = +24%. Undefined when not comparable. */
  change?: number;
  enoughData: boolean;
}

/**
 * Compare the last `window` days (ending today) with the `window` days before.
 * Requires reading in the earlier window to be meaningful.
 */
export function momentum(totals: Map<DateKey, number>, today: DateKey, window = 14): Momentum {
  const recentStart = addDays(today, -(window - 1));
  const prevStart = addDays(recentStart, -window);
  const prevEnd = addDays(recentStart, -1);
  let recent = 0;
  let previous = 0;
  for (const [k, v] of totals) {
    if (k >= recentStart && k <= today) recent += v;
    else if (k >= prevStart && k <= prevEnd) previous += v;
  }
  const enoughData = previous > 0;
  return { recent, previous, change: enoughData ? (recent - previous) / previous : undefined, enoughData };
}
