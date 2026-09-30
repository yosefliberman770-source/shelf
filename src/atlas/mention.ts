// What kind of thing a name in the text is, and how much the text itself
// says that it is a place — before any database is asked.
//
// Lexical similarity is not evidence of a place. A capitalised word after
// "of" or "at" may be an institution ("the Guild"), a rite ("at Mass"), a
// title or a person. The rules here are general:
//   • cue strength: "siege of", "marched to", "the city of" say far more than "of" or "in";
//   • an ordinary English word (SCOWL list) standing alone after a weak cue is
//     not a place unless a historical dataset independently knows it;
//   • the cue and the name's form say what type of entity is expected
//     (settlement, polity, river, island, mountain, region);
//   • demonyms ("Aragonese", "Castilian") point to polities or regions;
//   • continents, oceans and seas are macro-regions, never a town or province
//     that happens to carry the same name.
import { atlasBase, pack, type Pos } from './data';
import { normName } from './gazetteer';
import type { HistYear } from './time';

export type EntityKind = 'settlement' | 'polity' | 'region' | 'continent' | 'sea' | 'river' | 'island' | 'mountain' | 'lake' | 'site' | 'unknown';
export type CueStrength = 'strong' | 'weak' | 'none';

export interface MentionEvidence {
  cue?: string;
  strength: CueStrength;
  /** The entity type the wording implies ("kingdom of X" → polity). */
  expected?: EntityKind;
  /** More than one capitalised word ("New Minster", "Bury St Edmunds"). */
  multiword: boolean;
  /** The lowercase form is an ordinary English word. Filled in by commonWord(). */
  commonWord?: boolean;
  demonym?: boolean;
}

// ── Cues ──────────────────────────────────────────────────────────────────

/** Strong cues mean the next name is a location or polity; weak ones only allow it. */
const STRONG: [RegExp, EntityKind | undefined][] = [
  [/\b(?:siege|walls|gates|city|town|village|port|harbour|harbor|fortress|citadel|bishop|archbishop|abbey|diocese|cathedral|sack|fall|capture|garrison) of$/i, 'settlement'],
  [/\b(?:kingdom|realm|crown|empire|duchy|county|earldom|principality|emirate|caliphate|sultanate|khanate|republic|marquisate|margraviate|lordship|king|queen|duke|duchess|earl|count|emperor|sultan|emir|caliph|prince|lord) of$/i, 'polity'],
  [/\b(?:province|region|land|lands|coast|shores|plains?|valley|borders?|frontier|march|marches) of$/i, 'region'],
  [/\b(?:island|isle|isles) of$/i, 'island'],
  [/\b(?:river|banks of the)$/i, 'river'],
  [/\b(?:mount|mountains? of)$/i, 'mountain'],
  [/\blake$/i, 'lake'],
  [/\bbattle of$/i, undefined],
  [/\b(?:marched|sailed|rode|fled|withdrew|retreated|returned|travelled|traveled|journeyed|advanced|landed|arrived|sent|exiled|banished|moved|went|came|set out|headed) (?:to|toward|towards|into|from|for|at|in|on)$/i, undefined],
  [/\b(?:besieged|conquered|captured|sacked|founded|invaded|occupied|garrisoned|fortified|reached|entered|crossed|annexed|razed|stormed|evacuated|colonised|colonized)$/i, undefined],
  [/\b(?:near|toward|towards|beyond|across|outside|north of|south of|east of|west of|between)$/i, undefined],
];
const WEAK = /\b(?:to|from|at|in|into|of|through|around|left|took|attacked|abandoned|on|by|for|with)$/i;

/** How strongly the words just before a name say it is a place, and of what kind. */
export function cueEvidence(before: string): { cue?: string; strength: CueStrength; expected?: EntityKind } {
  const b = before.replace(/\s+/g, ' ').trimEnd().replace(/\bthe$/i, '').trimEnd();
  for (const [re, kind] of STRONG) { const m = re.exec(b); if (m) return { cue: m[0], strength: 'strong', expected: kind }; }
  const w = WEAK.exec(b);
  return w ? { cue: w[0], strength: 'weak' } : { strength: 'none' };
}

/** Cue evidence for a name at a position in a passage (or the first time it appears). */
export function mentionEvidence(written: string, passage?: string, index?: number): MentionEvidence {
  const multiword = written.trim().split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).length > 1;
  let i = index;
  if (passage && (i === undefined || passage.slice(i, i + written.length) !== written)) i = passage.indexOf(written);
  const before = passage && i !== undefined && i >= 0 ? passage.slice(Math.max(0, i - 60), i) : '';
  const c = cueEvidence(before);
  return { ...c, multiword, demonym: DEMONYM.test(written) && !multiword };
}

// ── Ordinary English words ────────────────────────────────────────────────

let words: Set<string> | undefined;
let wordsP: Promise<Set<string>> | undefined;
/** Load the SCOWL lowercase word list (once; ~170 KB compressed). */
export function loadCommonWords(): Promise<Set<string>> {
  wordsP ??= fetch(`${atlasBase()}common-words.txt`).then((r) => (r.ok ? r.text() : '')).then((t) => (words = new Set(t.split('\n').filter(Boolean)))).catch(() => (words = new Set()));
  return wordsP;
}
/** Test-only: provide the word list directly. */
export function setCommonWords(list: Iterable<string>) { words = new Set(list); wordsP = Promise.resolve(words); }
/** Is this single word an ordinary English word? (undefined = list not loaded yet) */
export function isCommonWord(w: string): boolean | undefined {
  if (!words) return undefined;
  const k = w.toLowerCase().replace(/[’']s$/, '');
  return /^\p{L}+$/u.test(k) && words.has(k);
}

/**
 * Could this mention be a place, on the text's evidence alone? Known names
 * (from the reader's atlas/X-Ray) and strong cues always pass. A single
 * ordinary English word after a weak cue passes only if a historical dataset
 * independently knows the name (`knownOffline`).
 */
export function plausibleMention(m: MentionEvidence, written: string, knownOffline: boolean): { ok: boolean; reason?: string } {
  if (m.strength === 'strong' || m.multiword || knownOffline) return { ok: true };
  const common = m.commonWord ?? isCommonWord(written.split(/\s+/)[0]);
  if (common) return { ok: false, reason: `“${written}” is also an ordinary English word, and nothing in the sentence says it is a place (${m.cue ? `“${m.cue}” alone` : 'no place wording'} isn’t enough), so it wasn’t looked up.` };
  return { ok: true };
}

// ── Continents, oceans and seas ───────────────────────────────────────────
// Macro-geography: names that denote a continent or a body of water. They
// are regions, not places; they never resolve to a settlement or province
// that happens to share the name.

export interface MacroRegion { name: string; kind: 'continent' | 'sea' | 'region'; center: Pos; bbox: [number, number, number, number]; aliases?: string[] }
export const MACRO: MacroRegion[] = [
  { name: 'Europe', kind: 'continent', center: [15, 50], bbox: [-25, 34, 45, 72] },
  { name: 'Asia', kind: 'continent', center: [90, 40], bbox: [26, -11, 180, 78] },
  { name: 'Africa', kind: 'continent', center: [20, 3], bbox: [-18, -35, 52, 38] },
  { name: 'North America', kind: 'continent', center: [-100, 45], bbox: [-170, 7, -50, 84] },
  { name: 'South America', kind: 'continent', center: [-60, -15], bbox: [-82, -56, -34, 13] },
  { name: 'America', kind: 'continent', center: [-85, 15], bbox: [-170, -56, -34, 84], aliases: ['the Americas', 'Americas', 'New World'] },
  { name: 'Australia', kind: 'continent', center: [134, -25], bbox: [112, -44, 154, -10] },
  { name: 'Antarctica', kind: 'continent', center: [0, -80], bbox: [-180, -90, 180, -60] },
  { name: 'Mediterranean Sea', kind: 'sea', center: [18, 36], bbox: [-6, 30, 36, 46], aliases: ['Mediterranean', 'the Mediterranean'] },
  { name: 'Black Sea', kind: 'sea', center: [34, 43], bbox: [27, 40.5, 42, 47] },
  { name: 'Red Sea', kind: 'sea', center: [38, 21], bbox: [32, 12, 44, 30] },
  { name: 'Caspian Sea', kind: 'sea', center: [51, 42], bbox: [46, 36, 55, 47] },
  { name: 'Baltic Sea', kind: 'sea', center: [19, 58], bbox: [9, 53, 30, 66], aliases: ['Baltic', 'the Baltic'] },
  { name: 'North Sea', kind: 'sea', center: [3, 56], bbox: [-4, 51, 10, 61] },
  { name: 'Adriatic Sea', kind: 'sea', center: [16, 43], bbox: [12, 39.5, 20, 46], aliases: ['Adriatic', 'the Adriatic'] },
  { name: 'Aegean Sea', kind: 'sea', center: [25, 39], bbox: [22, 35, 28, 41], aliases: ['Aegean', 'the Aegean'] },
  { name: 'Ionian Sea', kind: 'sea', center: [19, 38], bbox: [15, 36, 22, 40.5] },
  { name: 'Tyrrhenian Sea', kind: 'sea', center: [12, 40], bbox: [9, 37.5, 16, 43] },
  { name: 'English Channel', kind: 'sea', center: [-2, 50], bbox: [-6, 48.5, 2, 51.2], aliases: ['the Channel', 'La Manche'] },
  { name: 'Irish Sea', kind: 'sea', center: [-5, 53.8], bbox: [-6.5, 51.8, -2.8, 55] },
  { name: 'Persian Gulf', kind: 'sea', center: [51, 27], bbox: [47.5, 23.5, 56.5, 30.5] },
  { name: 'Arabian Sea', kind: 'sea', center: [65, 15], bbox: [50, 5, 77, 25] },
  { name: 'Atlantic Ocean', kind: 'sea', center: [-30, 20], bbox: [-80, -60, 20, 70], aliases: ['Atlantic', 'the Atlantic'] },
  { name: 'Pacific Ocean', kind: 'sea', center: [-160, 0], bbox: [120, -60, -70, 60], aliases: ['Pacific', 'the Pacific'] },
  { name: 'Indian Ocean', kind: 'sea', center: [75, -15], bbox: [20, -60, 120, 25] },
  { name: 'Arctic Ocean', kind: 'sea', center: [0, 85], bbox: [-180, 66, 180, 90] },
];
const macroByName = new Map<string, MacroRegion>();
for (const m of MACRO) for (const n of [m.name, ...(m.aliases ?? [])]) macroByName.set(normName(n), m);
export const macroRegion = (written: string) => macroByName.get(normName(written));

// ── Polities (Cliopatria) and demonyms ────────────────────────────────────

export interface PolityName { n: string; f: HistYear; t: HistYear; q?: string; x?: number; y?: number; m?: string }
/** Words that name a political form, not a polity ("Kingdom of Aragon" → Aragon). */
const FORM = '(?:grand |great |holy |united |old |new |late |early |second |first |third )?(?:kingdom|kingdoms|crown|county|duchy|grand duchy|empire|republic|principality|emirate|caliphate|sultanate|khanate|khaganate|tsardom|despotate|margraviate|march|lordship|earldom|electorate|state|states|city-states|confederation|confederacy|league|dominion|colony|protectorate|viceroyalty|governorate|bishopric|archbishopric|prince-bishopric|theme|satrapy|province|dynasty|realm|commonwealth|territory|federation)';
const LEAD = new RegExp(`^(?:the )?${FORM}(?: of(?: the)?)? `);
const TRAIL = new RegExp(` ${FORM}$`);
/** The core name of a polity: "(Kingdom of Aragon)" → "aragon", "Byzantine Empire" → "byzantine". */
export function polityCore(name: string): string {
  let s = normName(name.replace(/^\(|\)$/g, ''));
  for (let i = 0; i < 2; i++) s = s.replace(LEAD, '').replace(TRAIL, '').trim();
  return s;
}

let polP: Promise<(PolityName & { core: string })[]> | undefined;
export function polityIndex(): Promise<(PolityName & { core: string })[]> {
  polP ??= pack<PolityName[]>('cliopatria/names.json').then((xs) => xs.map((x) => ({ ...x, core: polityCore(x.n) }))).catch(() => { polP = undefined; return []; });
  return polP;
}

/** Adjectival/demonym endings. */
const DEMONYM = /^\p{Lu}\p{Ll}+(?:ese|ian|ean|ans?|ish|ine|ite|ic|i)$/u;
const SUFFIXES = ['ese', 'ian', 'ean', 'ans', 'an', 'ish', 'ine', 'ite', 'ic', 'i'];
/** Does this adjective plausibly derive from that core name? (shared stem of ≥ 5 letters covering most of both) */
function stemMatches(adj: string, core: string): boolean {
  const a = normName(adj);
  if (core.includes(' ') || core.length < 4) return false;
  for (const suf of SUFFIXES) {
    if (!a.endsWith(suf)) continue;
    const stem = a.slice(0, -suf.length);
    if (stem.length < 4) continue;
    let n = 0;
    while (n < stem.length && n < core.length && stem[n] === core[n]) n++;
    if (n >= 5 && n >= 0.75 * Math.min(stem.length, core.length)) return true;
    if (n === stem.length && n >= 4 && core.length - n <= 2) return true;
  }
  return false;
}

export interface PolityMatch { polity: PolityName & { core: string }; via: 'name' | 'demonym'; fit: 'within' | 'near' | 'outside' | 'undated-year' }

/**
 * Polities a name (or demonym) refers to, best first: those existing at the
 * year first; if none exists then, the nearest in time (marked "outside").
 */
export async function matchPolity(written: string, year?: HistYear): Promise<PolityMatch[]> {
  const idx = await polityIndex();
  const k = polityCore(written);
  if (k.length < 3) return [];
  let hits: { p: PolityName & { core: string }; via: 'name' | 'demonym' }[] = idx.filter((p) => p.core === k || normName(p.n.replace(/^\(|\)$/g, '')) === normName(written)).map((p) => ({ p, via: 'name' as const }));
  if (!hits.length && DEMONYM.test(written.trim())) hits = idx.filter((p) => stemMatches(written.trim(), p.core)).map((p) => ({ p, via: 'demonym' as const }));
  const fit = (p: PolityName): PolityMatch['fit'] => (year === undefined ? 'undated-year' : p.f <= year && year <= p.t ? 'within' : p.f - 50 <= year && year <= p.t + 50 ? 'near' : 'outside');
  const gap = (p: PolityName) => (year === undefined ? 0 : year < p.f ? p.f - year : year > p.t ? year - p.t : 0);
  const rank = { within: 0, near: 1, 'undated-year': 2, outside: 3 } as const;
  return hits.map(({ p, via }) => ({ polity: p, via, fit: fit(p) }))
    // Prefer members over the collections that contain them, then the smallest gap in time.
    .sort((a, b) => rank[a.fit] - rank[b.fit] || Number(a.polity.n.startsWith('(')) - Number(b.polity.n.startsWith('(')) || gap(a.polity) - gap(b.polity) || (b.polity.t - b.polity.f) - (a.polity.t - a.polity.f));
}
