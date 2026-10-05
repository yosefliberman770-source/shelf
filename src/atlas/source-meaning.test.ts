// Stage 3 (RM-06): what each source means is written down and reaches the reader — a source that documents nothing
// claims no precision, nothing is dated into the future, and what the build's checks found wrong is shown.
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GAZETTEERS, getPlace } from './gazetteer';
import { SPEC_DATASETS } from './spec-datasets';

const ROOT = join(__dirname, '../..');
const PUB = join(ROOT, 'public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const THIS_YEAR = new Date().getFullYear();

describe('a source whose meaning is not documented (C8, SS-5)', () => {
  it('is declared so in its spec, and the app registry says the same', () => {
    const spec = JSON.parse(readFileSync(join(ROOT, 'data/historical/specs/nmrw.json'), 'utf8'));
    expect(spec.meaning).toBe('unknown');
    expect(SPEC_DATASETS.nmrw.meaning).toBe('unknown');
    expect(GAZETTEERS.find((g) => g.id === 'nmrw')!.meaning).toBe('unknown');
  });

  it('[rule] its records claim no precision, and the card says why', async () => {
    const p = (await getPlace('nmrw:10001:0'))!;
    expect(p).toBeDefined();
    expect(p.precise).toBe(false);
    expect(p.meaningUnknown).toMatch(/no documentation/);
  });

  it('every spec that declares it reaches the registry', () => {
    const dir = join(ROOT, 'data/historical/specs');
    for (const f of readdirSync(dir)) {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (s.meaning) expect((SPEC_DATASETS as Record<string, { meaning?: string }>)[s.src]?.meaning, s.src).toBe(s.meaning);
    }
  });
});

describe('nothing is dated into the future (PA-009, KB-CANMORE-PERIOD)', () => {
  it('no dataset says it covers years after this one', () => {
    expect(GAZETTEERS.filter((g) => g.coverage[1] > THIS_YEAR || g.core[1] > THIS_YEAR).map((g) => g.id)).toEqual([]);
  });

  it('no record in the place index ends after this year', () => {
    const dir = join(PUB, 'world/places/c');
    const late: string[] = [];
    for (const f of readdirSync(dir)) {
      for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown[][]) {
        const env = (r[13] as { env?: [number | null, number | null] } | null)?.env;
        if ((typeof r[8] === 'number' && r[8] > THIS_YEAR) || (env && typeof env[1] === 'number' && env[1] > THIS_YEAR)) late.push(`${r[0]}:${r[1]}`);
      }
    }
    expect(late.slice(0, 10)).toEqual([]);
  });
});

describe('what the build found wrong is shown (A19-003, A19-005)', () => {
  it('a record the checks flagged carries the finding to its card', async () => {
    const p = (await getPlace('wikidata:Q105725210'))!;
    expect(p.qa).toMatch(/BCE/);
  });
});
