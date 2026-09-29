// The "More" hub: deeper areas of the app, each with a plain-words promise
// of what it's for, plus settings and help.
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName, TONES, type Tone } from '../components/icons';
import { updateSettings } from '../db/actions';
import { goalProgress } from '../engine/goals';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

export default function MorePage() {
  const idx = useLibrary();
  const nav = useNavigate();
  const { open } = useUI();
  const goals = idx.snap.goals.filter((g) => g.active);
  const onPace = goals.filter((g) => { const p = goalProgress(idx, g); return p.value >= p.expected; }).length;
  const quotes = idx.snap.notes.filter((n) => n.kind === 'quote').length;
  const tiles: { to: string; icon: IconName; tone: Tone; title: string; sub: string; meta?: string }[] = [
    { to: '/plan', icon: 'target', tone: 'green', title: 'Plan', sub: 'What you’re working towards — goals, projects and schedules.', meta: goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'} · ${onPace} on pace` : idx.snap.projects.length ? `${idx.snap.projects.length} projects` : undefined },
    { to: '/insights', icon: 'chart', tone: 'terracotta', title: 'Insights', sub: 'What’s happening — time, pages, habits and records.', meta: idx.sessions.length ? `${idx.sessions.length} sessions logged` : undefined },
    { to: '/knowledge', icon: 'map', tone: 'gold', title: 'Knowledge Atlas', sub: 'Everyone and everywhere you’ve met while reading — plus your quotes and notes.', meta: idx.snap.concepts.length || idx.snap.notes.length ? `${idx.snap.concepts.length} entries · ${quotes} quotes` : undefined },
    { to: '/library/curricula', icon: 'layers', tone: 'green', title: 'Curricula', sub: 'Build your own course on any subject, level by level.', meta: idx.snap.curricula.length ? `${idx.snap.curricula.length} curricul${idx.snap.curricula.length === 1 ? 'um' : 'a'}` : undefined },
    { to: '/explore', icon: 'compass', tone: 'blue', title: 'Connections', sub: 'How your books link up — timelines, maps and rabbit holes.' },
    { to: '/ai', icon: 'sparkle', tone: 'ai', title: 'AI tools', sub: 'Recommendations, quizzes and a search that understands questions.' },
    { to: '/reading/journal', icon: 'calendar', tone: 'brown', title: 'Reading journal', sub: 'Every day you’ve read, in a calendar.' },
  ];
  const theme = idx.settings.theme;
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const rows: { icon: IconName; tone: Tone; title: string; sub: string; run: () => void }[] = [
    { icon: 'help', tone: 'teal', title: 'How Shelf works', sub: 'Organizing, connections, where the numbers come from', run: () => nav('/help') },
    { icon: 'settings', tone: 'brown', title: 'Settings', sub: 'Reading days, reminders, AI & privacy, backups', run: () => nav('/settings') },
    { icon: 'moon', tone: 'plum', title: `Appearance: ${theme === 'system' ? 'match phone' : theme}`, sub: `Tap to switch to ${nextTheme === 'system' ? 'match phone' : nextTheme}`, run: () => updateSettings({ theme: nextTheme }) },
    { icon: 'download', tone: 'terracotta', title: 'Import from Goodreads', sub: 'Bring your shelves, ratings and dates', run: () => nav('/library/import') },
    { icon: 'lock', tone: 'green', title: 'Backup & export', sub: 'Save a copy of everything', run: () => nav('/settings?tab=data') },
    { icon: 'search', tone: 'gold', title: 'Search everything', sub: 'Books, authors, notes, quotes, topics', run: () => open({ kind: 'search' }) },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>More</h1>
          <div className="sub">Go deeper whenever you’re ready. Everything here is optional.</div>
        </div>
      </div>
      <div className="tile-grid">
        {tiles.map((t) => (
          <button key={t.to} className="tile" onClick={() => nav(t.to)}>
            <span className="t-ico" style={{ background: TONES[t.tone] }}><Icon name={t.icon} /></span>
            <span className="t-title">{t.title}</span>
            <span className="t-sub">{t.sub}</span>
            {t.meta && <span className="tiny faint" style={{ fontWeight: 700 }}>{t.meta}</span>}
          </button>
        ))}
      </div>
      <div className="section-title">Settings & help</div>
      <div className="list-card">
        {rows.map((r) => (
          <button key={r.title} className="li" onClick={r.run}>
            <span className="li-ico" style={{ background: TONES[r.tone] }}><Icon name={r.icon} /></span>
            <span className="grow" style={{ minWidth: 0 }}><span className="li-title" style={{ display: 'block', textTransform: 'none' }}>{r.title}</span><span className="li-sub ellipsis" style={{ display: 'block' }}>{r.sub}</span></span>
            <Icon name="chevronRight" className="faint" />
          </button>
        ))}
      </div>
      <p className="tiny faint mt-24" style={{ textAlign: 'center' }}>Your library lives on this device. Nothing is uploaded unless you use AI, and then only what you allow.</p>
    </div>
  );
}
