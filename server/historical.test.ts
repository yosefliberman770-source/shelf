import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricalError, parseTemporal, placeGet, placeSearch, whgConfigured } from './historical.ts';

const realFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

beforeEach(() => { calls = []; process.env.WHG_API_TOKEN = 'secret-token'; });
afterEach(() => { globalThis.fetch = realFetch; delete process.env.WHG_API_TOKEN; });

describe('WHG proxy', () => {
  it('is only "configured" when the token is set on the server', () => {
    expect(whgConfigured()).toBe(true);
    delete process.env.WHG_API_TOKEN;
    expect(whgConfigured()).toBe(false);
  });

  it('batches names into one reconcile request, sends the token as a Bearer header, and normalises results', async () => {
    mockFetch(() => json({
      q0: { result: [{ id: 'place:pl:423025', name: 'Roma', alt_names: ['Rome'], score: 100, match: true, confidence: 90, has_geom: false, namespace: 'pl', ccodes: ['IT'], repr_point: [12.48, 41.89], description: 'Country: IT' }] },
      q1: { result: [], gateway: { answered: false, error: 'timeout' } },
      attribution: { pl: { name: 'Pleiades', license: 'CC-BY-3.0', redistributable: true } },
    }));
    const r = await placeSearch([{ name: 'Rome' }, { name: 'Capua' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://whgazetteer.org/reconcile');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
    expect(headers['User-Agent']).toMatch(/Shelf/);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ queries: { q0: { query: 'Rome', limit: 8 }, q1: { query: 'Capua', limit: 8 } } });
    expect(r.results[0]).toEqual({ candidates: [expect.objectContaining({ id: 'place:pl:423025', name: 'Roma', point: [12.48, 41.89], confidence: 90, attribution: expect.objectContaining({ source: 'Pleiades', license: 'CC-BY-3.0' }) })] });
    // A gateway failure is reported as an error, never as "no match".
    expect(r.results[1]).toEqual({ error: 'gateway' });
  });

  it('keeps an absent confidence absent (not zero)', async () => {
    mockFetch(() => json({ q0: { result: [{ id: 'place:gn:1', name: 'Capua', score: 100 }] } }));
    const r = await placeSearch([{ name: 'Capua' }]);
    expect((r.results[0] as { candidates: { confidence?: number }[] }).candidates[0].confidence).toBeUndefined();
  });

  it('rejects more than 50 queries and never calls WHG for them', async () => {
    mockFetch(() => json({}));
    await expect(placeSearch(Array.from({ length: 51 }, (_, i) => ({ name: `p${i}` })))).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('maps WHG rate limiting and outages to a retryable 503', async () => {
    mockFetch(() => json({ detail: 'slow down' }, 429, { 'retry-after': '12' }));
    await expect(placeSearch([{ name: 'Rome' }])).rejects.toMatchObject({ status: 503, retryAfter: 12 });
    mockFetch(() => { throw new TypeError('network down'); });
    await expect(placeSearch([{ name: 'Rome' }])).rejects.toBeInstanceOf(HistoricalError);
  });

  it('refuses to work without a token', async () => {
    delete process.env.WHG_API_TOKEN;
    await expect(placeSearch([{ name: 'Rome' }])).rejects.toMatchObject({ status: 501 });
  });

  it('reads Linked Places records, converting ISO years (year 0 = 1 BCE)', async () => {
    mockFetch(() => json({
      properties: { title: 'Capua', ccodes: ['IT'] },
      names: [{ toponym: 'Capua' }, { toponym: 'Casilinum' }],
      types: [{ label: 'settlement' }],
      geometry: { type: 'Point', coordinates: [14.21, 41.08] },
      when: { timespans: [{ start: { in: '-0599' }, end: { in: '0456' } }] },
      attribution: { name: 'Pleiades', license: 'CC-BY-3.0' },
    }));
    const f = await placeGet('pl:432754');
    expect(calls[0].url).toBe('https://whgazetteer.org/entity/place:pl:432754/api');
    expect(f).toMatchObject({ title: 'Capua', names: ['Capua', 'Casilinum'], start: -600, end: 456, attribution: { source: 'Pleiades' } });
  });

  it('respects sources that forbid redistribution (451)', async () => {
    mockFetch(() => json({ detail: 'no', source: { name: 'Native Land', source_url: 'https://native-land.ca', license: 'custom' } }, 451));
    const f = await placeGet('nl:123');
    expect(f.restricted).toEqual({ source: 'Native Land', url: 'https://native-land.ca', license: 'custom' });
    expect(f.geometry).toBeUndefined();
  });

  it('reads licences in the documented shape (attribution.sources[namespace]) and withholds sources that forbid redistribution', async () => {
    mockFetch(() => json({
      q0: { result: [
        { id: 'place:gn:3180207', name: 'Capua', alt_names: ['Casilinum'], repr_point: [14.21, 41.1], namespace: 'gn', score: 100 },
        { id: 'place:kain_par:77', name: 'Capua', alt_names: ['secret'], repr_point: [1, 2], namespace: 'kain_par', description: 'withheld', score: 90 },
      ] },
      attribution: { sources: {
        gn: { name: 'GeoNames', source_url: 'https://www.geonames.org/', license: { spdx_id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', permits_commercial: true, share_alike: false, attribution_required: true }, redistributable: true },
        kain_par: { name: 'Ancient Parishes & Places of England & Wales', license: { spdx_id: null, custom: true, permits_commercial: null }, redistributable: false },
      } },
    }));
    const r = await placeSearch([{ name: 'Capua' }]);
    const [gn, kp] = (r.results[0] as { candidates: { attribution?: Record<string, unknown>; point?: unknown; altNames: string[]; description?: string }[] }).candidates;
    expect(gn.attribution).toMatchObject({ source: 'GeoNames', namespace: 'gn', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', redistributable: true, permitsCommercial: true, shareAlike: false, attributionRequired: true });
    expect(kp.attribution).toMatchObject({ redistributable: false, permitsCommercial: null });
    expect(kp.point).toBeUndefined();
    expect(kp.altNames).toEqual([]);
    expect(kp.description).toBeUndefined();
    expect(r.service).toMatchObject({ service: 'WHG Reconciliation Service', version: '0.2' });
    expect(Date.parse(r.service.accessed)).not.toBeNaN();
  });

  it('asks for dates in one data-extension request (only for redistributable records), and skips year 0', async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.queries) return json({
        q0: { result: [{ id: 'place:gn:1', name: 'Lübeck', namespace: 'gn' }, { id: 'place:nl:2', name: 'Lübeck', namespace: 'nl' }] },
        attribution: { sources: { gn: { name: 'GeoNames', redistributable: true }, nl: { name: 'Native Land', redistributable: false } } },
      });
      expect(body.extend.ids).toEqual(['place:gn:1']);
      return json({ rows: { 'place:gn:1': { 'whg:temporal_years': [{ str: '1143-1500' }], 'whg:names_array': [{ str: 'Liubice' }, { str: 'Lübeck' }] } } });
    });
    const r = await placeSearch([{ name: 'Lübeck' }], { temporal: true });
    expect(calls).toHaveLength(2);
    const c = (r.results[0] as { candidates: { timespans?: [number, number][]; names?: string[] }[] }).candidates[0];
    expect(c.timespans).toEqual([[1143, 1500]]);
    expect(c.names).toEqual(['Liubice', 'Lübeck']);
    expect(parseTemporal([{ int: 0 }, { int: 14 }])).toEqual([[-1, 14]]);
    expect(parseTemporal("[{'gte': -500, 'lte': 100}]")).toEqual([[-501, 100]]);
    expect(parseTemporal([{ start: { in: 1200 }, end: { in: 1300 } }])).toEqual([[1200, 1300]]);
    expect(parseTemporal([])).toEqual([]);
  });

  it('keeps candidates when the date request fails — without inventing dates', async () => {
    mockFetch((_url, init) => (JSON.parse(String(init?.body)).queries ? json({ q0: { result: [{ id: 'place:gn:1', name: 'Rome', namespace: 'gn' }] } }) : json({ detail: 'boom' }, 500)));
    const r = await placeSearch([{ name: 'Rome' }], { temporal: true });
    const c = (r.results[0] as { candidates: { timespans?: unknown }[] }).candidates[0];
    expect(c.timespans).toBeUndefined();
  });

  it('treats the daily quota (401 "Daily API limit") as retry-after-midnight, not a bad token', async () => {
    mockFetch(() => json({ detail: 'Daily API limit (5000 calls) exceeded' }, 401));
    await expect(placeSearch([{ name: 'Rome' }])).rejects.toMatchObject({ status: 503, retryAfter: expect.any(Number) });
    mockFetch(() => json({ detail: 'Invalid token.' }, 401));
    await expect(placeSearch([{ name: 'Rome' }])).rejects.toMatchObject({ status: 502 });
  });

  it('reads single-record licences in the flat license__ shape', async () => {
    mockFetch(() => json({ properties: { title: 'Capua' }, names: [], attribution: { name: 'Pleiades', license__spdx_id: 'CC-BY-3.0', license__url: 'https://creativecommons.org/licenses/by/3.0/', redistributable: true } }));
    const f = await placeGet('pl:432754');
    expect(f.attribution).toMatchObject({ source: 'Pleiades', license: 'CC-BY-3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', redistributable: true });
  });
});
