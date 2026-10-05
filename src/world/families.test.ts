// Stage 4 part 4 (RM-07): independent witnesses, not dataset counts.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GazPlace } from '../atlas/gazetteer';
import { searchPlaces } from '../atlas/gazetteer';
import { fromGaz } from '../atlas/resolve';
import { agreeOnLocation, familyOf, independent, witnesses } from './families';
import { combineEvidence, whgFamily } from './placeEvidence';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const place = (gazetteer: string, lon: number, lat = 50, extra: Partial<GazPlace> = {}): GazPlace => ({
  key: `${gazetteer}:1`, gazetteer, id: 1, title: 'Testburg', lon, lat, precise: true, types: ['settlement'], names: [], partOf: [], related: [], uncertain: 0, url: '', ...extra,
} as unknown as GazPlace);

describe('families: copies and sister datasets are one witness (A9-001, A9-002, A9-004, A9-005, X-01)', () => {
  it('Wikidata and Shelf’s Wikidata extracts are one family', () => {
    expect(familyOf('wdextra')).toBe(familyOf('wikidata'));
    expect(independent({ family: 'wikidata', lon: 10, lat: 50 }, { family: 'wdextra', lon: 10.5, lat: 50 })).toBe(false);
  });
  it('an exact coordinate copy between two datasets is not a second witness', () => {
    expect(independent({ family: 'canmore', lon: -3.2, lat: 55.9 }, { family: 'wikidata', lon: -3.2, lat: 55.9 })).toBe(false);
    expect(independent({ family: 'canmore', lon: -3.2, lat: 55.9 }, { family: 'wikidata', lon: -3.21, lat: 55.9 })).toBe(true);
  });
  it('witnesses collapse a list to its independent families', () => {
    expect(witnesses([{ family: 'wikidata', lon: 1, lat: 1 }, { family: 'wdextra', lon: 1.1, lat: 1 }, { family: 'canmore', lon: 1, lat: 1 }])).toHaveLength(1);
  });
  it('WHG records with no namespace are one unknown family, not one each (A9-020)', () => {
    expect(whgFamily({ namespace: '', whgId: 'a' } as never)).toBe(whgFamily({ namespace: '', whgId: 'b' } as never));
  });
});

describe('“confirmed” needs two independent families that agree on the location (PR-2, A10-016, A9-021)', () => {
  it.each([
    ['a sister dataset', place('wdextra', 10.001), 'single-source'],
    ['an exact coordinate copy', place('canmore', 10), 'single-source'],
    ['an independent record 11 km away', place('canmore', 10.16), 'single-source'],
    ['an independent record 300 m away', place('canmore', 10.004), 'confirmed'],
  ])('with %s: %s', (_, other, kind) => {
    expect(fromGaz(place('wikidata', 10), 'Testburg', { basis: 'x' } as never, 'HIGH', [other as GazPlace]).evidence).toBe(kind);
  });
  it('the source’s doubt is kept whichever record leads (A9-018)', () => {
    expect(fromGaz(place('canmore', 10.004), 'Testburg', { basis: 'x' } as never, 'HIGH', [place('wikidata', 10, 50, { uncertain: 1 })]).evidence).toBe('historical-uncertainty');
  });
  it('independent sources far apart are not said to agree on the location', () => {
    const ev = combineEvidence({ written: 'Testburg', local: [place('canmore', 10), place('nmrw', 10.15)], localSources: [] });
    expect(ev.statements.join(' ')).not.toMatch(/agree on this location/);
    expect(agreeOnLocation([{ lon: 10, lat: 50 }, { lon: 10.15, lat: 50 }])).toBe(false);
  });
  it('two population estimates that differ twofold are a disagreement (A10-015, X-17)', () => {
    const a = place('buringh', 10, 50, { population: [{ year: 1500, thousands: 10 }] });
    const b = place('hurbpop', 10.004, 50, { population: [{ year: 1500, thousands: 25 }] });
    expect(fromGaz(a, 'Testburg', { basis: 'x' } as never, 'HIGH', [b]).disagreements?.some((d) => d.field === 'population')).toBe(true);
  });
});

describe('one place is one search result (A12-028, ID-2)', () => {
  it('“London” is not listed once per dataset', async () => {
    const r = await searchPlaces('London', 8);
    const keys = r.map((x) => `${x.place.title}|${x.place.lon.toFixed(1)}|${x.place.lat.toFixed(1)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
