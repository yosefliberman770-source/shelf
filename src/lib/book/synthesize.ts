// Second AI stage: write a character's X-Ray from the evidence gathered so
// far — not from the raw book, and never past the chapter you're on. Cached
// until new evidence appears.
import { completeJSON } from '../../ai/client';
import { db } from '../../db/db';
import { entityUpTo, evidenceHash } from './resolve';
import type { BookEntity, BookGraphRow, BookXRayRow, XRaySynthesis } from './types';

const SYSTEM = `You write a reader's X-Ray entry for one character, using ONLY the evidence given (facts gathered from the book so far).
Never add events or knowledge that are not in the evidence — the reader has not read further. If something is unknown, leave it out.
Return JSON {"overview":"2–3 sentences","appearance":"","personality":"","family":"","relationships":[{"name":"","relation":""}],"development":"how they have changed so far, if at all","quotes":["short quotes from the evidence"]}. Use "" or [] when there is no evidence.`;

export function synthesisPrompt(e: BookEntity, graph: BookGraphRow, book: { title: string; author: string }, chapterTitle: (c: number) => string): string {
  const nameOf = (k: string) => graph.entities.find((x) => x.key === k)?.name ?? k;
  const chapters = new Set(e.chapters);
  const last = e.mentions[e.mentions.length - 1];
  const rels = graph.relations.filter((r) => (r.from === e.key || r.to === e.key) && chapters.has(r.loc.chapter) && (!last || r.loc.chapter < last.chapter || (r.loc.chapter === last.chapter && r.loc.para <= last.para)));
  const facts = e.facts.slice(-80).map((f) => `- (${chapterTitle(f.chapter)}; ${f.certainty}) ${f.text}${f.quote ? ` — “${f.quote}”` : ''}`);
  const desc = e.descriptions.slice(-6).map((d) => `- (${chapterTitle(d.chapter)}) ${d.text}`);
  return `Book: "${book.title}" by ${book.author}
Character: ${e.name}${e.aliases.length ? ` (also called ${e.aliases.slice(0, 8).join(', ')})` : ''}${e.titles.length ? `; titles: ${e.titles.slice(0, 5).join(', ')}` : ''}
Appears in ${e.chapters.length} chapter(s) so far.

DESCRIPTIONS:
${desc.join('\n') || '- none'}

FACTS:
${facts.join('\n') || '- none'}

RELATIONSHIPS:
${rels.map((r) => `- ${nameOf(r.from)} → ${r.type} → ${nameOf(r.to)} (${r.certainty})`).join('\n') || '- none'}`;
}

export async function cachedXRay(bookId: string, e: BookEntity): Promise<BookXRayRow | undefined> {
  const row = await db.bookXray.get(`${bookId}|${e.key}`);
  return row && row.evidenceHash === evidenceHash(e) ? row : undefined;
}

/** Write (or reuse) the X-Ray for an entity as known up to `chapter`. */
export async function synthesizeXRay(bookId: string, graph: BookGraphRow, key: string, chapter: number, para = Infinity, signal?: AbortSignal): Promise<BookXRayRow> {
  const full = graph.entities.find((x) => x.key === key);
  const e = full && entityUpTo(full, chapter, para);
  if (!e) throw new Error('This character hasn’t appeared yet.');
  const hit = await cachedXRay(bookId, e);
  if (hit) return hit;
  const item = await db.items.get(bookId);
  const author = item?.authorIds?.length ? (await db.authors.bulkGet(item.authorIds)).filter(Boolean).map((a) => a!.name).join(', ') : '';
  const titles = new Map((await db.bookText.where('bookId').equals(bookId).toArray()).map((t) => [t.chapter, t.title]));
  const { data, response } = await completeJSON<XRaySynthesis>({
    task: 'synthesis', system: SYSTEM, json: true, maxTokens: 1500,
    messages: [{ role: 'user', content: synthesisPrompt(e, graph, { title: item?.title ?? '', author }, (c) => titles.get(c) ?? `Chapter ${c + 1}`) }],
  }, signal, () => ({ overview: '' }));
  const clean: XRaySynthesis = {
    overview: String(data.overview ?? '').trim(),
    appearance: data.appearance?.trim() || undefined,
    personality: data.personality?.trim() || undefined,
    family: data.family?.trim() || undefined,
    relationships: Array.isArray(data.relationships) ? data.relationships.filter((r) => r?.name && r?.relation).slice(0, 12) : undefined,
    development: data.development?.trim() || undefined,
    quotes: Array.isArray(data.quotes) ? data.quotes.filter((q) => typeof q === 'string' && q.trim()).slice(0, 4) : undefined,
  };
  const row: BookXRayRow = { id: `${bookId}|${key}`, bookId, key, throughChapter: chapter, throughPara: Number.isFinite(para) ? para : undefined, evidenceHash: evidenceHash(e), data: clean, provider: response.provider, createdAt: Date.now() };
  await db.bookXray.put(row);
  return row;
}
