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
    const m = await matchName('Kororareka', 1300, { context: ctx(174.1, -35.3) });
    expect(m.status).toBe('none');
    expect(m.reason).toMatch(/no dated place data for Oceania/);
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
    // Shelf holds only Perth in Scotland: a book set in Western Australia does not get it pinned.
    const m = await matchName('Perth', 1890, { context: ctx(115.86, -31.95) });
    expect(m.status).toBe('ambiguous');
    expect(m.place).toBeUndefined();
    expect(m.candidates).toHaveLength(1);
    expect(m.reason).toMatch(/probably a different place/);
  });
  it('is still placed when the book is set near it', async () => {
    const m = await matchName('Perth', 1890, { context: ctx(-3.6, 56.6) });
    expect(m.status).toBe('unique');
  });
  it('now that Shelf holds the world cities, the right one is chosen by the book’s geography', async () => {
    for (const [n, lon, lat] of [['Santiago', -70.65, -33.45], ['Wellington', 174.78, -41.29], ['Troy', -73.69, 42.73]] as const) {
      const m = await matchName(n, 1890, { context: ctx(lon, lat) });
      expect(m.place?.gazetteer, n).toBe('hurbpop');
    }
  });
});
