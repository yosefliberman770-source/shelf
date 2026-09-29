// X-Ray, like Kindle and Prime Video: who's who in the chapter you're
// reading, with a photo when one exists and a short biography. Names are
// identified from the book's context — "Edward" in a book about medieval
// England is Edward I, not some other Edward.
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM } from '../ai/context';
import type { ConceptKind } from '../db/types';
import { wikidata } from './entities';

export interface XRayEntry {
  /** The name as the book uses it ("Edward"). */
  name: string;
  /** Who it really is ("Edward I of England"), for real people/places. */
  full?: string;
  kind: ConceptKind;
  /** False for fictional characters (no encyclopedia lookup). */
  real: boolean;
  /** Who they are in this book so far, without spoilers. */
  role?: string;
  mentions?: number;
}

export interface Facts {
  title: string;
  description?: string;
  extract?: string;
  image?: string;
  url?: string;
  qid?: string;
  kind?: ConceptKind;
  start?: number;
  end?: number;
  approximate?: boolean;
}

export interface BookCtx { title: string; author: string; chapter?: string }

const KINDS: ConceptKind[] = ['person', 'place', 'event', 'polity', 'organization', 'period', 'object', 'source', 'concept'];

/** Scan a chapter with AI: the people (and key places/things) in it. */
export async function scanChapter(book: BookCtx, chapterText: string, signal?: AbortSignal): Promise<XRayEntry[]> {
  const { data } = await completeJSON<{ entries: XRayEntry[] }>({
    task: 'extraction',
    system: `${BASE_SYSTEM}
You build an X-Ray for a chapter, like Kindle X-Ray. Return JSON {"entries":[{"name":"name as written in the text","full":"the specific real-world person/place with disambiguation, e.g. 'Edward I of England', or null if fictional","kind":"person|place|event|polity|organization|period|object|concept","real":true,"role":"one or two sentences: who this is and their part in the story so far"}]}.
List characters/people first (most important first), then important places and terms. Max 25. Work out WHICH real person is meant from the book and context (e.g. which King Edward). Never reveal anything that happens after this chapter.`,
    messages: [{ role: 'user', content: `Book: "${book.title}" by ${book.author}${book.chapter ? `\nChapter: ${book.chapter}` : ''}\n\nChapter text:\n"""${chapterText.slice(0, 14000)}"""` }],
    maxTokens: 2500,
  }, signal, () => ({ entries: [] }));
  const counts = (n: string) => (chapterText.match(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) ?? []).length;
  return (data.entries ?? [])
    .filter((e) => e?.name)
    .map((e) => ({ ...e, kind: KINDS.includes(e.kind) ? e.kind : 'concept', real: e.real !== false && !!(e.full ?? e.name), full: e.full || undefined, mentions: counts(e.name) }))
    .slice(0, 25);
}

/** Ask the AI which person/place a name means in this passage. */
export async function identifyWithAI(name: string, passage: string, book: BookCtx, signal?: AbortSignal): Promise<XRayEntry> {
  const { data } = await completeJSON<XRayEntry>({
    task: 'classification',
    system: `${BASE_SYSTEM}
Identify who or what a name in a book refers to. Return JSON {"name":"...","full":"specific real-world identity with disambiguation (e.g. 'Edward II of England'), or null if fictional","kind":"person|place|event|polity|organization|period|object|concept","real":true,"role":"one or two sentences about who this is in this book so far"}. Use the book and passage to pick the right one. No spoilers beyond the passage.`,
    messages: [{ role: 'user', content: `Book: "${book.title}" by ${book.author}${book.chapter ? ` (chapter: ${book.chapter})` : ''}\nName: "${name}"\nPassage: """${passage.slice(0, 1500)}"""` }],
    maxTokens: 500,
  }, signal, () => ({ name, kind: 'person', real: true }));
  return { ...data, name, kind: KINDS.includes(data.kind) ? data.kind : 'person', real: data.real !== false, full: data.full || undefined };
}

const STOP = /^(the|a|an|of|and|in|on|to|for|with|by|at|from|his|her|their|book|volume|part|chapter|history|story|life|new|complete|works)$/i;

/** Words from the book and passage that help pick the right article. */
export function contextWords(book: BookCtx, passage = ''): string[] {
  const fromTitle = book.title.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.test(w));
  const caps = [...passage.matchAll(/\b[A-Z][\p{Ll}]{3,}\b/gu)].map((m) => m[0]).filter((w) => !STOP.test(w));
  return [...new Set([...fromTitle, ...caps])].slice(0, 6);
}

const factsCache = new Map<string, Promise<Facts | undefined>>();

/**
 * Find the encyclopedia article for a name, using context words to pick the
 * right one, then add dates from Wikidata. Nothing is guessed: if no clear
 * article is found, it returns undefined.
 */
export function lookupFacts(query: string, hints: string[] = [], signal?: AbortSignal): Promise<Facts | undefined> {
  const key = `${query}|${hints.join(' ')}`;
  if (!factsCache.has(key)) {
    factsCache.set(key, (async () => {
      const search = async (q: string) => {
        const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`, { signal });
        if (!r.ok) return [];
        const j = (await r.json()) as { query?: { search?: { title: string; snippet: string }[] } };
        return j.query?.search ?? [];
      };
      const first = query.split(/\s+/)[0].toLowerCase();
      // With context first; fall back to the name alone.
      let hits = hints.length ? await search(`${query} ${hints.join(' ')}`) : [];
      hits = hits.filter((h) => h.title.toLowerCase().includes(first));
      if (!hits.length) hits = (await search(query)).filter((h) => h.title.toLowerCase().includes(first));
      for (const h of hits.slice(0, 3)) {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, '_'))}`, { signal });
        if (!r.ok) continue;
        const s = (await r.json()) as { type?: string; title: string; description?: string; extract?: string; thumbnail?: { source: string }; originalimage?: { source: string }; wikibase_item?: string; content_urls?: { desktop?: { page?: string } } };
        if (s.type === 'disambiguation') continue;
        const facts: Facts = { title: s.title, description: s.description, extract: s.extract, image: s.thumbnail?.source ?? s.originalimage?.source, url: s.content_urls?.desktop?.page, qid: s.wikibase_item };
        if (s.wikibase_item) {
          try {
            const f = await wikidata.facts(s.wikibase_item, signal);
            Object.assign(facts, { kind: f.kind, start: f.start, end: f.end, approximate: f.approximate });
            if (!facts.image && f.image) facts.image = f.image;
          } catch { /* dates are optional */ }
        }
        return facts;
      }
      return undefined;
    })().catch((e) => { factsCache.delete(key); throw e; }));
  }
  return factsCache.get(key)!;
}

export const eraYear = (y?: number) => (y === undefined ? '' : y < 0 ? `${-y} BC` : `${y}`);

export function lifeSpan(f: Pick<Facts, 'start' | 'end' | 'approximate' | 'kind'>): string {
  if (f.start === undefined && f.end === undefined) return '';
  const c = f.approximate ? 'c. ' : '';
  if (f.kind === 'person') {
    if (f.start !== undefined && f.end !== undefined) return `Born ${c}${eraYear(f.start)} · Died ${c}${eraYear(f.end)}`;
    if (f.start !== undefined) return `Born ${c}${eraYear(f.start)}`;
    return `Died ${c}${eraYear(f.end)}`;
  }
  if (f.start !== undefined && f.end !== undefined && f.end !== f.start) return `${c}${eraYear(f.start)} – ${eraYear(f.end)}`;
  return `${c}${eraYear(f.start ?? f.end)}`;
}
