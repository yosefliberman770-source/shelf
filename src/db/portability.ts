// Backup, restore, export and import. The user's data stays portable.
import { isValidKey, keyFromMs } from '../engine/dates';
import { addItem, authorIdsFor, createShelf, type ItemDraft } from './actions';
import { ALL_TABLES, db, defaultSettings, type TableName, uid } from './db';
import type { Item, Status } from './types';

export interface Backup {
  app: 'shelf';
  version: 1;
  exportedAt: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

export async function exportBackup(): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const t of ALL_TABLES) tables[t] = await db.table(t).toArray();
  return { app: 'shelf', version: 1, exportedAt: new Date().toISOString(), tables };
}

export function validateBackup(data: unknown): data is Backup {
  if (!data || typeof data !== 'object') return false;
  const b = data as Backup;
  return b.app === 'shelf' && b.version === 1 && typeof b.tables === 'object' && b.tables !== null;
}

export async function restoreBackup(b: Backup, mode: 'replace' | 'merge' = 'replace'): Promise<{ restored: number }> {
  let restored = 0;
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      const rows = b.tables[t];
      if (mode === 'replace') await db.table(t).clear();
      if (Array.isArray(rows) && rows.length) {
        await db.table(t).bulkPut(rows);
        restored += rows.length;
      }
    }
  });
  if (!(await db.settings.get('settings'))) await db.settings.put(defaultSettings());
  return { restored };
}

export async function eraseEverything(): Promise<void> {
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear();
  });
  await db.entityCache.clear();
  await db.files.clear();
  await db.worldCache.clear();
  await db.bookWorld.clear();
  await db.settings.put(defaultSettings());
  // Reading positions and the learned reading speed live in this browser too.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('shelf.readerPos.') || k === 'shelf.readingSpeed') localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function toCSV(rows: Record<string, unknown>[], columns?: string[], sep = ','): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    if (v === undefined || v === null) return '';
    const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /["\n\r,;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(sep), ...rows.map((r) => cols.map((c) => esc(r[c])).join(sep))].join('\r\n');
}

/** RFC 4180 CSV parser (handles quotes, escaped quotes and embedded newlines). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function tableRowsForExport() {
  const [items, authors, instances, sessions, notes, folders, tags, shelves] = await Promise.all([
    db.items.toArray(), db.authors.toArray(), db.instances.toArray(), db.sessions.toArray(), db.notes.toArray(), db.folders.toArray(), db.tags.toArray(), db.shelves.toArray(),
  ]);
  const aName = new Map(authors.map((a) => [a.id, a.name]));
  const fName = new Map(folders.map((f) => [f.id, f.name]));
  const tName = new Map(tags.map((t) => [t.id, t.name]));
  const sName = new Map(shelves.map((s) => [s.id, s.name]));
  const iTitle = new Map(items.map((i) => [i.id, i.title]));
  const lastInst = new Map<string, (typeof instances)[number]>();
  for (const ins of instances) if (!lastInst.has(ins.itemId) || lastInst.get(ins.itemId)!.number < ins.number) lastInst.set(ins.itemId, ins);
  const library = items.map((i) => {
    const ins = lastInst.get(i.id);
    return {
      Title: i.title, Subtitle: i.subtitle, Authors: i.authorIds.map((a) => aName.get(a)), Type: i.contentType === 'custom' ? i.customType : i.contentType,
      Unit: i.unit === 'custom' ? i.customUnit : i.unit, Total: i.total, Position: ins?.position, Status: i.status, ISBN: i.isbn, Publisher: i.publisher,
      Published: i.publishedYear, Genres: i.genres, Tags: i.tagIds.map((t) => tName.get(t)), Folders: i.folderIds.map((f) => fName.get(f)),
      Shelves: i.shelfIds.map((s) => sName.get(s)), Rating: ins?.rating, Review: ins?.review, Started: ins?.startedOn, Finished: ins?.finishedOn,
      Deadline: i.deadline, Favorite: i.favorite, 'Subject from': i.histStart, 'Subject to': i.histEnd, Added: keyFromMs(i.createdAt),
    };
  });
  const history = sessions
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({ Date: s.date, Time: new Date(s.startedAt).toTimeString().slice(0, 5), Item: iTitle.get(s.itemId), Amount: s.amount, From: s.from, To: s.to, Minutes: s.durationSec ? Math.round(s.durationSec / 60) : undefined, Note: s.note }));
  const noteRows = (kind: 'note' | 'quote') =>
    notes.filter((n) => n.kind === kind).map((n) => ({ Item: n.itemId ? iTitle.get(n.itemId) : '', Text: n.text, Page: n.page, Chapter: n.chapter, Tags: n.tags, Source: n.source, Created: keyFromMs(n.createdAt) }));
  const readings = instances.map((r) => ({ Item: iTitle.get(r.itemId), Reading: r.number, Status: r.status, Started: r.startedOn, Finished: r.finishedOn, Rating: r.rating, Review: r.review }));
  return { library, history, notes: noteRows('note'), quotes: noteRows('quote'), readings };
}

/** SpreadsheetML 2003 workbook: opens in Excel, Numbers, LibreOffice, Google Sheets. */
export function toSpreadsheetML(sheets: Record<string, Record<string, unknown>[]>): string {
  const x = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cell = (v: unknown) => {
    if (v === undefined || v === null || v === '') return '<Cell/>';
    if (typeof v === 'number' && Number.isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return `<Cell><Data ss:Type="String">${x(s)}</Data></Cell>`;
  };
  const ws = Object.entries(sheets).map(([name, rows]) => {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const head = `<Row>${cols.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${x(c)}</Data></Cell>`).join('')}</Row>`;
    const body = rows.map((r) => `<Row>${cols.map((c) => cell(r[c])).join('')}</Row>`).join('');
    return `<Worksheet ss:Name="${x(name.slice(0, 31))}"><Table>${head}${body}</Table></Worksheet>`;
  });
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>${ws.join('')}</Workbook>`;
}

export function download(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Goodreads import ───────────────────────────────────────────────────────

export interface ImportRow {
  key: string;
  draft: ItemDraft;
  shelves: string[];
  duplicateOf?: { id: string; title: string };
  action: 'add' | 'skip' | 'merge';
  warnings: string[];
}

const cleanIsbn = (s?: string) => (s ?? '').replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '');

function gDate(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return undefined;
  const k = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isValidKey(k) ? k : undefined;
}

/** Parse a Goodreads library export CSV into a preview. Nothing is written. */
export async function previewGoodreads(csv: string): Promise<ImportRow[]> {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name.toLowerCase());
  const get = (r: string[], name: string) => {
    const i = col(name);
    return i >= 0 ? r[i]?.trim() : undefined;
  };
  if (col('title') < 0) throw new Error('This does not look like a Goodreads export (no Title column).');
  const existing = await db.items.toArray();
  const authors = await db.authors.toArray();
  const aName = new Map(authors.map((a) => [a.id, a.name.toLowerCase()]));
  const out: ImportRow[] = [];
  for (const r of rows.slice(1)) {
    const title = get(r, 'Title');
    if (!title) continue;
    const warnings: string[] = [];
    const author = get(r, 'Author');
    const extra = (get(r, 'Additional Authors') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const isbn = cleanIsbn(get(r, 'ISBN13')) || cleanIsbn(get(r, 'ISBN')) || undefined;
    const pages = Number(get(r, 'Number of Pages')) || undefined;
    if (!pages) warnings.push('Unknown page count');
    const exclusive = (get(r, 'Exclusive Shelf') ?? '').toLowerCase();
    const status: Status = exclusive === 'read' ? 'read' : exclusive === 'currently-reading' ? 'reading' : exclusive === 'did-not-finish' || exclusive === 'dnf' ? 'dnf' : 'want';
    const rating = Number(get(r, 'My Rating')) || undefined;
    const finishedOn = gDate(get(r, 'Date Read'));
    const addedOn = gDate(get(r, 'Date Added'));
    if (status === 'read' && !finishedOn) warnings.push('No finish date');
    const shelves = (get(r, 'Bookshelves') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !['read', 'to-read', 'currently-reading'].includes(s));
    const year = Number(get(r, 'Original Publication Year')) || Number(get(r, 'Year Published')) || undefined;
    const draft: ItemDraft = {
      title: title.replace(/\s+/g, ' '),
      authors: [author, ...extra].filter((x): x is string => !!x),
      isbn,
      total: pages,
      pageCount: pages,
      publisher: get(r, 'Publisher') || undefined,
      publishedYear: year,
      status,
      rating,
      review: get(r, 'My Review')?.replace(/<br\s*\/?>/gi, '\n') || undefined,
      finishedOn,
      startedOn: undefined,
      contentType: /kindle|ebook/i.test(get(r, 'Binding') ?? '') ? 'ebook' : /audio/i.test(get(r, 'Binding') ?? '') ? 'audiobook' : 'book',
      unit: 'pages',
      source: 'import',
      coverUrl: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : undefined,
      createdAt: addedOn ? new Date(`${addedOn}T12:00:00`).getTime() : undefined,
    };
    const dup = existing.find(
      (e) =>
        (isbn && e.isbn && cleanIsbn(e.isbn) === isbn) ||
        (e.title.toLowerCase() === draft.title.toLowerCase() && (!author || e.authorIds.some((a) => aName.get(a) === author.toLowerCase()))),
    );
    const already = out.find((o) => o.draft.title.toLowerCase() === draft.title.toLowerCase() && o.draft.authors?.[0] === draft.authors?.[0]);
    if (already) warnings.push('Duplicate row in file');
    out.push({
      key: uid(),
      draft,
      shelves,
      duplicateOf: dup ? { id: dup.id, title: dup.title } : undefined,
      action: dup || already ? (dup ? 'merge' : 'skip') : 'add',
      warnings,
    });
  }
  return out;
}

/**
 * Commit a previewed import. "merge" only fills fields that are empty on the
 * existing item — imported data never overwrites what the user already has.
 */
export async function commitImport(rows: ImportRow[]): Promise<{ added: number; merged: number; skipped: number }> {
  let added = 0, merged = 0, skipped = 0;
  const shelfIds = new Map((await db.shelves.toArray()).map((s) => [s.name.toLowerCase(), s.id]));
  const shelfFor = async (name: string) => {
    const k = name.toLowerCase();
    if (!shelfIds.has(k)) shelfIds.set(k, await createShelf(name));
    return shelfIds.get(k)!;
  };
  for (const r of rows) {
    if (r.action === 'skip') { skipped++; continue; }
    const sIds = [];
    for (const s of r.shelves) sIds.push(await shelfFor(s));
    if (r.action === 'merge' && r.duplicateOf) {
      const it = await db.items.get(r.duplicateOf.id);
      if (!it) { skipped++; continue; }
      const patch: Partial<Item> = {};
      const d = r.draft;
      if (!it.isbn && d.isbn) patch.isbn = d.isbn;
      if (!it.total && d.total) patch.total = d.total;
      if (!it.pageCount && d.pageCount) patch.pageCount = d.pageCount;
      if (!it.publisher && d.publisher) patch.publisher = d.publisher;
      if (it.publishedYear === undefined && d.publishedYear) patch.publishedYear = d.publishedYear;
      if (!it.coverUrl && !it.coverData && d.coverUrl) patch.coverUrl = d.coverUrl;
      if (!it.authorIds.length && d.authors?.length) patch.authorIds = await authorIdsFor(d.authors);
      patch.shelfIds = [...new Set([...it.shelfIds, ...sIds])];
      await db.items.update(it.id, patch);
      const inst = it.currentInstanceId ? await db.instances.get(it.currentInstanceId) : undefined;
      if (inst) {
        const ip: Record<string, unknown> = {};
        if (!inst.rating && d.rating) ip.rating = d.rating;
        if (!inst.review && d.review) ip.review = d.review;
        if (!inst.finishedOn && d.finishedOn && inst.status === 'read') ip.finishedOn = d.finishedOn;
        if (Object.keys(ip).length) await db.instances.update(inst.id, ip);
      }
      merged++;
    } else {
      await addItem({ ...r.draft, shelfIds: sIds });
      added++;
    }
  }
  return { added, merged, skipped };
}
