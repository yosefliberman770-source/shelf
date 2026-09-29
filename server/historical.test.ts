import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricalError, placeGet, placeSearch, whgConfigured } from './historical.ts';

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
});
