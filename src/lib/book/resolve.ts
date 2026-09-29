// Entity resolution: turn per-chunk extractions into one list of people,
// places and things. Done locally and deterministically (no AI requests):
// "Mr. Darcy", "Darcy" and "Fitzwilliam Darcy" merge; "Mr. Bennet" and
// "Mrs. Bennet" don't; a bare name that could mean several people stays
// separate and is marked uncertain rather than guessed.
import type { BookEntity, BookEvent, BookGraphRow, BookLoc, BookRelation, ChunkExtraction, EntityType, Evidence, RawEntity } from './types';
import { ANALYSIS_VERSION } from './types';

const MALE = new Set(['mr', 'sir', 'lord', 'king', 'prince', 'duke', 'earl', 'count', 'baron', 'father', 'brother', 'uncle', 'master', 'monsieur', 'señor', 'herr', 'emperor', 'tsar', 'sultan', 'pope', 'abbot', 'friar']);
const FEMALE = new Set(['mrs', 'miss', 'ms', 'lady', 'queen', 'princess', 'duchess', 'countess', 'baroness', 'mother', 'sister', 'aunt', 'madame', 'mademoiselle', 'señora', 'frau', 'empress', 'tsarina', 'dame', 'abbess', 'mistress']);
const NEUTRAL = new Set(['dr', 'doctor', 'captain', 'colonel', 'general', 'major', 'lieutenant', 'sergeant', 'professor', 'reverend', 'rev', 'saint', 'st', 'the', 'old', 'young', 'little', 'judge', 'governor', 'president', 'senator', 'bishop', 'cardinal', 'admiral']);

export interface NameParts { core: string; tokens: string[]; gender?: 'male' | 'female'; /** Had a rank such as Colonel/Captain — those go with surnames. */ rank?: boolean }

/** "Mr. Fitzwilliam Darcy's" → core "fitzwilliam darcy", gender male. */
export function parseName(name: string): NameParts {
  const words = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’]s\b/g, '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  let gender: NameParts['gender'];
  let rank = false;
  while (words.length > 1) {
    const w = words[0];
    if (MALE.has(w)) gender = 'male';
    else if (FEMALE.has(w)) gender = 'female';
    else if (NEUTRAL.has(w)) { if (!['the', 'old', 'young', 'little'].includes(w)) rank = true; }
    else break;
    words.shift();
  }
  return { core: words.join(' '), tokens: words.filter((w) => !['of', 'the', 'de', 'von', 'van', 'la', 'le'].includes(w)), gender, rank };
}

export const normName = (n: string) => parseName(n).core;

export function slug(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';
}

/** Types that are the same kind of thing for merging purposes. */
function typeClass(t: EntityType): string {
  if (t === 'place' || t === 'region' || t === 'polity') return 'place';
  return t;
}

interface Mention {
  raw: RawEntity;
  chunk: number;
  chapter: number;
  /** Where a fact with no paragraph number is placed: the end of its chunk, so it never shows early. */
  lastPara: number;
  firstPara: number;
  parts: NameParts;
  cls: string;
}

class UF {
  p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(i: number): number { while (this.p[i] !== i) { this.p[i] = this.p[this.p[i]]; i = this.p[i]; } return i; }
  union(a: number, b: number) { const x = this.find(a), y = this.find(b); if (x !== y) this.p[Math.max(x, y)] = Math.min(x, y); }
}

export interface ChunkInput { index: number; chapter: number; result: ChunkExtraction; paraStart?: number; paraEnd?: number }

/** Paragraph → CFI lookup for provenance. */
export type CfiLookup = (chapter: number, para: number) => string | undefined;

export function resolveBook(bookId: string, chunks: ChunkInput[], cfiOf: CfiLookup = () => undefined): BookGraphRow {
  const mentions: Mention[] = [];
  for (const c of chunks) for (const e of c.result.entities) {
    const parts = parseName(e.name);
    if (!parts.core) continue;
    const g = parts.gender ?? (e.gender === 'male' || e.gender === 'female' ? e.gender : undefined);
    mentions.push({ raw: e, chunk: c.index, chapter: c.chapter, firstPara: c.paraStart ?? 0, lastPara: (c.paraEnd ?? 1) - 1, parts: { ...parts, gender: g }, cls: typeClass(e.type) });
  }
  const uf = new UF(mentions.length);
  const groupsOf = () => {
    const m = new Map<number, number[]>();
    mentions.forEach((_, i) => { const r = uf.find(i); m.set(r, [...(m.get(r) ?? []), i]); });
    return m;
  };
  const groupGender = (ids: number[]) => {
    let m = 0, f = 0;
    for (const i of ids) { if (mentions[i].parts.gender === 'male') m++; if (mentions[i].parts.gender === 'female') f++; }
    return m > f ? 'male' : f > m ? 'female' : undefined;
  };
  const compatible = (a?: string, b?: string) => !a || !b || a === b;

  // 1. Same core name, same (or known) gender.
  const byKey = new Map<string, number>();
  mentions.forEach((m, i) => {
    const k = `${m.cls}|${m.parts.core}|${m.parts.gender ?? '?'}`;
    if (byKey.has(k)) uf.union(byKey.get(k)!, i); else byKey.set(k, i);
  });

  // 2. Gender-unknown mentions join the one gendered group with that name (if there is exactly one).
  // 3. Aliases and titles: "Lizzy" listed as an alias of Elizabeth Bennet.
  // 4. Partial names: "Darcy" → "Fitzwilliam Darcy" when only one such group fits.
  const uncertain = new Map<number, Set<string>>();
  for (let pass = 0; pass < 2; pass++) {
    uncertain.clear();
    const groups = groupsOf();
    const info = [...groups.entries()].map(([root, ids]) => {
      const m = mentions[root];
      const names = new Set<string>();
      const aliasCores = new Set<string>();
      for (const i of ids) {
        names.add(mentions[i].parts.core);
        for (const a of [...(mentions[i].raw.aliases ?? []), ...(mentions[i].raw.titles ?? [])]) { const c = parseName(a).core; if (c) aliasCores.add(c); }
      }
      const lastTokens = new Set([...names].filter((n) => n.includes(' ')).map((n) => n.split(' ').pop()!));
      return { root, ids, cls: m.cls, names, aliasCores, gender: groupGender(ids), tokens: new Set([...names].flatMap((n) => n.split(' '))), lastTokens, rank: ids.some((i) => mentions[i].parts.rank) };
    });
    const candidatesFor = (g: (typeof info)[number], test: (h: (typeof info)[number]) => boolean) =>
      info.filter((h) => h.root !== g.root && h.cls === g.cls && compatible(g.gender, h.gender) && test(h));
    const exact = new Map<number, typeof info>();
    for (const g of info) exact.set(g.root, candidatesFor(g, (h) => [...g.names].some((n) => h.names.has(n) || h.aliasCores.has(n)) || [...g.aliasCores].some((a) => h.names.has(a))));
    for (const g of info) {
      const cands = exact.get(g.root)!;
      // Exact name or alias match — only when it's unique both ways, so a bare
      // "Bennet" doesn't join "Mr. Bennet" while "Mrs. Bennet" also exists.
      if (cands.length === 1 && exact.get(cands[0].root)!.length === 1) { uf.union(g.root, cands[0].root); continue; }
      if (cands.length > 1) { uncertain.set(g.root, new Set(cands.map((c) => mentions[c.root].raw.name))); continue; }
      if (cands.length === 1) continue;
      // Partial: a one-word name that appears in exactly one longer name.
      const words = [...g.names].filter((n) => n.split(' ').length === 1);
      if (!words.length || g.names.size > words.length) continue;
      // "Colonel Fitzwilliam" is a surname, so it mustn't join "Fitzwilliam Darcy".
      let partial = candidatesFor(g, (h) => [...h.names].some((n) => n.split(' ').length > 1) && words.some((w) => (g.rank ? h.lastTokens : h.tokens).has(w)));
      // Prefer groups that share the gender when that narrows it down.
      if (partial.length > 1 && g.gender) { const same = partial.filter((c) => c.gender === g.gender); if (same.length === 1) partial = same; }
      if (partial.length === 1) uf.union(g.root, partial[0].root);
      else if (partial.length > 1) uncertain.set(g.root, new Set(partial.map((c) => mentions[c.root].raw.name)));
    }
    // Merges already made can make other names unique on the next pass.
    for (const k of [...uncertain.keys()]) if (uf.find(k) !== k) uncertain.delete(k);
  }

  // Build entities.
  const groups = groupsOf();
  const entities: BookEntity[] = [];
  const keyOfMention = new Map<number, string>();
  const surface = new Map<string, Set<string>>(); // normalized name → entity keys
  const usedKeys = new Set<string>();
  for (const [root, ids] of groups) {
    const counts = new Map<string, number>();
    for (const i of ids) counts.set(mentions[i].raw.name, (counts.get(mentions[i].raw.name) ?? 0) + 1 + (mentions[i].raw.paras?.length ?? 0));
    // Prefer the most-used full (multi-word) name, e.g. "Elizabeth Bennet".
    const ranked = [...counts.entries()].sort((a, b) => (b[0].split(' ').length > 1 ? 1 : 0) - (a[0].split(' ').length > 1 ? 1 : 0) || b[1] - a[1] || b[0].length - a[0].length);
    const multi = ranked.filter(([n]) => parseName(n).core.includes(' '));
    const name = (multi[0] ?? ranked[0])[0];
    const typeCounts = new Map<EntityType, number>();
    for (const i of ids) typeCounts.set(mentions[i].raw.type, (typeCounts.get(mentions[i].raw.type) ?? 0) + 1);
    const type = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let key = `${type === 'character' ? '' : `${typeClass(type)}-`}${slug(parseName(name).core)}`;
    for (let n = 2; usedKeys.has(key); n++) key = `${key.replace(/-\d+$/, '')}-${n}`;
    usedKeys.add(key);

    const aliases = new Set<string>();
    const titles = new Set<string>();
    const descriptions: { chapter: number; para?: number; text: string }[] = [];
    const facts: Evidence[] = [];
    const seenFacts = new Set<string>();
    const mentionsLoc: BookLoc[] = [];
    const seenLoc = new Set<string>();
    let real: string | undefined;
    const addLoc = (chapter: number, para?: number) => {
      if (para === undefined) return;
      const k = `${chapter}:${para}`;
      if (seenLoc.has(k)) return;
      seenLoc.add(k);
      mentionsLoc.push({ chapter, para, cfi: cfiOf(chapter, para) });
    };
    for (const i of ids.sort((a, b) => mentions[a].chunk - mentions[b].chunk)) {
      const m = mentions[i];
      keyOfMention.set(i, key);
      if (m.raw.name !== name) aliases.add(m.raw.name);
      for (const a of m.raw.aliases ?? []) if (a !== name) aliases.add(a);
      for (const t of m.raw.titles ?? []) titles.add(t);
      if (m.raw.real && !real) real = m.raw.real;
      if (m.raw.description) descriptions.push({ chapter: m.chapter, para: Math.max(...(m.raw.paras?.length ? m.raw.paras : [m.lastPara])), text: m.raw.description });
      for (const p of m.raw.paras ?? []) addLoc(m.chapter, p);
      for (const f of m.raw.facts ?? []) {
        const fk = f.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        addLoc(m.chapter, f.para);
        if (seenFacts.has(fk)) continue;
        seenFacts.add(fk);
        facts.push({ chapter: m.chapter, para: f.para ?? m.lastPara, cfi: cfiOf(m.chapter, f.para ?? m.firstPara), text: f.text, quote: f.quote, certainty: f.certainty ?? 'explicit' });
      }
    }
    if (!mentionsLoc.length) for (const i of ids) addLoc(mentions[i].chapter, mentions[i].lastPara);
    mentionsLoc.sort((a, b) => a.chapter - b.chapter || a.para - b.para);
    const chapters = [...new Set([...ids.map((i) => mentions[i].chapter)])].sort((a, b) => a - b);
    const gender = groupGender(ids);
    const unc = uncertain.get(root);
    entities.push({
      key, type, name, aliases: [...aliases].filter((a) => a.toLowerCase() !== name.toLowerCase()), titles: [...titles], gender, real,
      descriptions, facts, mentions: mentionsLoc, chapters, firstChapter: chapters[0] ?? 0,
      ...(unc ? { uncertainMerge: [...unc] } : {}),
    });
    for (const n of [name, ...aliases]) { const c = normName(n); if (!surface.has(c)) surface.set(c, new Set()); surface.get(c)!.add(key); }
  }

  const entityOf = (name: string, chapter: number): string | undefined => {
    const keys = surface.get(normName(name));
    if (!keys?.size) return undefined;
    if (keys.size === 1) return [...keys][0];
    const here = [...keys].filter((k) => entities.find((e) => e.key === k)?.chapters.includes(chapter));
    return here.length === 1 ? here[0] : undefined;
  };

  const relations: BookRelation[] = [];
  const seenRel = new Set<string>();
  const events: BookEvent[] = [];
  for (const c of chunks) {
    for (const r of c.result.relations) {
      const from = entityOf(r.a, c.chapter), to = entityOf(r.b, c.chapter);
      if (!from || !to || from === to) continue;
      const k = `${from}|${to}|${r.type.toLowerCase()}`;
      if (seenRel.has(k)) continue;
      seenRel.add(k);
      relations.push({ from, to, type: r.type, detail: r.detail, certainty: r.certainty ?? 'explicit', loc: { chapter: c.chapter, para: r.para ?? (c.paraEnd ?? 1) - 1, cfi: cfiOf(c.chapter, r.para ?? c.paraStart ?? 0) } });
    }
    for (const e of c.result.events) {
      events.push({ name: e.name, when: e.when, where: e.where ? entityOf(e.where, c.chapter) : undefined, who: (e.who ?? []).map((w) => entityOf(w, c.chapter)).filter((k): k is string => !!k), certainty: e.certainty ?? 'explicit', loc: { chapter: c.chapter, para: e.para ?? (c.paraEnd ?? 1) - 1, cfi: cfiOf(c.chapter, e.para ?? c.paraStart ?? 0) } });
    }
  }
  events.sort((a, b) => a.loc.chapter - b.loc.chapter || a.loc.para - b.loc.para);
  entities.sort((a, b) => b.mentions.length - a.mentions.length || a.firstChapter - b.firstChapter);
  return { id: bookId, bookId, version: ANALYSIS_VERSION, builtAt: Date.now(), entities, relations, events };
}

// ── Spoiler-safe views ─────────────────────────────────────────────────

/** An entity as known up to (and including) a chapter, or undefined if not yet introduced. */
export function entityUpTo(e: BookEntity, chapter: number, para = Infinity): BookEntity | undefined {
  const seen = (l: { chapter: number; para?: number }) => l.chapter < chapter || (l.chapter === chapter && (l.para ?? 0) <= para);
  const mentions = e.mentions.filter(seen);
  if (!mentions.length) return undefined;
  const descriptions = e.descriptions.filter((d) => d.chapter < chapter || (d.chapter === chapter && (d.para ?? 0) <= para));
  return {
    ...e,
    descriptions,
    facts: e.facts.filter(seen),
    mentions,
    chapters: [...new Set(mentions.map((m) => m.chapter))],
    firstChapter: mentions[0].chapter,
  };
}

/** True if a location is at or before a reading position. */
export const atOrBefore = (l: { chapter: number; para?: number }, chapter?: number, para = Infinity) => chapter === undefined || l.chapter < chapter || (l.chapter === chapter && (l.para ?? 0) <= para);

export function latestDescription(e: BookEntity): string | undefined {
  return e.descriptions[e.descriptions.length - 1]?.text;
}

/** Stable fingerprint of the evidence behind an entity (to know when a summary is stale). */
export function evidenceHash(e: BookEntity): string {
  let h = 0;
  const s = e.facts.map((f) => f.text).join('|') + e.descriptions.map((d) => d.text).join('|');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${e.facts.length}-${(h >>> 0).toString(36)}`;
}
