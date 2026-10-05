// Stage 2 (RM-05): what the source already says reaches the reader — its doubt about a type, its own wording for
// dates, and the ruler it records for the year — instead of a flattened kind, an exact range or the first ruler.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { matchName, placesByName, rulerAt, typeDoubtOf } from './gazetteer';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});

describe('doubt the source writes into a type (A15-009, X-03)', () => {
  it('is read, in English and German register wording', () => {
    expect(typeDoubtOf('ABBEY (MEDIEVAL)(POSSIBLE)')).toBe('possible');
    expect(typeDoubtOf('Fort?')).toBe('possible');
    expect(typeDoubtOf('Burg, vermutlich')).toBe('possible');
    expect(typeDoubtOf('settlement · unidentified')).toBe('uncertain');
    expect(typeDoubtOf('ENCLOSURE (PROBABLE)')).toBe('probable');
    expect(typeDoubtOf('Abbey (Medieval)')).toBeUndefined();
    expect(typeDoubtOf('Possingham Farm')).toBeUndefined();
  });
});

describe('the ruler of the year, not the first one (A16-001)', () => {
  const p = { rulers: [['Grafschaft Mark', 1300, 1608], ['Brandenburg', 1609, 1789]] as [string, number | null, number | null][] };
  it('is taken from the dated list', () => {
    expect(rulerAt(p, 1400)).toBe('Grafschaft Mark');
    expect(rulerAt(p, 1700)).toBe('Brandenburg');
    expect(rulerAt(p, 1850)).toBeUndefined();
    expect(rulerAt({}, 1700)).toBeUndefined();
  });
  it('for a real Empire town that changed hands, differs from its first ruler', async () => {
    const hits = (await placesByName('Bochum')).filter((h) => h.place.gazetteer === 'hre');
    if (!hits.length) return;
    const town = hits[0].place;
    expect(town.rulers?.length).toBeGreaterThan(1);
    expect(rulerAt(town, 1700)).not.toBe(town.rulers![0][0]);
  });
});

describe('dates as the source writes them (A15-001)', () => {
  it('keep their qualifiers, and an end written "nach X" is not an end', async () => {
    const all = await placesByName('Schwesternhaus Metternich');
    const gs = all.map((h) => h.place).find((p) => p.gazetteer === 'germaniasacra' && p.datesAsWritten);
    if (!gs) return;
    expect(gs.datesAsWritten?.to).toMatch(/nach/);
    expect(gs.to).toBeUndefined();
  });
});

describe('Shelf’s window is attributed to the dataset, not the place (PR-3, TC-1)', () => {
  it('a place Pleiades records up to 640 is not said to end then', async () => {
    const m = await matchName('Palmyra', 1000);
    expect(m.place?.gazetteer).toBe('pleiades');
    expect(m.reason).toMatch(/Pleiades covers places only up to 640 CE/);
    expect(m.reason).toMatch(/where the dataset stops, not when the place ended/);
  });
  it('an earlier evidence period is given with its real end, not "the end of its coverage"', async () => {
    const m = await matchName('Lugdunum', 900);
    expect(m.reason).toMatch(/earlier period only \(to 300 CE\)/);
    expect(m.reason).not.toMatch(/end of its coverage|period of the period/);
  });
});
