// Stage 4 part 7 (EV): events read as events — one record per event, its kind, its date's precision, its war's span,
// and which event a name means in a book.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { allEvents, allWars, type AtlasEvent, placeEventsFirst, warSpan, warsNear } from './context';
import { eventCaution, eventPrecision, sides } from './eventText';
import { resolvePlace } from './resolve';
import { pickNamedEvents } from '../world/bookWorld';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel)), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
type F = { properties: AtlasEvent & Record<string, unknown> };
const WD = (JSON.parse(readFileSync(join(PUB, 'atlas/wikidata-events.json'), 'utf8')).features as F[]).map((f) => f.properties);

describe('[data] the event layers hold historical events, once each (A8-005, A8-007, A8-025, A8-012)', () => {
  it('nothing after 1945, no “Siege of …” typed as a battle', () => {
    expect(WD.filter((e) => e.y > 1945)).toEqual([]);
    expect(WD.filter((e) => e.k === 'battle' && /\bsieges? of\b/i.test(e.n) && !/battle/i.test(e.n))).toEqual([]);
  });
  it('one event recorded as two Wikidata items is drawn once, the other kept as its duplicate', () => {
    expect(WD.some((e) => Array.isArray(e.dq) && e.dq.length > 0)).toBe(true);
    const qs = new Set(WD.map((e) => e.q));
    for (const e of WD.filter((x) => x.dq)) for (const d of e.dq!) expect(qs.has(d)).toBe(false);
  });
  it('an event dated outside its own war says so; the era-reversed case is told apart', () => {
    const brundisium = WD.find((e) => e.n === 'Siege of Brundisium' && e.y === 49);
    expect(brundisium?.wo).toBe('sign');
    expect(eventCaution(brundisium as unknown as Record<string, unknown>)).toMatch(/BCE\/CE the wrong way round/);
  });
});

describe('HCED battles are events, matched by identity, not nearness (A8-001, A8-002, A8-003, A8-016)', () => {
  it('HCED-only battles are in the event list, with their year ranges', async () => {
    const ev = await allEvents();
    const hc = ev.filter((e) => e.q.startsWith('hced:'));
    expect(hc.length).toBeGreaterThan(1000);
    expect(hc.some((e) => e.y2 !== undefined && e.y2 > e.y)).toBe(true);
  });
  it('a battle both record is one event carrying HCED’s record, and a disagreement on where is kept', () => {
    expect(WD.filter((e) => e.h).length).toBeGreaterThan(1000);
    const far = WD.filter((e) => e.hd !== undefined);
    expect(far.length).toBeGreaterThan(0);
    for (const e of far) expect(e.hd!).toBeGreaterThanOrEqual(25);
  });
  it('winners named by present-day country before 1600 are said to be HCED’s naming', () => {
    expect(sides({ y: 1455, win: 'Scotland', los: 'Earl of Douglas' })[0]).toMatch(/present-day country/);
    expect(sides({ y: 1815, win: 'United Kingdom' })[0]).not.toMatch(/present-day/);
  });
});

describe('dates and wars (A8-010, A8-011, TM-6, PA-005, A8-038)', () => {
  it('every event says how precisely it is dated', () => {
    expect(eventPrecision()).toMatch(/to the year/);
    expect(eventPrecision('decade')).toBe('Date known only to the decade');
  });
  it('a war with no recorded end is in progress until its last recorded event, not only in its first year', async () => {
    const [wars, ev] = await Promise.all([allWars(), allEvents()]);
    const livonian = wars.find((w) => w.n === 'Livonian Crusade')!;
    expect(livonian.t).toBeNull();
    expect(warSpan(livonian, ev)).toEqual([1198, 1279]);
    const near = await warsNear([24.1, 57.0], 1250, 600);
    expect(near.some((w) => w.n === 'Livonian Crusade')).toBe(true);
  });
  it('a war with no recorded start is dated from its first event', async () => {
    const [wars, ev] = await Promise.all([allWars(), allEvents()]);
    const w = wars.find((x) => x.n === 'Seljuk–Ghaznavid Wars')!;
    expect(warSpan(w, ev)).toEqual([1040, 1040]);
  });
});

describe('events at a place and in a book (A8-017, A8-027, A8-026, AR-4)', () => {
  it('the place’s own events come first, whatever their date', () => {
    const e = (n: string, y: number, km: number) => ({ q: n, n, k: 'battle', y, pos: [0, 0] as [number, number], km });
    expect(placeEventsFirst([e('far early', 100, 200), e('here late', 900, 3), e('near', 500, 80)]).map((x) => x.n)).toEqual(['here late', 'near', 'far early']);
  });
  it('“Battle of Panipat” in a book set in 1761 is the third battle; with no dates, all are listed as unsettled', async () => {
    const ev = (await allEvents()).filter((e) => /Battle of Panipat$/.test(e.n));
    expect(ev.length).toBeGreaterThanOrEqual(3);
    const picked = pickNamedEvents(ev.filter((e) => e.n === 'Battle of Panipat'), { earliest: 1520, latest: 1530 });
    expect(picked.map((e) => e.y)).toEqual([1526]);
    const open = pickNamedEvents(ev.filter((e) => e.n === 'Battle of Panipat'), {});
    expect(open.every((e) => e.sameName === open.length)).toBe(true);
  });
  it('an event’s name is not resolved as a place', async () => {
    const r = await resolvePlace('Battle of Panipat', { year: 1761, detection: 'cue', online: false });
    expect(r.place?.kind === 'settlement').toBe(false);
  });
});
