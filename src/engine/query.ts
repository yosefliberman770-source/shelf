// Structured library queries: filters, sorting, smart-collection rules,
// global search, and a deterministic natural-language parser used by
// "Ask My Library" (the AI may also produce a LibraryQuery, which is then
// validated and executed here — the AI never invents results).
import type { ContentType, Item, Rule, SmartCollection, Status } from '../db/types';
import type { DateKey } from '../db/types';
import { addDays, diffDays } from './dates';
import { itemForecast } from './forecast';
import type { LibraryIndex } from './model';
import { pagesOf, UNITS } from './units';

export interface LibraryQuery {
  text?: string;
  subject?: string;
  statuses?: Status[];
  favorite?: boolean;
  minRating?: number;
  maxRating?: number;
  unrated?: boolean;
  minPages?: number;
  maxPages?: number;
  author?: string;
  authorIds?: string[];
  genres?: string[];
  tagIds?: string[];
  folderIds?: string[];
  shelfIds?: string[];
  contentTypes?: ContentType[];
  publishedBefore?: number;
  publishedAfter?: number;
  startedAfter?: DateKey;
  startedBefore?: DateKey;
  finishedAfter?: DateKey;
  finishedBefore?: DateKey;
  hasDeadline?: boolean;
  deadlineBefore?: DateKey;
  minSpeed?: number;
  maxSpeed?: number;
  behindSchedule?: boolean;
  untouchedDays?: number;
  minProgress?: number;
  maxProgress?: number;
  maxHours?: number;
  histFrom?: number;
  histTo?: number;
  difficulty?: Item['difficulty'];
  startedNotFinished?: boolean;
}

export type SortKey =
  | 'title'
  | 'author'
  | 'added'
  | 'started'
  | 'finished'
  | 'progress'
  | 'pages'
  | 'rating'
  | 'deadline'
  | 'estimate'
  | 'recent';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** All searchable text associated with an item (metadata, folders, tags, notes). */
export function itemHaystack(idx: LibraryIndex, item: Item, withNotes = true): string {
  const parts = [
    item.title,
    item.subtitle,
    item.isbn,
    item.publisher,
    item.series,
    item.description,
    item.customType,
    item.contentType,
    item.status,
    ...idx.authorNames(item),
    ...item.genres,
    ...item.tagIds.map((t) => idx.tags.get(t)?.name),
    ...item.folderIds.flatMap((f) => idx.folderPath(f).map((x) => x.name)),
    ...item.shelfIds.map((s) => idx.shelves.get(s)?.name),
  ];
  if (withNotes) for (const n of idx.notesByItem.get(item.id) ?? []) parts.push(n.text, ...n.tags);
  return norm(parts.filter(Boolean).join(' \u0001 '));
}

function subjectHaystack(idx: LibraryIndex, item: Item): string {
  const concepts: string[] = [];
  for (const l of idx.snap.links) {
    if (l.fromType === 'item' && l.fromId === item.id && l.toType === 'concept') concepts.push(idx.concepts.get(l.toId)?.name ?? '');
    if (l.toType === 'item' && l.toId === item.id && l.fromType === 'concept') concepts.push(idx.concepts.get(l.fromId)?.name ?? '');
  }
  return norm(
    [
      item.title,
      item.subtitle,
      item.description,
      ...item.genres,
      ...item.tagIds.map((t) => idx.tags.get(t)?.name),
      ...item.folderIds.flatMap((f) => idx.folderPath(f).map((x) => x.name)),
      ...concepts,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function matchesText(hay: string, q: string): boolean {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t));
}

export function progressOf(idx: LibraryIndex, item: Item): number | undefined {
  if (item.status === 'read') return 1;
  if (!item.total) return undefined;
  return Math.min(1, idx.position(item) / item.total);
}

export function runQuery(idx: LibraryIndex, q: LibraryQuery, items: Item[] = idx.itemList()): Item[] {
  const folderSet = q.folderIds?.length ? new Set(q.folderIds.flatMap((f) => idx.folderTree(f))) : undefined;
  return items.filter((it) => {
    if (q.text && !matchesText(itemHaystack(idx, it), q.text)) return false;
    if (q.subject && !matchesText(subjectHaystack(idx, it), q.subject)) return false;
    if (q.statuses?.length && !q.statuses.includes(it.status)) return false;
    if (q.favorite !== undefined && it.favorite !== q.favorite) return false;
    const rating = idx.rating(it);
    if (q.unrated && rating) return false;
    if (q.minRating !== undefined && (rating === undefined || rating < q.minRating)) return false;
    if (q.maxRating !== undefined && (rating === undefined || rating > q.maxRating)) return false;
    const pages = pagesOf(it);
    if (q.minPages !== undefined && (pages === undefined || pages < q.minPages)) return false;
    if (q.maxPages !== undefined && (pages === undefined || pages > q.maxPages)) return false;
    if (q.author && !idx.authorNames(it).some((a) => norm(a).includes(norm(q.author!)))) return false;
    if (q.authorIds?.length && !it.authorIds.some((a) => q.authorIds!.includes(a))) return false;
    if (q.genres?.length && !it.genres.some((g) => q.genres!.map(norm).includes(norm(g)))) return false;
    if (q.tagIds?.length && !it.tagIds.some((t) => q.tagIds!.includes(t))) return false;
    if (folderSet && !it.folderIds.some((f) => folderSet.has(f))) return false;
    if (q.shelfIds?.length && !it.shelfIds.some((s) => q.shelfIds!.includes(s))) return false;
    if (q.contentTypes?.length && !q.contentTypes.includes(it.contentType)) return false;
    if (q.publishedBefore !== undefined && (it.publishedYear === undefined || it.publishedYear >= q.publishedBefore)) return false;
    if (q.publishedAfter !== undefined && (it.publishedYear === undefined || it.publishedYear <= q.publishedAfter)) return false;
    if (q.difficulty && it.difficulty !== q.difficulty) return false;
    if (q.hasDeadline !== undefined && !!it.deadline !== q.hasDeadline) return false;
    if (q.deadlineBefore && (!it.deadline || it.deadline > q.deadlineBefore)) return false;
    const inst = idx.currentInstance(it);
    const firstStart = (idx.instancesByItem.get(it.id) ?? [])[0]?.startedOn;
    if (q.startedAfter && (!firstStart || firstStart < q.startedAfter)) return false;
    if (q.startedBefore && (!firstStart || firstStart > q.startedBefore)) return false;
    const fin = inst?.finishedOn;
    if (q.finishedAfter && (!fin || fin < q.finishedAfter)) return false;
    if (q.finishedBefore && (!fin || fin > q.finishedBefore)) return false;
    if (q.startedNotFinished && !((it.status === 'reading' || it.status === 'paused' || it.status === 'dnf') && idx.position(it) > 0)) return false;
    const prog = progressOf(idx, it);
    if (q.minProgress !== undefined && (prog === undefined || prog < q.minProgress)) return false;
    if (q.maxProgress !== undefined && (prog === undefined || prog > q.maxProgress)) return false;
    if (q.untouchedDays !== undefined) {
      if (it.status !== 'reading' && it.status !== 'paused') return false;
      const last = idx.lastReadDate(it);
      if (last && diffDays(last, idx.today) < q.untouchedDays) return false;
    }
    if (q.maxHours !== undefined) {
      if (!UNITS[it.unit].time || !it.total || it.total / 60 > q.maxHours) return false;
    }
    if (q.histFrom !== undefined || q.histTo !== undefined) {
      if (it.histStart === undefined) return false;
      const end = it.histEnd ?? it.histStart;
      if (q.histFrom !== undefined && end < q.histFrom) return false;
      if (q.histTo !== undefined && it.histStart > q.histTo) return false;
    }
    if (q.behindSchedule !== undefined || q.minSpeed !== undefined || q.maxSpeed !== undefined) {
      const f = itemForecast(idx, it);
      if (q.behindSchedule !== undefined && (f.status === 'behind' || f.status === 'overdue') !== q.behindSchedule) return false;
      if (q.minSpeed !== undefined && (f.speedPerHour === undefined || f.speedPerHour < q.minSpeed)) return false;
      if (q.maxSpeed !== undefined && (f.speedPerHour === undefined || f.speedPerHour > q.maxSpeed)) return false;
    }
    return true;
  });
}

export function sortItems(idx: LibraryIndex, items: Item[], key: SortKey, dir: 'asc' | 'desc' = 'asc'): Item[] {
  const val = (it: Item): string | number | undefined => {
    switch (key) {
      case 'title': return norm(it.title.replace(/^(the|a|an)\s+/i, ''));
      case 'author': return norm(idx.authorNames(it)[0]?.split(' ').slice(-1)[0] ?? '￿');
      case 'added': return it.createdAt;
      case 'started': return (idx.instancesByItem.get(it.id) ?? [])[0]?.startedOn;
      case 'finished': return idx.currentInstance(it)?.finishedOn;
      case 'progress': return progressOf(idx, it);
      case 'pages': return pagesOf(it);
      case 'rating': return idx.rating(it);
      case 'deadline': return it.deadline;
      case 'estimate': return itemForecast(idx, it).estimatedFinish;
      case 'recent': return it.lastReadAt;
    }
  };
  const withVals = items.map((it) => ({ it, v: val(it) }));
  withVals.sort((a, b) => {
    // Missing values always sort last.
    if (a.v === undefined && b.v === undefined) return 0;
    if (a.v === undefined) return 1;
    if (b.v === undefined) return -1;
    const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
    return dir === 'asc' ? c : -c;
  });
  return withVals.map((x) => x.it);
}

// ────────────────────────────────────────────────────────────────────────────
// Smart collections

export function ruleToQuery(rule: Rule): LibraryQuery | ((idx: LibraryIndex, it: Item) => boolean) {
  const v = rule.value;
  const num = Number(v);
  switch (rule.field) {
    case 'pages':
      return rule.op === 'gt' || rule.op === 'gte' ? { minPages: rule.op === 'gt' ? num + 1 : num } : { maxPages: rule.op === 'lt' ? num - 1 : num };
    case 'rating':
      return rule.op === 'gt' || rule.op === 'gte' ? { minRating: rule.op === 'gt' ? num + 0.5 : num } : rule.op === 'eq' ? { minRating: num, maxRating: num } : { maxRating: rule.op === 'lt' ? num - 0.5 : num };
    case 'status':
      return rule.op === 'neq' ? (_i, it) => it.status !== v : { statuses: [v as Status] };
    case 'contentType':
      return rule.op === 'neq' ? (_i, it) => it.contentType !== v : { contentTypes: [v as ContentType] };
    case 'genre':
      return (_i, it) => it.genres.some((g) => norm(g).includes(norm(String(v))));
    case 'tag':
      return (idx, it) => it.tagIds.some((t) => norm(idx.tags.get(t)?.name ?? '') === norm(String(v)));
    case 'folder':
      return { folderIds: [String(v)] };
    case 'author':
      return { author: String(v) };
    case 'publishedYear':
      return rule.op === 'lt' || rule.op === 'lte' ? { publishedBefore: rule.op === 'lt' ? num : num + 1 } : { publishedAfter: rule.op === 'gt' ? num : num - 1 };
    case 'progress':
      return rule.op === 'gt' || rule.op === 'gte' ? { minProgress: num / 100 } : { maxProgress: num / 100 };
    case 'untouchedDays':
      return { untouchedDays: num };
    case 'behindSchedule':
      return { behindSchedule: v === true || v === 'true' };
    case 'durationHours':
      return { maxHours: num };
    case 'text':
      return { subject: String(v) };
    case 'favorite':
      return { favorite: v === true || v === 'true' };
  }
}

export function evalCollection(idx: LibraryIndex, c: SmartCollection): Item[] {
  const items = idx.itemList();
  if (!c.rules.length) return [];
  const sets = c.rules.map((r) => {
    const q = ruleToQuery(r);
    return new Set(typeof q === 'function' ? items.filter((it) => q(idx, it)).map((i) => i.id) : runQuery(idx, q, items).map((i) => i.id));
  });
  return items.filter((it) => (c.match === 'all' ? sets.every((s) => s.has(it.id)) : sets.some((s) => s.has(it.id))));
}

export const PRESET_COLLECTIONS: { name: string; icon: string; rules: Rule[] }[] = [
  { name: 'Long reads (500+ pages)', icon: '📚', rules: [{ field: 'pages', op: 'gte', value: 500 }] },
  { name: 'Rated 4+', icon: '⭐', rules: [{ field: 'rating', op: 'gte', value: 4 }] },
  { name: 'Not started', icon: '🌱', rules: [{ field: 'status', op: 'is', value: 'want' }] },
  { name: 'Untouched for 30 days', icon: '🕸️', rules: [{ field: 'untouchedDays', op: 'gte', value: 30 }] },
  { name: 'Published before 1900', icon: '🏛️', rules: [{ field: 'publishedYear', op: 'lt', value: 1900 }] },
  { name: 'Behind schedule', icon: '⏰', rules: [{ field: 'behindSchedule', op: 'is', value: true }] },
  { name: 'Audiobooks under 10 hours', icon: '🎧', rules: [{ field: 'contentType', op: 'is', value: 'audiobook' }, { field: 'durationHours', op: 'lte', value: 10 }] },
  { name: 'Above 80%', icon: '🏁', rules: [{ field: 'progress', op: 'gte', value: 80 }, { field: 'status', op: 'is', value: 'reading' }] },
];

// ────────────────────────────────────────────────────────────────────────────
// Global search

export interface SearchResults {
  items: Item[];
  authors: { id: string; name: string; count: number }[];
  folders: { id: string; name: string; path: string }[];
  notes: { id: string; text: string; itemId?: string; kind: 'note' | 'quote' }[];
  concepts: { id: string; name: string; kind: string }[];
  projects: { id: string; name: string }[];
  timeline: { id: string; label: string; year?: number; kind: 'item' | 'concept' }[];
  tags: { id: string; name: string }[];
  total: number;
}

export function searchAll(idx: LibraryIndex, raw: string, limit = 12): SearchResults {
  const q = norm(raw.trim());
  const empty: SearchResults = { items: [], authors: [], folders: [], notes: [], concepts: [], projects: [], timeline: [], tags: [], total: 0 };
  if (!q) return empty;
  const has = (s?: string) => !!s && matchesText(norm(s), q);
  const items = idx
    .itemList()
    .map((it) => {
      const title = norm(it.title);
      const score = title.startsWith(q) ? 3 : title.includes(q) ? 2 : matchesText(itemHaystack(idx, it, false), q) ? 1 : 0;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it);
  const authors = idx.snap.authors
    .filter((a) => has(a.name))
    .map((a) => ({ id: a.id, name: a.name, count: idx.itemList().filter((i) => i.authorIds.includes(a.id)).length }));
  const folders = idx.snap.folders.filter((f) => has(f.name) || has(f.description)).map((f) => ({ id: f.id, name: f.name, path: idx.folderPath(f.id).map((x) => x.name).join(' / ') }));
  const notes = idx.snap.notes.filter((n) => has(n.text) || n.tags.some(has)).map((n) => ({ id: n.id, text: n.text, itemId: n.itemId, kind: n.kind }));
  const concepts = idx.snap.concepts.filter((c) => has(c.name) || has(c.description)).map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const projects = idx.snap.projects.filter((p) => has(p.name) || has(p.description)).map((p) => ({ id: p.id, name: p.name }));
  const tags = idx.snap.tags.filter((t) => has(t.name)).map((t) => ({ id: t.id, name: t.name }));
  const timeline = [
    ...concepts.filter((c) => idx.concepts.get(c.id)?.start !== undefined).map((c) => ({ id: c.id, label: c.name, year: idx.concepts.get(c.id)!.start, kind: 'concept' as const })),
    ...items.filter((i) => i.histStart !== undefined).map((i) => ({ id: i.id, label: i.title, year: i.histStart, kind: 'item' as const })),
  ];
  const res = {
    items: items.slice(0, limit),
    authors: authors.slice(0, limit),
    folders: folders.slice(0, limit),
    notes: notes.slice(0, limit),
    concepts: concepts.slice(0, limit),
    projects: projects.slice(0, limit),
    timeline: timeline.slice(0, limit),
    tags: tags.slice(0, limit),
    total: 0,
  };
  res.total = items.length + authors.length + folders.length + notes.length + concepts.length + projects.length + tags.length;
  return res;
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic natural-language → LibraryQuery parser (no AI required).

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const TYPE_WORDS: [RegExp, ContentType][] = [
  [/\baudio ?books?\b/, 'audiobook'],
  [/\be-?books?\b/, 'ebook'],
  [/\bpodcasts?\b/, 'podcast'],
  [/\bcourses?\b/, 'course'],
  [/\barticles?\b/, 'article'],
  [/\btextbooks?\b/, 'textbook'],
  [/\b(comics?|graphic novels?)\b/, 'comic'],
];

export interface ParsedQuestion {
  query: LibraryQuery;
  intent: 'list' | 'count' | 'remaining' | 'next';
  understood: string[];
}

export function parseQuestion(text: string, idx?: LibraryIndex): ParsedQuestion {
  let s = ' ' + norm(text).replace(/[?!.,]/g, ' ') + ' ';
  const q: LibraryQuery = {};
  const understood: string[] = [];
  let intent = 'list' as ParsedQuestion['intent'];
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(re, ' ');
    }
  };
  take(/\bhow many (pages|hours|minutes)[^]*?\b(left|remaining|remain)\b/, () => { intent = 'remaining'; understood.push('remaining amount'); });
  take(/\bhow many\b/, () => { intent = 'count'; });
  take(/\bwhat should i read next\b|\bread next\b/, () => { intent = 'next'; understood.push('reading order'); });
  take(/\b(started|began) but (never |not |haven'?t )?finish(ed)?\b/, () => { q.startedNotFinished = true; understood.push('started but not finished'); });
  take(/\b(under|less than|fewer than|below|shorter than) (\d+) pages?\b/, (m) => { q.maxPages = Number(m[2]); understood.push(`≤ ${m[2]} pages`); });
  take(/\b(over|more than|longer than|above) (\d+) pages?\b/, (m) => { q.minPages = Number(m[2]); understood.push(`≥ ${m[2]} pages`); });
  take(/\b(under|less than) (\d+) hours?\b/, (m) => { q.maxHours = Number(m[2]); understood.push(`≤ ${m[2]} hours`); });
  take(/\brated (\d(?:\.5)?|one|two|three|four|five) stars?( or (more|higher|above))?\b|\b(\d(?:\.5)?)\+? stars?\b/, (m) => {
    const raw = m[1] ?? m[4];
    const n = NUM_WORDS[raw] ?? Number(raw);
    if (m[2] || /\+/.test(m[0])) q.minRating = n;
    else { q.minRating = n; q.maxRating = n + 0.5; }
    understood.push(`rated ${n}★${m[2] ? '+' : ''}`);
  });
  take(/\b(published|written) before (\d{3,4})( bce| bc)?\b/, (m) => { q.publishedBefore = m[3] ? -Number(m[2]) : Number(m[2]); understood.push(`published before ${m[2]}`); });
  take(/\b(published|written) after (\d{3,4})\b/, (m) => { q.publishedAfter = Number(m[2]); understood.push(`published after ${m[2]}`); });
  take(/\b(unread|not started|haven'?t (started|read)|want to read)\b/, () => { q.statuses = ['want']; understood.push('not started'); });
  take(/\b(currently reading|in progress|i'?m reading)\b/, () => { q.statuses = ['reading']; understood.push('currently reading'); });
  take(/\b(finished|completed|have read|i'?ve read|read already)\b/, () => { q.statuses = ['read']; understood.push('finished'); });
  take(/\b(abandoned|did not finish|didn'?t finish|dnf)\b/, () => { q.statuses = ['dnf']; understood.push("didn't finish"); });
  take(/\b(paused|set aside|on hold)\b/, () => { q.statuses = ['paused']; understood.push('paused'); });
  take(/\bfavou?rites?\b/, () => { q.favorite = true; understood.push('favorites'); });
  take(/\bbeginner\b/, () => { q.difficulty = 'beginner'; understood.push('beginner'); });
  for (const [re, t] of TYPE_WORDS) take(re, () => { q.contentTypes = [...(q.contentTypes ?? []), t]; understood.push(t); });
  take(/\bby ([a-z][a-z .'-]+?)(?= (about|on|under|over|rated|that|which|published)\b| $)/, (m) => { q.author = m[1].trim(); understood.push(`by ${q.author}`); });
  take(/\b(about|on|regarding|covering|connect(?:ing)?|related to) ([a-z0-9][^]*?)\s*$/, (m) => {
    const subj = m[2].replace(/\b(do i own|i own|in my library|that i have|books?|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (subj) { q.subject = subj; understood.push(`about “${subj}”`); }
  });
  // Folder names mentioned verbatim become folder filters.
  if (idx && !q.subject) {
    for (const f of idx.snap.folders) {
      if (f.name.length > 2 && s.includes(' ' + norm(f.name) + ' ')) {
        q.folderIds = [...(q.folderIds ?? []), f.id];
        understood.push(`folder ${f.name}`);
      }
    }
  }
  if (intent === 'remaining' && !q.statuses) q.statuses = ['want', 'reading', 'paused'];
  if (intent === 'remaining' && !q.subject && !q.folderIds) {
    const m = s.match(/\bof ([a-z][a-z ]+?) (do i have |have i |i have )?(left|remaining)?\s*$/);
    if (m) { q.subject = m[1].trim(); understood.push(`about “${q.subject}”`); }
  }
  return { query: q, intent, understood };
}

export function isEmptyQuery(q: LibraryQuery): boolean {
  return Object.values(q).every((v) => v === undefined || (Array.isArray(v) && v.length === 0));
}

export function recentCutoff(idx: LibraryIndex, days: number): DateKey {
  return addDays(idx.today, -days);
}
