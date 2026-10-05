// A place's key ("pleiades:423025", "canmore:52034~2") can change when the data is rebuilt: a record is re-read with a
// new id, a duplicate id gets a suffix, a source's records are reissued. The reader's notes, the places met in each
// book and their chosen places must still open the same place (C3). Each keeps the place's name and position, so a key
// that no longer exists is found again by them — the same name, within a short distance, the same dataset first — and
// the stored key is moved to the new one. A place that can't be found again is left as it was, never re-pointed at a
// guess: its note still opens by name.
import { db } from '../db/db';
import { km, type Pos } from './data';
import { GAZETTEERS, type GazPlace, getPlace, nearbyPlaces, normName, placeDataVersion, placesByName } from './gazetteer';

/** How far a re-found record may lie from where the key's record was: a re-read, not another place. */
export const RELOCATE_KM = 2;

const isGazetteerKey = (key: string) => GAZETTEERS.some((g) => key.startsWith(`${g.id}:`));

/**
 * The record a stored key stands for in today's data: the key itself if it still exists; otherwise the record with
 * the same name within RELOCATE_KM of the stored position, preferring the same dataset and then the nearest. Without
 * a position, only a single record of that name in the same dataset is taken.
 */
export async function relocatePlace(key: string, name: string, at?: Pos): Promise<GazPlace | undefined> {
  const now = await getPlace(key, at).catch(() => undefined);
  if (now || !isGazetteerKey(key) || !name.trim()) return now;
  const src = key.slice(0, key.indexOf(':'));
  const named = (await placesByName(name).catch(() => [])).map((h) => h.place);
  if (at) {
    let near = named.filter((p) => km([p.lon, p.lat], at) <= RELOCATE_KM);
    // A renamed record (a decoding fix, a new spelling) at the same spot in the same dataset.
    if (!near.length) near = (await nearbyPlaces(at, RELOCATE_KM, { filter: (p) => p.gazetteer === src && normName(p.title).replace(/\s/g, '') === normName(name).replace(/\s/g, '') }).catch(() => [])).map((x) => x.place);
    return near.sort((a, b) => Number(b.gazetteer === src) - Number(a.gazetteer === src) || km([a.lon, a.lat], at) - km([b.lon, b.lat], at))[0];
  }
  const same = named.filter((p) => p.gazetteer === src);
  return same.length === 1 ? same[0] : undefined;
}

const CHECKED = 'shelf-place-keys-checked';
const readChecked = () => { try { return localStorage.getItem(CHECKED); } catch { return null; } };
const writeChecked = (v: string) => { try { localStorage.setItem(CHECKED, v); } catch { /* not kept: checked again next time */ } };

/**
 * Once per data build: every note and every place met in a book whose key no longer exists is moved to the record it
 * now has. Returns what it did, so it can be tested and reported.
 */
export async function repairPlaceKeys(force = false): Promise<{ checked: number; moved: number; lost: number }> {
  const version = await placeDataVersion().catch(() => undefined);
  if (!force && version && readChecked() === version) return { checked: 0, moved: 0, lost: 0 };
  const [notes, visits] = await Promise.all([db.mapNotes.toArray(), db.placeVisits.toArray()]);
  const wanted = new Map<string, { name: string; at: Pos }>();
  for (const n of notes) if (isGazetteerKey(n.placeKey)) wanted.set(n.placeKey, { name: n.placeName, at: [n.lon, n.lat] });
  for (const v of visits) if (isGazetteerKey(v.placeKey) && !wanted.has(v.placeKey)) wanted.set(v.placeKey, { name: v.name, at: [v.lon, v.lat] });
  let moved = 0;
  let lost = 0;
  for (const [key, { name, at }] of wanted) {
    if (await getPlace(key, at).catch(() => undefined)) continue;
    const p = await relocatePlace(key, name, at);
    if (!p) { lost++; continue; }
    moved++;
    await db.transaction('rw', db.mapNotes, db.placeVisits, async () => {
      await db.mapNotes.where('placeKey').equals(key).modify({ placeKey: p.key });
      for (const v of await db.placeVisits.where('placeKey').equals(key).toArray()) {
        const id = `${v.bookId}|${p.key}`;
        const cur = await db.placeVisits.get(id);
        await db.placeVisits.delete(v.id);
        // Met under both keys: one entry, the counts added.
        await db.placeVisits.put(cur ? { ...cur, count: cur.count + v.count, firstAt: Math.min(cur.firstAt, v.firstAt), lastAt: Math.max(cur.lastAt, v.lastAt) } : { ...v, id, placeKey: p.key });
      }
    });
  }
  if (version) writeChecked(version);
  return { checked: wanted.size, moved, lost };
}
