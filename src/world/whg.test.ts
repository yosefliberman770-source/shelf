import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GazPlace } from '../atlas/gazetteer';
import { db } from '../db/db';
import { combineEvidence } from './placeEvidence';
import { fromIndex, resetWhgCooldown, whgFitsYear, whgLookup, whgLookupMany, whgNameMatch, type WhgLookup } from './whg';

// ── Fixtures, shaped like WHG's real answers (checked 2026-09-30) ──────────

/** /api/index/?name=Lübeck — a parent record grouping two contributed datasets, plus two other places called Lubeck. */
const LUBECK_INDEX = {
  type: 'FeatureCollection',
  attribution: {
    sources: {},
    whg: { spdx_id: 'CC-BY-NC-4.0' },
    datasets: {
      tgn_filtered_01: { name: 'Getty TGN (partial)', rights_holder: '[Getty Research Institute]', source_url: 'http://www.getty.edu/research/tools/vocabularies/tgn/', license: null },
      black: { name: 'DK Atlas of World History', rights_holder: 'Jeremy Black', source_url: 'http://www.worldcat.org/oclc/780803785', license: null },
    },
  },
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [10.7, 53.866667] }, properties: { title: 'Lübeck', index_id: '13623312', index_role: 'parent', place_id: 5077835, child_place_ids: [86483], dataset: 'tgn_filtered_01', placetypes: ['inhabited place', 'city'], variants: ['Lübeck Hansestadt', 'Lubeck', 'Liubice'], links: [{ identifier: 'tgn:7012327', type: 'closeMatch' }], timespans: "[{'gte': 1100, 'lte': 1400}, {'gte': 1400, 'lte': 1500}]", ccodes: ['DE'] } },
    { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [10.6864, 53.8697] }] }, properties: { title: 'Lübeck', index_id: '86483', index_role: 'child', place_id: 86483, source_id: '15501', dataset: 'black' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [142.566667, -36.733333] }, properties: { title: 'Lubeck', index_id: '13683915', index_role: 'parent', place_id: 5138471, dataset: 'tgn_filtered_01', placetypes: ['inhabited place'], variants: [], timespans: [], ccodes: ['AU'] } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-81.6167, 39.2333] }, properties: { title: 'Lubeck', index_id: '13548143', index_role: 'parent', place_id: 5002627, dataset: 'tgn_filtered_01', placetypes: ['inhabited place'], variants: [], timespans: [], ccodes: ['US'] } },
  ],
};

const gaz = (p: Partial<GazPlace> & Pick<GazPlace, 'key' | 'title' | 'lat' | 'lon'>): GazPlace => ({
  gazetteer: 'viabundus', id: p.key.split(':')[1], precise: true, types: ['town'], uncertain: 0, names: [{ name: p.title }], partOf: [], related: [], url: 'https://www.viabundus.eu/', ...p,
});
const LUBECK_VB = gaz({ key: 'viabundus:1', title: 'Lübeck', lat: 53.868, lon: 10.687, from: 1226 });

const realFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

beforeEach(async () => { calls = []; resetWhgCooldown(); await db.worldCache.clear(); });
afterEach(() => { globalThis.fetch = realFetch; vi.useRealTimers(); });

describe('World Historical Gazetteer lookups', () => {
  it('returns candidate attestations with full provenance (public index route)', async () => {
    mockFetch(() => json(LUBECK_INDEX));
    const l = await whgLookup('Lübeck', { route: 'index' });
    expect(calls[0].url).toBe('https://whgazetteer.org/api/index/?name=L%C3%BCbeck');
    expect(l.status).toBe('ok');
    expect(l.api).toMatch(/public place index/);
    expect(Date.parse(l.accessed)).not.toBeNaN();
    const parent = l.attestations.find((a) => a.whgId === 'index:5077835')!;
    expect(parent).toMatchObject({
      title: 'Lübeck', namespace: 'tgn_filtered_01', source: 'Getty TGN (partial)', role: 'parent', ccodes: ['DE'], point: [10.7, 53.866667],
      types: ['inhabited place', 'city'], links: { whg: 'https://whgazetteer.org/entity/place:tgn:7012327/', original: 'http://www.getty.edu/research/tools/vocabularies/tgn/' },
    });
    expect(parent.names).toEqual(expect.arrayContaining(['Lübeck', 'Liubice']));
    expect(parent.timespans).toEqual([[1100, 1400], [1400, 1500]]);
    // The child record from another dataset is kept, as its own attestation, tied to the same group.
    const child = l.attestations.find((a) => a.whgId === 'index:86483')!;
    expect(child).toMatchObject({ source: 'DK Atlas of World History', role: 'child', groupId: parent.groupId, point: [10.6864, 53.8697] });
  });

  it('matches historical names and variants, not just the modern title', () => {
    const [lubeck] = fromIndex(LUBECK_INDEX);
    expect(whgNameMatch(lubeck, 'Lübeck')).toBe('exact');
    expect(whgNameMatch(lubeck, 'Liubice')).toBe('variant');
    expect(whgNameMatch(lubeck, 'Hamburg')).toBe('none');
    const ev = combineEvidence({ written: 'Liubice', year: 1150, local: [], localSources: ['viabundus'], whg: lookupOf('Liubice', fromIndex(LUBECK_INDEX)) });
    expect(ev.clusters[0].title).toBe('Lübeck');
    expect(ev.clusters[0].claims.some((c) => c.nameMatch === 'variant')).toBe(true);
  });

  it('uses dates to judge plausibility — undated is "unknown", never "outside"', () => {
    const [lubeck, , au] = fromIndex(LUBECK_INDEX);
    expect(whgFitsYear(lubeck, 1350)).toBe('within');
    expect(whgFitsYear(lubeck, 300)).toBe('outside');
    expect(whgFitsYear(au, 1350)).toBe('unknown');
    // Year 0 doesn't exist: astronomical 0 is 1 BCE.
    const [bce] = fromIndex({ features: [{ geometry: { type: 'Point', coordinates: [0, 0] }, properties: { title: 'X', place_id: 1, timespans: [{ gte: -1, lte: 0 }] } }] });
    expect(bce.timespans).toEqual([[-2, -1]]);
  });

  it('keeps several candidate places apart, and lets the offline gazetteer and the date settle it', () => {
    const whg = lookupOf('Lübeck', fromIndex(LUBECK_INDEX));
    // WHG alone: Germany, Australia and the USA all have a Lubeck — and two of them are undated.
    const alone = combineEvidence({ written: 'Lubeck', local: [], localSources: [], whg });
    expect(alone.clusters.length).toBe(3);
    // With Viabundus and a medieval date, the German city is the one the evidence supports.
    const ev = combineEvidence({ written: 'Lübeck', year: 1400, local: [LUBECK_VB], localSources: ['viabundus'], whg });
    expect(ev.status).toBe('identified');
    expect(ev.clusters[0].title).toBe('Lübeck');
    expect(ev.clusters[0].families.length).toBeGreaterThanOrEqual(3); // Viabundus + TGN + DK Atlas
    expect(ev.confidence).toBe('strong');
    expect(ev.statements.join(' ')).toMatch(/Viabundus identifies “Lübeck” as Lübeck/);
    expect(ev.statements.join(' ')).toMatch(/World Historical Gazetteer has 2 attestations/);
    expect(ev.statements.join(' ')).toMatch(/give[s]? a different identification/);
  });

  it('keeps conflicting attestations side by side instead of choosing one', () => {
    const whg = lookupOf('Capua', [
      { whgId: 'place:pl:432754', title: 'Capua', names: ['Capua'], point: [14.254, 41.086], timespans: [[-600, 640]], types: ['settlement'], ccodes: ['IT'], namespace: 'pl', source: 'Pleiades', links: {}, via: 'reconcile' },
      { whgId: 'place:gn:3180207', title: 'Capua', names: ['Capua'], point: [14.213, 41.106], timespans: [[856, 2020]], types: ['town'], ccodes: ['IT'], namespace: 'gn', source: 'GeoNames', links: {}, via: 'reconcile' },
    ]);
    const pleiades: GazPlace = { key: 'pleiades:432754', gazetteer: 'pleiades', id: 432754, title: 'Capua', lat: 41.086, lon: 14.254, precise: true, types: ['settlement'], from: -600, to: 640, uncertain: 0, names: [{ name: 'Capua' }], partOf: [], related: [], url: 'https://pleiades.stoa.org/places/432754' };
    const ev = combineEvidence({ written: 'Capua', year: -216, local: [pleiades], localSources: ['pleiades'], whg });
    // WHG's copy of Pleiades is not a second witness.
    expect(ev.clusters[0].families.sort()).toEqual(['geonames', 'pleiades']);
    expect(ev.statements.join(' ')).toMatch(/not counted as separate confirmation/);
    // The dates don't overlap: ancient Capua (now S. Maria Capua Vetere) vs the town refounded in 856.
    expect(ev.disagreements.some((d) => d.field === 'date')).toBe(true);
    expect(ev.statements.join(' ')).toMatch(/disagree about its dates/);
  });

  it('withholds records whose source forbids redistribution, keeping only a link', async () => {
    mockFetch(() => json({ results: [{ candidates: [
      { id: 'place:chgis:hvd_1', name: '臨安', altNames: [], ccodes: [], placeTypes: [], namespace: 'chgis', attribution: { source: 'China Historical GIS (CHGIS)', url: 'https://chgis.fas.harvard.edu/', redistributable: false } },
      { id: 'place:gn:1808926', name: 'Hangzhou', altNames: ['Lin’an'], point: [120.16, 30.29], ccodes: ['CN'], placeTypes: ['seat'], namespace: 'gn', timespans: [[1138, 1276]], attribution: { source: 'GeoNames', license: 'CC-BY-4.0', redistributable: true } },
    ] }], service: { version: '0.2', accessed: '2026-09-30T00:00:00Z' } }));
    const l = await whgLookup('Lin’an', { route: 'reconcile' });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ queries: [{ name: 'Lin’an' }], temporal: true });
    const chgis = l.attestations.find((a) => a.namespace === 'chgis')!;
    expect(chgis).toMatchObject({ restricted: true, names: [], timespans: [], point: undefined, links: { original: 'https://chgis.fas.harvard.edu/' } });
    expect(l.api).toBe('WHG Reconciliation Service API v0.2 (via Shelf’s server)');
    // What goes into the device cache has no restricted content either.
    const cached = (await db.worldCache.toArray()).flatMap((r) => (r.data as WhgLookup).attestations);
    expect(cached.find((a) => a.namespace === 'chgis')).toMatchObject({ restricted: true, names: [], timespans: [] });
    expect(cached.find((a) => a.namespace === 'chgis')!.point).toBeUndefined();
    const ev = combineEvidence({ written: 'Lin’an', year: 1200, local: [], localSources: [], whg: l });
    expect(ev.clusters[0].title).toBe('Hangzhou');
    expect(ev.statements.join(' ')).toMatch(/don’t allow the data to be passed on/);
  });

  it('reports failures and time-outs as "unavailable" — never as "no such place" — and never caches them', async () => {
    mockFetch(() => { throw new TypeError('network down'); });
    const down = await whgLookup('Capua', { route: 'index' });
    expect(down).toMatchObject({ status: 'unavailable', attestations: [] });
    expect(await db.worldCache.count()).toBe(0);
    const ev = combineEvidence({ written: 'Capua', local: [], localSources: [], whg: down });
    expect(ev.status).toBe('no-evidence');
    expect(ev.statements.join(' ')).toMatch(/couldn’t be consulted/);
    // "Unavailable" is not "no record": nothing is said about the place from WHG's silence.
    expect(ev.statements.join(' ')).not.toMatch(/No record for this name in World Historical Gazetteer/);

    // A rate limit asks Shelf to wait: later lookups don't hit WHG until then.
    mockFetch(() => json({ detail: 'slow down' }, 429, { 'retry-after': '30' }));
    const busy = await whgLookup('Rome', { route: 'index' });
    expect(busy).toMatchObject({ status: 'unavailable', retryAfter: 30 });
    const n = calls.length;
    const again = await whgLookup('Ostia', { route: 'index' });
    expect(again.status).toBe('unavailable');
    expect(calls.length).toBe(n);
    resetWhgCooldown();

    // A request that never answers is abandoned after the time-out.
    vi.useFakeTimers();
    mockFetch((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const pending = whgLookup('Carthage', { route: 'index' });
    await vi.advanceTimersByTimeAsync(13_000);
    const slow = await pending;
    expect(slow.status).toBe('unavailable');
    expect(slow.error).toMatch(/too long/);
  });

  it('caches answers on the device, so re-reading a book doesn’t query WHG again', async () => {
    mockFetch(() => json(LUBECK_INDEX));
    const first = await whgLookup('Lübeck', { route: 'index' });
    const second = await whgLookup('Lübeck', { route: 'index' });
    expect(calls).toHaveLength(1);
    expect(first.fromCache).toBeUndefined();
    expect(second.fromCache).toBe(true);
    expect(second.accessed).toBe(first.accessed);
    // A refresh asks again.
    await whgLookup('Lübeck', { route: 'index', refresh: true });
    expect(calls).toHaveLength(2);
  });

  it('batches many names into requests of at most 50 (reconcile route)', async () => {
    mockFetch((_url, init) => {
      const n = (JSON.parse(String(init?.body)) as { queries: unknown[] }).queries.length;
      return json({ results: Array.from({ length: n }, () => ({ candidates: [] })) });
    });
    const names = Array.from({ length: 60 }, (_, i) => `Place ${i}`);
    const out = await whgLookupMany(names, { route: 'reconcile' });
    expect(calls).toHaveLength(2);
    expect(out.size).toBe(60);
    expect([...out.values()].every((l) => l.status === 'ok')).toBe(true);
  });
});

function lookupOf(name: string, attestations: WhgLookup['attestations']): WhgLookup {
  return { name, status: 'ok', attestations, accessed: '2026-09-30T00:00:00Z', api: 'test' };
}
