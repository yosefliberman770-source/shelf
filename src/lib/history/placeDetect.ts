// Finding place names in the text being read — conservatively. Only names
// that are already known places (your Knowledge Atlas, X-Ray) or that read
// like places ("marched to Capua", "the siege of Carthage") are offered, so
// ordinary capitalised words aren't turned into map links.
import type { Item } from '../../db/types';
import { findDatesInText, nearestDate } from './dates';

export interface PlaceMention { name: string; count: number; index: number; known: boolean }

const PLACE_CUE = /\b(?:to|from|at|in|near|toward|towards|into|of|across|through|beyond|around|reached|besieged|entered|left|crossed|captured|took|sacked|founded|conquered|invaded|attacked|abandoned|occupied|garrisoned|siege of|battle of|walls of|city of|port of|island of|kingdom of|province of|river|mount|lake)\s+((?:[A-Z][\p{Ll}'’-]+)(?:\s+(?:[A-Z][\p{Ll}'’-]+|de|del|la|le|of|on|upon|am|an)){0,3})/gu;
const NOT_PLACE = new Set(('I Me My He She It They We You His Her Their Our The A An This That These Those Then There Here When Where Why How What Who God Lord Sir Lady Mr Mrs Dr King Queen Prince Emperor Pope Saint St Chapter Book Part Volume Section Figure Table Note Notes Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christ Jesus Latin Greek English French German Romans Greeks Christians Muslims Jews Senate Consul Consuls Army General Caesar').split(' '));

/**
 * Candidate places in a passage. `known` names (atlas/X-Ray places) are always
 * included; other names only when a place cue precedes them and they don't
 * belong to `people`.
 */
export function detectPlaces(text: string, known: string[] = [], people: string[] = []): PlaceMention[] {
  const out = new Map<string, PlaceMention>();
  const add = (name: string, index: number, isKnown: boolean) => {
    const clean = name.replace(/[’']s$/, '').replace(/\s+(of|on|upon|de|la|le|am|an)$/i, '').trim();
    if (clean.length < 3 || NOT_PLACE.has(clean.split(' ')[0])) return;
    if (people.some((p) => p.toLowerCase() === clean.toLowerCase() || p.split(' ').includes(clean))) return;
    const k = clean.toLowerCase();
    const cur = out.get(k);
    if (cur) { cur.count++; cur.known ||= isKnown; } else out.set(k, { name: clean, count: 1, index, known: isKnown });
  };
  for (const n of known) {
    const re = new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu');
    for (const m of text.matchAll(re)) add(n, m.index ?? 0, true);
  }
  for (const m of text.matchAll(PLACE_CUE)) add(m[1], (m.index ?? 0) + m[0].length - m[1].length, false);
  return [...out.values()].sort((a, b) => Number(b.known) - Number(a.known) || a.index - b.index);
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
