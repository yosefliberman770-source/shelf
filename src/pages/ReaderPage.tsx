// Full-screen EPUB reader. Turning pages updates the book's progress, and each
// visit is logged as a timed reading session when you leave the reader.
import type { Book, Contents, Location, NavItem, Rendition } from 'epubjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addNote, logProgress, updateItem } from '../db/actions';
import { db } from '../db/db';
import { getEbookFile } from '../lib/ebooks';
import { toDisplay, unitLabel } from '../engine/units';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Theme = 'light' | 'sepia' | 'dark';
const THEMES: Record<Theme, { bg: string; fg: string }> = {
  light: { bg: '#fcfcfb', fg: '#1b1a18' },
  sepia: { bg: '#f4ecd8', fg: '#433422' },
  dark: { bg: '#161615', fg: '#e8e6e1' },
};
const PREFS = 'shelf.readerPrefs';

function loadPrefs(): { theme: Theme; size: number } {
  try {
    return { theme: 'light', size: 100, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') };
  } catch {
    return { theme: 'light', size: 100 };
  }
}

/** Idle gaps longer than this between page turns don't count as reading time. */
const MAX_GAP_MS = 5 * 60_000;

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [pct, setPct] = useState<number | undefined>();
  const [chapter, setChapter] = useState('');
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [selection, setSelection] = useState<{ cfi: string; text: string } | null>(null);
  const [preparing, setPreparing] = useState(false);

  // Reading-time accounting for the automatic session.
  const session = useRef({ startPct: 0, lastPct: 0, activeMs: 0, lastTick: Date.now(), startedAt: Date.now(), cfi: '' });

  const tick = () => {
    const s = session.current;
    const now = Date.now();
    if (document.visibilityState === 'visible') s.activeMs += Math.min(now - s.lastTick, MAX_GAP_MS);
    s.lastTick = now;
  };

  /** Save position and log the session (only when progress was made). */
  const flush = useCallback(async () => {
    const s = session.current;
    tick();
    const cur = idxRef.current;
    const it = cur.items.get(id!);
    if (!it) return;
    if (s.cfi) await updateItem(it.id, { readerLocation: s.cfi });
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await getEbookFile(id!);
      if (!file) { setStatus('missing'); return; }
      try {
        const { default: ePub } = await import('epubjs');
        const book = ePub(await file.blob.arrayBuffer());
        bookRef.current = book;
        await book.ready;
        if (cancelled || !host.current) return;
        const rendition = book.renderTo(host.current, { width: '100%', height: '100%', flow: 'paginated', spread: 'none', allowScriptedContent: false });
        rendRef.current = rendition;
        // Some publishers hide text by pushing it far off-screen (e.g.
        // left: -999em), which breaks page layout. Put it back in the flow.
        rendition.hooks.content.register((contents: Contents) => {
          const doc = contents.document;
          for (const el of Array.from(doc.querySelectorAll<HTMLElement>('body *'))) {
            const cs = contents.window.getComputedStyle(el);
            if ((cs.position === 'absolute' || cs.position === 'fixed') && (parseFloat(cs.left) < -200 || parseFloat(cs.top) < -200 || parseFloat(cs.right) < -200)) {
              el.style.setProperty('position', 'static', 'important');
              el.style.setProperty('left', 'auto', 'important');
            }
          }
          const style = doc.createElement('style');
          style.textContent = 'img, svg, video { max-width: 100% !important; max-height: 92vh !important; height: auto; object-fit: contain; } html, body { max-width: 100%; }';
          doc.head.appendChild(style);
        });
        applyPrefs(rendition, prefs);
        setToc((await book.loaded.navigation).toc);
        // Percentages need "locations"; build once and cache with the file.
        if (file.locations) book.locations.load(file.locations);
        const it = idx.items.get(id!);
        const startCfi = it?.readerLocation;
        await rendition.display(startCfi || undefined);
        setStatus('ready');
        if (!file.locations) {
          setPreparing(true);
          book.locations.generate(1200).then(async () => {
            await db.files.update(file.id, { locations: book.locations.save() });
            if (!cancelled) { setPreparing(false); const loc = rendition.currentLocation() as unknown as Location; if (loc?.start) onRelocated(loc); }
          });
        }
        const it0 = idx.items.get(id!);
        const startFrac = it0 && it0.total ? Math.min(1, idx.position(it0) / it0.total) : 0;
        session.current = { startPct: startFrac, lastPct: startFrac, activeMs: 0, lastTick: Date.now(), startedAt: Date.now(), cfi: startCfi ?? '' };
        rendition.on('relocated', onRelocated);
        rendition.on('selected', (cfi: string, contents: Contents) => {
          const text = contents.window.getSelection()?.toString().trim() ?? '';
          if (text) setSelection({ cfi, text });
        });
        rendition.on('click', () => setChrome((c) => !c));
        rendition.on('keyup', (e: KeyboardEvent) => { if (e.key === 'ArrowRight') rendition.next(); if (e.key === 'ArrowLeft') rendition.prev(); });
        // Swipe to turn pages.
        let sx = 0;
        let sy = 0;
        rendition.on('touchstart', (e: TouchEvent) => { sx = e.changedTouches[0].screenX; sy = e.changedTouches[0].screenY; });
        rendition.on('touchend', (e: TouchEvent) => {
          const dx = e.changedTouches[0].screenX - sx;
          const dy = e.changedTouches[0].screenY - sy;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) rendition.next(); else rendition.prev(); }
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
      session.current.cfi = cfi;
      const p = book.locations.length() ? book.locations.percentageFromCfi(cfi) : undefined;
      if (loc.atEnd) {
        session.current.lastPct = 1;
        setPct(1);
      } else if (p !== undefined && p !== null) {
        session.current.lastPct = Math.max(session.current.lastPct, p);
        setPct(p);
      }
      const href = loc.start.href;
      const flat = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...flat(i.subitems ?? [])]);
      const ch = flat(bookRef.current?.navigation?.toc ?? []).find((t) => href && t.href.split('#')[0].endsWith(href.split('#')[0]));
      if (ch) setChapter(ch.label.trim());
      setSelection(null);
    }

    const onHide = () => { if (document.visibilityState === 'hidden') flush(); else session.current.lastTick = Date.now(); };
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

  useEffect(() => {
    if (rendRef.current) applyPrefs(rendRef.current, prefs);
    try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  const close = async () => {
    await flush();
    nav(`/item/${id}`);
  };

  if (!item) return null;
  const t = THEMES[prefs.theme];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: t.bg, color: t.fg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: chrome ? 'flex' : 'none', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${prefs.theme === 'dark' ? '#2f2f2c' : '#e3e0d8'}` }}>
        <button className="btn sm ghost" style={{ color: t.fg }} onClick={close}>← Done</button>
        <div className="grow ellipsis small" style={{ textAlign: 'center' }}>{chapter || item.title}</div>
        <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setShowToc(!showToc)} aria-label="Contents">☰</button>
        <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setPrefs({ ...prefs, size: Math.max(70, prefs.size - 10) })} aria-label="Smaller text">A−</button>
        <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setPrefs({ ...prefs, size: Math.min(200, prefs.size + 10) })} aria-label="Larger text">A+</button>
        <button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setPrefs({ ...prefs, theme: prefs.theme === 'light' ? 'sepia' : prefs.theme === 'sepia' ? 'dark' : 'light' })} aria-label="Theme">◐</button>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={host} style={{ position: 'absolute', inset: '8px 12px' }} />
        {status === 'ready' && (
          <>
            <button aria-label="Previous page" onClick={() => rendRef.current?.prev()} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '18%', background: 'transparent', border: 0 }} />
            <button aria-label="Next page" onClick={() => rendRef.current?.next()} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '18%', background: 'transparent', border: 0 }} />
          </>
        )}
        {status === 'loading' && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center', color: t.fg }}>Opening book…</div>}
        {status === 'missing' && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center', color: t.fg }}>This book’s file isn’t on this device. Open the book page and attach an ePub file.<button className="btn mt-8" onClick={() => nav(`/item/${id}`)}>Back</button></div>}
        {status === 'error' && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center', color: t.fg }}>This file couldn’t be opened. It may not be a valid ePub.<button className="btn mt-8" onClick={() => nav(`/item/${id}`)}>Back</button></div>}
        {showToc && (
          <div style={{ position: 'absolute', inset: 0, background: t.bg, overflowY: 'auto', padding: 16, zIndex: 2 }}>
            <div className="row between mb-8"><b>Contents</b><button className="btn sm ghost" style={{ color: t.fg }} onClick={() => setShowToc(false)}>✕</button></div>
            <TocList items={toc} color={t.fg} onPick={(href) => { rendRef.current?.display(href); setShowToc(false); }} />
          </div>
        )}
        {selection && (
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 3 }} className="card tight row between">
            <span className="small ellipsis grow" style={{ color: 'var(--text)' }}>“{selection.text.slice(0, 80)}”</span>
            <button className="btn sm primary" onClick={async () => {
              const it = idx.items.get(id!)!;
              await addNote({ itemId: it.id, kind: 'quote', text: selection.text, chapter: chapter || undefined, page: pct !== undefined && it.total ? Math.round(toDisplay(it, pct * it.total)) : undefined });
              toast('Quote saved');
              setSelection(null);
              rendRef.current?.annotations.highlight(selection.cfi, {}, () => {}, '', { fill: '#eda100', 'fill-opacity': '0.3' });
            }}>Save quote</button>
            <button className="btn sm ghost" onClick={() => setSelection(null)}>✕</button>
          </div>
        )}
      </div>
      <div style={{ display: chrome ? 'flex' : 'none', alignItems: 'center', gap: 10, padding: '8px 14px calc(8px + env(safe-area-inset-bottom))', fontSize: 12 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 4, background: prefs.theme === 'dark' ? '#2f2f2c' : '#e3e0d8', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((pct ?? 0) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <span className="num">{preparing ? 'Preparing…' : pct !== undefined ? `${pct < 0.1 ? (Math.round(pct * 1000) / 10).toFixed(1) : Math.round(pct * 100)}%` : ''}</span>
        {item.unit !== 'percent' && pct !== undefined && item.total ? <span className="num" style={{ opacity: 0.7 }}>≈ {Math.round(toDisplay(item, pct * item.total))} {unitLabel(item)}</span> : null}
      </div>
    </div>
  );
}

function applyPrefs(r: Rendition, p: { theme: Theme; size: number }) {
  const t = THEMES[p.theme];
  r.themes.override('color', t.fg);
  r.themes.override('background', t.bg);
  r.themes.fontSize(`${p.size}%`);
}

function TocList({ items, onPick, color, depth = 0 }: { items: NavItem[]; onPick: (href: string) => void; color: string; depth?: number }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      {items.map((i) => (
        <div key={i.id ?? i.href}>
          <button className="btn ghost sm" style={{ color, justifyContent: 'flex-start', width: '100%', paddingLeft: 8 + depth * 14, whiteSpace: 'normal', height: 'auto', minHeight: 32, textAlign: 'left' }} onClick={() => onPick(i.href)}>{i.label.trim()}</button>
          {i.subitems?.length ? <TocList items={i.subitems} onPick={onPick} color={color} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  );
}
