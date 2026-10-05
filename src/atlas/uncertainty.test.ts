// Stage 4 part 3 (RM-13): the source's own doubt and precision are carried, drawn and weighed — never flattened.
import 'fake-indexeddb/auto';
import { expression } from '@maplibre/maplibre-gl-style-spec';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cert } from '../lib/book/extractPrompt';
import { doubtNote } from './AtlasMap';
import { SOURCE_DOUBT } from './catalog';
import { placeConfidence } from './gazetteer';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const doubted = (props: Record<string, unknown>) => (expression.createExpression(SOURCE_DOUBT as never) as { value: { evaluate: (g: unknown, f: unknown) => unknown } }).value.evaluate({ zoom: 9 }, { type: 1, properties: props });

describe('a record its source marks “possible” is never drawn or scored as definite (A11-006, A10-001, A15-003)', () => {
  it('[rule] the map reads the source’s doubt from its type, in register wording', () => {
    expect(doubted({ st: 'BROCH (IRON AGE)(POSSIBLE)' })).toBe(true);
    expect(doubted({ st: 'CASTLE (MEDIEVAL)' })).toBe(false);
    expect(doubted({ ty: 'Burg, vermutlich' })).toBe(true);
    expect(doubtNote({ st: 'CHURCH (MEDIEVAL)(PROBABLE)' })).toMatch(/possible or probable/);
  });
  it('[rule] the source’s doubt caps the confidence scale at probable', () => {
    const a = { identity: 'unique' as const, basis: 'only' as const, liveRivals: 0, support: 'attested' as const, fitsBook: true };
    expect(placeConfidence(a)).toBe('certain');
    expect(placeConfidence({ ...a, sourceDoubt: true })).toBe('probable');
  });
});

describe('an approximate position is not a doubted identification (A15-002)', () => {
  it('no register or spec row is marked uncertain only because its position is approximate', () => {
    const dir = join(PUB, 'world/places/c');
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((_, i) => i % 7 === 0)) {
      for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown[][]) {
        const e = r[13] as { nb?: string } | null;
        if (e?.nb === 'label' && r[9] === 1 && r[5] === 0 && r[0] !== 'dissiloc') bad.push(`${r[0]}:${r[1]}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('every documented confidence field is read (SS-1, PA-011)', () => {
  it('Zbiva location and dating confidence, DISSILOC localisation and status', () => {
    const z = JSON.parse(readFileSync(join(__dirname, '../../data/historical/specs/zbiva.json'), 'utf8'));
    expect(z.fields.approx.values).toEqual(['0', '1', '2']);
    expect(z.fields.typeExtra).toContain('Dateconf');
    const src = readFileSync(join(__dirname, '../../scripts/atlas-build/registers.py'), 'utf8');
    expect(src).toMatch(/localisation_precision/);
  });
});

describe('the book analysis keeps the model’s hedges (A8-035)', () => {
  it.each([['explicit', 'explicit'], ['stated', 'explicit'], ['inferred', 'inferred'], ['implied', 'inferred'], ['probable', 'uncertain'], ['likely', 'uncertain'], ['', 'uncertain'], ['speculative', 'uncertain']])('“%s” → %s', (w, c) => {
    expect(cert(w)).toBe(c);
  });
});
