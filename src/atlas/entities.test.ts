// The entity layer, tested against the real build in public/world/entities: the app's label rule must give what the
// build's label rule gives, and the stored claims must hold the rules the build promises.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { covers, entityOf, labelAt, type Entity, type NameForm } from './entities';
import { crc32 } from './gazetteer';

const PUB = join(__dirname, '../../public');
const ENT = join(PUB, 'world/entities');
vi.stubGlobal('fetch', async (input: string) => {
  const rel = String(input).replace(/^.*?\/world\//, 'world/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});

const audit = JSON.parse(readFileSync(join(__dirname, '../../data/historical/audit/entities.json'), 'utf8'));
const report = Array.isArray(audit) ? audit[0] : audit;
const all: Entity[] = readdirSync(join(ENT, 'e')).flatMap((f) =>
  Object.entries(JSON.parse(readFileSync(join(ENT, 'e', f), 'utf8')) as Record<string, Omit<Entity, 'id'>>).map(([id, b]) => ({ id, ...b })));
const ds = (k: string) => k.slice(0, k.indexOf(':'));

describe('entity layer', () => {
  it('gives the same label for a year as the build does', async () => {
    const examples = Object.entries(report.examples as Record<string, { entity: string; records: string[]; labels: Record<string, { label: string; rule: string }> }>);
    expect(examples.length).toBeGreaterThan(5);
    for (const [, ex] of examples) {
      const e = await entityOf(ex.records[0]);
      expect(e?.id).toBe(ex.entity);
      for (const [y, want] of Object.entries(ex.labels)) {
        const got = labelAt(e!, Number(y));
        expect([got.name, got.rule]).toEqual([want.label, want.rule]);
      }
    }
  });

  it('never makes two records of one dataset one place', () => {
    for (const e of all) expect(new Set(e.m.map(ds)).size).toBe(e.m.length);
  });

  it('joins records only through stored joined claims, and every member finds its entity', () => {
    for (const e of all.slice(0, 3000)) {
      if (e.m.length < 2) continue;
      // The joined claims connect all members.
      const seen = new Set([e.m[0]]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const [a, b, , st] of e.c) {
          if (st !== 'joined') continue;
          if (seen.has(a) !== seen.has(b) && e.m.includes(a) && e.m.includes(b)) { seen.add(a); seen.add(b); grew = true; }
        }
      }
      expect(seen.size).toBe(e.m.length);
      for (const k of e.m) {
        const i = k.indexOf(':');
        const map = JSON.parse(readFileSync(join(ENT, 'r', `${k.slice(0, i)}-${crc32(k.slice(i + 1)) % 16}.json`), 'utf8'));
        expect(map[k.slice(i + 1)]).toBe(e.id);
      }
    }
  });

  it('keeps every name form with the records that give it', () => {
    for (const e of all) for (const f of e.n) expect(f[5].length > 0 && f[5].every((i) => i >= 0 && i < e.m.length)).toBe(true);
  });

  it('publishes only public datasets', () => {
    const priv = ['tib', 'mfairs', 'afontium', 'ran', 'dicotopo', 'raa', 'ebidat', 'darmc', 'dkff', 'ariadne'];
    for (const f of readdirSync(join(ENT, 'r'))) expect(priv).not.toContain(f.replace(/-\d+\.json$/, ''));
    for (const e of all) for (const k of e.m) expect(priv).not.toContain(ds(k));
  });

  it('reads a name with only a start year as one attestation, a record title with only a start as continuing', () => {
    const name: NameForm = ['Parisiis', 1318, null, null, 'name', [0]];
    const title: NameForm = ['Istanbul', 1453, null, null, 'record', [0]];
    expect([covers(name, 1300), covers(name, 1400)]).toEqual([true, false]);
    expect([covers(title, 1410), covers(title, 1900)]).toEqual([true, true]);
  });

  it('prefers a name dated in its own right, and falls back to the most-given form', () => {
    const e: Entity = { id: 'e1', m: ['a:1', 'b:2'], c: [], n: [
      ['Londinium', -30, 640, 'la', 'name', [0]],
      ['London', 700, null, null, 'period', [1]],
      ['London', null, null, null, '', [0]],
      ['Lunden', null, null, null, '', [1]],
    ] };
    expect(labelAt(e, 100)).toMatchObject({ name: 'Londinium', rule: 'dated-name', sources: ['a:1'] });
    expect(labelAt(e, 1000)).toMatchObject({ name: 'London', rule: 'evidence-period' });
    expect(labelAt({ ...e, n: e.n.slice(2) })).toMatchObject({ name: 'London', rule: 'most-sources' });
  });
});
