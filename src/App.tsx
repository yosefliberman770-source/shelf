import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { onAIEvent } from './ai/manager';
import { AskSheet } from './ai/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Icon, type IconName } from './components/icons';
import { Sheets, TimerBar } from './components/sheets';
import { useNotifications } from './lib/notifications';
import Onboarding from './pages/Onboarding';
import TodayPage from './pages/TodayPage';
import { LibraryProvider, useLibrary } from './state/library';
import { Toasts, UIProvider, useUI } from './state/ui';

const AIPage = lazy(() => import('./pages/AIPage'));
const AuthorPage = lazy(() => import('./pages/AuthorPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ExploreHub = lazy(() => import('./pages/ExploreHub'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const ItemPage = lazy(() => import('./pages/ItemPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const MorePage = lazy(() => import('./pages/MorePage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const CurriculumPage = lazy(() => import('./pages/CurriculumPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const ReadingPage = lazy(() => import('./pages/ReadingPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReaderPage = lazy(() => import('./pages/ReaderPage'));

interface NavEntry { to: string; icon: IconName; label: string; sub?: string }

/** Everyday places. Reading comes first: it's the heart of the app. */
export const PRIMARY: NavEntry[] = [
  { to: '/', icon: 'book', label: 'Reading' },
  { to: '/insights', icon: 'chart', label: 'Tracking' },
  { to: '/explore', icon: 'compass', label: 'Explore' },
  { to: '/library', icon: 'library', label: 'Library' },
];

/** Deeper places, revealed when you want them. */
export const DEEPER: NavEntry[] = [
  { to: '/plan', icon: 'target', label: 'Plan', sub: 'Goals & projects' },
  { to: '/knowledge', icon: 'map', label: 'Knowledge Atlas', sub: 'People, places, notes' },
  { to: '/library/curricula', icon: 'layers', label: 'Curricula', sub: 'Learning paths you build' },
  { to: '/explore/connections', icon: 'bulb', label: 'Connections', sub: 'Timelines & rabbit holes' },
];

const MORE_PATHS = ['/more', '/knowledge', '/ai', '/settings', '/author', '/help', '/library/curricula', '/curriculum'];

function useTheme() {
  const idx = useLibrary();
  const theme = idx.settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

function Shell() {
  const idx = useLibrary();
  const { open, sheet } = useUI();
  const loc = useLocation();
  useTheme();
  useNotifications(idx);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open({ kind: 'search' });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  useEffect(() => window.scrollTo(0, 0), [loc.pathname]);
  // Tell the reader when AI quietly switched provider, or ran out of free capacity.
  const { toast } = useUI();
  useEffect(() => onAIEvent((e) => {
    if (e.type === 'switched') toast(`${e.from} ${e.reason === 'quota' ? 'free allowance used up' : e.reason === 'rate_limit' ? 'limit reached' : 'unavailable'} — switched to ${e.to}.`);
    if (e.type === 'exhausted') toast(e.message, { error: true });
  }), [toast]);

  if (!idx.settings.onboarded) return <Onboarding />;

  const inMore = MORE_PATHS.some((p) => loc.pathname.startsWith(p));
  const askOpen = sheet?.kind === 'ai';

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden><Icon name="book" /></span>Shelf</Link>
        {PRIMARY.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="ico"><Icon name={n.icon} /></span>{n.label}
          </NavLink>
        ))}
        <button className="nav-link ask" onClick={() => open({ kind: 'ai' })}><span className="ico"><Icon name="sparkle" /></span>Ask AI</button>
        <div className="nav-group">Go deeper</div>
        {DEEPER.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="ico"><Icon name={n.icon} /></span><span>{n.label}<span className="sub">{n.sub}</span></span>
          </NavLink>
        ))}
        <NavLink to="/ai" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="ico"><Icon name="sparkle" /></span><span>AI tools<span className="sub">Recommendations, tutor…</span></span></NavLink>
        <div className="spacer" />
        <div className="nav-sep" />
        <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="ico"><Icon name="help" /></span>How Shelf works</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="ico"><Icon name="settings" /></span>Settings</NavLink>
      </aside>
      <div className="main">
        <header className="topbar">
          <Link to="/" className="brand-mark mobile-brand" aria-label="Shelf — Reading"><Icon name="book" /></Link>
          <button className="search-trigger" onClick={() => open({ kind: 'search' })} aria-label="Search">
            <Icon name="search" /><span className="grow ellipsis" style={{ textAlign: 'left' }}>Search books, notes, authors…</span><span className="kbd">⌘K</span>
          </button>
          <button className={`btn ghost icon round ${askOpen ? 'on' : ''}`} onClick={() => open({ kind: 'ai' })} aria-label="Ask AI" title="Ask AI" style={{ color: 'var(--ai)' }}><Icon name="sparkle" /></button>
          <span className="grow desktop-only" />
          <button className="btn primary round" onClick={() => open({ kind: 'quick' })} aria-label="Add or log something"><Icon name="plus" /><span className="desktop-only">New</span></button>
          <NavLink to="/settings" className="btn ghost icon round desktop-only" aria-label="Settings"><Icon name="settings" /></NavLink>
        </header>
        <TimerBar />
        <ErrorBoundary resetKey={loc.pathname}>
        <Suspense fallback={<div className="page faint">Loading…</div>}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/library/*" element={<LibraryPage />} />
          <Route path="/item/:id" element={<ItemPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
          <Route path="/ebooks" element={<Navigate to="/reading/ebooks" replace />} />
          <Route path="/author/:id" element={<AuthorPage />} />
          <Route path="/reading/*" element={<ReadingPage />} />
          <Route path="/plan/*" element={<PlanPage />} />
          <Route path="/insights/*" element={<InsightsPage />} />
          <Route path="/knowledge/*" element={<KnowledgePage />} />
          <Route path="/explore" element={<ExploreHub />} />
          <Route path="/explore/*" element={<ExplorePage />} />
          <Route path="/ai/*" element={<AIPage />} />
          <Route path="/discover" element={<Navigate to="/explore" replace />} />
          <Route path="/discover/*" element={<DiscoverPage />} />
          <Route path="/curricula" element={<Navigate to="/library/curricula" replace />} />
          <Route path="/curriculum/:id" element={<CurriculumPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="page"><h1>Not found</h1><Link className="btn mt-16" to="/">Back to Reading</Link></div>} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        <Tab to="/" icon="book" label="Reading" active={loc.pathname === '/' || loc.pathname.startsWith('/reading')} />
        <Tab to="/insights" icon="chart" label="Tracking" active={loc.pathname.startsWith('/insights') || loc.pathname.startsWith('/plan')} />
        <Tab to="/explore" icon="compass" label="Explore" active={loc.pathname.startsWith('/explore') || loc.pathname.startsWith('/discover')} />
        <Tab to="/library" icon="library" label="Library" active={loc.pathname.startsWith('/library') && !inMore} />
        <Tab to="/more" icon="grid" label="More" active={inMore} />
      </nav>
      <Sheets />
      <AskSheet />
      <Toasts />
    </div>
  );
}

function Tab({ to, icon, label, active }: { to: string; icon: IconName; label: string; active: boolean }) {
  return (
    <Link to={to} className={`tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
      <span className="pip" aria-hidden />
    </Link>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <UIProvider>
        <ErrorBoundary>
        <LibraryProvider fallback={<div className="empty" style={{ marginTop: '30vh' }}>Opening your library…</div>}>
          <Shell />
        </LibraryProvider>
        </ErrorBoundary>
      </UIProvider>
    </BrowserRouter>
  );
}
