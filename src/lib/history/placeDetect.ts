// Finding place names in the text being read — conservatively. Only names
// that are already known places (your Knowledge Atlas, X-Ray) or that read
// like places ("marched to Capua", "the siege of Carthage") are offered, so
// ordinary capitalised words aren't turned into map links.
import { notAPlace, placesByName } from '../../atlas/gazetteer';
import { isCommonWord, loadCommonWords, macroRegion, matchPolity, type MentionEvidence, mentionEvidence, plausibleMention } from '../../atlas/mention';
import type { Item } from '../../db/types';
import { findDatesInText, nearestDate } from './dates';

export interface PlaceMention {
  name: string;
  count: number;
  index: number;
  known: boolean;
  /** What the words around the (first strongest) occurrence say: cue strength, expected type, demonym. */
  evidence: MentionEvidence;
}

/** One capitalised word of a name, in any alphabet's capitals ("Łódź", "Örebro", "Île") (A17-008). */
const WORD = String.raw`\p{Lu}[\p{Ll}\p{Lu}'’-]*\p{Ll}[\p{Ll}'’-]*|\p{Lu}\p{Ll}`;
/** A name: optionally "St", "Saint", "San"… or "The" before it ("St Albans", "The Hague"), up to four words. */
const NAME = String.raw`(?:(?:St\.?|Ste\.?|Saint|Sainte|San|Santa|Santo|São|The)\s+)?(?:${WORD})(?:\s+(?:${WORD}|(?:de|del|la|le|of|on|upon|am|an)(?!\p{L}))){0,3}`;
const PLACE_CUE = new RegExp(String.raw`\b(?:to|from|at|in|near|toward|towards|into|of|across|through|beyond|around|reached|besieged|entered|left|crossed|captured|took|sacked|founded|conquered|invaded|attacked|abandoned|occupied|garrisoned|siege of|battle of|walls of|city of|port of|island of|kingdom of|province of|river|mount|lake)\s+(${NAME})`, 'gu');
/** The rest of a list after a cued name: ", Dijon and Troyes", " and Nagasaki" (A17-005, A12-011). */
const LIST_ITEM = new RegExp(String.raw`^(?:\s*,\s*(and\s+|or\s+)?|\s+(and|or)\s+)(${NAME})`, 'u');
/** What may follow the last item of a two-name list for it to be a list, not "…and John followed" (A20-005). */
const LIST_END = /^(?:\s*[.,;:)!?]|\s*$|\s+(?:in|on|at|with|during|before|after|where|which|were|was|had|to|from|for|until|by|that|the)\b)/u;
/** Words before a name that make it a person, not a place: "wrote to Henry", "a portrait of Matilda" (A20-007). */
const PERSON_BEFORE = /\b(?:wrote|writes|write|written|letter|letters|spoke|speak|said|say|says|told|tell|appealed|prayed|swore|pledged|married|turned|listened|replied|answered|complained|confessed|dedicated)\s+(?:to|unto)\s*$|\b(?:portrait|statue|son|daughter|wife|husband|widow|brother|sister|father|mother|heir|nephew|niece|servant|friend|death|life|reign|tomb|cousin|uncle|aunt|grandson|granddaughter|biography|letters)\s+of\s*$/i;
/** Adjectives that may name a polity or region ("the Aragonese fleet", "Castilian troops"), not at the start of a sentence. */
// An adjective of place/people used attributively ("the Venetian fleet", "Norman lords"). Which
// polity it names — if any — is decided from recorded data (screenMentions → matchPolity).
const DEMONYM_CUE = /(?<=[\p{Ll},;:]\s+(?:the\s+|an?\s+)?)(\p{Lu}\p{Ll}{2,}(?:ese|ian|ean|ish|ine|an|ic|ch))(?=\s+(\p{Ll}+))/gu;
/** Words after an adjective that make it about language, script or a thing — not a place ("English translation", "Roman numerals"). */
const NOT_GEOGRAPHIC = /^(?:language|languages|tongue|translation|translations|translator|text|texts|word|words|name|names|alphabet|letters|script|numerals|grammar|dialect|dialects|speakers?|speaking|spelling|literature|poetry|poems?|poets?|novels?|scholars?|scholarship|style|fashion|cuisine|food|dish|dishes|horses?|breed|history|historians?|studies|version|edition|original)$/;
const NOT_PLACE = new Set(('I Me My He She It They We You His Her Their Our The A An This That These Those Then There Here When Where Why How What Who God Lord Sir Lady Mr Mrs Dr King Queen Prince Emperor Pope Saint St Chapter Book Part Volume Section Figure Table Note Notes Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christ Jesus Romans Greeks Christians Muslims Jews Senate Consul Consuls Army General Caesar').split(' '));
const STRENGTH_RANK = { strong: 0, weak: 1, none: 2 } as const;

/** Does the occurrence of `name` at `index` lie inside a person's full name as written in the text? */
function insidePersonName(text: string, index: number, name: string, people: string[]): boolean {
  for (const p of people) {
    if (p.length <= name.length || !p.split(/\s+/).includes(name)) continue;
    for (let i = text.indexOf(p); i >= 0; i = text.indexOf(p, i + 1)) if (index >= i && index < i + p.length) return true;
  }
  return false;
}

/**
 * Candidate places in a passage, each with the textual evidence for it.
 * `known` names (atlas/X-Ray places) are always included; other names only
 * when a place cue precedes them (and they don't belong to `people`), plus
 * demonyms used as adjectives. Whether a candidate is plausible enough to be
 * looked up is decided later (screenMentions / resolvePlace), from this evidence.
 */
export function detectPlaces(text: string, known: string[] = [], people: string[] = []): PlaceMention[] {
  const out = new Map<string, PlaceMention>();
  const add = (name: string, index: number, isKnown: boolean, demonym = false, listOf?: MentionEvidence) => {
    const clean = name.replace(/[’']s$/, '').replace(/\s+(of|on|upon|de|la|le|am|an)$/i, '').trim();
    const words = clean.split(' ');
    // "St", "Saint" and "The" begin a name only when another word follows ("St Albans", "The Hague").
    if (clean.length < 3 || (NOT_PLACE.has(words[0]) && !(words.length > 1 && /^(?:St\.?|Saint|The)$/.test(words[0])))) return;
    if (!isKnown && PERSON_BEFORE.test(text.slice(Math.max(0, index - 40), index))) return;
    // A person is not a place — but only this occurrence is the person: "Henry of Lancaster" hides nothing when the
    // text later says "he rode to Lancaster" (PA-001). A name is skipped when it *is* a person's name, or when this
    // occurrence sits inside a person's full name written in the text.
    if (people.some((p) => p.toLowerCase() === clean.toLowerCase()) || insidePersonName(text, index, clean, people)) return;
    // A list item takes the cue of the list's first name ("marched to Lyon, Dijon and Troyes").
    const own = mentionEvidence(clean, text, index);
    const ev0 = listOf ? { ...listOf, multiword: own.multiword, demonym: false } : own;
    // "reached Edward’s camp": a possessive after a loose cue may be a person's; screened against the gazetteers later.
    const possessive = /^[’']s\s+\p{Ll}/u.test(text.slice(index + clean.length, index + clean.length + 6));
    const ev = demonym ? { ...ev0, demonym: true } : possessive ? { ...ev0, possessive: true } : ev0;
    const k = clean.toLowerCase();
    const cur = out.get(k);
    if (cur) {
      cur.count++;
      cur.known ||= isKnown;
      // Keep the strongest evidence any occurrence gives.
      if (STRENGTH_RANK[ev.strength] < STRENGTH_RANK[cur.evidence.strength]) cur.evidence = { ...ev, demonym: cur.evidence.demonym || ev.demonym };
    } else out.set(k, { name: clean, count: 1, index, known: isKnown, evidence: ev });
  };
  for (const n of known) {
    const re = new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu');
    for (const m of text.matchAll(re)) add(n, m.index ?? 0, true);
  }
  for (const m of text.matchAll(PLACE_CUE)) {
    const at = (m.index ?? 0) + m[0].length - m[1].length;
    add(m[1], at, false);
    // The rest of a list after the cued name, kept only when it is a real list: joined by "and"/"or", and not running on
    // into a sentence ("to Paris and John followed").
    const head = mentionEvidence(m[1].replace(/[’']s$/, ''), text, at);
    const items: { name: string; index: number }[] = [];
    let pos = (m.index ?? 0) + m[0].length;
    let joined = false;
    for (let li = LIST_ITEM.exec(text.slice(pos)); li && items.length < 12; li = LIST_ITEM.exec(text.slice(pos))) {
      items.push({ name: li[3], index: pos + li[0].length - li[3].length });
      pos += li[0].length;
      if (li[1] || li[2]) { joined = true; break; }
    }
    if (joined && (items.length > 1 || LIST_END.test(text.slice(pos)))) for (const it of items) add(it.name, it.index, false, false, head);
  }
  for (const m of text.matchAll(DEMONYM_CUE)) {
    // "in English", "English translation": language, not geography; "to Norwich in…", "to Munich and": a place after a
    // place cue, not an adjective (A12-001).
    if (NOT_GEOGRAPHIC.test(m[2]) || /\b(?:in|into|from|to|at|near|towards?|through|across)\s+$/i.test(text.slice(Math.max(0, (m.index ?? 0) - 9), m.index ?? 0))) continue;
    if (isCommonWord(m[1]) === true) continue;
    add(m[1], m.index ?? 0, false, true);
  }
  return [...out.values()].sort((a, b) => Number(b.known) - Number(a.known) || a.index - b.index);
}

/**
 * Keep only mentions the text gives reason to treat as places: known names,
 * strong cues, multi-word names, and — for a single ordinary English word
 * after a weak cue — only those a historical dataset independently knows
 * (offline gazetteer, polity or continent/sea). Demonyms are kept only when
 * they point to a recorded polity.
 */
export async function screenMentions(ms: PlaceMention[], year?: number): Promise<PlaceMention[]> {
  await loadCommonWords();
  const out: PlaceMention[] = [];
  for (const m of ms) {
    if (m.known) { out.push(m); continue; }
    if (m.evidence.demonym) {
      if ((await matchPolity(m.name, year).catch(() => [])).length) out.push(m);
      // Not an adjective of any recorded polity, but a recorded place: a town whose name ends like one (Norwich, Helsinki).
      else if ((await placesByName(m.name).catch(() => [])).length) out.push({ ...m, evidence: { ...m.evidence, demonym: false } });
      continue;
    }
    // "reached Edward’s camp": a possessive name the gazetteers don't know as a place is a person's.
    // (Records that aren't places — a wreck or a find carrying the name — don't count.)
    if (m.evidence.possessive && !(await placesByName(m.name).catch(() => [])).some((h) => !notAPlace(h.place))) continue;
    const common = isCommonWord(m.name.split(/\s+/)[0]);
    if (!common || (m.evidence.strength === 'strong' && !m.evidence.loose) || m.evidence.multiword) { out.push(m); continue; }
    const offline = !!macroRegion(m.name) || (await placesByName(m.name).catch(() => [])).length > 0 || (await matchPolity(m.name, year).catch(() => [])).length > 0;
    if (plausibleMention({ ...m.evidence, commonWord: common }, m.name, offline).ok) out.push(m);
  }
  return out;
}

export type DateSource = 'yours' | 'nearby' | 'chapter' | 'book' | 'none';
export interface DateContext { year?: number; approximate?: boolean; source: DateSource }

export const DATE_SOURCE_LABEL: Record<DateSource, string> = {
  yours: 'Your choice',
  nearby: 'Written nearby in the text',
  chapter: 'Mentioned in this chapter',
  book: 'The period this book covers',
  none: 'Historical date unknown',
};

const dateKey = (bookId: string) => `shelf.mapDate.${bookId}`;

export function savedBookDate(bookId: string): number | undefined {
  try { const v = Number(localStorage.getItem(dateKey(bookId))); return Number.isFinite(v) && v !== 0 ? v : undefined; } catch { return undefined; }
}
export function saveBookDate(bookId: string, year: number | undefined) {
  try { if (year === undefined) localStorage.removeItem(dateKey(bookId)); else localStorage.setItem(dateKey(bookId), String(year)); } catch { /* ignore */ }
}

/**
 * The most likely historical year for a mention, in this order:
 * a date the reader chose for this book → a date written near the place →
 * the latest date mentioned earlier in the chapter → the period the book is
 * about (from its details) → unknown. Publication dates are never used.
 */
export function dateContextFor(opts: { bookId: string; item?: Pick<Item, 'histStart' | 'histEnd'>; passage?: string; mentionIndex?: number; chapterText?: string; chapterOffset?: number }): DateContext {
  const mine = savedBookDate(opts.bookId);
  if (mine !== undefined) return { year: mine, source: 'yours' };
  if (opts.passage) {
    const d = nearestDate(opts.passage, opts.mentionIndex ?? opts.passage.length / 2);
    if (d) return { year: d.year, approximate: d.approximate, source: 'nearby' };
  }
  if (opts.chapterText) {
    const upTo = opts.chapterOffset !== undefined ? opts.chapterText.slice(0, opts.chapterOffset + 2000) : opts.chapterText;
    const all = findDatesInText(upTo);
    const last = all[all.length - 1];
    if (last) return { year: last.year, approximate: last.approximate, source: 'chapter' };
  }
  const s = opts.item?.histStart;
  const e = opts.item?.histEnd;
  if (s !== undefined || e !== undefined) {
    const y = s !== undefined && e !== undefined ? Math.round((s + e) / 2) || 1 : (s ?? e)!;
    return { year: y, approximate: s !== e, source: 'book' };
  }
  return { source: 'none' };
}
