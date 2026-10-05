// First AI pass: pull every character, place and thing out of one chunk as
// structured JSON with evidence. Kept short — this runs once per chunk.
import type { Certainty, ChunkExtraction, EntityType, RawEntity, RawEvent, RawFact, RawRelation } from './types';
import { ENTITY_TYPES } from './types';

export const EXTRACTION_SYSTEM = `You extract structured facts from a passage of a book for a reader's X-Ray.
Rules:
- List EVERY named character or person, including minor ones mentioned once, plus every named place, organization, family, country/kingdom, event and important object.
- Use only this passage. Never add knowledge from outside it, never mention later parts of the book.
- Paragraphs are numbered like [12]. Cite the paragraph number for each fact and include a short exact quote (under 15 words) when possible.
- certainty: "explicit" if the text states it, "inferred" if it is a reasonable reading, "uncertain" if unsure.
- Put nicknames, short forms and other names used for the same person in aliases, and honorifics/titles in titles ("Mr. Darcy" → name "Darcy" is fine; if the full name is known use it).
- If a name clearly refers to a real historical person or place, set real to its specific identity (e.g. "Edward I of England"); otherwise null.
Return JSON only:
{"entities":[{"name":"","type":"character|place|organization|family|polity|event|object|date|occupation|region|concept","aliases":[],"titles":[],"gender":"male|female|unknown","real":null,"desc":"one sentence: who/what this is in this passage","facts":[{"t":"fact","p":0,"q":"quote","c":"explicit"}],"p":[0]}],
"relations":[{"a":"name","b":"name","type":"e.g. sister of, works for, married to, lives at, located in","p":0,"c":"explicit"}],
"events":[{"name":"","when":"","where":"","who":[""],"p":0,"c":"explicit"}]}`;

export function extractionPrompt(book: { title: string; author: string }, chapterTitle: string, text: string, hints: string[]): string {
  return `Book: "${book.title}" by ${book.author}${chapterTitle ? `\nChapter: ${chapterTitle}` : ''}
${hints.length ? `Capitalised names seen in this passage (include each one that is a character, person, place or other named thing): ${hints.join(', ')}\n` : ''}
PASSAGE:
${text}`;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const num = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : parseInt(s(v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : undefined; };
/** The model's certainty word, read for what it says: only a word that means stated outright is "explicit"; anything
 *  hedged, guessed, implied or unknown is not (A8-035). An empty or unrecognised word is "uncertain", never explicit. */
export const cert = (v: unknown): Certainty => {
  const c = s(v).toLowerCase().trim();
  if (/^(explicit|stated|direct|certain|definite|clear|yes|sure)/.test(c)) return 'explicit';
  if (/^(infer|implied|implicit|deduc|derived|indirect|context)/.test(c)) return 'inferred';
  return 'uncertain';
};

const TYPE_ALIASES: Record<string, EntityType> = {
  person: 'character', people: 'character', character: 'character', human: 'character', animal: 'character',
  location: 'place', city: 'place', town: 'place', building: 'place', place: 'place', country: 'polity', kingdom: 'polity', empire: 'polity', state: 'polity', nation: 'polity',
  group: 'organization', institution: 'organization', company: 'organization', army: 'organization', 'political entity': 'polity', dynasty: 'family', house: 'family',
  item: 'object', thing: 'object', artifact: 'object', time: 'date', job: 'occupation', title: 'occupation', area: 'region', idea: 'concept', term: 'concept',
};
function type(v: unknown): EntityType {
  const t = s(v).toLowerCase();
  if ((ENTITY_TYPES as string[]).includes(t)) return t as EntityType;
  return TYPE_ALIASES[t] ?? 'concept';
}

/** Accepts the compact keys we ask for and the long ones models sometimes use instead. */
export function parseExtraction(data: unknown, paraRange?: [number, number]): ChunkExtraction {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const inRange = (p?: number) => (p === undefined || !paraRange || (p >= paraRange[0] && p < paraRange[1]) ? p : undefined);
  const entities: RawEntity[] = [];
  for (const e of arr(o.entities ?? o.characters)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    const name = s(r.name).replace(/\s+/g, ' ');
    if (!name || name.length > 80) continue;
    const facts: RawFact[] = arr(r.facts ?? r.evidence).map((f) => {
      if (typeof f === 'string') return { text: f, certainty: 'explicit' as Certainty };
      const x = (f ?? {}) as Record<string, unknown>;
      return { text: s(x.t ?? x.text ?? x.fact), para: inRange(num(x.p ?? x.para ?? x.paragraph)), quote: s(x.q ?? x.quote) || undefined, certainty: cert(x.c ?? x.certainty) };
    }).filter((f) => f.text);
    const g = s(r.gender).toLowerCase();
    entities.push({
      name,
      type: type(r.type ?? r.kind),
      aliases: arr(r.aliases).map(s).filter((a) => a && a !== name),
      titles: arr(r.titles).map(s).filter(Boolean),
      gender: g.startsWith('m') ? 'male' : g.startsWith('f') ? 'female' : 'unknown',
      description: s(r.desc ?? r.description ?? r.role) || undefined,
      real: s(r.real) && s(r.real).toLowerCase() !== 'null' ? s(r.real) : null,
      facts,
      paras: arr(r.p ?? r.paras ?? r.paragraphs).map(num).filter((n): n is number => inRange(n) !== undefined && n !== undefined),
    });
  }
  const relations: RawRelation[] = arr(o.relations ?? o.relationships).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return { a: s(r.a ?? r.from ?? r.source), b: s(r.b ?? r.to ?? r.target), type: s(r.type ?? r.relation), detail: s(r.detail) || undefined, para: inRange(num(r.p ?? r.para)), certainty: cert(r.c ?? r.certainty) };
  }).filter((r) => r.a && r.b && r.type && r.a !== r.b);
  const events: RawEvent[] = arr(o.events).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return { name: s(r.name ?? r.event), when: s(r.when) || undefined, where: s(r.where) || undefined, who: arr(r.who).map(s).filter(Boolean), para: inRange(num(r.p ?? r.para)), certainty: cert(r.c ?? r.certainty) };
  }).filter((e) => e.name);
  return { entities, relations, events };
}

const fold = (s: string) => s.normalize('NFKC').toLowerCase();
const nameChar = /[\p{L}\p{N}_]/u;

/** True if a name occurs as a whole word or phrase in the text. */
export function appearsIn(text: string, name: string): boolean {
  const t = fold(text);
  const n = fold(name.replace(/['’]s$/, '').trim());
  if (!n) return false;
  for (let i = t.indexOf(n); i !== -1; i = t.indexOf(n, i + 1)) {
    const before = t[i - 1];
    const after = t[i + n.length];
    if (!(before && nameChar.test(before)) && !(after && nameChar.test(after))) return true;
  }
  return false;
}

/**
 * Drop anything the AI invented: an entity is kept only if its name (or one of
 * its aliases) is actually written in the passage. Aliases that aren't in the
 * text are kept only as aliases of a name that is.
 */
export function keepGrounded(x: ChunkExtraction, passage: string): ChunkExtraction {
  const entities = x.entities.filter((e) => appearsIn(passage, e.name) || (e.aliases ?? []).some((a) => appearsIn(passage, a)));
  return { ...x, entities };
}
