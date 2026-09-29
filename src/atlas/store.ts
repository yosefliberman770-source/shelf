// The reader's own atlas data, kept on this device with the rest of their
// reading data (and in backups): saved map views, private notes on places,
// and the places they have met in each book. None of it is ever sent to a
// historical data service.
import { db, uid } from '../db/db';
import type { MapBookmarkRow, MapNoteRow, PlaceVisitRow } from '../db/types';

export async function saveBookmark(b: Omit<MapBookmarkRow, 'id' | 'createdAt'>): Promise<string> {
  const id = uid();
  await db.mapBookmarks.put({ ...b, id, createdAt: Date.now() });
  return id;
}
export const deleteBookmark = (id: string) => db.mapBookmarks.delete(id);

export async function saveNote(n: { id?: string; placeKey: string; placeName: string; lat: number; lon: number; text: string; bookId?: string }): Promise<void> {
  const now = Date.now();
  if (n.id) {
    if (!n.text.trim()) { await db.mapNotes.delete(n.id); return; }
    await db.mapNotes.update(n.id, { text: n.text, updatedAt: now });
    return;
  }
  if (!n.text.trim()) return;
  await db.mapNotes.put({ ...n, id: uid(), createdAt: now, updatedAt: now });
}
export const deleteNote = (id: string) => db.mapNotes.delete(id);
export const notesFor = (placeKey: string) => db.mapNotes.where('placeKey').equals(placeKey).toArray();

/** Remember that the reader met this place in the book (first position kept). */
export async function recordVisit(v: { bookId: string; placeKey: string; name: string; written: string; lat: number; lon: number; chapter?: string; cfi?: string }): Promise<void> {
  const id = `${v.bookId}|${v.placeKey}`;
  const now = Date.now();
  await db.transaction('rw', db.placeVisits, async () => {
    const cur = await db.placeVisits.get(id);
    if (cur) await db.placeVisits.update(id, { count: cur.count + 1, lastAt: now, ...(cur.cfi ? {} : { cfi: v.cfi, chapter: v.chapter }) });
    else await db.placeVisits.put({ ...v, id, count: 1, firstAt: now, lastAt: now } satisfies PlaceVisitRow);
  });
}
export const forgetVisit = (id: string) => db.placeVisits.delete(id);
export type { MapBookmarkRow, MapNoteRow, PlaceVisitRow };
