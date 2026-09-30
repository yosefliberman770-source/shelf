// "The world of this book": the book's own historical geography, built once
// (on request, in the background, chapter by chapter, resumable) and kept
// locally:
//
//   book → section → place mention (with its exact position) → identified place → source
//
// Names come from the text (place words, names you already know, or the AI
// book analysis); locations only from datasets. Dates come from what the book
// writes. Nothing is sent to an AI here.
import { allEvents, allWars, type AtlasEvent, type Polity, politiesAt } from '../atlas/context';
import type { Pos } from '../atlas/data';
import { resolvePlace } from '../atlas/resolve';
import type { HistYear } from '../atlas/time';
import { db } from '../db/db';
import type { BookWorldRow, Item } from '../db/types';
import { findDatesInText } from '../lib/history/dates';
import { detectPlaces } from '../lib/history/placeDetect';
import { type HistDate, UNKNOWN_DATE } from './histdate';

export const BOOK_WORLD_VERSION = 1;

/** What the reader page can give us for one section of the book (loaded off-screen, then released). */
export interface SectionText { href: string; label?: string; text: string; cfiOf: (name: string) => string | undefined }

export const getBookWorld = (bookId: string) => db.bookWorld.get(bookId);

/**
 * Read every section once: place mentions (with the position of the first),
 * dates written in the text, and wars/events named outright. Already-read
 * sections are skipped, so an interrupted build picks up where it stopped.
 */
export async function buildBookWorld(bookId: string, count: number, load: (i: number) => Promise<SectionText | undefined>, names: { known: { name: string; detection: 'known' | 'ai' | string }[]; people: string[] }, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<BookWorldRow> {
  let row = await db.bookWorld.get(bookId);
  if (!row || row.version !== BOOK_WORLD_VERSION || row.sectionCount !== count) row = { id: bookId, version: BOOK_WORLD_VERSION, chapters: [], resolved: {}, done: false, sectionCount: count, updatedAt: Date.now() };
  const [wars, events] = await Promise.all([allWars().catch(() => []), allEvents().catch(() => [] as AtlasEvent[])]);
  const warNames = wars.filter((w) => w.n.length > 8).map((w) => ({ q: w.q, n: w.n.toLowerCase() }));
  const eventNames = events.filter((e) => e.n.length > 10).map((e) => ({ q: e.q, n: e.n.toLowerCase() }));
  const how = new Map(names.known.map((k) => [k.name.toLowerCase(), k.detection]));
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    if (row.chapters.some((c) => c.index === i)) { onProgress?.(i + 1, count); continue; }
    const s = await load(i).catch(() => undefined);
    if (s && s.text.trim().length > 40) {
      const found = detectPlaces(s.text, names.known.map((k) => k.name), names.people).slice(0, 80);
      const lower = s.text.toLowerCase();
      row.chapters.push({
        index: i, href: s.href, label: s.label,
        dates: findDatesInText(s.text).map((d) => d.year).slice(0, 200),
        wars: warNames.filter((w) => lower.includes(w.n)).map((w) => w.q).slice(0, 20),
        events: eventNames.filter((e) => lower.includes(e.n)).map((e) => e.q).slice(0, 30),
        mentions: found.map((m) => ({ name: m.name, count: m.count, cfi: s.cfiOf(m.name), detection: (how.get(m.name.toLowerCase()) as 'known' | 'ai' | undefined) ?? 'cue' })),
      });
    }
    row.updatedAt = Date.now();
    if (i % 5 === 4 || i === count - 1) await db.bookWorld.put(row);
    onProgress?.(i + 1, count);
    // Give the reader room to breathe between sections.
    await new Promise((r) => setTimeout(r, 30));
  }
  row.chapters.sort((a, b) => a.index - b.index);
  await db.bookWorld.put(row);
  return row;
}

/** The book's period, from the dates it writes: the middle 80% of them, never a single exact year. */
export function bookPeriod(row: BookWorldRow | undefined, item?: Pick<Item, 'histStart' | 'histEnd'>): HistDate {
  const ys = (row?.chapters ?? []).flatMap((c) => c.dates).filter((y) => y !== 0).sort((a, b) => a - b);
  if (ys.length >= 3) {
    const q = (p: number) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(p * (ys.length - 1))))];
    return { earliest: q(0.1), latest: q(0.9), preferred: q(0.5), precision: 'range', qualifier: 'between', source: `${ys.length} dates written in the book`, label: 'Most dates the book mentions fall in this span' };
  }
  if (item?.histStart !== undefined || item?.histEnd !== undefined) return { earliest: item.histStart, latest: item.histEnd, preferred: item.histStart, precision: 'range', qualifier: 'between', source: 'The period recorded for this book' };
  if (ys.length) return { earliest: ys[0], latest: ys[ys.length - 1], preferred: ys[0], precision: 'range', qualifier: 'between', source: 'dates written in the book' };
  return { ...UNKNOWN_DATE, source: 'The book gives no dates Shelf could read' };
}

/** Identify each distinct place name once: offline for all, online (cached) for the most-mentioned rest. */
export async function resolveBookWorld(row: BookWorldRow, year: HistYear | undefined, bookId: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<BookWorldRow> {
  const counts = new Map<string, { n: number; detection: string }>();
  for (const c of row.chapters) for (const m of c.mentions) counts.set(m.name, { n: (counts.get(m.name)?.n ?? 0) + m.count, detection: m.detection });
  const todo = [...counts].filter(([n]) => !(n in row.resolved)).sort((a, b) => b[1].n - a[1].n);
  let done = 0;
  const onlineBudget = { left: 25 };
  for (const [name, info] of todo) {
    if (signal?.aborted) break;
    let res = await resolvePlace(name, { year, bookId, detection: info.detection as 'cue', online: false }).catch(() => undefined);
    if (!res?.place && onlineBudget.left > 0 && info.n >= 2) {
      onlineBudget.left--;
      res = await resolvePlace(name, { year, bookId, detection: info.detection as 'cue', signal }).catch(() => undefined);
    }
    const p = res?.place && (res.status === 'HIGH' || res.status === 'MEDIUM') ? res.place : undefined;
    row.resolved[name] = p ? { key: p.key, title: p.title, lat: p.lat, lon: p.lon, source: p.sources[0]?.name ?? '', status: res!.status } : null;
    onProgress?.(++done, todo.length);
    if (done % 10 === 0) await db.bookWorld.put(row);
  }
  row.done = !signal?.aborted;
  row.updatedAt = Date.now();
  await db.bookWorld.put(row);
  return row;
}

export interface WorldPlace { key: string; title: string; written: string[]; lat: number; lon: number; source: string; mentions: number; chapters: number[]; first?: { chapter: number; cfi?: string } }
export interface WorldProfile {
  period: HistDate;
  places: WorldPlace[];
  unresolved: { name: string; mentions: number }[];
  bbox?: [number, number, number, number];
  centre?: Pos;
  polities: Polity[];
  wars: { q: string; n: string; chapters: number[] }[];
  events: (AtlasEvent & { chapters: number[] })[];
}

/** Summarise the built world: places by mentions, where the book is set, the polities there in its period, the wars and events it names. */
export async function worldProfile(row: BookWorldRow, item?: Pick<Item, 'histStart' | 'histEnd'>): Promise<WorldProfile> {
  const period = bookPeriod(row, item);
  const byKey = new Map<string, WorldPlace>();
  const unresolved = new Map<string, number>();
  for (const c of row.chapters) {
    for (const m of c.mentions) {
      const r = row.resolved[m.name];
      if (!r) { if (r === null) unresolved.set(m.name, (unresolved.get(m.name) ?? 0) + m.count); continue; }
      const cur = byKey.get(r.key) ?? { key: r.key, title: r.title, written: [], lat: r.lat, lon: r.lon, source: r.source, mentions: 0, chapters: [] };
      cur.mentions += m.count;
      if (!cur.written.includes(m.name)) cur.written.push(m.name);
      if (!cur.chapters.includes(c.index)) cur.chapters.push(c.index);
      cur.first ??= { chapter: c.index, cfi: m.cfi };
      byKey.set(r.key, cur);
    }
  }
  const places = [...byKey.values()].sort((a, b) => b.mentions - a.mentions);
  // Where the book is set: the box around the places mentioned more than once (single stray mentions don't stretch it).
  const core = places.filter((p) => p.mentions >= 2).length >= 3 ? places.filter((p) => p.mentions >= 2) : places;
  const bbox = core.length ? ([Math.min(...core.map((p) => p.lon)), Math.min(...core.map((p) => p.lat)), Math.max(...core.map((p) => p.lon)), Math.max(...core.map((p) => p.lat))] as [number, number, number, number]) : undefined;
  const centre: Pos | undefined = places[0] ? [places[0].lon, places[0].lat] : undefined;
  const year = period.preferred ?? period.earliest;
  const pol = year !== undefined ? (await Promise.all(places.slice(0, 8).map((p) => politiesAt([p.lon, p.lat], year).catch(() => [] as Polity[])))).flat() : [];
  const polities = [...new Map(pol.map((p) => [p.n, p])).values()];
  const [wars, events] = await Promise.all([allWars().catch(() => []), allEvents().catch(() => [] as AtlasEvent[])]);
  const warCh = new Map<string, number[]>();
  const evCh = new Map<string, number[]>();
  for (const c of row.chapters) {
    for (const q of c.wars) warCh.set(q, [...(warCh.get(q) ?? []), c.index]);
    for (const q of c.events) evCh.set(q, [...(evCh.get(q) ?? []), c.index]);
  }
  return {
    period, places, bbox, centre, polities,
    unresolved: [...unresolved].map(([name, mentions]) => ({ name, mentions })).sort((a, b) => b.mentions - a.mentions),
    wars: wars.filter((w) => warCh.has(w.q)).map((w) => ({ q: w.q, n: w.n, chapters: warCh.get(w.q)! })),
    events: events.filter((e) => evCh.has(e.q)).map((e) => ({ ...e, chapters: evCh.get(e.q)! })).sort((a, b) => a.y - b.y),
  };
}
