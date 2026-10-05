// Stage 4 (RM-01, RM-02): what kind of thing a record is decides where it is drawn and whether it can answer a name.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { matchName, notAPlace, placeConfidence } from './gazetteer';
import { resolvePlace } from './resolve';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const offline = (w: string, year?: number) => resolvePlace(w, { year, detection: 'cue', online: false });

describe('finds, graves, wrecks, battle sites and stations are never the answer to a place name (SS-3, X-04, A8-040)', () => {
  it.each([
    [{ types: ['wreck'], sourceType: 'wreck' }, /shipwreck/],
    [{ types: ['site'], sourceType: 'findspot (20th century), adze (stone)' }, /find spot/],
    [{ types: ['site'], sourceType: 'coin hoard' }, /find spot/],
    [{ types: ['site'], sourceType: 'bog burial (17th century)' }, /burial/],
    [{ types: ['site'], sourceType: 'battle site (16th century)' }, /battle site/],
    [{ types: ['station'], sourceType: 'railway station' }, /station/],
    [{ types: ['fishery'], sourceType: 'oyster fishery' }, /fishery/],
  ])('%j is not a place', (p, re) => expect(notAPlace(p)).toMatch(re));

  it.each([
    [{ types: ['settlement'], sourceType: 'settlement; grave' }],
    [{ types: ['church'], sourceType: 'church · cemetery' }],
    [{ types: ['station'], sourceType: 'mansio (Roman road station)' }],
    [{ types: ['wreck'], sourceType: 'AIRCRAFT HANGAR (20TH CENTURY)' }],
  ])('%j is a place', (p) => expect(notAPlace(p)).toBeUndefined());

  it('[rule] KB-P23-holyisland: “Holy Island” in 793 is never an oyster fishery', async () => {
    const m = await matchName('Holy Island', 793);
    if (m.place) expect(m.place.types).not.toContain('fishery');
  });
});

describe('an identification without a date is never certain (A12-017, A12-018, A11-019)', () => {
  it('[rule] the only place of a name, with no year to check its dates against, is probable at most', () => {
    expect(placeConfidence({ identity: 'unique', basis: 'only', liveRivals: 0, support: 'no-date', fitsBook: true })).toBe('probable');
    expect(placeConfidence({ identity: 'unique', basis: 'only', liveRivals: 0, support: 'attested', fitsBook: true })).toBe('certain');
  });

  it.each(['Sydney', 'Peru', 'Nara', 'Edo'])('“%s” with no date in the passage is not HIGH', async (w) => {
    const r = await offline(w);
    expect(r.status).not.toBe('HIGH');
  });
});
