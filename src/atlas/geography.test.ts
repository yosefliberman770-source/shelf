// The historical-geography rules, tested as rules: each case below is chosen
// to be *different* from the examples that exposed the problems (Exeter,
// Europe, "mass", Bethlehem, Guild, Aragonese…), so passing them means the
// general mechanism works, not that a list of known cases was patched.
// Runs against the real offline data packs in public/.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { detectPlaces, screenMentions } from '../lib/history/placeDetect';
import { hasSpellingEvidence } from '../lib/history/assess';
import type { PlaceCandidate } from '../lib/history/types';
import { relevance, type HistMap } from '../world/maps';
import { politiesAt } from './context';
import { matchName, type GazPlace } from './gazetteer';
import { isCommonWord, loadCommonWords, macroRegion, matchPolity, mentionEvidence, plausibleMention } from './mention';
import { hasRtl, isolate, joinNames, nameRoles } from './names';
import { resolvePlace } from './resolve';
import { timeFit } from './time';

const PUB = join(__dirname, '../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const rel = String(input).replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
beforeAll(async () => { await loadCommonWords(); });
const offline = (w: string, year?: number) => resolvePlace(w, { year, detection: 'cue', online: false });

describe('is it a place at all? (text evidence before any lookup)', () => {
  it('knows ordinary English words from the word list, not from a hand-made list', () => {
    for (const w of ['mill', 'bank', 'church', 'reading', 'bath']) expect(isCommonWord(w)).toBe(true);
    for (const w of ['tewkesbury', 'carthage', 'lübeck']) expect(isCommonWord(w)).toBe(false);
  });
  it('a capitalised ordinary word after a weak cue ("to", "at") is not looked up', () => {
    for (const [w, passage] of [['Mill', 'She went down to Mill before noon.'], ['Bank', 'He waited at Bank for hours.'], ['Church', 'They came from Church together.']]) {
      expect(plausibleMention(mentionEvidence(w, passage), w, false).ok).toBe(false);
    }
  });
  it('a movement verb alone doesn’t make an ordinary word a place, but does for an unusual name', () => {
    expect(plausibleMention(mentionEvidence('Chapel', 'they went to Chapel on Sunday'), 'Chapel', false).ok).toBe(false);
    expect(plausibleMention(mentionEvidence('Tewkesbury', 'the army marched to Tewkesbury'), 'Tewkesbury', false).ok).toBe(true);
    expect(plausibleMention(mentionEvidence('Mill', 'the siege of Mill'), 'Mill', false).ok).toBe(true); // a place-type cue is enough
  });
  it('the same kind of word is accepted when the wording says it is a place, or a dataset knows it', () => {
    expect(plausibleMention(mentionEvidence('Bath', 'the city of Bath was full'), 'Bath', false).ok).toBe(true);
    expect(mentionEvidence('Bath', 'the city of Bath').expected).toBe('settlement');
    expect(plausibleMention(mentionEvidence('Reading', 'the abbey of Reading'), 'Reading', false).ok).toBe(true);
    expect(plausibleMention(mentionEvidence('Mill', 'went to Mill'), 'Mill', true).ok).toBe(true); // known offline
    expect(plausibleMention(mentionEvidence('New Forest', 'rode into New Forest'), 'New Forest', false).ok).toBe(true); // two capitalised words
  });
  it('screens detected names: keeps places and demonyms with a polity, drops ordinary words', async () => {
    const text = 'In 1402 the Castilian ships left Seville. Later they sailed to Carthage, and he went to Mill again.';
    const kept = (await screenMentions(detectPlaces(text), 1402)).map((m) => m.name);
    expect(kept).toContain('Carthage');
    expect(kept).toContain('Castilian');
    expect(kept).not.toContain('Mill');
  });
});

describe('demonyms and polities', () => {
  it.each([
    ['Castilian', 1400, /Castile/],
    ['Frankish', 800, /Franks/],
    ['Norman', 1000, /Normandy/],
  ])('%s (%i) → a polity existing then', async (w, y, re) => {
    const [m] = await matchPolity(w, y);
    expect(m?.polity.n).toMatch(re);
    expect(m?.fit).toBe('within');
  });
  it('an adjective with no polity behind it is not turned into a town', async () => {
    const r = await resolvePlace('Martian', { year: 1400, detection: 'cue', online: false, mention: { strength: 'none', multiword: false, demonym: true } });
    expect(r.status).toBe('UNRESOLVED');
    expect(r.place).toBeUndefined();
  });
  it('a polity is not placed at a date when it did not exist', async () => {
    // "Kingdom of Portugal"-type states are only candidates outside their dates; nothing is placed for 300 BCE.
    const r = await offline('Portugal', -300);
    expect(r.place?.kind === 'polity' && r.status !== 'LOW').toBe(false);
  });
});

describe('continents, seas and lands are regions, not towns that share the name', () => {
  it.each(['Adriatic', 'Atlantic', 'Balkans', 'Anatolia', 'Scandinavia'])('%s → a region', async (w) => {
    const r = await offline(w, 1200);
    expect(r.status).toBe('HIGH');
    expect(r.place?.key).toMatch(/^macro:/);
    expect(macroRegion(w)).toBeDefined();
  });
  it('a land name at an ancient date is the land, not the later state', async () => {
    const r = await offline('Greece', -400);
    expect(r.place?.kind).toBe('region');
    expect(r.candidates.some((c) => c.kind === 'polity')).toBe(false); // no modern Greek state in 400 BCE
  });
  it('a period province of the same name is offered as another reading (not silently chosen)', async () => {
    const r = await offline('Asia', -100);
    expect(r.place?.kind).toBe('continent');
    expect(r.candidates.map((c) => c.recordTitle ?? c.title)).toContain('Asia (Roman province)');
  });
});

describe('names: which name is shown, and why', () => {
  it('shows the book’s wording when the record lists it, and keeps the record’s own title', async () => {
    const p = (await matchName('Constantinople', 400)).place as GazPlace;
    const roles = nameRoles(p, 'Constantinople', 400);
    expect(roles.display).toBe('Constantinople');
    expect(roles.rule).toBe('as-written');
    expect(roles.recordTitle).toBe('Constantinopolis');
  });
  it('says when the written name is a modern one for an ancient place', async () => {
    expect((await matchName('Constantinople', -500)).reason).toMatch(/modern name/);
  });
  it('isolates right-to-left and other non-Latin names without changing them', () => {
    const arabic = 'القاهرة';
    const hebrew = 'ירושלים';
    expect(hasRtl(arabic) && hasRtl(hebrew)).toBe(true);
    expect(isolate(arabic)).toBe(`⁨${arabic}⁩`);
    expect(isolate('Lutetia')).toBe('Lutetia');
    expect(joinNames(['Hierosolyma', hebrew])).toBe(`Hierosolyma · ⁨${hebrew}⁩`);
  });
});

describe('time', () => {
  it('an undated record is "undated", not "always"', () => {
    expect(timeFit({}, 100)).toBe('undated');
    expect(timeFit({ from: 1300 }, 100)).toBe('later');
    expect(timeFit({ to: -500 }, 100)).toBe('earlier');
  });
  it('a town recorded only in a later period is not found for an earlier date', async () => {
    expect((await matchName('Lübeck', 100)).status).toBe('none');
    expect((await matchName('Lübeck', 1400)).status).toBe('unique');
  });
});

describe('the book’s geography decides between places sharing a name', () => {
  it('the same name resolves differently in different books', async () => {
    const italy = await matchName('Rome', undefined, { context: { points: [[12.3, 41.8]], from: ['test'] } });
    const mecklenburg = await matchName('Rome', undefined, { context: { points: [[11.4, 53.6]], from: ['test'] } });
    expect(italy.place?.gazetteer).toBe('pleiades');
    expect(mecklenburg.place?.gazetteer).toBe('viabundus');
    expect((await matchName('Rome')).status).toBe('ambiguous'); // and without context, it isn't guessed
  });
  it('an undated record in its dataset’s period is confirmed only when the book’s other places agree', async () => {
    const alone = await resolvePlace('Rome', { year: -218, detection: 'cue', online: false });
    const withBook = await resolvePlace('Rome', { year: -218, detection: 'cue', online: false, nearby: ['Carthage', 'Capua', 'Cannae'] });
    expect(alone.status).toBe('MEDIUM');
    expect(withBook.status).toBe('HIGH');
  });
});

describe('spelling evidence', () => {
  const cand = (canonicalName: string, alternativeNames: string[] = []): PlaceCandidate => ({ place: { id: 'x', canonicalName, alternativeNames, source: 'test', countryCodes: [] } as unknown as PlaceCandidate['place'] });
  it('a prefix or an abbreviation is not evidence that a name matches', () => {
    expect(hasSpellingEvidence(cand('Guilderland'), 'Guild')).toBe(false);
    expect(hasSpellingEvidence(cand('Bathurst'), 'Bath')).toBe(false);
    expect(hasSpellingEvidence(cand('Pennsylvania', ['Penn.', 'PA']), 'Penn')).toBe(false);
    expect(hasSpellingEvidence(cand('Bath', ['Aquae Sulis']), 'Aquae Sulis')).toBe(true);
  });
});

describe('political geography', () => {
  it('reports a polity with the grouping it belongs to, not the grouping as a rival', async () => {
    const ps = await politiesAt([-1.3, 51.06], 900); // Winchester
    expect(ps.map((p) => p.n)).toContain('Kingdom of Wessex');
    expect(ps.some((p) => p.n.startsWith('('))).toBe(false);
    expect(ps.find((p) => p.n === 'Kingdom of Wessex')?.partOf).toContain('Anglo-Saxon England');
  });
  it('flags overlapping claims as contested and detached pieces as outlying', async () => {
    const ps = await politiesAt([-0.43, 53.87], 1100); // East Yorkshire
    expect(ps.length).toBeGreaterThan(1);
    const outlying = ps.find((p) => p.op);
    expect(outlying).toBeDefined();
    expect(ps.every((p) => !!p.x)).toBe(true);
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
