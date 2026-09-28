import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM, itemLine, libraryDigest, relevantItems } from '../ai/context';
import { AIErrorNotice, AIOff, AIPanel, SharedPreview, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { SEQ } from '../components/charts';
import { AIBadge, Cover, Empty, ItemPicker, Modal, Segmented, Stars, Tabs, useDebounced } from '../components/common';
import { FilterPanel, FolderTree, ItemViews } from '../components/library';
import { addItem, link, saveAIRecord, saveConcept, saveProject } from '../db/actions';
import type { ConceptKind, Item } from '../db/types';
import { formatYear } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { type LibraryQuery, runQuery } from '../engine/query';
import { sessionPages } from '../engine/stats';
import { contentLabel, fmtDuration, fmtNum, fmtUnits, toDisplay, unitLabel } from '../engine/units';
import { type MetaResult, searchBooks } from '../lib/openlibrary';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Tab = 'subjects' | 'connections' | 'timeline' | 'map' | 'rabbit' | 'discover' | 'compare' | 'paths' | 'gaps' | 'authors';
const TABS: { id: Tab; label: string }[] = [
  { id: 'subjects', label: 'Subjects' }, { id: 'connections', label: 'Connections' }, { id: 'timeline', label: 'Timeline' }, { id: 'map', label: 'Reading map' },
  { id: 'rabbit', label: 'Rabbit hole' }, { id: 'discover', label: 'Discover' }, { id: 'compare', label: 'Compare' }, { id: 'paths', label: 'Reading paths' },
  { id: 'gaps', label: 'What to explore' }, { id: 'authors', label: 'Authors' },
];

export default function ExplorePage() {
  const idx = useLibrary();
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split('/')[2] as Tab | undefined;
  const tab: Tab = TABS.some((t) => t.id === seg) ? seg! : 'subjects';
  useConcierge('Explore', ['What should I explore next?', 'Take me somewhere new.', 'Connect my books.'], () => libraryDigest(idx, idx.settings.ai.share, idx.itemList(), 120), [idx]);
  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="page-head"><div><h1>Explore</h1><div className="sub">Discover subjects, connections and paths — starting from what you already own.</div></div></div>
      <Tabs<Tab> value={tab} onChange={(t) => nav(`/explore/${t}`)} tabs={TABS} />
      {tab === 'subjects' && <Subjects idx={idx} />}
      {tab === 'connections' && <Connections idx={idx} />}
      {tab === 'timeline' && <Timeline idx={idx} />}
      {tab === 'map' && <ReadingMap idx={idx} />}
      {tab === 'rabbit' && <RabbitHole idx={idx} />}
      {tab === 'discover' && <Discover idx={idx} />}
      {tab === 'compare' && <Compare idx={idx} />}
      {tab === 'paths' && <Paths idx={idx} />}
      {tab === 'gaps' && <Gaps idx={idx} />}
      {tab === 'authors' && <Authors idx={idx} />}
    </div>
  );
}

// ── Subjects ───────────────────────────────────────────────────────────

function Subjects({ idx }: { idx: LibraryIndex }) {
  const [sel, setSel] = useState<string | undefined>(idx.snap.folders[0]?.id);
  const [genre, setGenre] = useState('');
  const genres = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of idx.itemList()) for (const g of i.genres) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [idx]);
  const items = genre ? idx.itemList().filter((i) => i.genres.includes(genre)) : sel ? idx.itemsInFolder(sel) : [];
  if (!idx.snap.folders.length && !genres.length) return <div className="card"><Empty icon="🧭" title="Build your subject map" action={<Link className="btn" to="/library">Create folders</Link>}>Subjects are whatever you define — folders like History → Ancient → Rome, or genres and tags on your books.</Empty></div>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)' }}>
      <div className="card" style={{ alignSelf: 'start' }}>
        <div className="section-title" style={{ marginTop: 0 }}>Your subject hierarchy</div>
        <FolderTree idx={idx} selected={genre ? undefined : sel} onSelect={(f) => { setSel(f.id); setGenre(''); }} />
        {genres.length > 0 && <><div className="section-title">Genres</div><div className="row wrap gap-4">{genres.slice(0, 30).map(([g, n]) => <button key={g} className={`chip ${genre === g ? 'on' : ''}`} onClick={() => setGenre(g)}>{g} · {n}</button>)}</div></>}
      </div>
      <div style={{ minWidth: 0 }}>
        {sel || genre ? (
          <>
            <div className="row between mb-16"><h2>{genre || idx.folderPath(sel!).map((f) => f.name).join(' / ')}</h2>{sel && !genre && <Link className="btn sm" to={`/library/folder/${sel}`}>Open folder</Link>}</div>
            {sel && !genre && (idx.childFolders.get(sel) ?? []).length > 0 && <div className="row wrap gap-4 mb-16">{(idx.childFolders.get(sel) ?? []).map((c) => <button key={c.id} className="chip" onClick={() => setSel(c.id)}>→ {c.name} · {idx.itemsInFolder(c.id).length}</button>)}</div>}
            {items.length ? <ItemViews idx={idx} items={items} mode="compact" selected={new Set()} onToggle={() => {}} /> : <div className="small muted">No items here yet.</div>}
          </>
        ) : <div className="small muted">Pick a subject.</div>}
      </div>
    </div>
  );
}

// ── Connections ────────────────────────────────────────────────────────

function relatedTo(idx: LibraryIndex, item: Item) {
  const out: { item: Item; why: string[] }[] = [];
  const concepts = new Set(idx.snap.links.filter((l) => (l.fromType === 'item' && l.fromId === item.id) || (l.toType === 'item' && l.toId === item.id)).map((l) => (l.fromType === 'concept' ? l.fromId : l.toId)));
  for (const o of idx.itemList()) {
    if (o.id === item.id) continue;
    const why: string[] = [];
    const sharedA = o.authorIds.filter((a) => item.authorIds.includes(a));
    if (sharedA.length) why.push(`same author (${sharedA.map((a) => idx.authors.get(a)?.name).join(', ')})`);
    const sharedF = o.folderIds.filter((f) => item.folderIds.includes(f));
    if (sharedF.length) why.push(`in ${sharedF.map((f) => idx.folders.get(f)?.name).join(', ')}`);
    const sharedG = o.genres.filter((g) => item.genres.includes(g));
    if (sharedG.length) why.push(`genre ${sharedG.join(', ')}`);
    const sharedT = o.tagIds.filter((t) => item.tagIds.includes(t));
    if (sharedT.length) why.push(`tag ${sharedT.map((t) => idx.tags.get(t)?.name).join(', ')}`);
    const oc = idx.snap.links.filter((l) => (l.fromType === 'item' && l.fromId === o.id) || (l.toType === 'item' && l.toId === o.id)).map((l) => (l.fromType === 'concept' ? l.fromId : l.toId)).filter((c) => concepts.has(c));
    if (oc.length) why.push(`both about ${oc.map((c) => idx.concepts.get(c)?.name).join(', ')}`);
    if (item.histStart !== undefined && o.histStart !== undefined) {
      const a0 = item.histStart, a1 = item.histEnd ?? a0, b0 = o.histStart, b1 = o.histEnd ?? b0;
      if (a0 <= b1 && b0 <= a1) why.push(`overlapping period (${formatYear(Math.max(a0, b0))}–${formatYear(Math.min(a1, b1))})`);
    }
    if (why.length) out.push({ item: o, why });
  }
  return { related: out.sort((a, b) => b.why.length - a.why.length), concepts: [...concepts].map((c) => idx.concepts.get(c)).filter(Boolean) };
}

function Connections({ idx }: { idx: LibraryIndex }) {
  const [params] = useSearchParams();
  const [start, setStart] = useState(params.get('item') ?? idx.itemList().find((i) => i.status === 'reading')?.id ?? idx.itemList()[0]?.id ?? '');
  const item = idx.items.get(start);
  const rel = item ? relatedTo(idx, item) : null;
  if (!idx.itemList().length) return <div className="card"><Empty title="Add books to see connections" /></div>;
  return (
    <div className="col gap-16">
      <div className="card row wrap"><span className="small muted">Start from</span><select className="select" style={{ maxWidth: 420 }} value={start} onChange={(e) => setStart(e.target.value)}>{idx.itemList().map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></div>
      {item && rel && (
        <div className="grid c2">
          <div className="card">
            <div className="row gap-12 mb-16"><Cover item={item} width={56} /><div><div className="book-title">{item.title}</div><div className="small muted">{idx.authorLine(item)}</div></div></div>
            <div className="section-title" style={{ marginTop: 0 }}>Concepts</div>
            <div className="row wrap gap-4">{rel.concepts.length ? rel.concepts.map((c) => <Link key={c!.id} to={`/knowledge/concept/${c!.id}`} className="chip accent">→ {c!.name}</Link>) : <span className="small faint">Link concepts on the book page to see more connections.</span>}</div>
            <div className="section-title">In your library</div>
            {rel.related.length === 0 ? <div className="small muted">No shared metadata with other items yet.</div> : rel.related.slice(0, 20).map((r) => (
              <Link key={r.item.id} to={`/item/${r.item.id}`} className="book-row"><Cover item={r.item} width={28} /><div className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{r.item.title}</div><div className="tiny faint">{r.why.join(' · ')}</div></div></Link>
            ))}
          </div>
          <div className="card">
            <div className="card-head"><h3>✦ Wider connections</h3></div>
            <AIPanel key={item.id} kind="recommendation" title={`Connections — ${item.title}`} scope={{ type: 'item', id: item.id }} buttonLabel="Explore connections" build={() => ({
              system: BASE_SYSTEM,
              messages: [{ role: 'user', content: `Starting from this book, map related people, events, subjects and ideas as short "→ branch" lines grouped under headings, then say which books in the library connect (by id/title) and which areas are outside the library.\n\n${itemLine(idx, item, { share: idx.settings.ai.share, withDescription: true })}\n\n${libraryDigest(idx, idx.settings.ai.share, relevantItems(idx, `${item.title} ${item.genres.join(' ')}`, 50))}` }],
            })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Historical timeline ────────────────────────────────────────────────

function Timeline({ idx }: { idx: LibraryIndex }) {
  const items = idx.itemList().filter((i) => i.histStart !== undefined);
  const events = idx.snap.concepts.filter((c) => c.start !== undefined && (c.kind === 'event' || c.kind === 'period' || c.kind === 'person'));
  const [showPub, setShowPub] = useState(false);
  const allYears = [...items.flatMap((i) => [i.histStart!, i.histEnd ?? i.histStart!]), ...events.flatMap((e) => [e.start!, e.end ?? e.start!])];
  const dataMin = allYears.length ? Math.min(...allYears) : -800;
  const dataMax = allYears.length ? Math.max(...allYears) : 2000;
  const [range, setRange] = useState<[number, number]>([Math.floor((dataMin - 50) / 50) * 50, Math.ceil((dataMax + 50) / 50) * 50]);
  const [q, setQ] = useState('');
  const presets: [string, number, number][] = [['All', -10000, 2030], ['Fit data', Math.floor((dataMin - 50) / 50) * 50, Math.ceil((dataMax + 50) / 50) * 50], ['Ancient', -3000, 500], ['Medieval', 400, 1500], ['Early modern', 1450, 1800], ['Modern', 1750, 2030]];
  const [w0, w1] = range;
  const W = 1100;
  const X = (y: number) => ((y - w0) / (w1 - w0)) * W;
  const span = w1 - w0;
  const step = [10, 25, 50, 100, 250, 500, 1000, 2500].find((s) => span / s <= 12) ?? 5000;
  const ticks: number[] = [];
  for (let y = Math.ceil(w0 / step) * step; y <= w1; y += step) ticks.push(y);
  const visible = items.filter((i) => (i.histEnd ?? i.histStart!) >= w0 && i.histStart! <= w1 && (!q || i.title.toLowerCase().includes(q.toLowerCase())));
  const lanes: number[] = [];
  const placed = visible.sort((a, b) => a.histStart! - b.histStart!).map((i) => {
    const x0 = X(Math.max(w0, i.histStart!)), x1 = Math.max(x0 + 8, X(Math.min(w1, i.histEnd ?? i.histStart!)));
    let lane = lanes.findIndex((end) => end < x0 - 4);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = x1 + Math.min(220, i.title.length * 6.2);
    return { i, x0, x1, lane };
  });
  const evVisible = events.filter((e) => (e.end ?? e.start!) >= w0 && e.start! <= w1);
  const H = 70 + lanes.length * 30 + 20;
  if (!items.length && !events.length) return <div className="card"><Empty icon="🕰" title="Place your books in history" action={<Link className="btn" to="/library">Open library</Link>}>On any book, set the period its <i>subject</i> covers (e.g. −509 to −27 for the Roman Republic). Events and people from your Knowledge library appear as markers. Works for any subject and era.</Empty></div>;
  return (
    <div className="col gap-16">
      <div className="card row wrap">
        <div className="row wrap gap-4">{presets.map(([l, a, b]) => <button key={l} className={`chip ${w0 === a && w1 === b ? 'on' : ''}`} onClick={() => setRange([a, b])}>{l}</button>)}</div>
        <label className="row small">From <input className="input sm" style={{ width: 90 }} type="number" value={w0} onChange={(e) => setRange([Number(e.target.value), w1])} /></label>
        <label className="row small">to <input className="input sm" style={{ width: 90 }} type="number" value={w1} onChange={(e) => setRange([w0, Number(e.target.value)])} /></label>
        <button className="btn sm" onClick={() => { const c = (w0 + w1) / 2, s = span / 4; setRange([Math.round(c - s), Math.round(c + s)]); }}>Zoom in</button>
        <button className="btn sm" onClick={() => { const c = (w0 + w1) / 2, s = span; setRange([Math.max(-10000, Math.round(c - s)), Math.min(2100, Math.round(c + s))]); }}>Zoom out</button>
        <input className="input sm" style={{ width: 180 }} placeholder="Find…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check small"><input type="checkbox" checked={showPub} onChange={(e) => setShowPub(e.target.checked)} /> Also show when each book was published</label>
      </div>
      <div className="timeline">
        <svg width={W + 40} height={H} style={{ display: 'block' }}>
          <g transform="translate(20,0)">
            {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={24} y2={H} stroke="var(--grid)" /><text x={X(t)} y={16} textAnchor="middle" fontSize={11} fill="var(--text-3)" fontFamily="var(--sans)">{formatYear(t)}</text></g>)}
            {evVisible.map((e) => (
              <g key={e.id}>
                {e.end !== undefined && e.end !== e.start ? <rect x={X(Math.max(w0, e.start!))} y={28} width={Math.max(2, X(Math.min(w1, e.end)) - X(Math.max(w0, e.start!)))} height={8} rx={4} fill="var(--s3)" opacity={0.35} /> : <circle cx={X(e.start!)} cy={32} r={5} fill="var(--s3)" />}
                <text x={X(Math.max(w0, e.start!)) + 4} y={50} fontSize={10.5} fill="var(--text-2)" fontFamily="var(--sans)"><a href={`/knowledge/concept/${e.id}`}>{formatYear(e.start)} — {e.name}</a></text>
              </g>
            ))}
            {placed.map(({ i, x0, x1, lane }) => {
              const y = 66 + lane * 30;
              return (
                <g key={i.id}>
                  <a href={`/item/${i.id}`}>
                    <rect x={x0} y={y} width={x1 - x0} height={14} rx={4} fill={i.status === 'read' ? 'var(--s1)' : i.status === 'reading' ? 'var(--s2)' : 'var(--seq-2)'}><title>{i.title}: subject {formatYear(i.histStart)}–{formatYear(i.histEnd ?? i.histStart)}; published {formatYear(i.publishedYear)}</title></rect>
                    <text x={x1 + 5} y={y + 11} fontSize={11.5} fill="var(--text)" fontFamily="var(--sans)">{i.title}</text>
                  </a>
                  {showPub && i.publishedYear !== undefined && i.publishedYear >= w0 && i.publishedYear <= w1 && <><line x1={x0} x2={X(i.publishedYear)} y1={y + 7} y2={y + 7} stroke="var(--border-strong)" strokeDasharray="2 3" /><path d={`M${X(i.publishedYear)},${y + 1} l5,6 l-5,6 l-5,-6z`} fill="var(--s7)"><title>Published {formatYear(i.publishedYear)}</title></path></>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="legend"><span><i style={{ background: 'var(--s1)' }} />Read</span><span><i style={{ background: 'var(--s2)' }} />Reading</span><span><i style={{ background: 'var(--seq-2)' }} />Unread</span><span><i style={{ background: 'var(--s3)' }} />Events / people / periods</span>{showPub && <span><i style={{ background: 'var(--s7)' }} />Publication date (separate from subject period)</span>}</div>
    </div>
  );
}

// ── Reading map (territory) ────────────────────────────────────────────

function ReadingMap({ idx }: { idx: LibraryIndex }) {
  const nav = useNavigate();
  const pagesByFolder = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of idx.sessions) {
      const it = idx.items.get(s.itemId);
      if (!it) continue;
      const p = sessionPages(idx, s) ?? 0;
      const seen = new Set<string>();
      for (const f of it.folderIds) for (const a of idx.folderPath(f)) if (!seen.has(a.id)) { seen.add(a.id); m.set(a.id, (m.get(a.id) ?? 0) + p); }
    }
    return m;
  }, [idx]);
  const max = Math.max(1, ...pagesByFolder.values());
  const level = (v: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999)));
  const Region = ({ parent, depth }: { parent?: string; depth: number }) => (
    <div className="row wrap" style={{ gap: 8, alignItems: 'stretch' }}>
      {(idx.childFolders.get(parent) ?? []).map((f) => {
        const pages = pagesByFolder.get(f.id) ?? 0;
        const items = idx.itemsInFolder(f.id);
        const read = items.filter((i) => i.status === 'read').length;
        const lv = level(pages);
        const kids = (idx.childFolders.get(f.id) ?? []).length;
        return (
          <div key={f.id} style={{ flex: `1 1 ${depth === 0 ? 300 : 160}px`, background: SEQ[lv], color: lv >= 4 ? '#fff' : 'var(--text)', borderRadius: 10, padding: 10, border: '1px solid var(--border)', minWidth: 0 }}>
            <div className="row between" style={{ cursor: 'pointer' }} onClick={() => nav(`/library/folder/${f.id}`)}>
              <b className="ellipsis">{f.icon ?? ''} {f.name}</b>
              <span className="tiny" style={{ opacity: 0.8 }}>{fmtNum(pages)}p · {read}/{items.length}</span>
            </div>
            {pages === 0 && <div className="tiny" style={{ opacity: 0.7 }}>unexplored{items.length ? ` · ${items.length} waiting` : ''}</div>}
            {kids > 0 && <div className="mt-8"><Region parent={f.id} depth={depth + 1} /></div>}
          </div>
        );
      })}
    </div>
  );
  if (!idx.snap.folders.length) return <div className="card"><Empty icon="🗺" title="Your reading territory">Create folders for your subjects — the map shows where you’ve read deeply and what’s unexplored.</Empty></div>;
  return (
    <div className="col gap-16">
      <div className="small muted">Darker regions = more pages read. “Unexplored” regions have books waiting or no reading yet.</div>
      <Region depth={0} />
      <div className="legend">{SEQ.map((c, i) => <span key={i}><i style={{ background: c }} />{i === 0 ? 'none' : i === 5 ? 'most' : ''}</span>)}</div>
    </div>
  );
}

// ── Rabbit hole ────────────────────────────────────────────────────────

interface Branch { key: string; label: string; conceptId?: string; folderId?: string; ai?: boolean; relation?: string }

function RabbitHole({ idx }: { idx: LibraryIndex }) {
  const [params] = useSearchParams();
  const ready = useAIReady();
  const { toast } = useUI();
  const startConcept = params.get('start') ? idx.concepts.get(params.get('start')!) : undefined;
  const [path, setPath] = useState<Branch[]>(startConcept ? [{ key: `c:${startConcept.id}`, label: startConcept.name, conceptId: startConcept.id }] : []);
  const [seed, setSeed] = useState('');
  const [aiBranches, setAiBranches] = useState<Record<string, Branch[]>>({});
  const { loading, error, run } = useAICall();
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => { board.current?.scrollTo({ left: board.current.scrollWidth, behavior: 'smooth' }); }, [path]);
  const branchesOf = (b: Branch): Branch[] => {
    const out: Branch[] = [];
    if (b.conceptId) {
      for (const c of idx.snap.concepts.filter((x) => x.parentId === b.conceptId)) out.push({ key: `c:${c.id}`, label: c.name, conceptId: c.id });
      for (const l of idx.snap.links) {
        const other = l.fromType === 'concept' && l.fromId === b.conceptId && l.toType === 'concept' ? l.toId : l.toType === 'concept' && l.toId === b.conceptId && l.fromType === 'concept' ? l.fromId : undefined;
        const c = other ? idx.concepts.get(other) : undefined;
        if (c && !out.some((o) => o.conceptId === c.id)) out.push({ key: `c:${c.id}`, label: c.name, conceptId: c.id, ai: l.source === 'ai', relation: l.relation });
      }
    }
    if (b.folderId) for (const f of idx.childFolders.get(b.folderId) ?? []) out.push({ key: `f:${f.id}`, label: f.name, folderId: f.id });
    return [...out, ...(aiBranches[b.key] ?? []).filter((a) => !out.some((o) => o.label.toLowerCase() === a.label.toLowerCase()))];
  };
  const booksFor = (b: Branch): Item[] => {
    if (b.folderId) return idx.itemsInFolder(b.folderId);
    if (b.conceptId) return idx.snap.links.filter((l) => (l.fromType === 'concept' && l.fromId === b.conceptId && l.toType === 'item') || (l.toType === 'concept' && l.toId === b.conceptId && l.fromType === 'item')).map((l) => idx.items.get(l.fromType === 'item' ? l.fromId : l.toId)!).filter(Boolean);
    return runQuery(idx, { subject: b.label });
  };
  const expandAI = (b: Branch, depth: number) => run(async (signal) => {
    const trail = path.slice(0, depth + 1).map((p) => p.label).join(' → ');
    const { data } = await completeJSON<{ branches: { name: string; kind: ConceptKind; relation: string }[] }>({ system: BASE_SYSTEM, messages: [{ role: 'user', content: `Intellectual exploration trail: ${trail}. Give 6–9 next branches to explore from "${b.label}" (sub-topics, people, events, schools of thought, works, primary sources — whatever fits the subject). Return JSON {"branches":[{"name":"...","kind":"concept|person|place|event|period|subject","relation":"short"}]}.` }], maxTokens: 700 }, signal);
    setAiBranches((m) => ({ ...m, [b.key]: data.branches.map((x) => ({ key: `ai:${b.key}:${x.name}`, label: x.name, ai: true, relation: x.relation })) }));
  });
  const roots: Branch[] = [
    ...idx.snap.concepts.filter((c) => !c.parentId && (c.kind === 'subject' || c.kind === 'period')).map((c) => ({ key: `c:${c.id}`, label: c.name, conceptId: c.id })),
    ...(idx.childFolders.get(undefined) ?? []).map((f) => ({ key: `f:${f.id}`, label: f.name, folderId: f.id })),
  ];
  const columns: { from?: Branch; items: Branch[] }[] = [{ items: roots }, ...path.map((p) => ({ from: p, items: branchesOf(p) }))];
  const keep = async (b: Branch, parent?: Branch) => {
    const id = await saveConcept({ name: b.label, kind: 'concept', source: 'ai' });
    if (parent?.conceptId) await link('concept', parent.conceptId, 'concept', id, b.relation, 'ai');
    toast(`Saved “${b.label}” to your Knowledge library (marked AI-suggested)`);
  };
  return (
    <div className="col gap-16">
      <div className="card row wrap">
        <span className="small muted">Start anywhere:</span>
        <input className="input" style={{ maxWidth: 320 }} placeholder="e.g. Roman Republic, Quantum Mechanics, Epic Fantasy" value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && seed.trim()) { const c = idx.snap.concepts.find((x) => x.name.toLowerCase() === seed.trim().toLowerCase()); setPath([{ key: c ? `c:${c.id}` : `t:${seed.trim()}`, label: seed.trim(), conceptId: c?.id }]); setSeed(''); } }} />
        <span className="tiny faint">Press Enter. Your concepts and folders are branches; ✦ adds AI-suggested branches.</span>
        {path.length > 0 && <button className="btn sm ghost" onClick={() => setPath([])}>Start over</button>}
      </div>
      {path.length > 0 && <div className="small muted">{path.map((p) => p.label).join(' → ')}</div>}
      <div className="rabbit-board" ref={board}>
        {columns.map((col, ci) => (
          <div key={ci} className="rabbit-col">
            {col.from && (
              <div className="card tight">
                <b>{col.from.label}</b> {col.from.ai && <AIBadge label="AI" />}
                <div className="tiny faint">{booksFor(col.from).length} book(s) you own</div>
                {booksFor(col.from).slice(0, 4).map((i) => <Link key={i.id} to={`/item/${i.id}`} className="tiny ellipsis" style={{ display: 'block' }}>📖 {i.title}</Link>)}
                <div className="row wrap mt-8 gap-4">
                  {ready && <button className="btn xs ai" disabled={loading} onClick={() => expandAI(col.from!, ci - 1)}>{loading ? '…' : '✦ Branches'}</button>}
                  {col.from.ai && <button className="btn xs" onClick={() => keep(col.from!, path[ci - 2])}>Keep</button>}
                  <Link className="btn xs" to={`/explore/discover?subject=${encodeURIComponent(col.from.label)}`}>Find books</Link>
                </div>
              </div>
            )}
            {col.items.length === 0 && ci > 0 && <div className="small faint" style={{ padding: 6 }}>{ready ? 'No saved branches — ask ✦ for ideas.' : 'No saved branches. Add related concepts in Knowledge, or enable AI.'}</div>}
            {col.items.map((b) => (
              <button key={b.key} className={`rabbit-node ${path[ci]?.key === b.key ? 'on' : ''}`} onClick={() => setPath([...path.slice(0, ci), b])} title={b.relation}>
                <span className="ellipsis">{b.label}</span>
                <span className="row gap-4">{b.ai && <span className="ai-badge">AI</span>}<span className="faint">›</span></span>
              </button>
            ))}
            {ci === 0 && roots.length === 0 && <div className="small faint">Type a starting subject above.</div>}
          </div>
        ))}
      </div>
      {!ready && <AIOff compact />}
      <AIErrorNotice error={error} />
    </div>
  );
}

// ── Discover ───────────────────────────────────────────────────────────

function Discover({ idx }: { idx: LibraryIndex }) {
  const [params] = useSearchParams();
  const { toast } = useUI();
  const [mode, setMode] = useState<'library' | 'world'>(params.get('subject') ? 'world' : 'library');
  const [q, setQ] = useState<LibraryQuery>({ statuses: ['want'] });
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [text, setText] = useState('');
  const [maxPages, setMaxPages] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [results, setResults] = useState<MetaResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<{ kind: 'want' | 'folder' | 'project'; id?: string }>({ kind: 'want' });
  const dText = useDebounced(`${subject}|${text}`, 400);
  useEffect(() => {
    if (mode !== 'world' || (!subject.trim() && !text.trim())) { setResults(null); return; }
    const ac = new AbortController();
    setLoading(true);
    searchBooks(text, { subject: subject.trim().toLowerCase() || undefined, limit: 40, signal: ac.signal }).then(setResults).catch(() => setResults([])).finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dText, mode]);
  const filtered = (results ?? []).filter((r) => (!maxPages || (r.pages ?? Infinity) <= Number(maxPages)) && (!before || (r.year ?? Infinity) < Number(before)) && (!after || (r.year ?? -Infinity) > Number(after)));
  const add = async (r: MetaResult) => {
    const id = await addItem({ title: r.title, subtitle: r.subtitle, authors: r.authors.slice(0, 3), isbn: r.isbn, total: r.pages, pageCount: r.pages, publishedYear: r.year, publisher: r.publisher, coverUrl: r.coverUrl, genres: r.subjects.slice(0, 3), status: 'want', folderIds: target.kind === 'folder' && target.id ? [target.id] : [], openLibraryKey: r.key });
    if (target.kind === 'project' && target.id) { const p = idx.projects.get(target.id); if (p) await saveProject({ ...p, itemIds: [...p.itemIds, id] }); }
    toast(`Added “${r.title}”`);
  };
  const libResults = runQuery(idx, q);
  return (
    <div className="col gap-16">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'library', label: 'In my library' }, { value: 'world', label: 'Beyond my library' }]} />
      {mode === 'library' ? (
        <>
          <p className="small muted">Combine filters — e.g. History + under 300 pages + published before 1900 + unread.</p>
          <FilterPanel idx={idx} q={q} onChange={setQ} />
          {libResults.length ? <ItemViews idx={idx} items={libResults} mode="compact" selected={new Set()} onToggle={() => {}} /> : <div className="small muted">No matches.</div>}
        </>
      ) : (
        <>
          <div className="card fields c3">
            <label className="field">Subject<input className="input sm" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. roman history, fantasy, physics" /></label>
            <label className="field">Keywords / title / author<input className="input sm" value={text} onChange={(e) => setText(e.target.value)} /></label>
            <label className="field">Max pages<input className="input sm" type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} /></label>
            <label className="field">Published after<input className="input sm" type="number" value={after} onChange={(e) => setAfter(e.target.value)} /></label>
            <label className="field">Published before<input className="input sm" type="number" value={before} onChange={(e) => setBefore(e.target.value)} /></label>
            <label className="field">Add results to
              <select className="select sm" value={target.kind === 'want' ? 'want' : `${target.kind}:${target.id}`} onChange={(e) => { const [k, id] = e.target.value.split(':'); setTarget({ kind: k as 'want' | 'folder' | 'project', id }); }}>
                <option value="want">Want to Read</option>
                {idx.snap.folders.map((f) => <option key={f.id} value={`folder:${f.id}`}>Folder: {f.name}</option>)}
                {idx.snap.projects.map((p) => <option key={p.id} value={`project:${p.id}`}>Project: {p.name}</option>)}
              </select>
            </label>
          </div>
          <div className="small faint">Results from Open Library. Filters on length and date apply to available metadata.</div>
          {loading && <div className="small muted">Searching…</div>}
          <div className="grid auto">
            {filtered.map((r) => {
              const owned = idx.itemList().some((i) => i.title.toLowerCase() === r.title.toLowerCase());
              return (
                <div key={r.key} className="card tight row gap-12">
                  <Cover item={{ id: r.key, title: r.title, coverUrl: r.coverUrl, contentType: 'book' }} width={48} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{r.title}</div>
                    <div className="small muted ellipsis">{r.authors.join(', ')}</div>
                    <div className="tiny faint">{r.year ?? '?'} · {r.pages ? `${r.pages} pages` : 'length unknown'}</div>
                    {owned ? <span className="chip">In library</span> : <button className="btn xs mt-8" onClick={() => add(r)}>＋ Add</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {results && !filtered.length && !loading && <div className="small muted">No results match those filters.</div>}
        </>
      )}
    </div>
  );
}

// ── Compare / book battles ─────────────────────────────────────────────

function Compare({ idx }: { idx: LibraryIndex }) {
  const [ids, setIds] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const items = ids.map((i) => idx.items.get(i)).filter((x): x is Item => !!x);
  const rows: [string, (i: Item) => React.ReactNode][] = [
    ['Type', (i) => contentLabel(i)],
    ['Length', (i) => (i.total ? fmtUnits(i, i.total) : '—')],
    ['Subject', (i) => [...i.genres, ...i.folderIds.map((f) => idx.folders.get(f)?.name)].filter(Boolean).join(', ') || '—'],
    ['Period covered', (i) => (i.histStart !== undefined ? `${formatYear(i.histStart)} – ${formatYear(i.histEnd ?? i.histStart)}` : '—')],
    ['Published', (i) => formatYear(i.publishedYear)],
    ['Difficulty', (i) => i.difficulty ?? '—'],
    ['Est. reading time', (i) => { const f = itemForecast(idx, i); return f.speedPerHour && i.total ? fmtDuration((i.total / f.speedPerHour) * 3600) : '—'; }],
    ['Progress', (i) => { const f = itemForecast(idx, i); return f.percent !== undefined ? `${Math.round(f.percent * 100)}%` : '—'; }],
    ['Your speed', (i) => { const f = itemForecast(idx, i); return f.speedPerHour ? `${fmtNum(toDisplay(i, f.speedPerHour))} ${unitLabel(i)}/h` : '—'; }],
    ['Rating', (i) => (idx.rating(i) ? <Stars value={idx.rating(i)} size={13} /> : '—')],
    ['Tags', (i) => i.tagIds.map((t) => idx.tags.get(t)?.name).join(', ') || '—'],
  ];
  return (
    <div className="col gap-16">
      <div className="row wrap"><button className="btn primary" onClick={() => setPick(true)}>Choose books to compare</button><span className="small muted">Side by side, for understanding — not ranking. No winners.</span></div>
      {items.length < 2 ? <div className="card"><Empty icon="⚖" title="Pick two or more books">Compare length, scope, period, difficulty, reading time, progress and how they complement each other.</Empty></div> : (
        <>
          <div className="card flat table-wrap" style={{ padding: 0 }}>
            <table className="table">
              <thead><tr><th />{items.map((i) => <th key={i.id}><div className="row"><Cover item={i} width={30} /><Link to={`/item/${i.id}`} className="ellipsis" style={{ maxWidth: 180, color: 'var(--text)' }}>{i.title}</Link></div></th>)}</tr></thead>
              <tbody>{rows.map(([label, fn]) => <tr key={label}><td className="muted small nowrap">{label}</td>{items.map((i) => <td key={i.id} className="small">{fn(i)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-head"><h3>✦ How they complement each other</h3></div>
            <AIPanel key={ids.join()} kind="comparison" title={`Comparison: ${items.map((i) => i.title).join(' vs ')}`} buttonLabel="Compare with AI" build={() => ({
              system: `${BASE_SYSTEM}\nNever declare a winner. Compare scope, subject, difficulty, approach, length, historical coverage, themes and complementarity; suggest a sensible reading order if relevant.`,
              messages: [{ role: 'user', content: items.map((i) => itemLine(idx, i, { share: idx.settings.ai.share, withProgress: true, withDescription: true })).join('\n') }],
            })} />
          </div>
        </>
      )}
      {pick && <Modal title="Compare books" onClose={() => setPick(false)} footer={<button className="btn primary" onClick={() => setPick(false)}>Done</button>}><ItemPicker idx={idx} value={ids} onChange={setIds} /></Modal>}
    </div>
  );
}

// ── Reading paths ──────────────────────────────────────────────────────

interface PathSpec { title: string; stages: { name: string; level: 'beginner' | 'intermediate' | 'advanced'; books: { title: string; author?: string; itemId?: string; primarySource?: boolean; why: string }[] }[] }

function Paths({ idx }: { idx: LibraryIndex }) {
  const ready = useAIReady();
  const nav = useNavigate();
  const { toast } = useUI();
  const [goal, setGoal] = useState('I want to understand the Roman Republic from beginning to end.');
  const { loading, error, run } = useAICall();
  const [path, setPath] = useState<PathSpec | null>(null);
  const [manual, setManual] = useState<string[]>([]);
  const [pickManual, setPickManual] = useState(false);
  const saved = idx.snap.ai.filter((r) => r.kind === 'path');
  const req = {
    system: BASE_SYSTEM,
    messages: [{ role: 'user' as const, content: `Create a structured learning path for: "${goal}". Stages should go from beginner to advanced (3–7 stages). PRIORITISE books already in the library (use their exact id in itemId); include books already read where useful; then add well-known outside books (no itemId) and primary sources when appropriate. Return JSON {"title":"...","stages":[{"name":"...","level":"beginner|intermediate|advanced","books":[{"title":"...","author":"...","itemId":"library id or omit","primarySource":bool,"why":"one line"}]}]}.\n\n${libraryDigest(idx, idx.settings.ai.share, relevantItems(idx, goal, 80))}` }],
    maxTokens: 3000,
  };
  const generate = () => run(async (signal) => {
    const { data } = await completeJSON<PathSpec>(req, signal);
    // Validate: only keep itemIds that really exist.
    for (const st of data.stages ?? []) for (const b of st.books ?? []) if (b.itemId && !idx.items.has(b.itemId)) b.itemId = undefined;
    setPath(data);
  });
  const convert = async (p: PathSpec) => {
    const outside = p.stages.flatMap((s) => s.books.filter((b) => !b.itemId));
    const addOutside = outside.length > 0 && confirm(`Add ${outside.length} suggested book(s) that aren’t in your library to Want to Read? (Cancel = only use books you own.)`);
    const ids: string[] = [];
    for (const st of p.stages) for (const b of st.books) {
      if (b.itemId) ids.push(b.itemId);
      else if (addOutside) ids.push(await addItem({ title: b.title, authors: b.author ? [b.author] : [], status: 'want', source: 'ai', description: `Suggested by AI for “${p.title}”: ${b.why}` }));
    }
    const pid = await saveProject({ name: p.title, description: p.stages.map((s) => s.name).join(' → '), itemIds: [...new Set(ids)], source: 'ai' });
    toast('Project created');
    nav(`/plan/project/${pid}`);
  };
  return (
    <div className="col gap-16">
      <div className="card col">
        <h3>✦ Generate a reading path</h3>
        {!ready ? <AIOff compact /> : (
          <>
            <div className="row"><input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} /><button className="btn ai" disabled={loading} onClick={generate}>{loading ? 'Designing…' : 'Create path'}</button></div>
            <SharedPreview req={req} />
            <AIErrorNotice error={error} />
          </>
        )}
      </div>
      {path && <PathView idx={idx} p={path} onConvert={() => convert(path)} onSave={async () => { await saveAIRecord({ kind: 'path', title: path.title, content: path.stages.map((s) => `**${s.name}**: ${s.books.map((b) => b.title).join(', ')}`).join('\n'), data: path }); toast('Path saved'); }} />}
      <div className="card">
        <div className="card-head"><h3>Build a path yourself</h3><button className="btn sm" onClick={() => setPickManual(true)}>Choose books</button></div>
        {manual.length === 0 ? <div className="small muted">Pick books from your library in the order you want to read them; the path becomes a project.</div> : (
          <>
            {manual.map((id, n) => <div key={id} className="row small"><span className="faint">{n + 1}.</span>{idx.items.get(id)?.title}</div>)}
            <button className="btn sm primary mt-8" onClick={async () => { const n = prompt('Path name', 'My reading path'); if (!n) return; nav(`/plan/project/${await saveProject({ name: n, itemIds: manual })}`); }}>Convert to project</button>
          </>
        )}
      </div>
      {saved.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Saved paths</h3><AIBadge /></div>
          {saved.map((r) => <details key={r.id}><summary style={{ cursor: 'pointer' }}>{r.title}</summary><PathView idx={idx} p={r.data as PathSpec} onConvert={() => convert(r.data as PathSpec)} /></details>)}
        </div>
      )}
      {pickManual && <Modal title="Books for your path" onClose={() => setPickManual(false)} footer={<button className="btn primary" onClick={() => setPickManual(false)}>Done</button>}><ItemPicker idx={idx} value={manual} onChange={setManual} /></Modal>}
    </div>
  );
}

function PathView({ idx, p, onConvert, onSave }: { idx: LibraryIndex; p: PathSpec; onConvert: () => void; onSave?: () => void }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{p.title}</h3><AIBadge /></div>
      <div className="col gap-12">
        {p.stages?.map((s, i) => (
          <div key={i} className="row top gap-12">
            <div className="chip accent" style={{ minWidth: 26, justifyContent: 'center' }}>{i + 1}</div>
            <div className="grow">
              <b>{s.name}</b> <span className="chip">{s.level}</span>
              {s.books.map((b, j) => {
                const it = b.itemId ? idx.items.get(b.itemId) : undefined;
                return (
                  <div key={j} className="small mt-8">
                    {it ? <Link to={`/item/${it.id}`}><b>📚 {it.title}</b></Link> : <span>🔎 {b.title}{b.author ? ` — ${b.author}` : ''} <span className="faint">(not in library)</span></span>}
                    {b.primarySource && <span className="chip" style={{ marginLeft: 6 }}>primary source</span>}
                    {it?.status === 'read' && <span className="chip good" style={{ marginLeft: 6 }}>read</span>}
                    <div className="faint">{b.why}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="row mt-16"><button className="btn primary" onClick={onConvert}>Convert to Project</button>{onSave && <button className="btn" onClick={onSave}>Save path</button>}</div>
    </div>
  );
}

// ── What should I explore? (gaps) ──────────────────────────────────────

function Gaps({ idx }: { idx: LibraryIndex }) {
  const readConcepts = new Set<string>();
  for (const l of idx.snap.links) {
    const itemId = l.fromType === 'item' ? l.fromId : l.toType === 'item' ? l.toId : undefined;
    const conceptId = l.fromType === 'concept' ? l.fromId : l.toType === 'concept' ? l.toId : undefined;
    if (itemId && conceptId && idx.items.get(itemId)?.status === 'read') readConcepts.add(conceptId);
  }
  const adjacent = idx.snap.concepts.filter((c) => !readConcepts.has(c.id) && idx.snap.links.some((l) => l.fromType === 'concept' && l.toType === 'concept' && ((l.fromId === c.id && readConcepts.has(l.toId)) || (l.toId === c.id && readConcepts.has(l.fromId)))));
  const thinFolders = idx.snap.folders.filter((f) => { const items = idx.itemsInFolder(f.id); return items.length > 0 && !items.some((i) => i.status === 'read' || i.status === 'reading'); });
  return (
    <div className="col gap-16">
      <div className="grid c2">
        <div className="card">
          <div className="card-head"><h3>Next to what you know</h3><span className="small faint">from your own concept links</span></div>
          {adjacent.length === 0 ? <div className="small muted">Link concepts to books you’ve read to see adjacent areas here.</div> : <div className="row wrap gap-4">{adjacent.map((c) => <Link key={c.id} to={`/knowledge/concept/${c.id}`} className="chip accent">→ {c.name}</Link>)}</div>}
        </div>
        <div className="card">
          <div className="card-head"><h3>Owned but unexplored</h3></div>
          {thinFolders.length === 0 ? <div className="small muted">You’ve started something in every folder.</div> : thinFolders.map((f) => <Link key={f.id} to={`/library/folder/${f.id}`} className="row small"><span>📁</span><span className="grow">{idx.folderPath(f.id).map((x) => x.name).join(' / ')}</span><span className="faint">{idx.itemsInFolder(f.id).length} waiting</span></Link>)}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>✦ Gap finder</h3></div>
        <p className="small muted mb-8">Observations about areas you’ve read little about — not judgments.</p>
        <AIPanel kind="gap" title="Gap finder" buttonLabel="Find gaps" build={() => ({
          system: BASE_SYSTEM,
          messages: [{ role: 'user', content: `Analyse this reader's library and identify 3–5 potential gaps as neutral observations (e.g. "You've read extensively about X but comparatively little about Y"). For each, suggest subjects, owned unread books first (by title), then outside books/authors/primary sources clearly marked as outside the library.\n\n${libraryDigest(idx, idx.settings.ai.share)}` }],
          maxTokens: 2000,
        })} />
      </div>
    </div>
  );
}

// ── Authors ────────────────────────────────────────────────────────────

function Authors({ idx }: { idx: LibraryIndex }) {
  const [q, setQ] = useState('');
  const rows = idx.snap.authors
    .map((a) => { const items = idx.itemList().filter((i) => i.authorIds.includes(a.id)); return { a, items, read: items.filter((i) => i.status === 'read').length }; })
    .filter((r) => r.items.length && (!q || r.a.name.toLowerCase().includes(q.toLowerCase())))
    .sort((x, y) => y.items.length - x.items.length || x.a.name.localeCompare(y.a.name));
  return (
    <div className="col gap-16">
      <input className="input" style={{ maxWidth: 360 }} placeholder="Find an author…" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length === 0 ? <div className="card"><Empty title="No authors yet" /></div> : (
        <div className="grid auto-sm">
          {rows.map((r) => (
            <Link key={r.a.id} to={`/author/${r.a.id}`} className="card tight">
              <div className="row mb-8">{r.items.slice(0, 4).map((i) => <Cover key={i.id} item={i} width={26} />)}</div>
              <div style={{ fontWeight: 600 }} className="ellipsis">{r.a.name}</div>
              <div className="small muted">{r.items.length} owned · {r.read} read</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
