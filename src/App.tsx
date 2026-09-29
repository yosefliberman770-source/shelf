import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
const HelpPage = lazy(() => import('./pages/HelpPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const ItemPage = lazy(() => import('./pages/ItemPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const MorePage = lazy(() => import('./pages/MorePage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const ReadingPage = lazy(() => import('./pages/ReadingPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReaderPage = lazy(() => import('./pages/ReaderPage'));

interface NavEntry { to: string; icon: IconName; label: string; sub?: string }

/** Everyday places: what to do now, what you have, what you're reading. */
export const PRIMARY: NavEntry[] = [
  { to: '/', icon: 'home', label: 'Today' },
  { to: '/library', icon: 'library', label: 'Library' },
  { to: '/reading', icon: 'book', label: 'Reading' },
];

/** Deeper places, revealed when you want them. */
export const DEEPER: NavEntry[] = [
  { to: '/plan', icon: 'target', label: 'Plan', sub: 'Goals & projects' },
  { to: '/insights', icon: 'chart', label: 'Insights', sub: 'Your reading, measured' },
  { to: '/knowledge', icon: 'bulb', label: 'Knowledge', sub: 'Quotes, notes & ideas' },
  { to: '/explore', icon: 'compass', label: 'Explore', sub: 'Connections & discovery' },
];

const MORE_PATHS = ['/more', '/plan', '/insights', '/knowledge', '/explore', '/ai', '/settings', '/author', '/help'];

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
          <Link to="/" className="brand-mark mobile-brand" aria-label="Shelf — Today"><Icon name="book" /></Link>
          <button className="search-trigger" onClick={() => open({ kind: 'search' })} aria-label="Search">
            <Icon name="search" /><span className="grow ellipsis" style={{ textAlign: 'left' }}>Search books, notes, authors…</span><span className="kbd">⌘K</span>
          </button>
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
          <Route path="/explore/*" element={<ExplorePage />} />
          <Route path="/ai/*" element={<AIPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="page"><h1>Not found</h1><Link className="btn mt-16" to="/">Back to Today</Link></div>} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        <Tab to="/" icon="home" label="Today" active={loc.pathname === '/'} />
        <Tab to="/library" icon="library" label="Library" active={loc.pathname.startsWith('/library')} />
        <div className="ask-wrap">
          <button className="ask" onClick={() => open({ kind: 'ai' })} aria-label="Ask AI" aria-pressed={askOpen}><Icon name="sparkle" /></button>
          <span className="ask-label" aria-hidden>Ask AI</span>
        </div>
        <Tab to="/reading" icon="book" label="Reading" active={loc.pathname.startsWith('/reading')} />
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
