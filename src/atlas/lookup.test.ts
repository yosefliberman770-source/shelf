// Offline lookups against the real data packs: names, relations, nearby
// places, what's here at a date, and historical search.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { eventsOfWar, linesNear, lookingAt, politiesAt } from './context';
import { getPlace, matchName, namesAround, nearbyPlaces, relationLabel, searchPlaces } from './gazetteer';
import { searchAtlas } from './search';

const PUB = join(__dirname, '../../public');
const fetched: string[] = [];
vi.stubGlobal('fetch', async (url: string) => {
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  fetched.push(rel);
  try { const body = readFileSync(join(PUB, rel), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(body) }; } catch { return { ok: false, status: 404, json: async () => ({}) }; }
});
const place = async (n: string, y?: number) => (await matchName(n, y)).place;

describe('historical names', () => {
  it('recognises ancient and modern names only where the dataset links them', async () => {
    expect((await place('Carthage', -218))?.title).toBe('Carthago');
    expect((await matchName('Carthage', -218)).matchedName).toMatchObject({ name: 'Carthage', isTitle: false });
    expect((await place('Eboracum', 120))?.title).toBe('Eburacum');
    expect((await place('York', 120))?.title).toBe('Eburacum');
    expect((await place('Lutetia', 100))?.title).toBe('Lutetia');
    expect((await place('Rome', -218))?.title).toBe('Roma');
    expect((await matchName('Cannae', -216)).status).toBe('unique');
  });
  it('does not guess between datasets: "Rome" is also a Mecklenburg village (Viabundus) when the date is unknown', async () => {
    const m = await matchName('Rome');
    expect(m.status).toBe('ambiguous');
    expect(m.candidates.map((c) => c.gazetteer).sort()).toEqual(['pleiades', 'viabundus']);
  });
  it('keeps different places apart and follows recorded succession', async () => {
    const byz = (await place('Byzantium', 300))!;
    const cp = (await place('Constantinople', 500))!;
    expect(byz.key).not.toBe(cp.key);
    expect(relationLabel(cp.related.find((r) => r.key === byz.key)!)).toBe('succeeds');
    expect(relationLabel(byz.related.find((r) => r.key === cp.key)!)).toBe('succeeded by');
    expect(relationLabel(byz.related.find((r) => r.title === 'Megara')!)).toBe('founded by');
    expect(cp.names.map((n) => n.name)).toContain('Istanbul');
    expect((await getPlace(cp.key))?.title).toBe('Constantinopolis');
  });
  it('does not guess when several places share a name', async () => {
    const m = await matchName('Alexandria');
    expect(m.status).toBe('ambiguous');
    expect(m.candidates.length).toBeGreaterThan(1);
    expect((await matchName('Xyzzyville')).status).toBe('none');
  });
  it('uses the specialist gazetteer for the period: Viabundus for Hanseatic towns, al-Ṯurayyā for the early Islamic world', async () => {
    const lub = await place('Lübeck', 1400);
    expect(lub?.gazetteer).toBe('viabundus');
    expect(lub?.roles?.some((r) => r[0] === 'town')).toBe(true);
    expect((await searchPlaces('Baghdad')).length + (await searchPlaces('Bag')).length).toBeGreaterThan(0);
  });
  it('lists names by their recorded dates', async () => {
    const cp = (await place('Constantinople', 500))!;
    expect(namesAround(cp).length).toBeGreaterThan(1);
  });
  it('only fetches the pieces a lookup needs', async () => {
    fetched.length = 0;
    await matchName('Capua', -216);
    expect(fetched.length).toBeLessThanOrEqual(3);
    expect(fetched.every((f) => f.startsWith('world/places/'))).toBe(true);
  });
});

describe('what is here', () => {
  const capua: [number, number] = [14.2528, 41.0845];
  it('finds nearby places recorded around the year, nearest first', async () => {
    const near = await nearbyPlaces(capua, 40, { year: -218 });
    expect(near.length).toBeGreaterThan(3);
    for (let i = 1; i < near.length; i++) expect(near[i].km).toBeGreaterThanOrEqual(near[i - 1].km);
    expect(near.every((n) => n.km <= 40)).toBe(true);
  });
  it('puts Capua inside the Roman Republic in 218 BCE (Cliopatria)', async () => {
    const pol = await politiesAt(capua, -218);
    expect(pol.map((p) => p.n).join(' ')).toMatch(/Roman/);
  });
  it('places coastal Carthage in its own state even where the simplified border cuts the coast', async () => {
    const pol = await politiesAt([10.3233, 36.8528], -218);
    expect(pol.map((p) => p.n).join(' ')).toMatch(/Carthag/);
    expect(await politiesAt([0, -60], -218)).toEqual([]);
  });
  it('builds a sourced summary with a contemporary war', async () => {
    const la = await lookingAt([16.13, 41.3], -216);
    expect(la.wars.map((w) => w.n)).toContain('Second Punic War');
    expect(la.nearest.every((n) => n.place.from !== undefined)).toBe(true);
  });
  it('lists a war’s recorded battles in date order', async () => {
    const ev = await eventsOfWar('Q6271');
    expect(ev.find((e) => e.n === 'Battle of Cannae')?.y).toBe(-216);
    for (let i = 1; i < ev.length; i++) expect(ev[i].y).toBeGreaterThanOrEqual(ev[i - 1].y);
  });
  it('finds named roads and rivers passing nearby', async () => {
    const lines = await linesNear([12.48, 41.89], 15);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('historical search', () => {
  it('finds places by ancient or modern names, plus wars, events and polities', async () => {
    const r = await searchAtlas('Constantinople');
    expect(r.some((h) => h.kind === 'place' && h.title === 'Constantinopolis')).toBe(true);
    const w = await searchAtlas('Second Punic');
    expect(w.some((h) => h.kind === 'war')).toBe(true);
    const c = await searchAtlas('Cannae');
    expect(c.some((h) => h.kind === 'event' && h.title === 'Battle of Cannae')).toBe(true);
    const p = await searchAtlas('Carthage');
    expect(p.some((h) => h.kind === 'polity')).toBe(true);
  });
});
