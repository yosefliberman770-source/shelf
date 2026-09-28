// Reading Brain: observations computed from actual data, each gated by a
// minimum-evidence threshold. If there isn't enough data, nothing is claimed.
import type { Item } from '../db/types';
import { addDays, diffDays, keyFromMs, weekday, WEEKDAYS_LONG } from './dates';
import type { LibraryIndex } from './model';
import { finishedIn, pagesByDay, sessionPages, speed, timeProfile } from './stats';

export interface Observation {
  id: string;
  text: string;
  evidence: string;
  tone: 'neutral' | 'positive' | 'attention';
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

export function readingBrain(idx: LibraryIndex): Observation[] {
  const out: Observation[] = [];
  const sessions = idx.sessions;
  if (sessions.length < 5) return out;
  const today = idx.today;

  // 1. Weekend vs weekday pages per day over the observed span.
  const pd = pagesByDay(idx);
  const first = sessions[0].date;
  const span = diffDays(first, today) + 1;
  if (span >= 28 && pd.size >= 10) {
    let we = 0, wd = 0, weDays = 0, wdDays = 0;
    for (let k = first, i = 0; i < span; i++, k = addDays(k, 1)) {
      const v = pd.get(k) ?? 0;
      const w = weekday(k);
      if (w === 0 || w === 6) { we += v; weDays++; } else { wd += v; wdDays++; }
    }
    const weAvg = we / weDays;
    const wdAvg = wd / wdDays;
    if (wdAvg > 0 && weAvg > 0) {
      const r = weAvg / wdAvg - 1;
      if (Math.abs(r) >= 0.15)
        out.push({
          id: 'weekend',
          text: r > 0 ? `You read ${pct(r)} more pages per day on weekends.` : `You read ${pct(r)} fewer pages per day on weekends.`,
          evidence: `${Math.round(weAvg)} pages/weekend day vs ${Math.round(wdAvg)} pages/weekday over ${span} days.`,
          tone: 'neutral',
        });
    }
  }

  // 2. Session length trend: earliest third vs latest third of timed sessions.
  const timed = sessions.filter((s) => (s.durationSec ?? 0) >= 60);
  if (timed.length >= 12) {
    const n = Math.floor(timed.length / 3);
    const avg = (arr: typeof timed) => arr.reduce((a, s) => a + s.durationSec!, 0) / arr.length / 60;
    const early = avg(timed.slice(0, n));
    const late = avg(timed.slice(-n));
    if (Math.abs(late - early) / early >= 0.2)
      out.push({
        id: 'session-trend',
        text: `Your average session ${late > early ? 'increased' : 'decreased'} from ${Math.round(early)} to ${Math.round(late)} minutes.`,
        evidence: `Earliest ${n} vs latest ${n} timed sessions.`,
        tone: late > early ? 'positive' : 'neutral',
      });
  }

  // 3. Finishing speed after 70%: pace in last 30% vs first 70% of finished books.
  const fin = finishedIn(idx).filter((f) => f.item.total);
  let faster = 0, compared = 0;
  for (const f of fin) {
    const ins = (idx.instancesByItem.get(f.item.id) ?? []).find((i) => i.number === f.instanceNumber);
    const ss = ins ? idx.sessionsByInstance.get(ins.id) ?? [] : [];
    if (ss.length < 4) continue;
    const total = f.item.total!;
    let pos = 0;
    let splitDay: string | undefined;
    for (const s of ss) { pos += s.amount; if (!splitDay && pos >= 0.7 * total) splitDay = s.date; }
    const start = ss[0].date;
    const end = ss[ss.length - 1].date;
    if (!splitDay || splitDay === start || splitDay === end) continue;
    const earlyRate = (0.7 * total) / (diffDays(start, splitDay) + 1);
    const lateRate = (0.3 * total) / (diffDays(splitDay, end) + 1);
    compared++;
    if (lateRate > earlyRate * 1.1) faster++;
  }
  if (compared >= 3 && faster / compared >= 0.6)
    out.push({
      id: 'finish-sprint',
      text: 'You usually finish books faster after passing 70%.',
      evidence: `True for ${faster} of ${compared} finished books with enough sessions.`,
      tone: 'positive',
    });

  // 4. Speed by top-level folder/genre.
  const groups = new Map<string, typeof sessions>();
  for (const s of timed) {
    const it = idx.items.get(s.itemId);
    if (!it) continue;
    const g = it.genres[0] ?? idx.folderPath(it.folderIds[0] ?? '')[0]?.name;
    if (!g) continue;
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  const speeds = [...groups.entries()]
    .filter(([, ss]) => ss.length >= 3)
    .map(([g, ss]) => ({ g, v: speed(idx, ss) }))
    .filter((x): x is { g: string; v: number } => !!x.v)
    .sort((a, b) => a.v - b.v);
  if (speeds.length >= 2) {
    const slow = speeds[0];
    const fast = speeds[speeds.length - 1];
    if (fast.v / slow.v >= 1.15)
      out.push({
        id: 'category-speed',
        text: `You read ${slow.g} more slowly than ${fast.g}.`,
        evidence: `${Math.round(slow.v)} vs ${Math.round(fast.v)} pages/hour across timed sessions.`,
        tone: 'neutral',
      });
  }

  // 5. Where abandoned books are abandoned.
  const dnf = idx.itemList().filter((i) => i.status === 'dnf' && i.total);
  if (dnf.length >= 3) {
    const points = dnf.map((i) => idx.position(i) / i.total!).sort((a, b) => a - b);
    const median = points[Math.floor(points.length / 2)];
    const early = points.filter((p) => p <= 0.15).length;
    out.push({
      id: 'abandon',
      text: early / points.length >= 0.5
        ? 'Most books you abandon are abandoned within the first 15%.'
        : `You typically set books aside around ${pct(median)} of the way through.`,
      evidence: `${dnf.length} books marked didn't finish; median stopping point ${pct(median)}.`,
      tone: 'neutral',
    });
  }

  // 6. Started vs finished in the last 30 days.
  const since = addDays(today, -29);
  const started = idx.snap.instances.filter((i) => i.startedOn && i.startedOn >= since).length;
  const finishedRecent = idx.snap.instances.filter((i) => i.finishedOn && i.finishedOn >= since).length;
  if (started >= 3 && finishedRecent === 0)
    out.push({
      id: 'started-not-finished',
      text: `You started ${started} books in the last 30 days but haven't finished any.`,
      evidence: 'Based on reading start and finish dates.',
      tone: 'attention',
    });

  // 7. Deadline effect: daily pace on items with vs without deadlines.
  const withDl: typeof sessions = [];
  const withoutDl: typeof sessions = [];
  for (const s of sessions) {
    const it = idx.items.get(s.itemId);
    if (!it) continue;
    (it.deadline ? withDl : withoutDl).push(s);
  }
  if (withDl.length >= 8 && withoutDl.length >= 8) {
    const perSession = (arr: typeof sessions) => arr.reduce((a, s) => a + (sessionPages(idx, s) ?? 0), 0) / arr.length;
    const a = perSession(withDl);
    const b = perSession(withoutDl);
    if (b > 0 && a / b >= 1.2)
      out.push({
        id: 'deadline',
        text: `You read ${pct(a / b - 1)} more per session on books with a deadline.`,
        evidence: `${Math.round(a)} vs ${Math.round(b)} pages per session.`,
        tone: 'neutral',
      });
  }

  // 8. Peak hour and weekday.
  const tp = timeProfile(idx);
  const totalMin = tp.hours.reduce((a, b) => a + b, 0);
  if (totalMin >= 300) {
    const peakH = tp.hours.indexOf(Math.max(...tp.hours));
    const peakD = tp.weekdays.indexOf(Math.max(...tp.weekdays));
    out.push({
      id: 'peak',
      text: `Your reading peaks around ${fmtHour(peakH)}, and ${WEEKDAYS_LONG[peakD]} is your biggest reading day.`,
      evidence: `${Math.round(totalMin / 60)} hours of timed reading analysed.`,
      tone: 'neutral',
    });
  }

  // 9. Ratings vs length.
  const rated = finishedIn(idx).filter((f) => f.rating && f.item.total && f.item.unit === 'pages');
  if (rated.length >= 8) {
    const long = rated.filter((f) => f.item.total! >= 400);
    const short = rated.filter((f) => f.item.total! < 250);
    if (long.length >= 3 && short.length >= 3) {
      const avg = (a: typeof rated) => a.reduce((s, f) => s + f.rating!, 0) / a.length;
      const d = avg(long) - avg(short);
      if (Math.abs(d) >= 0.4)
        out.push({
          id: 'length-rating',
          text: `You tend to rate ${d > 0 ? 'longer' : 'shorter'} books higher.`,
          evidence: `Books 400+ pages average ${avg(long).toFixed(1)}★; under 250 pages average ${avg(short).toFixed(1)}★.`,
          tone: 'neutral',
        });
    }
  }
  return out;
}

function fmtHour(h: number): string {
  const s = h % 12 === 0 ? 12 : h % 12;
  return `${s} ${h < 12 ? 'AM' : 'PM'}`;
}

export function untouched(idx: LibraryIndex, days: number): Item[] {
  const cutoff = addDays(idx.today, -days);
  return idx.itemList().filter((i) => {
    if (i.status !== 'reading' && i.status !== 'paused') return false;
    const last = idx.lastReadDate(i) ?? keyFromMs(i.createdAt);
    return last < cutoff;
  });
}
