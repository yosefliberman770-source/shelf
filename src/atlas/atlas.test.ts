// The atlas: year maths, layer catalog, and spot checks on the built data packs.
import { featureFilter, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATASET_CREDIT, DEFAULT_LAYERS, DRAW_ORDER, type LayerCtx, LAYERS, SOURCE_SPECS } from './catalog';
import { eventNear, existedIn, fromAstro, ohmExisted, shiftYear, toAstro, yearLabel } from './time';

const PACK = join(__dirname, '../../public/atlas');
const pack = <T>(f: string): T => JSON.parse(readFileSync(join(PACK, f), 'utf8')) as T;
type FC = { features: { properties: Record<string, unknown>; geometry: { type: string } }[] };
const matches = (filter: unknown, props: Record<string, unknown>, type = 'Point') =>
  featureFilter(filter as never).filter({ zoom: 6 } as never, { type: type === 'Point' ? 1 : type.includes('Line') ? 2 : 3, properties: props } as never);

describe('atlas years', () => {
  it('has no year 0 and converts to astronomical years', () => {
    expect(toAstro(-218)).toBe(-217);
    expect(fromAstro(-217)).toBe(-218);
    expect(fromAstro(0)).toBe(-1);
    expect(shiftYear(-1, 1)).toBe(1);
    expect(shiftYear(1, -1)).toBe(-1);
    expect(shiftYear(-218, 2)).toBe(-216);
    expect(yearLabel(-218)).toBe('218 BCE');
    expect(yearLabel(43)).toBe('43 CE');
  });
  it('filters features by the years they existed', () => {
    const f = existedIn(-218);
    expect(matches(f, { f: -330, t: -30 })).toBe(true);
    expect(matches(f, { f: -30, t: 300 })).toBe(false);
    expect(matches(f, { f: -750 })).toBe(true);
    expect(matches(f, {})).toBe(false);
    expect(matches(existedIn(-218, { undated: { until: 640 } }), {})).toBe(true);
    expect(matches(existedIn(1200, { undated: { until: 640 } }), {})).toBe(false);
  });
  it('finds events in a window', () => {
    expect(matches(eventNear(-218, 0), { y: -218 })).toBe(true);
    expect(matches(eventNear(-218, 0), { y: -216 })).toBe(false);
    expect(matches(eventNear(-218, 5), { y: -216 })).toBe(true);
    expect(matches(eventNear(-1, 1), { y: 1 })).toBe(true);
  });
  it('only shows dated OpenHistoricalMap features', () => {
    expect(matches(ohmExisted(1500), { start_decdate: 1400.0 })).toBe(true);
    expect(matches(ohmExisted(1500), { start_decdate: 1400.0, end_decdate: 1450.0 })).toBe(false);
    expect(matches(ohmExisted(1500), {})).toBe(false);
  });
});

describe('atlas layer catalog', () => {
  const ctx: LayerCtx = { year: -218, base: '/atlas/', eventWindow: 0 };
  it('has six groups, unique ids and a draw order for every layer', () => {
    const ids = LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LAYERS) if (!l.unavailable) expect(DRAW_ORDER).toContain(l.id);
    expect(new Set(LAYERS.map((l) => l.group)).size).toBe(6);
    expect(DEFAULT_LAYERS.length).toBeGreaterThan(0);
  });
  it('credits a dataset for every available layer', () => {
    for (const l of LAYERS) {
      if (l.unavailable) { expect(l.unavailable.length).toBeGreaterThan(20); continue; }
      expect(l.datasets.length, l.id).toBeGreaterThan(0);
      for (const d of l.datasets) expect(DATASET_CREDIT[d].license, `${l.id}/${d}`).toBeTruthy();
      for (const s of l.sources) expect(SOURCE_SPECS[s], `${l.id} source ${s}`).toBeDefined();
    }
  });
  it('builds valid MapLibre layers in every era', () => {
    for (const year of [-3000, -218, 43, 1066, 1815, 2000]) {
      for (const eventWindow of [0, 25]) {
        const c = { ...ctx, year, eventWindow, war: 'Q6271' };
        const sources = { 'ne-land': { type: 'geojson', data: '/atlas/ne-land.json' }, ...Object.fromEntries(Object.keys(SOURCE_SPECS).map((k) => [k, SOURCE_SPECS[k](c)])) };
        for (const s of Object.values(sources)) expect((s as { attribution?: string }).attribution ?? 'x').toBeTruthy();
        const layers = LAYERS.filter((l) => !l.unavailable).flatMap((l) => l.specs(c));
        const errors = validateStyleMin({ version: 8, glyphs: 'https://x/{fontstack}/{range}.pbf', sources, layers } as never);
        expect(errors.map((e) => e.message), `year ${year}`).toEqual([]);
      }
    }
  });
});

describe('atlas data packs', () => {
  it('lists license and attribution for every dataset', () => {
    const m = pack<{ datasets: Record<string, { license: string; attribution: string; files: string[] }> }>('manifest.json');
    for (const [id, d] of Object.entries(m.datasets)) {
      expect(d.license, id).toBeTruthy();
      expect(d.attribution, id).toBeTruthy();
    }
  });
  it('has Carthage in the World place index, as an ancient port with Pleiades dates', () => {
    // Name shard → cell → row, exactly as the app looks it up.
    const entry = pack<[string, string, number, string, number][]>('../world/places/n/ca.json').find((e) => e[0] === 'carthago' && e[1] === 'pleiades')!;
    expect(entry).toBeDefined();
    const row = pack<unknown[][]>(`../world/places/c/${entry[3]}.json`).find((r) => r[1] === entry[2])!;
    expect(row[2]).toBe('Carthago');
    expect(String(row[6])).toContain('port');
    expect(matches(existedIn(-218, { undated: { until: 640 } }), { f: row[7], t: row[8] })).toBe(true);
  });
  it('ships vector tiles for the heavy layers and no whole-world files', () => {
    const tiles = readdirSync(join(PACK, '../world/tiles'));
    for (const t of ['pleiades.pmtiles', 'itinere.pmtiles', 'viabundus-edges.pmtiles', 'viabundus-nodes.pmtiles', 'thurayya-places.pmtiles', 'thurayya-routes.pmtiles']) expect(tiles).toContain(t);
    expect(readdirSync(PACK)).not.toContain('pleiades-places.json');
    expect(readdirSync(PACK)).not.toContain('pleiades-gazetteer.json');
  });
  it('dates the battles of the Second Punic War as Wikidata does', () => {
    const ev = pack<FC>('wikidata-events.json');
    const year = (n: string) => ev.features.find((f) => f.properties.n === n)?.properties.y;
    expect(year('Battle of Cannae')).toBe(-216);
    expect(year('Battle of the Trebia')).toBe(-218);
    expect(year('Battle of Zama')).toBe(-202);
    const cannae = ev.features.find((f) => f.properties.n === 'Battle of Cannae')!;
    expect(cannae.properties.wn).toBe('Second Punic War');
  });
  it('covers 218 BCE with polity borders including Carthage and Rome', () => {
    const index = pack<{ from: number; to: number; file: string }[]>('cliopatria/index.json');
    const slice = index.find((s) => s.from <= -218 && -218 <= s.to)!;
    const polities = pack<FC>(slice.file.replace(/^cliopatria\//, 'cliopatria/'));
    const now = polities.features.filter((f) => matches(existedIn(-218), f.properties, 'Polygon')).map((f) => String(f.properties.n));
    expect(now.some((n) => /carthag/i.test(n))).toBe(true);
    expect(now.some((n) => /roman/i.test(n))).toBe(true);
  });
});
