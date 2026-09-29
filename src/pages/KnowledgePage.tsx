import { useMemo, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM, noteLine } from '../ai/context';
import { AIErrorNotice, AIOff, AskChip, SharedPreview, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { AIBadge, Cover, Empty, Modal, Segmented, Tabs } from '../components/common';
import { Atlas } from '../components/atlas';
import { AtlasHome, booksByConcept } from '../components/atlas-views';
import { KIND_LABEL } from '../components/entity';
import { KnowledgeGraph } from '../components/graph';
import { EvidenceChip } from '../components/visual';
import { NoteCard } from '../components/notes';
import { deleteConcept, link, saveConcept, unlink, updateNote } from '../db/actions';
import { download, tableRowsForExport, toCSV } from '../db/portability';
import type { Concept, ConceptKind, NodeType } from '../db/types';
import { formatYear, keyFromMs } from '../engine/dates';
import type { LibraryIndex } from '../engine/model';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { NotesOrganizer } from './ItemPage';

type Tab = 'atlas' | 'notes' | 'library' | 'graph';
const KINDS: ConceptKind[] = ['subject', 'concept', 'person', 'place', 'event', 'period', 'polity', 'organization', 'object', 'source'];
const KIND_ICON: Record<ConceptKind, string> = { subject: '📂', concept: '◇', person: '👤', place: '📍', event: '⚡', period: '🕰', polity: '🏛', organization: '👥', object: '🏺', source: '📜' };

export default function KnowledgePage() {
  const idx = useLibrary();
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split('/')[2];
  const tab: Tab = seg === 'library' || seg === 'concept' ? 'library' : seg === 'graph' ? 'graph' : seg === 'notes' ? 'notes' : 'atlas';
  useConcierge('Knowledge', ['Organize these thoughts.', 'What themes keep coming up in my notes?', 'Which concepts connect my books?'], () => `CONCEPTS: ${idx.snap.concepts.map((c) => `${c.name} (${c.kind})`).join(', ') || 'none'}\n\nRECENT NOTES:\n${idx.settings.ai.share.notes ? [...idx.snap.notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60).map(noteLine).join('\n') : '(notes not shared)'}`, [idx]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Knowledge Atlas</h1><div className="sub">Everyone, everywhere and everything you’ve met in your reading — plus your quotes and notes.</div></div><AskChip question="What themes keep coming up in my reading?" /></div>
      <Tabs<Tab> value={tab} onChange={(t) => nav(`/knowledge/${t === 'atlas' ? '' : t}`)} tabs={[{ id: 'atlas', label: 'Atlas' }, { id: 'notes', label: `Quotes & notes · ${idx.snap.notes.length}` }, { id: 'library', label: `Topics · ${idx.snap.concepts.length}` }, { id: 'graph', label: 'Web' }]} />
      <Routes>
        <Route index element={<AtlasHome idx={idx} />} />
        <Route path="notes" element={<NotesDB idx={idx} />} />
        <Route path="library" element={<ConceptLibrary idx={idx} />} />
        <Route path="concept/:id" element={<ConceptPage />} />
        <Route path="graph" element={<KnowledgeGraph idx={idx} onOpen={(n) => nav(n.type === 'item' ? `/item/${n.refId}` : n.type === 'concept' ? `/knowledge/concept/${n.refId}` : n.type === 'author' ? `/author/${n.refId}` : n.type === 'folder' ? `/library/folder/${n.refId}` : n.type === 'tag' ? `/library?tag=${n.refId}` : '/knowledge')} />} />
      </Routes>
    </div>
  );
}

function NotesDB({ idx }: { idx: LibraryIndex }) {
  const { open } = useUI();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'note' | 'quote'>('all');
  const [book, setBook] = useState('');
  const [folder, setFolder] = useState('');
  const [tag, setTag] = useState('');
  const [author, setAuthor] = useState('');
  const [concept, setConcept] = useState('');
  const [source, setSource] = useState<'all' | 'user' | 'ai'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const tags = useMemo(() => [...new Set(idx.snap.notes.flatMap((n) => n.tags))].sort(), [idx]);
  const folderSet = folder ? new Set(idx.folderTree(folder)) : null;
  const notes = idx.snap.notes
    .filter((n) => {
      if (kind !== 'all' && n.kind !== kind) return false;
      if (source !== 'all' && (n.source === 'ai') !== (source === 'ai')) return false;
      if (book && n.itemId !== book) return false;
      const item = n.itemId ? idx.items.get(n.itemId) : undefined;
      if (folderSet && !item?.folderIds.some((f) => folderSet.has(f))) return false;
      if (author && !item?.authorIds.includes(author)) return false;
      if (tag && !n.tags.includes(tag)) return false;
      if (concept && !n.conceptIds.includes(concept) && !idx.snap.links.some((l) => l.fromType === 'concept' && l.fromId === concept && l.toType === 'note' && l.toId === n.id)) return false;
      const d = keyFromMs(n.createdAt);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q && !`${n.text} ${n.tags.join(' ')} ${item?.title ?? ''} ${n.chapter ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const ready = useAIReady();
  const [organize, setOrganize] = useState(false);
  const exportCSV = async (k: 'notes' | 'quotes') => { const rows = await tableRowsForExport(); download(`shelf-${k}.csv`, toCSV(rows[k]), 'text/csv'); };
  if (!idx.snap.notes.length) return <div className="card"><Empty illustration="notes" title="Your quotes and notes will live here" action={<div className="row wrap" style={{ justifyContent: 'center' }}><button className="btn primary" onClick={() => open({ kind: 'note', noteKind: 'quote' })}>Save a quote</button><button className="btn" onClick={() => open({ kind: 'note', noteKind: 'note' })}>Write a note</button></div>}>In the ebook reader, press and hold on text and tap Save quote. You can also add them by hand.</Empty></div>;
  return (
    <div className="col gap-16">
      <div className="card flat col gap-12">
        <div className="row wrap">
          <input className="input" style={{ flex: '1 1 260px' }} placeholder="Search notes and quotes…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'note', label: 'Notes' }, { value: 'quote', label: 'Quotes' }]} />
          <button className="btn" onClick={() => open({ kind: 'note', noteKind: 'note' })}>＋ New</button>
        </div>
        <details>
        <summary className="small muted" style={{ cursor: 'pointer', fontWeight: 700 }}>Filter by book, folder, author, tag, topic or date</summary>
        <div className="fields c3 mt-8">
          <label className="field">Book<select className="select sm" value={book} onChange={(e) => setBook(e.target.value)}><option value="">Any</option>{idx.itemList().filter((i) => idx.notesByItem.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
          <label className="field">Folder<select className="select sm" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">Any</option>{idx.snap.folders.map((f) => <option key={f.id} value={f.id}>{idx.folderPath(f.id).map((x) => x.name).join(' / ')}</option>)}</select></label>
          <label className="field">Author<select className="select sm" value={author} onChange={(e) => setAuthor(e.target.value)}><option value="">Any</option>{idx.snap.authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="field">Tag<select className="select sm" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Any</option>{tags.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="field">Subject / concept<select className="select sm" value={concept} onChange={(e) => setConcept(e.target.value)}><option value="">Any</option>{idx.snap.concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field">Date<div className="row"><input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input className="input sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></label>
          <label className="field">Created by<select className="select sm" value={source} onChange={(e) => setSource(e.target.value as typeof source)}><option value="all">Anyone</option><option value="user">Me</option><option value="ai">AI</option></select></label>
        </div>
        </details>
        <div className="row wrap">
          <span className="small muted grow">{notes.length} result{notes.length === 1 ? '' : 's'}</span>
          <button className="btn sm ghost" onClick={() => exportCSV('notes')}>Export notes CSV</button>
          <button className="btn sm ghost" onClick={() => exportCSV('quotes')}>Export quotes CSV</button>
          <button className="btn sm ai" onClick={() => setOrganize(true)}>✦ Organize</button>
        </div>
      </div>
      <div className="grid c2">{notes.slice(0, 300).map((n) => <NoteCard key={n.id} note={n} idx={idx} />)}</div>
      {organize && <Modal title="✦ Organize my notes" size="wide" onClose={() => setOrganize(false)}>{ready ? <NotesOrganizer idx={idx} /> : <AIOff />}</Modal>}
    </div>
  );
}

function ConceptLibrary({ idx }: { idx: LibraryIndex }) {
  const nav = useNavigate();
  const [edit, setEdit] = useState<Partial<Concept> | null>(null);
  const [kind, setKind] = useState<ConceptKind | 'all'>('all');
  const roots = idx.snap.concepts.filter((c) => (!c.parentId || !idx.concepts.has(c.parentId)) && (kind === 'all' || c.kind === kind));
  const childrenOf = (id: string) => idx.snap.concepts.filter((c) => c.parentId === id);
  const booksFor = (id: string) => linkedIds(idx, 'concept', id, 'item').map((x) => idx.items.get(x)).filter(Boolean);
  const Node = ({ c, depth }: { c: Concept; depth: number }) => (
    <div style={{ marginLeft: depth * 18 }}>
      <Link to={`/knowledge/concept/${c.id}`} className="tree-row">
        <span>{KIND_ICON[c.kind]}</span><span className="ellipsis">{c.name}</span>
        {c.source === 'ai' && <AIBadge label="AI" />}
        <span className="count">{booksFor(c.id).length} books · {notesFor(idx, c.id).length} notes</span>
      </Link>
      {childrenOf(c.id).map((k) => <Node key={k.id} c={k} depth={depth + 1} />)}
    </div>
  );
  return (
    <div className="col gap-16">
      <div className="row wrap">
        <div className="row wrap gap-4 grow">{(['all', ...KINDS] as const).map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k === 'all' ? 'All' : `${KIND_ICON[k]} ${k}`}</button>)}</div>
        <button className="btn primary" onClick={() => setEdit({ kind: 'concept' })}>＋ New concept</button>
      </div>
      {idx.snap.concepts.length === 0 ? (
        <div className="card"><Empty illustration="notes" title="Turn books into knowledge" action={<button className="btn" onClick={() => setEdit({ kind: 'subject' })}>Create a subject</button>}>Create subjects (e.g. “Ancient Rome”), concepts, people, places, events and periods. Link books and notes to them to build your knowledge library.</Empty></div>
      ) : (
        <div className="card">{roots.map((c) => <Node key={c.id} c={c} depth={0} />)}</div>
      )}
      {edit && <ConceptEditor idx={idx} concept={edit} onClose={(id) => { setEdit(null); if (id) nav(`/knowledge/concept/${id}`); }} />}
    </div>
  );
}

function linkedIds(idx: LibraryIndex, type: NodeType, id: string, other: NodeType): string[] {
  const out: string[] = [];
  for (const l of idx.snap.links) {
    if (l.fromType === type && l.fromId === id && l.toType === other) out.push(l.toId);
    if (l.toType === type && l.toId === id && l.fromType === other) out.push(l.fromId);
  }
  return [...new Set(out)];
}

function notesFor(idx: LibraryIndex, conceptId: string) {
  const linked = new Set(linkedIds(idx, 'concept', conceptId, 'note'));
  return idx.snap.notes.filter((n) => n.conceptIds.includes(conceptId) || linked.has(n.id));
}

function ConceptEditor({ idx, concept, onClose }: { idx: LibraryIndex; concept: Partial<Concept>; onClose: (id?: string) => void }) {
  const [c, setC] = useState(concept);
  const hasYears = c.kind === 'event' || c.kind === 'period' || c.kind === 'person';
  return (
    <Modal title={concept.id ? 'Edit concept' : 'New concept'} onClose={() => onClose()} footer={<><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn primary" disabled={!c.name?.trim()} onClick={async () => onClose(await saveConcept({ ...(c as Concept), name: c.name!.trim() }))}>Save</button></>}>
      <div className="col gap-12">
        <label className="field">Name<input autoFocus className="input" value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
        <div className="fields">
          <label className="field">Kind<select className="select" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as ConceptKind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
          <label className="field">Part of<select className="select" value={c.parentId ?? ''} onChange={(e) => setC({ ...c, parentId: e.target.value || undefined })}><option value="">—</option>{idx.snap.concepts.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          {hasYears && <label className="field">Start year<input className="input" type="number" value={c.start ?? ''} onChange={(e) => setC({ ...c, start: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="-49 for 49 BCE" /></label>}
          {hasYears && <label className="field">End year<input className="input" type="number" value={c.end ?? ''} onChange={(e) => setC({ ...c, end: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>}
        </div>
        <label className="field">Description<textarea className="textarea" rows={3} value={c.description ?? ''} onChange={(e) => setC({ ...c, description: e.target.value })} /></label>
      </div>
    </Modal>
  );
}

interface Suggest { related: { name: string; kind: ConceptKind; relation: string }[] }

function ConceptPage() {
  const idx = useLibrary();
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useUI();
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState<'book' | 'note' | 'concept' | null>(null);
  const [pick, setPick] = useState('');
  const c = idx.concepts.get(id!);
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const [sugg, setSugg] = useState<Suggest | null>(null);
  if (!c) return <Empty title="Concept not found" />;
  const books = linkedIds(idx, 'concept', c.id, 'item').map((x) => idx.items.get(x)!).filter(Boolean);
  const notes = notesFor(idx, c.id);
  const conceptLinks = idx.snap.links.filter((l) => (l.fromType === 'concept' && l.fromId === c.id && l.toType === 'concept') || (l.toType === 'concept' && l.toId === c.id && l.fromType === 'concept'));
  const children = idx.snap.concepts.filter((x) => x.parentId === c.id);
  const parent = c.parentId ? idx.concepts.get(c.parentId) : undefined;
  const req = { system: BASE_SYSTEM, messages: [{ role: 'user' as const, content: `Suggest 6–10 closely related people, events, places, periods, institutions or ideas for the topic "${c.name}" (${c.kind}${c.description ? `: ${c.description}` : ''}). Existing related concepts: ${conceptLinks.map((l) => idx.concepts.get(l.fromId === c.id ? l.toId : l.fromId)?.name).join(', ') || 'none'}. Return JSON {"related":[{"name":"...","kind":"concept|person|place|event|period|subject","relation":"short relation"}]}.` }], maxTokens: 800 };
  return (
    <div className="col gap-16">
      <div className="row wrap between">
        <div>
          <div className="small muted">{KIND_ICON[c.kind]} {c.kind}{parent ? <> · part of <Link to={`/knowledge/concept/${parent.id}`}>{parent.name}</Link></> : null}{c.start !== undefined ? ` · ${formatYear(c.start)}${c.end !== undefined ? ` – ${formatYear(c.end)}` : ''}` : ''}</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 500 }}>{c.name} {c.source === 'ai' && <AIBadge />}</h2>
          {c.description && <p className="muted">{c.description}</p>}
        </div>
        <div className="row">
          <Link className="btn sm" to={`/explore/rabbit?start=${c.id}`}>🕳 Rabbit hole</Link>
          <button className="btn sm" onClick={() => setEdit(true)}>Edit</button>
          <button className="btn sm danger" onClick={async () => { if (confirm(`Delete “${c.name}”? Links are removed; books and notes stay.`)) { await deleteConcept(c.id); nav('/knowledge/library'); } }}>Delete</button>
        </div>
      </div>
      <EntityOverview idx={idx} c={c} />
      <div className="grid c2">
        <div className="card">
          <div className="card-head"><h3>Books ({books.length})</h3><button className="btn xs" onClick={() => setAdding('book')}>＋ Link book</button></div>
          {books.length === 0 ? <div className="small muted">No books linked yet.</div> : books.map((b) => <div key={b.id} className="book-row"><Cover item={b} width={28} /><Link className="grow ellipsis" to={`/item/${b.id}`}>{b.title}</Link><button className="btn xs ghost" onClick={() => { const l = idx.snap.links.find((x) => (x.fromId === c.id && x.toId === b.id) || (x.toId === c.id && x.fromId === b.id)); if (l) unlink(l.id); }}>✕</button></div>)}
        </div>
        <div className="card">
          <div className="card-head"><h3>Connections</h3><button className="btn xs" onClick={() => setAdding('concept')}>＋ Connect</button></div>
          <div className="row wrap gap-4">
            {children.map((k) => <Link key={k.id} to={`/knowledge/concept/${k.id}`} className="chip">{KIND_ICON[k.kind]} {k.name}</Link>)}
            {conceptLinks.map((l) => { const o = idx.concepts.get(l.fromId === c.id ? l.toId : l.fromId); return o ? <span key={l.id} className={`chip ${l.source === 'ai' ? 'ai' : ''}`} title={l.source === 'ai' ? 'AI-generated connection' : undefined}><Link to={`/knowledge/concept/${o.id}`}>{KIND_ICON[o.kind]} {o.name}</Link>{l.relation && <span className="faint"> · {l.relation}</span>}<span className="x" onClick={() => unlink(l.id)}>✕</span></span> : null; })}
            {children.length + conceptLinks.length === 0 && <span className="small muted">No connections yet.</span>}
          </div>
          <div className="divider" />
          {ready ? (
            <div className="col">
              <button className="btn sm ai" style={{ alignSelf: 'flex-start' }} disabled={loading} onClick={async () => { const r = await run((s) => completeJSON<Suggest>(req, s)); if (r) setSugg(r.data); }}>{loading ? 'Thinking…' : '✦ Suggest related areas'}</button>
              <SharedPreview req={req} />
              <AIErrorNotice error={error} />
              {sugg && <div className="row wrap gap-4"><AIBadge />{sugg.related.map((s) => <button key={s.name} className="chip ai" title={s.relation} onClick={async () => { const nid = await saveConcept({ name: s.name, kind: KINDS.includes(s.kind) ? s.kind : 'concept', source: 'ai' }); await link('concept', c.id, 'concept', nid, s.relation, 'ai'); toast(`Added ${s.name} (AI-suggested)`); }}>＋ {s.name}</button>)}</div>}
            </div>
          ) : <div className="small faint">Enable AI to get suggestions for related areas.</div>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Notes & quotes ({notes.length})</h3><button className="btn xs" onClick={() => setAdding('note')}>＋ Attach note</button></div>
        {notes.length === 0 ? <div className="small muted">Attach notes to build what you know about {c.name}.</div> : <div className="grid c2">{notes.map((n) => <NoteCard key={n.id} note={n} idx={idx} />)}</div>}
      </div>
      <div className="card"><div className="card-head"><h3>Neighborhood</h3></div><KnowledgeGraph idx={idx} focus={{ type: 'concept', id: c.id }} height={380} initialTypes={['item', 'concept', 'author', 'note']} onOpen={(n) => nav(n.type === 'item' ? `/item/${n.refId}` : n.type === 'concept' ? `/knowledge/concept/${n.refId}` : n.type === 'author' ? `/author/${n.refId}` : '/knowledge')} /></div>
      {edit && <ConceptEditor idx={idx} concept={c} onClose={() => setEdit(false)} />}
      {adding && (
        <Modal title={adding === 'book' ? 'Link a book' : adding === 'note' ? 'Attach a note' : 'Connect a concept'} onClose={() => setAdding(null)} footer={<button className="btn primary" disabled={!pick} onClick={async () => {
          if (adding === 'book') await link('concept', c.id, 'item', pick);
          if (adding === 'note') { const n = idx.snap.notes.find((x) => x.id === pick); if (n) await updateNote(n.id, { conceptIds: [...new Set([...n.conceptIds, c.id])] }); }
          if (adding === 'concept') await link('concept', c.id, 'concept', pick);
          setPick(''); setAdding(null);
        }}>Link</button>}>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} size={10} style={{ height: 'auto' }}>
            {adding === 'book' && idx.itemList().map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            {adding === 'note' && idx.snap.notes.map((n) => <option key={n.id} value={n.id}>{n.text.slice(0, 90)}</option>)}
            {adding === 'concept' && idx.snap.concepts.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Modal>
      )}
    </div>
  );
}

/** Reference facts, cross-book view, map and saved images for one entity. */
function EntityOverview({ idx, c }: { idx: LibraryIndex; c: Concept }) {
  const books = booksByConcept(idx).get(c.id) ?? [];
  const media = idx.snap.media.filter((m) => m.conceptIds.includes(c.id));
  const hasMap = c.lat !== undefined && c.lon !== undefined;
  if (!c.summary && !c.imageUrl && books.length < 2 && !hasMap && !media.length) return null;
  return (
    <div className="col gap-16">
      {(c.summary || c.imageUrl) && (
        <div className="card">
          <div className="row top gap-12">
            {c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" style={{ width: 88, height: 108, objectFit: 'cover', borderRadius: 12, flex: 'none' }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">{KIND_LABEL[c.kind]}</div>
              {c.summary && <p className="small" style={{ lineHeight: 1.55, margin: '4px 0 0' }}>{c.summary}</p>}
              <div className="tiny faint mt-8">{c.wikidataId && <>Identity: <a href={`https://www.wikidata.org/wiki/${c.wikidataId}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Wikidata {c.wikidataId}</a>. </>}{c.summarySource?.startsWith('http') && <>Summary: <a href={c.summarySource} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Wikipedia</a> (CC BY-SA).</>}</div>
            </div>
          </div>
        </div>
      )}
      {books.length > 1 && (
        <div className="card">
          <div className="card-head"><h3>Met in {books.length} of your books</h3></div>
          <div className="small muted">Different books can tell {c.name}’s story differently.</div>
          <div className="row wrap gap-8 mt-8">
            <AskChip question={`How do these books portray ${c.name}: ${books.map((b) => `"${b.title}"`).join(', ')}? Describe each account and where they differ or agree. Don't pick a winner, and say if you're unsure what a book says.`} label="Compare their accounts" />
          </div>
        </div>
      )}
      {hasMap && <div className="card"><div className="card-head"><h3>On the map</h3></div><Atlas concepts={[c]} focus={c} height={260} compact /></div>}
      {media.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Images you saved</h3></div>
          <div className="visual-grid">
            {media.map((m) => (
              <a key={m.id} className="visual-cell" href={m.sourceUrl} target="_blank" rel="noreferrer">
                <img src={m.thumbUrl ?? m.imageUrl} alt="" loading="lazy" />
                <span className="tiny ellipsis" style={{ fontWeight: 700 }}>{m.title}</span>
                <span className="tiny faint ellipsis">{[m.date, m.institution].filter(Boolean).join(' · ')}</span>
                <EvidenceChip e={m.evidence} />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
