// Keys for remembered answers. A name keeps its letters in every script (Αθήνα, Москва, 北京, Łódź): only accents,
// case and spacing are folded, as in the place index. Different names never share a key, so a reader's choice or a
// cached answer for one is never returned for another.
import { crc32, normName } from '../../atlas/gazetteer';
import { norm as legacyNorm } from './assess';

export const nameKey = (name: string) => normName(name) || name.trim().toLowerCase();

/** The reader's choice for a name in a book. */
export const choiceKey = (bookId: string, name: string) => `${bookId}|${nameKey(name)}`;

/**
 * Keys a choice may have been stored under before names kept their script (Latin-only folding). Read as a fallback
 * so earlier choices are not lost; an empty old key (a non-Latin name) is never read, because every such name
 * shared it.
 */
export function legacyChoiceKeys(bookId: string, name: string): string[] {
  const old = legacyNorm(name);
  return old && `${bookId}|${old}` !== choiceKey(bookId, name) ? [`${bookId}|${old}`] : [];
}

/** A short fingerprint of what a lookup used besides the name: the book's places and the names around it. */
export function contextFingerprint(points?: { lat: number; lon: number }[], nearby?: string[]): string {
  const pts = (points ?? []).map((p) => `${Math.round(p.lat * 2) / 2},${Math.round(p.lon * 2) / 2}`).sort();
  const names = (nearby ?? []).map(nameKey).sort();
  if (!pts.length && !names.length) return 'none';
  return crc32(JSON.stringify([...new Set(pts)].concat('|', [...new Set(names)]))).toString(36);
}
