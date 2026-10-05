// Temporal confidence, tested on a small invented gazetteer so every case is exact.
//
// The rule under test: WHICH place a name means (identity) and whether its dates support the year being read
// about (temporal support) are separate questions, answered once (placeConfidence) and used everywhere:
//   "not attested yet" is never "did not exist", and "the only place of that name" is never "known at that date".
// The synthetic index is served in the same layout the build writes (world.py places_index).
import 'fake-indexeddb/auto';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LAYERS, type LayerCtx, UNDATED_MINZOOM } from './catalog';
import { cellOf, crc32, getPlace, matchName, nameShard, namesAround, normName, placeConfidence, placesByName, recordFit, temporalSupport } from './gazetteer';
import { offlineUnique, resolvePlace } from './resolve';
import { existedIn, timeFit } from './time';

type Row = [string, number | string, string, number, number, 0 | 1, string, number | null, number | null, number, [string, number | null, number | null, string][], string[], unknown[], Record<string, unknown> | null];
const row = (src: string, id: number | string, title: string, lon: number, lat: number, from: number | null, to: number | null, extra: Record<string, unknown> | null = null, names: Row[10] = [], types = 'settlement'): Row =>
  [src, id, title, lon, lat, 1, types, from, to, 0, names, [], [], extra];

const ROWS: Row[] = [
  row('wikidata', 'Q1', 'Alderwick', 8.0, 50.0, 1300, null, { fb: 'first mention' }),                 // first attested after the date
  row('wikidata', 'Q2', 'Birchford', 8.5, 50.0, 1000, null, { fb: 'first mention' }),                 // first attested before the date
  row('wikidata', 'Q3', 'Coldharbour', 9.0, 50.0, 1100, 1100, { fb: 'first mention' }),               // exact-date evidence
  row('wikidata', 'Q4', 'Dunmere', 9.5, 50.0, 1140, null, { fb: 'first mention' }),                   // approximate (40 years after)
  row('pleiades', 5, 'Eskdale', 10.0, 50.0, -30, 300),                                                 // period-level dates
  row('pleiades', 6, 'Fenwick', 10.5, 50.0, null, null, { env: [-30, 300, 'related'] }),              // evidence period only
  row('ebidat', 7, 'Gorsey', 11.0, 50.0, null, 1300, null, [], 'castle'),                              // end only
  row('pleiades', 8, 'Hollins', 11.5, 50.0, null, null),                                               // truly unknown
  row('wikidata', 'Q9', 'Ivybridge', 12.0, 50.0, 1200, null, { fb: 'founded' }),                      // true founding date
  row('wikidata', 'QJ1', 'Juniper', 12.5, 50.0, 1000, null, { fb: 'first mention' }),                 // two places of one name:
  row('wikidata', 'QJ2', 'Juniper', 20.0, 45.0, 1300, null, { fb: 'first mention' }),                 //   one attested, one later
  row('pleiades', 13, 'Moorgate', 13.0, 51.0, -100, 640),                                              // ancient place …
  row('wikidata', 'Q13', 'Moorgate', 13.01, 51.01, 1150, null, { fb: 'first mention' }),              // … and its later record
  row('pleiades', 14, 'Isca Testorum', 14.0, 51.0, -50, 400, null,                                     // names changing over time
    [['Exanceastre', 700, 1100, 'ang'], ['Nordtown', 1700, null, 'en']]),
  // A specialist record and Wikidata's record of the same town (a few km apart), and a Nordic dataset's incidental
  // record of a town far outside the region it is about.
  row('viabundus', 777, 'Hansestadt', 13.40, 52.52, 1250, null),
  row('wikidata', 'Q777', 'Hansestadt', 13.41, 52.53, 1143, null, { fb: 'first mention' }),
  row('nsh', 'c777', 'Hansestadt', 13.405, 52.525, 1200, null, { fb: 'first mention' }),
  // One source id, two seats (the build keeps both, the second under a unique key with its source id).
  row('germaniasacra', 4068, 'Domstift Kurland', 21.59429, 56.72085, 1250, 1561),
  row('germaniasacra', '4068~2', 'Domstift Kurland', 21.55851, 57.39623, 1290, 1561, { sid: 4068 }),
];

// The index as the build writes it: map cells, name shards, id shards.
const FILES = new Map<string, unknown>();
for (const r of ROWS) {
  const c = cellOf(r[3], r[4]);
  FILES.set(`c/${c}.json`, [...((FILES.get(`c/${c}.json`) as Row[]) ?? []), r]);
  const shard = `i/${r[0]}-${crc32(String(r[1])) % 16}.json`;
  FILES.set(shard, { ...((FILES.get(shard) as object) ?? {}), [String(r[1])]: c });
  [r[2], ...r[10].map((n) => n[0])].forEach((n, i) => {
    const k = normName(n);
    const f = `n/${nameShard(k)}.json`;
    FILES.set(f, [...((FILES.get(f) as unknown[]) ?? []), [k, r[0], r[1], c, i === 0 ? 1 : 0]]);
  });
}
// A stale name entry whose record is not in its cell (an index built from different data): it must be skipped.
FILES.set(`n/${nameShard('ghostville')}.json`, [...((FILES.get(`n/${nameShard('ghostville')}.json`) as unknown[]) ?? []), ['ghostville', 'wikidata', 'Q404', cellOf(8, 50), 1]]);
vi.stubGlobal('fetch', async (input: string) => {
  const m = String(input).match(/\/world\/places\/(.+)$/);
  const body = m && FILES.get(m[1]);
  return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('not found', { status: 404 });
});
const offline = (w: string, year?: number, nearby?: [number, number]) =>
  resolvePlace(w, { year, detection: 'cue', online: false, context: nearby ? { points: [nearby], from: ['test'] } : { points: [], from: [] } });

beforeAll(async () => { expect(await getPlace('wikidata:Q1')).toBeDefined(); });

describe('one scale for identity × dates', () => {
  it('1. first attestation after the book date: possible, never established — "may have existed earlier"', async () => {
    const m = await matchName('Alderwick', 1100);
    expect(m.status).toBe('unique');            // the only place of that name…
    expect(m.temporal).toBe('not-yet-attested'); // …but nothing places it at 1100
    expect(m.confidence).toBe('possible');
    expect(m.reason).toMatch(/may be older, but nothing places it at this date/);
    expect((await offline('Alderwick', 1100)).status).toBe('LOW');
  });
  it('2. first attestation before the book date: certain', async () => {
    const m = await matchName('Birchford', 1100);
    expect([m.temporal, m.confidence]).toEqual(['attested', 'certain']);
    expect((await offline('Birchford', 1100)).status).toBe('HIGH');
  });
  it('3. exact-date evidence: certain', async () => {
    expect((await matchName('Coldharbour', 1100)).confidence).toBe('certain');
  });
  it('4. approximate evidence (first mention 40 years after): probable, not certain', async () => {
    const m = await matchName('Dunmere', 1100);
    expect([m.temporal, m.confidence]).toEqual(['approximate', 'probable']);
    expect((await offline('Dunmere', 1100)).status).toBe('MEDIUM');
  });
  it('[rule] 5. period-level dates (an attestation period) cover the year: certain; after it: probable (places persist)', async () => {
    expect((await matchName('Eskdale', 100)).confidence).toBe('certain');
    const later = await matchName('Eskdale', 1100);
    expect([later.temporal, later.confidence]).toEqual(['persisting', 'probable']);
  });
  it('6. evidence-period record: probable alone, certain only when the book’s own places agree; before the period: possible', async () => {
    expect((await matchName('Fenwick', 100)).confidence).toBe('probable');
    expect((await matchName('Fenwick', 100, { context: { points: [[10.4, 50.1]], from: ['test'] } })).confidence).toBe('certain');
    const before = await matchName('Fenwick', -500);
    expect([before.temporal, before.confidence]).toEqual(['not-yet-attested', 'possible']);
    expect(before.reason).toMatch(/no dates of its own.*may be older/);
    expect(before.reason).not.toMatch(/undefined/);
  });
  it('7. end-only record: not present from the beginning of time — before its end it is unevidenced', async () => {
    expect((await matchName('Gorsey', 1100)).temporal).toBe('not-yet-attested');
    expect((await matchName('Gorsey', 1300)).confidence).toBe('certain');
    expect(timeFit({ to: 1300 }, -3000)).toBe('unattested');
    // The castle layer draws it only at its end year — before that only hollow, when unevidenced records are asked for.
    const castles = (y: number, showUndated = false) => {
      const spec = LAYERS.find((l) => l.id === 'castles')!.specs({ year: y, base: '/atlas/', showUndated } as LayerCtx).find((x) => x.type === 'circle')! as { filter: unknown };
      return featureFilter(spec.filter as never).filter({ zoom: 8 } as never, { type: 1, properties: { k: 'castle', t: 1300 } } as never);
    };
    expect(castles(500)).toBe(false);
    expect(castles(1100)).toBe(false);
    expect(castles(1300)).toBe(true);
  });
  it('8. no temporal evidence at all: possible (probable when the book’s places are nearby) — never "always"', async () => {
    const m = await matchName('Hollins', 1100);
    expect([m.temporal, m.confidence]).toEqual(['no-evidence', 'possible']);
    expect((await matchName('Hollins', 1100, { context: { points: [[11.4, 50.1]], from: ['test'] } })).confidence).toBe('probable');
    expect(recordFit((await getPlace('pleiades:8'))!, -3000)).toBe('undated');
  });
  it('9. a true founding date: before it the place did not exist', async () => {
    expect(recordFit((await getPlace('wikidata:Q9'))!, 1100)).toBe('later');
    expect((await matchName('Ivybridge', 1250)).confidence).toBe('certain');
  });
  it('10. two places of one name, one attested at the date: that one is probable — the other may still have existed', async () => {
    const m = await matchName('Juniper', 1100);
    expect(m.place?.key).toBe('wikidata:QJ1');
    expect([m.basis, m.confidence]).toEqual(['attested-at-date', 'probable']);
    expect(m.candidates.map((c) => c.key)).toContain('wikidata:QJ2'); // kept as an alternative, not discarded
    expect(m.reason).toMatch(/probable, not certain/);
  });
  it('11. a single later-attested place stays useful but uncertain: shown with its reason, not underlined as known', async () => {
    const r = await offline('Alderwick', 1100);
    expect(r.place?.key).toBe('wikidata:Q1');
    expect(r.status).toBe('LOW');
    const underlined = await offlineUnique(['Alderwick', 'Birchford', 'Hollins', 'Dunmere'], 1100);
    expect([...underlined.keys()].sort()).toEqual(['birchford', 'dunmere']);
  });
  it('12. a single place definitively incompatible with the date (founded later): unresolved', async () => {
    const m = await matchName('Ivybridge', 1100);
    expect([m.status, m.confidence, m.temporal]).toEqual(['none', 'unresolved', 'incompatible']);
    expect((await offline('Ivybridge', 1100)).status).toBe('UNRESOLVED');
  });
  it('13. an ancient place whose later record starts much later: the later record neither founds nor ends it', async () => {
    const early = await matchName('Moorgate', 100);
    expect(early.place?.gazetteer).toBe('pleiades');
    expect(early.corroborating.map((c) => c.key)).toEqual(['wikidata:Q13']);
    expect(early.confidence).toBe('certain');
    const medieval = await matchName('Moorgate', 1000);
    expect(medieval.temporal).toBe('persisting'); // recorded before, first mention of the later record after: not "later"/absent
    expect(medieval.confidence).toBe('probable');
    expect((await matchName('Moorgate', 1100)).temporal).toBe('approximate'); // the later record's first mention is 50 years on
    const whenFirstMentioned = await matchName('Moorgate', 1200);
    expect(whenFirstMentioned.confidence).toBe('certain');
  });
  it('14. names change over time: the name of the date is offered, a modern name is flagged as modern', async () => {
    const p = (await getPlace('pleiades:14'))!;
    expect(namesAround(p, 900).map((n) => n.name)).toEqual(['Exanceastre']);
    expect(namesAround(p, 1800).map((n) => n.name)).toEqual(['Nordtown']);
    const m = await matchName('Nordtown', 100);
    expect(m.place?.key).toBe('pleiades:14');
    expect(m.reason).toMatch(/modern name/);
    expect(m.confidence).toBe('certain'); // the anachronistic name changes the wording, not which place or its dates
  });
});

describe('the shared scale itself', () => {
  it('never rates a place above "possible" without temporal evidence, whatever the identity', () => {
    for (const basis of ['only', 'context', 'attested-at-date', 'main-title'] as const) {
      expect(placeConfidence({ identity: 'unique', basis, liveRivals: 0, support: 'not-yet-attested', fitsBook: true })).toBe('possible');
      expect(placeConfidence({ identity: 'unique', basis, liveRivals: 0, support: 'no-evidence', fitsBook: false })).toBe('possible');
    }
  });
  it('never rates a place "certain" when identity leans on dates or a rival is attested at the date', () => {
    expect(placeConfidence({ identity: 'unique', basis: 'attested-at-date', liveRivals: 0, support: 'attested', fitsBook: true })).toBe('probable');
    expect(placeConfidence({ identity: 'unique', basis: 'context', liveRivals: 1, support: 'attested', fitsBook: true })).toBe('probable');
    expect(placeConfidence({ identity: 'ambiguous', liveRivals: 2, support: 'attested', fitsBook: true })).toBe('ambiguous');
    expect(placeConfidence({ identity: 'unique', basis: 'only', liveRivals: 0, support: 'incompatible', fitsBook: true })).toBe('unresolved');
  });
  it('maps every date relation to one temporal support', () => {
    expect(temporalSupport('unattested')).toBe('not-yet-attested');
    expect(temporalSupport('later')).toBe('incompatible');
    expect(temporalSupport('undated')).toBe('no-evidence');
  });
  it('map filters agree with the gazetteer: undated and end-only records are not "always there"', () => {
    const run = (expr: unknown, props: Record<string, unknown>) => featureFilter(expr as never).filter({ zoom: 8 } as never, { type: 1, properties: props } as never);
    expect(run(existedIn(1100), {})).toBe(false);             // undated: hidden by default
    expect(run(existedIn(1100), { f: 1300 })).toBe(false);    // first recorded later: not drawn as existing
    expect(run(existedIn(1100), { f: 1000 })).toBe(true);
  });
});

describe('the index: every key resolves, several records of one source id stay distinguishable', () => {
  it('a map click on the second seat opens that seat, not the first record with the id', async () => {
    const first = await getPlace('germaniasacra:4068');
    expect(first?.lat).toBeCloseTo(56.72, 2);
    const second = await getPlace('germaniasacra:4068', [21.55851, 57.39623]);
    expect(second?.key).toBe('germaniasacra:4068~2');
    expect(second?.sourceId).toBe(4068);
    expect(second?.url).toMatch(/gsn\/4068$/); // the link goes to the source's own record
    expect((await placesByName('Domstift Kurland')).map((h) => h.place.key).sort()).toEqual(['germaniasacra:4068', 'germaniasacra:4068~2']);
  });
  it('a name entry pointing to a missing record is skipped, not shown and not a crash', async () => {
    expect(await placesByName('Ghostville')).toEqual([]);
    expect((await matchName('Ghostville', 1200)).status).toBe('none');
  });
});

describe('sources: specialist, aggregator and incidental records of one place', () => {
  it('[rule] the specialist record leads; Wikidata and an out-of-region record corroborate, and are not dropped', async () => {
    const m = await matchName('Hansestadt', 1400);
    expect(m.place?.gazetteer).toBe('viabundus');
    expect(m.corroborating.map((c) => c.gazetteer).sort()).toEqual(['nsh', 'wikidata']);
    expect(m.confidence).toBe('certain');
  });
  it('[rule] Wikidata’s earlier first mention still counts as evidence for the place (weighed together, not overridden)', async () => {
    const m = await matchName('Hansestadt', 1150);
    expect(m.place?.gazetteer).toBe('viabundus'); // the specialist still leads…
    expect(m.temporal).toBe('attested'); // …but the place is recorded in 1150, by Wikidata's first mention
  });
});

describe('undated and later-recorded sites on the map: kept, but never cluttering earlier dates', () => {
  const spec = (layer: string, year: number, showUndated: boolean, part: 'pt' | 'undated') =>
    LAYERS.find((l) => l.id === layer)!.specs({ year, base: '/atlas/', showUndated } as LayerCtx).find((s) => s.id === `${layer}-${part}`) as { filter: unknown; minzoom?: number } | undefined;
  const drawn = (layer: string, props: Record<string, unknown>, year: number, showUndated: boolean, zoom = 6) => {
    const hit = (part: 'pt' | 'undated') => {
      const s = spec(layer, year, showUndated, part);
      return !!s && zoom >= (s.minzoom ?? 0) && featureFilter(s.filter as never).filter({ zoom } as never, { type: 1, properties: props } as never);
    };
    return hit('pt') || hit('undated');
  };
  const church = { k: 'monastery', w0: 500, w1: 1650 }; // a Wikidata religious house with no date at all
  it('a place with no date at all is never on the overview map, at any date', () => {
    for (const y of [68, 900, 1000, 1100, 1200, 1300, 1400]) {
      expect(drawn('religious-houses', church, y, true, 6)).toBe(false);
      expect(drawn('religious-houses', church, y, false, 12)).toBe(false); // and never without "Include undated records"
    }
  });
  it('zoomed in to town level it appears as a grey "?" — only inside the period its dataset covers', () => {
    expect(spec('religious-houses', 1200, true, 'undated')?.minzoom).toBe(UNDATED_MINZOOM);
    expect(drawn('religious-houses', church, 1200, true, 10)).toBe(true);
    expect(drawn('religious-houses', church, 68, true, 10)).toBe(false);
    expect(spec('religious-houses', 1200, false, 'undated')).toBeUndefined();
  });
  it('[rule] a church first recorded in 1200 appears 60 years before its first record, not earlier', () => {
    const later = { ...church, f: 1200, fb: 'first mention' };
    expect(drawn('religious-houses', later, 1100, true)).toBe(false);
    expect(drawn('religious-houses', later, 1100, true, 12)).toBe(false);
    expect(drawn('religious-houses', later, 1140, true)).toBe(true);
    expect(drawn('religious-houses', later, 1140, false)).toBe(false);
    expect(drawn('religious-houses', later, 1300, false)).toBe(true);
  });
  it('[rule] a period from its architectural style: drawn inside it; 60 years before it on request; not earlier', () => {
    const gothic = { ...church, ef: 1140, per: 'period of its architectural style (Wikidata)' };
    expect(drawn('religious-houses', gothic, 1300, false)).toBe(true);
    expect(drawn('religious-houses', gothic, 1100, true)).toBe(true);
    expect(drawn('religious-houses', gothic, 1000, true)).toBe(false);
  });
  it('tiles built before the window existed keep medieval sites off ancient maps (the layer’s own period)', () => {
    expect(drawn('castles', { k: 'castle' }, 68, true, 12)).toBe(false);
    expect(drawn('castles', { k: 'castle' }, 1200, true, 12)).toBe(true);
  });
  it('a market is not drawn before its first recorded grant', () => {
    const market = { k: 'market', src: 'mfairs', m: 1227, w0: 1227, w1: 1516 };
    expect(drawn('medieval-markets', market, 1100, true, 12)).toBe(false);
    expect(drawn('medieval-markets', market, 1300, true, 12)).toBe(true);
  });
});
