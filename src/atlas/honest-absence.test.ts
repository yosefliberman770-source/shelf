// Stage 2 (RM-12): "nothing found" says why. A load failure is not absence; an absence names only the datasets that
// could have the place and says how much Shelf holds where the book is set; a lone namesake on another continent is
// offered, not pinned. Runs against the real offline place index in public/.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { matchName } from './gazetteer';
import { resolvePlace } from './resolve';

const PUB = join(__dirname, '../../public');
let failing: RegExp | null = null;
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  if (failing?.test(url)) return new Response('unavailable', { status: 503 });
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const ctx = (lon: number, lat: number) => ({ points: [[lon, lat] as [number, number]], from: ['test'] });

describe('a name with no record', () => {
  it('in a region where Shelf holds no dated places, says so instead of listing European datasets (A12-005, PA-015)', async () => {
    const m = await matchName('Heian-kyō', 1000, { context: ctx(135.77, 35.01) });
    expect(m.status).toBe('none');
    expect(m.reason).toMatch(/no dated place data for Japan & Korea/);
    expect(m.reason).not.toMatch(/Mérimée|Viabundus/);
    expect(m.reason).toMatch(/does not mean/);
  });
  it('without context, names only the datasets that cover the date, briefly', async () => {
    const m = await matchName('Zzyzxbury', 1200);
    expect(m.status).toBe('none');
    expect(m.reason).toMatch(/other datasets/);
    expect(m.reason.length).toBeLessThan(400);
    expect(m.reason).toMatch(/does not mean no such place existed/);
  });
});

describe('when the place data cannot be loaded', () => {
  it('reports a load failure, not absence, and does not keep it (A12-027, QY-3)', async () => {
    failing = /\/world\/places\/n\//;
    const m = await matchName('Lincoln', 1200);
    expect(m.loadFailed).toBe(true);
    expect(m.reason).toMatch(/couldn’t load/);
    expect(m.reason).not.toMatch(/No place called/);
    const r = await resolvePlace('Lincoln', { year: 1200, detection: 'cue', online: false });
    expect(r.loadFailed).toBe(true);
    failing = null;
    const again = await matchName('Lincoln', 1200);
    expect(again.loadFailed).toBeUndefined();
    expect(again.status).not.toBe('none');
  });
  it('a file that does not exist is an empty shard, not a failure', async () => {
    const m = await matchName('Qqqqqqq', 1200);
    expect(m.loadFailed).toBeUndefined();
  });
});

describe('a lone namesake far from the book (A18-003)', () => {
  it('is offered as a possibility, not pinned, when the book is set on another continent', async () => {
    const alone = await matchName('Seattle');
    if (alone.status !== 'unique') return; // the index has no single "Seattle" any more: nothing to guard
    const m = await matchName('Seattle', 1890, { context: ctx(-122.33, 47.61) });
    expect(m.status).toBe('ambiguous');
    expect(m.place).toBeUndefined();
    expect(m.candidates).toHaveLength(1);
    expect(m.reason).toMatch(/probably a different place/);
  });
  it('is still placed when the book is set near it', async () => {
    const alone = await matchName('Seattle');
    if (alone.status !== 'unique' || !alone.place) return;
    const m = await matchName('Seattle', 1890, { context: ctx(alone.place.lon + 0.5, alone.place.lat) });
    expect(m.status).toBe('unique');
  });
});
