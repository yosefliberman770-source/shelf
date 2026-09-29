// Read an EPUB into chapters of plain paragraphs, each with its CFI, entirely
// on this device. Nothing is uploaded; the AI later sees one chunk at a time.
import { db } from '../../db/db';
import { getEbookFile } from '../ebooks';
import type { BookTextRow } from './types';

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, pre, figcaption, td, th, div';

interface Section {
  index: number;
  href: string;
  linear?: boolean | string;
  load: (request: unknown) => Promise<Element>;
  unload: () => void;
  cfiFromElement: (el: Element) => string;
}
interface NavItem { href: string; label: string; subitems?: NavItem[] }

const flat = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...flat(i.subitems ?? [])]);

/** Paragraph-like elements that don't contain other paragraph-like elements. */
export function leafBlocks(root: Element | Document): Element[] {
  const all = Array.from(root.querySelectorAll(BLOCKS));
  return all.filter((el) => !el.querySelector(BLOCKS));
}

const CHAPTERISH = /^(chapter|book|part|volume|letter|canto|act|scene|prologue|epilogue|preface|introduction)\b[\s\divxlc.:—–-]*/i;
/** A heading that starts a chapter: an <h1>–<h4>, or a short "Chapter 12" / "XII." line. */
export function isHeading(el: Element, text: string): boolean {
  if (text.length > 90) return false;
  if (/^H[1-4]$/.test(el.tagName)) return true;
  return CHAPTERISH.test(text) && text.split(/\s+/).length <= 8 || /^[IVXLC]+\.?$/.test(text);
}

/** Where a paragraph is, in words: "Chapter XII" (or the section title). */
export function locTitle(row: Pick<BookTextRow, 'title' | 'paras' | 'heads'> | undefined, para = 0): string {
  if (!row) return '';
  const h = [...(row.heads ?? [])].reverse().find((x) => x <= para);
  return h !== undefined ? row.paras[h].replace(/\s+/g, ' ').slice(0, 60) : row.title;
}

/** The chapter (between headings) containing a paragraph: [start, end). */
export function partRange(row: Pick<BookTextRow, 'paras' | 'heads'>, para: number): [number, number] {
  const heads = row.heads ?? [];
  let start = 0;
  let end = row.paras.length;
  for (const h of heads) { if (h <= para) start = h; else { end = h; break; } }
  return [start, end];
}

const posKey = (bookId: string) => `shelf.readerPara.${bookId}`;
/** Remember exactly how far you've read (section + paragraph), for spoiler-free lists. */
export function saveReadingPos(bookId: string, chapter: number, para: number) {
  try { localStorage.setItem(posKey(bookId), `${chapter}:${para}`); } catch { /* ignore */ }
}
export function loadReadingPos(bookId: string): { chapter: number; para: number } | undefined {
  try {
    const m = /^(-?\d+):(-?\d+)$/.exec(localStorage.getItem(posKey(bookId)) ?? '');
    return m ? { chapter: Number(m[1]), para: Number(m[2]) } : undefined;
  } catch { return undefined; }
}

/** Index of the last paragraph that starts at or before a CFI. */
export function paraAtCfi(cfis: string[], cfi: string, compare: (a: string, b: string) => number): number {
  let lo = 0, hi = cfis.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    let c: number;
    try { c = cfis[mid] ? compare(cfis[mid], cfi) : -1; } catch { c = -1; }
    if (c <= 0) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function extractBookText(bookId: string, signal?: AbortSignal): Promise<BookTextRow[]> {
  const file = await getEbookFile(bookId);
  if (!file) throw new Error('This book has no ebook file on this device.');
  const ePub = (await import('epubjs')).default;
  const book = ePub(await file.blob.arrayBuffer());
  try {
    await book.ready;
    const toc = flat(((await book.loaded.navigation).toc ?? []) as unknown as NavItem[]);
    const sections = (book.spine as unknown as { spineItems: Section[] }).spineItems;
    const rows: BookTextRow[] = [];
    for (const s of sections) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      let root: Element;
      try { root = await s.load(book.load.bind(book)); } catch { continue; }
      const body = root.querySelector('body') ?? root;
      const paras: string[] = [];
      const cfis: string[] = [];
      const heads: number[] = [];
      for (const el of leafBlocks(body)) {
        const text = cleanText(el.textContent ?? '');
        if (!text || /^[\d\s.*·•—–-]+$/.test(text)) continue;
        let cfi = '';
        try { cfi = s.cfiFromElement(el); } catch { /* position unknown */ }
        if (isHeading(el, text)) heads.push(paras.length);
        paras.push(text);
        cfis.push(cfi);
      }
      s.unload();
      if (!paras.length) continue;
      const base = s.href.split('#')[0];
      const tocTitle = toc.find((t) => t.href.split('#')[0].endsWith(base) || base.endsWith(t.href.split('#')[0]))?.label.trim();
      const heading = cleanText(body.querySelector('h1, h2, h3')?.textContent ?? '');
      rows.push({ id: `${bookId}|${s.index}`, bookId, chapter: s.index, href: s.href, title: tocTitle || heading.slice(0, 80) || `Section ${s.index + 1}`, paras, cfis, heads });
    }
    await db.transaction('rw', db.bookText, async () => {
      await db.bookText.where('bookId').equals(bookId).delete();
      await db.bookText.bulkPut(rows);
    });
    return rows;
  } finally {
    try { book.destroy(); } catch { /* ignore */ }
  }
}

export async function bookText(bookId: string): Promise<BookTextRow[]> {
  return (await db.bookText.where('bookId').equals(bookId).toArray()).sort((a, b) => a.chapter - b.chapter);
}

/** Chapter index (spine position) of a CFI such as "epubcfi(/6/14!/4/2)". */
export function chapterOfCfi(cfi?: string): number | undefined {
  const m = /epubcfi\(\/6\/(\d+)/.exec(cfi ?? '');
  return m ? Number(m[1]) / 2 - 1 : undefined;
}
