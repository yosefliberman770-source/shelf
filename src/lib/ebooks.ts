// Ebook files: importing EPUBs from the phone, and searching/downloading
// free, legal ebooks (Standard Ebooks, Project Gutenberg).
import { addItem, updateItem } from '../db/actions';
import { db, uid } from '../db/db';
import type { EbookFile } from '../db/types';

export interface EpubMeta {
  title?: string;
  authors: string[];
  publisher?: string;
  year?: number;
  description?: string;
  language?: string;
  coverData?: string;
}

async function blobToDataUrl(blob: Blob, maxWidth = 360): Promise<string | undefined> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Math.min(maxWidth, img.naturalWidth || maxWidth);
    const h = Math.round(((img.naturalHeight || w * 1.5) / (img.naturalWidth || w)) * w);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.85);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read title, author and cover from an EPUB file. */
export async function readEpubMeta(blob: Blob): Promise<EpubMeta> {
  const { default: ePub } = await import('epubjs');
  const book = ePub(await blob.arrayBuffer());
  try {
    await book.ready;
    const m = (await book.loaded.metadata) as unknown as Record<string, string>;
    let coverData: string | undefined;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) coverData = await blobToDataUrl(await (await fetch(coverUrl)).blob());
    } catch {
      /* no cover */
    }
    const year = Number(String(m.pubdate ?? '').slice(0, 4));
    return {
      title: m.title?.trim() || undefined,
      authors: (m.creator ?? '').split(/\s*(?:;|&| and )\s*/).map((s) => s.trim()).filter(Boolean),
      publisher: m.publisher || undefined,
      year: Number.isFinite(year) && year > 0 ? year : undefined,
      description: m.description ? stripHtml(m.description) : undefined,
      language: m.language || undefined,
      coverData,
    };
  } finally {
    book.destroy();
  }
}

function stripHtml(s: string): string {
  const d = new DOMParser().parseFromString(s, 'text/html');
  return (d.body.textContent ?? '').trim();
}

export function isEpub(file: File | Blob, name = (file as File).name ?? ''): boolean {
  return /\.epub$/i.test(name) || file.type === 'application/epub+zip';
}

/** Store an EPUB for an existing item (replacing any previous file). */
export async function attachEpub(itemId: string, blob: Blob, name: string, source: EbookFile['source'] = 'file'): Promise<void> {
  await db.transaction('rw', db.files, async () => {
    await db.files.where('itemId').equals(itemId).delete();
    await db.files.add({ id: uid(), itemId, name, size: blob.size, blob, source, addedAt: Date.now() });
  });
  await updateItem(itemId, { readerLocation: undefined });
}

/** Create a new library item from an EPUB and store the file with it. */
export async function importEpub(blob: Blob, name: string, extra: Partial<EpubMeta> & { source?: EbookFile['source']; folderIds?: string[] } = {}): Promise<string> {
  const meta = await readEpubMeta(blob).catch(() => ({ authors: [] }) as EpubMeta);
  const id = await addItem({
    title: extra.title ?? meta.title ?? name.replace(/\.epub$/i, ''),
    authors: extra.authors?.length ? extra.authors : meta.authors,
    contentType: 'ebook',
    unit: 'percent',
    total: 100,
    publisher: meta.publisher,
    publishedYear: extra.year ?? meta.year,
    description: extra.description ?? meta.description,
    language: meta.language,
    coverData: meta.coverData,
    coverUrl: meta.coverData ? undefined : extra.coverData,
    folderIds: extra.folderIds ?? [],
    status: 'want',
  });
  await attachEpub(id, blob, name, extra.source ?? 'file');
  return id;
}

export async function getEbookFile(itemId: string): Promise<EbookFile | undefined> {
  return db.files.where('itemId').equals(itemId).first();
}

export async function removeEbookFile(itemId: string): Promise<void> {
  await db.files.where('itemId').equals(itemId).delete();
  await updateItem(itemId, { readerLocation: undefined });
}

// ── Free, legal ebook sources ─────────────────────────────────────────────

export interface FreeBook {
  source: 'standardebooks' | 'gutenberg';
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  /** Direct EPUB download usable from the app (Standard Ebooks). */
  epubUrl?: string;
  /** Page to download manually (Project Gutenberg blocks in-app downloads). */
  pageUrl: string;
  downloads?: number;
}

const SE = 'https://standardebooks.org';

export async function searchStandardEbooks(q: string, signal?: AbortSignal): Promise<FreeBook[]> {
  const res = await fetch(`${SE}/ebooks?query=${encodeURIComponent(q)}&per-page=24`, { signal });
  if (!res.ok) throw new Error(`Standard Ebooks returned ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  return [...doc.querySelectorAll('li[typeof="schema:Book"]')].map((li) => {
    const path = li.getAttribute('about') ?? '';
    const slug = path.replace(/^\/ebooks\//, '').split('/').join('_');
    const img = li.querySelector('img')?.getAttribute('src') ?? undefined;
    return {
      source: 'standardebooks' as const,
      id: path,
      title: li.querySelector('[property="schema:url"] [property="schema:name"]')?.textContent?.trim() ?? 'Untitled',
      authors: [...li.querySelectorAll('.author [property="schema:name"]')].map((a) => a.textContent?.trim() ?? '').filter(Boolean),
      coverUrl: img ? SE + img : undefined,
      epubUrl: `${SE}${path}/downloads/${slug}.epub?source=download`,
      pageUrl: SE + path,
    };
  });
}

export async function searchGutenberg(q: string, signal?: AbortSignal): Promise<FreeBook[]> {
  const res = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Project Gutenberg search returned ${res.status}`);
  const data = (await res.json()) as { results: { id: number; title: string; authors: { name: string }[]; formats: Record<string, string>; download_count?: number }[] };
  return data.results
    .filter((r) => Object.keys(r.formats).some((f) => f.startsWith('application/epub')))
    .slice(0, 24)
    .map((r) => ({
      source: 'gutenberg' as const,
      id: String(r.id),
      title: r.title,
      // Gutendex gives "Last, First" — show "First Last".
      authors: r.authors.map((a) => a.name.split(', ').reverse().join(' ')),
      coverUrl: r.formats['image/jpeg'],
      pageUrl: `https://www.gutenberg.org/ebooks/${r.id}.epub3.images`,
      downloads: r.download_count,
    }));
}

export async function downloadFreeBook(b: FreeBook, folderIds: string[] = []): Promise<string> {
  if (!b.epubUrl) throw new Error('This book has to be downloaded from its website.');
  const res = await fetch(b.epubUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const blob = await res.blob();
  const name = b.epubUrl.split('/').pop()!.split('?')[0];
  return importEpub(blob, name, { title: b.title, authors: b.authors, coverData: b.coverUrl, source: b.source, folderIds });
}
