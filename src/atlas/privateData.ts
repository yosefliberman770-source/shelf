/**
 * Private data pack: historical datasets Shelf may use privately but must not republish (no stated licence,
 * or terms that forbid redistribution). They are never in the public repository or the deployed site. The
 * owner loads one pack file into the app; it is kept on the device and read in slices — tiles by range, place
 * records by map cell or name shard — exactly like the public files.
 *
 * Pack format (written by scripts/atlas-build/private_pack.py):
 *   8 bytes  "SHELFPK1"
 *   4 bytes  header length N (little-endian uint32)
 *   N bytes  header JSON: { version, built, datasets: [{ id, name, records, licence }], files: { path: [offset, length] } }
 *   …        file bytes; offsets are from the end of the header
 */

export interface PrivateDataset { id: string; name: string; records: number; licence: string }
export interface PrivateHeader { version: number; built: string; datasets: PrivateDataset[]; files: Record<string, [number, number]> }
interface Loaded { header: PrivateHeader; blob: Blob; start: number }

const MAGIC = 'SHELFPK1';
const DB = 'shelf-private-data';
const STORE = 'pack';
/** Tiles in the pack are addressed as pmtiles://shelf-private/<file>. */
export const PRIVATE_TILE_PREFIX = 'shelf-private/';

let loaded: Loaded | null = null;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = run(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Read and check a pack's header. Throws with a plain message if the file is not a Shelf data pack. */
export async function readHeader(blob: Blob): Promise<Loaded> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error('This is not a Shelf private data file.');
  const n = new DataView(head.buffer).getUint32(8, true);
  const header = JSON.parse(await blob.slice(12, 12 + n).text()) as PrivateHeader;
  if (header.version !== 1) throw new Error('This data file needs a newer version of Shelf.');
  return { header, blob, start: 12 + n };
}

/** Load the pack stored on this device, if any. Call once before the map and place lookups start. */
export async function loadPrivateData(): Promise<PrivateHeader | null> {
  if (loaded) return loaded.header;
  if (typeof indexedDB === 'undefined') return null;
  try {
    const blob = await tx<Blob | undefined>('readonly', (s) => s.get('current'));
    loaded = blob ? await readHeader(blob) : null;
  } catch {
    loaded = null;
  }
  return loaded?.header ?? null;
}

/** Use a pack for this session without storing it (installPrivateData stores it too). */
export async function openPrivateData(file: Blob): Promise<PrivateHeader> {
  loaded = await readHeader(file);
  return loaded.header;
}

/** Store a pack file on this device (replacing any earlier one). */
export async function installPrivateData(file: Blob): Promise<PrivateHeader> {
  const l = await readHeader(file);
  await tx('readwrite', (s) => s.put(file, 'current'));
  loaded = l;
  return l.header;
}

/** Forget the pack for this session (tests; removePrivateData also deletes it from the device). */
export const closePrivateData = () => { loaded = null; };

export async function removePrivateData(): Promise<void> {
  await tx('readwrite', (s) => s.delete('current'));
  loaded = null;
}

export const privateHeader = (): PrivateHeader | null => loaded?.header ?? null;
export const privateHas = (path: string): boolean => !!loaded?.header.files[path];

function slice(path: string): Blob | null {
  const f = loaded?.header.files[path];
  return f && loaded ? loaded.blob.slice(loaded.start + f[0], loaded.start + f[0] + f[1]) : null;
}

/** A JSON file from the pack, or null when the pack does not hold it. */
export async function privateJSON<T>(path: string): Promise<T | null> {
  const b = slice(path);
  return b ? (JSON.parse(await b.text()) as T) : null;
}

/** A PMTiles source over one tile archive inside the pack (range reads are slices of the stored file). */
export function privateTileSource(file: string) {
  const path = `tiles/${file}`;
  return {
    getKey: () => PRIVATE_TILE_PREFIX + file,
    getBytes: async (offset: number, length: number) => {
      const f = loaded?.header.files[path];
      if (!f || !loaded) throw new Error(`${file} is not in the private data pack`);
      const from = loaded.start + f[0] + offset;
      return { data: await loaded.blob.slice(from, Math.min(from + length, loaded.start + f[0] + f[1])).arrayBuffer() };
    },
  };
}

/** Tile archives the pack holds (file names under tiles/). */
export const privateTiles = (): string[] =>
  Object.keys(loaded?.header.files ?? {}).filter((p) => p.startsWith('tiles/')).map((p) => p.slice(6));
