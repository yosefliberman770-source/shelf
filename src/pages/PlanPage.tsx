import { useMemo, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { complete, completeJSON } from '../ai/client';
import { BASE_SYSTEM } from '../ai/context';
import { AIErrorNotice, AIOff, SharedPreview, useAICall, useAIReady, useConcierge } from '../ai/ui';
import { LineChart, SERIES } from '../components/charts';
import { AIBadge, Cover, DeadlineChip, Empty, ItemPicker, Markdown, Modal, ProgressBar, Tabs } from '../components/common';
import { ForecastSummary } from '../components/library';
import { deletePlan, deleteGoal, deleteProject, saveGoal, savePlan, saveProject, updateFolder, updateItem, updateSettings } from '../db/actions';
import type { DateKey, Goal, GoalMetric, GoalPeriod, Plan, PlanTarget, WeekSchedule } from '../db/types';
import { addDays, diffDays, formatKey, WEEKDAYS } from '../engine/dates';
import { itemForecast, libraryForecast, overallPace, paceTable, projectForecast } from '../engine/forecast';
import { evaluate, planWithin, resolveTarget, type Scenario, type ScenarioResult, timeBudget } from '../engine/future';
import { goalMetricLabel, goalProgress } from '../engine/goals';
import { isUnfinished, type LibraryIndex } from '../engine/model';
import { constantSchedule, project } from '../engine/schedule';
import { fmtDuration, fmtNum, fmtUnits, UNITS } from '../engine/units';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Tab = 'goals' | 'projects' | 'simulator' | 'whatif' | 'math' | 'budget';

export default function PlanPage() {
  const idx = useLibrary();
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split('/')[2] ?? 'goals';
  const tab = (['goals', 'projects', 'simulator', 'whatif', 'math', 'budget'].includes(seg) ? seg : seg === 'project' ? 'projects' : 'goals') as Tab;
  useConcierge('Plan', ['Help me finish my history project in 90 days.', 'Is my annual goal realistic?', 'How should I split my reading between projects?'], () => {
    const lib = libraryForecast(idx);
    return `GOALS:\n${idx.snap.goals.map((g) => { const p = goalProgress(idx, g); return `- ${g.period} ${g.target} ${g.metric}: ${fmtNum(p.value)} so far (window ${p.from}..${p.to}), projected ${fmtNum(p.projected)}`; }).join('\n') || 'none'}\n\nPROJECTS:\n${idx.snap.projects.map((p) => { const f = projectForecast(idx, p.id); return `- ${p.name}: ${fmtNum(f.remaining)} pages left, pace ${fmtNum(f.pace, 1)}/day, required ${fmtNum(f.requiredPace, 1)}, est ${f.estimatedFinish ?? 'n/a'}, deadline ${p.deadline ?? 'none'}`; }).join('\n') || 'none'}\n\nLIBRARY: ${fmtNum(lib.remaining)} unfinished pages, est ${lib.estimatedFinish ?? 'n/a'}`;
  }, [idx]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Plan</h1><div className="sub">Goals, projects and schedules — calculated from your actual reading.</div></div></div>
      <Tabs<Tab> value={tab} onChange={(t) => nav(`/plan/${t}`)} tabs={[
        { id: 'goals', label: 'Goals' }, { id: 'projects', label: 'Projects' }, { id: 'simulator', label: 'Plan simulator' }, { id: 'whatif', label: 'What-If Lab' }, { id: 'math', label: 'Library math' }, { id: 'budget', label: 'Time budget' },
      ]} />
      <Routes>
        <Route index element={<GoalsTab idx={idx} />} />
        <Route path="goals" element={<GoalsTab idx={idx} />} />
        <Route path="projects" element={<ProjectsTab idx={idx} />} />
        <Route path="project/:id" element={<ProjectDetail />} />
        <Route path="simulator" element={<Simulator idx={idx} />} />
        <Route path="whatif" element={<WhatIfLab idx={idx} />} />
        <Route path="math" element={<LibraryMath idx={idx} />} />
        <Route path="budget" element={<TimeBudget idx={idx} />} />
      </Routes>
    </div>
  );
}

// ── Goals ──────────────────────────────────────────────────────────────

function GoalsTab({ idx }: { idx: LibraryIndex }) {
  const [edit, setEdit] = useState<Partial<Goal> | null>(null);
  const goals = idx.snap.goals;
  const periods: GoalPeriod[] = ['daily', 'weekly', 'monthly', 'annual'];
  return (
    <div className="col gap-16">
      <div className="row between"><h2>Reading goals</h2><button className="btn primary" onClick={() => setEdit({ period: 'daily', metric: 'pages', target: 20 })}>＋ New goal</button></div>
      {goals.length === 0 ? <div className="card"><Empty icon="🎯" title="No goals yet">Set daily, weekly, monthly or annual goals — pages, minutes, books, units or sessions. Book, folder and project goals live on those pages.</Empty></div> : (
        <div className="grid auto">
          {periods.flatMap((per) => goals.filter((g) => g.period === per)).map((g) => {
            const p = goalProgress(idx, g);
            return (
              <div key={g.id} className="card" style={{ opacity: g.active ? 1 : 0.55 }}>
                <div className="card-head"><h3 style={{ textTransform: 'capitalize' }}>{g.period}{g.year ? ` ${g.year}` : ''}</h3><div className="row"><button className="btn xs ghost" onClick={() => setEdit(g)}>Edit</button></div></div>
                <div className="stat"><span className="value">{fmtNum(p.value)} <span className="faint" style={{ fontSize: 15 }}>/ {fmtNum(g.target)} {goalMetricLabel(g)}</span></span></div>
                <ProgressBar value={p.ratio} />
                <div className="small muted mt-8">{formatKey(p.from, idx.today, { short: true })} – {formatKey(p.to, idx.today, { short: true })}</div>
                {g.period !== 'daily' && (
                  <div className="small mt-8">
                    {p.value >= p.expected ? <span className="chip good">On pace</span> : <span className="chip warn">{fmtNum(p.expected - p.value, 1)} behind even pace</span>}{' '}
                    <span className="muted">Projected {fmtNum(p.projected)}{p.requiredPerDay !== undefined && p.ratio < 1 ? ` · ${fmtNum(p.requiredPerDay, 1)}/reading day needed` : ''}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="notice small">Goals count only eligible reading days — configure non-reading days in <Link to="/settings" style={{ textDecoration: 'underline' }}>Settings</Link>. Book-specific targets and deadlines are set on each book; folder deadlines on each folder; project deadlines on projects.</div>
      {edit && <GoalEditor idx={idx} goal={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function GoalEditor({ idx, goal, onClose }: { idx: LibraryIndex; goal: Partial<Goal>; onClose: () => void }) {
  const [g, setG] = useState(goal);
  return (
    <Modal title={goal.id ? 'Edit goal' : 'New goal'} onClose={onClose} footer={<>{goal.id && <button className="btn danger" onClick={async () => { await deleteGoal(goal.id!); onClose(); }}>Delete</button>}<span className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={async () => { await saveGoal({ ...(g as Goal), target: Number(g.target) || 1 }); onClose(); }}>Save</button></>}>
      <div className="fields">
        <label className="field">Period<select className="select" value={g.period} onChange={(e) => setG({ ...g, period: e.target.value as GoalPeriod, year: e.target.value === 'annual' ? Number(idx.today.slice(0, 4)) : undefined })}>{['daily', 'weekly', 'monthly', 'annual'].map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="field">Measure<select className="select" value={g.metric} onChange={(e) => setG({ ...g, metric: e.target.value as GoalMetric })}>{['pages', 'minutes', 'books', 'units', 'sessions'].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="field">Target<input className="input" type="number" min={1} value={g.target ?? ''} onChange={(e) => setG({ ...g, target: Number(e.target.value) })} /></label>
        {g.period === 'annual' && <label className="field">Year<input className="input" type="number" value={g.year ?? ''} onChange={(e) => setG({ ...g, year: Number(e.target.value) })} /></label>}
        <label className="check"><input type="checkbox" checked={g.active ?? true} onChange={(e) => setG({ ...g, active: e.target.checked })} /> Active</label>
      </div>
      <p className="small faint mt-16">“Units” counts any unit (chapters, lessons, episodes…) as logged. “Pages” counts page-equivalents.</p>
    </Modal>
  );
}

// ── Projects ───────────────────────────────────────────────────────────

function ProjectsTab({ idx }: { idx: LibraryIndex }) {
  const nav = useNavigate();
  const create = async () => { const n = prompt('Project name (e.g. “Roman Republic Project”)'); if (n?.trim()) nav(`/plan/project/${await saveProject({ name: n.trim() })}`); };
  return (
    <div className="col gap-16">
      <div className="row between"><div><h2>Projects</h2><div className="small muted">A folder organizes; a project is a temporary mission with a goal, books from anywhere, and (optionally) a deadline.</div></div><button className="btn primary" onClick={create}>＋ New project</button></div>
      {idx.snap.projects.length === 0 ? <div className="card"><Empty icon="🎯" title="No projects yet" action={<button className="btn" onClick={create}>Create a project</button>}>Group books from different folders into a mission, e.g. “Finish 7 books on the Roman Republic by June 1”.</Empty></div> : (
        <div className="grid auto">
          {idx.snap.projects.map((p) => {
            const f = projectForecast(idx, p.id);
            return (
              <Link key={p.id} to={`/plan/project/${p.id}`} className="card" style={{ display: 'block' }}>
                <div className="card-head"><h3>{p.name}</h3>{p.source === 'ai' ? <AIBadge label="AI path" /> : <span className="chip">{p.status}</span>}</div>
                <div className="row mb-8">{p.itemIds.slice(0, 6).map((id) => idx.items.get(id)).filter(Boolean).map((i) => <Cover key={i!.id} item={i!} width={30} />)}</div>
                <div className="small">{f.completedCount}/{f.itemCount} books · {fmtNum(f.completed)} / {fmtNum(f.total)} pages</div>
                <ProgressBar value={f.percent} />
                <div className="row wrap mt-8 small">
                  <span className="muted">Pace {fmtNum(f.pace, 1)}/day{f.requiredPace !== undefined ? ` · needs ${fmtNum(f.requiredPace, 1)}` : ''}</span>
                  <DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectDetail() {
  const idx = useLibrary();
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useUI();
  const p = idx.projects.get(id!);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  if (!p) return <Empty title="Project not found" />;
  const f = projectForecast(idx, p.id);
  const items = idx.itemsInProject(p);
  return (
    <div className="col gap-16">
      <div className="row wrap between">
        <div>
          <input className="input" style={{ fontSize: 22, fontFamily: 'var(--serif)', border: 0, padding: 0, background: 'transparent', height: 'auto' }} defaultValue={p.name} onBlur={(e) => e.target.value.trim() && saveProject({ ...p, name: e.target.value.trim() })} />
          <input className="input sm" style={{ border: 0, padding: 0, background: 'transparent' }} placeholder="Describe the mission…" defaultValue={p.description} onBlur={(e) => saveProject({ ...p, description: e.target.value })} />
        </div>
        <div className="row wrap">
          {p.source === 'ai' && <AIBadge label="Created from an AI path" />}
          <select className="select sm" style={{ width: 120 }} value={p.status} onChange={(e) => saveProject({ ...p, status: e.target.value as typeof p.status })}><option value="active">Active</option><option value="done">Done</option><option value="archived">Archived</option></select>
          <Link className="btn sm" to={`/plan/whatif?project=${p.id}`}>What-if…</Link>
          <button className="btn sm danger" onClick={async () => { if (confirm('Delete this project? Its books stay in your library.')) { await deleteProject(p.id); nav('/plan/projects'); } }}>Delete</button>
        </div>
      </div>
      <div className="card row wrap">
        <label className="field">Deadline<input className="input sm" type="date" value={p.deadline ?? ''} onChange={(e) => saveProject({ ...p, deadline: e.target.value || undefined })} /></label>
        <label className="field">Planned pace (pages/day)<input className="input sm" type="number" min={0} value={p.pace ?? ''} onChange={(e) => saveProject({ ...p, pace: e.target.value ? Number(e.target.value) : undefined })} /></label>
        {p.schedule && <div className="field">Weekly schedule<span className="small">{p.schedule.map((v, d) => `${WEEKDAYS[d]} ${fmtNum(v)}`).join(' · ')} <button className="btn xs ghost" onClick={() => saveProject({ ...p, schedule: undefined })}>Clear</button></span></div>}
      </div>
      <ForecastSummary f={f} />
      <div className="card">
        <div className="card-head"><h3>Books ({items.length})</h3><button className="btn sm" onClick={() => { setPick(p.itemIds); setPicking(true); }}>Edit books</button></div>
        {items.length === 0 ? <div className="small muted">Add books from any folder.</div> : items.map((i, n) => {
          const itf = itemForecast(idx, i);
          return (
            <div key={i.id} className="book-row">
              <span className="faint num" style={{ width: 20 }}>{n + 1}</span>
              <Cover item={i} width={32} />
              <Link to={`/item/${i.id}`} className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div><div className="small muted">{idx.authorLine(i)} · {i.total ? fmtUnits(i, i.total) : 'length unknown'}</div></Link>
              <div style={{ width: 140 }}>{itf.percent !== undefined && <><ProgressBar value={i.status === 'read' ? 1 : itf.percent} thin /><span className="tiny faint">{i.status === 'read' ? 'Finished' : `${Math.round((itf.percent ?? 0) * 100)}%`}</span></>}</div>
              <div className="col gap-4">
                <button className="btn xs ghost" disabled={n === 0} onClick={() => { const ids = [...p.itemIds]; const k = ids.indexOf(i.id); [ids[k - 1], ids[k]] = [ids[k], ids[k - 1]]; saveProject({ ...p, itemIds: ids }); }}>↑</button>
              </div>
            </div>
          );
        })}
      </div>
      {picking && (
        <Modal title="Books in this project" onClose={() => setPicking(false)} footer={<button className="btn primary" onClick={async () => { await saveProject({ ...p, itemIds: pick }); setPicking(false); toast('Project updated'); }}>Save</button>}>
          <ItemPicker idx={idx} value={pick} onChange={setPick} />
        </Modal>
      )}
    </div>
  );
}

// ── Target selection shared by the simulator and the What-If Lab ───────

function TargetSelect({ idx, value, onChange }: { idx: LibraryIndex; value: PlanTarget; onChange: (t: PlanTarget) => void }) {
  const v = value.kind === 'library' ? 'library' : `${value.kind}:${value.id}`;
  return (
    <select className="select" value={v} onChange={(e) => {
      const [kind, id] = e.target.value.split(':');
      onChange(kind === 'library' ? { kind: 'library' } : ({ kind, id } as PlanTarget));
    }}>
      <option value="library">Entire unfinished library</option>
      {idx.snap.projects.length > 0 && <optgroup label="Projects">{idx.snap.projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}</optgroup>}
      {idx.snap.folders.length > 0 && <optgroup label="Folders">{idx.snap.folders.map((f) => <option key={f.id} value={`folder:${f.id}`}>{idx.folderPath(f.id).map((x) => x.name).join(' / ')}</option>)}</optgroup>}
      <optgroup label="Books in progress / to read">{idx.itemList().filter(isUnfinished).map((i) => <option key={i.id} value={`item:${i.id}`}>{i.title}</option>)}</optgroup>
    </select>
  );
}

function useTargetFromQuery(): PlanTarget {
  const [params] = useSearchParams();
  if (params.get('folder')) return { kind: 'folder', id: params.get('folder')! };
  if (params.get('project')) return { kind: 'project', id: params.get('project')! };
  if (params.get('item')) return { kind: 'item', id: params.get('item')! };
  return { kind: 'library' };
}

/** Persist a chosen plan onto the real target — only called on explicit “Apply”. */
async function applyToTarget(idx: LibraryIndex, target: PlanTarget, schedule: WeekSchedule, deadline?: DateKey) {
  const eligible = schedule.filter((v) => v > 0);
  const avg = eligible.length ? eligible.reduce((a, b) => a + b, 0) / eligible.length : 0;
  const uniform = eligible.every((v) => Math.abs(v - eligible[0]) < 1e-9);
  switch (target.kind) {
    case 'project': {
      const p = idx.projects.get(target.id);
      if (p) await saveProject({ ...p, pace: Math.round(avg * 10) / 10, schedule: uniform ? undefined : schedule, deadline: deadline ?? p.deadline });
      break;
    }
    case 'folder':
      await updateFolder(target.id, { goalPace: Math.round(avg * 10) / 10, ...(deadline ? { deadline } : {}) });
      break;
    case 'item':
      await updateItem(target.id, { dailyTarget: Math.round(avg * 10) / 10, ...(deadline ? { deadline } : {}) });
      break;
    case 'library': {
      const g = idx.snap.goals.find((x) => x.period === 'daily' && x.metric === 'pages');
      await saveGoal({ ...(g ?? {}), period: 'daily', metric: 'pages', target: Math.round(avg) });
      await updateSettings({ defaultPace: Math.round(avg) });
      break;
    }
  }
}

function ScheduleEditor({ value, onChange }: { value: WeekSchedule; onChange: (s: WeekSchedule) => void }) {
  return (
    <div className="row wrap gap-4">
      {WEEKDAYS.map((d, i) => (
        <label key={d} className="field" style={{ width: 66 }}>
          <span className="tiny">{d}</span>
          <input className="input sm" type="number" min={0} value={value[i] || ''} placeholder="0" onChange={(e) => { const s = [...value] as WeekSchedule; s[i] = Math.max(0, Number(e.target.value) || 0); onChange(s); }} />
        </label>
      ))}
    </div>
  );
}

// ── Plan simulator ─────────────────────────────────────────────────────

interface Draft { name: string; schedule: WeekSchedule; deadline?: DateKey }

function Simulator({ idx }: { idx: LibraryIndex }) {
  const { toast } = useUI();
  const [target, setTarget] = useState<PlanTarget>(useTargetFromQuery());
  const t = resolveTarget(idx, target);
  const base = evaluate(idx, t);
  const cur = Math.max(1, Math.round(base.schedule ? base.weekly / 7 : 20));
  const [drafts, setDrafts] = useState<Draft[]>([
    { name: 'Plan A', schedule: constantSchedule(20) },
    { name: 'Plan B', schedule: constantSchedule(30) },
    { name: 'Plan C', schedule: [80, 50, 50, 50, 50, 50, 80] },
  ]);
  const results = drafts.map((d) => evaluate(idx, t, { schedule: d.schedule, deadline: d.deadline ?? t.deadline }));
  const saved = idx.snap.plans.filter((p) => JSON.stringify(p.target) === JSON.stringify(target));
  const chart = useMemo(() => {
    const horizon = Math.min(3650, Math.max(30, ...results.map((r) => (r.finish ? diffDays(idx.today, r.finish) + 5 : 60))));
    const stepDays = Math.max(1, Math.ceil(horizon / 60));
    return drafts.map((d, i) => {
      const r = results[i];
      const pts: { x: string; y: number }[] = [];
      let rem = r.remaining;
      for (let day = 0; day <= horizon; day += stepDays) {
        const k = addDays(idx.today, day);
        pts.push({ x: k, y: Math.max(0, rem) });
        for (let j = 0; j < stepDays; j++) {
          const dk = addDays(idx.today, day + j);
          const wd = new Date(`${dk}T12:00`).getDay();
          if (!r.rules.weekdays.includes(wd) && !r.rules.dates.includes(dk)) rem -= d.schedule[wd];
        }
      }
      return { name: d.name, points: pts, color: SERIES[i % 8] };
    });
  }, [drafts, results, idx.today]);
  return (
    <div className="col gap-16">
      <div className="card row wrap">
        <label className="field" style={{ minWidth: 280, flex: 1 }}>Simulate for<TargetSelect idx={idx} value={target} onChange={setTarget} /></label>
        <div className="stat"><span className="label">Remaining</span><span className="value">{fmtNum(base.remaining)}</span><span className="hint">pages</span></div>
        <div className="stat"><span className="label">Current pace</span><span className="value">{base.schedule ? fmtNum(base.weekly / 7, 1) : '—'}</span><span className="hint">pages/day</span></div>
        <div className="stat"><span className="label">Deadline</span><span className="value" style={{ fontSize: 16 }}>{t.deadline ? formatKey(t.deadline) : 'No deadline yet'}</span></div>
      </div>
      <div className="notice small">Hypothetical plans never change your real goals. Choose <b>Apply plan</b> to make one real.</div>
      <div className="grid c3">
        {drafts.map((d, i) => {
          const r = results[i];
          return (
            <div key={i} className="card" style={{ borderTop: `3px solid ${SERIES[i % 8]}` }}>
              <div className="card-head">
                <input className="input sm" style={{ fontWeight: 600, border: 0, padding: 0, background: 'transparent' }} value={d.name} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                {drafts.length > 1 && <button className="btn xs ghost" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>✕</button>}
              </div>
              <div className="row wrap gap-4 mb-8">
                {[cur, 20, 30, 50].map((v) => <button key={v} className="chip" onClick={() => setDrafts(drafts.map((x, j) => (j === i ? { ...x, schedule: constantSchedule(v, idx.planningRules.weekdays) } : x)))}>{v}/day</button>)}
              </div>
              <ScheduleEditor value={d.schedule} onChange={(s) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, schedule: s } : x)))} />
              <label className="field mt-8">Deadline (optional)<input className="input sm" type="date" value={d.deadline ?? ''} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, deadline: e.target.value || undefined } : x)))} /></label>
              <ResultBlock r={r} />
              <div className="row mt-8">
                <button className="btn sm primary" onClick={async () => { if (confirm(`Apply ${d.name} to ${t.label}? This updates the real plan.`)) { await applyToTarget(idx, target, d.schedule, d.deadline); toast(`${d.name} applied to ${t.label}`); } }}>Apply plan</button>
                <button className="btn sm" onClick={async () => { await savePlan({ name: d.name, target, schedule: d.schedule, deadline: d.deadline }); toast('Scenario saved'); }}>Save</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row"><button className="btn" onClick={() => setDrafts([...drafts, { name: `Plan ${String.fromCharCode(65 + drafts.length)}`, schedule: constantSchedule(cur) }])}>＋ Add plan</button></div>
      <div className="card">
        <div className="card-head"><h3>Pages remaining over time</h3></div>
        {base.remaining > 0 ? <LineChart series={chart} format={(v) => fmtNum(v)} xFormat={(x) => formatKey(x, idx.today, { short: true })} /> : <div className="small muted">Nothing left to read for this target.</div>}
      </div>
      {saved.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Saved scenarios</h3></div>
          {saved.map((p: Plan) => {
            const r = evaluate(idx, t, { schedule: p.schedule, deadline: p.deadline ?? t.deadline });
            return (
              <div key={p.id} className="row between">
                <span><b>{p.name}</b> <span className="small muted">{p.schedule.map((v, d) => `${WEEKDAYS[d][0]}${fmtNum(v)}`).join(' ')} → {formatKey(r.finish)}</span></span>
                <span className="row"><button className="btn xs" onClick={() => setDrafts([...drafts, { name: p.name, schedule: p.schedule, deadline: p.deadline }])}>Load</button><button className="btn xs ghost" onClick={() => deletePlan(p.id)}>Delete</button></span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultBlock({ r, compareTo }: { r: ScenarioResult; compareTo?: ScenarioResult }) {
  const shift = compareTo?.finish && r.finish ? diffDays(compareTo.finish, r.finish) : undefined;
  return (
    <dl className="kv mt-8">
      <dt>Per week</dt><dd>{fmtNum(r.weekly)} pages</dd>
      <dt>Reading days</dt><dd>{r.readingDays !== undefined ? fmtNum(r.readingDays, 1) : '—'}</dd>
      <dt>Completion</dt><dd><b>{r.remaining <= 0 ? 'Done' : r.finish ? formatKey(r.finish) : 'Never at this pace'}</b>{shift ? <span className={`small ${shift < 0 ? '' : ''}`}> ({shift < 0 ? `${-shift} days sooner` : `${shift} days later`})</span> : null}</dd>
      {r.deadline && <><dt>Deadline</dt><dd>{formatKey(r.deadline)} {r.meetsDeadline ? <span className="chip good">met</span> : <span className="chip warn">missed</span>}</dd></>}
      {r.requiredPace !== undefined && <><dt>Required pace</dt><dd>{fmtNum(r.requiredPace, 1)}/day</dd></>}
      {r.totalTimeSec !== undefined && <><dt>Reading time needed</dt><dd>{fmtDuration(r.totalTimeSec)}</dd></>}
    </dl>
  );
}

// ── What-If Lab ────────────────────────────────────────────────────────

function WhatIfLab({ idx }: { idx: LibraryIndex }) {
  const { toast } = useUI();
  const [target, setTarget] = useState<PlanTarget>(useTargetFromQuery());
  const [s, setS] = useState<Scenario & { addCount?: number; addLength?: number; morningMinutes?: number; sundayHours?: number }>({});
  const t = resolveTarget(idx, target);
  const scenario: Scenario = {
    paceDelta: s.paceDelta,
    excludeWeekdays: s.excludeWeekdays,
    weekdaysOnly: s.weekdaysOnly,
    minutesPerDay: s.morningMinutes,
    extraMinutesByWeekday: s.sundayHours ? { 0: s.sundayHours * 60 } : undefined,
    addItems: s.addCount ? { count: s.addCount, length: s.addLength ?? 300 } : undefined,
    removeItemIds: s.removeItemIds,
    deadlineShiftDays: s.deadlineShiftDays,
    deadline: s.deadline,
    pace: s.pace,
  };
  const base = evaluate(idx, t);
  const res = evaluate(idx, t, scenario);
  const ppm = idx.pagesPerMinute();
  const impacts = useMemo(() => {
    const out: { label: string; before?: DateKey; after?: DateKey; deadline?: DateKey }[] = [];
    const addTargets: PlanTarget[] = [{ kind: 'library' }, ...idx.snap.projects.filter((p) => p.status === 'active').map((p) => ({ kind: 'project' as const, id: p.id })), ...idx.snap.folders.filter((f) => f.deadline || f.goalPace).map((f) => ({ kind: 'folder' as const, id: f.id }))];
    for (const tt of addTargets) {
      if (JSON.stringify(tt) === JSON.stringify(target)) continue;
      const info = resolveTarget(idx, tt);
      const sc: Scenario = { ...scenario, addItems: undefined, removeItemIds: s.removeItemIds, deadline: undefined, deadlineShiftDays: undefined };
      out.push({ label: info.label, before: evaluate(idx, info).finish, after: evaluate(idx, info, sc).finish, deadline: info.deadline });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, JSON.stringify(scenario), JSON.stringify(target)]);
  const toggleWd = (d: number) => setS({ ...s, excludeWeekdays: s.excludeWeekdays?.includes(d) ? s.excludeWeekdays.filter((x) => x !== d) : [...(s.excludeWeekdays ?? []), d] });
  return (
    <div className="col gap-16">
      <div className="card row wrap">
        <label className="field" style={{ minWidth: 280, flex: 1 }}>Experiment on<TargetSelect idx={idx} value={target} onChange={(tt) => { setTarget(tt); setS({}); }} /></label>
        <button className="btn ghost" onClick={() => setS({})}>Reset</button>
      </div>
      <div className="grid c2">
        <div className="card col gap-12">
          <h3>What if…</h3>
          <label className="field">…I read more (or less) each day? <span className="faint">{s.paceDelta ? `${s.paceDelta > 0 ? '+' : ''}${s.paceDelta} pages/day` : 'no change'}</span>
            <input type="range" min={-30} max={60} step={5} value={s.paceDelta ?? 0} onChange={(e) => setS({ ...s, paceDelta: Number(e.target.value) || undefined })} />
          </label>
          <div className="field">…I stop reading on certain days?
            <div className="row wrap gap-4">{WEEKDAYS.map((d, i) => <button key={d} className={`chip ${s.excludeWeekdays?.includes(i) ? 'on' : ''}`} onClick={() => toggleWd(i)}>No {d}</button>)}</div>
            <label className="check small"><input type="checkbox" checked={!!s.weekdaysOnly} onChange={(e) => setS({ ...s, weekdaysOnly: e.target.checked || undefined })} /> Only read on weekdays</label>
          </div>
          <label className="field">…I read a fixed time every morning (minutes)? {!ppm && <span className="tiny faint">needs timed sessions to convert minutes → pages</span>}
            <input className="input sm" type="number" min={0} disabled={!ppm} value={s.morningMinutes ?? ''} onChange={(e) => setS({ ...s, morningMinutes: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 30" />
          </label>
          <label className="field">…I add extra hours on Sunday?
            <input className="input sm" type="number" min={0} step={0.5} disabled={!ppm} value={s.sundayHours ?? ''} onChange={(e) => setS({ ...s, sundayHours: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 2" />
          </label>
          <div className="field">…I add books?
            <div className="row"><input className="input sm" type="number" min={0} value={s.addCount ?? ''} placeholder="how many" onChange={(e) => setS({ ...s, addCount: e.target.value ? Number(e.target.value) : undefined })} /><span className="faint small">×</span><input className="input sm" type="number" min={1} value={s.addLength ?? ''} placeholder="300 pages each" onChange={(e) => setS({ ...s, addLength: e.target.value ? Number(e.target.value) : undefined })} /></div>
          </div>
          {t.items.length > 1 && (
            <details className="field"><summary style={{ cursor: 'pointer' }}>…I remove books? {s.removeItemIds?.length ? `(${s.removeItemIds.length})` : ''}</summary>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>{t.items.filter((i) => i.status !== 'read').map((i) => <label key={i.id} className="check tree-row"><input type="checkbox" checked={!!s.removeItemIds?.includes(i.id)} onChange={(e) => setS({ ...s, removeItemIds: e.target.checked ? [...(s.removeItemIds ?? []), i.id] : s.removeItemIds?.filter((x) => x !== i.id) })} /> <span className="ellipsis">{i.title}</span></label>)}</div>
            </details>
          )}
          <div className="field">…I move the deadline?
            <div className="row wrap">
              <input className="input sm" style={{ width: 170 }} type="date" value={s.deadline ?? ''} onChange={(e) => setS({ ...s, deadline: e.target.value || undefined, deadlineShiftDays: undefined })} />
              {t.deadline && [-14, -7, 7, 14, 30].map((d) => <button key={d} className={`chip ${s.deadlineShiftDays === d ? 'on' : ''}`} onClick={() => setS({ ...s, deadline: undefined, deadlineShiftDays: s.deadlineShiftDays === d ? undefined : d })}>{d > 0 ? '+' : ''}{d}d</button>)}
            </div>
          </div>
        </div>
        <div className="col gap-16">
          <div className="grid c2">
            <div className="card"><div className="card-head"><h3>Today’s reality</h3></div><ResultBlock r={base} /></div>
            <div className="card" style={{ borderColor: 'var(--accent)' }}><div className="card-head"><h3>What-if</h3><span className="chip accent">hypothetical</span></div><ResultBlock r={res} compareTo={base} /></div>
          </div>
          {impacts.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Ripple effects</h3><span className="small faint">same habit change, other targets</span></div>
              {impacts.map((im) => (
                <div key={im.label} className="row between small">
                  <span className="ellipsis">{im.label}</span>
                  <span className="nowrap">{formatKey(im.before)} → <b>{formatKey(im.after)}</b>{im.deadline && im.after ? im.after <= im.deadline ? <span className="chip good" style={{ marginLeft: 6 }}>meets deadline</span> : <span className="chip warn" style={{ marginLeft: 6 }}>misses deadline</span> : null}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card row wrap">
            <span className="small muted grow">Nothing changes until you apply it.</span>
            <button className="btn primary" disabled={!res.schedule} onClick={async () => { if (confirm(`Apply this scenario’s schedule${res.deadline ? ' and deadline' : ''} to ${t.label}?`)) { await applyToTarget(idx, target, res.schedule!, s.deadline || s.deadlineShiftDays ? res.deadline : undefined); toast('Applied'); } }}>Apply to {t.label}</button>
          </div>
        </div>
      </div>
      <AIWhatIfPlanner idx={idx} />
    </div>
  );
}

interface ParsedPlan { targetKind: 'library' | 'folder' | 'project' | 'item'; targetName?: string; days?: number; deadline?: string; maxMinutesPerDay?: number }

function AIWhatIfPlanner({ idx }: { idx: LibraryIndex }) {
  const ready = useAIReady();
  const { toast } = useUI();
  const [text, setText] = useState('I want to finish my history project in 60 days but don’t want to read more than 45 minutes a day.');
  const { loading, error, run } = useAICall();
  const [out, setOut] = useState<{ plan: ReturnType<typeof planWithin>; target: PlanTarget; label: string; explanation: string } | null>(null);
  if (!ready) return <div className="card"><div className="card-head"><h3>✦ Plan in plain language</h3></div><AIOff compact /></div>;
  const catalog = [
    ...idx.snap.projects.map((p) => `project | ${p.name}`),
    ...idx.snap.folders.map((f) => `folder | ${idx.folderPath(f.id).map((x) => x.name).join(' / ')}`),
    ...idx.itemList().filter(isUnfinished).slice(0, 80).map((i) => `item | ${i.title}`),
  ].join('\n');
  const go = () => run(async (signal) => {
    // 1. AI parses the request into a structured spec.
    const { data } = await completeJSON<ParsedPlan>({ system: 'You convert reading-plan requests into JSON. Match the target to the closest entry in the catalog by name. Return {"targetKind":"library|folder|project|item","targetName":"exact catalog name or omitted","days":number|null,"deadline":"YYYY-MM-DD"|null,"maxMinutesPerDay":number|null}.', messages: [{ role: 'user', content: `Today is ${idx.today}.\nCATALOG:\n${catalog}\n\nREQUEST: ${text}` }], maxTokens: 400 }, signal);
    // 2. Resolve against real data; 3. deterministic calculation.
    let target: PlanTarget = { kind: 'library' };
    if (data.targetKind === 'project') { const p = idx.snap.projects.find((x) => x.name === data.targetName) ?? idx.snap.projects.find((x) => data.targetName && x.name.toLowerCase().includes(data.targetName.toLowerCase())); if (p) target = { kind: 'project', id: p.id }; }
    if (data.targetKind === 'folder') { const f = idx.snap.folders.find((x) => data.targetName?.split(' / ').pop() === x.name); if (f) target = { kind: 'folder', id: f.id }; }
    if (data.targetKind === 'item') { const i = idx.itemList().find((x) => x.title === data.targetName); if (i) target = { kind: 'item', id: i.id }; }
    const info = resolveTarget(idx, target);
    const days = data.deadline ? diffDays(idx.today, data.deadline) + 1 : data.days ?? 90;
    const plan = planWithin(idx, info, Math.max(1, days), data.maxMinutesPerDay ?? undefined);
    // 4. AI explains the deterministic result.
    const facts = `Target: ${info.label}. Remaining: ${fmtNum(plan.remaining)} pages. Deadline: ${plan.deadline} (${days} days). Required pace: ${fmtNum(plan.requiredPace, 1)} pages per reading day. Measured speed: ${plan.pagesPerMinute ? `${fmtNum(plan.pagesPerMinute * 60)} pages/hour` : 'unknown'}. Minutes/day needed: ${plan.minutesNeeded !== undefined ? fmtNum(plan.minutesNeeded) : 'unknown'}. Daily limit: ${data.maxMinutesPerDay ?? 'none'}. Feasible within limit: ${plan.feasible === undefined ? 'unknown' : plan.feasible ? 'yes' : 'no'}. Finish if reading exactly the limit: ${plan.finishAtCap ?? 'n/a'}.`;
    const exp = await complete({ system: BASE_SYSTEM, messages: [{ role: 'user', content: `Explain this reading plan to the reader in 3–5 sentences. Use the numbers exactly as given; do not recompute. If it isn't feasible, suggest realistic options (extend deadline, drop a book, add time on some days).\n\n${facts}` }], maxTokens: 500 }, signal);
    setOut({ plan, target, label: info.label, explanation: exp.text });
  });
  return (
    <div className="card">
      <div className="card-head"><h3>✦ Plan in plain language</h3><AIBadge label="AI parses & explains · engine calculates" /></div>
      <div className="row"><input className="input" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn ai" disabled={loading} onClick={go}>{loading ? 'Planning…' : 'Plan it'}</button></div>
      <div className="mt-8"><SharedPreview req={{ system: '', messages: [{ role: 'user', content: `CATALOG:\n${catalog}\n\nREQUEST: ${text}` }] }} /></div>
      <AIErrorNotice error={error} />
      {out && (
        <div className="grid c2 mt-16">
          <div className="card flat">
            <div className="small muted mb-8">Calculated by Shelf’s engine for <b>{out.label}</b></div>
            <dl className="kv">
              <dt>Remaining</dt><dd>{fmtNum(out.plan.remaining)} pages</dd>
              <dt>Deadline</dt><dd>{formatKey(out.plan.deadline)}</dd>
              <dt>Required pace</dt><dd>{fmtNum(out.plan.requiredPace, 1)} pages/day</dd>
              <dt>Time needed</dt><dd>{out.plan.minutesNeeded !== undefined ? `${fmtNum(out.plan.minutesNeeded)} min/day` : 'time some sessions first'}</dd>
              <dt>Fits your limit</dt><dd>{out.plan.feasible === undefined ? '—' : out.plan.feasible ? '✓ yes' : '✗ no'}</dd>
              {out.plan.finishAtCap && <><dt>Finish at your limit</dt><dd>{formatKey(out.plan.finishAtCap)}</dd></>}
            </dl>
            {out.plan.requiredPace !== undefined && <button className="btn sm primary mt-16" onClick={async () => { await applyToTarget(idx, out.target, constantSchedule(out.plan.requiredPace!), out.plan.deadline); toast('Plan applied'); }}>Apply plan</button>}
          </div>
          <div className="notice ai"><AIBadge /><div className="mt-8"><Markdown text={out.explanation} /></div></div>
        </div>
      )}
    </div>
  );
}

// ── Library mathematics ────────────────────────────────────────────────

function LibraryMath({ idx }: { idx: LibraryIndex }) {
  const lib = libraryForecast(idx);
  const pace = overallPace(idx);
  const [custom, setCustom] = useState('');
  const [sched, setSched] = useState<WeekSchedule>([50, 20, 20, 20, 20, 10, 0]);
  const paces = [...new Set([20, 30, 50, ...(pace ? [Math.round(pace)] : []), ...(Number(custom) > 0 ? [Number(custom)] : [])])].sort((a, b) => a - b);
  const rows = paceTable(idx, lib.remaining, paces);
  const complex = project(lib.remaining, sched, idx.today, idx.planningRules);
  const byFamily = useMemo(() => {
    const m = new Map<string, { remaining: number; items: number }>();
    for (const i of idx.itemList().filter(isUnfinished)) {
      if (!i.total) continue;
      const fam = UNITS[i.unit].family;
      const e = m.get(fam) ?? { remaining: 0, items: 0 };
      e.remaining += Math.max(0, i.total - idx.position(i));
      e.items++;
      m.set(fam, e);
    }
    return m;
  }, [idx]);
  const want = idx.itemList().filter((i) => i.status === 'want');
  const wantF = evaluate(idx, { label: 'Want to Read', items: want });
  if (!idx.itemList().some(isUnfinished)) return <div className="card"><Empty icon="🧮" title="Nothing unfinished">Add books you want to read and the maths will appear here.</Empty></div>;
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="stats-row">
          <div className="stat"><span className="label">Unfinished pages</span><span className="value lg">{fmtNum(lib.remaining)}</span><span className="hint">{lib.itemCount - lib.completedCount} items</span></div>
          <div className="stat"><span className="label">Your pace</span><span className="value">{pace ? fmtNum(pace, 1) : '—'}</span><span className="hint">pages per reading day</span></div>
          <div className="stat"><span className="label">At your pace</span><span className="value">{lib.readingDays !== undefined ? fmtNum(lib.readingDays) : '—'}</span><span className="hint">reading days · {formatKey(lib.estimatedFinish)}</span></div>
          <div className="stat"><span className="label">Want-to-Read list</span><span className="value">{fmtNum(wantF.remaining)}</span><span className="hint">pages{wantF.totalTimeSec ? ` · ≈${fmtNum(wantF.totalTimeSec / 3600)} hours` : ''}</span></div>
        </div>
        {[...byFamily.entries()].filter(([f]) => f !== 'pages').length > 0 && (
          <div className="small muted mt-16">Also unfinished, tracked in their own units: {[...byFamily.entries()].filter(([f]) => f !== 'pages').map(([f, v]) => `${fmtNum(f === 'minutes' ? v.remaining / 60 : v.remaining, 1)} ${f === 'minutes' ? 'hours' : f} (${v.items} items)`).join(' · ')}{lib.separate.length ? '' : ''}. Items with a known print page count are included in the page total.</div>
        )}
      </div>
      <div className="grid c2">
        <div className="card">
          <div className="card-head"><h3>At a steady pace</h3><input className="input sm" style={{ width: 120 }} type="number" placeholder="custom/day" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
          <table className="table">
            <thead><tr><th>Pace</th><th className="r">Reading days</th><th className="r">Calendar days</th><th>Finish</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.pace} style={pace && r.pace === Math.round(pace) ? { fontWeight: 600 } : undefined}><td>{r.pace}/day{pace && r.pace === Math.round(pace) ? ' (you)' : ''}</td><td className="r num">{fmtNum(r.readingDays)}</td><td className="r num">{fmtNum(r.calendarDays)}</td><td>{formatKey(r.date)}</td></tr>)}</tbody>
          </table>
          {idx.planningRules.weekdays.length > 0 && <div className="tiny faint mt-8">Calendar dates skip your non-reading days ({idx.planningRules.weekdays.map((d) => WEEKDAYS[d]).join(', ')}).</div>}
        </div>
        <div className="card">
          <div className="card-head"><h3>With a weekly schedule</h3></div>
          <ScheduleEditor value={sched} onChange={setSched} />
          <div className="mt-16">
            {complex.reachable ? <p>At <b>{fmtNum(sched.reduce((a, b) => a + b, 0))} pages a week</b>, you’d finish everything on <b>{formatKey(complex.date)}</b> — {fmtNum(complex.readingDays)} reading days, {fmtNum(complex.calendarDays)} calendar days.</p> : <p className="muted">Add some pages to at least one day.</p>}
          </div>
        </div>
      </div>
      <div className="notice ai small">✦ <Link to="/ai" style={{ textDecoration: 'underline' }}>Ask AI</Link> to put these numbers in perspective — it explains, the engine calculates.</div>
    </div>
  );
}

// ── Time budget ────────────────────────────────────────────────────────

function TimeBudget({ idx }: { idx: LibraryIndex }) {
  const [min, setMin] = useState(30);
  const reading = idx.itemList().filter((i) => i.status === 'reading');
  const overall = timeBudget(idx, min);
  return (
    <div className="col gap-16">
      <div className="card">
        <h3>How much time do you have?</h3>
        <div className="row wrap mt-8">
          {[5, 10, 20, 30, 60].map((m) => <button key={m} className={`chip ${min === m ? 'on' : ''}`} onClick={() => setMin(m)}>{m < 60 ? `${m} minutes` : '1 hour'}</button>)}
          <input className="input sm" style={{ width: 90 }} type="number" min={1} value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value) || 1))} /> <span className="small muted">minutes</span>
        </div>
        <p className="mt-16" style={{ fontSize: 16 }}>{overall.amount !== undefined ? <>“I have {min} minutes.” → approximately <b>{fmtNum(overall.amount)} pages</b> at your measured speed ({fmtNum((overall.perMinute ?? 0) * 60)} pages/hour).</> : 'Time a few reading sessions and Shelf will learn your speed.'}</p>
      </div>
      {reading.length > 0 && (
        <div className="grid auto">
          {reading.map((i) => {
            const tb = timeBudget(idx, min, i);
            const f = itemForecast(idx, i);
            return (
              <div key={i.id} className="card row gap-12">
                <Cover item={i} width={44} />
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div>
                  <div className="small">{tb.amount !== undefined ? <>≈ <b>{fmtUnits(i, tb.amount, 0)}</b> in {min} min</> : <span className="muted">No speed data yet</span>}</div>
                  {tb.amount !== undefined && f.remaining ? <div className="tiny faint">{tb.amount >= f.remaining ? 'Enough to finish it! 🏁' : `${Math.round((tb.amount / f.remaining) * 100)}% of what’s left`}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="small faint">Speeds come from your timed sessions. Audio is estimated at 1× playback.</div>
    </div>
  );
}
