// Explore: find your next book. Two things, done well — a searchable book
// database (Open Library) and AI picks for what to read next, based on what
// you've actually read and rated. Every outside suggestion is checked against
// the database before it's shown as a real book.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM, folderDigest, libraryDigest } from '../ai/context';
import { brainSummary } from '../ai/summaries';
import { AIErrorNotice, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { Cover, Modal, Segmented, useDebounced } from '../components/common';
import { Icon } from '../components/icons';
import { addItem } from '../db/actions';
import type { Item } from '../db/types';
import type { LibraryIndex } from '../engine/model';
import { type MetaResult, searchBooks } from '../lib/openlibrary';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Tab = 'foryou' | 'search' | 'subjects';

const PICK_MODES = [
  { id: 'next', label: 'Best next read', prompt: 'Recommend the best books for the reader to read next, based on what they loved, what they are reading now and their goals.' },
  { id: 'loved', label: 'More like my favourites', prompt: 'Recommend books closely similar in subject, style or approach to the books the reader rated highest.' },
  { id: 'new', label: 'Something different', prompt: 'Recommend books in subjects or genres the reader has NOT explored much but that connect to things they rated highly.' },
  { id: 'deeper', label: 'Go deeper', prompt: 'Recommend more advanced or specialist books on the subjects the reader reads most — scholarly works, primary sources.' },
  { id: 'short', label: 'Short reads', prompt: 'Recommend short books (under about 250 pages) that match the reader’s taste.' },
  { id: 'pile', label: 'From my Want-to-Read pile', prompt: 'Pick which books the reader already owns but has not started should come next, and in what order. Only use books from their library.' },
] as const;

interface Pick { title: string; author?: string; itemId?: string; why: string; match?: MetaResult; checked?: boolean }

export default function ExploreHub() {
  const idx = useLibrary();
  const [tab, setTab] = useState<Tab>('foryou');
  const [detail, setDetail] = useState<MetaResult | null>(null);
  useConcierge('Explore', ['What should I read next?', 'Find me something like my favourite book', 'What am I missing in my reading?'], () => `${brainSummary(idx)}\n\n${libraryDigest(idx, idx.settings.ai.share, idx.itemList(), 120)}`, [idx]);
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head"><div><h1>Explore</h1><div className="sub">Find your next book — search millions of books, or let AI pick from what you love.</div></div></div>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'foryou', label: '✦ For you' }, { value: 'search', label: '🔎 Book database' }, { value: 'subjects', label: '📚 Subjects' }]} />
      <div className="mt-16">
        {tab === 'foryou' && <ForYou idx={idx} onOpen={setDetail} />}
        {tab === 'search' && <BookSearch onOpen={setDetail} />}
        {tab === 'subjects' && <Subjects idx={idx} onOpen={setDetail} />}
      </div>
      <div className="section-title">More ways to explore your library</div>
      <div className="chips-scroll">
        {[['/explore/connections', 'Connections'], ['/explore/timeline', 'History timeline'], ['/explore/map', 'Reading map'], ['/explore/authors', 'Authors'], ['/explore/paths', 'Reading paths'], ['/knowledge', 'Knowledge Atlas'], ['/library/curricula', 'Curricula']].map(([to, l]) => <Link key={to} className="chip" to={to}>{l}</Link>)}
      </div>
      {detail && <BookDetail r={detail} onClose={() => setDetail(null)} onOpen={setDetail} />}
    </div>
  );
}

// ── For you ────────────────────────────────────────────────────────────

function ForYou({ idx, onOpen }: { idx: LibraryIndex; onOpen: (r: MetaResult) => void }) {
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const [mode, setMode] = useState<(typeof PICK_MODES)[number]['id']>('next');
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const loved = useMemo(() => idx.itemList().filter((i) => i.status === 'read' && (idx.rating(i) ?? 0) >= 4).sort((a, b) => (idx.rating(b) ?? 0) - (idx.rating(a) ?? 0)).slice(0, 4), [idx]);
  const reading = idx.itemList().filter((i) => i.status === 'reading').slice(0, 3);

  const go = async (m = mode) => {
    setPicks(null);
    const spec = PICK_MODES.find((x) => x.id === m)!;
    const dnf = idx.itemList().filter((i) => i.status === 'dnf').map((i) => i.title);
    const r = await run((signal) => completeJSON<{ picks: Pick[] }>({
      system: `${BASE_SYSTEM}\nYou recommend books. Only suggest real, published books — never invent titles. Each "why" must point to something specific in the reader's history (a book they rated, a subject they read, their pace). Return JSON {"picks":[{"title":"...","author":"...","itemId":"library id if they already own it, else omit","why":"one or two sentences"}]} with 8 picks.`,
      messages: [{ role: 'user', content: `${spec.prompt}\n\n${brainSummary(idx)}\n\nDID NOT FINISH: ${dnf.join(', ') || 'none'}\n\n${folderDigest(idx)}\n\n${libraryDigest(idx, idx.settings.ai.share, idx.itemList(), 150)}` }],
      maxTokens: 2500,
    }, signal, () => ({ picks: [] })));
    if (!r) return;
    const list: Pick[] = (r.data.picks ?? []).filter((p) => p?.title).slice(0, 10).map((p) => ({ ...p, itemId: p.itemId && idx.items.has(p.itemId) ? p.itemId : idx.itemList().find((i) => i.title.toLowerCase() === p.title.toLowerCase())?.id }));
    setPicks(list);
    // Check outside suggestions really exist, and fetch their covers.
    const checked = await Promise.all(list.map(async (p) => {
      if (p.itemId) return { ...p, checked: true };
      const hits = await searchBooks(`${p.title} ${p.author ?? ''}`, { limit: 3 }).catch(() => []);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = hits.find((h) => norm(h.title).startsWith(norm(p.title).slice(0, 14))) ?? undefined;
      return { ...p, match, checked: true };
    }));
    setPicks(checked);
  };

  return (
    <div className="col gap-16">
      {ready ? (
        <div className="card col gap-12">
          <div className="row between"><b>What should I read next?</b><Icon name="sparkle" /></div>
          <div className="chips-scroll">
            {PICK_MODES.map((m) => <button key={m.id} className={`chip ${mode === m.id ? 'on' : ''}`} onClick={() => { setMode(m.id); go(m.id); }} disabled={loading}>{m.label}</button>)}
          </div>
          {!picks && !loading && <button className="btn primary" onClick={() => go()}>✦ Get my picks</button>}
          {loading && <div className="small muted">Looking through your reading history…</div>}
          <AIErrorNotice error={error} />
        </div>
      ) : (
        <div className="notice small">Turn on AI in <Link to="/settings?tab=ai" style={{ textDecoration: 'underline' }}>Settings</Link> for personal picks based on everything you’ve read. Meanwhile, here are books related to your favourites.</div>
      )}
      {picks && (
        <div className="col gap-12">
          {picks.map((p, i) => {
            const it = p.itemId ? idx.items.get(p.itemId) : undefined;
            return <PickCard key={i} p={p} it={it} idx={idx} onOpen={onOpen} />;
          })}
          {picks.length === 0 && <div className="small muted">No picks came back — try again.</div>}
          <div className="tiny faint">Picks by AI from your library, ratings and reading history. Books marked ✓ were found in Open Library.</div>
        </div>
      )}
      {[...reading, ...loved].map((b) => <BecauseRow key={b.id} idx={idx} book={b} onOpen={onOpen} />)}
    </div>
  );
}

function PickCard({ p, it, idx, onOpen }: { p: Pick; it?: Item; idx: LibraryIndex; onOpen: (r: MetaResult) => void }) {
  const { toast } = useUI();
  const [added, setAdded] = useState(false);
  const m = p.match;
  return (
    <div className="card tight">
      <div className="row top gap-12">
        {it ? <Link to={`/item/${it.id}`}><Cover item={it} width={56} /></Link>
          : <button style={{ padding: 0, border: 0, background: 'none' }} onClick={() => m && onOpen(m)} aria-label={`Details for ${p.title}`}><Cover item={{ id: p.title, title: p.title, coverUrl: m?.coverUrl, contentType: 'book' }} width={56} /></button>}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="book-title" style={{ fontSize: 16 }}>{it ? <Link to={`/item/${it.id}`}>{it.title}</Link> : p.title}</div>
          <div className="small muted">{it ? idx.authorLine(it) : p.author}{m?.year ? ` · ${m.year}` : ''}{m?.pages ? ` · ${m.pages} pages` : ''}</div>
          <p className="small mt-8" style={{ margin: '6px 0 0' }}>{p.why}</p>
          <div className="row wrap gap-8 mt-8">
            {it ? <span className="chip good">On your shelf</span>
              : !p.checked ? <span className="tiny faint">Checking…</span>
              : m ? (
                <>
                  <span className="tiny" style={{ color: 'var(--good)' }}>✓ Real book</span>
                  <button className="btn xs" onClick={() => onOpen(m)}>Details</button>
                  <button className="btn xs primary" disabled={added} onClick={async () => { await addFromMeta(m); setAdded(true); toast(`Added “${m.title}” to Want to read`); }}>{added ? 'Added' : '＋ Want to read'}</button>
                </>
              ) : <span className="tiny" style={{ color: 'var(--warn)' }}>Couldn’t find this in the database — double-check it exists</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

async function addFromMeta(r: MetaResult) {
  return addItem({ title: r.title, subtitle: r.subtitle, authors: r.authors.slice(0, 3), isbn: r.isbn, total: r.pages, pageCount: r.pages, publishedYear: r.year, publisher: r.publisher, coverUrl: r.coverUrl, genres: r.subjects.slice(0, 5), status: 'want', openLibraryKey: r.key });
}

const GENERIC = /^(history|fiction|nonfiction|non-fiction|general|accessible book|protected daisy|in library|large type books|open library staff picks|reading level.*|textbooks?|juvenile.*|english language|biography)$/i;

/** "Because you read X": catalogue neighbours of a book you're reading or loved. */
function BecauseRow({ idx, book, onOpen }: { idx: LibraryIndex; book: Item; onOpen: (r: MetaResult) => void }) {
  const subject = book.genres.find((g) => !GENERIC.test(g) && g.length < 40);
  const [rows, setRows] = useState<MetaResult[] | null>(null);
  useEffect(() => {
    if (!subject) return;
    const c = new AbortController();
    searchBooks('', { subject: subject.toLowerCase(), limit: 14, signal: c.signal })
      .then((r) => setRows(r.filter((x) => x.title.toLowerCase() !== book.title.toLowerCase() && !idx.itemList().some((i) => i.title.toLowerCase() === x.title.toLowerCase())).slice(0, 10)))
      .catch(() => setRows([]));
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, book.id]);
  if (!subject || (rows && !rows.length)) return null;
  return (
    <div>
      <div className="section-row"><h2 className="section-title">Because you {book.status === 'reading' ? 'are reading' : 'loved'} {book.title}</h2></div>
      <div className="small muted" style={{ marginTop: -6, marginBottom: 8 }}>More books about “{subject}”</div>
      <MetaShelf rows={rows} onOpen={onOpen} />
    </div>
  );
}

function MetaShelf({ rows, onOpen }: { rows: MetaResult[] | null; onOpen: (r: MetaResult) => void }) {
  if (!rows) return <div className="shelf-row">{[0, 1, 2].map((k) => <div key={k} className="cover-tile"><div className="skeleton" style={{ width: 96, height: 144, borderRadius: 8 }} /></div>)}</div>;
  return (
    <div className="shelf-row">
      {rows.map((r) => (
        <button key={r.key} className="cover-tile" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => onOpen(r)}>
          <div className="shelf-slot"><Cover item={{ id: r.key, title: r.title, coverUrl: r.coverUrl, contentType: 'book' }} width={96} author={r.authors[0]} /></div>
          <div className="meta"><div className="small clamp-2" style={{ fontWeight: 700 }}>{r.title}</div><div className="tiny faint ellipsis">{[r.authors[0], r.year].filter(Boolean).join(' · ')}</div></div>
        </button>
      ))}
    </div>
  );
}

// ── Book database ──────────────────────────────────────────────────────

function BookSearch({ onOpen }: { onOpen: (r: MetaResult) => void }) {
  const idx = useLibrary();
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [maxPages, setMaxPages] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [filters, setFilters] = useState(false);
  const [results, setResults] = useState<MetaResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const key = useDebounced(`${q}|${subject}`, 450);
  useEffect(() => {
    if (!q.trim() && !subject.trim()) { setResults(null); return; }
    const c = new AbortController();
    setLoading(true);
    setErr(false);
    searchBooks(q, { subject: subject.trim().toLowerCase() || undefined, limit: 40, signal: c.signal }).then(setResults).catch(() => { if (!c.signal.aborted) { setErr(true); setResults([]); } }).finally(() => setLoading(false));
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const shown = (results ?? []).filter((r) => (!maxPages || (r.pages ?? Infinity) <= Number(maxPages)) && (!after || (r.year ?? -Infinity) >= Number(after)) && (!before || (r.year ?? Infinity) <= Number(before)));
  return (
    <div className="col gap-12">
      <div className="row" style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, color: 'var(--text-3)', display: 'grid' }}><Icon name="search" /></span>
        <input className="input" autoFocus style={{ paddingLeft: 42, borderRadius: 999 }} placeholder="Title, author, topic or ISBN…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search books" />
      </div>
      <div className="row between">
        <button className={`btn sm ${filters ? 'accent' : ''}`} onClick={() => setFilters((v) => !v)}><Icon name="filter" />Filters</button>
        <span className="tiny faint">{results ? `${shown.length} result${shown.length === 1 ? '' : 's'}` : 'Over 20 million books from Open Library'}</span>
      </div>
      {filters && (
        <div className="card fields c3">
          <label className="field">Subject<input className="input sm" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. roman history" /></label>
          <label className="field">Max pages<input className="input sm" type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} /></label>
          <label className="field">Published from<input className="input sm" type="number" value={after} onChange={(e) => setAfter(e.target.value)} /></label>
          <label className="field">Published to<input className="input sm" type="number" value={before} onChange={(e) => setBefore(e.target.value)} /></label>
        </div>
      )}
      {loading && <div className="small muted">Searching…</div>}
      {err && <div className="small muted">Couldn’t reach the book database — check your connection.</div>}
      <div className="list-card">
        {shown.map((r) => {
          const owned = idx.itemList().some((i) => i.title.toLowerCase() === r.title.toLowerCase());
          return (
            <button key={r.key} className="li" onClick={() => onOpen(r)} style={{ alignItems: 'flex-start' }}>
              <Cover item={{ id: r.key, title: r.title, coverUrl: r.coverUrl, contentType: 'book' }} width={44} />
              <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                <span className="li-title clamp-2" style={{ textTransform: 'none' }}>{r.title}</span>
                <span className="li-sub ellipsis" style={{ display: 'block' }}>{r.authors.slice(0, 2).join(', ') || 'Unknown author'}</span>
                <span className="tiny faint">{[r.year, r.pages ? `${r.pages} pages` : ''].filter(Boolean).join(' · ')}{owned ? ' · on your shelf' : ''}</span>
              </span>
              <Icon name="chevronRight" className="faint" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const POPULAR = ['History', 'Ancient history', 'Military history', 'Biography', 'Philosophy', 'Religion', 'Science', 'Psychology', 'Economics', 'Politics', 'Classics', 'Fantasy', 'Science fiction', 'Mystery', 'Historical fiction', 'Poetry', 'Art', 'Travel'];

function Subjects({ idx, onOpen }: { idx: LibraryIndex; onOpen: (r: MetaResult) => void }) {
  const mine = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of idx.itemList()) for (const g of i.genres) if (!GENERIC.test(g) && g.length < 32) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g);
  }, [idx]);
  const [sel, setSel] = useState(mine[0] ?? POPULAR[0]);
  const [rows, setRows] = useState<MetaResult[] | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setRows(null);
    searchBooks('', { subject: sel.toLowerCase(), limit: 30, signal: c.signal }).then(setRows).catch(() => setRows([]));
    return () => c.abort();
  }, [sel]);
  return (
    <div className="col gap-12">
      {mine.length > 0 && <><div className="eyebrow">Your subjects</div><div className="row wrap gap-4">{mine.map((s) => <button key={s} className={`chip ${sel === s ? 'on' : ''}`} onClick={() => setSel(s)}>{s}</button>)}</div></>}
      <div className="eyebrow mt-8">Popular</div>
      <div className="row wrap gap-4">{POPULAR.map((s) => <button key={s} className={`chip ${sel === s ? 'on' : ''}`} onClick={() => setSel(s)}>{s}</button>)}</div>
      <h2 className="section-title">{sel}</h2>
      {rows && !rows.length ? <div className="small muted">Nothing found (or you’re offline).</div> : (
        <div className="cover-grid compact">
          {(rows ?? []).map((r) => (
            <button key={r.key} className="cover-tile" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => onOpen(r)}>
              <Cover item={{ id: r.key, title: r.title, coverUrl: r.coverUrl, contentType: 'book' }} width={92} author={r.authors[0]} />
              <div className="meta"><div className="small clamp-2" style={{ fontWeight: 700 }}>{r.title}</div><div className="tiny faint ellipsis">{r.authors[0]}</div></div>
            </button>
          ))}
          {!rows && <div className="small muted">Loading…</div>}
        </div>
      )}
    </div>
  );
}

// ── Book detail ────────────────────────────────────────────────────────

function BookDetail({ r, onClose, onOpen }: { r: MetaResult; onClose: () => void; onOpen: (r: MetaResult) => void }) {
  const idx = useLibrary();
  const { toast, open } = useUI();
  const [desc, setDesc] = useState<string | null | undefined>(undefined);
  const [similar, setSimilar] = useState<MetaResult[] | null>(null);
  const owned = idx.itemList().find((i) => i.title.toLowerCase() === r.title.toLowerCase());
  const subject = r.subjects.find((s) => !GENERIC.test(s) && s.length < 40);
  useEffect(() => {
    const c = new AbortController();
    setDesc(undefined);
    fetch(`https://openlibrary.org${r.key}.json`, { signal: c.signal })
      .then((x) => (x.ok ? x.json() : null))
      .then((j: { description?: string | { value: string } } | null) => setDesc(j?.description ? (typeof j.description === 'string' ? j.description : j.description.value).split(/\n-{3,}|\(\[source\]/)[0].trim() : null))
      .catch(() => !c.signal.aborted && setDesc(null));
    if (subject) searchBooks('', { subject: subject.toLowerCase(), limit: 12, signal: c.signal }).then((x) => setSimilar(x.filter((y) => y.key !== r.key).slice(0, 10))).catch(() => setSimilar([]));
    return () => c.abort();
  }, [r.key, subject]);
  return (
    <Modal title="Book details" onClose={onClose}>
      <div className="col gap-12">
        <div className="row top gap-16">
          <Cover item={{ id: r.key, title: r.title, coverUrl: r.coverUrl, contentType: 'book' }} width={96} author={r.authors[0]} />
          <div style={{ minWidth: 0 }}>
            <div className="book-title" style={{ fontSize: 20 }}>{r.title}</div>
            {r.subtitle && <div className="small muted">{r.subtitle}</div>}
            <div className="small" style={{ fontWeight: 700 }}>{r.authors.slice(0, 3).join(', ')}</div>
            <div className="tiny faint mt-8">{[r.year && `First published ${r.year}`, r.pages && `${r.pages} pages`, r.publisher].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="row wrap gap-8">
          {owned ? <Link className="btn primary" to={`/item/${owned.id}`} onClick={onClose}>On your shelf — open</Link>
            : <button className="btn primary" onClick={async () => { await addFromMeta(r); toast(`Added “${r.title}” to Want to read`); onClose(); }}><Icon name="plus" />Want to read</button>}
          <button className="btn ai" onClick={() => { onClose(); open({ kind: 'ai', question: `Tell me about "${r.title}" by ${r.authors[0] ?? 'unknown'}: what it's about, who it's for, and whether it fits what I like to read.` }); }}><Icon name="sparkle" />Will I like it?</button>
        </div>
        {desc === undefined ? <div className="small faint">Loading description…</div> : desc ? <p className="small" style={{ lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>{desc.length > 900 ? `${desc.slice(0, 900)}…` : desc}</p> : <div className="small faint">No description available.</div>}
        {r.subjects.length > 0 && <div className="row wrap gap-4">{r.subjects.filter((s) => !GENERIC.test(s)).slice(0, 10).map((s) => <span key={s} className="chip">{s}</span>)}</div>}
        {subject && (
          <div>
            <div className="eyebrow mb-8">Similar books · {subject}</div>
            <MetaShelf rows={similar} onOpen={onOpen} />
          </div>
        )}
        <a className="tiny faint" href={`https://openlibrary.org${r.key}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View on Open Library</a>
      </div>
    </Modal>
  );
}
