// A short welcome: pick how to start, optionally say what you read, then
// straight to Today. Goals, reading days and AI are discovered later.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName, TONES, type Tone } from '../components/icons';
import { Illustration } from '../components/illustrations';
import { updateSettings } from '../db/actions';
import { loadSampleLibrary } from '../db/seed';
import { useUI } from '../state/ui';

type Start = 'add' | 'epub' | 'import' | 'sample' | 'empty';

const STARTS: { id: Start; icon: IconName; tone: Tone; title: string; sub: string }[] = [
  { id: 'add', icon: 'plus', tone: 'terracotta', title: 'Add my books', sub: 'Search by title and add what you’re reading' },
  { id: 'epub', icon: 'file', tone: 'blue', title: 'Open an ebook', sub: 'Read an ePub file right here' },
  { id: 'import', icon: 'download', tone: 'green', title: 'Import from Goodreads', sub: 'Bring your shelves, ratings and dates' },
  { id: 'sample', icon: 'sparkle', tone: 'plum', title: 'Look around first', sub: 'A sample library you can erase any time' },
];

const INTERESTS = ['Fiction', 'Fantasy', 'Science fiction', 'Mystery & thriller', 'Romance', 'Classics', 'History', 'Biography', 'Science', 'Philosophy', 'Religion & spirituality', 'Self-improvement', 'Business', 'Poetry', 'Comics', 'Audiobooks'];

export default function Onboarding() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [start, setStart] = useState<Start>('empty');
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { open } = useUI();
  const nav = useNavigate();

  const finish = async (skip = false) => {
    setBusy(true);
    if (start === 'sample') await loadSampleLibrary();
    await updateSettings({ onboarded: true, ...(!skip && interests.length ? { interests } : {}) });
    if (start === 'add') open({ kind: 'add' });
    if (start === 'epub') open({ kind: 'add', preset: { step: 'epub' } });
    if (start === 'import') nav('/library/import');
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px 16px' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {step === 1 && (
          <div className="col gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
            <span className="brand-mark" style={{ width: 52, height: 52, borderRadius: 16 }}><Icon name="book" size={28} /></span>
            <Illustration name="shelf" className="illus" />
            <h1 style={{ fontSize: 34 }}>Your whole reading life, in one cosy place.</h1>
            <p className="muted" style={{ fontSize: 16.5, maxWidth: 420 }}>Keep track of what you’re reading, read ebooks, save quotes, and see when you’ll finish — without spreadsheets.</p>
            <button className="btn primary lg block mt-8" onClick={() => setStep(2)}>Get started</button>
            <p className="tiny faint">Everything stays on this phone. AI is optional and off until you turn it on.</p>
          </div>
        )}
        {step === 2 && (
          <div className="col gap-16">
            <div className="eyebrow">Step 1 of 2</div>
            <h1>What would you like to do first?</h1>
            <div className="list-card">
              {STARTS.map((s) => (
                <button key={s.id} className="li" onClick={() => { setStart(s.id); setStep(3); }}>
                  <span className="li-ico" style={{ background: TONES[s.tone] }}><Icon name={s.icon} /></span>
                  <span className="grow" style={{ minWidth: 0 }}><span className="li-title" style={{ display: 'block' }}>{s.title}</span><span className="li-sub" style={{ display: 'block' }}>{s.sub}</span></span>
                  <Icon name="chevronRight" className="faint" />
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => { setStart('empty'); setStep(3); }}>Start with an empty library</button>
          </div>
        )}
        {step === 3 && (
          <div className="col gap-16">
            <div className="eyebrow">Step 2 of 2 · optional</div>
            <h1>What do you usually read?</h1>
            <p className="muted">Pick any that fit. It only helps suggestions — you can skip this.</p>
            <div className="row wrap gap-8">
              {INTERESTS.map((i) => (
                <button key={i} className={`chip ${interests.includes(i) ? 'on' : ''}`} style={{ minHeight: 40, padding: '0 16px', fontSize: 14.5 }} aria-pressed={interests.includes(i)} onClick={() => setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i])}>{i}</button>
              ))}
            </div>
            <div className="row mt-8">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <span className="grow" />
              <button className="btn" disabled={busy} onClick={() => finish(true)}>Skip</button>
              <button className="btn primary" disabled={busy} onClick={() => finish()}>{busy ? 'Setting up…' : 'Done'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
