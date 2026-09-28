// Deterministic text summaries of engine output, used as AI context.
import { addDays, formatKey } from '../engine/dates';
import { readingBrain } from '../engine/brain';
import { libraryForecast, overallPace } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { finishedIn, overview } from '../engine/stats';
import { fmtNum } from '../engine/units';

export function brainSummary(idx: LibraryIndex): string {
  const ov = overview(idx);
  const last30 = overview(idx, { from: addDays(idx.today, -29), to: idx.today });
  const pace = overallPace(idx);
  const lib = libraryForecast(idx);
  const fin = finishedIn(idx);
  const lines = [
    `Today: ${idx.today}`,
    `Lifetime: ${ov.sessions} sessions, ${fmtNum(ov.pages)} pages, ${fmtNum(ov.minutes / 60, 1)} hours timed, ${fin.length} finished readings.`,
    `Last 30 days: ${last30.sessions} sessions, ${fmtNum(last30.pages)} pages, ${last30.activeDays} active days.`,
    `Current streak ${ov.currentStreak} days; longest ${ov.longestStreak}.`,
    pace ? `Current pace: ${fmtNum(pace, 1)} pages per reading day.` : 'Current pace: not enough data.',
    `Unfinished library: ${fmtNum(lib.remaining)} pages remaining${lib.estimatedFinish ? `, estimated to finish ${formatKey(lib.estimatedFinish)} at ${fmtNum(lib.pace, 1)} pages/day (${fmtNum(lib.readingDays)} reading days)` : ''}.`,
  ];
  const obs = readingBrain(idx);
  if (obs.length) lines.push('Observed patterns (computed):', ...obs.map((o) => `- ${o.text} (${o.evidence})`));
  else lines.push('Observed patterns: not enough data yet.');
  return lines.join('\n');
}

