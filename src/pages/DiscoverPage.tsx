// Discover: follow your curiosity to your next book. Start from a book you
// liked, a person or place you met while reading, a period, a subject or a
// question. Every suggestion says why it's here; nothing is ranked "best".
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM } from '../ai/context';
import { AIErrorNotice, AskChip, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { AIBadge, Cover, Empty } from '../components/common';
import { KIND_ICON, yearSpan } from '../components/entity';
import { Icon } from '../components/icons';
import { addItem } from '../db/actions';
import type { Concept, Item } from '../db/types';
import type { LibraryIndex } from '../engine/model';
import { runQuery } from '../engine/query';
import { type CatalogBook, coverUrl, DIRECTIONS, type Direction, PERIODS, QUESTIONS, searchDirection, verifyBook } from '../lib/discover';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { NewCurriculum } from './CurriculumPage';

export default function DiscoverPage() {
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <Routes>
        <Route index element={<DiscoverHome />} />
        <Route path="topic/:q" element={<TopicPathways />} />
        <Route path="book/:id" element={<BookDNA />} />
        <Route path="compare" element={<CompareBooks />} />
      </Routes>
    </div>
  );
}

/** Concepts linked to a library item. */
export function bookConcepts(idx: LibraryIndex, itemId: string): Concept[] {
  const ids = new Set(idx.snap.links.filter((l) => (l.fromType === 'concept' && l.toType === 'item' && l.toId === itemId) || (l.toType === 'concept' && l.fromType === 'item' && l.fromId === itemId)).map((l) => (l.fromType === 'concept' ? l.fromId : l.toId)));
  return [...ids].map((id) => idx.concepts.get(id)).filter((c): c is Concept => !!c);
}

/** Good starting topics for a book: its subjects and the entities in it. */
function seedsFor(idx: LibraryIndex, it: Item): string[] {
  const generic = /^(history|fiction|nonfiction|non-fiction|general|biography|juvenile|accessible book|protected daisy|in library|large type books|open library staff picks|reading level|textbooks?)$/i;
  const fromGenres = it.genres.filter((g) => !generic.test(g) && g.length < 40);
  const fromEntities = bookConcepts(idx, it.id).filter((c) => c.kind !== 'concept').map((c) => c.name);
  return [...new Set([...fromEntities, ...fromGenres])].slice(0, 8);
}

function DiscoverHome() {
  const idx = useLibrary();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const recent = useMemo(() => idx.itemList().filter((i) => i.status === 'reading' || (i.status === 'read' && (idx.rating(i) ?? 0) >= 4)).sort((a, b) => (b.lastReadAt ?? b.updatedAt ?? 0) - (a.lastReadAt ?? a.updatedAt ?? 0)).slice(0, 4), [idx]);
  const people = idx.snap.concepts.filter((c) => c.kind === 'person').slice(-12).reverse();
  const places = idx.snap.concepts.filter((c) => c.kind === 'place' || c.kind === 'polity' || c.kind === 'event').slice(-12).reverse();
  const myQuestions = idx.snap.notes.filter((n) => n.kind === 'question').slice(-6).reverse();
  const librarySubjects = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of idx.itemList()) for (const g of i.genres) count.set(g, (count.get(g) ?? 0) + 1);
    return [...count.entries()].filter(([g]) => g.length < 32).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g);
  }, [idx]);
  useConcierge('Discover', ['What should I explore next, based on my reading?', 'Suggest a surprising direction for me', 'What gaps are there in what I read?'], () => `CURRENT/LOVED BOOKS: ${recent.map((i) => i.title).join('; ')}\nPEOPLE MET: ${people.map((c) => c.name).join(', ')}\nPLACES/EVENTS MET: ${places.map((c) => c.name).join(', ')}`, [idx]);
  const surprise = () => {
    const pool = [...people.map((c) => c.name), ...places.map((c) => c.name), ...librarySubjects, ...PERIODS.map((p) => p.topic)];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    nav(`/discover/topic/${encodeURIComponent(pick)}?surprise=1`);
  };
  return (
    <>
      <div className="page-head"><div><h1>Discover</h1><div className="sub">Follow your curiosity to your next book. Every suggestion says why it’s here.</div></div></div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/discover/topic/${encodeURIComponent(q.trim())}`); }}>
        <div className="row grow" style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, color: 'var(--text-3)', display: 'grid' }}><Icon name="search" /></span>
          <input className="input" style={{ paddingLeft: 42, borderRadius: 999 }} placeholder="A person, place, period, event or subject…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="What do you want to explore?" />
        </div>
        <button className="btn primary round" disabled={!q.trim()}>Go</button>
      </form>
      <div className="row wrap gap-8 mt-16">
        <button className="btn accent" onClick={surprise}>🎲 Surprise me</button>
        <AskChip question="Based on my reading, suggest three different directions I could explore next, each with one reason." label="Ask AI where to go next" className="btn ai" />
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title">Because of what you’re reading</div>
          <div className="col gap-12">
            {recent.map((i) => {
              const seeds = seedsFor(idx, i);
              return (
                <div key={i.id} className="card tight">
                  <div className="row gap-12">
                    <Link to={`/discover/book/${i.id}`}><Cover item={i} width={48} /></Link>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small ellipsis" style={{ fontWeight: 800 }}>{i.title}</div>
                      <div className="tiny faint">{i.status === 'reading' ? 'Reading now' : 'You rated it highly'}</div>
                    </div>
                    <Link className="btn sm" to={`/discover/book/${i.id}`}>Explore</Link>
                  </div>
                  {seeds.length > 0 && <div className="chips-scroll mt-8">{seeds.map((s) => <Link key={s} className="chip" to={`/discover/topic/${encodeURIComponent(s)}`}>{s}</Link>)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {(people.length > 0 || places.length > 0) && (
        <>
          <div className="section-title">People, places & events you’ve met</div>
          <div className="row wrap gap-4">
            {[...people, ...places].map((c) => <Link key={c.id} className="chip" to={`/discover/topic/${encodeURIComponent(c.name)}`}>{KIND_ICON[c.kind]} {c.name}</Link>)}
          </div>
        </>
      )}

      <div className="section-title">Pick a period</div>
      <div className="period-grid">
        {PERIODS.map((p) => (
          <Link key={p.label} to={`/discover/topic/${encodeURIComponent(p.topic)}?label=${encodeURIComponent(p.label)}`} className="period-tile">
            <b>{p.label}</b><span className="tiny faint">{p.years}</span>
          </Link>
        ))}
      </div>

      <div className="section-title">Start from a question</div>
      <div className="col" style={{ gap: 8 }}>
        {[...myQuestions.map((n) => n.text), ...QUESTIONS].slice(0, 8).map((qq) => (
          <Link key={qq} className="rabbit-node" to={`/discover/topic/${encodeURIComponent(qq)}`}>{qq}<Icon name="arrowRight" className="faint" /></Link>
        ))}
      </div>

      {librarySubjects.length > 0 && (
        <>
          <div className="section-title">Subjects in your library</div>
          <div className="row wrap gap-4">{librarySubjects.map((s) => <Link key={s} className="chip" to={`/discover/topic/${encodeURIComponent(s)}`}>{s}</Link>)}</div>
        </>
      )}

      <div className="section-title">More ways to explore</div>
      <div className="tile-grid">
        {[
          { to: '/explore', icon: '🕸', t: 'Connections', s: 'How your books link up' },
          { to: '/explore/timeline', icon: '🕰', t: 'Timeline', s: 'Your books through time' },
          { to: '/knowledge', icon: '🗺', t: 'Knowledge Atlas', s: 'Everyone and everywhere you’ve met' },
          { to: '/library/curricula', icon: '🪜', t: 'Curricula', s: 'Build a learning path' },
        ].map((x) => <Link key={x.to} to={x.to} className="tile"><span className="t-ico" style={{ background: 'var(--surface-2)', fontSize: 20 }}>{x.icon}</span><span className="t-title">{x.t}</span><span className="t-sub">{x.s}</span></Link>)}
      </div>
    </>
  );
}

// ── Pathways for one topic ─────────────────────────────────────────────

function TopicPathways() {
  const { q } = useParams();
  const [params] = useSearchParams();
  const topic = decodeURIComponent(q ?? '');
  const label = params.get('label') ?? topic;
  const idx = useLibrary();
  const [curr, setCurr] = useState(false);
  const nav = useNavigate();
  const hash = useLocation().hash.slice(1);
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(`dir-${hash}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => clearTimeout(t);
  }, [hash]);
  const owned = runQuery(idx, { text: topic }).slice(0, 8);
  const entity = idx.snap.concepts.find((c) => c.name.toLowerCase() === topic.toLowerCase());
  useConcierge(`Discover: ${label}`, [`What are the main debates about ${label}?`, `Where should a beginner start with ${label}?`, `What primary sources exist for ${label}?`], () => `TOPIC: ${label}`, [label]);
  return (
    <>
      <Link to="/discover" className="small muted row" style={{ gap: 4 }}><Icon name="chevronLeft" />Discover</Link>
      <div className="page-head mt-8">
        <div style={{ minWidth: 0 }}>
          {params.get('surprise') && <div className="eyebrow">🎲 A surprise for you</div>}
          <h1>{label}</h1>
          <div className="sub">Different ways into this subject. Pick the kind of reading you’re in the mood for.</div>
        </div>
      </div>
      <div className="row wrap gap-8">
        <button className="btn sm" onClick={() => setCurr(true)}><Icon name="layers" />Make it a curriculum</button>
        {entity && <Link className="btn sm" to={`/knowledge/concept/${entity.id}`}>{KIND_ICON[entity.kind]} In your atlas{yearSpan(entity) ? ` · ${yearSpan(entity)}` : ''}</Link>}
      </div>
      {owned.length > 0 && (
        <>
          <div className="section-title">Already on your shelves</div>
          <div className="shelf-row">{owned.map((i) => <div key={i.id} className="cover-tile"><div className="shelf-slot"><Link to={`/item/${i.id}`}><Cover item={i} width={80} /></Link></div><div className="meta small ellipsis">{i.title}</div></div>)}</div>
        </>
      )}
      <AIPathway topic={label} />
      {DIRECTIONS.map((d, i) => <DirectionRow key={d.id} topic={topic} d={d} eager={i < 3 || d.id === hash} />)}
      <p className="tiny faint mt-24">Books and subjects from <a href="https://openlibrary.org" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Open Library</a>. A book appears in a direction because of how libraries catalogue it — not because it’s better than others.</p>
      {curr && <NewCurriculum preset={label} onClose={(id) => { setCurr(false); if (id) nav(`/curriculum/${id}`); }} />}
    </>
  );
}

function DirectionRow({ topic, d, eager }: { topic: string; d: Direction; eager: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [books, setBooks] = useState<CatalogBook[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (visible || !ref.current || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setVisible(true); }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const c = new AbortController();
    setBooks(null);
    setErr('');
    searchDirection(topic, d, 10, c.signal).then(setBooks).catch((e) => { if (!c.signal.aborted) setErr((e as Error).message); });
    return () => c.abort();
  }, [visible, topic, d]);
  if (books && !books.length) return null;
  return (
    <div ref={ref} id={`dir-${d.id}`} style={{ scrollMarginTop: 70 }}>
      <div className="section-row"><h2 className="section-title">{d.icon} {d.label}</h2></div>
      <div className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>{d.blurb}</div>
      {err ? <div className="small faint">Couldn’t reach Open Library right now{typeof navigator !== 'undefined' && !navigator.onLine ? ' (you’re offline)' : ''}.</div>
        : !books ? <div className="shelf-row">{[0, 1, 2].map((k) => <div key={k} className="cover-tile"><div className="skeleton" style={{ width: 96, height: 144, borderRadius: 8 }} /></div>)}</div>
        : <div className="shelf-row">{books.map((b) => <CatalogCard key={b.key} b={b} />)}</div>}
    </div>
  );
}

function CatalogCard({ b, badge }: { b: CatalogBook; badge?: React.ReactNode }) {
  const idx = useLibrary();
  const { toast } = useUI();
  const own = idx.itemList().find((i) => i.title.toLowerCase() === b.title.toLowerCase());
  const [why, setWhy] = useState(false);
  const cover = coverUrl(b.cover);
  return (
    <div className="cover-tile" style={{ width: 118 }}>
      <div className="shelf-slot">
        {cover ? <img src={cover} alt="" loading="lazy" style={{ width: 96, height: 144, objectFit: 'cover', borderRadius: 6, background: 'var(--surface-2)' }} /> : <div className="gen-cover" style={{ width: 96, height: 144, borderRadius: 6, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', padding: 8, fontSize: 12, textAlign: 'center', fontWeight: 700 }}>{b.title}</div>}
      </div>
      <div className="meta">
        <div className="small clamp-2" style={{ fontWeight: 700 }}>{b.title}</div>
        <div className="tiny faint ellipsis">{[b.authors[0], b.year].filter(Boolean).join(' · ')}</div>
        {badge}
        {own ? <Link to={`/item/${own.id}`} className="chip good" style={{ minHeight: 22, fontSize: 11 }}>In your library</Link>
          : <button className="chip" style={{ minHeight: 26, fontSize: 11.5 }} onClick={async () => { await addItem({ title: b.title, authors: b.authors, publishedYear: b.year, coverUrl: coverUrl(b.cover), genres: b.subjects.slice(0, 6), status: 'want' }); toast(`Added “${b.title}” to Want to read`); }}>＋ Want to read</button>}
        <button className="why-link tiny" onClick={() => setWhy((v) => !v)}>{why ? 'Hide' : 'Why this?'}</button>
        {why && <div className="tiny muted">{b.why}</div>}
      </div>
    </div>
  );
}

interface PathwayAI { steps: { title: string; author?: string; direction: string; why: string }[] }

function AIPathway({ topic }: { topic: string }) {
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const [steps, setSteps] = useState<{ s: PathwayAI['steps'][number]; hit?: CatalogBook; checked: boolean }[] | null>(null);
  if (!ready) return null;
  const go = async () => {
    const r = await run((signal) => completeJSON<PathwayAI>({
      system: `${BASE_SYSTEM}\nReturn JSON {"steps":[{"title":"...","author":"...","direction":"e.g. overview, narrative, academic, primary source, biography, historiography, fiction","why":"one line"}]}. 5–7 real, well-known books forming a sensible order from first steps to deeper reading, mixing kinds of books. Never invent titles.`,
      messages: [{ role: 'user', content: `Suggest a reading pathway into: ${topic}` }],
      maxTokens: 1200,
    }, signal));
    if (!r) return;
    const list = (r.data.steps ?? []).slice(0, 8).map((s) => ({ s, checked: false as boolean, hit: undefined as CatalogBook | undefined }));
    setSteps(list);
    // Check each suggestion really exists before trusting it.
    const verified = await Promise.all(list.map(async (x) => ({ ...x, hit: await verifyBook(x.s.title, x.s.author).catch(() => undefined), checked: true })));
    setSteps(verified);
  };
  return (
    <div className="card mt-16" style={{ borderColor: 'var(--ai-soft)' }}>
      <div className="row between"><b className="row gap-8"><Icon name="sparkle" />A guided pathway</b>{steps && <AIBadge label="AI suggestion" />}</div>
      {!steps && <><div className="small muted mt-8">Ask the AI for an ordered path through {topic}. Each book is then checked against Open Library.</div><button className="btn ai sm mt-8" disabled={loading} onClick={go}>{loading ? 'Thinking…' : 'Suggest a pathway'}</button></>}
      <AIErrorNotice error={error} />
      {steps && (
        <ol className="col mt-8" style={{ gap: 8, paddingLeft: 20, margin: 0 }}>
          {steps.map(({ s, hit, checked }, i) => (
            <li key={i} className="small">
              <b>{s.title}</b>{s.author ? ` — ${s.author}` : ''} <span className="chip" style={{ minHeight: 18, fontSize: 10 }}>{s.direction}</span>
              <div className="tiny muted">{s.why}</div>
              <div className="tiny">{!checked ? <span className="faint">Checking…</span> : hit ? <span style={{ color: 'var(--good)' }}>✓ Found in Open Library{hit.year ? ` (${hit.year})` : ''}</span> : <span style={{ color: 'var(--warn)' }}>Couldn’t verify this book — double-check before relying on it</span>}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Book DNA & "if you liked this" ─────────────────────────────────────

const APPROACH_WORDS: [string, RegExp][] = [
  ['Biography', /biograph/i], ['Military', /military|war|battle|army|campaign/i], ['Political', /politic|government|state/i], ['Social', /social life|customs|daily life|women|family/i],
  ['Economic', /econom|trade|commerce/i], ['Cultural & intellectual', /intellectual|culture|civilization|religio|philosoph|art/i], ['Archaeology', /antiquit|archaeolog|excavation/i],
  ['Primary source', /sources|early works to 1800|correspondence|diaries|speeches/i], ['Historiography', /historiograph/i], ['Fiction', /fiction|novel/i],
];

export function bookDNA(idx: LibraryIndex, it: Item) {
  const ents = bookConcepts(idx, it.id);
  const dated = ents.filter((c) => c.start !== undefined);
  const span = dated.length ? [Math.min(...dated.map((c) => c.start!)), Math.max(...dated.map((c) => c.end ?? c.start!))] : undefined;
  const text = [...it.genres, ...it.tagIds.map((t) => idx.tags.get(t)?.name ?? '')].join(' | ');
  const approaches = APPROACH_WORDS.filter(([, re]) => re.test(text)).map(([l]) => l);
  const fiction = /fiction|novel/i.test(text);
  return {
    form: fiction ? 'Fiction' : it.genres.length ? 'Non-fiction' : undefined,
    span,
    people: ents.filter((c) => c.kind === 'person'),
    places: ents.filter((c) => c.kind === 'place' || c.kind === 'polity'),
    events: ents.filter((c) => c.kind === 'event'),
    ideas: ents.filter((c) => c.kind === 'concept' || c.kind === 'subject'),
    approaches,
    subjects: it.genres.slice(0, 10),
    length: it.pageCount,
    published: it.publishedYear,
  };
}

const fmtSpan = (s?: number[]) => (s ? (s[0] === s[1] ? eraY(s[0]) : `${eraY(s[0])} – ${eraY(s[1])}`) : undefined);
const eraY = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

function DNAView({ idx, it }: { idx: LibraryIndex; it: Item }) {
  const d = bookDNA(idx, it);
  const rows: [string, React.ReactNode][] = [
    ['Form', d.form],
    ['Covers', fmtSpan(d.span)],
    ['Approach', d.approaches.length ? d.approaches.join(' · ') : undefined],
    ['People', d.people.length ? d.people.map((c) => c.name).join(', ') : undefined],
    ['Places', d.places.length ? d.places.map((c) => c.name).join(', ') : undefined],
    ['Events', d.events.length ? d.events.map((c) => c.name).join(', ') : undefined],
    ['Length', d.length ? `${d.length} pages` : undefined],
    ['Published', d.published],
  ];
  const shown = rows.filter(([, v]) => v);
  return (
    <div className="col" style={{ gap: 8 }}>
      {shown.map(([k, v]) => <div key={k} className="small row top" style={{ gap: 10 }}><span className="tiny faint" style={{ width: 76, flex: 'none', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', paddingTop: 2 }}>{k}</span><span>{v}</span></div>)}
      {d.subjects.length > 0 && <div className="chips-scroll">{d.subjects.map((s) => <Link key={s} className="chip" to={`/discover/topic/${encodeURIComponent(s)}`}>{s}</Link>)}</div>}
      {shown.length < 3 && <div className="tiny faint">Tap names while reading (or add subjects on the book page) and this fills in.</div>}
    </div>
  );
}

function BookDNA() {
  const { id } = useParams();
  const idx = useLibrary();
  const nav = useNavigate();
  const it = idx.items.get(id!);
  const [other, setOther] = useState('');
  if (!it) return <Empty title="Book not found" />;
  const seeds = seedsFor(idx, it);
  const main = seeds[0] ?? it.title;
  const dirs: [string, string, string][] = [
    ['More like it', 'overview', `Other widely read books on ${main}`],
    ['Go deeper', 'academic', 'Scholarly books from university presses'],
    ['Read the sources', 'primary', 'Writing from the time itself'],
    ['See the debate', 'historiography', 'How historians disagree about it'],
    ['Everyday life', 'social', 'The same world from ordinary people’s view'],
    ['Lives', 'biography', 'Biographies of the people involved'],
    ['A novel', 'fiction', 'Fiction set in the same world'],
  ];
  return (
    <>
      <Link to="/discover" className="small muted row" style={{ gap: 4 }}><Icon name="chevronLeft" />Discover</Link>
      <div className="row gap-16 mt-8">
        <Link to={`/item/${it.id}`}><Cover item={it} width={84} /></Link>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Explore this book</div>
          <h1 style={{ fontSize: 26 }}>{it.title}</h1>
          <div className="small muted">{idx.authorLine(it)}</div>
        </div>
      </div>
      <div className="card mt-16">
        <div className="card-head"><h3>Book DNA</h3></div>
        <DNAView idx={idx} it={it} />
        <div className="tiny faint mt-8">A description, not a score — from catalogue subjects and the people, places and events you’ve linked to it.</div>
      </div>
      <div className="section-title">If you liked this, you could…</div>
      <div className="col" style={{ gap: 8 }}>
        {dirs.map(([label, dir, sub]) => (
          <Link key={dir} className="rabbit-node" to={`/discover/topic/${encodeURIComponent(main)}#${dir}`}>
            <span><b>{label}</b><br /><span className="small muted" style={{ fontWeight: 400 }}>{sub}</span></span><Icon name="arrowRight" className="faint" />
          </Link>
        ))}
      </div>
      {seeds.length > 1 && (
        <>
          <div className="section-title">Or follow a thread</div>
          <div className="row wrap gap-4">{seeds.map((s) => <Link key={s} className="chip" to={`/discover/topic/${encodeURIComponent(s)}`}>{s}</Link>)}</div>
        </>
      )}
      <div className="card mt-24">
        <div className="card-head"><h3>Compare with another book</h3></div>
        <div className="row">
          <select className="select grow" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Book to compare with">
            <option value="">Choose a book…</option>
            {idx.itemList().filter((i) => i.id !== it.id).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
          <button className="btn primary" disabled={!other} onClick={() => nav(`/discover/compare?a=${it.id}&b=${other}`)}>Compare</button>
        </div>
      </div>
    </>
  );
}

function CompareBooks() {
  const [params] = useSearchParams();
  const idx = useLibrary();
  const a = idx.items.get(params.get('a') ?? '');
  const b = idx.items.get(params.get('b') ?? '');
  if (!a || !b) return <Empty title="Pick two books to compare" action={<Link className="btn" to="/discover">Back to Discover</Link>} />;
  const da = bookDNA(idx, a);
  const db = bookDNA(idx, b);
  const shared = (x: Concept[], y: Concept[]) => x.filter((c) => y.some((d) => d.id === c.id));
  const sharedEnts = [...shared(da.people, db.people), ...shared(da.places, db.places), ...shared(da.events, db.events)];
  const sharedSubjects = da.subjects.filter((s) => db.subjects.some((t) => t.toLowerCase() === s.toLowerCase()));
  return (
    <>
      <Link to={`/discover/book/${a.id}`} className="small muted row" style={{ gap: 4 }}><Icon name="chevronLeft" />{a.title}</Link>
      <h1 className="mt-8" style={{ fontSize: 26 }}>Compare</h1>
      <div className="sub mb-16">Side by side — different, not better or worse.</div>
      <div className="grid c2">
        {[a, b].map((it) => <div key={it.id} className="card"><div className="row gap-12 mb-8"><Cover item={it} width={40} /><div style={{ minWidth: 0 }}><b className="clamp-2">{it.title}</b><div className="tiny faint">{idx.authorLine(it)}</div></div></div><DNAView idx={idx} it={it} /></div>)}
      </div>
      <div className="card mt-16">
        <div className="card-head"><h3>What they share</h3></div>
        {sharedEnts.length + sharedSubjects.length === 0 ? <div className="small muted">Nothing in common yet from what Shelf knows — tap names while reading to link more.</div> : (
          <div className="row wrap gap-4">
            {sharedEnts.map((c) => <Link key={c.id} className="chip" to={`/knowledge/concept/${c.id}`}>{KIND_ICON[c.kind]} {c.name}</Link>)}
            {sharedSubjects.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        )}
      </div>
      <div className="row wrap gap-8 mt-16">
        <AskChip question={`Compare how "${a.title}" and "${b.title}" approach their subject: focus, sources, perspective and style. Describe the differences without declaring a winner.`} label="Ask AI to compare their approaches" className="btn ai" />
      </div>
    </>
  );
}
