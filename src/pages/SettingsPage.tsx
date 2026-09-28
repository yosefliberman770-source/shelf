import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AIError, fetchAIStatus, type ProviderStatus, saveProviderConfig } from '../ai/client';
import { Modal, Segmented, Switch, Tabs } from '../components/common';
import { deleteAllAIData, updateSettings } from '../db/actions';
import { download, eraseEverything, exportBackup, restoreBackup, tableRowsForExport, toCSV, toSpreadsheetML, validateBackup } from '../db/portability';
import type { Settings } from '../db/types';
import { addDays, formatKey, isValidKey, range, WEEKDAYS } from '../engine/dates';
import { dueReminders } from '../lib/notifications';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Tab = 'general' | 'notifications' | 'ai' | 'data';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'general';
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <Tabs<Tab> value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'general', label: 'General' }, { id: 'notifications', label: 'Notifications' }, { id: 'ai', label: 'AI & privacy' }, { id: 'data', label: 'Data' }]} />
      {tab === 'general' && <General />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'ai' && <AISettings />}
      {tab === 'data' && <DataSettings />}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row between wrap" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <div style={{ flex: '1 1 260px' }}><div style={{ fontWeight: 500 }}>{label}</div>{hint && <div className="small muted">{hint}</div>}</div>
      <div>{children}</div>
    </div>
  );
}

function General() {
  const idx = useLibrary();
  const s = idx.settings;
  const set = (p: Partial<Settings>) => updateSettings(p);
  const [vacFrom, setVacFrom] = useState('');
  const [vacTo, setVacTo] = useState('');
  const toggle = (arr: number[], d: number) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]);
  const addDates = (key: 'excludedDates' | 'streakSkipDates') => {
    if (!isValidKey(vacFrom)) return;
    const to = isValidKey(vacTo) && vacTo >= vacFrom ? vacTo : vacFrom;
    const days = range(vacFrom, to).slice(0, 366);
    set({ [key]: [...new Set([...s[key], ...days])].sort() } as Partial<Settings>);
  };
  return (
    <div className="card">
      <Row label="Your name" hint="Used in greetings only."><input className="input sm" style={{ width: 200 }} defaultValue={s.userName ?? ''} onBlur={(e) => set({ userName: e.target.value.trim() || undefined })} /></Row>
      <Row label="Appearance"><Segmented size="sm" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} /></Row>
      <Row label="Non-reading days" hint="Excluded from plans and required-pace calculations. Everyone’s week is different.">
        <div className="row wrap gap-4">{WEEKDAYS.map((d, i) => <button key={d} className={`chip ${s.nonReadingWeekdays.includes(i) ? 'on' : ''}`} onClick={() => set({ nonReadingWeekdays: toggle(s.nonReadingWeekdays, i) })}>{d}</button>)}</div>
      </Row>
      <Row label="Days that don’t count for streaks" hint="Neither extend nor break your streak.">
        <div className="row wrap gap-4">{WEEKDAYS.map((d, i) => <button key={d} className={`chip ${s.streakSkipWeekdays.includes(i) ? 'on' : ''}`} onClick={() => set({ streakSkipWeekdays: toggle(s.streakSkipWeekdays, i) })}>{d}</button>)}</div>
      </Row>
      <Row label="Holidays, vacations & specific dates" hint="Add a date or range, then choose what it applies to.">
        <div className="col" style={{ alignItems: 'flex-end' }}>
          <div className="row"><input className="input sm" type="date" value={vacFrom} onChange={(e) => setVacFrom(e.target.value)} /><span className="faint">→</span><input className="input sm" type="date" value={vacTo} onChange={(e) => setVacTo(e.target.value)} /></div>
          <div className="row"><button className="btn xs" disabled={!vacFrom} onClick={() => addDates('excludedDates')}>Exclude from plans</button><button className="btn xs" disabled={!vacFrom} onClick={() => addDates('streakSkipDates')}>Skip for streaks</button></div>
        </div>
      </Row>
      {(s.excludedDates.length > 0 || s.streakSkipDates.length > 0) && (
        <div className="small" style={{ padding: '8px 0' }}>
          {s.excludedDates.length > 0 && <div className="row wrap gap-4 mb-8"><span className="muted">Excluded from plans:</span>{compress(s.excludedDates).map((r) => <span key={r[0]} className="chip">{r[0] === r[1] ? formatKey(r[0]) : `${formatKey(r[0])} – ${formatKey(r[1])}`}<span className="x" onClick={() => set({ excludedDates: s.excludedDates.filter((d) => d < r[0] || d > r[1]) })}>✕</span></span>)}</div>}
          {s.streakSkipDates.length > 0 && <div className="row wrap gap-4"><span className="muted">Skipped for streaks:</span>{compress(s.streakSkipDates).map((r) => <span key={r[0]} className="chip">{r[0] === r[1] ? formatKey(r[0]) : `${formatKey(r[0])} – ${formatKey(r[1])}`}<span className="x" onClick={() => set({ streakSkipDates: s.streakSkipDates.filter((d) => d < r[0] || d > r[1]) })}>✕</span></span>)}</div>}
        </div>
      )}
      <Row label="Finish line threshold" hint="Books above this show in “Finish line”."><div className="row"><input type="range" min={50} max={99} value={Math.round(s.finishLineThreshold * 100)} onChange={(e) => set({ finishLineThreshold: Number(e.target.value) / 100 })} /><span className="num" style={{ width: 40 }}>{Math.round(s.finishLineThreshold * 100)}%</span></div></Row>
      <Row label="“Haven’t read recently” after" hint="Days without a session."><input className="input sm" style={{ width: 90 }} type="number" min={1} value={s.staleDays} onChange={(e) => set({ staleDays: Math.max(1, Number(e.target.value) || 30) })} /></Row>
      <Row label="Pace window" hint="Current pace uses your last N days of reading."><input className="input sm" style={{ width: 90 }} type="number" min={3} max={90} value={s.paceWindowDays} onChange={(e) => set({ paceWindowDays: Math.min(90, Math.max(3, Number(e.target.value) || 14)) })} /></Row>
      <Row label="Default pace when there’s no history" hint="Pages per reading day. Used only until you log reading."><input className="input sm" style={{ width: 90 }} type="number" min={0} value={s.defaultPace} onChange={(e) => set({ defaultPace: Math.max(0, Number(e.target.value) || 0) })} /></Row>
      <Row label="Quick log buttons"><input className="input sm" style={{ width: 160 }} defaultValue={s.quickAmounts.join(', ')} onBlur={(e) => { const v = e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0).slice(0, 6); if (v.length) set({ quickAmounts: v }); }} /></Row>
    </div>
  );
}

function compress(dates: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const d of [...dates].sort()) {
    const last = out[out.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

function Notifications() {
  const idx = useLibrary();
  const n = idx.settings.notifications;
  const set = (p: Partial<typeof n>) => updateSettings({ notifications: { ...n, ...p } });
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const due = dueReminders(idx);
  return (
    <div className="col gap-16">
      <div className="notice">
        Reminders are delivered by your browser while Shelf is open or installed. {perm === 'granted' ? '✓ Notifications are allowed.' : perm === 'unsupported' ? 'This browser doesn’t support notifications.' : <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>Allow notifications</button>}
      </div>
      <div className="card">
        <Row label="Daily reading reminder" hint="If you haven’t logged reading by this time (skips non-reading days)."><div className="row"><input className="input sm" type="time" value={n.daily.time} onChange={(e) => set({ daily: { ...n.daily, time: e.target.value } })} /><Switch checked={n.daily.enabled} onChange={(v) => set({ daily: { ...n.daily, enabled: v } })} /></div></Row>
        <Row label="Daily goal reminder" hint="At the reminder time, if your daily goal isn’t met."><Switch checked={n.goal} onChange={(v) => set({ goal: v })} /></Row>
        <Row label="Behind-schedule alerts" hint="When a book with a deadline falls behind."><Switch checked={n.behind} onChange={(v) => set({ behind: v })} /></Row>
        <Row label="Finish-line nudges" hint="When a book passes your finish-line threshold."><Switch checked={n.finishLine} onChange={(v) => set({ finishLine: v })} /></Row>
        <Row label="Book completion" hint="Show the completion screen with stats when you finish."><Switch checked={n.completion} onChange={(v) => set({ completion: v })} /></Row>
        <Row label="Weekly summary"><div className="row"><select className="select sm" value={n.weekly.weekday} onChange={(e) => set({ weekly: { ...n.weekly, weekday: Number(e.target.value) } })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select><Switch checked={n.weekly.enabled} onChange={(v) => set({ weekly: { ...n.weekly, enabled: v } })} /></div></Row>
        <Row label="Project deadline reminders"><div className="row"><input className="input sm" style={{ width: 70 }} type="number" min={1} value={n.projectDeadline.daysBefore} onChange={(e) => set({ projectDeadline: { ...n.projectDeadline, daysBefore: Number(e.target.value) || 7 } })} /><span className="small muted">days before</span><Switch checked={n.projectDeadline.enabled} onChange={(v) => set({ projectDeadline: { ...n.projectDeadline, enabled: v } })} /></div></Row>
      </div>
      <div className="card">
        <div className="card-head"><h3>Due right now</h3></div>
        {due.length === 0 ? <div className="small muted">No reminders due.</div> : due.map((r) => <div key={r.key} className="small"><b>{r.title}</b> — {r.body}</div>)}
      </div>
    </div>
  );
}

function AISettings() {
  const idx = useLibrary();
  const { toast } = useUI();
  const ai = idx.settings.ai;
  const [status, setStatus] = useState<{ providers: ProviderStatus[]; keyConfigAllowed: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [keyFor, setKeyFor] = useState<ProviderStatus | null>(null);
  const load = () => fetchAIStatus().then((s) => { setStatus(s); setErr(''); }).catch((e: AIError) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const set = (p: Partial<Settings['ai']>) => updateSettings({ ai: { ...ai, ...p } });
  const provider = status?.providers.find((p) => p.id === ai.provider);
  return (
    <div className="col gap-16">
      <div className="card">
        <Row label="AI features" hint="Everything in Shelf works without AI. When on, AI adds recommendations, explanations, tutoring and more."><Switch checked={ai.enabled} onChange={(v) => set({ enabled: v })} /></Row>
        {err && <div className="notice warn mt-8">{err} Start the Shelf server (<code>npm run dev</code> or <code>npm start</code>) to use AI.</div>}
        {status && (
          <>
            <Row label="Provider" hint="API keys stay on the Shelf server and are never sent to the browser.">
              <select className="select sm" style={{ width: 240 }} value={ai.provider} onChange={(e) => { const p = status.providers.find((x) => x.id === e.target.value); set({ provider: e.target.value, model: p?.defaultModel ?? '' }); }}>
                <option value="">Choose…</option>
                {status.providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.configured ? ' ✓' : ' (not configured)'}</option>)}
              </select>
            </Row>
            {provider && (
              <>
                <Row label="Model">
                  <div className="row">
                    {provider.models.length > 0 && <select className="select sm" style={{ width: 200 }} value={provider.models.includes(ai.model) ? ai.model : ''} onChange={(e) => set({ model: e.target.value })}><option value="">Custom…</option>{provider.models.map((m) => <option key={m}>{m}</option>)}</select>}
                    <input className="input sm" style={{ width: 180 }} placeholder="model id" value={ai.model} onChange={(e) => set({ model: e.target.value })} />
                  </div>
                </Row>
                <Row label="API configuration" hint={provider.fromEnv ? 'Configured through server environment variables.' : provider.configured ? `Configured${provider.baseUrl ? ` · ${provider.baseUrl}` : ''}.` : 'Not configured yet.'}>
                  {status.keyConfigAllowed ? <button className="btn sm" onClick={() => setKeyFor(provider)}>{provider.configured ? 'Update' : 'Configure'}</button> : <span className="small muted">Managed by the server admin</span>}
                </Row>
              </>
            )}
          </>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h3>Privacy — what may be shared</h3></div>
        <p className="small muted mb-8">When you use an AI feature, Shelf sends only the minimum context that feature needs, to the provider you chose. Every AI screen has a “What will be shared” preview showing the exact text. Book titles, authors, folders and basic metadata are always included when relevant.</p>
        <Row label="Notes & quotes" hint="Used for book Q&A, note organization, tutoring and “What did I learn?”"><Switch checked={ai.share.notes} onChange={(v) => set({ share: { ...ai.share, notes: v } })} /></Row>
        <Row label="Reviews"><Switch checked={ai.share.reviews} onChange={(v) => set({ share: { ...ai.share, reviews: v } })} /></Row>
        <Row label="Ratings"><Switch checked={ai.share.ratings} onChange={(v) => set({ share: { ...ai.share, ratings: v } })} /></Row>
        <Row label="Reading history & statistics" hint="Progress, pace, streaks and computed patterns."><Switch checked={ai.share.readingHistory} onChange={(v) => set({ share: { ...ai.share, readingHistory: v } })} /></Row>
      </div>
      <div className="card">
        <div className="card-head"><h3>How AI works in Shelf</h3></div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Progress, dates, pace, forecasts, streaks and statistics are always calculated by Shelf’s own engine. The AI only explains them.</li>
          <li>The AI never changes your progress, dates, ratings, metadata, goals or statistics. It proposes; you confirm.</li>
          <li>AI output is labelled <span className="ai-badge">✦ AI-generated</span> and stored separately from what you create.</li>
          <li>The AI hasn’t read your books’ full text unless you provided it; answers use metadata, your notes and general knowledge.</li>
        </ul>
        <button className="btn sm danger mt-16" onClick={async () => { if (confirm('Delete all AI-generated answers, concepts and connections?')) { await deleteAllAIData(); toast('AI data deleted'); } }}>Delete all AI-generated data</button>
      </div>
      {keyFor && <KeyModal p={keyFor} onClose={() => setKeyFor(null)} onSaved={(s) => { setStatus({ ...status!, providers: s }); setKeyFor(null); toast('Saved on the server'); }} />}
    </div>
  );
}

function KeyModal({ p, onClose, onSaved }: { p: ProviderStatus; onClose: () => void; onSaved: (s: ProviderStatus[]) => void }) {
  const [key, setKey] = useState('');
  const [base, setBase] = useState('');
  const [models, setModels] = useState('');
  const [err, setErr] = useState('');
  const save = async (clear = false) => {
    try {
      const r = await saveProviderConfig({ provider: p.id, apiKey: clear ? null : key || undefined, baseUrl: clear ? null : base || undefined, models: models ? models.split(',') : undefined });
      onSaved(r.providers);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal title={`Configure ${p.name}`} onClose={onClose} footer={<>{p.configured && !p.fromEnv && <button className="btn danger" onClick={() => save(true)}>Remove</button>}<span className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button></>}>
      <div className="col gap-12">
        <p className="small muted">The key is sent once to your Shelf server and stored in a private file there (<code>server/.data</code>). It is never returned to or stored in the browser. You can instead set it as an environment variable on the server.</p>
        {!p.needsBaseUrl || p.keyOptional ? <label className="field">API key{p.keyOptional ? ' (optional)' : ''}<input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.hasKey ? '•••••••• (saved)' : ''} /></label> : null}
        <label className="field">Base URL {p.needsBaseUrl ? '(required — e.g. http://localhost:11434/v1 for Ollama)' : '(optional)'}<input className="input" value={base} onChange={(e) => setBase(e.target.value)} placeholder={p.baseUrl ?? ''} /></label>
        <label className="field">Extra model ids (comma-separated, optional)<input className="input" value={models} onChange={(e) => setModels(e.target.value)} /></label>
        {err && <div className="notice bad">{err}</div>}
      </div>
    </Modal>
  );
}

function DataSettings() {
  const idx = useLibrary();
  const { toast } = useUI();
  const [erase, setErase] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [restore, setRestore] = useState<{ file: string; data: unknown } | null>(null);
  const stamp = idx.today;
  const csv = async (k: 'library' | 'history' | 'notes' | 'quotes' | 'readings') => { const rows = await tableRowsForExport(); download(`shelf-${k}-${stamp}.csv`, toCSV(rows[k]), 'text/csv'); };
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="card-head"><h3>Backup & restore</h3></div>
        <p className="small muted">A full backup contains everything: library, folders, sessions, notes, goals, projects, plans, concepts, AI records and settings. Your data lives in this browser — back up regularly.</p>
        <div className="row wrap mt-8">
          <button className="btn primary" onClick={async () => { download(`shelf-backup-${stamp}.json`, JSON.stringify(await exportBackup()), 'application/json'); toast('Backup downloaded'); }}>Download full backup</button>
          <label className="btn">Restore from backup…<input type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const data = JSON.parse(await f.text()); if (!validateBackup(data)) throw new Error('Not a Shelf backup file.'); setRestore({ file: f.name, data }); } catch (err) { toast((err as Error).message, { error: true }); } e.target.value = ''; }} /></label>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Export</h3></div>
        <div className="row wrap">
          <button className="btn" onClick={async () => { const rows = await tableRowsForExport(); download(`shelf-${stamp}.xls`, toSpreadsheetML({ Library: rows.library, 'Reading history': rows.history, Readings: rows.readings, Notes: rows.notes, Quotes: rows.quotes }), 'application/vnd.ms-excel'); }}>Spreadsheet (all sheets)</button>
          <button className="btn" onClick={() => csv('library')}>Library CSV</button>
          <button className="btn" onClick={() => csv('history')}>Reading history CSV</button>
          <button className="btn" onClick={() => csv('readings')}>Readings & ratings CSV</button>
          <button className="btn" onClick={() => csv('notes')}>Notes CSV</button>
          <button className="btn" onClick={() => csv('quotes')}>Quotes CSV</button>
          <button className="btn" onClick={async () => download(`shelf-${stamp}.json`, JSON.stringify((await exportBackup()).tables, null, 2), 'application/json')}>JSON</button>
        </div>
      </div>
      <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--bad) 40%, var(--border))' }}>
        <div className="card-head"><h3>Erase everything</h3></div>
        <p className="small muted">Permanently deletes your entire library, reading history, notes, goals, projects, AI data and settings from this browser. This cannot be undone. {idx.settings.sampleData && <b>Use this to remove the sample library.</b>}</p>
        <button className="btn danger mt-8" onClick={() => setErase(true)}>Erase everything…</button>
      </div>
      {erase && (
        <Modal title="Erase everything?" onClose={() => setErase(false)} footer={<><button className="btn" onClick={() => setErase(false)}>Cancel</button><button className="btn danger solid" disabled={confirmText !== 'ERASE'} onClick={async () => { await eraseEverything(); setErase(false); toast('All data erased'); }}>Permanently erase</button></>}>
          <p>This permanently deletes <b>{idx.itemList().length} items</b>, <b>{idx.sessions.length} reading sessions</b>, <b>{idx.snap.notes.length} notes & quotes</b>, and everything else stored in Shelf on this device.</p>
          <p className="mt-8 small muted">Consider downloading a backup first.</p>
          <label className="field mt-16">Type ERASE to confirm<input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></label>
        </Modal>
      )}
      {restore && (
        <Modal title="Restore backup" onClose={() => setRestore(null)} footer={<><button className="btn" onClick={() => setRestore(null)}>Cancel</button><button className="btn" onClick={async () => { const r = await restoreBackup(restore.data as never, 'merge'); setRestore(null); toast(`Merged ${r.restored} records`); }}>Merge</button><button className="btn danger solid" onClick={async () => { const r = await restoreBackup(restore.data as never, 'replace'); setRestore(null); toast(`Restored ${r.restored} records`); }}>Replace all</button></>}>
          <p><b>{restore.file}</b></p>
          <p className="small muted mt-8">“Replace all” deletes your current data and restores the backup exactly. “Merge” adds the backup’s records and overwrites records with the same id.</p>
        </Modal>
      )}
    </div>
  );
}
