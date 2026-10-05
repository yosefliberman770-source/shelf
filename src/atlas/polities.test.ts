// Stage 4 part 6 (RM-03): countries and rulers — a polity only where and when it has an outline, a country's name
// read as the land at the date, Wikidata ids as evidence rather than keys.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { politiesAt, polityConvention } from './context';
import { matchPolity, polityAlive, polityCore, polityLabelAt, type PolityName } from './mention';
import { resolvePlace } from './resolve';
import { whatChanged } from '../world/changes';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel)), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const NAMES = JSON.parse(readFileSync(join(PUB, 'atlas/cliopatria/names.json'), 'utf8')) as PolityName[];
const row = (n: string) => NAMES.find((x) => x.n === n)!;
const at = (w: string, year: number, passage?: string) => resolvePlace(w, { year, detection: 'cue', online: false, passage });

describe('a polity exists only when it has an outline (A16-004, A16-003, A11-023)', () => {
  it('[data] gaps between outlines are kept, and every period lies inside the full range', () => {
    expect(row('Kingdom of Portugal').s).toEqual([[1147, 1581], [1640, 1911]]);
    for (const r of NAMES.filter((x) => x.s)) {
      for (const [f, t] of r.s!) expect(f >= r.f && t <= r.t && f <= t).toBe(true);
      for (let i = 1; i < r.s!.length; i++) expect(r.s![i][0]).toBeGreaterThan(r.s![i - 1][1] + 1);
    }
  });
  it('“Kingdom of Italy” is not said to exist in 1200, nor Portugal during the Iberian Union', () => {
    expect(polityAlive(row('Kingdom of Italy'), 1200)).toBe(false);
    expect(polityAlive(row('Kingdom of Italy'), 1900)).toBe(true);
    expect(polityAlive(row('Kingdom of Portugal'), 1600)).toBe(false);
  });
  it('a state founded 24 years later is a date mismatch, not the answer: “Turkey” in 1900 is the land, under the Ottomans', async () => {
    const r = await at('Turkey', 1900);
    expect(r.place?.kind).toBe('region');
    expect(r.reason).toMatch(/Ottoman Empire/);
    expect(r.reason).toMatch(/only from 1924/);
  });
  it('“Kingdom of Italy” in 1200 says no outline then, and who held the land', async () => {
    const r = await at('Kingdom of Italy', 1200);
    expect(r.place?.kind).toBe('region');
    expect(r.reason).toMatch(/No polity called “Kingdom of Italy” has an outline in 1200/);
    expect(r.reason).toMatch(/Holy Roman Empire/);
  });
});

describe('country names resolve to the land and its holder at the date (ID-5, A12-006, A12-007, A16-002, C5)', () => {
  it('“Portugal” in 1300 opens on Portugal, not Angola — the label point follows the date', async () => {
    const r = await at('Portugal', 1300);
    expect(r.place?.title).toBe('Kingdom of Portugal');
    expect(r.place!.lon).toBeGreaterThan(-10);
    expect(r.place!.lon).toBeLessThan(-6);
    expect(polityLabelAt(row('Kingdom of Portugal'), 1890)![1]).toBeLessThan(0); // its 1890 label is in Africa
  });
  it('“United Kingdom” is never the United States (a bare modifier is not a core name)', async () => {
    expect(polityCore('United Kingdom')).toBe('united kingdom');
    expect(polityCore('Kingdom of Aragon')).toBe('aragon');
    const m = await matchPolity('United Kingdom', 1850);
    expect(m.some((x) => /United States/.test(x.polity.n))).toBe(false);
    expect((await at('United Kingdom', 1850)).place?.title ?? '').not.toMatch(/United States|Israel/);
  });
  it.each([['Egypt', 1300, /Mamluk/], ['Germany', 1500, /Holy Roman Empire/], ['China', 1300, /Yuan/], ['Bulgaria', 1300, /Second Bulgarian Empire/]] as [string, number, RegExp][])(
    '“%s” in %i is the land, held by the polity of that date', async (w, y, holder) => {
      const r = await at(w, y);
      expect(r.place?.kind).toBe('region');
      expect(r.reason).toMatch(holder);
    });
  it('“Austria” in 1900 is Austria-Hungary, not “Hungarian Nationalists”', async () => {
    expect((await at('Austria', 1900)).place?.title).toBe('Austria-Hungary');
  });
});

describe('Wikidata ids are evidence, never keys (ID-1, PA-006, A9-007)', () => {
  it('[data] a polity holding another’s id gets none of its aliases, demonyms or link', () => {
    const flagged = NAMES.filter((x) => x.qx);
    expect(flagged.length).toBeGreaterThan(20);
    for (const r of flagged) expect(r.al ?? r.dm).toBeUndefined();
    expect(row('Hungarian Nationalists').qx).toBe(1);
    expect(row('Syria').qx).toBe(1);
    expect(row('Austria-Hungary').al).toContain('Austria');
    expect(row('Holy Roman Empire').qx).toBeUndefined(); // its own id (alias “Holy Roman Empire of the German Nation”)
  });
});

describe('source conventions and borders are said as such (A11-004, X-22, A16-005)', () => {
  it('Cliopatria’s grouping and population labels are not called states', () => {
    expect(polityConvention('Holy Roman Empire Minor States')).toMatch(/many small units/);
    expect(polityConvention('Viking settlements')).toMatch(/population/);
    expect(polityConvention('Kingdom of France')).toBeUndefined();
    expect(polityConvention('United States of America')).toBeUndefined();
  });
  it('a point just inside an outline is marked near its edge', async () => {
    const deep = await politiesAt([2.35, 46.5], 1700); // central France
    expect(deep[0]?.border).toBeUndefined();
    const all = await Promise.all([[7.5, 47.6], [-1.8, 43.3], [8.0, 49.0], [6.1, 46.2]].map((p) => politiesAt(p as [number, number], 1700)));
    expect(all.flat().some((x) => x.border !== undefined)).toBe(true);
  });
  it('a change of name convention is not a change of rule (A12-030)', async () => {
    const r = await whatChanged([28.97, 41.01], 630, 650);
    expect(r.changes.some((c) => c.kind === 'political')).toBe(false);
    expect(r.unchanged.join(' ')).toMatch(/change of name convention/);
  });
});

describe('the area named with a place decides between same-named places (A12-019)', () => {
  it('“Alexandria in Egypt” in 1200 is the Egyptian city', async () => {
    const r = await at('Alexandria', 1200, 'They sailed to Alexandria in Egypt that year.');
    expect(r.status).toBe('MEDIUM');
    expect(r.place!.lon).toBeCloseTo(29.9, 0);
    expect(r.reason).toMatch(/places “Alexandria” in Egypt/);
  });
});
