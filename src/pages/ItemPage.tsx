import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM, itemContext, noteLine, SPOILER_LEVELS, type SpoilerLevel } from '../ai/context';
import { AIErrorNotice, AIOff, AIPanel, SharedPreview, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { BarChart, LineChart } from '../components/charts';
import { AIBadge, Cover, DeadlineChip, Empty, FolderPicker, Markdown, Modal, ProgressBar, Segmented, Stars, STATUS_LABEL, StatusChip, TagInput, Tabs } from '../components/common';
import { NoteCard } from '../components/notes';
import { deleteItem, deleteSession, link, saveAIRecord, saveConcept, setPosition, setStatus, startReread, startTimer, unlink, updateInstance, updateItem, updateItemAuthors, updateItemTags } from '../db/actions';
import type { ContentType, Item, Status, UnitKind } from '../db/types';
import { formatKey, formatYear, isValidKey } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { CONTENT_TYPES, contentLabel, fmtDuration, fmtNum, fmtUnits, round, toBase, toDisplay, unitLabel, UNITS } from '../engine/units';
import { useEbookIds, useLibrary } from '../state/library';
import { attachEpub, isEpub, removeEbookFile } from '../lib/ebooks';
import { useUI } from '../state/ui';

type Tab = 'overview' | 'notes' | 'sessions' | 'readings' | 'ai' | 'edit';

export default function ItemPage() {
  const { id } = useParams();
  const idx = useLibrary();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'overview');
  const item = idx.items.get(id!);
  useConcierge(`Book: ${item?.title ?? ''}`, ['What should I know before starting?', 'What is the historical context?', 'What should I read before this?', 'What should I pay attention to?'], () => (item ? itemContext(idx, item, idx.settings.ai.share, 'read') : ''), [idx, id]);
  if (!item) return <div className="page"><Empty title="Item not found" icon="❓" action={<Link className="btn" to="/library">Back to library</Link>}>It may have been deleted.</Empty></div>;
  const notes = idx.notesByItem.get(item.id) ?? [];
  const instances = idx.instancesByItem.get(item.id) ?? [];
  return (
    <div className="page">
      <Header idx={idx} item={item} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'notes', label: `Notes & quotes${notes.length ? ` (${notes.length})` : ''}` },
          { id: 'sessions', label: 'Sessions' },
          { id: 'readings', label: `Readings${instances.length > 1 ? ` (${instances.length})` : ''}` },
          { id: 'ai', label: '✦ Ask AI' },
          { id: 'edit', label: 'Edit' },
        ]}
      />
      {tab === 'overview' && <Overview idx={idx} item={item} />}
      {tab === 'notes' && <NotesTab idx={idx} item={item} />}
      {tab === 'sessions' && <SessionsTab idx={idx} item={item} />}
      {tab === 'readings' && <ReadingsTab idx={idx} item={item} />}
      {tab === 'ai' && <BookAI idx={idx} item={item} />}
      {tab === 'edit' && <EditTab idx={idx} item={item} />}
    </div>
  );
}

function Header({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const { open, toast } = useUI();
  const nav = useNavigate();
  const hasFile = useEbookIds().has(item.id);
  const f = itemForecast(idx, item);
  const inst = idx.currentInstance(item);
  return (
    <div className="row top gap-24 mb-16 wrap">
      <Cover item={item} width={150} author={idx.authorLine(item)} />
      <div className="grow col" style={{ minWidth: 260 }}>
        <div className="small muted">{contentLabel(item)}{item.publishedYear !== undefined ? ` · ${formatYear(item.publishedYear)}` : ''}{item.series ? ` · ${item.series}` : ''}</div>
        <h1 style={{ fontSize: 32 }}>{item.title}</h1>
        {item.subtitle && <div className="serif muted" style={{ fontSize: 18 }}>{item.subtitle}</div>}
        <div className="row wrap">
          {item.authorIds.map((a) => <Link key={a} to={`/author/${a}`} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{idx.authors.get(a)?.name}</Link>)}
          {!item.authorIds.length && <span className="muted">Unknown author</span>}
        </div>
        <div className="row wrap mt-8">
          <StatusChip status={item.status} />
          {inst && inst.number > 1 && <span className="chip">Reading #{inst.number}</span>}
          <Stars value={inst?.rating} onChange={inst ? (v) => updateInstance(inst.id, { rating: v }) : undefined} />
          <button className={`chip ${item.favorite ? 'on' : ''}`} onClick={() => updateItem(item.id, { favorite: !item.favorite })}>♥ {item.favorite ? 'Favorite' : 'Favorite?'}</button>
          {item.folderIds.map((fid) => <Link key={fid} to={`/library/folder/${fid}`} className="chip">📁 {idx.folders.get(fid)?.name}</Link>)}
          {item.tagIds.map((t) => <Link key={t} to={`/library?tag=${t}`} className="chip"># {idx.tags.get(t)?.name}</Link>)}
        </div>
        {f.total ? (
          <div className="mt-8" style={{ maxWidth: 520 }}>
            <div className="row between small"><span className="num">{fmtNum(toDisplay(item, f.completed), 1)} / {fmtUnits(item, f.total)}</span><b>{Math.round((f.percent ?? 0) * 100)}%</b></div>
            <ProgressBar value={f.percent} />
          </div>
        ) : <div className="small muted">Length unknown — add it in Edit to unlock forecasts.</div>}
        <div className="row wrap mt-8">
          {hasFile && <button className="btn accent" onClick={() => nav(`/read/${item.id}`)}>📖 {idx.position(item) > 0 ? 'Continue reading' : 'Read'}</button>}
          {item.status !== 'read' && <button className={`btn ${hasFile ? '' : 'primary'}`} onClick={() => open({ kind: 'log', itemId: item.id })}>Log reading</button>}
          {item.status !== 'read' && <button className="btn" onClick={async () => { await startTimer(item.id); toast('Timer started'); }}>⏱ Timer</button>}
          <button className="btn" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'note' })}>✎ Note</button>
          <button className="btn" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'quote' })}>❝ Quote</button>
          <select className="select" style={{ width: 150 }} value={item.status} onChange={async (e) => {
            const s = e.target.value as Status;
            const prev = item.status;
            await setStatus(item.id, s);
            if (s === 'read') open({ kind: 'complete', itemId: item.id });
            else toast(`Moved to ${STATUS_LABEL[s]}`, { undo: () => setStatus(item.id, prev) });
          }}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {item.status === 'read' && <button className="btn" onClick={async () => { await startReread(item.id); toast('Started a new reading — your earlier history is kept.'); }}>↻ Reread</button>}
        </div>
        <div className="row wrap small">
          <label className="btn xs ghost" style={{ cursor: 'pointer' }}>
            {hasFile ? '↻ Replace ePub file' : '📎 Attach ePub file'}
            <input type="file" accept=".epub,application/epub+zip" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (!isEpub(f)) return toast('That isn’t an ePub file.', { error: true });
              await attachEpub(item.id, f, f.name);
              toast('ePub attached — tap Read to open it');
            }} />
          </label>
          {hasFile && <button className="btn xs ghost" onClick={async () => { if (confirm('Remove the ePub file from this phone? Your progress and notes stay.')) { await removeEbookFile(item.id); toast('File removed'); } }}>Remove file</button>}
        </div>
      </div>
    </div>
  );
}

function Overview({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const f = itemForecast(idx, item);
  const inst = idx.currentInstance(item);
  const u = unitLabel(item);
  const [chart, setChart] = useState<'line' | 'area' | 'bar'>('area');
  const ss = inst ? idx.sessionsByInstance.get(inst.id) ?? [] : [];
  const progress = useMemo(() => {
    const byDay = new Map<string, number>();
    let pos = 0;
    for (const s of ss) { pos = Math.max(pos + s.amount, s.to ?? 0); byDay.set(s.date, pos); }
    return [...byDay.entries()].map(([x, y]) => ({ x, y: f.total ? Math.min(100, (y / f.total) * 100) : toDisplay(item, y) }));
  }, [ss, f.total, item]);
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ss) m.set(s.date, (m.get(s.date) ?? 0) + toDisplay(item, s.amount));
    return [...m.entries()].map(([label, value]) => ({ label: label.slice(5), title: formatKey(label), value }));
  }, [ss, item]);
  const concepts = idx.snap.links.filter((l) => (l.fromType === 'item' && l.fromId === item.id && l.toType === 'concept') || (l.toType === 'item' && l.toId === item.id && l.fromType === 'concept'));
  const avgSession = ss.filter((s) => s.durationSec).length ? ss.reduce((a, s) => a + (s.durationSec ?? 0), 0) / ss.filter((s) => s.durationSec).length : undefined;
  return (
    <div className="grid c3">
      <div className="card span-2">
        <div className="card-head"><h3>Forecast</h3>{item.deadline ? <DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} /> : <span className="chip">No deadline yet</span>}</div>
        <div className="stats-row">
          <Stat label="Remaining" value={f.remaining !== undefined ? fmtNum(toDisplay(item, f.remaining), 1) : '—'} hint={u} />
          <Stat label="Current pace" value={f.currentPace ? fmtNum(toDisplay(item, f.currentPace), 1) : '—'} hint={`${u}/day (last ${idx.settings.paceWindowDays} days)`} />
          <Stat label="Average pace" value={f.averagePace ? fmtNum(toDisplay(item, f.averagePace), 1) : '—'} hint={`${u}/day since start`} />
          <Stat label="Required pace" value={f.requiredPace !== undefined ? fmtNum(toDisplay(item, f.requiredPace), 1) : '—'} hint={item.deadline ? `${u}/day to finish by ${formatKey(item.deadline)}` : 'set a deadline'} />
          <Stat label="Reading days left" value={f.readingDaysRemaining !== undefined ? fmtNum(f.readingDaysRemaining, 2) : '—'} hint={f.paceSource === 'default' ? 'using default pace' : f.paceSource === 'target' ? 'using your target' : ''} />
          <Stat label="Estimated finish" value={item.status === 'read' ? 'Finished' : f.estimatedFinish ? formatKey(f.estimatedFinish) : '—'} small />
          <Stat label="Time remaining" value={f.timeRemainingSec ? fmtDuration(f.timeRemainingSec) : '—'} hint={f.speedPerHour ? `at ${fmtNum(toDisplay(item, f.speedPerHour))} ${u}/hour` : 'time a session to measure speed'} />
        </div>
        {item.deadline && f.status === 'behind' && f.requiredPace && f.pace && <div className="notice warn mt-16">To finish by {formatKey(item.deadline)} you need about <b>{fmtNum(toDisplay(item, f.requiredPace), 1)} {u}/day</b> — {fmtNum(toDisplay(item, f.requiredPace - f.pace), 1)} more than your current pace.</div>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Details</h3></div>
        <dl className="kv">
          <dt>Type</dt><dd>{contentLabel(item)}</dd>
          <dt>Length</dt><dd>{item.total ? fmtUnits(item, item.total) : '—'}</dd>
          {item.pageCount && item.unit !== 'pages' ? <><dt>Print pages</dt><dd>{item.pageCount}</dd></> : null}
          <dt>Started</dt><dd>{formatKey(f.startedOn)}</dd>
          <dt>Finished</dt><dd>{formatKey(f.finishedOn)}</dd>
          <dt>Deadline</dt><dd>{item.deadline ? formatKey(item.deadline) : 'No deadline yet'}</dd>
          <dt>Daily target</dt><dd>{item.dailyTarget ? fmtUnits(item, item.dailyTarget) : '—'}</dd>
          <dt>Published</dt><dd>{formatYear(item.publishedYear)}</dd>
          {item.histStart !== undefined && <><dt>Covers</dt><dd>{formatYear(item.histStart)}{item.histEnd !== undefined ? ` – ${formatYear(item.histEnd)}` : ''}</dd></>}
          {item.publisher && <><dt>Publisher</dt><dd className="ellipsis">{item.publisher}</dd></>}
          {item.isbn && <><dt>ISBN</dt><dd>{item.isbn}</dd></>}
          {item.genres.length > 0 && <><dt>Genres</dt><dd className="ellipsis">{item.genres.join(', ')}</dd></>}
        </dl>
      </div>
      <div className="card span-2">
        <div className="card-head">
          <h3>Progress over time</h3>
          <Segmented size="sm" value={chart} onChange={setChart} options={[{ value: 'area', label: 'Area' }, { value: 'line', label: 'Line' }, { value: 'bar', label: 'Daily' }]} />
        </div>
        {ss.length === 0 ? <div className="empty small">Log a session and your progress curve will appear here.</div> : chart === 'bar' ? (
          <BarChart data={daily} format={(v) => fmtNum(v, 1)} />
        ) : (
          <LineChart series={[{ name: 'Progress', points: progress }]} area={chart === 'area'} yMax={f.total ? 100 : undefined} format={(v) => (f.total ? `${Math.round(v)}%` : fmtNum(v))} xFormat={(x) => formatKey(x, idx.today, { short: true })} markers={progress.length < 25} />
        )}
      </div>
      <div className="card">
        <div className="card-head"><h3>Statistics</h3><span className="small faint">this reading</span></div>
        <dl className="kv">
          <dt>Sessions</dt><dd>{f.sessionCount}</dd>
          <dt>Total time</dt><dd>{f.totalTimeSec ? fmtDuration(f.totalTimeSec) : '—'}</dd>
          <dt>{u[0].toUpperCase() + u.slice(1)} read</dt><dd>{fmtNum(toDisplay(item, ss.reduce((a, s) => a + s.amount, 0)), 1)}</dd>
          <dt>{u}/hour</dt><dd>{f.speedPerHour ? fmtNum(toDisplay(item, f.speedPerHour)) : '—'}</dd>
          <dt>Avg session</dt><dd>{avgSession ? fmtDuration(avgSession) : '—'}</dd>
        </dl>
      </div>
      {item.description && <div className="card span-2"><div className="card-head"><h3>About</h3></div><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p></div>}
      <div className="card">
        <div className="card-head"><h3>Concepts</h3><ConceptLinker idx={idx} item={item} /></div>
        {concepts.length === 0 ? <div className="small muted">Link people, places, events or ideas this item covers.</div> : (
          <div className="row wrap gap-4">
            {concepts.map((l) => {
              const cid = l.fromType === 'concept' ? l.fromId : l.toId;
              const c = idx.concepts.get(cid);
              return c ? <span key={l.id} className={`chip ${l.source === 'ai' ? 'ai' : ''}`}><Link to={`/knowledge/concept/${c.id}`}>{c.name}</Link><span className="x" onClick={() => unlink(l.id)}>✕</span></span> : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, small }: { label: string; value: string; hint?: string; small?: boolean }) {
  return <div className="stat"><span className="label">{label}</span><span className="value" style={small ? { fontSize: 17 } : undefined}>{value}</span>{hint && <span className="hint">{hint}</span>}</div>;
}

function ConceptLinker({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'concept' | 'person' | 'place' | 'event' | 'period' | 'subject'>('concept');
  if (!open) return <button className="btn xs" onClick={() => setOpen(true)}>＋ Link</button>;
  const sugg = name ? idx.snap.concepts.filter((c) => c.name.toLowerCase().includes(name.toLowerCase())).slice(0, 5) : [];
  const add = async (id?: string) => {
    const cid = id ?? (await saveConcept({ name, kind }));
    await link('concept', cid, 'item', item.id);
    setName('');
    setOpen(false);
  };
  return (
    <Modal title="Link a concept" onClose={() => setOpen(false)} footer={<button className="btn primary" disabled={!name.trim()} onClick={() => add()}>Create & link</button>}>
      <div className="col">
        <input autoFocus className="input" placeholder="e.g. Cicero, the Senate, Carthage…" value={name} onChange={(e) => setName(e.target.value)} />
        {sugg.map((c) => <button key={c.id} className="rabbit-node" onClick={() => add(c.id)}>{c.name}<span className="faint small">{c.kind} · link</span></button>)}
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {['concept', 'person', 'place', 'event', 'period', 'subject'].map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
    </Modal>
  );
}

function NotesTab({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const { open } = useUI();
  const [kind, setKind] = useState<'all' | 'note' | 'quote'>('all');
  const notes = (idx.notesByItem.get(item.id) ?? []).filter((n) => kind === 'all' || n.kind === kind).sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || a.createdAt - b.createdAt);
  const ready = useAIReady();
  return (
    <div className="col gap-16">
      <div className="row wrap">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'note', label: 'Notes' }, { value: 'quote', label: 'Quotes' }]} />
        <span className="grow" />
        <button className="btn" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'note' })}>✎ Add note</button>
        <button className="btn" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'quote' })}>❝ Add quote</button>
      </div>
      {notes.length === 0 ? <div className="card"><Empty icon="✎" title="No notes yet">Your notes and quotes will appear here as you read.</Empty></div> : (
        <div className="grid c2">{notes.map((n) => <NoteCard key={n.id} note={n} idx={idx} hideItem />)}</div>
      )}
      {(idx.notesByItem.get(item.id) ?? []).length >= 3 && (
        <div className="card">
          <div className="card-head"><h3>✦ Organize these notes</h3><AIBadge label="Optional" /></div>
          {ready ? <NotesOrganizer idx={idx} item={item} /> : <AIOff compact />}
        </div>
      )}
    </div>
  );
}

interface Grouping { groups: { name: string; summary: string; noteIds: string[] }[] }

export function NotesOrganizer({ idx, item }: { idx: LibraryIndex; item?: Item }) {
  const { toast } = useUI();
  const { loading, error, run } = useAICall();
  const [res, setRes] = useState<Grouping | null>(null);
  const notes = item ? idx.notesByItem.get(item.id) ?? [] : idx.snap.notes;
  const req = {
    system: BASE_SYSTEM,
    messages: [{ role: 'user' as const, content: `Group the reader's notes below into 3–8 thematic categories (e.g. politics, key arguments, major figures). Use only note ids given. Every note id at most once. Return JSON: {"groups":[{"name":"...","summary":"one sentence","noteIds":["..."]}]}\n\n${item ? `BOOK: ${item.title}\n` : ''}NOTES:\n${notes.slice(0, 150).map(noteLine).join('\n')}` }],
    maxTokens: 2500,
  };
  return (
    <div className="col gap-12">
      <p className="small muted">The AI suggests categories. Your original notes are never changed; you can keep or discard the grouping.</p>
      <div className="row">
        <button className="btn ai" disabled={loading} onClick={async () => { const r = await run((s) => completeJSON<Grouping>(req, s)); if (r) setRes({ groups: (r.data.groups ?? []).map((g) => ({ ...g, noteIds: g.noteIds.filter((id) => notes.some((n) => n.id === id)) })) }); }}>{loading ? 'Organizing…' : '✦ Suggest categories'}</button>
        {res && <button className="btn sm" onClick={async () => { await saveAIRecord({ kind: 'notes-organization', title: `Note categories${item ? ` — ${item.title}` : ''}`, content: res.groups.map((g) => `**${g.name}** — ${g.summary}`).join('\n'), data: res, scope: item ? { type: 'item', id: item.id } : { type: 'library' } }); toast('Saved to AI notebook'); }}>Keep</button>}
      </div>
      <SharedPreview req={req} />
      <AIErrorNotice error={error} />
      {res && (
        <div className="col gap-12">
          <AIBadge />
          {res.groups.map((g) => (
            <div key={g.name} className="notice ai">
              <b>{g.name}</b> <span className="small muted">— {g.summary}</span>
              <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {g.noteIds.map((id) => <li key={id}>{notes.find((n) => n.id === id)?.text.slice(0, 160)}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionsTab({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const { toast } = useUI();
  const ss = [...(idx.sessionsByItem.get(item.id) ?? [])].reverse();
  const [pos, setPos] = useState('');
  return (
    <div className="col gap-16">
      <div className="card row wrap">
        <span className="small muted">Correct the current position without logging reading:</span>
        <input className="input sm" style={{ width: 110 }} type="number" placeholder={String(round(toDisplay(item, idx.position(item)), 1))} value={pos} onChange={(e) => setPos(e.target.value)} />
        <button className="btn sm" disabled={!pos} onClick={async () => { await setPosition(item.id, toBase(item, Number(pos))); setPos(''); toast('Position updated'); }}>Set position</button>
      </div>
      {ss.length === 0 ? <div className="card"><Empty icon="⏱" title="No sessions yet">Log reading or use the timer — every session is saved here.</Empty></div> : (
        <div className="card flat table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Date</th><th>Time</th><th className="r">Amount</th><th>Range</th><th className="r">Duration</th><th className="r">Speed</th><th>Reading</th><th>Note</th><th /></tr></thead>
            <tbody>
              {ss.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{formatKey(s.date, idx.today, { short: true })}</td>
                  <td className="small faint">{new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="r num">{fmtUnits(item, s.amount)}</td>
                  <td className="small faint num">{s.from !== undefined && s.to !== undefined ? `${fmtNum(toDisplay(item, s.from), 1)}–${fmtNum(toDisplay(item, s.to), 1)}` : ''}</td>
                  <td className="r num">{s.durationSec ? fmtDuration(s.durationSec) : '—'}</td>
                  <td className="r num small">{s.durationSec && s.durationSec >= 60 && s.amount ? `${fmtNum(toDisplay(item, s.amount / (s.durationSec / 3600)))}/h` : ''}</td>
                  <td className="small">#{idx.instances.get(s.instanceId)?.number ?? '?'}</td>
                  <td className="small ellipsis" style={{ maxWidth: 200 }}>{s.note}</td>
                  <td><button className="btn xs ghost" onClick={async () => { if (confirm('Delete this session? Statistics will be recalculated.')) { await deleteSession(s.id); toast('Session deleted'); } }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReadingsTab({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const instances = idx.instancesByItem.get(item.id) ?? [];
  const rows = instances.map((ins) => {
    const ss = idx.sessionsByInstance.get(ins.id) ?? [];
    const notes = (idx.notesByItem.get(item.id) ?? []).filter((n) => n.instanceId === ins.id);
    const sec = ss.reduce((a, s) => a + (s.durationSec ?? 0), 0);
    const timed = ss.filter((s) => s.durationSec).reduce((a, s) => a + s.amount, 0);
    const days = ins.startedOn && ins.finishedOn ? Math.round((new Date(ins.finishedOn).getTime() - new Date(ins.startedOn).getTime()) / 86400000) + 1 : undefined;
    return { ins, sessions: ss.length, notes: notes.filter((n) => n.kind === 'note').length, quotes: notes.filter((n) => n.kind === 'quote').length, sec, speed: sec >= 300 ? timed / (sec / 3600) : undefined, days };
  });
  const ready = useAIReady();
  return (
    <div className="col gap-16">
      <div className="grid auto">
        {rows.map((r) => (
          <div key={r.ins.id} className="card">
            <div className="card-head"><h3>Reading #{r.ins.number}</h3><StatusChip status={r.ins.status} /></div>
            <dl className="kv">
              <dt>Started</dt><dd>{formatKey(r.ins.startedOn)}</dd>
              <dt>Finished</dt><dd>{formatKey(r.ins.finishedOn)}</dd>
              <dt>Days</dt><dd>{r.days ?? '—'}</dd>
              <dt>Sessions</dt><dd>{r.sessions}</dd>
              <dt>Time</dt><dd>{r.sec ? fmtDuration(r.sec) : '—'}</dd>
              <dt>Speed</dt><dd>{r.speed ? `${fmtNum(toDisplay(item, r.speed))} ${unitLabel(item)}/h` : '—'}</dd>
              <dt>Notes / quotes</dt><dd>{r.notes} / {r.quotes}</dd>
            </dl>
            <div className="mt-8"><Stars value={r.ins.rating} onChange={(v) => updateInstance(r.ins.id, { rating: v })} /></div>
            <ReviewEditor value={r.ins.review} onSave={(v) => updateInstance(r.ins.id, { review: v || undefined })} />
          </div>
        ))}
      </div>
      {instances.length > 1 && (
        <div className="card">
          <div className="card-head"><h3>✦ Rereading intelligence</h3></div>
          {ready ? (
            <AIPanel kind="reread" title={`Rereading comparison — ${item.title}`} scope={{ type: 'item', id: item.id }} buttonLabel="Compare my readings" build={() => ({
              system: BASE_SYSTEM,
              messages: [{ role: 'user', content: `Compare the reader's separate readings of "${item.title}". Only draw conclusions supported by these recorded numbers and notes; if the data is thin, say so.\n\n${rows.map((r) => `Reading #${r.ins.number}: started ${r.ins.startedOn ?? '?'}, finished ${r.ins.finishedOn ?? 'not finished'}, ${r.days ?? '?'} days, rating ${r.ins.rating ?? 'none'}, ${r.sessions} sessions, ${r.sec ? Math.round(r.sec / 60) : 0} minutes, speed ${r.speed ? Math.round(r.speed) : 'n/a'} ${unitLabel(item)}/h, ${r.notes} notes, ${r.quotes} quotes.${idx.settings.ai.share.reviews && r.ins.review ? ` Review: ${r.ins.review.slice(0, 600)}` : ''}${idx.settings.ai.share.notes ? `\nNotes: ${(idx.notesByItem.get(item.id) ?? []).filter((n) => n.instanceId === r.ins.id).slice(0, 25).map((n) => n.text.slice(0, 200)).join(' | ')}` : ''}`).join('\n\n')}` }],
            })} />
          ) : <AIOff compact />}
        </div>
      )}
    </div>
  );
}

function ReviewEditor({ value, onSave }: { value?: string; onSave: (v: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(value ?? '');
  if (!edit) return value ? <div className="mt-8"><div className="small muted">Review</div><Markdown text={value} /><button className="btn xs ghost" onClick={() => setEdit(true)}>Edit review</button></div> : <button className="btn xs mt-8" onClick={() => setEdit(true)}>Write a review</button>;
  return (
    <div className="col mt-8">
      <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row"><button className="btn sm primary" onClick={() => { onSave(text.trim()); setEdit(false); }}>Save</button><button className="btn sm" onClick={() => setEdit(false)}>Cancel</button></div>
    </div>
  );
}

function BookAI({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const [spoiler, setSpoiler] = useState<SpoilerLevel>('read');
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('What should I know before starting?');
  const share = idx.settings.ai.share;
  const f = itemForecast(idx, item);
  return (
    <div className="grid c2">
      <div className="card">
        <div className="card-head"><h3>Ask about this {contentLabel(item).toLowerCase()}</h3></div>
        <div className="small muted mb-8">🛡 Spoiler shield</div>
        <div className="row wrap gap-4 mb-16">
          {SPOILER_LEVELS.map((s) => <button key={s.id} className={`chip ${spoiler === s.id ? 'on' : ''}`} onClick={() => setSpoiler(s.id)}>{s.icon} {s.label}</button>)}
        </div>
        <div className="row wrap gap-4 mb-8">
          {['What should I know before starting?', 'What is the historical context?', 'What should I pay attention to?', "What are the author's main arguments?", 'What should I read before this?'].map((s) => <button key={s} className={`chip ${asked === s ? 'accent' : ''}`} onClick={() => { setAsked(s); setQ(''); }}>{s}</button>)}
        </div>
        <input className="input mb-8" placeholder="Or ask your own question…" value={q} onChange={(e) => setQ(e.target.value)} />
        <AIPanel key={asked + q + spoiler} kind="book-qa" title={`${item.title}: ${q || asked}`} scope={{ type: 'item', id: item.id }} buttonLabel="Ask" build={() => ({
          system: `${BASE_SYSTEM}\nYou have NOT read the full text of this book; rely on general knowledge, the metadata and the reader's notes, and say so where it matters. Obey the SPOILER BOUNDARY strictly.`,
          messages: [{ role: 'user', content: `${itemContext(idx, item, share, spoiler)}\n\nQUESTION: ${q || asked}` }],
        })} />
      </div>
      <div className="card">
        <div className="card-head"><h3>What did I learn?</h3></div>
        {(f.percent ?? 0) < 0.5 && item.status !== 'read' ? <p className="small muted">Available once you’re well into this book — it summarizes your own notes, quotes, rating and review.</p> : (
          <AIPanel kind="learned" title={`What I learned — ${item.title}`} scope={{ type: 'item', id: item.id }} buttonLabel="Summarize my takeaways" build={() => ({
            system: BASE_SYSTEM,
            messages: [{ role: 'user', content: `Based ONLY on the reader's own notes, quotes, rating and review below, list: 1) major ideas they recorded, 2) topics they found interesting, 3) questions they raised, 4) repeated concepts, 5) potential next subjects. For next reads, prioritise unread books already in their library (listed), then suggest outside books clearly marked as such.\n\n${itemContext(idx, item, share, 'full')}\n\nUNREAD BOOKS IN LIBRARY:\n${idx.itemList().filter((i) => i.status === 'want').slice(0, 60).map((i) => `- ${i.title} (${idx.authorLine(i)}; ${i.genres.join(', ')})`).join('\n')}` }],
          })} />
        )}
        <p className="tiny faint mt-16">AI answers are generated from metadata, general knowledge and your notes. The AI has not read the book’s text.</p>
      </div>
    </div>
  );
}

function EditTab({ idx, item }: { idx: LibraryIndex; item: Item }) {
  const nav = useNavigate();
  const { toast } = useUI();
  const [f, setF] = useState(() => ({
    title: item.title, subtitle: item.subtitle ?? '', authors: idx.authorNames(item), contentType: item.contentType, customType: item.customType ?? '', unit: item.unit, customUnit: item.customUnit ?? '',
    total: item.total ? String(round(toDisplay(item, item.total), 2)) : '', pageCount: item.pageCount ? String(item.pageCount) : '', isbn: item.isbn ?? '', publisher: item.publisher ?? '',
    publishedYear: item.publishedYear !== undefined ? String(item.publishedYear) : '', description: item.description ?? '', coverUrl: item.coverUrl ?? '', genres: item.genres,
    tags: item.tagIds.map((t) => idx.tags.get(t)?.name ?? '').filter(Boolean), folderIds: item.folderIds, shelfIds: item.shelfIds, deadline: item.deadline ?? '',
    dailyTarget: item.dailyTarget ? String(round(toDisplay(item, item.dailyTarget), 2)) : '', histStart: item.histStart !== undefined ? String(item.histStart) : '', histEnd: item.histEnd !== undefined ? String(item.histEnd) : '',
    difficulty: item.difficulty ?? '', series: item.series ?? '',
  }));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const save = async () => {
    if (!f.title.trim()) return toast('Title is required.', { error: true });
    if (f.deadline && !isValidKey(f.deadline)) return toast('Invalid deadline.', { error: true });
    const unitObj = { unit: f.unit as UnitKind };
    const total = num(f.total);
    await updateItem(item.id, {
      title: f.title.trim(), subtitle: f.subtitle || undefined, contentType: f.contentType, customType: f.customType || undefined, unit: f.unit, customUnit: f.customUnit || undefined,
      total: total && total > 0 ? toBase(unitObj, total) : undefined, pageCount: num(f.pageCount), isbn: f.isbn || undefined, publisher: f.publisher || undefined, publishedYear: num(f.publishedYear),
      description: f.description || undefined, coverUrl: f.coverUrl || undefined, genres: f.genres, folderIds: f.folderIds, shelfIds: f.shelfIds, deadline: f.deadline || undefined,
      dailyTarget: num(f.dailyTarget) ? toBase(unitObj, num(f.dailyTarget)!) : undefined, histStart: num(f.histStart), histEnd: num(f.histEnd), difficulty: (f.difficulty || undefined) as Item['difficulty'], series: f.series || undefined,
    });
    await updateItemAuthors(item.id, f.authors);
    await updateItemTags(item.id, f.tags);
    toast('Saved');
  };
  return (
    <div className="card col gap-16">
      <div className="fields">
        <label className="field">Title<input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="field">Subtitle<input className="input" value={f.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></label>
        <label className="field" style={{ gridColumn: '1/-1' }}>Authors<TagInput value={f.authors} onChange={(v) => set({ authors: v })} suggestions={idx.snap.authors.map((a) => a.name)} /></label>
        <label className="field">Content type<select className="select" value={f.contentType} onChange={(e) => set({ contentType: e.target.value as ContentType })}>{CONTENT_TYPES.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}</select></label>
        {f.contentType === 'custom' ? <label className="field">Custom type<input className="input" value={f.customType} onChange={(e) => set({ customType: e.target.value })} /></label> : <label className="field">Series<input className="input" value={f.series} onChange={(e) => set({ series: e.target.value })} /></label>}
        <label className="field">Progress unit<select className="select" value={f.unit} onChange={(e) => set({ unit: e.target.value as UnitKind })}>{Object.values(UNITS).map((u) => <option key={u.kind} value={u.kind}>{u.plural}</option>)}</select><span className="tiny faint">Changing units doesn’t convert logged sessions.</span></label>
        {f.unit === 'custom' && <label className="field">Unit name<input className="input" value={f.customUnit} onChange={(e) => set({ customUnit: e.target.value })} /></label>}
        <label className="field">Total length ({UNITS[f.unit as UnitKind].plural})<input className="input" type="number" value={f.total} onChange={(e) => set({ total: e.target.value })} placeholder="Unknown" /></label>
        <label className="field">Print page count<input className="input" type="number" value={f.pageCount} onChange={(e) => set({ pageCount: e.target.value })} /></label>
        <label className="field">Deadline<input className="input" type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} /><span className="tiny faint">{f.deadline ? <button className="btn xs ghost" onClick={() => set({ deadline: '' })}>Remove deadline</button> : 'No deadline yet'}</span></label>
        <label className="field">Daily target ({UNITS[f.unit as UnitKind].plural})<input className="input" type="number" value={f.dailyTarget} onChange={(e) => set({ dailyTarget: e.target.value })} /></label>
        <label className="field">ISBN<input className="input" value={f.isbn} onChange={(e) => set({ isbn: e.target.value })} /></label>
        <label className="field">Publisher<input className="input" value={f.publisher} onChange={(e) => set({ publisher: e.target.value })} /></label>
        <label className="field">Publication year<input className="input" type="number" value={f.publishedYear} onChange={(e) => set({ publishedYear: e.target.value })} /></label>
        <label className="field">Difficulty<select className="select" value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })}><option value="">—</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
        <label className="field">Subject period from (year)<input className="input" type="number" value={f.histStart} onChange={(e) => set({ histStart: e.target.value })} placeholder="e.g. -509" /></label>
        <label className="field">Subject period to (year)<input className="input" type="number" value={f.histEnd} onChange={(e) => set({ histEnd: e.target.value })} placeholder="e.g. -27" /></label>
        <label className="field" style={{ gridColumn: '1/-1' }}>Cover URL<input className="input" value={f.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} /></label>
      </div>
      <label className="field">Genres<TagInput value={f.genres} onChange={(v) => set({ genres: v })} suggestions={[...new Set(idx.itemList().flatMap((i) => i.genres))]} /></label>
      <label className="field">Tags<TagInput value={f.tags} onChange={(v) => set({ tags: v })} suggestions={idx.snap.tags.map((t) => t.name)} /></label>
      <label className="field">Folders — the same item can live in many folders<FolderPicker idx={idx} value={f.folderIds} onChange={(v) => set({ folderIds: v })} /></label>
      {idx.snap.shelves.length > 0 && (
        <div className="field">Shelves<div className="row wrap gap-4">{idx.snap.shelves.map((s) => <button key={s.id} className={`chip ${f.shelfIds.includes(s.id) ? 'on' : ''}`} onClick={() => set({ shelfIds: f.shelfIds.includes(s.id) ? f.shelfIds.filter((x) => x !== s.id) : [...f.shelfIds, s.id] })}>{s.name}</button>)}</div></div>
      )}
      <label className="field">Description<textarea className="textarea" value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="row">
        <button className="btn primary" onClick={save}>Save changes</button>
        <span className="grow" />
        <button className="btn danger" onClick={async () => { if (confirm(`Permanently delete “${item.title}” with all its sessions, notes and history?`)) { await deleteItem(item.id); toast('Deleted'); nav('/library'); } }}>Delete item</button>
      </div>
    </div>
  );
}
