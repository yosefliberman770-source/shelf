// Stage 4 part 2 (RM-04): what each kind of date means — a first record, a founding, a period, an evidence date.
import 'fake-indexeddb/auto';
import { expression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ITINERE_UNDATED, LAYERS, type LayerCtx, urbanPopulation } from './catalog';
import { matchName } from './gazetteer';
import { timeFit } from './time';
import { MAP_DATE_MEANING, mapDateLabel, type HistMap } from '../world/maps';
import { parseDate } from '../world/histdate';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const ctx = (year: number, showUndated = false): LayerCtx => ({ year, base: '/atlas/', showUndated } as LayerCtx);
const evalExpr = (expr: unknown, props: Record<string, unknown>) => (expression.createExpression(expr as never) as { value: { evaluate: (g: unknown, f: unknown) => unknown } }).value.evaluate({ zoom: 8 }, { type: 1, properties: props });
const filterOf = (id: string, year: number, pick: (s: { id: string; type: string }) => boolean, showUndated = false) => {
  const spec = LAYERS.find((l) => l.id === id)!.specs(ctx(year, showUndated)).find(pick as never)! as { filter: unknown };
  return (props: Record<string, unknown>) => featureFilter(spec.filter as never).filter({ zoom: 12 } as never, { type: 1, properties: props } as never);
};

describe('a first record is evidence for its own date (A15-005, A12-010)', () => {
  it('[rule] long after a first record with no end, the place is persisting, not attested', () => {
    expect(timeFit({ from: 1200, startKind: 'attested' }, 1700, { slack: 50, firstRecordOnly: true })).toBe('earlier');
    expect(timeFit({ from: 1200, startKind: 'attested' }, 1230, { slack: 50, firstRecordOnly: true })).toBe('within');
    expect(timeFit({ from: 1200, startKind: 'founded' }, 1700, { slack: 50, firstRecordOnly: true })).toBe('within'); // founded, never ended
  });
});

describe('a founding of a building is not the beginning of the place (A12-014, TM-5)', () => {
  it('[rule] “Lindisfarne” in 793 resolves to the priory record, marked first recorded later, never “none”', async () => {
    const m = await matchName('Lindisfarne', 793);
    expect(m.status).toBe('unique');
    expect(m.temporal).toBe('not-yet-attested');
    expect(m.reason).toMatch(/1093/);
  });
});

describe('the map draws each kind of date for what it is', () => {
  it('a town is not drawn half-size before its first estimate: no line from “below the threshold” (A11-015, X-27)', () => {
    expect(evalExpr(urbanPopulation(1250), { p1200: 0, p1300: 20 })).toBe(0);
    expect(evalExpr(urbanPopulation(1300), { p1200: 0, p1300: 20 })).toBe(20);
    expect(evalExpr(urbanPopulation(1250), { p1200: 44, p1300: 75 })).toBeCloseTo(59.5);
  });

  it('Roman roads: undated segments only in the Roman period, construction-only ones not to the present (A11-024, A11-025)', () => {
    const land = (y: number) => filterOf('roads-roman', y, (s) => s.id === 'roads-roman-land');
    expect(land(-600)({ c: 'Certain' })).toBe(false);
    expect(land(100)({ c: 'Certain' })).toBe(true);
    expect(ITINERE_UNDATED[0]).toBeGreaterThan(-800);
    expect(land(1500)({ f: 120, c: 'Certain' })).toBe(false);
    expect(land(300)({ f: 120, c: 'Certain' })).toBe(true);
  });

  it('a dated Wikidata event is not when a castle begins (A11-011, A8-013, X-16)', () => {
    const castles = (y: number, u = false) => filterOf('castles', y, (s) => s.id === 'castles-pt', u);
    const p = { k: 'castle', f: 1890, fb: 'dated event recorded in Wikidata' };
    expect(castles(1300)(p), 'pt at 1300').toBe(false); // not "first recorded 1944, so absent"…
    const undated = filterOf('castles', 1300, (s) => s.id === 'castles-undated', true);
    expect(undated(p), 'undated at 1300').toBe(true); // …but undated before it, shown when undated records are asked for
    expect(castles(1895)(p), 'pt at 1895').toBe(true);
  });

  it('a start-only site is not drawn past its dataset’s window (A12-010)', () => {
    const arch = filterOf('medieval-archaeology', 1950, (s) => s.id === 'medieval-archaeology-pt');
    expect(arch({ k: 'site', f: 1200, w1: 1900 })).toBe(false);
  });
});

describe('dates written in a book and on maps keep their meaning', () => {
  it('a map’s date says whether it is when it was made or the year in its title (A10-009)', () => {
    const m = { id: 'x', title: 'Rome in 300 AD', date: parseDate('300')!, subjects: [], collection: 'allmaps', holder: '', page: '', rights: '' } as unknown as HistMap;
    expect(MAP_DATE_MEANING.loc).toBe('made');
    expect(mapDateLabel(m)).toMatch(/year in its title/);
  });
});
