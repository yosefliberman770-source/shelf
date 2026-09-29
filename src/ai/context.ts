// Builds the minimal, privacy-respecting context sent to the AI. The
// deterministic engine computes every number first; the AI only receives
// those results to explain or reason about — it is never the source of truth.
import type { Item, Note, Settings } from '../db/types';
import { brainSummary } from './summaries';
import { itemForecast } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { progressOf } from '../engine/query';
import { fmtNum, fmtUnits, pagesOf, contentLabel } from '../engine/units';

export const BASE_SYSTEM = `You are the reading assistant inside Shelf, a personal reading app.
Ground rules:
- Use ONLY the library data provided in the conversation when talking about what the user owns, has read, rated, or noted. Never invent books, notes, ratings, dates or statistics about the user's library.
- All numbers (pages, pace, dates, forecasts, streaks) were computed by the app's deterministic engine and are authoritative. Do not recalculate or contradict them; you may restate them in plain language.
- When you suggest books that are NOT in the library, say clearly that they are suggestions outside the library, and prefer well-known, real titles. If unsure a book exists, say so.
- You have not read the full text of any book unless it was provided. Base book commentary on general knowledge and the metadata/notes given, and say so when relevant.
- Present patterns and gaps as neutral observations, not judgments. If the data is insufficient, say "Not enough data yet."
- Be concise and warm. Use short paragraphs or bullet lists. No filler.`;

export type Share = Settings['ai']['share'];

export interface ItemLineOpts {
  share: Share;
  withProgress?: boolean;
  withDescription?: boolean;
}

/** One compact line per item. Ids let structured replies refer back to real items. */
export function itemLine(idx: LibraryIndex, it: Item, o: ItemLineOpts): string {
  const parts = [
    `id=${it.id}`,
    `"${it.title}"`,
    `by ${idx.authorLine(it)}`,
    contentLabel(it),
    `status=${it.status}`,
  ];
  const pages = pagesOf(it);
  if (pages) parts.push(`${pages}p`);
  else if (it.total) parts.push(fmtUnits(it, it.total));
  if (it.publishedYear !== undefined) parts.push(`pub ${it.publishedYear}`);
  if (it.genres.length) parts.push(`genres: ${it.genres.join(', ')}`);
  const folders = it.folderIds.map((f) => idx.folderPath(f).map((x) => x.name).join('/')).filter(Boolean);
  if (folders.length) parts.push(`folders: ${folders.join('; ')}`);
  const tags = it.tagIds.map((t) => idx.tags.get(t)?.name).filter(Boolean);
  if (tags.length) parts.push(`tags: ${tags.join(', ')}`);
  if (it.histStart !== undefined) parts.push(`covers years ${it.histStart}${it.histEnd !== undefined ? `..${it.histEnd}` : ''}`);
  if (o.withProgress && o.share.readingHistory) {
    const p = progressOf(idx, it);
    if (p !== undefined && it.status !== 'want') parts.push(`progress ${Math.round(p * 100)}%`);
  }
  if (o.share.ratings) {
    const r = idx.rating(it);
    if (r) parts.push(`rated ${r}/5`);
  }
  if (o.withDescription && it.description) parts.push(`about: ${it.description.slice(0, 240).replace(/\s+/g, ' ')}`);
  return parts.join(' | ');
}

/** Rank items by relevance to a query so we can send a small subset instead of the whole library. */
export function relevantItems(idx: LibraryIndex, query: string, limit = 60): Item[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const scored = idx.itemList().map((it) => {
    const hay = `${it.title} ${it.subtitle ?? ''} ${idx.authorLine(it)} ${it.genres.join(' ')} ${it.folderIds.map((f) => idx.folderPath(f).map((x) => x.name).join(' ')).join(' ')} ${it.description ?? ''}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 2;
    if (it.status === 'reading') score += 1;
    return { it, score };
  });
  scored.sort((a, b) => b.score - a.score || (b.it.lastReadAt ?? b.it.updatedAt) - (a.it.lastReadAt ?? a.it.updatedAt));
  return scored.slice(0, limit).map((s) => s.it);
}

export function libraryDigest(idx: LibraryIndex, share: Share, items: Item[] = idx.itemList(), limit = 150): string {
  const list = items.slice(0, limit);
  const lines = list.map((it) => itemLine(idx, it, { share, withProgress: true }));
  const more = items.length > limit ? `\n(${items.length - limit} more items not shown)` : '';
  return `LIBRARY (${items.length} items):\n${lines.join('\n')}${more}`;
}

export function statsDigest(idx: LibraryIndex, share: Share): string {
  if (!share.readingHistory) return 'READING STATS: (not shared by user privacy settings)';
  const interests = idx.settings.interests?.length ? `\nREADER SAYS THEY USUALLY READ: ${idx.settings.interests.join(', ')}` : '';
  return `READING STATS (computed by the app):\n${brainSummary(idx)}${interests}`;
}

export function folderDigest(idx: LibraryIndex): string {
  const lines: string[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const f of idx.childFolders.get(parent) ?? []) {
      lines.push(`${'  '.repeat(depth)}- ${f.name} (${idx.itemsInFolder(f.id).length} items)`);
      walk(f.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return lines.length ? `FOLDERS:\n${lines.join('\n')}` : 'FOLDERS: none';
}

export type SpoilerLevel = 'read' | 'page' | 'chapter' | 'full';

export const SPOILER_LEVELS: { id: SpoilerLevel; icon: string; label: string; rule: string }[] = [
  { id: 'read', icon: '🟢', label: 'Only what I’ve read', rule: 'Discuss ONLY content up to the reader’s current position. Do not reveal, hint at or foreshadow any later events, twists, deaths, endings, or arguments. If unsure whether something comes later, do not mention it.' },
  { id: 'page', icon: '🟡', label: 'Up to current page', rule: 'Stay strictly within material before the reader’s current page. No later plot points or conclusions.' },
  { id: 'chapter', icon: '🟠', label: 'Up to current chapter', rule: 'You may discuss material up to the end of the reader’s current chapter, but nothing after it.' },
  { id: 'full', icon: '🔴', label: 'Full book', rule: 'The reader accepts full spoilers for this book.' },
];

export function itemContext(idx: LibraryIndex, it: Item, share: Share, spoiler: SpoilerLevel = 'read'): string {
  const f = itemForecast(idx, it);
  const lines = [`BOOK: ${itemLine(idx, it, { share, withProgress: true, withDescription: true })}`];
  if (it.subtitle) lines.push(`Subtitle: ${it.subtitle}`);
  if (share.readingHistory && f.total) lines.push(`Reader position: ${fmtUnits(it, f.completed)} of ${fmtUnits(it, f.total)} (${Math.round((f.percent ?? 0) * 100)}%).`);
  const rule = SPOILER_LEVELS.find((s) => s.id === spoiler)!;
  lines.push(`SPOILER BOUNDARY: ${rule.rule}`);
  if (share.notes) {
    const notes = (idx.notesByItem.get(it.id) ?? []).filter((n) => spoiler === 'full' || n.page === undefined || n.page <= f.completed);
    if (notes.length) lines.push(`READER'S NOTES & QUOTES:\n${notes.slice(0, 60).map(noteLine).join('\n')}`);
  }
  if (share.reviews) {
    const ins = idx.currentInstance(it);
    if (ins?.review) lines.push(`READER'S REVIEW: ${ins.review.slice(0, 1500)}`);
  }
  return lines.join('\n');
}

export function noteLine(n: Note): string {
  const loc = [n.page !== undefined ? `p.${n.page}` : '', n.chapter ? `ch. ${n.chapter}` : ''].filter(Boolean).join(', ');
  return `- [${n.kind}${loc ? `, ${loc}` : ''}] id=${n.id}: ${n.text.replace(/\s+/g, ' ').slice(0, 600)}`;
}

export function fmt(n: number | undefined, d = 0) {
  return fmtNum(n, d);
}
