import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { mapViewFor } from './geometry';
import { buildHistoricalMapUrl } from './mapProviders';
import { HistoricalPlaceService } from './placeService';
import { ProviderUnavailable } from './providers';
import type { HistoricalPlace, PlaceCandidate, PlaceProvider, PlaceQuery } from './types';

const place = (id: string, name: string, lat: number, lon: number, extra: Partial<HistoricalPlace> = {}): HistoricalPlace => ({
  id: `test:${id}`, canonicalName: name, matchedName: name, alternativeNames: [], latitude: lat, longitude: lon, locationPrecision: 'exact',
  countryCodes: [], source: 'Test gazetteer', sourceId: id, confidence: 'UNRESOLVED', attribution: [{ source: 'Test gazetteer' }], ...extra,
});

const GAZ: Record<string, PlaceCandidate[]> = {
  rome: [
    { place: place('rome', 'Rome', 41.89, 12.48, { description: 'Italy', historicalStartYear: -753 }), score: 100, exactName: true, nameConfidence: 100 },
    { place: place('rome-ga', 'Rome', 34.26, -85.16, { description: 'Georgia, United States', historicalStartYear: 1834 }), score: 100, exactName: true, nameConfidence: 100 },
  ],
  capua: [{ place: place('capua', 'Capua', 41.08, 14.21, { description: 'Italy' }), score: 100, exactName: true, nameConfidence: 100 }],
  constantinople: [{ place: place('ist', 'İstanbul', 41.01, 28.95, { alternativeNames: ['Constantinople', 'Byzantium'], description: 'Türkiye' }), score: 100, exactName: true, nameConfidence: 90 }],
  alexandria: [
    { place: place('alex-eg', 'Alexandria', 31.2, 29.92, { description: 'Egypt' }), score: 100, exactName: true, nameConfidence: 100 },
    { place: place('alex-va', 'Alexandria', 38.8, -77.05, { description: 'Virginia, United States' }), score: 100, exactName: true, nameConfidence: 100 },
  ],
};

function fakeProvider(opts: { down?: boolean } = {}) {
  const calls: string[] = [];
  const p: PlaceProvider = {
    id: 'test', name: 'Test gazetteer',
    available: async () => true,
    search: async (qs: PlaceQuery[]) => {
      if (opts.down) throw new ProviderUnavailable('Historical place lookup unavailable. Try again.');
      calls.push(...qs.map((q) => q.name));
      return qs.map((q) => GAZ[q.name.toLowerCase()] ?? []);
    },
  };
  return { p, calls };
}

beforeEach(async () => {
  await db.placeCache.clear();
  await db.placeChoices.clear();
});

describe('HistoricalPlaceService', () => {
  it('TEST 1: Rome in 218 BCE resolves to Rome, Italy and maps at that date', async () => {
    const { p } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    const r = await s.resolvePlaceName({ name: 'Rome', date: -218, bookId: 'b1' });
    expect(r.status).toBe('HIGH');
    expect(r.place?.sourceId).toBe('rome');
    const url = buildHistoricalMapUrl(r.place!, -218)!;
    expect(url).toMatch(/^https:\/\/embed\.openhistoricalmap\.org\/#map=10\/41\.89\/12\.48&date=-0217&layer=O$/);
  });

  it('TEST 2: Capua keeps the date the reader chose', async () => {
    const { p } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    const r = await s.resolvePlaceName({ name: 'Capua', date: -216 });
    expect(buildHistoricalMapUrl(r.place!, -216)).toContain('#map=10/41.08/14.21&date=-0215');
  });

  it('TEST 3: a historical name resolves through the record’s alternative names', async () => {
    const { p } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    const r = await s.resolvePlaceName({ name: 'Constantinople', date: 1204 });
    expect(r.status).toBe('HIGH');
    expect(r.place?.canonicalName).toBe('İstanbul');
  });

  it('TEST 4: an ambiguous name asks instead of guessing, and remembers the answer', async () => {
    const { p, calls } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    const q = { name: 'Alexandria', bookId: 'b1' };
    const r = await s.resolvePlaceName(q);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.place).toBeUndefined();
    expect(r.candidates.map((c) => c.place.sourceId)).toEqual(['alex-eg', 'alex-va']);
    await s.choosePlace(q, r.candidates[0].place);
    const again = await s.resolvePlaceName(q);
    expect(again.userChosen).toBe(true);
    expect(again.place?.sourceId).toBe('alex-eg');
    expect(calls).toEqual(['Alexandria']);
  });

  it('uses nearby places in the text to settle an ambiguous name', async () => {
    const { p } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    await s.resolvePlaceName({ name: 'Capua' });
    const r = await s.resolvePlaceName({ name: 'Rome', nearbyPlaceNames: ['Capua'] });
    expect(r.status).toBe('HIGH');
    expect(r.place?.sourceId).toBe('rome');
  });

  it('TEST 5: with no date the map has no date filter', async () => {
    const { p } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    const r = await s.resolvePlaceName({ name: 'Capua' });
    const url = buildHistoricalMapUrl(r.place!, undefined)!;
    expect(url).not.toContain('date=');
    expect(url).toContain('layer=O');
  });

  it('TEST 6: a provider outage returns a message and is not cached', async () => {
    const down = fakeProvider({ down: true });
    const s = new HistoricalPlaceService([down.p]);
    const r = await s.resolvePlaceName({ name: 'Rome', date: -218 });
    expect(r.status).toBe('UNRESOLVED');
    expect(r.error).toMatch(/unavailable/);
    expect(await db.placeCache.count()).toBe(0);
  });

  it('TEST 8: the same place clicked repeatedly uses the cache', async () => {
    const { p, calls } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    await s.resolvePlaceName({ name: 'Capua', date: -216 });
    const again = await s.resolvePlaceName({ name: 'Capua', date: -216 });
    await Promise.all([s.resolvePlaceName({ name: 'Rome', date: -218 }), s.resolvePlaceName({ name: 'Rome', date: -218 })]);
    expect(again.fromCache).toBe(true);
    expect(calls).toEqual(['Capua', 'Rome']);
  });

  it('batches chapter lookups and reuses the cache', async () => {
    const { p, calls } = fakeProvider();
    const s = new HistoricalPlaceService([p]);
    await s.resolvePlaceName({ name: 'Capua' });
    const rs = await s.resolveMany([{ name: 'Capua' }, { name: 'Constantinople' }, { name: 'Nowhere' }]);
    expect(rs.map((r) => r.status)).toEqual(['HIGH', 'HIGH', 'UNRESOLVED']);
    expect(calls).toEqual(['Capua', 'Constantinople', 'Nowhere']);
  });

  it('zooms to fit an area instead of a fixed zoom', () => {
    const v = mapViewFor({ geometry: { type: 'Polygon', coordinates: [[[10, 40], [16, 40], [16, 45], [10, 45], [10, 40]]] } });
    expect(v!.zoom).toBeLessThan(7);
    expect(v!.bbox).toEqual([10, 40, 16, 45]);
    expect(buildHistoricalMapUrl({ latitude: 1, longitude: 2 }, 1500, { animateTo: 1520, stepYears: 5 })).toContain('start_date=1500&end_date=1520&interval=P5Y');
  });
});
