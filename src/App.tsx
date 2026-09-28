import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Concierge } from './ai/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sheets, TimerBar } from './components/sheets';
import { useNotifications } from './lib/notifications';
import Onboarding from './pages/Onboarding';
import TodayPage from './pages/TodayPage';
import { LibraryProvider, useLibrary } from './state/library';
import { Toasts, UIProvider, useUI } from './state/ui';

const AIPage = lazy(() => import('./pages/AIPage'));
const AuthorPage = lazy(() => import('./pages/AuthorPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const ItemPage = lazy(() => import('./pages/ItemPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const ReadingPage = lazy(() => import('./pages/ReadingPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReaderPage = lazy(() => import('./pages/ReaderPage'));
const EbooksPage = lazy(() => import('./pages/EbooksPage'));

export const NAV = [
  { to: '/', icon: '🏠', label: 'Today' },
  { to: '/library', icon: '📚', label: 'Library' },
  { to: '/ebooks', icon: '📱', label: 'Ebooks' },
  { to: '/reading', icon: '📖', label: 'Reading' },
  { to: '/plan', icon: '🧮', label: 'Plan' },
  { to: '/insights', icon: '📊', label: 'Insights' },
  { to: '/knowledge', icon: '🧠', label: 'Knowledge' },
  { to: '/explore', icon: '🧭', label: 'Explore' },
  { to: '/ai', icon: '✨', label: 'AI' },
];

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
  const { open } = useUI();
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span>Shelf</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="ico">{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="nav-sep" />
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="ico">⚙️</span>Settings</NavLink>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="search-trigger" onClick={() => open({ kind: 'search' })}>
            <span>⌕</span><span className="grow" style={{ textAlign: 'left' }}>Search everything…</span><span className="kbd">⌘K</span>
          </button>
          <span className="grow" />
          <button className="btn primary" onClick={() => open({ kind: 'add' })}>＋ Add</button>
          <NavLink to="/settings" className="btn ghost icon" aria-label="Settings">⚙️</NavLink>
        </header>
        <TimerBar />
        <ErrorBoundary resetKey={loc.pathname}>
        <Suspense fallback={<div className="page faint">Loading…</div>}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/library/*" element={<LibraryPage />} />
          <Route path="/item/:id" element={<ItemPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
          <Route path="/ebooks" element={<EbooksPage />} />
          <Route path="/author/:id" element={<AuthorPage />} />
          <Route path="/reading/*" element={<ReadingPage />} />
          <Route path="/plan/*" element={<PlanPage />} />
          <Route path="/insights/*" element={<InsightsPage />} />
          <Route path="/knowledge/*" element={<KnowledgePage />} />
          <Route path="/explore/*" element={<ExplorePage />} />
          <Route path="/ai/*" element={<AIPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="page"><h1>Not found</h1></div>} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <nav className="mobile-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span>{n.icon}</span><span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <Sheets />
      <Concierge />
      <Toasts />
    </div>
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
