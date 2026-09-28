import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addItem, addNote, finishTimer, discardTimer, logProgress, type LogResult, pauseTimer, resumeTimer, timerElapsedMs, updateInstance, updateNote } from '../db/actions';
import type { ContentType, Status, UnitKind } from '../db/types';
import { formatKey, isValidKey, todayKey } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import { searchAll } from '../engine/query';
import { CONTENT_TYPES, fmtDuration, fmtNum, fmtUnits, round, toBase, toDisplay, unitInfo, unitLabel, UNITS } from '../engine/units';
import { fetchDescription, type MetaResult, searchBooks } from '../lib/openlibrary';
import { useLibrary, useTimer } from '../state/library';
import { useUI } from '../state/ui';
import { Cover, FolderPicker, Modal, Segmented, Stars, TagInput, useDebounced } from './common';

export function Sheets() {
  const { sheet } = useUI();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'log': return <LogSheet itemId={sheet.itemId} />;
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
    toast(label ?? `Logged ${item ? fmtUnits(item, res.session.amount) : res.session.amount}${res.session.durationSec ? ` · ${fmtDuration(res.session.durationSec)}` : ''}`, { undo: res.undo });
    if (res.completed && idx.settings.notifications.completion) open({ kind: 'complete', itemId: res.session.itemId });
  };
}

// ── Log reading ────────────────────────────────────────────────────────

function LogSheet({ itemId }: { itemId: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const after = useAfterLog();
  const item = idx.items.get(itemId);
  const [mode, setMode] = useState<'amount' | 'to' | 'range'>('amount');
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  if (!item) return null;
  const pos = idx.position(item);
  const f = itemForecast(idx, item);
  const dPos = round(toDisplay(item, pos), 2);
  const u = unitLabel(item);

  const submit = async (quick?: number) => {
    try {
      if (!isValidKey(date) || date > todayKey()) throw new Error('Choose a valid date that is not in the future.');
      const durationSec = minutes ? Math.round(Number(minutes) * 60) : undefined;
      if (durationSec !== undefined && (!Number.isFinite(durationSec) || durationSec < 0)) throw new Error('Minutes must be a positive number.');
      let res: LogResult | undefined;
      if (quick !== undefined) res = await logProgress({ itemId, amount: toBase(item, quick), date, durationSec, note });
      else if (mode === 'amount') {
        const v = Number(amount);
        if (!(v > 0)) throw new Error(`Enter how many ${u} you read.`);
        res = await logProgress({ itemId, amount: toBase(item, v), date, durationSec, note });
      } else if (mode === 'to') {
        const v = Number(to);
        if (!(v > dPos)) throw new Error(`Enter a position after ${fmtNum(dPos, 2)}.`);
        res = await logProgress({ itemId, to: toBase(item, v), date, durationSec, note });
      } else {
        const a = Number(from), b = Number(to);
        if (!(a > 0 && b >= a)) throw new Error('Enter a valid range, e.g. 120 – 145.');
        res = await logProgress({ itemId, from: toBase(item, a), to: toBase(item, b), date, durationSec, note });
      }
      close();
      after(res);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <Modal
      title="Log reading"
      onClose={close}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => submit()}>Save</button></>}
    >
      <div className="row gap-12 mb-16">
        <Cover item={item} width={44} />
        <div className="grow">
          <div className="book-title">{item.title}</div>
          <div className="small muted">
            {item.total ? `${fmtNum(dPos, 2)} / ${fmtUnits(item, item.total)} · ${Math.round((f.percent ?? 0) * 100)}%` : `At ${fmtNum(dPos, 2)} ${u} · length unknown`}
          </div>
        </div>
      </div>
      <div className="small muted mb-8">Quick add</div>
      <div className="row wrap mb-16">
        {idx.settings.quickAmounts.map((q) => (
          <button key={q} className="btn" onClick={() => submit(q)}>+{q}</button>
        ))}
      </div>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'amount', label: `${u[0].toUpperCase()}${u.slice(1)} read` },
          { value: 'to', label: 'I’m now at…' },
          { value: 'range', label: 'Range' },
        ]}
      />
      <div className="fields mt-16">
        {mode === 'amount' && (
          <label className="field">Amount ({u})<input autoFocus className="input" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
        )}
        {mode === 'to' && (
          <label className="field">Current position<input autoFocus className="input" type="number" min={0} step="any" value={to} placeholder={String(dPos)} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
        )}
        {mode === 'range' && (
          <div className="row">
            <label className="field grow">From<input autoFocus className="input" type="number" value={from} placeholder={String(Math.floor(dPos) + 1)} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field grow">To<input className="input" type="number" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
          </div>
        )}
        <label className="field">Minutes (optional)<input className="input" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label className="field">Date<input className="input" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>Session note (optional)<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

// ── Notes & quotes ─────────────────────────────────────────────────────

function NoteSheet({ itemId, kind: initialKind, noteId }: { itemId?: string; kind: 'note' | 'quote'; noteId?: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const existing = noteId ? idx.snap.notes.find((n) => n.id === noteId) : undefined;
  const [kind, setKind] = useState<'note' | 'quote'>(existing?.kind ?? initialKind);
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

function AddSheet({ preset }: { preset?: { status?: 'want' | 'reading'; folderId?: string; query?: string } }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const nav = useNavigate();
  const [step, setStep] = useState<'search' | 'form'>(preset?.query === '' ? 'form' : 'search');
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

  if (step === 'search')
    return (
      <Modal title="Add to library" onClose={close} size="wide" footer={<><button className="btn" onClick={() => setStep('form')}>Enter manually</button></>}>
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

// ── Completion ─────────────────────────────────────────────────────────

function CompletionSheet({ itemId }: { itemId: string }) {
  const idx = useLibrary();
  const { close, toast } = useUI();
  const item = idx.items.get(itemId);
  const inst = item ? idx.currentInstance(item) : undefined;
  const [rating, setRating] = useState<number | undefined>(inst?.rating);
  const [review, setReview] = useState(inst?.review ?? '');
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
    <Modal title="Finished" onClose={close} footer={<><button className="btn" onClick={close}>Skip</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="completion">
        <Cover item={item} width={110} author={idx.authorLine(item)} />
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
  const { close } = useUI();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const res = useMemo(() => searchAll(idx, q, 8), [idx, q]);
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
          {!q && <div className="small faint" style={{ padding: 12 }}>Try an author, a subject like “Caesar”, a tag, or words from a note.</div>}
          {q && res.total === 0 && <div className="small faint" style={{ padding: 12 }}>Nothing found for “{q}”.</div>}
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
            {res.notes.map((n) => <div key={n.id} className="palette-item" onClick={() => go(n.itemId ? `/item/${n.itemId}?tab=notes` : '/knowledge')}>{n.kind === 'quote' ? '❝' : '✎'} <span className="ellipsis grow">{n.text}</span><span className="small faint ellipsis" style={{ maxWidth: '30%' }}>{n.itemId ? idx.items.get(n.itemId)?.title : ''}</span></div>)}
          </Group>
          <Group title="Concepts" show={res.concepts.length > 0}>
            {res.concepts.map((c) => <div key={c.id} className="palette-item" onClick={() => go(`/knowledge/concept/${c.id}`)}>◇ <span className="grow">{c.name}</span><span className="small faint">{c.kind}</span></div>)}
          </Group>
          <Group title="Projects" show={res.projects.length > 0}>
            {res.projects.map((p) => <div key={p.id} className="palette-item" onClick={() => go(`/plan/project/${p.id}`)}>🎯 <span className="grow">{p.name}</span></div>)}
          </Group>
          <Group title="Timeline" show={res.timeline.length > 0}>
            {res.timeline.map((t) => <div key={t.kind + t.id} className="palette-item" onClick={() => go(`/explore/timeline`)}>🕰 <span className="grow">{t.label}</span><span className="small faint">{t.year !== undefined ? (t.year < 0 ? `${-t.year} BCE` : t.year) : ''}</span></div>)}
          </Group>
          <Group title="Tags" show={res.tags.length > 0}>
            {res.tags.map((t) => <div key={t.id} className="palette-item" onClick={() => go(`/library?tag=${t.id}`)}># <span className="grow">{t.name}</span></div>)}
          </Group>
        </div>
      </div>
    </div>
  );
}

