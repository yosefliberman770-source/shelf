import { useState } from 'react';
import { saveGoal, updateSettings } from '../db/actions';
import { loadSampleLibrary } from '../db/seed';
import { WEEKDAYS } from '../engine/dates';

export default function Onboarding() {
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState('20');
  const [metric, setMetric] = useState<'pages' | 'minutes'>('pages');
  const [skip, setSkip] = useState<number[]>([]);
  const start = async () => {
    setBusy(true);
    if (Number(goal) > 0) await saveGoal({ period: 'daily', metric, target: Number(goal) });
    await updateSettings({ onboarded: true, nonReadingWeekdays: skip, streakSkipWeekdays: skip, defaultPace: metric === 'pages' && Number(goal) > 0 ? Number(goal) : 20 });
  };
  const sample = async () => {
    setBusy(true);
    await loadSampleLibrary();
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 560, width: '100%', padding: 32 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 20 }}><span className="brand-mark">S</span>Shelf</div>
        <h1>Your reading life, in one place.</h1>
        <p className="muted mt-8">Shelf keeps track of what you own, what you’re reading, how fast you read, what you want to accomplish, and what you’ve learned — and forecasts when you’ll get there.</p>
        <div className="divider" style={{ margin: '24px 0' }} />
        <h3>A gentle daily goal (optional)</h3>
        <div className="row mt-8">
          <input className="input" style={{ width: 90 }} type="number" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} />
          <select className="select" style={{ width: 140 }} value={metric} onChange={(e) => setMetric(e.target.value as 'pages' | 'minutes')}>
            <option value="pages">pages / day</option>
            <option value="minutes">minutes / day</option>
          </select>
        </div>
        <h3 className="mt-24">Days you usually don’t read</h3>
        <p className="small muted">Plans and required paces skip these days, and they won’t break your streak. You can change this later.</p>
        <div className="row wrap mt-8">
          {WEEKDAYS.map((d, i) => (
            <button key={d} className={`chip ${skip.includes(i) ? 'on' : ''}`} onClick={() => setSkip(skip.includes(i) ? skip.filter((x) => x !== i) : [...skip, i])}>{d}</button>
          ))}
        </div>
        <div className="row wrap mt-24" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" disabled={busy} onClick={sample} title="Loads a clearly-marked sample library you can erase later">Explore with a sample library</button>
          <button className="btn primary" disabled={busy} onClick={start}>{busy ? 'Setting up…' : 'Start with an empty library'}</button>
        </div>
        <p className="tiny faint mt-16">Everything is stored locally in this browser. AI features are optional and off until you turn them on.</p>
      </div>
    </div>
  );
}
