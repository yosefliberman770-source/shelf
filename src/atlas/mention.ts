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
import { politiesAt } from './context';
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
  /** The cue is a movement or direction ("went to", "near"): strong for an unusual name, not for an ordinary word ("went to Mass"). */
  loose?: boolean;
  /** Written with a possessive ("Edward’s camp"): may be a person's; kept only when a gazetteer knows the name as a place. */
  possessive?: boolean;
}

// ── Cues ──────────────────────────────────────────────────────────────────

/** Strong cues mean the next name is a location or polity; weak ones only allow it. */
const STRONG: [RegExp, EntityKind | undefined, 'loose'?][] = [
  [/\b(?:siege|walls|gates|city|town|village|port|harbour|harbor|fortress|citadel|bishop|archbishop|abbey|diocese|cathedral|sack|fall|capture|garrison) of$/i, 'settlement'],
  [/\b(?:kingdom|realm|crown|empire|duchy|county|earldom|principality|emirate|caliphate|sultanate|khanate|republic|marquisate|margraviate|lordship|king|queen|duke|duchess|earl|count|emperor|sultan|emir|caliph|prince|lord) of$/i, 'polity'],
  [/\b(?:province|region|land|lands|coast|shores|plains?|valley|borders?|frontier|march|marches) of$/i, 'region'],
  [/\b(?:island|isle|isles) of$/i, 'island'],
  [/\b(?:river|banks of the)$/i, 'river'],
  [/\b(?:mount|mountains? of)$/i, 'mountain'],
  [/\blake$/i, 'lake'],
  [/\bbattle of$/i, undefined],
  [/\b(?:marched|sailed|rode|fled|withdrew|retreated|returned|travelled|traveled|journeyed|advanced|landed|arrived|sent|exiled|banished|moved|went|came|set out|headed) (?:to|toward|towards|into|from|for|at|in|on)$/i, undefined, 'loose'],
  [/\b(?:besieged|conquered|captured|sacked|founded|invaded|occupied|garrisoned|fortified|reached|entered|crossed|annexed|razed|stormed|evacuated|colonised|colonized)$/i, undefined],
  [/\b(?:near|toward|towards|beyond|across|outside|north of|south of|east of|west of|between)$/i, undefined, 'loose'],
];
const WEAK = /\b(?:to|from|at|in|into|of|through|around|left|took|attacked|abandoned|on|by|for|with)$/i;

/** How strongly the words just before a name say it is a place, and of what kind. */
export function cueEvidence(before: string): { cue?: string; strength: CueStrength; expected?: EntityKind; loose?: boolean } {
  const b = before.replace(/\s+/g, ' ').trimEnd().replace(/\bthe$/i, '').trimEnd();
  for (const [re, kind, loose] of STRONG) { const m = re.exec(b); if (m) return { cue: m[0], strength: 'strong', expected: kind, ...(loose ? { loose: true } : {}) }; }
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
  // An adjective of place/people only where the text uses it as one: before a lower-case word ("Norman lords"), not
  // after a place cue ("rode to Norwich", "to Munich") and not an ordinary English word ("the Church") — so towns ending
  // in -ich, -i, -ic, -an are names, not adjectives (A12-001, A17-004).
  const after = passage && i !== undefined && i >= 0 ? passage.slice(i + written.length, i + written.length + 24) : '';
  const placeCue = c.strength === 'strong' || /^(?:to|from|at|in|into|near|towards?|through|across)$/i.test(c.cue ?? '');
  const demonym = DEMONYM.test(written) && !multiword && !placeCue && isCommonWord(written) !== true && (!passage || /^\s+\p{Ll}/u.test(after));
  return { ...c, multiword, demonym };
}

// ── Ordinary English words ────────────────────────────────────────────────

let words: Set<string> | undefined;
let wordsP: Promise<Set<string>> | undefined;
/** Load the SCOWL lowercase word list (once; ~170 KB compressed). */
export function loadCommonWords(): Promise<Set<string>> {
  // A failed load is not remembered as "no ordinary words" (which would switch the screen off): the list stays
  // unknown (isCommonWord → undefined) and the next call tries again.
  wordsP ??= fetch(`${atlasBase()}common-words.txt`).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.text(); })
    .then((t) => (words = new Set(t.split('\n').filter(Boolean))))
    .catch(() => { wordsP = undefined; return new Set<string>(); });
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
  if (m.multiword || knownOffline) return { ok: true };
  const common = m.commonWord ?? isCommonWord(written.split(/\s+/)[0]);
  if (m.strength === 'strong' && !(m.loose && common)) return { ok: true };
  if (common) return { ok: false, reason: `“${written}” is also an ordinary English word, and nothing in the sentence says it is a place (${m.cue ? `“${m.cue}” alone` : 'no place wording'} isn’t enough), so it wasn’t looked up.` };
  return { ok: true };
}

// ── Continents, oceans, seas and geographic lands ─────────────────────────
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
  // Lands: geographic names older than (and independent of) any state that
  // later took them. "Italy" in a book about Rome is the peninsula, not the
  // Kingdom or Republic of Italy; the states are offered separately when
  // they existed at the date being read about.
  { name: 'Italy', kind: 'region', center: [12.8, 42.5], bbox: [6.6, 36.6, 18.6, 47.1], aliases: ['Italia', 'Italian peninsula'] },
  { name: 'Greece', kind: 'region', center: [22.5, 39], bbox: [19.3, 34.8, 26.6, 41.8], aliases: ['Hellas'] },
  { name: 'Iberia', kind: 'region', center: [-4, 40], bbox: [-9.6, 36, 3.3, 43.8], aliases: ['Iberian Peninsula', 'Hispania'] },
  { name: 'Gaul', kind: 'region', center: [2.5, 46.5], bbox: [-4.8, 42.3, 8.3, 51.1], aliases: ['Gallia'] },
  { name: 'Britain', kind: 'region', center: [-2.5, 54], bbox: [-6.4, 49.9, 1.8, 58.7], aliases: ['Great Britain', 'Britannia'] },
  { name: 'Anatolia', kind: 'region', center: [32.5, 39], bbox: [26, 36, 41, 42], aliases: ['Asia Minor'] },
  { name: 'Mesopotamia', kind: 'region', center: [44, 33.5], bbox: [38.5, 29.5, 48.5, 37.5] },
  { name: 'Levant', kind: 'region', center: [36, 33], bbox: [34, 29.5, 39, 37], aliases: ['the Levant'] },
  { name: 'Arabia', kind: 'region', center: [45, 23], bbox: [34.5, 12.5, 59.8, 32], aliases: ['Arabian Peninsula'] },
  { name: 'Scandinavia', kind: 'region', center: [15, 62], bbox: [4.5, 54.5, 31, 71.2] },
  { name: 'Balkans', kind: 'region', center: [21.5, 43], bbox: [13.5, 36.5, 29.5, 46.5], aliases: ['the Balkans', 'Balkan Peninsula'] },
  { name: 'Caucasus', kind: 'region', center: [44, 42.5], bbox: [37, 38.8, 50, 45.5], aliases: ['the Caucasus'] },
  { name: 'Maghreb', kind: 'region', center: [3, 32], bbox: [-17, 20, 11.6, 37.5], aliases: ['the Maghreb', 'North Africa'] },
  { name: 'Sahara', kind: 'region', center: [10, 23], bbox: [-17, 15, 33, 31], aliases: ['the Sahara'] },
];
const macroByName = new Map<string, MacroRegion>();
for (const m of MACRO) for (const n of [m.name, ...(m.aliases ?? [])]) macroByName.set(normName(n), m);
export const macroRegion = (written: string) => macroByName.get(normName(written));

// ── Polities (Cliopatria) and demonyms ────────────────────────────────────

export interface PolityName {
  n: string; f: HistYear; t: HistYear; q?: string; x?: number; y?: number; m?: string; g?: 1;
  /** English aliases Wikidata records for the polity ("Venetian Republic", "Byzantium"). */ al?: string[];
  /** Demonyms Wikidata records for it (P1549: "Venetian", "English"). */ dm?: string[];
  /** Its everyday English name when `n` is a formal title. */ cn?: string;
  /** The spans it really has an outline, when there is a gap between them (A16-004): f–t alone would bridge it. */ s?: [HistYear, HistYear][];
  /** Cliopatria's label point per period [from, to, lon, lat], so the point follows the polity at the date (A12-006). */ sp?: [HistYear, HistYear, number, number][];
  /** Its Wikidata id is shared with another polity and may not be its own: no aliases, demonyms or link come from it (ID-1, PA-006). */ qx?: 1;
}
/** Did the polity have an outline in that year? Its first and last years alone can bridge centuries with none. */
export const polityAlive = (p: Pick<PolityName, 'f' | 't' | 's'>, year: HistYear) => p.f <= year && year <= p.t && (!p.s || p.s.some(([f, t]) => f <= year && year <= t));
/** Years from the date to the nearest period the polity has an outline (0 when it has one then). */
export function polityGap(p: Pick<PolityName, 'f' | 't' | 's'>, year: HistYear): number {
  if (polityAlive(p, year)) return 0;
  return Math.min(...(p.s ?? [[p.f, p.t]]).map(([f, t]) => (year < f ? f - year : year > t ? year - t : 0)));
}
/** Where the polity's label sits at that date (the nearest period's label when it has none then). */
export function polityLabelAt(p: Pick<PolityName, 'x' | 'y' | 'sp'>, year?: HistYear): [number, number] | undefined {
  if (p.sp?.length && year !== undefined) {
    const e = p.sp.find(([f, t]) => f <= year && year <= t) ?? [...p.sp].sort((a, b) => Math.min(Math.abs(a[0] - year), Math.abs(a[1] - year)) - Math.min(Math.abs(b[0] - year), Math.abs(b[1] - year)))[0];
    return [e[2], e[3]];
  }
  return p.x !== undefined && p.y !== undefined ? [p.x, p.y] : undefined;
}
/** Words that name a political form, not a polity ("Kingdom of Aragon" → Aragon). */
const FORM = '(?:grand |great |holy |united |old |new |late |early |second |first |third )?(?:kingdom|kingdoms|crown|county|duchy|grand duchy|empire|republic|principality|emirate|caliphate|sultanate|khanate|khaganate|tsardom|despotate|margraviate|march|lordship|earldom|electorate|state|states|city-states|confederation|confederacy|league|dominion|colony|protectorate|viceroyalty|governorate|bishopric|archbishopric|prince-bishopric|theme|satrapy|province|dynasty|realm|commonwealth|territory|federation)';
const LEAD = new RegExp(`^(?:the )?${FORM}(?: of(?: the)?)? `);
const TRAIL = new RegExp(` ${FORM}$`);
const MODIFIER = /^(?:grand|great|holy|united|old|new|late|early|second|first|third)$/;
/** The core name of a polity: "(Kingdom of Aragon)" → "aragon", "Byzantine Empire" → "byzantine". */
export function polityCore(name: string): string {
  const whole = normName(name.replace(/^\(|\)$/g, ''));
  let s = whole;
  for (let i = 0; i < 2; i++) s = s.replace(LEAD, '').replace(TRAIL, '').trim();
  // Only a modifier of the form is left ("United Kingdom" → "united", "Holy Roman Empire" → "holy roman"
  // is fine): that names nothing, so the whole name is the core — "United Kingdom" is not "United States" (A16-002).
  return MODIFIER.test(s) ? whole : s;
}

let polP: Promise<(PolityName & { core: string })[]> | undefined;
export function polityIndex(): Promise<(PolityName & { core: string })[]> {
  polP ??= pack<PolityName[]>('cliopatria/names.json').then((xs) => xs.map((x) => ({ ...x, core: polityCore(x.n) }))).catch(() => { polP = undefined; return []; });
  return polP;
}

/** Adjectival/demonym endings. */
const DEMONYM = /^\p{Lu}\p{Ll}+(?:ese|ian|ean|ans?|ish|ine|ite|ic|i|ch)$/u;
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
    // Most of both: "Franciscans" shares only "franc" with France and is not French (A12-015).
    if (n >= 5 && n >= 0.75 * Math.max(stem.length, core.length)) return true;
    // "Norman" → Normandy, "German" → Germany: the whole stem, plus a short ending on the name.
    if (n === stem.length && n >= 4 && core.length - n <= 4) return true;
  }
  return false;
}

/**
 * How the words found the polity, strongest first: its own name; an alias
 * Wikidata records; a demonym Wikidata records; an adjective derived from the
 * name by its spelling (the weakest — used only when nothing recorded matches).
 */
export type PolityVia = 'name' | 'alias' | 'demonym' | 'stem';
export interface PolityMatch { polity: PolityName & { core: string }; via: PolityVia; fit: 'within' | 'near' | 'outside' | 'undated-year'; /** The book's other places lie inside its territory at the date. */ holdsBook?: boolean }
export const viaDemonym = (v: PolityVia) => v === 'demonym' || v === 'stem';

/**
 * Polities a name, alias or adjective refers to, best first. The same word can
 * mean different polities at different dates ("Roman" in 100 BCE and 1100 CE)
 * and in different books, so the order is: existing at the year; how strongly
 * the words match; members before the groupings that contain them; whose
 * territory at that date contains the places the book already mentions (only
 * when the date is known — a label point's distance says nothing); nearest in time.
 */
export async function matchPolity(written: string, year?: HistYear, opts: { context?: { points: [number, number][] } } = {}): Promise<PolityMatch[]> {
  const idx = await polityIndex();
  const w = normName(written.replace(/[’']s$/, ''));
  const k = polityCore(written);
  if (k.length < 3) return [];
  const commonWord = !/\s/.test(written.trim().replace(/^the\s+/i, '')) && isCommonWord(written.trim().replace(/^the\s+/i, '')) === true;
  const via = (p: PolityName & { core: string }): PolityVia | undefined => {
    if (p.core === k || normName(p.n.replace(/^\(|\)$/g, '')) === w) return 'name';
    if (p.cn && normName(p.cn) === w) return 'alias';
    // An ordinary English word is not a polity by alias or demonym alone: "the Church" is not the Papal States (A12-015).
    if (commonWord) return undefined;
    if (p.al?.some((a) => normName(a) === w || polityCore(a) === k)) return 'alias';
    if (p.dm?.some((d) => normName(d) === w)) return 'demonym';
    return undefined;
  };
  // Every route is collected, so the date decides first: "Hungarian" in 1400 is the Kingdom of Hungary
  // (by spelling) rather than the later Hungarian Republic (by name).
  const isAdj = DEMONYM.test(written.trim()) && !commonWord;
  const hits = idx.map((p) => ({ p, via: via(p) ?? (isAdj && stemMatches(written.trim(), p.core) ? 'stem' as const : undefined) }))
    .filter((h): h is { p: PolityName & { core: string }; via: PolityVia } => !!h.via);
  // 'within' only when the polity has an outline in that year — not merely between its first and last years (A16-004).
  // 'near' (within 50 years of one) is a date mismatch to say, never a match (A16-003).
  const fit = (p: PolityName): PolityMatch['fit'] => (year === undefined ? 'undated-year' : polityAlive(p, year) ? 'within' : polityGap(p, year) <= 50 ? 'near' : 'outside');
  const gap = (p: PolityName) => (year === undefined ? 0 : polityGap(p, year));
  // Which polities' territory holds the book's places at this date (from the Cliopatria outlines).
  const pts = year !== undefined ? (opts.context?.points ?? []).slice(0, 12) : [];
  // With the usual 20 km edge allowance: simplified outlines put coastal cities (Constantinople) just outside their own state.
  const holding = new Set((await Promise.all(pts.map((pt) => politiesAt(pt, year!).catch(() => [])))).flat().flatMap((p) => [p.n, ...(p.m ? p.m.split(';') : [])]));
  const rank = { within: 0, near: 1, 'undated-year': 2, outside: 3 } as const;
  const vrank = { name: 0, alias: 1, demonym: 2, stem: 3 } as const;
  return hits.map(({ p, via: v }) => ({ polity: p, via: v, fit: fit(p), holdsBook: holding.size ? holding.has(p.n) : undefined }))
    .sort((a, b) => rank[a.fit] - rank[b.fit] || vrank[a.via] - vrank[b.via] || Number(a.polity.n.startsWith('(')) - Number(b.polity.n.startsWith('('))
      || Number(!a.holdsBook) - Number(!b.holdsBook) || gap(a.polity) - gap(b.polity) || (b.polity.t - b.polity.f) - (a.polity.t - a.polity.f));
}
