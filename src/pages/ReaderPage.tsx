// Full-screen EPUB reader. Turning pages updates the book's progress, and each
// visit is logged as a timed reading session when you leave the reader.
// Kindle-style extras: fonts, themes, spacing, page numbers, time left
// (learned from your own reading speed), bookmarks, highlights, notes,
// dictionary look-up and search inside the book.
import { useLiveQuery } from 'dexie-react-hooks';
import type { Book, Contents, Location, NavItem, Rendition } from 'epubjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addNote, logProgress, updateItem } from '../db/actions';
import { db } from '../db/db';
import type { Bookmark, Note } from '../db/types';
import { Icon } from '../components/icons';
import { ReaderTools, TOOLS, type ToolState } from '../components/reader-tools';
import { getEbookFile, readerPosKey } from '../lib/ebooks';
import { buildMatcher, findInDocument, hitAt, type Hit, type Matcher, paintHits, type Term, termsFromConcepts } from '../lib/entityDetect';
import { CHARS_PER_PAGE, fmtMinutes, readingSpeed, recordReading, resetReadingSpeed } from '../lib/readingSpeed';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

// ── Preferences ────────────────────────────────────────────────────────

type ThemeId = 'white' | 'sepia' | 'green' | 'dark' | 'black';
const THEMES: Record<ThemeId, { label: string; bg: string; fg: string; line: string; muted: string; panel: string }> = {
  white: { label: 'White', bg: '#fcfcfb', fg: '#1b1a18', line: '#e3e0d8', muted: '#77736b', panel: '#ffffff' },
  sepia: { label: 'Sepia', bg: '#f4ecd8', fg: '#433422', line: '#e0d4b8', muted: '#86745a', panel: '#f9f3e3' },
  green: { label: 'Green', bg: '#d7ead3', fg: '#1f2a1e', line: '#bcd6b6', muted: '#56694f', panel: '#e3f1e0' },
  dark: { label: 'Dark', bg: '#1f1f1d', fg: '#e3e1dc', line: '#34332f', muted: '#9a978f', panel: '#2a2927' },
  black: { label: 'Black', bg: '#000000', fg: '#c9c7c2', line: '#262625', muted: '#86847f', panel: '#141414' },
};

const FONTS: { id: string; label: string; css?: string; google?: string; note?: string }[] = [
  { id: 'publisher', label: 'Original', note: 'The book’s own font' },
  { id: 'literata', label: 'Literata', css: "'Literata', Georgia, serif", google: 'Literata:ital,wght@0,400;0,700;1,400;1,700' },
  { id: 'georgia', label: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  { id: 'merriweather', label: 'Merriweather', css: "'Merriweather', Georgia, serif", google: 'Merriweather:ital,wght@0,400;0,700;1,400' },
  { id: 'sans', label: 'Sans', css: "system-ui, -apple-system, Roboto, 'Segoe UI', sans-serif" },
  { id: 'atkinson', label: 'Atkinson', css: "'Atkinson Hyperlegible', system-ui, sans-serif", google: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400', note: 'Extra clear letters' },
  { id: 'lexend', label: 'Lexend', css: "'Lexend', system-ui, sans-serif", google: 'Lexend:wght@300;400;700', note: 'Easier to read' },
];
const fontUrl = (f: (typeof FONTS)[number]) => (f.google ? `https://fonts.googleapis.com/css2?family=${f.google}&display=swap` : undefined);

const SPACING = [
  { value: 0, label: 'Original' },
  { value: 1.3, label: 'Tight' },
  { value: 1.55, label: 'Normal' },
  { value: 1.85, label: 'Loose' },
];
const MARGINS = { narrow: 10, normal: 24, wide: 46 } as const;
type Margin = keyof typeof MARGINS;
type Align = 'publisher' | 'left' | 'justify';

const FOOTER_MODES = ['page', 'chapterTime', 'bookTime', 'chapterPages', 'location'] as const;
type FooterMode = (typeof FOOTER_MODES)[number];

interface Prefs {
  theme: ThemeId;
  size: number;
  font: string;
  spacing: number;
  margin: Margin;
  align: Align;
  /** 0 = full brightness, 0.6 = dimmest. */
  dim: number;
  keepAwake: boolean;
  footer: FooterMode;
  /** Underline people, places and events you've met before. */
  entities: boolean;
}
const PREFS = 'shelf.readerPrefs';
const DEFAULT_PREFS: Prefs = { theme: 'white', size: 100, font: 'publisher', spacing: 0, margin: 'normal', align: 'publisher', dim: 0, keepAwake: true, footer: 'page', entities: true };

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Omit<Partial<Prefs>, 'theme'> & { theme?: string };
    const p = { ...DEFAULT_PREFS, ...raw, theme: raw.theme === 'light' ? 'white' : raw.theme ?? 'white' } as Prefs;
    if (!THEMES[p.theme]) p.theme = 'white';
    if (!FOOTER_MODES.includes(p.footer)) p.footer = 'page';
    if (!(p.margin in MARGINS)) p.margin = 'normal';
    return p;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Styles injected into every chapter of the book. */
function readerCss(p: Prefs): string {
  const t = THEMES[p.theme];
  const font = FONTS.find((f) => f.id === p.font);
  const text = 'body p, body div, body span, body li, body blockquote, body h1, body h2, body h3, body h4, body h5, body h6, body em, body i, body b, body strong, body td, body th, body dd, body dt';
  let css = `
    html, body { max-width: 100%; }
    ${text} { color: inherit !important; background-color: transparent !important; }
    a, a:link, a:visited { color: inherit !important; text-decoration: none !important; }
    sup a, a sup { color: ${t.muted} !important; }
    img, svg, video { max-width: 100% !important; max-height: 92vh !important; height: auto; object-fit: contain; }
    ::selection { background: rgba(237, 161, 0, 0.35); }
    ::highlight(shelf-entity) { text-decoration: underline dotted rgba(200, 121, 58, 0.85); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }`;
  if (font?.css) css += `\n    body, ${text}, body a { font-family: ${font.css} !important; }`;
  if (p.spacing) css += `\n    body, body p, body li, body blockquote, body div { line-height: ${p.spacing} !important; }`;
  if (p.align === 'justify') css += '\n    body p { text-align: justify !important; hyphens: auto; -webkit-hyphens: auto; }';
  if (p.align === 'left') css += '\n    body p { text-align: left !important; hyphens: manual; }';
  return css;
}

function styleContents(c: Contents, p: Prefs) {
  const doc = c.document;
  if (!doc?.head) return;
  let style = doc.getElementById('shelf-reader-css') as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = 'shelf-reader-css';
    doc.head.appendChild(style);
  }
  style.textContent = readerCss(p);
  const url = fontUrl(FONTS.find((f) => f.id === p.font) ?? FONTS[0]);
  let link = doc.getElementById('shelf-reader-font') as HTMLLinkElement | null;
  if (url) {
    if (!link) {
      link = doc.createElement('link');
      link.id = 'shelf-reader-font';
      link.rel = 'stylesheet';
      doc.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;
  } else link?.remove();
}

/** Load a web font into the app itself (for the font picker preview). */
function loadAppFont(url?: string) {
  if (!url || document.querySelector(`link[href="${url}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  document.head.appendChild(l);
}

// ── Book positions ─────────────────────────────────────────────────────

/** Characters per "location" (the unit epub.js positions are measured in). */
const LOC_CHARS = 1200;
/** Idle gaps longer than this between page turns don't count as reading time. */
const MAX_GAP_MS = 5 * 60_000;
/** Page turns further apart than this don't count towards reading speed. */
const SPEED_GAP_MS = 3 * 60_000;

interface PageInfo {
  /** Location index (0-based) and total, once locations are ready. */
  loc?: number;
  total?: number;
  /** Location index where the current chapter (spine section) ends. */
  chapterEnd?: number;
  /** Screen pages within the current chapter. */
  chPage?: number;
  chTotal?: number;
  start: string;
  end: string;
  atEnd: boolean;
}

/**
 * epub.js sometimes reports a page's start a character or two early — at the
 * space ending the previous page — so going back to it would show the page
 * before. Find the first character that is really on the page instead.
 */
function pageAnchor(r: Rendition, cfi: string): string {
  try {
    const m = (r as unknown as { manager?: { container?: HTMLElement; layout?: { delta?: number } } }).manager;
    const left = m?.container?.scrollLeft;
    const width = m?.layout?.delta;
    for (const c of r.getContents() as unknown as Contents[]) {
      const range = c.range(cfi);
      if (!range) continue;
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return cfi;
      const text = node.textContent ?? '';
      const probe = c.document.createRange();
      for (let off = range.startOffset; off < Math.min(text.length, range.startOffset + 200); off++) {
        if (/\s/.test(text[off])) continue;
        let onPage = true;
        if (left !== undefined && width) {
          probe.setStart(node, off);
          probe.setEnd(node, off + 1);
          const x = probe.getBoundingClientRect().left;
          onPage = x >= left - 1 && x < left + width;
        }
        if (!onPage) continue;
        if (off === range.startOffset) return cfi;
        probe.setStart(node, off);
        probe.collapse(true);
        return c.cfiFromRange(probe);
      }
      return cfi;
    }
  } catch { /* use epub.js's own position */ }
  return cfi;
}

const spineStep = (cfi: string) => Number(/epubcfi\(\/6\/(\d+)/.exec(cfi)?.[1] ?? -1);

function flatToc(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => [i, ...flatToc(i.subitems ?? [])]);
}

interface Defn { pos: string; text: string }
async function lookUp(word: string): Promise<Defn[]> {
  const tryWord = async (w: string) => {
    const r = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`);
    if (!r.ok) return [];
    const j = (await r.json()) as Record<string, { partOfSpeech: string; definitions: { definition: string }[] }[]>;
    const strip = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
    return (j.en ?? []).flatMap((e) => e.definitions.map((d) => ({ pos: e.partOfSpeech, text: strip(d.definition) })).filter((d) => d.text).slice(0, 2)).slice(0, 4);
  };
  const w = word.replace(/[^\p{L}\p{N}'’ -]/gu, '').trim();
  const res = await tryWord(w);
  return res.length ? res : w !== w.toLowerCase() ? tryWord(w.toLowerCase()) : [];
}

// ── Reader ─────────────────────────────────────────────────────────────

type Panel = null | 'aa' | 'nav';
type NavTab = 'toc' | 'marks' | 'notes' | 'search';

export default function ReaderPage() {
  const { id } = useParams();
  const idx = useLibrary();
  const nav = useNavigate();
  const { toast } = useUI();
  const item = idx.items.get(id!);
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const host = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const rendRef = useRef<Rendition | null>(null);
  const epubRef = useRef<typeof import('epubjs') | null>(null);
  const spineOfLoc = useRef<number[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [pct, setPct] = useState<number | undefined>();
  const [page, setPage] = useState<PageInfo | null>(null);
  const [chapter, setChapter] = useState('');
  const [toc, setToc] = useState<NavItem[]>([]);
  // Books open with just the text, like a Kindle; tap the middle for menus.
  const [chrome, setChrome] = useState(false);
  const [hint, setHint] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [navTab, setNavTab] = useState<NavTab>('toc');
  const [prefs, setPrefs] = useState(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [selection, setSelection] = useState<{ cfi: string; text: string; contents: Contents } | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [define, setDefine] = useState<{ word: string; defs?: Defn[]; failed?: boolean } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [jumpBack, setJumpBack] = useState<string | null>(null);
  const jumping = useRef(false);
  // Where you are, as a position that is definitely on the current page. Kept
  // when the layout changes (text size, rotation…) so you stay on your page.
  const anchor = useRef('');
  const relayoutUntil = useRef(0);
  const settleTries = useRef(0);
  const userNav = useRef(false);
  const [search, setSearch] = useState<{ q: string; results: { cfi: string; excerpt: string; chapter: string }[]; done: boolean; progress: number } | null>(null);
  const searchToken = useRef(0);
  const [isFull, setIsFull] = useState(!!document.fullscreenElement);
  // Ask AI / Map / Images / Explore, opened over the book.
  const [tool, setTool] = useState<ToolState | null>(null);
  const [found, setFound] = useState<{ page: Term[]; chapter: Term[] }>({ page: [], chapter: [] });
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 700px)').matches);
  const chapterRef = useRef('');
  chapterRef.current = chapter;
  const pctRef = useRef<number | undefined>(undefined);
  pctRef.current = pct;
  // Recognised names in each loaded chapter, and the names to look for.
  const hitsRef = useRef(new Map<Document, Hit[]>());
  const matcherRef = useRef<Matcher | null>(null);
  const toolRef = useRef<ToolState | null>(null);
  toolRef.current = tool;
  const openEntityRef = useRef<(h: Hit) => void>(() => {});
  const refreshToolRef = useRef<() => void>(() => {});

  // Reading-time accounting for the automatic session.
  const session = useRef({ startPct: 0, lastPct: 0, activeMs: 0, lastTick: Date.now(), startedAt: Date.now(), cfi: '' });
  // A continuous run of forward page turns, used to learn reading speed.
  const run = useRef<{ startLoc: number; endLoc: number; ms: number; lastAt: number; lastLoc: number | null }>({ startLoc: 0, endLoc: 0, ms: 0, lastAt: Date.now(), lastLoc: null });

  const tick = () => {
    const s = session.current;
    const now = Date.now();
    if (document.visibilityState === 'visible') s.activeMs += Math.min(now - s.lastTick, MAX_GAP_MS);
    s.lastTick = now;
  };

  const commitRun = () => {
    const r = run.current;
    if (r.endLoc > r.startLoc) recordReading((r.endLoc - r.startLoc) * LOC_CHARS, r.ms);
    r.startLoc = r.endLoc = r.lastLoc ?? 0;
    r.ms = 0;
    r.lastAt = Date.now();
  };

  /** Save position and log the session (only when progress was made). */
  const flush = useCallback(async () => {
    const s = session.current;
    tick();
    commitRun();
    const cur = idxRef.current;
    const it = cur.items.get(id!);
    if (!it) return;
    if (s.cfi && s.cfi !== it.readerLocation) await updateItem(it.id, { readerLocation: s.cfi, lastReadAt: Date.now() });
    const total = it.total ?? 100;
    const to = Math.round(s.lastPct * total * 100) / 100;
    const current = cur.position(it);
    if (s.lastPct > s.startPct && to > current) {
      const res = await logProgress({ itemId: it.id, to, durationSec: s.activeMs >= 30_000 ? Math.round(s.activeMs / 1000) : undefined, startedAt: s.startedAt }).catch(() => undefined);
      if (res) toast(`Progress saved · ${Math.round(s.lastPct * 1000) / 10}%${s.activeMs >= 60_000 ? ` · ${Math.round(s.activeMs / 60000)} min reading` : ''}`, { undo: res.undo });
    }
    s.startPct = s.lastPct;
    s.activeMs = 0;
    s.startedAt = Date.now();
  }, [id, toast]);

  /** Go back to your place after the layout changed (it checks it landed right). */
  const returnToAnchor = (delay: number) => {
    relayoutUntil.current = Date.now() + 1500;
    settleTries.current = 0;
    const a = anchor.current;
    const r = rendRef.current;
    if (a && r) setTimeout(() => { if (rendRef.current === r) r.display(a); }, delay);
  };

  /** Find and underline known names in one loaded chapter. */
  const detectIn = (c: Contents) => {
    const doc = c.document;
    if (!doc) return;
    const m = prefsRef.current.entities ? matcherRef.current : null;
    let hits: Hit[] = [];
    try { hits = m ? findInDocument(doc, m) : []; } catch { hits = []; }
    hitsRef.current.set(doc, hits);
    try { paintHits(c.window, hits); } catch { /* highlights unsupported */ }
  };

  /** What the tools may see: this page, the chapter name, your selection. */
  const snapshot = () => {
    const r = rendRef.current;
    const it = idxRef.current.items.get(id!);
    const loc = r?.currentLocation() as unknown as Location | undefined;
    let pageText = '';
    let pageRange: Range | undefined;
    let doc: Document | undefined;
    if (r && loc?.start) {
      for (const c of r.getContents() as unknown as Contents[]) {
        try {
          const a = c.range(loc.start.cfi);
          const b = c.range(loc.end.cfi);
          if (!a || !b) continue;
          pageRange = c.document.createRange();
          pageRange.setStart(a.startContainer, a.startOffset);
          pageRange.setEnd(b.endContainer, b.endOffset);
          pageText = pageRange.toString().replace(/\s+/g, ' ').trim();
          doc = c.document;
          break;
        } catch { /* try the next view */ }
      }
    }
    const hits = doc ? hitsRef.current.get(doc) ?? [] : [];
    const onPage = pageRange ? hits.filter((h) => { try { return pageRange!.compareBoundaryPoints(Range.START_TO_START, h.range) <= 0 && pageRange!.compareBoundaryPoints(Range.END_TO_END, h.range) >= 0; } catch { return false; } }) : [];
    const p = pctRef.current;
    return {
      ctx: { itemId: id!, title: it?.title ?? '', author: it ? idxRef.current.authorLine(it) : '', chapter: chapterRef.current || undefined, pageText, position: p !== undefined ? `${Math.round(p * 100)}%` : undefined },
      found: { page: onPage.map((h) => h.term), chapter: hits.map((h) => h.term) },
      href: loc?.start?.href,
      doc,
    };
  };
  const [toolHref, setToolHref] = useState<string | undefined>();
  const openTool = (patch: Omit<ToolState, 'ctx'> & { selection?: string }) => {
    const snap = snapshot();
    const { selection: sel, ...rest } = patch;
    setFound(snap.found);
    setToolHref(snap.href);
    setTool({ ...rest, ctx: { ...snap.ctx, selection: sel } });
    setPanel(null);
    setHint(false);
  };
  openEntityRef.current = (h: Hit) => openTool({ tab: 'entity', focus: { name: h.term.name, kind: h.term.kind, conceptId: h.term.conceptId } });
  // With the side panel open on a big screen, the tools follow your page.
  refreshToolRef.current = () => {
    const cur = toolRef.current;
    if (!cur) return;
    const snap = snapshot();
    setFound(snap.found);
    setToolHref(snap.href);
    setTool({ ...cur, ctx: { ...snap.ctx, selection: cur.ctx.selection } });
  };
  const chapterText = () => {
    const r = rendRef.current;
    const c = (r?.getContents() as unknown as Contents[] | undefined)?.[0];
    return c?.document?.body?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  };

  const indexLocations = (book: Book) => {
    try {
      const cfis = JSON.parse(book.locations.save()) as string[];
      spineOfLoc.current = cfis.map(spineStep);
    } catch {
      spineOfLoc.current = [];
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await getEbookFile(id!);
      if (!file) { setStatus('missing'); return; }
      try {
        const mod = await import('epubjs');
        epubRef.current = mod;
        const book = mod.default(await file.blob.arrayBuffer());
        bookRef.current = book;
        await book.ready;
        if (cancelled || !host.current) return;
        const rendition = book.renderTo(host.current, { width: '100%', height: '100%', flow: 'paginated', spread: 'none', allowScriptedContent: false });
        rendRef.current = rendition;
        rendition.hooks.content.register((contents: Contents) => {
          const doc = contents.document;
          // Some publishers hide text by pushing it far off-screen (e.g.
          // left: -999em), which breaks page layout. Put it back in the flow.
          for (const el of Array.from(doc.querySelectorAll<HTMLElement>('body *'))) {
            const cs = contents.window.getComputedStyle(el);
            if ((cs.position === 'absolute' || cs.position === 'fixed') && (parseFloat(cs.left) < -200 || parseFloat(cs.top) < -200 || parseFloat(cs.right) < -200)) {
              el.style.setProperty('position', 'static', 'important');
              el.style.setProperty('left', 'auto', 'important');
            }
          }
          styleContents(contents, prefsRef.current);
          detectIn(contents);
        });
        applyTheme(rendition, prefsRef.current);
        setToc((await book.loaded.navigation).toc);
        // Percentages need "locations"; build once and cache with the file.
        if (file.locations) { book.locations.load(file.locations); indexLocations(book); }
        const it = idxRef.current.items.get(id!);
        let startCfi = it?.readerLocation;
        try { startCfi = localStorage.getItem(readerPosKey(id!)) || startCfi; } catch { /* ignore */ }
        userNav.current = true;
        try { await rendition.display(startCfi || undefined); } catch { startCfi = undefined; await rendition.display(); }
        if (cancelled) return;
        setStatus('ready');
        // Saved highlights and notes.
        for (const n of idxRef.current.notesByItem.get(id!) ?? []) {
          if (n.location) try { rendition.annotations.highlight(n.location, { id: n.id }, () => {}, 'shelf-hl', { fill: '#eda100', 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' }); } catch { /* stale position */ }
        }
        const saveLength = () => {
          const it2 = idxRef.current.items.get(id!);
          const chars = book.locations.length() * LOC_CHARS;
          if (it2 && chars && it2.ebookChars !== chars) updateItem(it2.id, { ebookChars: chars });
        };
        if (!file.locations) {
          setPreparing(true);
          book.locations.generate(LOC_CHARS).then(async () => {
            indexLocations(book);
            await db.files.update(file.id, { locations: book.locations.save() });
            saveLength();
            if (!cancelled) { setPreparing(false); const loc = rendition.currentLocation() as unknown as Location; if (loc?.start) onRelocated(loc); }
          });
        } else saveLength();
        const it0 = idxRef.current.items.get(id!);
        const startFrac = it0 && it0.total ? Math.min(1, idxRef.current.position(it0) / it0.total) : 0;
        session.current = { startPct: startFrac, lastPct: startFrac, activeMs: 0, lastTick: Date.now(), startedAt: Date.now(), cfi: startCfi ?? '' };
        const loc0 = rendition.currentLocation() as unknown as Location;
        if (loc0?.start) onRelocated(loc0);
        rendition.on('relocated', onRelocated);
        // After a resize epub.js returns to its (slightly early) page start;
        // follow up by returning to our anchor so you stay on your page.
        rendition.on('resized', () => returnToAnchor(0));
        rendition.on('selected', (cfi: string, contents: Contents) => {
          const text = contents.window.getSelection()?.toString().trim() ?? '';
          if (text) { setSelection({ cfi, text, contents }); setNoteDraft(null); setDefine(null); }
        });
        rendition.on('click', (e: MouseEvent) => {
          const all = rendition.getContents() as unknown as Contents[];
          if (all.some((c) => c.window.getSelection()?.toString())) return;
          // Tapped an underlined name? Show who or what it is.
          const doc = (e.target as Node | null)?.ownerDocument ?? (e.target as Document | null);
          const hits = doc ? hitsRef.current.get(doc) : undefined;
          const h = doc && hits?.length ? hitAt(doc, hits, e.clientX, e.clientY) : undefined;
          if (h) { openEntityRef.current(h); return; }
          setHint(false);
          setPanel((p) => {
            if (!p) setChrome((c) => !c);
            return null;
          });
        });
        rendition.on('keyup', (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight') { userNav.current = true; rendition.next(); }
          if (e.key === 'ArrowLeft') { userNav.current = true; rendition.prev(); }
        });
        // Swipe to turn pages.
        let sx = 0;
        let sy = 0;
        rendition.on('touchstart', (e: TouchEvent) => { sx = e.changedTouches[0].screenX; sy = e.changedTouches[0].screenY; });
        rendition.on('touchend', (e: TouchEvent) => {
          const dx = e.changedTouches[0].screenX - sx;
          const dy = e.changedTouches[0].screenY - sy;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { userNav.current = true; setChrome(false); setHint(false); if (dx < 0) rendition.next(); else rendition.prev(); }
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus('error');
      }
    })();

    function onRelocated(loc: Location) {
      tick();
      const book = bookRef.current;
      if (!book) return;
      const cfi = loc.start.cfi;
      const rend = rendRef.current;
      const relayout = Date.now() < relayoutUntil.current && !userNav.current;
      if (rend && relayout && anchor.current && epubRef.current) {
        // After a layout change, make sure we landed on the page that holds
        // your place; the new layout can take a moment to settle.
        const cmp = new epubRef.current.EpubCFI();
        const a = anchor.current;
        const off = cmp.compare(a, cfi) < 0 || (!loc.atEnd && cmp.compare(a, loc.end.cfi) > 0);
        if (off && settleTries.current < 4) {
          settleTries.current++;
          relayoutUntil.current = Date.now() + 1500;
          setTimeout(() => { if (rendRef.current === rend) rend.display(a); }, 150);
        }
      } else if (rend) anchor.current = pageAnchor(rend, cfi);
      userNav.current = false;
      session.current.cfi = anchor.current || cfi;
      // Saved on every page turn, so your place survives the browser closing.
      try { localStorage.setItem(readerPosKey(id!), session.current.cfi); } catch { /* ignore */ }
      const ready = book.locations.length() > 0;
      const p = ready ? book.locations.percentageFromCfi(cfi) : undefined;
      if (loc.atEnd) {
        session.current.lastPct = 1;
        setPct(1);
      } else if (p !== undefined && p !== null) {
        session.current.lastPct = Math.max(session.current.lastPct, p);
        setPct(p);
      }
      const info: PageInfo = { start: cfi, end: loc.end.cfi, atEnd: !!loc.atEnd, chPage: loc.start.displayed?.page, chTotal: loc.start.displayed?.total };
      if (ready) {
        const li = book.locations.locationFromCfi(cfi) as unknown as number;
        const total = book.locations.length();
        info.loc = li;
        info.total = total;
        const steps = spineOfLoc.current;
        const s = steps[li];
        let end = li;
        while (end < steps.length && steps[end] === s) end++;
        info.chapterEnd = end;
        // Learn reading speed from steady forward page turns (not from the
        // reader re-settling after a layout change).
        const r = run.current;
        const now = Date.now();
        const steady = !relayout && !jumping.current && r.lastLoc !== null && li >= r.lastLoc && li - r.lastLoc <= 3 && now - r.lastAt > 1500 && now - r.lastAt < SPEED_GAP_MS && document.visibilityState === 'visible';
        if (steady) { r.ms += now - r.lastAt; r.endLoc = li; }
        else { r.lastLoc = li; commitRun(); }
        r.lastLoc = li;
        r.lastAt = now;
      }
      jumping.current = false;
      setPage(info);
      const href = loc.start.href;
      const ch = flatToc(bookRef.current?.navigation?.toc ?? []).find((t) => href && t.href.split('#')[0].endsWith(href.split('#')[0]));
      if (ch) setChapter(ch.label.trim());
      setSelection(null);
      setDefine(null);
      setNoteDraft(null);
      setTimeout(() => refreshToolRef.current(), 0);
    }

    const onHide = () => { if (document.visibilityState === 'hidden') flush(); else { session.current.lastTick = Date.now(); run.current.lastAt = Date.now(); } };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onHide);
      flush();
      rendRef.current?.destroy();
      bookRef.current?.destroy();
    };
    // Open once per book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep the page layout in step with the reading area's size (rotation,
  // address bar, margin changes) so text is never cut off.
  useEffect(() => {
    const el = host.current;
    if (!el || status !== 'ready' || typeof ResizeObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let last = `${el.clientWidth}x${el.clientHeight}`;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        const r = rendRef.current;
        const size = `${el.clientWidth}x${el.clientHeight}`;
        if (!r || size === last || !el.clientWidth || !el.clientHeight) return;
        last = size;
        // No explicit size, so epub.js keeps following the reading area.
        try { (r as unknown as { resize: () => void }).resize(); } catch { /* not rendered yet */ }
      }, 120);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [status]);

  // Names to recognise: your Knowledge Atlas plus names found in this book.
  const cachedNames = useLiveQuery(() => db.entityCache.where('itemId').equals(id!).toArray(), [id]);
  const terms = useMemo(() => [
    ...termsFromConcepts(idx.snap.concepts),
    ...(cachedNames ?? []).flatMap((row) => row.names.map((n) => ({ name: n.name, kind: n.kind, conceptId: n.conceptId }))),
  ], [idx.snap.concepts, cachedNames]);
  const termsKey = terms.map((t) => t.name).join('|');
  useEffect(() => {
    matcherRef.current = buildMatcher(terms);
    const r = rendRef.current;
    if (!r || status !== 'ready') return;
    for (const c of r.getContents() as unknown as Contents[]) detectIn(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsKey, prefs.entities, status]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)');
    const f = () => setWide(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  // Apply display preferences.
  useEffect(() => {
    try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  // Colours only: nothing moves.
  useEffect(() => {
    const r = rendRef.current;
    if (!r) return;
    applyTheme(r, prefsRef.current);
    for (const c of r.getContents() as unknown as Contents[]) styleContents(c, prefsRef.current);
  }, [prefs.theme]);

  // Text size, font, spacing and alignment reflow the book; stay on your page.
  useEffect(() => {
    const r = rendRef.current;
    if (!r) return;
    relayoutUntil.current = Date.now() + 2000;
    applyTheme(r, prefsRef.current);
    const all = r.getContents() as unknown as Contents[];
    for (const c of all) styleContents(c, prefsRef.current);
    const t1 = setTimeout(() => returnToAnchor(0), 150);
    all[0]?.document?.fonts?.ready.then(() => setTimeout(() => returnToAnchor(0), 60));
    return () => clearTimeout(t1);
  }, [prefs.size, prefs.font, prefs.spacing, prefs.align]);

  // Keep the screen on while reading.
  useEffect(() => {
    if (!prefs.keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    const request = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
    request();
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, [prefs.keepAwake]);

  // First few times: show how to get the menus.
  useEffect(() => {
    if (status !== 'ready') return;
    let seen = 0;
    try { seen = Number(localStorage.getItem('shelf.readerHint') ?? 0); localStorage.setItem('shelf.readerHint', String(seen + 1)); } catch { /* ignore */ }
    if (seen >= 3) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const f = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => { document.removeEventListener('fullscreenchange', f); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  useEffect(() => { if (panel === 'aa') for (const f of FONTS) loadAppFont(fontUrl(f)); }, [panel]);

  const close = async () => {
    await flush();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if ((window.history.state as { idx?: number } | null)?.idx) nav(-1);
    else nav('/ebooks');
  };

  /** Jump somewhere, remembering where you were (like Kindle's "Back to page"). */
  const jumpTo = (target: string) => {
    if (session.current.cfi) setJumpBack(session.current.cfi);
    jumping.current = true;
    userNav.current = true;
    rendRef.current?.display(target).catch(() => toast('That spot couldn’t be found in this file.', { error: true }));
    setPanel(null);
    setChrome(true);
  };

  const clearSelection = () => {
    try { selection?.contents.window.getSelection()?.removeAllRanges(); } catch { /* chapter gone */ }
    setSelection(null);
    setNoteDraft(null);
    setDefine(null);
  };

  const saveHighlight = async (note?: string) => {
    if (!selection) return;
    const it = idxRef.current.items.get(id!)!;
    const p = it.pageCount && pct !== undefined ? Math.max(1, Math.ceil(pct * it.pageCount)) : undefined;
    const noteId = await addNote(note
      ? { itemId: it.id, kind: 'note', text: `${note}\n\n“${selection.text}”`, chapter: chapter || undefined, page: p, location: selection.cfi }
      : { itemId: it.id, kind: 'quote', text: selection.text, chapter: chapter || undefined, page: p, location: selection.cfi });
    try { rendRef.current?.annotations.highlight(selection.cfi, { id: noteId }, () => {}, 'shelf-hl', { fill: '#eda100', 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' }); } catch { /* ignore */ }
    toast(note ? 'Note saved to Knowledge' : 'Quote saved to your quotes', { action: { label: 'View', run: () => { flush(); nav('/knowledge/notes'); } } });
    clearSelection();
  };

  const lookUpSelection = async () => {
    if (!selection) return;
    const word = selection.text;
    setDefine({ word });
    try {
      const defs = await lookUp(word);
      setDefine((d) => (d?.word === word ? { word, defs, failed: !defs.length } : d));
    } catch {
      setDefine((d) => (d?.word === word ? { word, failed: true } : d));
    }
  };

  const runSearch = async (q: string) => {
    const book = bookRef.current;
    if (!book || q.trim().length < 2) return;
    const token = ++searchToken.current;
    const sections = (book.spine as unknown as { spineItems: { href: string; load: (r: unknown) => Promise<unknown>; find: (q: string) => { cfi: string; excerpt: string }[]; unload: () => void }[] }).spineItems;
    const tocFlat = flatToc(toc);
    const results: { cfi: string; excerpt: string; chapter: string }[] = [];
    setSearch({ q, results: [], done: false, progress: 0 });
    for (let i = 0; i < sections.length; i++) {
      if (searchToken.current !== token) return;
      const s = sections[i];
      try {
        await s.load(book.load.bind(book));
        const ch = tocFlat.find((t) => t.href.split('#')[0].endsWith(s.href.split('#')[0]))?.label.trim() ?? '';
        for (const r of s.find(q.trim())) results.push({ ...r, chapter: ch });
        s.unload();
      } catch { /* unreadable section */ }
      if (searchToken.current !== token) return;
      setSearch({ q, results: [...results], done: false, progress: (i + 1) / sections.length });
      if (results.length >= 300) break;
    }
    setSearch({ q, results, done: true, progress: 1 });
  };

  if (!item) return null;
  const t = THEMES[prefs.theme];
  const bookmarks = item.bookmarks ?? [];
  const cfiCmp = (a: string, b: string) => { try { return new (epubRef.current!.EpubCFI)().compare(a, b); } catch { return 0; } };
  const hereMark = page && epubRef.current ? bookmarks.find((b) => cfiCmp(b.cfi, page.start) >= 0 && (page.atEnd || cfiCmp(b.cfi, page.end) <= 0)) : undefined;
  const toggleBookmark = async () => {
    if (!page) return;
    if (hereMark) {
      await updateItem(item.id, { bookmarks: bookmarks.filter((b) => b !== hereMark) });
      toast('Bookmark removed');
      return;
    }
    const at = session.current.cfi || page.start;
    let snippet = '';
    try { snippet = ((await bookRef.current?.getRange(at)) as Range | undefined)?.startContainer.textContent?.trim().slice(0, 70) ?? ''; } catch { /* ignore */ }
    const mark: Bookmark = { cfi: at, label: [chapter, snippet].filter(Boolean).join(' — ') || 'Bookmark', pct, createdAt: Date.now() };
    await updateItem(item.id, { bookmarks: [...bookmarks, mark].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)) });
    toast('Page bookmarked');
  };

  // Page numbers: real print pages when the book's page count is known,
  // otherwise print-sized pages estimated from the text length.
  const printPages = item.pageCount || (page?.total ? Math.max(1, Math.round((page.total * LOC_CHARS) / CHARS_PER_PAGE)) : undefined);
  const pageAt = (f: number) => (printPages ? Math.min(printPages, Math.max(1, Math.ceil(f * printPages))) : undefined);
  const speed = readingSpeed();
  const chapterPagesText = () => (page?.chPage && page.chTotal ? `Page ${page.chPage} of ${page.chTotal} in chapter` : '');
  const footerText = (mode: FooterMode): string => {
    if (!page) return '';
    const ready = page.loc !== undefined && !!page.total;
    if (!ready) return chapterPagesText();
    switch (mode) {
      case 'page': return pct !== undefined ? `Page ${pageAt(pct)} of ${printPages}` : chapterPagesText();
      case 'chapterTime': return `${fmtMinutes(((page.chapterEnd! - page.loc!) * LOC_CHARS) / speed.cpm)} left in chapter`;
      case 'bookTime': return `${fmtMinutes(((page.total! - page.loc!) * LOC_CHARS) / speed.cpm)} left in book`;
      case 'location': return `Location ${page.loc! + 1} of ${page.total}`;
      default: return chapterPagesText();
    }
  };
  const cycleFooter = () => setPrefs((p) => ({ ...p, footer: FOOTER_MODES[(FOOTER_MODES.indexOf(p.footer) + 1) % FOOTER_MODES.length] }));
  const pctText = pct !== undefined ? `${pct < 0.1 && pct > 0 ? (Math.round(pct * 1000) / 10).toFixed(1) : Math.round(pct * 100)}%` : '';
  const shownPct = scrub ?? pct ?? 0;
  const itemNotes = (idx.notesByItem.get(item.id) ?? []).filter((n) => n.location).sort((a, b) => cfiCmp(a.location!, b.location!));
  const commitScrub = () => {
    if (scrub !== null && bookRef.current) jumpTo(bookRef.current.locations.cfiFromPercentage(scrub));
    setScrub(null);
  };

  const iconBtn = { color: t.fg, minWidth: 40 } as const;
  const sidePanel = wide && !!tool;
  const SIDE_W = 'min(420px, 46vw)';
  const bar = { position: 'absolute', left: 0, right: 0, zIndex: 6, background: t.panel, color: t.fg, boxShadow: '0 2px 18px rgba(0,0,0,0.18)' } as const;
  const TOP = 'calc(34px + env(safe-area-inset-top))';
  const BOTTOM = 'calc(30px + env(safe-area-inset-bottom))';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: t.bg, color: t.fg, overflow: 'hidden' }}>
      {/* Running header: chapter name and bookmark ribbon. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP, paddingTop: 'env(safe-area-inset-top)', paddingLeft: 48, paddingRight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: t.muted }}>
        <span className="ellipsis">{chapter || item.title}</span>
      </div>
      {hereMark && <div aria-label="Bookmarked" style={{ position: 'absolute', top: 0, right: 18, width: 16, height: 30, background: '#d9534f', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)', zIndex: 4 }} />}

      {/* The book. */}
      <div ref={host} style={{ position: 'absolute', top: TOP, bottom: BOTTOM, left: MARGINS[prefs.margin], right: sidePanel ? `calc(${SIDE_W} + ${MARGINS[prefs.margin]}px)` : MARGINS[prefs.margin], overflow: 'hidden' }} />
      {status === 'ready' && (
        <>
          <button aria-label="Previous page" onClick={() => { setPanel(null); setChrome(false); setHint(false); userNav.current = true; rendRef.current?.prev(); }} style={{ position: 'absolute', left: 0, top: TOP, bottom: BOTTOM, width: '22%', background: 'transparent', border: 0, zIndex: 2 }} />
          <button aria-label="Next page" onClick={() => { setPanel(null); setChrome(false); setHint(false); userNav.current = true; rendRef.current?.next(); }} style={{ position: 'absolute', right: sidePanel ? SIDE_W : 0, top: TOP, bottom: BOTTOM, width: '22%', background: 'transparent', border: 0, zIndex: 2 }} />
        </>
      )}

      {/* Running footer: tap to change what it shows. */}
      <button onClick={cycleFooter} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BOTTOM, paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: Math.max(14, MARGINS[prefs.margin]), paddingRight: Math.max(14, MARGINS[prefs.margin]), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12, color: t.muted, background: 'transparent', border: 0, zIndex: 3, fontFamily: 'inherit' }} aria-label="Change what the footer shows">
        <span className="num ellipsis">{preparing ? 'Preparing page numbers…' : footerText(prefs.footer)}</span>
        <span className="num">{pctText}</span>
      </button>

      {hint && !chrome && !panel && status === 'ready' && (
        <div style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: '80%', background: 'rgba(20,20,20,0.82)', color: '#fff', padding: '12px 18px', borderRadius: 16, fontSize: 14, lineHeight: 1.45, zIndex: 7, pointerEvents: 'none', textAlign: 'center' }}>
          Tap the <b>middle</b> of the page for menus.<br />Tap the <b>sides</b> or swipe to turn pages.<br />Tap <u style={{ textDecorationStyle: 'dotted' }}>underlined</u> names to explore them.
        </div>
      )}
      {prefs.dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: prefs.dim, pointerEvents: 'none', zIndex: 5 }} />}

      {status === 'loading' && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center', color: t.fg, zIndex: 4 }}>Opening book…</div>}
      {status === 'missing' && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center', color: t.fg, zIndex: 7, background: t.bg }}>This book’s file isn’t on this device. Open the book page and attach an ePub file.<button className="btn mt-8" onClick={() => nav(`/item/${id}`)}>Back</button></div>}
      {status === 'error' && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center', color: t.fg, zIndex: 7, background: t.bg }}>This file couldn’t be opened. It may not be a valid ePub.<button className="btn mt-8" onClick={() => nav(`/item/${id}`)}>Back</button></div>}

      {/* Menus (tap the middle of the page to show or hide). */}
      {chrome && !panel && (
        <>
          <div style={{ ...bar, top: 0, paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="row" style={{ gap: 2, padding: '6px 6px' }}>
              <button className="btn sm ghost" style={{ color: t.fg }} onClick={close}>← Done</button>
              <div className="grow ellipsis small" style={{ textAlign: 'center', fontWeight: 600 }}>{item.title}</div>
              <button className="btn sm ghost" style={iconBtn} onClick={() => { setNavTab('toc'); setPanel('nav'); }} aria-label="Contents, bookmarks and notes">☰</button>
              <button className="btn sm ghost" style={iconBtn} onClick={() => { setNavTab('search'); setPanel('nav'); }} aria-label="Search in book">🔍</button>
              <button className="btn sm ghost" style={{ ...iconBtn, fontFamily: 'Georgia, serif', fontWeight: 700 }} onClick={() => setPanel('aa')} aria-label="Display settings">Aa</button>
              <button className="btn sm ghost" style={iconBtn} onClick={toggleBookmark} aria-label={hereMark ? 'Remove bookmark' : 'Bookmark this page'}>{hereMark ? '🔖' : '🏷️'}</button>
            </div>
          </div>
          <div style={{ ...bar, bottom: 0, paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
            {!wide && (
              <div className="reader-toolrow" role="toolbar" aria-label="Reading tools" style={{ borderBottom: `1px solid ${t.line}`, paddingBottom: 6 }}>
                {TOOLS.map((x) => <button key={x.id} style={{ color: t.fg }} onClick={() => openTool({ tab: x.id })}><Icon name={x.icon} />{x.label}</button>)}
              </div>
            )}
            <div style={{ padding: '10px 16px 0' }}>
              {jumpBack && <div className="row" style={{ justifyContent: 'center', marginBottom: 8 }}><button className="btn sm" onClick={() => { const b = jumpBack; setJumpBack(null); jumping.current = true; userNav.current = true; rendRef.current?.display(b); }}>↩ Back to where you were</button></div>}
              <div className="row between small" style={{ marginBottom: 4, gap: 12 }}>
                <span className="ellipsis" style={{ color: t.muted }}>{chapter}</span>
                <span className="num">{scrub !== null && printPages ? `Page ${pageAt(scrub)}` : pctText}</span>
              </div>
              <input
                type="range" min={0} max={1000} step={1} aria-label="Move through the book"
                disabled={preparing || !page?.total}
                value={Math.round(shownPct * 1000)}
                onChange={(e) => setScrub(Number(e.target.value) / 1000)}
                onPointerUp={commitScrub}
                onKeyUp={commitScrub}
                style={{ width: '100%', accentColor: '#c8793a' }}
              />
              <div className="row between small" style={{ color: t.muted, gap: 12 }}>
                <span className="num">{page?.total ? footerText('page') : 'Preparing page numbers…'}</span>
                <span className="num">{page?.total ? footerText('bookTime') : ''}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Reading tools: a side toolbar on big screens. */}
      {wide && status === 'ready' && (chrome || tool) && !panel && (
        <div className="reader-vbar" role="toolbar" aria-label="Reading tools" style={{ background: t.panel, right: sidePanel ? `calc(${SIDE_W} + 8px)` : 8 }}>
          {TOOLS.map((x) => <button key={x.id} style={{ color: tool?.tab === x.id ? '#c8793a' : t.fg }} onClick={() => (tool ? setTool({ ...tool, tab: x.id, mode: undefined }) : openTool({ tab: x.id }))}><Icon name={x.icon} />{x.label}</button>)}
        </div>
      )}
      {tool && !wide && <div onClick={() => setTool(null)} style={{ position: 'absolute', inset: 0, zIndex: 11, background: 'rgba(0,0,0,0.3)' }} />}
      {tool && (
        <div className={`reader-tool-sheet ${wide ? 'side' : 'bottom'}`} role="dialog" aria-label="Reading tools">
          {!wide && <div className="sheet-handle" style={{ margin: '0 auto 10px' }} />}
          <ReaderTools state={tool} setState={setTool} onClose={() => setTool(null)} found={found} chapterText={chapterText} chapterHref={toolHref} />
        </div>
      )}

      {/* Selection actions. */}
      {selection && (
        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 'calc(38px + env(safe-area-inset-bottom))', zIndex: 8, background: t.panel, color: t.fg, borderRadius: 14, boxShadow: '0 6px 28px rgba(0,0,0,0.25)', padding: 10 }}>
          <div className="small ellipsis" style={{ color: t.muted, marginBottom: 8 }}>“{selection.text.slice(0, 120)}”</div>
          {noteDraft !== null ? (
            <div className="col gap-8">
              <textarea autoFocus rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Your note…" style={{ width: '100%', background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 8, padding: 8, font: 'inherit' }} />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setNoteDraft(null)}>Cancel</button>
                <button className="btn sm primary" disabled={!noteDraft.trim()} onClick={() => saveHighlight(noteDraft.trim())}>Save note</button>
              </div>
            </div>
          ) : define ? (
            <div className="col gap-8">
              <b style={{ textTransform: 'capitalize' }}>{define.word}</b>
              {!define.defs && !define.failed && <span className="small" style={{ color: t.muted }}>Looking it up…</span>}
              {define.failed && <span className="small" style={{ color: t.muted }}>No definition found (or you’re offline).</span>}
              {define.defs?.map((d, i) => <div key={i} className="small"><i style={{ color: t.muted }}>{d.pos}</i> · {d.text}</div>)}
              <div className="row wrap" style={{ gap: 6 }}>
                <a className="btn sm ghost" style={{ color: t.fg }} href={`https://en.wiktionary.org/wiki/${encodeURIComponent(define.word.toLowerCase())}`} target="_blank" rel="noreferrer">Wiktionary ↗</a>
                <a className="btn sm ghost" style={{ color: t.fg }} href={`https://www.google.com/search?q=${encodeURIComponent('define ' + define.word)}`} target="_blank" rel="noreferrer">Google ↗</a>
                <span className="grow" />
                <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setDefine(null)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="row wrap" style={{ gap: 4 }}>
              <button className="btn sm primary" onClick={() => saveHighlight()}>❝ Save quote</button>
              <button className="btn sm ai-solid" onClick={() => { const text = selection.text; clearSelection(); openTool({ tab: 'ai', selection: text }); }}>✨ Ask AI</button>
              {selection.text.split(/\s+/).length <= 6 && <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => { const text = selection.text.replace(/[“”"'’.,;:!?()]+$|^[“”"'‘(]+/g, ''); clearSelection(); openTool({ tab: 'entity', focus: { name: text } }); }}>🧭 Explore</button>}
              <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setNoteDraft('')}>✎ Note</button>
              {selection.text.split(/\s+/).length <= 3 && <button className="btn sm ghost" style={{ color: t.fg }} onClick={lookUpSelection}>📖 Define</button>}
              <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => { navigator.clipboard?.writeText(selection.text).then(() => toast('Copied')).catch(() => {}); clearSelection(); }}>Copy</button>
              <button className="btn sm ghost" style={{ color: t.fg }} aria-label="Search the book for this" onClick={() => { const q = selection.text.slice(0, 80); clearSelection(); setNavTab('search'); setPanel('nav'); runSearch(q); }}>🔍</button>
              <span className="grow" />
              <button className="btn sm ghost" style={{ color: t.fg }} onClick={clearSelection} aria-label="Close">✕</button>
            </div>
          )}
        </div>
      )}

      {/* Bottom sheets. */}
      {panel && <div onClick={() => setPanel(null)} style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(0,0,0,0.25)' }} />}
      {panel === 'aa' && (
        <Sheet t={t}>
          <DisplaySettings prefs={prefs} setPrefs={setPrefs} t={t} speed={speed} isFull={isFull} />
        </Sheet>
      )}
      {panel === 'nav' && (
        <Sheet t={t} tall>
          <div className="row" style={{ gap: 4, marginBottom: 12, overflowX: 'auto' }}>
            {([['toc', 'Contents'], ['marks', `Bookmarks${bookmarks.length ? ` · ${bookmarks.length}` : ''}`], ['notes', `Notes${itemNotes.length ? ` · ${itemNotes.length}` : ''}`], ['search', 'Search']] as const).map(([k, l]) => (
              <button key={k} className="btn sm" onClick={() => setNavTab(k)} style={{ background: navTab === k ? t.fg : 'transparent', color: navTab === k ? t.bg : t.fg, borderColor: t.line, flexShrink: 0 }}>{l}</button>
            ))}
            <span className="grow" />
            <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setPanel(null)} aria-label="Close">✕</button>
          </div>
          {navTab === 'toc' && (toc.length ? <TocList items={toc} color={t.fg} current={chapter} onPick={(href) => jumpTo(href)} /> : <p className="small" style={{ color: t.muted }}>This book has no table of contents.</p>)}
          {navTab === 'marks' && (
            <div className="col" style={{ gap: 4 }}>
              <button className="btn sm" style={{ color: t.fg, borderColor: t.line, background: 'transparent', alignSelf: 'flex-start' }} onClick={toggleBookmark}>{hereMark ? '🔖 Remove bookmark on this page' : '🏷️ Bookmark this page'}</button>
              {!bookmarks.length && <p className="small" style={{ color: t.muted }}>No bookmarks yet. Tap 🏷️ at the top while reading to mark a page.</p>}
              {bookmarks.map((b) => (
                <div key={b.cfi} className="row" style={{ borderBottom: `1px solid ${t.line}`, padding: '6px 0' }}>
                  <button className="grow" style={{ textAlign: 'left', background: 'transparent', border: 0, color: t.fg, padding: 0, font: 'inherit', cursor: 'pointer', minWidth: 0 }} onClick={() => jumpTo(b.cfi)}>
                    <div className="small ellipsis">{b.label}</div>
                    <div className="tiny" style={{ color: t.muted }}>{b.pct !== undefined && printPages ? `Page ${pageAt(b.pct)} · ` : ''}{new Date(b.createdAt).toLocaleDateString()}</div>
                  </button>
                  <button className="btn xs ghost" style={{ color: t.muted }} aria-label="Delete bookmark" onClick={() => updateItem(item.id, { bookmarks: bookmarks.filter((x) => x !== b) })}>✕</button>
                </div>
              ))}
            </div>
          )}
          {navTab === 'notes' && (
            <div className="col" style={{ gap: 4 }}>
              {!itemNotes.length && <p className="small" style={{ color: t.muted }}>Press and hold on a word, drag to select text, then tap Save quote or Note. Quotes also appear in Knowledge and on Today.</p>}
              {itemNotes.map((n: Note) => (
                <button key={n.id} style={{ textAlign: 'left', background: 'transparent', border: 0, borderBottom: `1px solid ${t.line}`, color: t.fg, padding: '8px 0', font: 'inherit', cursor: 'pointer' }} onClick={() => jumpTo(n.location!)}>
                  <div className="small" style={{ whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.kind === 'quote' ? `❝ ${n.text}` : `✎ ${n.text}`}</div>
                  <div className="tiny" style={{ color: t.muted }}>{[n.chapter, n.page ? `page ${n.page}` : ''].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
            </div>
          )}
          {navTab === 'search' && (
            <div className="col gap-8">
              <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); runSearch(String(q ?? '')); }}>
                <input name="q" autoFocus defaultValue={search?.q ?? ''} placeholder="Search this book…" style={{ flex: 1, minWidth: 0, background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 8, padding: '8px 10px', font: 'inherit' }} />
                <button className="btn sm primary" type="submit">Search</button>
              </form>
              {search && (
                <div className="small" style={{ color: t.muted }}>
                  {search.done ? `${search.results.length}${search.results.length >= 300 ? '+' : ''} result${search.results.length === 1 ? '' : 's'}` : `Searching… ${Math.round(search.progress * 100)}%`}
                </div>
              )}
              {search?.results.map((r, i) => (
                <button key={r.cfi + i} style={{ textAlign: 'left', background: 'transparent', border: 0, borderBottom: `1px solid ${t.line}`, color: t.fg, padding: '8px 0', font: 'inherit', cursor: 'pointer' }} onClick={() => jumpTo(r.cfi)}>
                  <div className="small"><Excerpt text={r.excerpt} q={search.q} /></div>
                  {r.chapter && <div className="tiny" style={{ color: t.muted }}>{r.chapter}</div>}
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
      {/* Always offer a way out if the book never finishes opening. */}
      {status === 'loading' && <button className="btn sm" style={{ position: 'absolute', top: 'calc(8px + env(safe-area-inset-top))', left: 8, zIndex: 8 }} onClick={() => { if ((window.history.state as { idx?: number } | null)?.idx) nav(-1); else nav('/ebooks'); }}>← Back</button>}
    </div>
  );
}

function applyTheme(r: Rendition, p: Prefs) {
  const t = THEMES[p.theme];
  r.themes.override('color', t.fg);
  r.themes.override('background', t.bg);
  r.themes.fontSize(`${p.size}%`);
}

function Sheet({ t, tall, children }: { t: (typeof THEMES)[ThemeId]; tall?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, background: t.panel, color: t.fg, borderRadius: '18px 18px 0 0', boxShadow: '0 -6px 30px rgba(0,0,0,0.25)', maxHeight: tall ? '80%' : '75%', overflowY: 'auto', padding: '14px 16px calc(16px + env(safe-area-inset-bottom))' }}>
      <div style={{ width: 40, height: 4, borderRadius: 4, background: t.line, margin: '0 auto 12px' }} />
      {children}
    </div>
  );
}

function DisplaySettings({ prefs, setPrefs, t, speed, isFull }: { prefs: Prefs; setPrefs: (f: (p: Prefs) => Prefs) => void; t: (typeof THEMES)[ThemeId]; speed: ReturnType<typeof readingSpeed>; isFull: boolean }) {
  const { toast } = useUI();
  const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const label = { fontSize: 12, fontWeight: 600, color: t.muted, margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' } as const;
  const choice = (on: boolean) => ({ background: on ? t.fg : 'transparent', color: on ? t.bg : t.fg, borderColor: on ? t.fg : t.line, flex: 1 });
  return (
    <div>
      <div style={{ ...label, marginTop: 0 }}>Text size</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" style={{ ...choice(false), flex: 'none', fontSize: 13 }} onClick={() => set({ size: Math.max(70, prefs.size - 10) })} aria-label="Smaller text">A−</button>
        <input type="range" min={70} max={220} step={10} value={prefs.size} onChange={(e) => set({ size: Number(e.target.value) })} style={{ flex: 1, accentColor: '#c8793a' }} aria-label="Text size" />
        <button className="btn" style={{ ...choice(false), flex: 'none', fontSize: 19 }} onClick={() => set({ size: Math.min(220, prefs.size + 10) })} aria-label="Larger text">A+</button>
      </div>

      <div style={label}>Font</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
        {FONTS.map((f) => (
          <button key={f.id} className="btn" onClick={() => set({ font: f.id })} title={f.note} style={{ ...choice(prefs.font === f.id), fontFamily: f.css ?? 'inherit', height: 'auto', padding: '8px 6px', flexDirection: 'column', gap: 0 }}>
            <span style={{ fontSize: 16 }}>{f.label}</span>
            {f.note && <span style={{ fontSize: 10, opacity: 0.7, fontFamily: 'system-ui, sans-serif' }}>{f.note}</span>}
          </button>
        ))}
      </div>

      <div style={label}>Page colour</div>
      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(THEMES) as ThemeId[]).map((k) => (
          <button key={k} onClick={() => set({ theme: k })} aria-label={THEMES[k].label} style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 12, background: THEMES[k].bg, color: THEMES[k].fg, border: `2px solid ${prefs.theme === k ? '#c8793a' : t.line}`, fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span style={{ fontSize: 17 }}>Aa</span><span style={{ fontSize: 9, fontFamily: 'system-ui, sans-serif' }}>{THEMES[k].label}</span>
          </button>
        ))}
      </div>

      <div style={label}>Brightness</div>
      <div className="row" style={{ gap: 8 }}>
        <span aria-hidden>🔅</span>
        <input type="range" min={0} max={60} value={60 - Math.round(prefs.dim * 100)} onChange={(e) => set({ dim: (60 - Number(e.target.value)) / 100 })} style={{ flex: 1, accentColor: '#c8793a' }} aria-label="Brightness" />
        <span aria-hidden>🔆</span>
      </div>

      <div style={label}>Line spacing</div>
      <div className="row" style={{ gap: 6 }}>
        {SPACING.map((s) => <button key={s.value} className="btn sm" style={choice(prefs.spacing === s.value)} onClick={() => set({ spacing: s.value })}>{s.label}</button>)}
      </div>

      <div style={label}>Margins</div>
      <div className="row" style={{ gap: 6 }}>
        {(['narrow', 'normal', 'wide'] as Margin[]).map((m) => <button key={m} className="btn sm" style={choice(prefs.margin === m)} onClick={() => set({ margin: m })}>{m[0].toUpperCase() + m.slice(1)}</button>)}
      </div>

      <div style={label}>Alignment</div>
      <div className="row" style={{ gap: 6 }}>
        {([['publisher', 'Original'], ['left', 'Left'], ['justify', 'Justified']] as [Align, string][]).map(([v, l]) => <button key={v} className="btn sm" style={choice(prefs.align === v)} onClick={() => set({ align: v })}>{l}</button>)}
      </div>

      <div style={label}>More</div>
      <label className="row between" style={{ padding: '6px 0' }}>
        <span className="small">Underline people, places & events I’ve met</span>
        <input type="checkbox" checked={prefs.entities} onChange={(e) => set({ entities: e.target.checked })} />
      </label>
      <label className="row between" style={{ padding: '6px 0' }}>
        <span className="small">Keep screen on while reading</span>
        <input type="checkbox" checked={prefs.keepAwake} onChange={(e) => set({ keepAwake: e.target.checked })} />
      </label>
      {document.fullscreenEnabled && (
        <label className="row between" style={{ padding: '6px 0' }}>
          <span className="small">Full screen (hides the phone’s bars)</span>
          <input type="checkbox" checked={isFull} onChange={(e) => { if (e.target.checked) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); else document.exitFullscreen().catch(() => {}); }} />
        </label>
      )}

      <div style={label}>Reading speed</div>
      <div className="small" style={{ color: t.muted }}>
        About <b style={{ color: t.fg }}>{speed.wpm} words a minute</b> ({Math.round((speed.cpm * 60) / CHARS_PER_PAGE)} pages an hour). {speed.learned ? 'Learned from how fast you turn pages.' : 'Still learning — keep reading and it will adjust to you.'}
        {' '}Tap the line at the bottom of the page to switch between page number, time left and more.
      </div>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="btn sm ghost" style={{ color: t.muted, paddingLeft: 0 }} onClick={() => { resetReadingSpeed(); toast('Reading speed reset'); }}>Reset reading speed</button>
        <button className="btn sm ghost" style={{ color: t.muted }} onClick={() => setPrefs((p) => ({ ...DEFAULT_PREFS, footer: p.footer }))}>Reset display settings</button>
      </div>
    </div>
  );
}

function Excerpt({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return <>{text}</>;
  const n = q.trim().length;
  return <>{text.slice(0, i)}<mark style={{ background: 'rgba(237,161,0,0.4)', color: 'inherit' }}>{text.slice(i, i + n)}</mark>{text.slice(i + n)}</>;
}

function TocList({ items, onPick, color, current, depth = 0 }: { items: NavItem[]; onPick: (href: string) => void; color: string; current?: string; depth?: number }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      {items.map((i) => (
        <div key={i.id ?? i.href}>
          <button className="btn ghost sm" style={{ color, justifyContent: 'flex-start', width: '100%', paddingLeft: 8 + depth * 14, whiteSpace: 'normal', height: 'auto', minHeight: 36, textAlign: 'left', fontWeight: current === i.label.trim() ? 700 : 400 }} onClick={() => onPick(i.href)}>{current === i.label.trim() ? '▸ ' : ''}{i.label.trim()}</button>
          {i.subitems?.length ? <TocList items={i.subitems} onPick={onPick} color={color} current={current} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  );
}
