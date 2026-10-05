// Medieval Europe beyond England: the Europe-wide datasets added in the
// 2026-09 audit (Wikidata sites, Germania Sacra, Buringh towns, HCED
// battles), tested as rules across regions — not only on English examples.
// Everything runs against the real offline data packs in public/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it, vi } from 'vitest';
import { regionAt, type RegionId } from '../world/axes';
import { LAYERS, urbanPopulation, type LayerCtx } from './catalog';
import { getPlace, matchName, recordFit } from './gazetteer';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});

const ctx = (year: number, showUndated = false): LayerCtx => ({ year, base: '/atlas/', showUndated } as LayerCtx);
const layerFilter = (id: string, year: number, showUndated = false) => {
  const spec = LAYERS.find((l) => l.id === id)!.specs(ctx(year, showUndated)).find((s) => s.type === 'circle')! as { filter: unknown };
  return (props: Record<string, unknown>) => featureFilter(spec.filter as never).filter({ zoom: 8 } as never, { type: 1, properties: props } as never);
};
/** The grey "?" layer for sites with no date (drawn only when undated records are included, from town-level zoom). */
const undatedFilter = (id: string, year: number) => {
  const spec = LAYERS.find((l) => l.id === id)!.specs(ctx(year, true)).find((s) => s.id === `${id}-undated`)! as { filter: unknown };
  return (props: Record<string, unknown>) => featureFilter(spec.filter as never).filter({ zoom: 10 } as never, { type: 1, properties: props } as never);
};
const evalExpr = (expr: unknown, props: Record<string, unknown>) => {
  const e = expression.createExpression(expr as never);
  if (e.result !== 'success') throw new Error('bad expression');
  return e.value.evaluate({ zoom: 6 } as never, { type: 1, properties: props } as never) as number;
};

type Row = [string, string | number, string, number, number, number, string, number | null, number | null, number, unknown[], string[], unknown[], Record<string, unknown> | null];
const rows: Row[] = readdirSync(join(PUB, 'world/places/c')).flatMap((f) => JSON.parse(readFileSync(join(PUB, 'world/places/c', f), 'utf8')) as Row[]);
const NEW = new Set(['wikidata', 'germaniasacra', 'buringh']);

describe('coverage is Europe-wide, not English', () => {
  const REGIONS: RegionId[] = ['british-isles', 'france-low-countries', 'iberia', 'italy', 'central-europe', 'northern-europe', 'balkans-greece', 'eastern-europe'];
  it.each(REGIONS)('%s has dated medieval sites (1000–1500) from the new datasets', (region) => {
    const dated = rows.filter((r) => NEW.has(r[0]) && regionAt(r[3], r[4]) === region && r[7] !== null && r[7] >= 1000 && r[7] <= 1500);
    expect(dated.length).toBeGreaterThan(100);
  });
  it.each(REGIONS)('%s has towns with population estimates', (region) => {
    expect(rows.filter((r) => r[0] === 'buringh' && regionAt(r[3], r[4]) === region).length).toBeGreaterThan(10);
  });
});

describe('sites resolve across regions, with their own dates', () => {
  it.each([
    ['Château Gaillard', 1204, 49.2, 1.4],   // Normandy
    ['Malbork Castle', 1410, 54.0, 19.0],    // Prussia
    ['Bran Castle', 1400, 45.5, 25.4],       // Transylvania
    ['Studenica monastery', 1200, 43.5, 20.5], // Serbia
    ['Uppsala Cathedral', 1300, 59.9, 17.6], // Sweden
    ['University of Bologna', 1200, 44.5, 11.3], // Italy
    ['Krak des Chevaliers', 1200, 34.8, 36.3], // Levant
  ])('%s (%i)', async (name, year, lat, lon) => {
    const m = await matchName(name, year);
    expect(m.status).toBe('unique');
    expect(m.place!.lat).toBeCloseTo(lat, 0);
    expect(m.place!.lon).toBeCloseTo(lon, 0);
    expect(m.fit).toBe('within');
  });
  it('a site founded after the date is not offered for it', async () => {
    const m = await matchName('Malbork Castle', 1150); // founded 1270
    expect(m.status).toBe('none');
  });
  it('the date says what it is: founded, first mention, or a Germania Sacra tenure', async () => {
    expect((await getPlace('wikidata:Q220301'))?.dateBasis).toBe('founded'); // Cluny Abbey
    const gs = rows.find((r) => r[0] === 'germaniasacra' && r[7] !== null)!;
    const p = (await getPlace(`germaniasacra:${gs[1]}`))!;
    expect(p.dateBasis).toBe('Germania Sacra');
    expect(p.url).toContain('klosterdatenbank.germania-sacra.de');
  });
});

describe('towns: English names, estimates, and source errors', () => {
  it.each([['Wien', 'Vienna'], ['Praha', 'Prague'], ['Firenze', 'Florence'], ['Venezia', 'Venice']])('Buringh’s %s is shown as %s, keeping its own name', (own, en) => {
    const r = rows.find((x) => x[0] === 'buringh' && String(x[1]).startsWith(`${own}|`))!;
    expect(r[2]).toBe(en);
    expect((r[10] as [string][]).map((n) => n[0])).toContain(own);
  });
  it('an English name is never taken from an ancient predecessor (Marseille is not “Massalia”)', () => {
    const r = rows.find((x) => x[0] === 'buringh' && String(x[1]).startsWith('Marseille|'))!;
    expect(r[2]).not.toMatch(/Massal|Massil/);
  });
  it('a town whose source position is wrong and cannot be confirmed is left off, not guessed (Minsk)', () => {
    expect(rows.some((x) => x[0] === 'buringh' && String(x[1]).startsWith('Minsk|'))).toBe(false);
  });
  it('[rule] population is interpolated between Buringh’s sample years', () => {
    expect(evalExpr(urbanPopulation(1250), { p1200: 44, p1300: 75 })).toBeCloseTo(59.5);
    expect(evalExpr(urbanPopulation(1300), { p1200: 44, p1300: 75 })).toBeCloseTo(75);
    expect(evalExpr(urbanPopulation(1550), { p1500: 94, p1550: 168 })).toBeCloseTo(168);
  });
  it('a town is drawn only while its estimate is above zero', () => {
    const at900 = layerFilter('urban-population', 900);
    expect(at900({ p900: 1, p1000: 2 })).toBe(true);
    expect(at900({ p1000: 2 })).toBe(false);
  });
});

describe('site layers follow the recorded dates', () => {
  it('a castle appears from its founding date', () => {
    expect(layerFilter('castles', 1100)({ k: 'castle', f: 1197 })).toBe(false);
    expect(layerFilter('castles', 1300)({ k: 'castle', f: 1197 })).toBe(true);
  });
  it('and not after its recorded end', () => {
    expect(layerFilter('castles', 1700)({ k: 'castle', f: 1197, t: 1600 })).toBe(false);
  });
  it('an undated castle is not evidence for any year: hidden unless undated records are asked for', () => {
    expect(layerFilter('castles', 1300)({ k: 'castle' })).toBe(false);
    // Asked for, it is a grey "?" from town-level zoom, never a dot on the overview map.
    expect(layerFilter('castles', 1300, true)({ k: 'castle' })).toBe(false);
    expect(undatedFilter('castles', 1300)({ k: 'castle' })).toBe(true);
  });
  it('religious houses and castles stay in their own layers', () => {
    expect(layerFilter('religious-houses', 1300)({ k: 'castle', f: 1000 })).toBe(false);
    expect(layerFilter('religious-houses', 1300)({ k: 'monastery', f: 910 })).toBe(true);
  });
});

describe('battles from two datasets are not doubled', () => {
  it('[rule] no HCED battle repeats a Wikidata battle within 50 km and a year', () => {
    type F = { geometry: { coordinates: [number, number] }; properties: { y: number; k: string } };
    const wd = (JSON.parse(readFileSync(join(PUB, 'atlas/wikidata-events.json'), 'utf8')).features as F[]).filter((f) => f.properties.k === 'battle' || f.properties.k === 'siege');
    const hc = JSON.parse(readFileSync(join(PUB, 'atlas/hced-battles.json'), 'utf8')).features as F[];
    expect(hc.length).toBeGreaterThan(500);
    const km = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111);
    const dup = hc.filter((h) => wd.some((w) => Math.abs(w.properties.y - h.properties.y) <= 1 && km(w.geometry.coordinates, h.geometry.coordinates) <= 50));
    expect(dup).toHaveLength(0);
  });
});

describe('naming: English → Latin-script label → standard romanization → own script; never dropped', () => {
  const extra = (r: Row) => (r[13] ?? {}) as Record<string, string>;
  const wd = rows.filter((r) => r[0] === 'wikidata');
  const latin = (s: string) => /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}’'ʼ-]+$/u.test(s);
  it('a place with only Cyrillic, Greek or Georgian names is romanized by a named scheme, and its own name is kept', () => {
    const rom = wd.filter((r) => extra(r).nb?.startsWith('romanized'));
    expect(rom.length).toBeGreaterThan(100);
    for (const r of rom.slice(0, 200)) {
      expect(latin(r[2])).toBe(true);
      expect(extra(r).nb).toMatch(/romanized: (BGN\/PCGN|Ukrainian|Bulgarian|Serbian|Macedonian|ELOT|Georgian)/);
      expect((r[10] as [string, unknown, unknown, string][]).some((n) => n[3] === extra(r).nl && !latin(n[0]))).toBe(true);
    }
  });
  it('a place whose only names are in scripts without a reliable romanization (Arabic, Persian…) keeps its own-script name rather than being dropped', () => {
    const own = wd.filter((r) => extra(r).nb === 'original script');
    expect(own.length).toBeGreaterThan(0);
    for (const r of own) expect(latin(r[2])).toBe(false);
  });
  it('an English name, where one exists, is always the one shown', () => {
    const withEn = wd.filter((r) => !extra(r).nb);
    expect(withEn.length / wd.length).toBeGreaterThan(0.8);
    expect(wd.filter((r) => extra(r).nb && (r[10] as [string, unknown, unknown, string][]).some((n) => n[3] === 'en')).length).toBe(0);
  });
});

describe('what a start date means', () => {
  it('a first mention is when evidence begins, not when the place began: before it the place is "not yet attested", not "later"', async () => {
    const fm = rows.find((r) => r[0] === 'wikidata' && (r[13] as Record<string, string> | null)?.fb === 'first mention' && r[7] !== null && r[7] > 1100)!;
    const p = (await getPlace(`wikidata:${fm[1]}`))!;
    expect(p.startKind).toBe('attested');
    expect(recordFit(p, (fm[7] as number) - 200)).toBe('unattested');
    expect(recordFit(p, (fm[7] as number) + 10)).toBe('within');
  });
  it('a founding / building date does mean it did not exist before', async () => {
    const fd = rows.find((r) => r[0] === 'wikidata' && (r[13] as Record<string, string> | null)?.fb === 'founded' && r[7] !== null && r[7] > 1100)!;
    const p = (await getPlace(`wikidata:${fd[1]}`))!;
    expect(p.startKind).toBe('founded');
    expect(recordFit(p, (fd[7] as number) - 200)).toBe('later');
  });
  it('a settlement start taken from Wikidata "inception" is not treated as a founding (it is often a first mention)', () => {
    const inc = rows.filter((r) => r[0] === 'wikidata' && (r[13] as Record<string, string> | null)?.k === 'settlement');
    expect(inc.some((r) => (r[13] as Record<string, string>).fb === 'founded')).toBe(false);
  });
  it('on the map, a site before its first mention is hidden by default and shown (hollow) only when unevidenced records are asked for', () => {
    const first = { k: 'castle', f: 1300, fb: 'first mention' };
    const built = { k: 'castle', f: 1300, fb: 'founded' };
    expect(layerFilter('castles', 1200)(first)).toBe(false);
    expect(layerFilter('castles', 1200, true)(first)).toBe(false); // a century before its first record: not drawn
    expect(layerFilter('castles', 1250, true)(first)).toBe(true); // within 60 years of it: hollow, on request
    expect(layerFilter('castles', 1250, true)(built)).toBe(false);
    expect(layerFilter('castles', 1350)(first)).toBe(true);
  });
  it('a house is not drawn after its recorded dissolution, even with unevidenced records on', () => {
    expect(layerFilter('religious-houses', 1600, true)({ k: 'monastery', f: 1100, t: 1539, fb: 'founded' })).toBe(false);
  });
  it('a site with only an end date is not evidence for any earlier year: not drawn at 3000 BCE, nor offered for it', async () => {
    const endOnly = { k: 'castle', t: 1600 };
    for (const y of [-3000, 117, 1300]) expect(layerFilter('castles', y)(endOnly)).toBe(false);
    expect(layerFilter('castles', 1300, true)(endOnly)).toBe(false); // an end says nothing about a beginning:
    expect(undatedFilter('castles', 1300)(endOnly)).toBe(true); //        like an undated site, a grey "?" when zoomed in
    expect(undatedFilter('castles', -3000)(endOnly)).toBe(false); // never before the layer's own period
    expect(layerFilter('castles', 1600)(endOnly)).toBe(true);
    const r = rows.find((x) => x[0] === 'wikidata' && x[7] === null && x[8] !== null && (x[8] as number) > 1000)!;
    const p = (await getPlace(`wikidata:${r[1]}`))!;
    expect(recordFit(p, -3000)).toBe('unattested');
    expect(recordFit(p, (r[8] as number) - 100)).toBe('unattested');
    expect(recordFit(p, (r[8] as number) + 100)).toBe('earlier');
  });
});

describe('Buringh towns: corrections are stated, never silent', () => {
  it('every town whose position was changed says so, with the distance', () => {
    const fixed = rows.filter((r) => r[0] === 'buringh' && (r[13] as Record<string, string> | null)?.fix);
    expect(fixed.length).toBeGreaterThan(0);
    for (const r of fixed) expect((r[13] as Record<string, string>).fix).toMatch(/decimal point restored|position from Wikidata; Buringh's coordinates are \d+ km away/);
  });
  it('no two towns sit on the same spot under the same name (no duplicated towns)', () => {
    const seen = new Set<string>();
    for (const r of rows.filter((x) => x[0] === 'buringh')) {
      const k = `${r[2]}|${(r[3] as number).toFixed(2)}|${(r[4] as number).toFixed(2)}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});

describe('regional specialist datasets are used where Wikidata is not enough', () => {
  const ex = (r: Row) => (r[13] ?? {}) as Record<string, unknown>;
  it('Holy Roman Empire towns carry first mention, charter and the ruling territory per period — from the specialist dataset', () => {
    const hre = rows.filter((r) => r[0] === 'hre');
    expect(hre.length).toBeGreaterThan(2000);
    const withRule = hre.filter((r) => Array.isArray(ex(r).rule) && (ex(r).rule as unknown[]).length > 0);
    expect(withRule.length / hre.length).toBeGreaterThan(0.95);
    for (const r of withRule.slice(0, 300)) {
      const rule = ex(r).rule as [string, number, number][];
      for (let i = 1; i < rule.length; i++) expect(rule[i][1]).toBeGreaterThan(rule[i - 1][1]); // spans in order, never overlapping
    }
    // A town's start is its earliest dated evidence of any kind: no charter is ever dated before it (the source
    // sometimes records a charter or foundation before the first "mention", whose year can be an upper bound).
    const bad = hre.filter((r) => ex(r).ch != null && (r[7] === null || (ex(r).ch as number) < (r[7] as number)));
    expect(bad).toEqual([]);
  });
  it('a town of the Empire before its first written mention is "not yet attested", not "later"', async () => {
    const t = rows.find((r) => r[0] === 'hre' && ex(r).fb === 'first mention' && (r[7] as number) > 1200)!;
    const p = (await getPlace(`hre:${t[1]}`))!;
    expect(recordFit(p, (t[7] as number) - 150)).toBe('unattested');
  });
  it('French monuments are dated by their building campaign as an evidence period, never as a founding', async () => {
    const m = rows.find((r) => r[0] === 'merimee')!;
    const p = (await getPlace(`merimee:${m[1]}`))!;
    expect(p.from).toBeUndefined();
    expect(p.envelope?.from).toBeDefined();
    expect(p.dateBasis).toMatch(/building campaign/);
  });
  it('Finnish sites are dated only by the register’s period classes', () => {
    const f = rows.filter((r) => r[0] === 'finreg');
    expect(f.length).toBeGreaterThan(1000);
    expect(f.every((r) => r[7] === null && Array.isArray(ex(r).env))).toBe(true);
  });
  it('a West Bohemian attested name form is attached to the matching place rather than duplicating it', () => {
    const merged = rows.filter((r) => r[0] === 'wikidata' && ex(r).fbs === 'Western Bohemia toponyms (Janovská 2026)');
    expect(merged.length).toBeGreaterThan(0); // where the attested year is earlier than Wikidata's
    const withForm = rows.filter((r) => r[0] === 'wikidata' && (r[10] as [string, unknown, unknown, string][]).some((n) => n[3] === 'historical form'));
    expect(withForm.length).toBeGreaterThan(300);
  });
  it('datasets whose licence is not verified never reach the public place index', () => {
    expect(rows.some((r) => ['tib', 'markets-fairs', 'mf'].includes(r[0] as string))).toBe(false);
    const gi = readFileSync(join(__dirname, '../../.gitignore'), 'utf8');
    expect(gi).toMatch(/local-sites\.pmtiles/);
  });
  it('the Empire towns layer draws a town light from its first mention and dark from its charter', () => {
    const spec = LAYERS.find((l) => l.id === 'hre-towns')!.specs(ctx(1300)).find((s) => s.type === 'circle')! as { filter: unknown };
    const f = (p: Record<string, unknown>) => featureFilter(spec.filter as never).filter({ zoom: 8 } as never, { type: 1, properties: p } as never);
    expect(f({ f: 1350 })).toBe(false);
    expect(f({ f: 1250 })).toBe(true);
    expect(f({ f: 1250, ch: 1280 })).toBe(true);
  });
});
