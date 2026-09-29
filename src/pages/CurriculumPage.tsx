// Curriculum Builder: you design a learning path in levels, the AI helps.
// The AI only ever proposes — nothing is added to a curriculum until you tick
// it and confirm. Progress is shown plainly, with no points or badges.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM } from '../ai/context';
import { AIErrorNotice, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { AIBadge, Cover, Empty, Modal, ProgressBar } from '../components/common';
import { Icon } from '../components/icons';
import { deleteCurriculum, link, saveCurriculum } from '../db/actions';
import { uid } from '../db/db';
import type { Curriculum, CurriculumLevel, CurriculumResource, ResourceStatus } from '../db/types';
import type { LibraryIndex } from '../engine/model';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

export const STATUS: { id: ResourceStatus; label: string }[] = [
  { id: 'not-started', label: 'Not started' },
  { id: 'reading', label: 'Reading' },
  { id: 'completed', label: 'Done' },
  { id: 'revisit', label: 'Revisit' },
  { id: 'skipped', label: 'Skipped' },
];

/** Share of resources done (skipped ones don't count either way). */
export function levelProgress(resources: CurriculumResource[], idx?: LibraryIndex): { done: number; total: number } {
  const counted = resources.filter((r) => effectiveStatus(r, idx) !== 'skipped');
  return { done: counted.filter((r) => effectiveStatus(r, idx) === 'completed').length, total: counted.length };
}

/** A library book's own status wins when it's more advanced. */
function effectiveStatus(r: CurriculumResource, idx?: LibraryIndex): ResourceStatus {
  const it = r.itemId ? idx?.items.get(r.itemId) : undefined;
  if (it?.status === 'read' && r.status !== 'skipped') return 'completed';
  if (it?.status === 'reading' && r.status === 'not-started') return 'reading';
  return r.status;
}

export function curriculumProgress(c: Curriculum, idx?: LibraryIndex) {
  const all = c.levels.flatMap((l) => l.resources);
  return levelProgress(all, idx);
}

// ── List (lives in the Library) ─────────────────────────────────────────

export function CurriculaList() {
  const idx = useLibrary();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const list = [...idx.snap.curricula].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="col gap-16">
      <div className="page-head">
        <div><h1>Curricula</h1><div className="sub">Learning paths you build, level by level — with AI as a helper, never the boss.</div></div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" />New curriculum</button>
      </div>
      {list.length === 0 ? (
        <div className="card">
          <Empty illustration="map" title="Build your own course" action={<button className="btn primary" onClick={() => setCreating(true)}>Start a curriculum</button>}>
            Pick a subject — “The Roman Republic”, “Stoicism”, “World War I” — and arrange books and sources into levels, from first steps to deep dives.
          </Empty>
        </div>
      ) : (
        <div className="col gap-12">
          {list.map((c) => {
            const p = curriculumProgress(c, idx);
            return (
              <Link key={c.id} to={`/curriculum/${c.id}`} className="card" style={{ display: 'block' }}>
                <div className="row between"><div className="book-title" style={{ fontSize: 18 }}>{c.name}</div><Icon name="chevronRight" className="faint" /></div>
                {c.goal && <div className="small muted mt-8">{c.goal}</div>}
                <div className="mt-8"><ProgressBar value={p.total ? p.done / p.total : 0} /></div>
                <div className="tiny faint mt-8">{c.levels.length} level{c.levels.length === 1 ? '' : 's'} · {p.done} of {p.total} done</div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <NewCurriculum onClose={(id) => { setCreating(false); if (id) nav(`/curriculum/${id}`); }} />}
    </div>
  );
}

export function NewCurriculum({ onClose, preset }: { onClose: (id?: string) => void; preset?: string }) {
  const [name, setName] = useState(preset ?? '');
  const [goal, setGoal] = useState('');
  const create = async () => {
    const levels: CurriculumLevel[] = [
      { id: uid(), name: 'Level 1 · First steps', resources: [] },
      { id: uid(), name: 'Level 2 · Going deeper', resources: [] },
      { id: uid(), name: 'Level 3 · Sources & debates', resources: [] },
    ];
    onClose(await saveCurriculum({ name: name.trim(), goal: goal.trim() || undefined, levels, status: 'active' }));
  };
  return (
    <Modal title="New curriculum" onClose={() => onClose()} footer={<><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={create}>Create</button></>}>
      <div className="col gap-12">
        <label className="field">Subject<input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Roman Republic" /></label>
        <label className="field">What do you want to get out of it? (optional)<textarea className="textarea" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Understand why the Republic fell" /></label>
        <p className="small muted">It starts with three empty levels. Rename, add or remove levels any time — and ask the AI for ideas once it’s created.</p>
      </div>
    </Modal>
  );
}

// ── One curriculum ─────────────────────────────────────────────────────

interface Proposal {
  levels: { name: string; why?: string; resources: { title: string; author?: string; kind?: CurriculumResource['kind']; why?: string }[] }[];
}

export default function CurriculumPage() {
  const { id } = useParams();
  const idx = useLibrary();
  const nav = useNavigate();
  const { toast } = useUI();
  const c = idx.snap.curricula.find((x) => x.id === id);
  const [adding, setAdding] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  useConcierge(c ? `Curriculum: ${c.name}` : 'Curriculum', ['What’s missing from this curriculum?', 'Is the order of levels sensible?', 'Which primary sources would fit here?'], () => (c ? describe(c, idx) : ''), [c, idx]);
  if (!c) return <div className="page"><Empty title="Curriculum not found" action={<Link className="btn" to="/library/curricula">All curricula</Link>} /></div>;

  const save = (patch: Partial<Curriculum>) => saveCurriculum({ ...c, ...patch });
  const setLevels = (levels: CurriculumLevel[]) => save({ levels });
  const updLevel = (lid: string, patch: Partial<CurriculumLevel>) => setLevels(c.levels.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => { const ls = [...c.levels]; const j = i + d; if (j < 0 || j >= ls.length) return; [ls[i], ls[j]] = [ls[j], ls[i]]; setLevels(ls); };
  const split = (i: number) => {
    const l = c.levels[i];
    const half = Math.ceil(l.resources.length / 2);
    const a = { ...l, resources: l.resources.slice(0, half) };
    const b: CurriculumLevel = { id: uid(), name: `${l.name} (part 2)`, resources: l.resources.slice(half) };
    setLevels([...c.levels.slice(0, i), a, b, ...c.levels.slice(i + 1)]);
  };
  const merge = (i: number) => {
    const a = c.levels[i];
    const b = c.levels[i + 1];
    if (!b) return;
    setLevels([...c.levels.slice(0, i), { ...a, resources: [...a.resources, ...b.resources], questions: [...(a.questions ?? []), ...(b.questions ?? [])] }, ...c.levels.slice(i + 2)]);
  };
  const p = curriculumProgress(c, idx);

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <Link to="/library/curricula" className="small muted row" style={{ gap: 4 }}><Icon name="chevronLeft" />Curricula</Link>
      <div className="page-head mt-8">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Curriculum</div>
          <h1>{c.name}</h1>
          {c.goal && <div className="sub">{c.goal}</div>}
        </div>
        <button className="btn sm" onClick={() => setEditingMeta(true)}><Icon name="pencil" />Edit</button>
      </div>
      <div className="card">
        <div className="row between small"><b>Overall</b><span className="num">{p.done} of {p.total} done</span></div>
        <ProgressBar value={p.total ? p.done / p.total : 0} />
        <div className="row wrap gap-8 mt-16">
          <Link className="btn sm" to={`/discover/topic/${encodeURIComponent(c.name)}`}><Icon name="compass" />Find books in Discover</Link>
          <Link className="btn sm" to="/knowledge"><Icon name="map" />Knowledge Atlas</Link>
        </div>
      </div>

      <AICollaborator c={c} idx={idx} onAccept={async (levels) => { await setLevels(levels); toast('Added to your curriculum'); }} />

      <div className="col gap-16 mt-16">
        {c.levels.map((l, i) => {
          const lp = levelProgress(l.resources, idx);
          return (
            <div key={l.id} className="card">
              <div className="row between" style={{ gap: 8 }}>
                <Field className="input" style={{ fontWeight: 800, fontSize: 17, border: 0, background: 'transparent', padding: 0, minWidth: 0 }} value={l.name} onSave={(v) => v.trim() && updLevel(l.id, { name: v.trim() })} label="Level name" />
                <LevelMenu first={i === 0} last={i === c.levels.length - 1} onUp={() => move(i, -1)} onDown={() => move(i, 1)} onSplit={() => split(i)} onMerge={() => merge(i)} onDelete={() => { if (!l.resources.length || confirm(`Remove “${l.name}” and its ${l.resources.length} resources?`)) setLevels(c.levels.filter((x) => x.id !== l.id)); }} canSplit={l.resources.length > 1} />
              </div>
              {lp.total > 0 && <><ProgressBar value={lp.done / lp.total} thin /><div className="tiny faint mt-8">{lp.done} of {lp.total} done</div></>}
              <div className="col mt-8" style={{ gap: 6 }}>
                {l.resources.map((r) => <ResourceRow key={r.id} r={r} idx={idx} onChange={(patch) => updLevel(l.id, { resources: l.resources.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) })} onRemove={() => updLevel(l.id, { resources: l.resources.filter((x) => x.id !== r.id) })} />)}
                {!l.resources.length && <div className="small muted">No resources yet.</div>}
              </div>
              {(l.questions ?? []).length > 0 && (
                <div className="mt-16">
                  <div className="eyebrow mb-8">Questions to explore</div>
                  {(l.questions ?? []).map((q, qi) => <div key={qi} className="row small" style={{ gap: 6 }}><Icon name="help" className="faint" /><span className="grow">{q}</span><button className="btn xs ghost" aria-label="Remove question" onClick={() => updLevel(l.id, { questions: (l.questions ?? []).filter((_, k) => k !== qi) })}>✕</button></div>)}
                </div>
              )}
              <div className="row wrap gap-8 mt-16">
                <button className="btn sm" onClick={() => setAdding(l.id)}><Icon name="plus" />Add resource</button>
                <button className="btn sm ghost" onClick={() => { const q = prompt('A question you want this level to answer'); if (q?.trim()) updLevel(l.id, { questions: [...(l.questions ?? []), q.trim()] }); }}><Icon name="help" />Add question</button>
              </div>
            </div>
          );
        })}
        <button className="btn" onClick={() => setLevels([...c.levels, { id: uid(), name: `Level ${c.levels.length + 1}`, resources: [] }])}><Icon name="plus" />Add a level</button>
      </div>

      <div className="card mt-24">
        <div className="eyebrow mb-8">Your synthesis</div>
        <Field multiline className="textarea" rows={4} value={c.synthesis ?? ''} onSave={(v) => save({ synthesis: v })} placeholder="What have you learned so far? What changed your mind?" label="Your synthesis" />
      </div>
      <div className="row wrap gap-8 mt-16">
        <select className="select sm" style={{ width: 'auto' }} value={c.status} onChange={(e) => save({ status: e.target.value as Curriculum['status'] })} aria-label="Curriculum status">
          <option value="active">Active</option><option value="done">Finished</option><option value="archived">Archived</option>
        </select>
        <span className="grow" />
        <button className="btn sm danger" onClick={async () => { if (confirm(`Delete “${c.name}”? Your books stay in your library.`)) { await deleteCurriculum(c.id); nav('/library/curricula'); } }}>Delete curriculum</button>
      </div>

      {adding && <AddResource idx={idx} onClose={async (r) => {
        const lid = adding;
        setAdding(null);
        if (!r) return;
        await updLevel(lid, { resources: [...(c.levels.find((l) => l.id === lid)?.resources ?? []), r] });
        if (r.itemId) await link('curriculum', c.id, 'item', r.itemId, 'includes');
      }} />}
      {editingMeta && (
        <Modal title="Edit curriculum" onClose={() => setEditingMeta(false)} footer={<button className="btn primary" onClick={() => setEditingMeta(false)}>Done</button>}>
          <div className="col gap-12">
            <label className="field">Subject<Field className="input" value={c.name} onSave={(v) => v.trim() && save({ name: v.trim() })} /></label>
            <label className="field">Goal<Field multiline className="textarea" rows={2} value={c.goal ?? ''} onSave={(v) => save({ goal: v })} /></label>
            <label className="field">Notes<Field multiline className="textarea" rows={3} value={c.description ?? ''} onSave={(v) => save({ description: v })} /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function describe(c: Curriculum, idx: LibraryIndex): string {
  return [`CURRICULUM: ${c.name}${c.goal ? ` — goal: ${c.goal}` : ''}`, ...c.levels.map((l, i) => `Level ${i + 1}: ${l.name}\n${l.resources.map((r) => `  - ${r.title}${r.author ? ` (${r.author})` : ''} [${effectiveStatus(r, idx)}]`).join('\n') || '  (empty)'}${l.questions?.length ? `\n  Questions: ${l.questions.join('; ')}` : ''}`)].join('\n');
}

function LevelMenu({ first, last, canSplit, onUp, onDown, onSplit, onMerge, onDelete }: { first: boolean; last: boolean; canSplit: boolean; onUp: () => void; onDown: () => void; onSplit: () => void; onMerge: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button className="btn icon sm ghost" onClick={() => setOpen((v) => !v)} aria-label="Level options"><Icon name="dots" /></button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="list-card" style={{ position: 'absolute', right: 0, top: 36, zIndex: 21, width: 200, boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(0,0,0,.2))' }}>
            {([['Move up', onUp, first], ['Move down', onDown, last], ['Split in two', onSplit, !canSplit], ['Merge with next', onMerge, last], ['Remove level', onDelete, false]] as [string, () => void, boolean][]).map(([label, fn, disabled]) => (
              <button key={label} className="li" disabled={disabled} style={{ opacity: disabled ? 0.4 : 1 }} onClick={() => { setOpen(false); fn(); }}><span className="li-title" style={{ textTransform: 'none' }}>{label}</span></button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ResourceRow({ r, idx, onChange, onRemove }: { r: CurriculumResource; idx: LibraryIndex; onChange: (p: Partial<CurriculumResource>) => void; onRemove: () => void }) {
  const item = r.itemId ? idx.items.get(r.itemId) : undefined;
  const st = effectiveStatus(r, idx);
  return (
    <div className="row" style={{ gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      {item ? <Link to={`/item/${item.id}`}><Cover item={item} width={30} /></Link> : <span className="li-ico" style={{ width: 30, height: 42, background: 'var(--surface-2)', borderRadius: 6, display: 'grid', placeItems: 'center' }}>{r.kind === 'primary' ? '📜' : r.kind === 'article' ? '📰' : '📘'}</span>}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small clamp-2" style={{ fontWeight: 700 }}>{item ? <Link to={`/item/${item.id}`}>{r.title}</Link> : r.title}</div>
        <div className="tiny faint">{[r.author, r.kind === 'primary' ? 'primary source' : r.kind !== 'book' ? r.kind : '', item ? 'in your library' : ''].filter(Boolean).join(' · ')}</div>
        {r.why && <div className="tiny muted">{r.source === 'ai' && <AIBadge label="AI" />} {r.why}</div>}
        <select className="select sm mt-8" style={{ width: 'auto' }} value={st} onChange={(e) => onChange({ status: e.target.value as ResourceStatus })} aria-label={`Status of ${r.title}`}>
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <button className="btn xs ghost" style={{ alignSelf: 'flex-start' }} onClick={onRemove} aria-label={`Remove ${r.title}`}>✕</button>
    </div>
  );
}

function AddResource({ idx, onClose }: { idx: LibraryIndex; onClose: (r?: CurriculumResource) => void }) {
  const [mode, setMode] = useState<'library' | 'other'>('library');
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [kind, setKind] = useState<CurriculumResource['kind']>('book');
  const items = idx.itemList().filter((i) => !q || `${i.title} ${idx.authorLine(i)}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Modal title="Add a resource" onClose={() => onClose()} footer={mode === 'other' ? <button className="btn primary" disabled={!title.trim()} onClick={() => onClose({ id: uid(), title: title.trim(), author: author.trim() || undefined, kind, status: 'not-started', source: 'user' })}>Add</button> : undefined}>
      <div className="col gap-12">
        <div className="btn-group"><button className={mode === 'library' ? 'on' : ''} onClick={() => setMode('library')}>From my library</button><button className={mode === 'other' ? 'on' : ''} onClick={() => setMode('other')}>Something else</button></div>
        {mode === 'library' ? (
          <>
            <input className="input" autoFocus placeholder="Search your books…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="col" style={{ gap: 4, maxHeight: '45vh', overflowY: 'auto' }}>
              {items.map((i) => (
                <button key={i.id} className="rabbit-node" onClick={() => onClose({ id: uid(), itemId: i.id, title: i.title, author: idx.authorLine(i), kind: 'book', status: 'not-started', source: 'user' })}>
                  <span className="row" style={{ gap: 10, minWidth: 0 }}><Cover item={i} width={26} /><span className="ellipsis small">{i.title}</span></span>
                </button>
              ))}
              {!items.length && <div className="small muted">No matching books.</div>}
            </div>
          </>
        ) : (
          <>
            <label className="field">Title<input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field">Author (optional)<input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
            <label className="field">Kind<select className="select" value={kind} onChange={(e) => setKind(e.target.value as CurriculumResource['kind'])}><option value="book">Book</option><option value="primary">Primary source</option><option value="article">Article</option><option value="other">Other</option></select></label>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The AI proposes; you choose what goes in. */
function AICollaborator({ c, idx, onAccept }: { c: Curriculum; idx: LibraryIndex; onAccept: (levels: CurriculumLevel[]) => Promise<void> }) {
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const [ask, setAsk] = useState('');
  const [prop, setProp] = useState<Proposal | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!ready) return <div className="notice small mt-16">Turn on AI in Settings to get suggestions for levels and books. You can build everything yourself either way.</div>;
  const library = idx.itemList().slice(0, 120).map((i) => `- ${i.title} (${idx.authorLine(i)})`).join('\n');
  const go = async (request: string) => {
    const r = await run((signal) => completeJSON<Proposal>({
      system: `${BASE_SYSTEM}\nYou help the reader build their own curriculum. Propose; never assume acceptance. Return JSON {"levels":[{"name":"level name (existing name if adding to it)","why":"one line","resources":[{"title":"...","author":"...","kind":"book|primary|article|other","why":"one line"}]}]}. Only suggest real, well-known works; prefer ones already in the reader's library when they fit. Include primary sources where relevant. Keep it to at most 4 levels and 5 resources per level.`,
      messages: [{ role: 'user', content: `${describe(c, idx)}\n\nTHE READER'S LIBRARY:\n${library}\n\nREQUEST: ${request}` }],
      maxTokens: 1800,
    }, signal));
    if (r) { setProp(r.data); setPicked(new Set(r.data.levels.flatMap((l, li) => l.resources.map((_, ri) => `${li}:${ri}`)))); }
  };
  const accept = async () => {
    if (!prop) return;
    const levels = [...c.levels];
    prop.levels.forEach((pl, li) => {
      const res = pl.resources.filter((_, ri) => picked.has(`${li}:${ri}`)).map((r): CurriculumResource => {
        const own = idx.itemList().find((i) => i.title.toLowerCase() === r.title.toLowerCase());
        return { id: uid(), itemId: own?.id, title: own?.title ?? r.title, author: r.author, kind: r.kind ?? 'book', status: 'not-started', why: r.why, source: 'ai' };
      });
      if (!res.length) return;
      const existing = levels.findIndex((l) => l.name.toLowerCase() === pl.name.toLowerCase());
      if (existing >= 0) levels[existing] = { ...levels[existing], resources: [...levels[existing].resources, ...res] };
      else levels.push({ id: uid(), name: pl.name, description: pl.why, resources: res });
    });
    await onAccept(levels);
    setProp(null);
  };
  return (
    <div className="card mt-16" style={{ borderColor: 'var(--ai-soft)' }}>
      <div className="row gap-8"><Icon name="sparkle" /><b>Build it with AI</b></div>
      <div className="small muted mt-8">The AI sees this curriculum’s structure and your library’s titles. It only suggests — you pick what to add.</div>
      <div className="row wrap gap-8 mt-8">
        {['Suggest a first draft', 'What’s missing?', 'Add primary sources', 'Add an opposing view'].map((q) => <button key={q} className="chip ai" disabled={loading} onClick={() => go(q)}>{q}</button>)}
      </div>
      <form className="row mt-8" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) go(ask.trim()); }}>
        <input className="input" style={{ borderRadius: 999 }} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. Make level 2 more about the army" aria-label="Ask the AI about this curriculum" />
        <button className="btn ai-solid icon round" disabled={loading || !ask.trim()} aria-label="Ask"><Icon name="send" /></button>
      </form>
      {loading && <div className="small faint mt-8">Thinking…</div>}
      <AIErrorNotice error={error} />
      {prop && (
        <div className="col gap-12 mt-16">
          <div className="row between"><AIBadge label="AI proposal" /><button className="btn xs ghost" onClick={() => setProp(null)}>Dismiss</button></div>
          {prop.levels.map((l, li) => (
            <div key={li}>
              <div className="small" style={{ fontWeight: 800 }}>{l.name}</div>
              {l.why && <div className="tiny faint">{l.why}</div>}
              {l.resources.map((r, ri) => {
                const k = `${li}:${ri}`;
                const own = idx.itemList().some((i) => i.title.toLowerCase() === r.title.toLowerCase());
                return (
                  <label key={k} className="row top small" style={{ gap: 8, padding: '5px 0' }}>
                    <input type="checkbox" checked={picked.has(k)} onChange={() => setPicked((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; })} />
                    <span><b>{r.title}</b>{r.author ? ` — ${r.author}` : ''} {own && <span className="chip good" style={{ minHeight: 18, fontSize: 10 }}>in your library</span>}{r.kind === 'primary' && <span className="chip" style={{ minHeight: 18, fontSize: 10 }}>primary source</span>}<br /><span className="tiny faint">{r.why}</span></span>
                  </label>
                );
              })}
            </div>
          ))}
          <button className="btn primary" disabled={!picked.size} onClick={accept}>Add {picked.size} selected</button>
        </div>
      )}
    </div>
  );
}

/** A text field that saves when you leave it (so typing is never interrupted). */
function Field({ value, onSave, multiline, label, ...rest }: { value: string; onSave: (v: string) => void; multiline?: boolean; label?: string; className?: string; style?: React.CSSProperties; rows?: number; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setV(value); }, [value, focused]);
  const common = { ...rest, value: v, 'aria-label': label, onFocus: () => setFocused(true), onBlur: () => { setFocused(false); if (v !== value) onSave(v); } };
  return multiline
    ? <textarea {...common} onChange={(e) => setV(e.target.value)} />
    : <input {...common} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
