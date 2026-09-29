import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addItem, addNote, createFolder, createShelf, finishTimer, discardTimer, logProgress, type LogResult, pauseTimer, resumeTimer, saveProject, startTimer, timerElapsedMs, updateInstance, updateItem, updateItemTags, updateNote } from '../db/actions';
import type { ContentType, Status, UnitKind } from '../db/types';
import { formatKey, isValidKey, todayKey } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import { isEmptyQuery, parseQuestion, runQuery, searchAll } from '../engine/query';
import { CONTENT_TYPES, fmtDuration, fmtNum, fmtUnits, round, toBase, toDisplay, unitInfo, unitLabel, UNITS } from '../engine/units';
import { fetchDescription, type MetaResult, searchBooks } from '../lib/openlibrary';
import { downloadFreeBook, type FreeBook, importEpub, isEpub, searchGutenberg, searchStandardEbooks } from '../lib/ebooks';
import { useEbookIds, useLibrary, useTimer } from '../state/library';
import { useUI } from '../state/ui';
import { Cover, Empty, FolderPicker, Modal, Segmented, Stars, TagInput, useDebounced } from './common';
import { Icon, type IconName, TONES, type Tone } from './icons';
import { Illustration } from './illustrations';
import { confetti } from '../lib/confetti';

export function Sheets() {
  const { sheet } = useUI();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'log': return <LogSheet itemId={sheet.itemId} />;
    case 'quick': return <QuickSheet />;
    case 'pick': return <PickSheet purpose={sheet.purpose} />;
    case 'organize': return <OrganizeSheet itemId={sheet.itemId} />;
    case 'note': return <NoteSheet itemId={sheet.itemId} kind={sheet.noteKind} noteId={sheet.noteId} />;
    case 'add': return <AddSheet preset={sheet.preset} />;
    case 'complete': return <CompletionSheet itemId={sheet.itemId} />;
    case 'timer-stop': return <TimerStopSheet />;
    case 'search': return <SearchPalette />;
    default: return null;
  }
}

/** Shared handler: toast with undo, and open the completion screen when finished. */
export function useAfterLog() {
  const { toast, open } = useUI();
  const idx = useLibrary();
  return (res: LogResult | undefined, label?: string) => {
    if (!res) return;
    const item = idx.items.get(res.session.itemId);
    let text = label ?? `+${item ? fmtUnits(item, res.session.amount) : res.session.amount}${res.session.durationSec ? ` · ${fmtDuration(res.session.durationSec)}` : ''}`;
    if (!label && item?.total && res.session.to !== undefined && !res.completed) {
      text += ` · you’re ${Math.min(99, Math.round((res.session.to / item.total) * 100))}% through “${item.title.length > 28 ? `${item.title.slice(0, 27)}…` : item.title}”`;
    }
    toast(res.completed ? `Finished “${item?.title ?? ''}” 🎉` : text, { undo: res.undo });
    if (res.completed && idx.settings.notifications.completion) open({ kind: 'complete', itemId: res.session.itemId });
  };
}

/** The item a screen is about (book page or reader), for context-aware actions. */
function useContextItemId(): string | undefined {
  const loc = useLocation();
  return /^\/(item|read)\/([^/?#]+)/.exec(loc.pathname)?.[2];
}

// ── Quick actions (＋) ─────────────────────────────────────────────────

function QuickSheet() {
  const idx = useLibrary();
  const { open, close, toast } = useUI();
  const nav = useNavigate();
  const ctxId = useContextItemId();
  const ctx = ctxId ? idx.items.get(ctxId) : undefined;
  const reading = idx.itemList().filter((i) => i.status === 'reading');
  const go = (to: string) => { close(); nav(to); };
  const actions: { icon: IconName; tone: Tone; label: string; run: () => void }[] = [
    { icon: 'logPlus', tone: 'terracotta', label: 'Log reading', run: () => open({ kind: 'log', itemId: ctx?.id ?? (reading.length === 1 ? reading[0].id : undefined) }) },
    { icon: 'clock', tone: 'green', label: 'Start timer', run: async () => { const id = ctx?.id ?? (reading.length === 1 ? reading[0].id : undefined); if (!id) return open({ kind: 'pick', purpose: 'timer' }); await startTimer(id); close(); toast('Timer started — tap Stop when you’re done'); } },
    { icon: 'plus', tone: 'gold', label: 'Add a book', run: () => open({ kind: 'add' }) },
    { icon: 'file', tone: 'blue', label: 'Open an ePub', run: () => open({ kind: 'add', preset: { step: 'epub' } }) },
    { icon: 'gift', tone: 'teal', label: 'Free ebooks', run: () => open({ kind: 'add', preset: { step: 'free' } }) },
    { icon: 'quote', tone: 'rose', label: 'Save a quote', run: () => open({ kind: 'note', itemId: ctx?.id, noteKind: 'quote' }) },
    { icon: 'pencil', tone: 'brown', label: 'Write a note', run: () => open({ kind: 'note', itemId: ctx?.id, noteKind: 'note' }) },
    { icon: 'sparkle', tone: 'ai', label: 'Ask AI', run: () => open({ kind: 'ai' }) },
    { icon: 'target', tone: 'green', label: 'New goal', run: () => go('/plan/goals?new=1') },
    { icon: 'layers', tone: 'plum', label: 'New project', run: () => go('/plan/projects?new=1') },
    { icon: 'download', tone: 'brown', label: 'Import Goodreads', run: () => go('/library/import') },
    { icon: 'search', tone: 'terracotta', label: 'Search', run: () => open({ kind: 'search' }) },
  ];
  return (
    <Modal title="What would you like to do?" onClose={close}>
      {ctx && (
        <button className="book-row mb-16" style={{ width: '100%', border: '1px solid var(--border)', background: 'var(--accent-soft)', cursor: 'pointer', textAlign: 'left' }} onClick={() => open({ kind: 'log', itemId: ctx.id })}>
          <Cover item={ctx} width={36} />
          <div className="grow"><div className="small muted">This book</div><div className="book-title ellipsis" style={{ fontSize: 16 }}>Log reading for {ctx.title}</div></div>
          <Icon name="chevronRight" />
        </button>
      )}
      <div className="quick-grid">
        {actions.map((a) => (
          <button key={a.label} className="quick" onClick={a.run}>
            <span className="q-ico" style={{ background: TONES[a.tone] }}><Icon name={a.icon} /></span>
            {a.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Pick a book: what you're reading first, then everything else. */
function BookPicker({ onPick, hint }: { onPick: (id: string) => void; hint?: string }) {
  const idx = useLibrary();
  const [q, setQ] = useState('');
  const reading = idx.itemList().filter((i) => i.status === 'reading');
  const others = idx.itemList().filter((i) => i.status !== 'reading' && (!q || `${i.title} ${idx.authorLine(i)}`.toLowerCase().includes(q.toLowerCase())));
  const Row = ({ id }: { id: string }) => {
    const i = idx.items.get(id)!;
    const f = itemForecast(idx, i);
    return (
      <button className="book-row" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }} onClick={() => onPick(i.id)}>
        <Cover item={i} width={36} />
        <div className="grow"><div className="ellipsis" style={{ fontWeight: 800 }}>{i.title}</div><div className="small muted ellipsis">{idx.authorLine(i)}{f.percent !== undefined && i.status === 'reading' ? ` · ${Math.round(f.percent * 100)}%` : ''}</div></div>
        <Icon name="chevronRight" className="faint" />
      </button>
    );
  };
  if (!idx.itemList().length) return <Empty illustration="shelf" title="No books yet">Add a book first, then you can log your reading.</Empty>;
  return (
    <div className="col gap-8">
      {hint && <p className="muted">{hint}</p>}
      {reading.length > 0 && <><div className="eyebrow">Reading now</div>{reading.map((i) => <Row key={i.id} id={i.id} />)}</>}
      <div className="eyebrow mt-8">{reading.length ? 'Other books' : 'Your books'}</div>
      <input className="input" placeholder="Find a book…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="col" style={{ gap: 0, maxHeight: 320, overflowY: 'auto' }}>{others.slice(0, 80).map((i) => <Row key={i.id} id={i.id} />)}</div>
    </div>
  );
}

function PickSheet({ purpose }: { purpose: 'timer' | 'note' | 'quote' }) {
  const { open, close, toast } = useUI();
  return (
    <Modal title={purpose === 'timer' ? 'Time which book?' : purpose === 'quote' ? 'Quote from which book?' : 'Note about which book?'} onClose={close}>
      <BookPicker onPick={async (id) => {
        if (purpose === 'timer') { await startTimer(id); close(); toast('Timer started — tap Stop when you’re done'); }
        else open({ kind: 'note', itemId: id, noteKind: purpose });
      }} />
    </Modal>
  );
}

// ── Log reading ────────────────────────────────────────────────────────

const LOG_PREFS = 'shelf.logPrefs';

function LogSheet({ itemId: initial }: { itemId?: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const after = useAfterLog();
  const reading = idx.itemList().filter((i) => i.status === 'reading');
  const [itemId, setItemId] = useState<string | undefined>(initial ?? (reading.length === 1 ? reading[0].id : undefined));
  const item = itemId ? idx.items.get(itemId) : undefined;
  // Books that also have the ePub in Shelf: manual logs are the paper copy.
  const ebookIds = useEbookIds();
  const medium = item && ebookIds.has(item.id) ? ('print' as const) : undefined;
  const [mode, setMode] = useState<'amount' | 'to' | 'range'>(() => {
    try { return (JSON.parse(localStorage.getItem(LOG_PREFS) ?? '{}').mode as 'amount' | 'to' | 'range') ?? 'amount'; } catch { return 'amount'; }
  });
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  if (!item) return <Modal title="What did you read?" onClose={close}><BookPicker onPick={setItemId} /></Modal>;
  const pos = idx.position(item);
  const f = itemForecast(idx, item);
  const dPos = round(toDisplay(item, pos), 2);
  const u = unitLabel(item);
  const last = [...(idx.sessionsByItem.get(item.id) ?? [])].reverse().find((x) => x.amount > 0);
  const lastAmt = last ? round(toDisplay(item, last.amount), 1) : undefined;
  const quick = [...new Set([...(lastAmt && !idx.settings.quickAmounts.includes(lastAmt) ? [lastAmt] : []), ...idx.settings.quickAmounts])].slice(0, 4);
  const remember = () => { try { localStorage.setItem(LOG_PREFS, JSON.stringify({ mode })); } catch { /* ignore */ } };

  const submit = async (quickAmt?: number) => {
    try {
      if (!isValidKey(date) || date > todayKey()) throw new Error('Choose a valid date that is not in the future.');
      const durationSec = minutes ? Math.round(Number(minutes) * 60) : undefined;
      if (durationSec !== undefined && (!Number.isFinite(durationSec) || durationSec < 0)) throw new Error('Minutes must be a positive number.');
      let res: LogResult | undefined;
      if (quickAmt !== undefined) res = await logProgress({ itemId: item.id, amount: toBase(item, quickAmt), date, durationSec, note, medium });
      else if (mode === 'amount') {
        const v = Number(amount);
        if (!(v > 0)) throw new Error(`Enter how many ${u} you read.`);
        res = await logProgress({ itemId: item.id, amount: toBase(item, v), date, durationSec, note, medium });
      } else if (mode === 'to') {
        const v = Number(to);
        if (!(v > dPos)) throw new Error(`Enter a position after ${fmtNum(dPos, 2)}.`);
        res = await logProgress({ itemId: item.id, to: toBase(item, v), date, durationSec, note, medium });
      } else {
        const a = Number(from), b = Number(to);
        if (!(a > 0 && b >= a)) throw new Error('Enter a valid range, e.g. 120 – 145.');
        res = await logProgress({ itemId: item.id, from: toBase(item, a), to: toBase(item, b), date, durationSec, note, medium });
      }
      remember();
      close();
      after(res);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <Modal title={medium ? 'Log your paper copy' : 'Log reading'} onClose={close}>
      {medium && <div className="notice small mb-16">📖 For pages read in your paper copy. Reading in Shelf’s ebook reader is logged automatically.</div>}
      <div className="row gap-12 mb-16">
        <Cover item={item} width={48} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="book-title ellipsis">{item.title}</div>
          <div className="small muted">
            {item.total ? `${fmtNum(dPos, 2)} of ${fmtUnits(item, item.total)} · ${Math.round((f.percent ?? 0) * 100)}%` : `At ${fmtNum(dPos, 2)} ${u} · length unknown`}
          </div>
          {progressBarFor(f.percent)}
        </div>
        {(reading.length > 1 || !initial) && <button className="btn xs ghost" onClick={() => setItemId(undefined)}>Change</button>}
      </div>
      <div className="eyebrow mb-8">How much did you read?</div>
      <div className="amount-grid mb-16">
        {quick.map((q) => (
          <button key={q} onClick={() => submit(q)} aria-label={`Log ${q} ${u}`}>+{q}<small>{q === lastAmt ? 'like last time' : u}</small></button>
        ))}
      </div>
      <div className="eyebrow mb-8">Or enter it exactly</div>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'amount', label: `${u[0].toUpperCase()}${u.slice(1)} read` },
          { value: 'to', label: 'I’m now at…' },
          { value: 'range', label: 'From – to' },
        ]}
      />
      <form className="row mt-16" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {mode === 'amount' && <label className="field grow">How many {u}<input autoFocus className="input" type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
        {mode === 'to' && <label className="field grow">I’m now at<input autoFocus className="input" type="number" inputMode="decimal" min={0} step="any" value={to} placeholder={String(dPos)} onChange={(e) => setTo(e.target.value)} /></label>}
        {mode === 'range' && (
          <>
            <label className="field grow">From<input autoFocus className="input" type="number" inputMode="numeric" value={from} placeholder={String(Math.floor(dPos) + 1)} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field grow">To<input className="input" type="number" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
        <button className="btn primary" type="submit">Save</button>
      </form>
      <details className="mt-16">
        <summary className="small muted" style={{ cursor: 'pointer', fontWeight: 700 }}>More options — time, date, note</summary>
        <div className="fields mt-8">
          <label className="field">Minutes (optional)<input className="input" type="number" inputMode="numeric" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
          <label className="field">Date<input className="input" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Session note (optional)<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
      </details>
    </Modal>
  );
}

function progressBarFor(v?: number) {
  return v === undefined ? null : <div className="bar thin mt-8"><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></div>;
}

// ── Organize a book (folders, shelves, tags, projects) ─────────────────

function OrganizeSheet({ itemId }: { itemId: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const item = idx.items.get(itemId);
  const [folderIds, setFolderIds] = useState<string[]>(item?.folderIds ?? []);
  const [shelfIds, setShelfIds] = useState<string[]>(item?.shelfIds ?? []);
  const [tags, setTags] = useState<string[]>(item ? item.tagIds.map((t) => idx.tags.get(t)?.name ?? '').filter(Boolean) : []);
  const [projectIds, setProjectIds] = useState<string[]>(() => idx.snap.projects.filter((p) => p.itemIds.includes(itemId)).map((p) => p.id));
  const [newFolder, setNewFolder] = useState('');
  const [newShelf, setNewShelf] = useState('');
  const [newProject, setNewProject] = useState('');
  if (!item) return null;
  const save = async () => {
    await updateItem(item.id, { folderIds, shelfIds });
    await updateItemTags(item.id, tags);
    for (const p of idx.snap.projects) {
      const has = p.itemIds.includes(item.id);
      const want = projectIds.includes(p.id);
      if (has !== want) await saveProject({ ...p, itemIds: want ? [...p.itemIds, item.id] : p.itemIds.filter((x) => x !== item.id) });
    }
    toast('Saved');
    close();
  };
  const Section = ({ icon, title, hint, children }: { icon: IconName; title: string; hint: string; children: React.ReactNode }) => (
    <div className="col gap-8" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="row gap-12"><span className="brand-mark" style={{ width: 32, height: 32, fontSize: 14, background: 'var(--surface-2)', color: 'var(--text-2)', boxShadow: 'none' }}><Icon name={icon} /></span><div><div style={{ fontWeight: 800 }}>{title}</div><div className="small muted">{hint}</div></div></div>
      {children}
    </div>
  );
  return (
    <Modal title="Organize this book" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="row gap-12 mb-8"><Cover item={item} width={36} /><div className="book-title ellipsis">{item.title}</div></div>
      <p className="small muted">It’s always one book — put it in as many places as you like.</p>
      <Section icon="folder" title="Folders" hint="Subjects and topics, like History → Rome. Folders can sit inside folders.">
        <FolderPicker idx={idx} value={folderIds} onChange={setFolderIds} />
        <div className="row"><input className="input sm" placeholder="New folder name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} /><button className="btn sm" disabled={!newFolder.trim()} onClick={async () => { const id = await createFolder({ name: newFolder.trim() }); setFolderIds([...folderIds, id]); setNewFolder(''); }}>Add</button></div>
      </Section>
      <Section icon="shelf" title="Shelves" hint="Your own lists, like “Favorites” or “Summer reading”.">
        <div className="row wrap gap-4">
          {idx.snap.shelves.map((sh) => <button key={sh.id} className={`chip ${shelfIds.includes(sh.id) ? 'on' : ''}`} onClick={() => setShelfIds(shelfIds.includes(sh.id) ? shelfIds.filter((x) => x !== sh.id) : [...shelfIds, sh.id])}>{sh.icon ?? '🏷'} {sh.name}</button>)}
          {!idx.snap.shelves.length && <span className="small faint">No shelves yet.</span>}
        </div>
        <div className="row"><input className="input sm" placeholder="New shelf name" value={newShelf} onChange={(e) => setNewShelf(e.target.value)} /><button className="btn sm" disabled={!newShelf.trim()} onClick={async () => { const id = await createShelf(newShelf.trim()); setShelfIds([...shelfIds, id]); setNewShelf(''); }}>Add</button></div>
      </Section>
      <Section icon="tag" title="Tags" hint="Quick labels you can filter by, like “gift idea” or “reread”.">
        <TagInput value={tags} onChange={setTags} suggestions={idx.snap.tags.map((t) => t.name)} placeholder="Type a tag and press Enter" />
      </Section>
      <Section icon="layers" title="Projects" hint="Goals with a list of books, like “Learn about the Roman Republic by June”.">
        <div className="col" style={{ gap: 4 }}>
          {idx.snap.projects.map((p) => <label key={p.id} className="check"><input type="checkbox" checked={projectIds.includes(p.id)} onChange={(e) => setProjectIds(e.target.checked ? [...projectIds, p.id] : projectIds.filter((x) => x !== p.id))} />{p.name}</label>)}
          {!idx.snap.projects.length && <span className="small faint">No projects yet.</span>}
        </div>
        <div className="row"><input className="input sm" placeholder="New project name" value={newProject} onChange={(e) => setNewProject(e.target.value)} /><button className="btn sm" disabled={!newProject.trim()} onClick={async () => { const id = await saveProject({ name: newProject.trim(), itemIds: [] }); setProjectIds([...projectIds, id]); setNewProject(''); }}>Add</button></div>
      </Section>
    </Modal>
  );
}

// ── Notes & quotes ─────────────────────────────────────────────────────

function NoteSheet({ itemId, kind: initialKind, noteId }: { itemId?: string; kind: 'note' | 'quote'; noteId?: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const existing = noteId ? idx.snap.notes.find((n) => n.id === noteId) : undefined;
  const [kind, setKind] = useState<'note' | 'quote'>(existing?.kind === 'quote' ? 'quote' : existing ? 'note' : initialKind);
  const [text, setText] = useState(existing?.text ?? '');
  const [target, setTarget] = useState(existing?.itemId ?? itemId ?? '');
  const item = target ? idx.items.get(target) : undefined;
  const [page, setPage] = useState(existing?.page !== undefined ? String(existing.page) : item ? String(Math.round(toDisplay(item, idx.position(item)))) : '');
  const [chapter, setChapter] = useState(existing?.chapter ?? '');
  const [timestamp, setTimestamp] = useState(existing?.timestamp ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [conceptIds, setConceptIds] = useState<string[]>(existing?.conceptIds ?? []);
  const allTags = useMemo(() => [...new Set(idx.snap.notes.flatMap((n) => n.tags))], [idx]);
  const save = async () => {
    if (!text.trim()) return toast('Write something first.', { error: true });
    const data = {
      kind,
      text: text.trim(),
      itemId: target || undefined,
      page: page ? Number(page) : undefined,
      chapter: chapter || undefined,
      timestamp: timestamp || undefined,
      tags,
      conceptIds,
    };
    if (existing) await updateNote(existing.id, data);
    else await addNote(data);
    toast(existing ? 'Saved' : kind === 'quote' ? 'Quote saved' : 'Note saved');
    close();
  };
  const timeBased = item && unitInfo(item).time;
  return (
    <Modal title={existing ? 'Edit' : kind === 'quote' ? 'Add quote' : 'Add note'} onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="col gap-12">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'note', label: '✎ Note' }, { value: 'quote', label: '❝ Quote / highlight' }]} />
        <textarea autoFocus className={`textarea ${kind === 'quote' ? 'serif' : ''}`} style={{ fontSize: kind === 'quote' ? 17 : undefined }} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'quote' ? 'Paste or type the passage…' : 'What are you thinking?'} />
        <label className="field">Item
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Not attached to an item —</option>
            {idx.itemList().map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        </label>
        <div className="fields c3">
          <label className="field">{timeBased ? 'Minute' : 'Page'}<input className="input" type="number" value={page} onChange={(e) => setPage(e.target.value)} /></label>
          <label className="field">Chapter / section<input className="input" value={chapter} onChange={(e) => setChapter(e.target.value)} /></label>
          <label className="field">Timestamp<input className="input" placeholder="e.g. 1:23:05" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} /></label>
        </div>
        <label className="field">Tags<TagInput value={tags} onChange={setTags} suggestions={allTags} /></label>
        {idx.snap.concepts.length > 0 && (
          <label className="field">Concepts
            <div className="row wrap gap-4">
              {idx.snap.concepts.slice(0, 40).map((c) => (
                <button key={c.id} type="button" className={`chip ${conceptIds.includes(c.id) ? 'on' : ''}`} onClick={() => setConceptIds(conceptIds.includes(c.id) ? conceptIds.filter((x) => x !== c.id) : [...conceptIds, c.id])}>{c.name}</button>
              ))}
            </div>
          </label>
        )}
      </div>
    </Modal>
  );
}

// ── Add content ────────────────────────────────────────────────────────

function AddSheet({ preset }: { preset?: { status?: 'want' | 'reading'; folderId?: string; query?: string; step?: 'epub' | 'free' } }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const nav = useNavigate();
  const [step, setStep] = useState<'search' | 'form' | 'epub' | 'free'>(preset?.step ?? (preset?.query === '' ? 'form' : 'search'));
  const [q, setQ] = useState(preset?.query ?? '');
  const dq = useDebounced(q, 350);
  const [results, setResults] = useState<MetaResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    title: '', subtitle: '', authors: [] as string[], contentType: 'book' as ContentType, customType: '', unit: 'pages' as UnitKind, customUnit: '',
    total: '', pageCount: '', isbn: '', publisher: '', publishedYear: '', description: '', coverUrl: '', coverData: '', genres: [] as string[],
    tags: [] as string[], folderIds: preset?.folderId ? [preset.folderId] : ([] as string[]), status: (preset?.status ?? 'want') as Status,
    deadline: '', histStart: '', histEnd: '', openLibraryKey: '', position: '',
  });
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (step !== 'search' || dq.trim().length < 2) { setResults(null); return; }
    const ac = new AbortController();
    setLoading(true);
    setErr('');
    searchBooks(dq, { signal: ac.signal })
      .then(setResults)
      .catch((e) => { if (e.name !== 'AbortError') setErr('Metadata search is unavailable right now — you can still add the item manually.'); })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [dq, step]);

  const pick = async (r: MetaResult) => {
    set({
      title: r.title, subtitle: r.subtitle ?? '', authors: r.authors.slice(0, 4), isbn: r.isbn ?? '', total: r.pages ? String(r.pages) : '', pageCount: r.pages ? String(r.pages) : '',
      publisher: r.publisher ?? '', publishedYear: r.year ? String(r.year) : '', coverUrl: r.coverUrl ?? '', genres: r.subjects.slice(0, 3), openLibraryKey: r.key,
    });
    setStep('form');
    const d = await fetchDescription(r.key);
    if (d) set({ description: d });
  };

  const dupe = form.title ? idx.itemList().find((i) => i.title.toLowerCase() === form.title.trim().toLowerCase() || (form.isbn && i.isbn === form.isbn)) : undefined;
  const unitDef = CONTENT_TYPES.find((c) => c.type === form.contentType)?.unit ?? 'pages';
  const unitObj = { unit: form.unit };

  const save = async () => {
    if (!form.title.trim()) return toast('A title is required.', { error: true });
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    const total = num(form.total);
    if (total !== undefined && !(total > 0)) return toast('Length must be a positive number.', { error: true });
    const id = await addItem({
      title: form.title,
      subtitle: form.subtitle || undefined,
      authors: form.authors,
      contentType: form.contentType,
      customType: form.contentType === 'custom' ? form.customType || 'Custom' : undefined,
      unit: form.unit,
      customUnit: form.unit === 'custom' ? form.customUnit || 'units' : undefined,
      total: total !== undefined ? toBase(unitObj, total) : undefined,
      pageCount: num(form.pageCount) ?? (form.unit === 'pages' ? total : undefined),
      isbn: form.isbn || undefined,
      publisher: form.publisher || undefined,
      publishedYear: num(form.publishedYear),
      description: form.description || undefined,
      coverUrl: form.coverUrl || undefined,
      coverData: form.coverData || undefined,
      genres: form.genres,
      tags: form.tags,
      folderIds: form.folderIds,
      status: form.status,
      deadline: form.deadline || undefined,
      histStart: num(form.histStart),
      histEnd: num(form.histEnd),
      openLibraryKey: form.openLibraryKey || undefined,
      position: form.position ? toBase(unitObj, Number(form.position)) : undefined,
    });
    toast(`Added “${form.title}”`);
    close();
    nav(`/item/${id}`);
  };

  const onCover = (file?: File) => {
    if (!file) return;
    if (file.size > 3_000_000) return toast('Please choose an image under 3 MB.', { error: true });
    const reader = new FileReader();
    reader.onload = () => {
      // Downscale to keep the database small.
      const img = new Image();
      img.onload = () => {
        const w = 360, h = Math.round((img.height / img.width) * 360);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        set({ coverData: c.toDataURL('image/jpeg', 0.85) });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const tabs = (
    <div className="mb-16">
      <Segmented value={step === 'form' ? 'search' : step} onChange={(v) => setStep(v)} options={[{ value: 'search', label: '🔎 Find a book' }, { value: 'epub', label: '📄 Open ePub file' }, { value: 'free', label: '🆓 Free ebooks' }]} />
    </div>
  );
  if (step === 'epub') return <Modal title="Add to library" onClose={close} size="wide">{tabs}<OpenEpub folderId={preset?.folderId} onDone={(id) => { close(); nav(`/item/${id}`); }} /></Modal>;
  if (step === 'free') return <Modal title="Add to library" onClose={close} size="wide">{tabs}<FreeEbooks folderId={preset?.folderId} onOpenFile={() => setStep('epub')} onDone={(id) => { close(); nav(`/item/${id}`); }} /></Modal>;
  if (step === 'search')
    return (
      <Modal title="Add to library" onClose={close} size="wide" footer={<><button className="btn" onClick={() => setStep('form')}>Enter manually</button></>}>
        {tabs}
        <input autoFocus className="input" placeholder="Search by title, author or ISBN…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="small faint mt-8">Metadata from Open Library. Articles, courses, podcasts and anything else can be added manually.</div>
        {err && <div className="notice warn mt-16">{err}</div>}
        {loading && <div className="small muted mt-16">Searching…</div>}
        {results && !results.length && !loading && <div className="small muted mt-16">No matches. Try different words or enter it manually.</div>}
        <div className="col mt-16" style={{ gap: 2 }}>
          {results?.map((r) => (
            <button key={r.key + r.isbn} className="book-row" style={{ border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }} onClick={() => pick(r)}>
              <Cover item={{ id: r.key, title: r.title, coverUrl: r.coverUrl, contentType: 'book' }} width={40} />
              <div className="grow">
                <div className="book-title" style={{ fontSize: 15 }}>{r.title}</div>
                <div className="small muted">{r.authors.join(', ') || 'Unknown author'}{r.year ? ` · ${r.year}` : ''}{r.pages ? ` · ${r.pages} pages` : ''}</div>
              </div>
              {idx.itemList().some((i) => i.title.toLowerCase() === r.title.toLowerCase()) && <span className="chip">In library</span>}
            </button>
          ))}
        </div>
      </Modal>
    );

  return (
    <Modal title="Add to library" onClose={close} size="wide" footer={<><button className="btn ghost" onClick={() => setStep('search')}>← Search</button><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Add</button></>}>
      {dupe && <div className="notice warn mb-16">“{dupe.title}” is already in your library. Adding it again creates a separate entry — to track it in more folders, add folders to the existing one instead.</div>}
      <div className="row top gap-16">
        <div className="col" style={{ alignItems: 'center' }}>
          <Cover item={{ id: 'new', title: form.title || 'Untitled', coverUrl: form.coverUrl, coverData: form.coverData, contentType: form.contentType }} width={96} />
          <label className="btn sm">Upload cover<input type="file" accept="image/*" hidden onChange={(e) => onCover(e.target.files?.[0])} /></label>
          {form.coverData && <button className="btn xs ghost" onClick={() => set({ coverData: '' })}>Remove</button>}
        </div>
        <div className="grow col gap-12">
          <div className="fields">
            <label className="field" style={{ gridColumn: '1 / -1' }}>Title<input autoFocus className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>Subtitle<input className="input" value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>Authors / creators<TagInput value={form.authors} onChange={(v) => set({ authors: v })} suggestions={idx.snap.authors.map((a) => a.name)} placeholder="Add a name and press Enter" /></label>
            <label className="field">Content type
              <select className="select" value={form.contentType} onChange={(e) => { const t = e.target.value as ContentType; set({ contentType: t, unit: CONTENT_TYPES.find((c) => c.type === t)?.unit ?? 'pages' }); }}>
                {CONTENT_TYPES.map((c) => <option key={c.type} value={c.type}>{c.icon} {c.label}</option>)}
              </select>
            </label>
            {form.contentType === 'custom' ? (
              <label className="field">Custom type name<input className="input" value={form.customType} onChange={(e) => set({ customType: e.target.value })} placeholder="e.g. Lecture series" /></label>
            ) : <span />}
            <label className="field">Track progress in
              <select className="select" value={form.unit} onChange={(e) => set({ unit: e.target.value as UnitKind })}>
                {Object.values(UNITS).map((u) => <option key={u.kind} value={u.kind}>{u.kind === 'custom' ? 'Custom units' : u.plural[0].toUpperCase() + u.plural.slice(1)}{u.kind === unitDef ? ' (suggested)' : ''}</option>)}
              </select>
            </label>
            {form.unit === 'custom' ? (
              <label className="field">Unit name<input className="input" value={form.customUnit} onChange={(e) => set({ customUnit: e.target.value })} placeholder="e.g. problems, videos" /></label>
            ) : (
              <label className="field">Total length ({form.unit === 'percent' ? '100%' : UNITS[form.unit].plural})<input className="input" type="number" min={0} step="any" value={form.unit === 'percent' ? '100' : form.total} disabled={form.unit === 'percent'} onChange={(e) => set({ total: e.target.value })} placeholder="Unknown" /></label>
            )}
            {form.unit === 'custom' && <label className="field">Total length<input className="input" type="number" min={0} value={form.total} onChange={(e) => set({ total: e.target.value })} /></label>}
            {form.unit !== 'pages' && <label className="field">Print page count (optional)<input className="input" type="number" value={form.pageCount} onChange={(e) => set({ pageCount: e.target.value })} /></label>}
            <label className="field">Status
              <select className="select" value={form.status} onChange={(e) => set({ status: e.target.value as Status })}>
                <option value="want">Want to Read</option><option value="reading">Reading</option><option value="read">Read</option><option value="paused">Set Aside</option><option value="dnf">Didn't Finish</option>
              </select>
            </label>
            {form.status === 'reading' && <label className="field">Already at (optional)<input className="input" type="number" value={form.position} onChange={(e) => set({ position: e.target.value })} /></label>}
            <label className="field">Deadline (optional)<input className="input" type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} /></label>
            <label className="field">ISBN<input className="input" value={form.isbn} onChange={(e) => set({ isbn: e.target.value })} /></label>
            <label className="field">Publisher<input className="input" value={form.publisher} onChange={(e) => set({ publisher: e.target.value })} /></label>
            <label className="field">Publication year<input className="input" type="number" value={form.publishedYear} onChange={(e) => set({ publishedYear: e.target.value })} placeholder="Negative for BCE" /></label>
            <label className="field">Cover URL<input className="input" value={form.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} /></label>
          </div>
          <label className="field">Genres / subjects<TagInput value={form.genres} onChange={(v) => set({ genres: v })} suggestions={[...new Set(idx.itemList().flatMap((i) => i.genres))]} /></label>
          <label className="field">Tags<TagInput value={form.tags} onChange={(v) => set({ tags: v })} suggestions={idx.snap.tags.map((t) => t.name)} /></label>
          <label className="field">Folders<FolderPicker idx={idx} value={form.folderIds} onChange={(v) => set({ folderIds: v })} /></label>
          <details>
            <summary className="small muted" style={{ cursor: 'pointer' }}>Historical period covered (optional)</summary>
            <div className="small faint mt-8">When the subject happened — separate from when the book was published. Use negative years for BCE.</div>
            <div className="fields mt-8">
              <label className="field">From year<input className="input" type="number" value={form.histStart} onChange={(e) => set({ histStart: e.target.value })} placeholder="-133" /></label>
              <label className="field">To year<input className="input" type="number" value={form.histEnd} onChange={(e) => set({ histEnd: e.target.value })} placeholder="-27" /></label>
            </div>
          </details>
          <label className="field">Description<textarea className="textarea" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>
        </div>
      </div>
    </Modal>
  );
}

function OpenEpub({ folderId, onDone }: { folderId?: string; onDone: (id: string) => void }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const load = async (f?: File) => {
    if (!f) return;
    if (!isEpub(f)) return toast('Please choose an .epub file.', { error: true });
    setBusy(true);
    try {
      const id = await importEpub(f, f.name, { folderIds: folderId ? [folderId] : [] });
      toast('Added — tap Read to start');
      onDone(id);
    } catch {
      toast('That file couldn’t be opened. Is it a valid ePub?', { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="col gap-12">
      <label className={`drop-zone ${over ? 'over' : ''}`} style={{ display: 'block', cursor: 'pointer' }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
        {busy ? 'Reading the book…' : <>Tap to choose an <b>.epub</b> file from your phone<br /><span className="small faint">e.g. from Downloads or Google Drive</span></>}
        <input type="file" accept=".epub,application/epub+zip" hidden disabled={busy} onChange={(e) => load(e.target.files?.[0])} />
      </label>
      <p className="small muted">The title, author and cover are read from the file. The book is saved on this phone so you can read it in Shelf, even offline. To add a file to a book that’s already in your library, open that book and tap “Attach ePub file”.</p>
    </div>
  );
}

function FreeEbooks({ folderId, onDone, onOpenFile }: { folderId?: string; onDone: (id: string) => void; onOpenFile: () => void }) {
  const { toast } = useUI();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 450);
  const [se, setSe] = useState<FreeBook[] | null>(null);
  const [pg, setPg] = useState<FreeBook[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (dq.trim().length < 2) { setSe(null); setPg(null); return; }
    const ac = new AbortController();
    setErr('');
    setSe(null);
    setPg(null);
    searchStandardEbooks(dq, ac.signal).then(setSe).catch((e) => { if (e.name !== 'AbortError') { setSe([]); setErr('Standard Ebooks search isn’t available right now.'); } });
    searchGutenberg(dq, ac.signal).then(setPg).catch((e) => { if (e.name !== 'AbortError') setPg([]); });
    return () => ac.abort();
  }, [dq]);
  const get = async (b: FreeBook) => {
    setBusy(b.id);
    try {
      const id = await downloadFreeBook(b, folderId ? [folderId] : []);
      toast(`Downloaded “${b.title}”`);
      onDone(id);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };
  const Row = ({ b }: { b: FreeBook }) => (
    <div className="book-row">
      <Cover item={{ id: b.id, title: b.title, coverUrl: b.coverUrl, contentType: 'ebook' }} width={40} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="book-title ellipsis" style={{ fontSize: 15 }}>{b.title}</div>
        <div className="small muted ellipsis">{b.authors.join(', ') || 'Unknown author'}</div>
      </div>
      {b.epubUrl ? (
        <button className="btn sm primary" disabled={!!busy} onClick={() => get(b)}>{busy === b.id ? 'Downloading…' : 'Get'}</button>
      ) : (
        <a className="btn sm" href={b.pageUrl} target="_blank" rel="noreferrer">Download ↗</a>
      )}
    </div>
  );
  return (
    <div className="col gap-12">
      <input autoFocus className="input" placeholder="Search free classics by title or author…" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="small faint">Free, legal ebooks whose copyright has expired — mostly books published before about 1930.</p>
      {err && <div className="notice warn">{err}</div>}
      {dq.trim().length >= 2 && (
        <>
          <div className="section-title" style={{ margin: '8px 0 0' }}>Standard Ebooks — one tap</div>
          {se === null ? <div className="small muted">Searching…</div> : se.length === 0 ? <div className="small muted">No matches.</div> : se.map((b) => <Row key={b.id} b={b} />)}
          <div className="section-title" style={{ margin: '12px 0 0' }}>Project Gutenberg</div>
          <div className="small faint">Gutenberg doesn’t allow apps to download directly: tap Download, then come back and use <button className="btn xs" onClick={onOpenFile}>📄 Open ePub file</button> to pick it from your Downloads.</div>
          {pg === null ? <div className="small muted">Searching…</div> : pg.length === 0 ? <div className="small muted">No matches.</div> : pg.map((b) => <Row key={b.id} b={b} />)}
          <a className="btn sm" href={`https://oceanofpdf.com/?s=${encodeURIComponent(dq)}`} target="_blank" rel="noreferrer">Search on yechihamelech↗</a>
        </>
      )}
    </div>
  );
}

// ── Completion ─────────────────────────────────────────────────────────

function CompletionSheet({ itemId }: { itemId: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const item = idx.items.get(itemId);
  const inst = item ? idx.currentInstance(item) : undefined;
  const [rating, setRating] = useState<number | undefined>(inst?.rating);
  const [review, setReview] = useState(inst?.review ?? '');
  useEffect(() => { confetti(); }, []);
  if (!item || !inst) return null;
  const ss = idx.sessionsByInstance.get(inst.id) ?? [];
  const sec = ss.reduce((a, s) => a + (s.durationSec ?? 0), 0);
  const longest = ss.reduce((a, s) => Math.max(a, s.durationSec ?? 0), 0);
  const amt = ss.reduce((a, s) => a + s.amount, 0);
  const timedAmt = ss.filter((s) => s.durationSec).reduce((a, s) => a + s.amount, 0);
  const speed = sec >= 300 ? timedAmt / (sec / 3600) : undefined;
  const save = async () => {
    await updateInstance(inst.id, { rating, review: review.trim() || undefined });
    toast('Saved');
    close();
  };
  return (
    <Modal title="Finished!" onClose={close} footer={<><button className="btn" onClick={close}>Skip</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="completion">
        <div className="badge">You finished it! ★</div>
        <div style={{ position: 'relative' }}>
          <Cover item={item} width={120} author={idx.authorLine(item)} />
          <span style={{ position: 'absolute', right: -34, bottom: -18, width: 76 }} aria-hidden><Illustration name="finished" /></span>
        </div>
        <div>
          <div className="book-title" style={{ fontSize: 22 }}>{item.title}</div>
          <div className="muted">{idx.authorLine(item)}{inst.number > 1 ? ` · Reading #${inst.number}` : ''}</div>
        </div>
        <div className="stats-row" style={{ width: '100%', textAlign: 'left' }}>
          <div className="stat"><span className="label">{unitLabel(item)[0].toUpperCase() + unitLabel(item).slice(1)}</span><span className="value">{fmtNum(toDisplay(item, item.total ?? amt), 1)}</span></div>
          <div className="stat"><span className="label">Time spent</span><span className="value">{sec ? fmtDuration(sec) : '—'}</span></div>
          <div className="stat"><span className="label">Sessions</span><span className="value">{ss.length}</span></div>
          <div className="stat"><span className="label">Avg speed</span><span className="value">{speed ? fmtNum(toDisplay(item, speed), 0) : '—'}</span><span className="hint">{speed ? `${unitLabel(item)}/hour` : 'time a session to measure'}</span></div>
          <div className="stat"><span className="label">Started</span><span className="value" style={{ fontSize: 16 }}>{formatKey(inst.startedOn)}</span></div>
          <div className="stat"><span className="label">Finished</span><span className="value" style={{ fontSize: 16 }}>{formatKey(inst.finishedOn)}</span></div>
          <div className="stat"><span className="label">Longest session</span><span className="value" style={{ fontSize: 16 }}>{longest ? fmtDuration(longest) : '—'}</span></div>
        </div>
        <div className="col" style={{ width: '100%', alignItems: 'center' }}>
          <div className="small muted">Your rating</div>
          <Stars value={rating} onChange={setRating} size={30} />
        </div>
        <textarea className="textarea" placeholder="A few thoughts for future you (optional)…" value={review} onChange={(e) => setReview(e.target.value)} />
      </div>
    </Modal>
  );
}

// ── Timer ──────────────────────────────────────────────────────────────

export function useTick(active: boolean, ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

export function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
}

export function TimerBar() {
  const t = useTimer();
  const idx = useLibrary();
  const { open } = useUI();
  useTick(!!t?.runningSince);
  if (!t) return null;
  const item = idx.items.get(t.itemId);
  const ms = timerElapsedMs(t);
  return (
    <div className="timer-bar">
      <span>{t.runningSince ? '⏱' : '⏸'}</span>
      <span className="clock">{fmtClock(ms)}</span>
      <span className="ellipsis grow">{item?.title ?? 'Unknown item'}</span>
      {t.runningSince ? <button className="btn sm" onClick={pauseTimer}>Pause</button> : <button className="btn sm" onClick={resumeTimer}>Resume</button>}
      {item && <button className="btn sm" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'note' })}>Note</button>}
      {item && <button className="btn sm" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'quote' })}>Quote</button>}
      <button className="btn sm primary" onClick={() => open({ kind: 'timer-stop' })}>Stop</button>
    </div>
  );
}

function TimerStopSheet() {
  const t = useTimer();
  const idx = useLibrary();
  const { close, toast } = useUI();
  const after = useAfterLog();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const paused = useRef(false);
  useEffect(() => {
    // Freeze the clock while the user fills in the form.
    if (t?.runningSince && !paused.current) { paused.current = true; pauseTimer(); }
  }, [t]);
  if (!t) return null;
  const item = idx.items.get(t.itemId);
  if (!item) return null;
  const ms = timerElapsedMs(t);
  const dPos = round(toDisplay(item, idx.position(item)), 2);
  const save = async () => {
    const res = await finishTimer({ to: to ? toBase(item, Number(to)) : undefined, amount: amount ? toBase(item, Number(amount)) : 0, note });
    close();
    if (res) after(res, `Session saved · ${fmtDuration(res.session.durationSec)}${res.session.amount ? ` · ${fmtUnits(item, res.session.amount)}` : ''}`);
    else toast('Session saved');
  };
  const timeUnit = unitInfo(item).time;
  return (
    <Modal
      title="End session"
      onClose={() => { resumeTimer(); close(); }}
      footer={<><button className="btn danger" onClick={async () => { if (confirm('Discard this timed session?')) { await discardTimer(); close(); } }}>Discard</button><span className="grow" /><button className="btn" onClick={() => { resumeTimer(); close(); }}>Keep reading</button><button className="btn primary" onClick={save}>Save session</button></>}
    >
      <div className="row gap-12 mb-16">
        <Cover item={item} width={44} />
        <div>
          <div className="book-title">{item.title}</div>
          <div className="muted">{fmtClock(ms)} · started at {fmtNum(dPos, 2)} {unitLabel(item)}</div>
        </div>
      </div>
      <div className="fields">
        <label className="field">Now at ({unitLabel(item)})<input autoFocus className="input" type="number" value={to} placeholder={timeUnit ? String(round(dPos + ms / 60000 / unitInfo(item).factor, 1)) : ''} onChange={(e) => { setTo(e.target.value); setAmount(''); }} /></label>
        <label className="field">…or amount read<input className="input" type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setTo(''); }} /></label>
        <label className="field" style={{ gridColumn: '1/-1' }}>Session note<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {!to && !amount && <div className="small faint mt-8">Leave both empty to record time only.</div>}
    </Modal>
  );
}

// ── Global search (⌘K) ─────────────────────────────────────────────────

function SearchPalette() {
  const idx = useLibrary();
  const { close, open } = useUI();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const res = useMemo(() => searchAll(idx, q, 8), [idx, q]);
  const smart = useMemo(() => {
    if (q.trim().split(/\s+/).length < 2) return null;
    const parsed = parseQuestion(q, idx);
    if (isEmptyQuery(parsed.query) || !parsed.understood.length) return null;
    return { understood: parsed.understood, items: runQuery(idx, parsed.query).slice(0, 12) };
  }, [idx, q]);
  const commands = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const all: { label: string; icon: IconName; match: RegExp; run: () => void }[] = [
      { label: 'Add a book', icon: 'plus', match: /^(add|new book|add book)/, run: () => open({ kind: 'add' }) },
      { label: 'Log reading', icon: 'logPlus', match: /^log/, run: () => open({ kind: 'log' }) },
      { label: 'Start a timer', icon: 'clock', match: /^(timer|start timer|time)/, run: () => open({ kind: 'pick', purpose: 'timer' }) },
      { label: 'Save a quote', icon: 'quote', match: /^(quote|save quote)/, run: () => open({ kind: 'note', noteKind: 'quote' }) },
      { label: 'Write a note', icon: 'pencil', match: /^(note|write)/, run: () => open({ kind: 'note', noteKind: 'note' }) },
      { label: 'Create a goal', icon: 'target', match: /^(goal|new goal|create goal)/, run: () => go('/plan/goals?new=1') },
      { label: 'Create a project', icon: 'layers', match: /^(project|new project|create project)/, run: () => go('/plan/projects?new=1') },
      { label: `Discover books about “${q.trim()}”`, icon: 'compass', match: /.{3,}/, run: () => go(`/discover/topic/${encodeURIComponent(q.trim())}`) },
      { label: 'Import from Goodreads', icon: 'download', match: /^(import|goodreads)/, run: () => go('/library/import') },
      { label: 'Open settings', icon: 'settings', match: /^(settings|dark|theme|backup)/, run: () => go('/settings') },
    ];
    const hits = all.filter((c) => c.match.test(t));
    hits.push({ label: `Ask AI: “${q.trim()}”`, icon: 'sparkle', match: /./, run: () => open({ kind: 'ai', question: q.trim() }) });
    return hits;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const go = (to: string) => { close(); nav(to); };
  const Group = ({ title, children, show }: { title: string; children: React.ReactNode; show: boolean }) =>
    show ? <><div className="palette-group">{title}</div>{children}</> : null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide" style={{ overflow: 'hidden' }} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <input autoFocus className="input" style={{ border: 0, boxShadow: 'none', fontSize: 16 }} placeholder="Search books, authors, notes, quotes, concepts, projects…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="palette-results">
          {!q && <div className="small faint" style={{ padding: 12 }}>Try an author, a subject like “Rome”, words from a note — or a question like “unfinished books over 400 pages”. Type “log” or “add” for quick actions.</div>}
          {smart && (
            <Group title={`Books that are ${smart.understood.join(' · ')}`} show>
              {smart.items.length === 0 ? <div className="small faint" style={{ padding: '6px 10px' }}>No books match that.</div> : smart.items.map((i) => (
                <div key={i.id} className="palette-item" onClick={() => go(`/item/${i.id}`)}>
                  <Cover item={i} width={24} /><span className="ellipsis grow">{i.title}</span><span className="small faint ellipsis" style={{ maxWidth: '40%' }}>{idx.authorLine(i)}</span>
                </div>
              ))}
            </Group>
          )}
          {q && res.total === 0 && !smart && <div className="small faint" style={{ padding: 12 }}>Nothing found for “{q}”.</div>}
          <Group title="Books & items" show={res.items.length > 0}>
            {res.items.map((i) => (
              <div key={i.id} className="palette-item" onClick={() => go(`/item/${i.id}`)}>
                <Cover item={i} width={24} />
                <span className="ellipsis grow">{i.title}</span>
                <span className="small faint ellipsis" style={{ maxWidth: '40%' }}>{idx.authorLine(i)}</span>
              </div>
            ))}
          </Group>
          <Group title="Authors" show={res.authors.length > 0}>
            {res.authors.map((a) => <div key={a.id} className="palette-item" onClick={() => go(`/author/${a.id}`)}>👤 <span className="grow">{a.name}</span><span className="small faint">{a.count} items</span></div>)}
          </Group>
          <Group title="Folders" show={res.folders.length > 0}>
            {res.folders.map((f) => <div key={f.id} className="palette-item" onClick={() => go(`/library/folder/${f.id}`)}>📁 <span className="grow">{f.path}</span></div>)}
          </Group>
          <Group title="Notes & quotes" show={res.notes.length > 0}>
            {res.notes.map((n) => <div key={n.id} className="palette-item" onClick={() => go(n.itemId ? `/item/${n.itemId}?tab=notes` : '/knowledge/notes')}>{n.kind === 'quote' ? '❝' : '✎'} <span className="ellipsis grow">{n.text}</span><span className="small faint ellipsis" style={{ maxWidth: '30%' }}>{n.itemId ? idx.items.get(n.itemId)?.title : ''}</span></div>)}
          </Group>
          <Group title="People, places & ideas" show={res.concepts.length > 0}>
            {res.concepts.map((c) => <div key={c.id} className="palette-item" onClick={() => go(`/knowledge/concept/${c.id}`)}>◇ <span className="grow">{c.name}</span><span className="small faint">{c.kind}</span></div>)}
          </Group>
          <Group title="Curricula" show={res.curricula.length > 0}>
            {res.curricula.map((c) => <div key={c.id} className="palette-item" onClick={() => go(`/curriculum/${c.id}`)}>🪜 <span className="grow">{c.name}</span></div>)}
          </Group>
          <Group title="Saved images" show={res.media.length > 0}>
            {res.media.map((m) => <a key={m.id} className="palette-item" href={m.sourceUrl} target="_blank" rel="noreferrer">🖼 <span className="grow ellipsis">{m.title}</span></a>)}
          </Group>
          <Group title="Projects" show={res.projects.length > 0}>
            {res.projects.map((p) => <div key={p.id} className="palette-item" onClick={() => go(`/plan/project/${p.id}`)}>🎯 <span className="grow">{p.name}</span></div>)}
          </Group>
          <Group title="Timeline" show={res.timeline.length > 0}>
            {res.timeline.map((t) => <div key={t.kind + t.id} className="palette-item" onClick={() => go(`/explore/timeline`)}>🕰 <span className="grow">{t.label}</span><span className="small faint">{t.year !== undefined ? (t.year < 0 ? `${-t.year} BCE` : t.year) : ''}</span></div>)}
          </Group>
          <Group title="Actions" show={commands.length > 0}>
            {commands.map((c) => <div key={c.label} className="palette-item" onClick={c.run}><Icon name={c.icon} /><span className="grow ellipsis">{c.label}</span></div>)}
          </Group>
          <Group title="Tags" show={res.tags.length > 0}>
            {res.tags.map((t) => <div key={t.id} className="palette-item" onClick={() => go(`/library?tag=${t.id}`)}># <span className="grow">{t.name}</span></div>)}
          </Group>
        </div>
      </div>
    </div>
  );
}

