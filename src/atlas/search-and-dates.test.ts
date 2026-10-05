// Stage 2 (RM-06, RM-09, RM-11, RM-01): dates read as written, people don't hide places, Shelf's own world cities
// and word-named towns are findable, and shipwrecks never answer a place name.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { findDatesInText } from '../lib/history/dates';
import { detectPlaces } from '../lib/history/placeDetect';
import { parseDate } from '../world/histdate';
import { matchName, placesByName } from './gazetteer';
import { loadCommonWords } from './mention';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
beforeAll(async () => { await loadCommonWords(); });

describe('a person in the book hides only their own name (PA-001, QY-1)', () => {
  const people = ['Thomas of London', 'Henry of Lancaster', 'Florence Nightingale'];
  it('places the text names elsewhere are still found', () => {
    const names = detectPlaces('Henry of Lancaster wrote to the king. Later he rode to London and then to Lancaster.', [], people).map((m) => m.name);
    expect(names).toContain('London');
    expect(names).toContain('Lancaster');
  });
  it('the occurrence inside the person’s name is not a place', () => {
    const names = detectPlaces('A letter from Henry of Lancaster arrived.', [], people).map((m) => m.name);
    expect(names).not.toContain('Lancaster');
  });
});

describe('counts are not years (PA-007)', () => {
  it('"of N <noun>" is a count; "of N" before a verb or clause is a year', () => {
    expect(findDatesInText('an army of 1200 men marched').map((d) => d.year)).toEqual([]);
    expect(findDatesInText('a fleet of 1500 ships').map((d) => d.year)).toEqual([]);
    expect(findDatesInText('the battle of 1066 was decisive').map((d) => d.year)).toEqual([1066]);
    expect(findDatesInText('the plague of 1348, which').map((d) => d.year)).toEqual([1348]);
  });
});

describe('map-archive dates (PA-013, PA-014)', () => {
  it('reads abbreviated ranges forwards', () => {
    expect(parseDate('1760-65')).toMatchObject({ earliest: 1760, latest: 1765 });
    expect(parseDate('1066–87')).toMatchObject({ earliest: 1066, latest: 1087 });
    expect(parseDate('1798-02')).toMatchObject({ earliest: 1798, latest: 1802 });
  });
  it('reads catalogue conventions', () => {
    expect(parseDate('[18--]')).toMatchObject({ earliest: 1800, latest: 1899 });
    expect(parseDate('176-?')).toMatchObject({ earliest: 1760, latest: 1769 });
    expect(parseDate('c1760')).toMatchObject({ preferred: 1760, precision: 'circa' });
  });
  it('keeps BCE through typographic minus signs, and converts Hijri years', () => {
    expect(parseDate('−1200')).toMatchObject({ earliest: -1200, latest: -1200 });
    expect(parseDate('–500')).toMatchObject({ earliest: -500 });
    expect(parseDate('−44')).toMatchObject({ earliest: -44 });
    const h = parseDate('AH 600')!;
    expect(h.preferred).toBeGreaterThan(1200);
    expect(h.preferred).toBeLessThan(1206);
    expect(parseDate('1099 H.')!.preferred).toBeGreaterThan(1680);
  });
  it('still reads the plain forms as before', () => {
    expect(parseDate('218 BC')).toMatchObject({ earliest: -218 });
    expect(parseDate('1350s')).toMatchObject({ earliest: 1350, latest: 1359 });
    expect(parseDate('1760-1765')).toMatchObject({ earliest: 1760, latest: 1765 });
  });
});

describe('places Shelf holds are findable (A18-001, A23-001, A19-001)', () => {
  it('world cities no other dataset places: Beijing, Delhi, Kyoto', async () => {
    for (const n of ['Beijing', 'Delhi', 'Kyoto']) {
      const m = await matchName(n, 1500);
      expect(m.status, n).not.toBe('none');
      expect([m.place, ...m.candidates].some((p) => p && p.gazetteer === 'hurbpop'), n).toBe(true);
    }
  });
  it('a world city is one place, with its population estimates, not one place per estimate year', async () => {
    const hits = (await placesByName('Beijing')).filter((h) => h.place.gazetteer === 'hurbpop');
    expect(hits).toHaveLength(1);
    expect(hits[0].place.population?.length).toBeGreaterThan(3);
  });
  it('towns whose name is an English word are in the index', async () => {
    const all = (await Promise.all(['Acre', 'Drama', 'Bath'].map((n) => placesByName(n)))).map((h) => h.length);
    expect(all.every((n) => n > 0)).toBe(true);
  });
  it('French Cassini names are spelled correctly, not garbled', async () => {
    const hits = (await placesByName('Verrières')).filter((h) => h.place.gazetteer === 'cassini');
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('a shipwreck never answers a place name (A20-006, KB-P23-russia)', () => {
  it('Florence in 1850 is not a wreck', async () => {
    const m = await matchName('Florence', 1850);
    expect(m.place?.types ?? []).not.toContain('wreck');
  });
  it('a name only a wreck has is offered, not placed', async () => {
    const m = await matchName('Russia', 1700);
    expect(m.place?.types ?? []).not.toContain('wreck');
  });
});
