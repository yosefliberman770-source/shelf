// Historical geography, tested as rules.
//
// Two sections:
//   REGRESSION      — the problems that were reported (Exeter, Europe, "mass",
//                     Bethlehem, Guild, Aragonese, Roman places at 3000 BCE,
//                     Wessex, Norway in Yorkshire, Denmark over Greenland…).
//   GENERALISATION  — the same mechanisms on deliberately different cases
//                     (other ordinary words, other shared names, other
//                     adjectives, other datasets, other periods, scripts and
//                     map scales). Passing these is what shows the mechanism
//                     was fixed rather than the examples memorised.
// Everything runs against the real offline data packs in public/.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { politiesLine } from '../components/history/atlasParts';
import { assessCandidates, hasSpellingEvidence } from '../lib/history/assess';
import { detectPlaces, screenMentions } from '../lib/history/placeDetect';
import type { PlaceCandidate } from '../lib/history/types';
import { relevance, type HistMap } from '../world/maps';
import { LAYERS, ohmLabel, UNAVAILABLE_LABEL, type LayerCtx } from './catalog';
import { politiesAt, polityDisplayName } from './context';
import { getPlace, type GazPlace, matchName, recordFit } from './gazetteer';
import { isCommonWord, loadCommonWords, macroRegion, matchPolity, mentionEvidence, plausibleMention } from './mention';
import { hasRtl, isolate, joinNames, nameRoles } from './names';
import { resolvePlace } from './resolve';
import { timeFit } from './time';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline'); // no network in tests
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
beforeAll(async () => { await loadCommonWords(); });
const offline = (w: string, year?: number, extra: Partial<Parameters<typeof resolvePlace>[1]> = {}) => resolvePlace(w, { year, detection: 'cue', online: false, ...extra });
const place = async (key: string) => (await getPlace(key)) as GazPlace;
const cand = (canonicalName: string, alternativeNames: string[] = [], lat?: number, lon?: number): PlaceCandidate => ({ place: { id: canonicalName, canonicalName, alternativeNames, source: 'test', countryCodes: [], latitude: lat, longitude: lon } as unknown as PlaceCandidate['place'] });

// The real layer filters, evaluated on features the way MapLibre does.
const ctx = (year: number, showUndated = false): LayerCtx => ({ year, base: '/atlas/', showUndated } as LayerCtx);
const layerFilter = (id: string, year: number, showUndated = false) => {
  const spec = LAYERS.find((l) => l.id === id)!.specs(ctx(year, showUndated)).find((s) => s.type === 'circle')! as { filter: unknown };
  return (props: Record<string, unknown>) => featureFilter(spec.filter as never).filter({ zoom: 8 } as never, { type: 1, properties: props } as never);
};
const evalAt = (expr: unknown, zoom: number, props: Record<string, unknown>) => {
  const e = expression.createExpression(expr as never);
  if (e.result !== 'success') throw new Error('bad expression');
  return e.value.evaluate({ zoom } as never, { type: 1, properties: props } as never);
};

// ════════════════════════════════════════════════════════════════════════
describe('REGRESSION — the reported problems', () => {
  it('"at Mass" / "of the Guild": ordinary words after weak cues are not looked up', () => {
    expect(plausibleMention(mentionEvidence('Mass', 'they heard Mass at dawn'), 'Mass', false).ok).toBe(false);
    expect(plausibleMention(mentionEvidence('Guild', 'the wardens of the Guild met'), 'Guild', false).ok).toBe(false);
  });
  it('Guild → Guilderland, Mass → Massachusetts: prefixes and abbreviations are not spelling evidence', () => {
    expect(hasSpellingEvidence(cand('Guilderland'), 'Guild')).toBe(false);
    expect(hasSpellingEvidence(cand('Massachusetts', ['Mass.', 'MA']), 'Mass')).toBe(false);
  });
  it('Exeter is shown as Exeter; Isca Dumnoniorum stays the record title', async () => {
    const m = await matchName('Exeter', 100);
    const roles = nameRoles(m.place!, 'Exeter', 100);
    expect(roles.display).toBe('Exeter');
    expect(roles.recordTitle).toBe('Isca Dumnoniorum');
  });
  it('Europe is the continent, not the Thracian province of that name', async () => {
    const r = await offline('Europe', -218);
    expect(r.place?.kind).toBe('continent');
    expect(r.status).toBe('HIGH');
  });
  it('Bethlehem: a book set in the Levant gets the Levantine place; a far-away namesake is not accepted on its name alone', async () => {
    const m = await matchName('Bethlehem', 1600, { context: { points: [[35.23, 31.78]], from: ['test'] } });
    expect(m.place?.lat).toBeCloseTo(31.7, 0);
    const a = assessCandidates([cand('Bethlehem', [], 40.62, -75.37)], { name: 'Bethlehem', date: 1600, contextPoints: [{ lat: 31.78, lon: 35.23 }] });
    expect(a.status).toBe('LOW');
  });
  it('Aragonese → the Aragonese polity of the date', async () => {
    const [m] = await matchPolity('Aragonese', 1300);
    expect(m.polity.n).toMatch(/Aragon/);
    expect(m.fit).toBe('within');
  });
  it('3000 BCE: Roman-era settlements with no dates of their own do not appear', () => {
    const at = layerFilter('settlements', -3000);
    expect(at({ l: 'settlement', ef: -750, et: 640, eo: 'source' })).toBe(false); // Barrington-period village
    expect(at({ l: 'settlement', ef: -330, et: 300, eo: 'related' })).toBe(false); // village with a dated temple
    expect(at({ l: 'settlement' })).toBe(false); // no temporal evidence at all
    expect(at({ l: 'settlement', f: -30, t: 300 })).toBe(false); // dated Roman town
  });
  it('…and the same settlements do appear at a Roman date, inside the period their evidence allows', () => {
    const at = layerFilter('settlements', 100);
    expect(at({ l: 'settlement', ef: -750, et: 640, eo: 'source' })).toBe(true);
    expect(at({ l: 'settlement', ef: -330, et: 300, eo: 'related' })).toBe(true);
    expect(at({ l: 'settlement', f: -30, t: 300 })).toBe(true);
    // No evidence at all: not placed at any date unless the reader asks for undated records.
    expect(at({ l: 'settlement' })).toBe(false);
    expect(layerFilter('settlements', 100, true)({ l: 'settlement' })).toBe(true);
  });
  it('modern Greece in an ancient context: "Greece" in 400 BCE is the land, with no modern state offered', async () => {
    const r = await offline('Greece', -400);
    expect(r.place?.kind).toBe('region');
    expect(r.candidates.some((c) => c.kind === 'polity')).toBe(false);
  });
  it('Wessex vs Anglo-Saxon England: the grouping is "part of", not a rival polity', async () => {
    const ps = await politiesAt([-1.3, 51.06], 900); // Winchester
    expect(ps.map((p) => p.n)).toContain('Kingdom of Wessex');
    expect(ps.some((p) => p.n.startsWith('('))).toBe(false);
    expect(ps.find((p) => p.n === 'Kingdom of Wessex')?.partOf).toContain('Anglo-Saxon England');
  });
  it('Norway in Yorkshire: an overlap in the source and a detached piece — described as such, not as a claim or dispute', async () => {
    const ps = await politiesAt([-0.43, 53.87], 1100);
    expect(ps.find((p) => p.op)).toBeDefined(); // the detached piece
    expect(ps.some((p) => p.x && !p.xr)).toBe(true); // overlap with no recorded relationship
    const line = politiesLine(ps);
    expect(line).toMatch(/outlines overlap/);
    expect(line).not.toMatch(/contested/i);
  });
  it('Denmark over Greenland: one label point per polity version, not one per polygon part', () => {
    const slice = JSON.parse(readFileSync(join(PUB, 'atlas/cliopatria/2000_2009.json'), 'utf8')) as { features: { properties: Record<string, unknown> }[] };
    const labels = slice.features.filter((f) => f.properties.lbl && f.properties.n === 'Denmark' && (f.properties.f as number) <= 2005 && (f.properties.t as number) >= 2005);
    expect(labels).toHaveLength(1);
  });
  it('small territories are not named at world scale', () => {
    const label = LAYERS.find((l) => l.id === 'other-states')!.specs(ctx(1850)).find((s) => s.type === 'symbol') as { layout: { 'text-size': unknown } };
    expect(evalAt(label.layout['text-size'], 2, { a: 3000 })).toBe(0); // e.g. a Corsica/Gibraltar-sized polity
    expect(evalAt(label.layout['text-size'], 7, { a: 3000 })).toBeGreaterThan(0);
  });
  it('"no open dataset": unavailable layers say which reason applies', () => {
    for (const l of LAYERS.filter((x) => x.unavailable)) expect(l.unavailableKind && UNAVAILABLE_LABEL[l.unavailableKind]).toBeTruthy();
  });
  it('map labels for Middle-Eastern cities use their English name, not the local script', () => {
    expect(evalAt(ohmLabel, 6, { name: 'دمشق', name_en: 'Damascus' })).toBe('Damascus');
    expect(evalAt(ohmLabel, 6, { name: 'חדרה', name_en: 'Hadera', name_he: 'חדרה' })).toBe('Hadera');
  });
  it('modern Greece is labelled "Greece", not by its formal title — and only when it exists', async () => {
    const now = await politiesAt([23.73, 37.98], 2000); // Athens
    expect(now.map(polityDisplayName)).toContain('Greece');
    const ancient = await politiesAt([23.73, 37.98], -400);
    expect(ancient.map(polityDisplayName).join(' ')).not.toMatch(/Greece|Hellenic Republic/);
  });
  it('Arabic and Hebrew names are isolated, never reversed', () => {
    const arabic = 'القاهرة';
    const hebrew = 'ירושלים';
    expect(hasRtl(arabic) && hasRtl(hebrew)).toBe(true);
    expect(isolate(arabic)).toBe(`⁨${arabic}⁩`);
    expect(joinNames(['Hierosolyma', hebrew])).toBe(`Hierosolyma · ⁨${hebrew}⁩`);
  });
});

// ════════════════════════════════════════════════════════════════════════
describe('GENERALISATION — same mechanisms, different cases', () => {
  describe('is it a place at all?', () => {
    it('ordinary words come from a word list, not a hand-made list', () => {
      for (const w of ['mill', 'bank', 'church', 'chapel', 'reading', 'bath']) expect(isCommonWord(w)).toBe(true);
      for (const w of ['tewkesbury', 'carthage', 'lübeck']) expect(isCommonWord(w)).toBe(false);
    });
    it('other ordinary words after weak or movement cues are not looked up', () => {
      for (const [w, passage] of [['Mill', 'She went down to Mill before noon.'], ['Bank', 'He waited at Bank for hours.'], ['Church', 'They came from Church together.'], ['Chapel', 'they went to Chapel on Sunday']]) {
        expect(plausibleMention(mentionEvidence(w, passage), w, false).ok).toBe(false);
      }
    });
    it('the same words are accepted when the wording names a place, a dataset knows them, or they are unusual', () => {
      expect(plausibleMention(mentionEvidence('Bath', 'the city of Bath was full'), 'Bath', false).ok).toBe(true);
      expect(mentionEvidence('Bath', 'the city of Bath').expected).toBe('settlement');
      expect(plausibleMention(mentionEvidence('Reading', 'the abbey of Reading'), 'Reading', false).ok).toBe(true);
      expect(plausibleMention(mentionEvidence('Mill', 'the siege of Mill'), 'Mill', false).ok).toBe(true);
      expect(plausibleMention(mentionEvidence('Mill', 'went to Mill'), 'Mill', true).ok).toBe(true);
      expect(plausibleMention(mentionEvidence('Tewkesbury', 'the army marched to Tewkesbury'), 'Tewkesbury', false).ok).toBe(true);
      expect(plausibleMention(mentionEvidence('New Forest', 'rode into New Forest'), 'New Forest', false).ok).toBe(true);
    });
    it('screening keeps places and adjectives with a polity, drops ordinary words', async () => {
      const text = 'In 1402 the Castilian ships left Seville. Later they sailed to Carthage, and he went to Mill again.';
      const kept = (await screenMentions(detectPlaces(text), 1402)).map((m) => m.name);
      expect(kept).toEqual(expect.arrayContaining(['Carthage', 'Castilian']));
      expect(kept).not.toContain('Mill');
    });
  });

  describe('historical adjectives and demonyms', () => {
    it.each([
      ['Castilian', 1400, /Castile/],
      ['Frankish', 800, /Franks/],
      ['Norman', 1000, /Normandy/],
      ['Byzantine', 900, /Byzantine/],
      ['Roman', -100, /Roman Republic/],
    ])('%s (%i) → the polity existing then', async (w, y, re) => {
      const [m] = await matchPolity(w, y);
      expect(m?.polity.n).toMatch(re);
      expect(m?.fit).toBe('within');
    });
    it.each([
      ['Venetian', 1500, /Venice/], // irregular: from Wikidata's recorded alias/demonym, not spelling
      ['Danish', 1000, /Denmark/],
      ['Hungarian', 1400, /Kingdom of Hungary/], // the date decides before how the words matched
    ])('%s (%i) → the polity existing then, from recorded data', async (w, y, re) => {
      const [m] = await matchPolity(w, y);
      expect(m?.polity.n).toMatch(re);
      expect(m?.fit).toBe('within');
    });
    it('a demonym match the book’s own places contradict is only "likely" ("Roman" in 1100 in a book set in Constantinople)', async () => {
      const demonym = { strength: 'none' as const, multiword: false, demonym: true };
      const r = await offline('Roman', 1100, { mention: demonym, nearby: ['Constantinople', 'Nicaea'] });
      expect(r.status).not.toBe('HIGH');
    });
    it('the same adjective depends on the date: "Roman" in 1100 is not the Roman Republic, and never the city of Rome', async () => {
      const r = await offline('Roman', 1100, { mention: { strength: 'none', multiword: false, demonym: true } });
      expect(r.place?.title ?? '').not.toMatch(/Roman Republic|^Rome$|^Roma$/);
      const early = await offline('Roman', -100, { mention: { strength: 'none', multiword: false, demonym: true } });
      expect(early.place?.kind).toBe('polity');
    });
    it('without a date, the book’s places don’t pick between polities of the same name (label points prove nothing)', async () => {
      const demonym = { strength: 'none' as const, multiword: false, demonym: true };
      const undated = await offline('Roman', undefined, { mention: demonym, nearby: ['Carthage', 'Capua', 'Cannae'] });
      expect(undated.status).toBe('AMBIGUOUS');
      const dated = await offline('Roman', -216, { mention: demonym, nearby: ['Carthage', 'Capua', 'Cannae'] });
      expect(dated.place?.title).toBe('Roman Republic');
    });
    it('an adjective about language or a thing is not a place ("English translation", "Roman numerals")', () => {
      const names = detectPlaces('the English translation was poor, the Roman numerals were worn, but the English fleet sailed.').map((m) => m.name);
      expect(names.filter((n) => n === 'English')).toHaveLength(1); // only the fleet
      expect(names).not.toContain('Roman');
    });
    it('an adjective with no polity behind it is not turned into a town', async () => {
      const r = await offline('Martian', 1400, { mention: { strength: 'none', multiword: false, demonym: true } });
      expect(r.status).toBe('UNRESOLVED');
      expect(r.place).toBeUndefined();
    });
    it('a polity is not placed at a date when it did not exist', async () => {
      const r = await offline('Portugal', -300);
      expect(r.place?.kind === 'polity' && r.status !== 'LOW').toBe(false);
    });
  });

  describe('places sharing a name', () => {
    it('Alexandria: the book’s geography picks the Egyptian one; without it, it isn’t guessed', async () => {
      expect((await matchName('Alexandria', 100)).status).toBe('ambiguous');
      const egypt = await matchName('Alexandria', 100, { context: { points: [[31.2, 30.0]], from: ['test'] } });
      expect(egypt.place?.lat).toBeCloseTo(31.2, 0);
    });
    it('Tripolis and Heraclea stay ambiguous without context', async () => {
      expect((await matchName('Tripolis', 100)).status).toBe('ambiguous');
      expect((await matchName('Heraclea', 100)).status).toBe('ambiguous');
    });
    it('Rome in Italy vs Rome in Mecklenburg, depending on the book', async () => {
      const italy = await matchName('Rome', undefined, { context: { points: [[12.3, 41.8]], from: ['test'] } });
      const mecklenburg = await matchName('Rome', undefined, { context: { points: [[11.4, 53.6]], from: ['test'] } });
      expect(italy.place?.gazetteer).toBe('pleiades');
      expect(mecklenburg.place?.gazetteer).toBe('viabundus');
      expect((await matchName('Rome')).status).toBe('ambiguous');
    });
    it('other prefix/abbreviation traps', () => {
      expect(hasSpellingEvidence(cand('Bathurst'), 'Bath')).toBe(false);
      expect(hasSpellingEvidence(cand('Pennsylvania', ['Penn.', 'PA']), 'Penn')).toBe(false);
      expect(hasSpellingEvidence(cand('Bath', ['Aquae Sulis']), 'Aquae Sulis')).toBe(true);
    });
  });

  describe('continents, seas and lands', () => {
    it.each(['Adriatic', 'Atlantic', 'Balkans', 'Anatolia', 'Scandinavia'])('%s → a region', async (w) => {
      const r = await offline(w, 1200);
      expect(r.status).toBe('HIGH');
      expect(r.place?.key).toMatch(/^macro:/);
      expect(macroRegion(w)).toBeDefined();
    });
    it('a period province of the same name is offered as another reading (Asia → the Roman province)', async () => {
      const r = await offline('Asia', -100);
      expect(r.place?.kind).toBe('continent');
      expect(r.candidates.map((c) => c.recordTitle ?? c.title)).toContain('Asia (Roman province)');
    });
  });

  describe('time: four kinds of temporal knowledge, across datasets', () => {
    it('the model: dates, an evidence period, or nothing', () => {
      expect(timeFit({}, 100)).toBe('undated');
      expect(timeFit({ from: 1300 }, 100)).toBe('later');
      expect(timeFit({ to: -500 }, 100)).toBe('earlier');
      const env = { envelope: { from: -750, to: 640, basis: 'source' as const } };
      expect(timeFit(env, -3000)).toBe('later');
      expect(timeFit(env, 100)).toBe('period');
      expect(timeFit(env, 900)).toBe('earlier');
    });
    it.each([
      ['pleiades:863914', 'source', -3000, 100], // Urbnisi — Barrington Atlas period
      ['pleiades:348371058', 'related', -1000, 500], // Polonnaruwa — dated records linked to it
      ['pleiades:560670', 'part-of', -300, 300], // Palaiokastro — the dated place it belongs to
      ['viabundus:5169', 'dataset', 1200, 1400], // Navolok — Viabundus' documented period
    ])('%s (%s): out of range at %i, eligible at %i', async (key, basis, before, during) => {
      const p = await place(key);
      expect(p.from).toBeUndefined();
      expect(p.envelope?.basis).toBe(basis);
      expect(recordFit(p, before)).toBe('later');
      expect(recordFit(p, during)).toBe('period');
    });
    it('al-Ṯurayyā records carry the atlas’s 9th–10th-century period, and only that', async () => {
      const p = await place('althurayya:JURZAN_432E425N_R');
      expect(recordFit(p, 900)).toBe('period');
      expect(recordFit(p, 1300)).toBe('earlier');
    });
    it('a record with no temporal evidence at all is undated at every date — not "always", not "never"', async () => {
      const p = await place('pleiades:641191185'); // Taʿizz
      expect(p.envelope).toBeUndefined();
      expect(recordFit(p, -3000)).toBe('undated');
      expect(recordFit(p, 100)).toBe('undated');
    });
    it('a later town is not found for an earlier date (Lübeck)', async () => {
      expect((await matchName('Lübeck', 100)).status).toBe('none');
      expect((await matchName('Lübeck', 1400)).status).toBe('unique');
    });
    it('a record known only to a period is confirmed only when the book’s other places agree (Rome, 218 BCE)', async () => {
      expect((await offline('Rome', -218)).status).toBe('MEDIUM');
      expect((await offline('Rome', -218, { nearby: ['Carthage', 'Capua', 'Cannae'] })).status).toBe('HIGH');
    });
  });

  describe('names and scripts', () => {
    it('the book’s wording is shown when the record lists it (Constantinople / Constantinopolis)', async () => {
      const roles = nameRoles((await matchName('Constantinople', 400)).place!, 'Constantinople', 400);
      expect(roles.display).toBe('Constantinople');
      expect(roles.recordTitle).toBe('Constantinopolis');
    });
    it('a modern name for an ancient place is flagged as such', async () => {
      expect((await matchName('Constantinople', -500)).reason).toMatch(/modern name/);
    });
    it('map labels in any script: English first, then a Latin-script name, never local script', () => {
      expect(evalAt(ohmLabel, 6, { name: 'Москва', name_en: 'Moscow' })).toBe('Moscow');
      expect(evalAt(ohmLabel, 6, { name: 'Αθήνα', name_de: 'Athen' })).toBe('Athen'); // no English: another Latin-script name
      expect(evalAt(ohmLabel, 6, { name: 'Thebes' })).toBe('Thebes'); // already Latin
      expect(evalAt(ohmLabel, 6, { name: 'Ḥimṣ' })).toBe('Ḥimṣ'); // Latin transliteration with marks
      expect(evalAt(ohmLabel, 6, { name: 'ʿAkko' })).toBe('ʿAkko');
      expect(evalAt(ohmLabel, 6, { name: '廣平府' })).toBe(''); // no readable name recorded: no label (the dot stays)
      expect(evalAt(ohmLabel, 6, { name: '東京', name_ja: '東京', name_en: 'Tokyo' })).toBe('Tokyo');
    });
    it('Greek and Cyrillic names are isolated too; Latin-script names are left alone', () => {
      expect(isolate('Ἀθῆναι')).toBe('⁨Ἀθῆναι⁩');
      expect(isolate('Москва')).toBe('⁨Москва⁩');
      expect(isolate('Lutetia')).toBe('Lutetia');
    });
  });

  describe('everyday names for states', () => {
    const names = JSON.parse(readFileSync(join(PUB, 'atlas/cliopatria/names.json'), 'utf8')) as { n: string; cn?: string }[];
    const cn = (n: string) => names.find((x) => x.n === n)?.cn;
    it('formal titles get the everyday name', () => {
      expect(cn('Federated Republic of Germany')).toBe('Germany');
      expect(cn('French Third Republic')).toBe('France');
      expect(cn('Old Kingdom of Norway')).toBe('Norway');
      expect(cn('Kingdom of Wessex')).toBe('Wessex');
    });
    it('earlier states are never renamed after a modern country, and renamed countries keep their own name', () => {
      expect(cn('Roman Republic')).toBeUndefined(); // Wikidata's "country" would say Italy
      expect(cn('Kingdom of the Franks')).toBeUndefined(); // …and France
      expect(cn('Burma')).toBeUndefined(); // not "Myanmar"
      expect(cn('Republic of China')).toBeUndefined(); // not the People's Republic
      expect(cn('Revolutionary Roman Republic')).toBeUndefined(); // would be confused with the ancient one
    });
    it('the map label uses the everyday name and keeps the formal one otherwise', () => {
      const label = LAYERS.find((l) => l.id === 'republics')!.specs(ctx(2000)).find((s) => s.type === 'symbol') as { layout: { 'text-field': unknown } };
      expect(evalAt(label.layout['text-field'], 5, { n: 'Third Hellenic Republic', cn: 'Greece' })).toBe('Greece');
      expect(evalAt(label.layout['text-field'], 5, { n: 'Roman Republic' })).toBe('Roman Republic');
    });
  });

  describe('political geography in other periods and places', () => {
    it.each([
      [[-1.08, 53.96], 900, /Danelaw/], // York
      [[44.4, 33.3], 900, /Abbasid/], // Baghdad
      [[14.25, 41.08], -218, /Roman Republic/], // Capua
      [[2.35, 48.86], 1850, /French/], // Paris
    ] as const)('%j in %i', async (pt, y, re) => {
      const ps = await politiesAt(pt as [number, number], y);
      expect(ps.map((p) => p.n).join(' ')).toMatch(re);
      expect(ps.some((p) => p.n.startsWith('('))).toBe(false);
    });
  });

  describe('map scales', () => {
    it('settlement labels appear by recorded role: the most prominent first, the rest as you zoom in', () => {
      const label = LAYERS.find((l) => l.id === 'settlements')!.specs(ctx(100)).find((s) => s.type === 'symbol') as { layout: { 'text-size': unknown } };
      expect(evalAt(label.layout['text-size'], 5, { im: 4 })).toBeGreaterThan(0);
      expect(evalAt(label.layout['text-size'], 5, { im: 1 })).toBe(0);
      expect(evalAt(label.layout['text-size'], 10, { im: 1 })).toBeGreaterThan(0);
    });
    it('polity labels: large states at world scale, small ones only zoomed in', () => {
      const label = LAYERS.find((l) => l.id === 'kingdoms')!.specs(ctx(1300)).find((s) => s.type === 'symbol') as { layout: { 'text-size': unknown } };
      expect(evalAt(label.layout['text-size'], 2, { a: 900000 })).toBeGreaterThan(0);
      expect(evalAt(label.layout['text-size'], 4, { a: 10000 })).toBe(0);
      expect(evalAt(label.layout['text-size'], 6, { a: 10000 })).toBeGreaterThan(0);
    });
  });

  describe('historical map relevance', () => {
    const base: HistMap = { id: 'm', title: 'Plan of Springfield', date: { precision: 'year', preferred: 1850, earliest: 1850, latest: 1850 } as HistMap['date'], subjects: [], collection: 'loc', holder: 'LoC', page: '', rights: '' };
    it('a same-named place in another country ranks below one in the country on screen', () => {
      const here = { q: 'Springfield', from: 1800, to: 1900, hereCountries: ['republic of ireland'] };
      const elsewhere = relevance({ ...base, countries: ['united states'] }, here);
      const local = relevance({ ...base, countries: ['ireland'] }, here);
      expect(local.score).toBeGreaterThan(elsewhere.score);
      expect(elsewhere.why.join(' ')).toMatch(/another place/);
    });
    it('a building plan is flagged, not treated as a map of the area', () => {
      const plan = relevance({ ...base, georef: { annotation: '', imageService: '', width: 1, height: 1, gcps: [{ px: [0, 0], geo: [12.47, 41.89] }, { px: [1, 0], geo: [12.471, 41.89] }, { px: [0, 1], geo: [12.47, 41.891] }] } }, { bbox: [12, 41.5, 13, 42.3] });
      expect(plan.why.join(' ')).toMatch(/building or street plan/);
    });
  });
});
