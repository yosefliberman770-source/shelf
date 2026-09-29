// Offline lookups against the real data packs: names, relations, nearby
// places, what's here at a date, and historical search.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eventsOfWar, linesNear, lookingAt, politiesAt } from './context';
import { loadGazetteer, matchName, namesAround, relationLabel, type Gazetteer } from './gazetteer';
import { searchAtlas } from './search';

const PACK = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (url: string) => {
  const path = join(PACK, url.replace(/^.*?\/atlas\//, 'atlas/'));
  try { const body = readFileSync(path, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(body) }; } catch { return { ok: false, status: 404, json: async () => ({}) }; }
});

let g: Gazetteer;
beforeAll(async () => { g = await loadGazetteer(); }, 30000);

describe('historical names', () => {
  it('recognises ancient and modern names only where Pleiades links them', () => {
    expect(matchName(g, 'Carthage', -218).place?.title).toBe('Carthago');
    expect(matchName(g, 'Carthage', -218).matchedName).toMatchObject({ name: 'Carthage', isTitle: false });
    expect(matchName(g, 'Eboracum').place?.title).toBe('Eburacum');
    expect(matchName(g, 'York').place?.title).toBe('Eburacum');
    expect(matchName(g, 'Lutetia').place?.title).toBe('Lutetia');
    expect(matchName(g, 'Rome').place?.title).toBe('Roma');
    expect(matchName(g, 'Cannae', -216).status).toBe('unique');
  });
  it('keeps different places apart and follows recorded succession', () => {
    const byz = matchName(g, 'Byzantium').place!;
    const cp = matchName(g, 'Constantinople').place!;
    expect(byz.key).not.toBe(cp.key);
    const succ = cp.related.find((r) => r.key === byz.key)!;
    expect(relationLabel(succ)).toBe('succeeds');
    expect(relationLabel(byz.related.find((r) => r.key === cp.key)!)).toBe('succeeded by');
    expect(cp.names.map((n) => n.name)).toContain('Istanbul');
  });
  it('does not guess when several places share a name', () => {
    const m = matchName(g, 'Alexandria');
    expect(m.status).toBe('ambiguous');
    expect(m.candidates.length).toBeGreaterThan(1);
    expect(matchName(g, 'Xyzzyville').status).toBe('none');
  });
  it('lists names by their recorded dates', () => {
    const cp = matchName(g, 'Constantinople').place!;
    expect(namesAround(cp).length).toBeGreaterThan(1);
  });
});

describe('what is here', () => {
  const capua: [number, number] = [14.2528, 41.0845];
  it('finds nearby places recorded around the year, nearest first', () => {
    const near = g.nearby(capua, 40, { year: -218 });
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
