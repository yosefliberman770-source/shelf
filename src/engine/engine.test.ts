import { describe, expect, it } from 'vitest';
import { addDays, diffDays, eligibleDays, weekday } from './dates';
import { readingBrain } from './brain';
import { aggregateForecast, itemForecast, paceTable, windowPace } from './forecast';
import { evaluate, resolveTarget, simulateQueue } from './future';
import { goalProgress } from './goals';
import { LibraryIndex } from './model';
import { parseQuestion, runQuery } from './query';
import { personalRecords } from './records';
import { constantSchedule, deadlineDelta, project, requiredPace } from './schedule';
import { computeStreaks, momentum } from './streaks';
import { emptySnapshot, logSession, makeItem } from './testkit';

const NONE = { weekdays: [], dates: [] };

describe('dates', () => {
  it('handles month and year boundaries and DST', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('counts eligible days excluding weekdays and dates', () => {
    // 2026-09-28 is a Monday.
    expect(weekday('2026-09-28')).toBe(1);
    expect(eligibleDays('2026-09-28', '2026-10-04', NONE)).toBe(7);
    expect(eligibleDays('2026-09-28', '2026-10-04', { weekdays: [0, 6], dates: [] })).toBe(5);
    expect(eligibleDays('2026-09-28', '2026-10-04', { weekdays: [0], dates: ['2026-09-30'] })).toBe(5);
  });
});

describe('schedule math', () => {
  it('1,000 pages at 20/day is 50 reading days', () => {
    const p = project(1000, constantSchedule(20), '2026-09-28');
    expect(p.readingDays).toBe(50);
    expect(p.date).toBe(addDays('2026-09-28', 49));
  });
  it('700 remaining at 20/day is 35 reading days', () => {
    expect(project(700, constantSchedule(20), '2026-09-28').readingDays).toBe(35);
  });
  it('fractional final day (281 @ 20 = 14.05)', () => {
    const p = project(281, constantSchedule(20), '2026-09-28');
    expect(p.readingDays).toBeCloseTo(14.05, 5);
    expect(p.date).toBe(addDays('2026-09-28', 14));
  });
  it('skips excluded weekdays when projecting', () => {
    // 100 pages, 20/day, no Sundays. Mon 28 Sep start → 5 days Mon–Fri.
    const p = project(100, constantSchedule(20), '2026-09-28', { weekdays: [0], dates: [] });
    expect(p.date).toBe('2026-10-02');
    const p2 = project(140, constantSchedule(20), '2026-09-28', { weekdays: [0], dates: [] });
    // Mon..Sat = 6 days (120), Sunday skipped, Monday 5 Oct completes.
    expect(p2.date).toBe('2026-10-05');
  });
  it('complex weekly schedules', () => {
    // Mon–Thu 20, Fri 10, Sat excluded, Sun 50 → 140/week.
    const sched: [number, number, number, number, number, number, number] = [50, 20, 20, 20, 20, 10, 0];
    const p = project(280, sched, '2026-09-28');
    expect(p.date).toBe('2026-10-11'); // exactly two weeks, ending Sunday
  });
  it('required pace and deadline delta', () => {
    expect(requiredPace(300, '2026-09-28', '2026-10-07', NONE)).toBe(30);
    expect(requiredPace(300, '2026-09-28', '2026-09-27', NONE)).toBeUndefined();
    expect(deadlineDelta('2026-10-10', '2026-10-07', NONE)).toBe(-3);
    expect(deadlineDelta('2026-10-02', '2026-10-07', NONE)).toBe(5);
    expect(deadlineDelta('2026-10-07', '2026-10-07', NONE)).toBe(0);
  });
  it('unreachable with zero capacity', () => {
    expect(project(10, constantSchedule(0), '2026-09-28').reachable).toBe(false);
  });
});

describe('item forecast', () => {
  it('computes SPQR-style forecast from real sessions', () => {
    const snap = emptySnapshot();
    const { item, instance } = makeItem(snap, { title: 'SPQR', total: 608 });
    // 14 days × ~20 pages before today, plus earlier reading, totalling 327.
    let pos = 0;
    for (let i = 30; i >= 1; i--) {
      const amt = i <= 14 ? 20 : 3;
      logSession(snap, item, instance, addDays('2026-09-28', -i), amt, 1800);
      pos += amt;
    }
    logSession(snap, item, instance, addDays('2026-09-28', -31), 327 - pos);
    const idx = new LibraryIndex(snap, '2026-09-28');
    const f = itemForecast(idx, item);
    expect(f.completed).toBe(327);
    expect(f.remaining).toBe(281);
    expect(f.percent).toBeCloseTo(327 / 608);
    expect(f.currentPace).toBe(20);
    expect(f.paceSource).toBe('current');
    expect(f.readingDaysRemaining).toBeCloseTo(14.05);
    expect(f.estimatedFinish).toBe(addDays('2026-09-28', 14));
    expect(f.status).toBe('none');
  });

  it('no deadline yet is never overdue, and adding one yields ahead/behind', () => {
    const snap = emptySnapshot();
    const { item, instance } = makeItem(snap, { title: 'X', total: 300 });
    for (let i = 14; i >= 1; i--) logSession(snap, item, instance, addDays('2026-09-28', -i), 10);
    const idx = new LibraryIndex(snap, '2026-09-28');
    expect(itemForecast(idx, item).status).toBe('none');
    // 160 left @10/day → 16 days → finishes Oct 13. Deadline Oct 10 → 3 behind.
    item.deadline = '2026-10-10';
    const f = itemForecast(new LibraryIndex(snap, '2026-09-28'), item);
    expect(f.remaining).toBe(160);
    expect(f.estimatedFinish).toBe('2026-10-13');
    expect(f.status).toBe('behind');
    expect(f.delta).toBe(-3);
    expect(f.requiredPace).toBeCloseTo(160 / 13);
    item.deadline = '2026-10-18';
    const g = itemForecast(new LibraryIndex(snap, '2026-09-28'), item);
    expect(g.status).toBe('ahead');
    expect(g.delta).toBe(5);
  });

  it('falls back to target then default pace without history', () => {
    const snap = emptySnapshot();
    const { item } = makeItem(snap, { title: 'Y', total: 100, dailyTarget: 25 });
    const f = itemForecast(new LibraryIndex(snap, '2026-09-28'), item);
    expect(f.paceSource).toBe('target');
    expect(f.readingDaysRemaining).toBe(4);
    item.dailyTarget = undefined;
    const g = itemForecast(new LibraryIndex(snap, '2026-09-28'), item);
    expect(g.paceSource).toBe('default');
    expect(g.pace).toBe(20);
  });

  it('pace excludes non-reading days', () => {
    const totals = new Map<string, number>();
    // Two weeks Mon–Sat 20 pages, Sundays excluded.
    for (let i = 1; i <= 14; i++) {
      const d = addDays('2026-09-28', -i);
      if (weekday(d) !== 0) totals.set(d, 20);
    }
    expect(windowPace(totals, '2026-09-28', 14, { weekdays: [0], dates: [] })).toBe(20);
    expect(windowPace(totals, '2026-09-28', 14, NONE)).toBeCloseTo((12 * 20) / 14);
  });
});

describe('aggregate forecast', () => {
  it('folder math: 7 books totalling 1,000 pages at 20/day', () => {
    const snap = emptySnapshot();
    snap.folders.push({ id: 'rome', name: 'Roman History', tags: [], order: 0, createdAt: 0, goalPace: 20 });
    const sizes = [100, 150, 120, 180, 130, 170, 150];
    sizes.forEach((total, i) => makeItem(snap, { title: `B${i}`, total, folderIds: ['rome'], status: 'want' }));
    const idx = new LibraryIndex(snap, '2026-09-28');
    const f = aggregateForecast(idx, { items: idx.itemsInFolder('rome'), plannedPace: 20 });
    expect(f.total).toBe(1000);
    expect(f.remaining).toBe(1000);
    expect(f.readingDays).toBe(50);
    expect(f.paceSource).toBe('target');
  });

  it('includes nested folders without duplicating multi-folder books', () => {
    const snap = emptySnapshot();
    snap.folders.push({ id: 'h', name: 'History', tags: [], order: 0, createdAt: 0 });
    snap.folders.push({ id: 'a', name: 'Ancient', parentId: 'h', tags: [], order: 0, createdAt: 0 });
    snap.folders.push({ id: 'r', name: 'Rome', parentId: 'a', tags: [], order: 0, createdAt: 0 });
    makeItem(snap, { title: 'SPQR', total: 600, folderIds: ['r', 'a', 'h'] });
    makeItem(snap, { title: 'Other', total: 200, folderIds: ['h'] });
    const idx = new LibraryIndex(snap, '2026-09-28');
    expect(idx.itemsInFolder('h')).toHaveLength(2);
    expect(aggregateForecast(idx, { items: idx.itemsInFolder('h') }).total).toBe(800);
    expect(idx.itemsInFolder('r')).toHaveLength(1);
  });

  it('project required pace vs current pace', () => {
    const snap = emptySnapshot();
    const a = makeItem(snap, { title: 'A', total: 1000 });
    for (let i = 14; i >= 1; i--) logSession(snap, a.item, a.instance, addDays('2026-09-28', -i), 25);
    const idx = new LibraryIndex(snap, '2026-09-28');
    const f = aggregateForecast(idx, { items: [a.item], deadline: addDays('2026-09-28', 19) });
    expect(f.remaining).toBe(650);
    expect(f.currentPace).toBe(25);
    expect(f.requiredPace).toBeCloseTo(32.5);
    expect(f.paceChange).toBeCloseTo(7.5);
    expect(f.status).toBe('behind');
  });

  it('keeps non-convertible units separate instead of inventing pages', () => {
    const snap = emptySnapshot();
    makeItem(snap, { title: 'Course', total: 18, unit: 'lessons', contentType: 'course' });
    makeItem(snap, { title: 'Audio', total: 600, unit: 'hours', contentType: 'audiobook', pageCount: 400 });
    const idx = new LibraryIndex(snap, '2026-09-28');
    const f = aggregateForecast(idx, { items: idx.itemList() });
    expect(f.total).toBe(400);
    expect(f.separate).toHaveLength(1);
  });

  it('library pace table', () => {
    const snap = emptySnapshot();
    const idx = new LibraryIndex(snap, '2026-09-28');
    const rows = paceTable(idx, 17421, [20, 30, 50]);
    expect(rows[0].readingDays).toBeCloseTo(871.05);
    expect(Math.ceil(rows[1].readingDays)).toBe(581);
    expect(Math.ceil(rows[2].readingDays)).toBe(349);
  });
});

describe('streaks & momentum', () => {
  it('counts current and longest streaks, pending today', () => {
    const days = new Set(['2026-09-25', '2026-09-26', '2026-09-27']);
    const r = computeStreaks(days, '2026-09-28', NONE);
    expect(r.current).toBe(3);
    expect(r.pendingToday).toBe(true);
    days.add('2026-09-28');
    expect(computeStreaks(days, '2026-09-28', NONE).current).toBe(4);
  });
  it('skip days neither break nor extend', () => {
    // Sundays skipped. 2026-09-27 is Sunday.
    const days = new Set(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28']);
    const r = computeStreaks(days, '2026-09-28', { weekdays: [0], dates: [] });
    expect(r.current).toBe(4);
    expect(computeStreaks(days, '2026-09-28', NONE).current).toBe(1);
  });
  it('longest streak across gaps', () => {
    const days = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-10', '2026-01-11']);
    const r = computeStreaks(days, '2026-09-28', NONE);
    expect(r.longest).toBe(3);
    expect(r.current).toBe(0);
  });
  it('momentum compares two windows', () => {
    const t = new Map<string, number>();
    for (let i = 0; i < 14; i++) t.set(addDays('2026-09-28', -i), 31);
    for (let i = 14; i < 28; i++) t.set(addDays('2026-09-28', -i), 25);
    const m = momentum(t, '2026-09-28');
    expect(m.change).toBeCloseTo(0.24);
    expect(momentum(new Map([['2026-09-28', 5]]), '2026-09-28').enoughData).toBe(false);
  });
});

describe('what-if & future', () => {
  it('what-if never mutates and responds to pace changes', () => {
    const snap = emptySnapshot();
    const a = makeItem(snap, { title: 'A', total: 600, deadline: '2026-11-30' });
    for (let i = 14; i >= 1; i--) logSession(snap, a.item, a.instance, addDays('2026-09-28', -i), 10);
    const before = JSON.stringify(snap);
    const idx = new LibraryIndex(snap, '2026-09-28');
    const t = resolveTarget(idx, { kind: 'item', id: a.item.id });
    const base = evaluate(idx, t);
    const faster = evaluate(idx, t, { paceDelta: 10 });
    expect(base.remaining).toBe(460);
    expect(base.readingDays).toBeCloseTo(46);
    expect(faster.readingDays).toBeCloseTo(23);
    expect(faster.finish! < base.finish!).toBe(true);
    const noSun = evaluate(idx, t, { excludeWeekdays: [0] });
    expect(noSun.finish! > base.finish!).toBe(true);
    const added = evaluate(idx, t, { addItems: { count: 5, length: 300 } });
    expect(added.remaining).toBe(460 + 1500);
    expect(JSON.stringify(snap)).toBe(before);
  });
  it('queue simulation finishes books in order', () => {
    const snap = emptySnapshot();
    makeItem(snap, { title: 'A', total: 100 });
    makeItem(snap, { title: 'B', total: 100, status: 'want', queue: 'next' });
    const idx = new LibraryIndex(snap, '2026-09-28');
    const sim = simulateQueue(idx, constantSchedule(20), 30);
    expect(sim.finished.map((f) => f.item.title)).toEqual(['A', 'B']);
    expect(sim.finished[0].date).toBe(addDays('2026-09-28', 4));
    expect(sim.pages).toBe(600);
  });
});

describe('goals, records, brain, queries', () => {
  it('goal progress', () => {
    const snap = emptySnapshot();
    const a = makeItem(snap, { title: 'A', total: 500 });
    logSession(snap, a.item, a.instance, '2026-09-28', 42);
    snap.goals.push({ id: 'g', period: 'daily', metric: 'pages', target: 50, active: true, createdAt: 0 });
    const idx = new LibraryIndex(snap, '2026-09-28');
    const p = goalProgress(idx, snap.goals[0]);
    expect(p.value).toBe(42);
    expect(p.ratio).toBeCloseTo(0.84);
  });
  it('records', () => {
    const snap = emptySnapshot();
    const a = makeItem(snap, { title: 'A', total: 500 });
    logSession(snap, a.item, a.instance, '2026-09-20', 30, 3600);
    logSession(snap, a.item, a.instance, '2026-09-21', 80, 3600);
    const r = personalRecords(new LibraryIndex(snap, '2026-09-28'));
    expect(r.find((x) => x.id === 'day')?.value).toBe(80);
    expect(r.find((x) => x.id === 'fast100')?.value).toBeCloseTo((7200 * 100) / 110);
  });
  it('brain says nothing without data', () => {
    expect(readingBrain(new LibraryIndex(emptySnapshot(), '2026-09-28'))).toEqual([]);
  });
  it('parses natural language questions deterministically', () => {
    const p = parseQuestion('Which books have I rated four stars and are under 300 pages?');
    expect(p.query.maxPages).toBe(300);
    expect(p.query.minRating).toBe(4);
    const p2 = parseQuestion('What books have I started but never finished?');
    expect(p2.query.startedNotFinished).toBe(true);
    const p3 = parseQuestion('What books do I own about medieval England?');
    expect(p3.query.subject).toBe('medieval england');
  });
  it('runs combined filters', () => {
    const snap = emptySnapshot();
    snap.folders.push({ id: 'h', name: 'History', tags: [], order: 0, createdAt: 0 });
    makeItem(snap, { title: 'Old', total: 250, publishedYear: 1850, folderIds: ['h'], status: 'want' });
    makeItem(snap, { title: 'New', total: 250, publishedYear: 2010, folderIds: ['h'], status: 'want' });
    makeItem(snap, { title: 'Long', total: 900, publishedYear: 1800, folderIds: ['h'], status: 'want' });
    const idx = new LibraryIndex(snap, '2026-09-28');
    const res = runQuery(idx, { subject: 'history', maxPages: 300, publishedBefore: 1900, statuses: ['want'] });
    expect(res.map((i) => i.title)).toEqual(['Old']);
  });
});
