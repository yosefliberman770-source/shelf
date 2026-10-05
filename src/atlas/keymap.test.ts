// Stage 4 part 8: the reader's notes and places met keep their place when ids change (C3), and coverage shown is the
// coverage measured from the index (AR-2).
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { placesByName } from './gazetteer';
import { relocatePlace, repairPlaceKeys } from './keymap';
import { cellFor, sourceCoverageLabel } from '../world/coverage';
import { measuredCount, sourceMeasuredCount } from '../world/measured';
import { PERIODS } from '../world/axes';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel)), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});

describe('a note keeps its place when the place’s id changes (C3)', () => {
  it('a key that no longer exists is found again by name and position, and the note and visit move to it', async () => {
    const [{ place }] = (await placesByName('Lutetia')).filter((h) => h.place.gazetteer === 'pleiades');
    const old = 'pleiades:999999999';
    expect((await relocatePlace(old, 'Lutetia', [place.lon + 0.005, place.lat]))?.key).toBe(place.key);
    await db.mapNotes.put({ id: 'n1', placeKey: old, placeName: 'Lutetia', lat: place.lat, lon: place.lon, text: 'Paris before Paris', createdAt: 1, updatedAt: 1 });
    await db.placeVisits.put({ id: `b1|${old}`, bookId: 'b1', placeKey: old, name: 'Lutetia', written: 'Lutetia', lat: place.lat, lon: place.lon, count: 2, firstAt: 1, lastAt: 2 });
    const r = await repairPlaceKeys(true);
    expect(r.moved).toBe(1);
    expect((await db.mapNotes.get('n1'))?.placeKey).toBe(place.key);
    expect((await db.placeVisits.get(`b1|${place.key}`))?.count).toBe(2);
    expect(await db.placeVisits.get(`b1|${old}`)).toBeUndefined();
  });
  it('a place that can’t be found again is left as it was, never re-pointed at a guess', async () => {
    await db.mapNotes.put({ id: 'n2', placeKey: 'pleiades:888888888', placeName: 'Nowhere-in-particular', lat: 0.5, lon: -30.5, text: 'x', createdAt: 1, updatedAt: 1 });
    const r = await repairPlaceKeys(true);
    expect(r.lost).toBeGreaterThanOrEqual(1);
    expect((await db.mapNotes.get('n2'))?.placeKey).toBe('pleiades:888888888');
    expect(await relocatePlace('pleiades:888888888', 'Lutetia', [-30.5, 0.5])).toBeUndefined(); // same name, wrong place
  });
});

describe('coverage as data (AR-2)', () => {
  const MEASURED = JSON.parse(readFileSync(join(__dirname, '../world/coverage-measured.json'), 'utf8')) as { regions: Record<string, { dated: Record<string, number> }>; sources: Record<string, Record<string, Record<string, number>>> };
  it('the panel’s count equals the measured file, and the sources’ counts add up to it', () => {
    const p = PERIODS.find((x) => x.from <= 1200 && x.to >= 1200)!;
    expect(measuredCount('british-isles', p.from, p.to)).toBe(MEASURED.regions['british-isles'].dated[p.id]);
    const sum = Object.values(MEASURED.sources).reduce((n, s) => n + (s['british-isles']?.[p.id] ?? 0), 0);
    expect(sum).toBe(MEASURED.regions['british-isles'].dated[p.id]);
  });
  it('a source’s shown quality never exceeds what it measurably holds; online sources are “online lookup”', () => {
    const p = PERIODS.find((x) => x.from <= 1200 && x.to >= 1200)!;
    const c = cellFor('british-isles', p.from, p.to, 'places');
    for (const s of c.sources.filter((x) => x.measured !== undefined)) {
      expect(s.measured).toBe(sourceMeasuredCount(s.id, 'british-isles', p.from, p.to));
      if (s.measured === 0) expect(s.quality).toBe('none');
      if (s.measured! < 100) expect(['none', 'limited']).toContain(s.quality);
    }
    const live = c.sources.filter((x) => x.access === 'live');
    expect(live.length).toBeGreaterThan(0);
    for (const s of live) expect(sourceCoverageLabel(s)).toBe('online lookup');
  });
});
