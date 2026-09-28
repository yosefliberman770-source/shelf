import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// If a screen's code file fails to load (e.g. after an update), reload once.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('shelf.preloadReload')) return;
    sessionStorage.setItem('shelf.preloadReload', '1');
  } catch {
    /* ignore */
  }
  location.reload();
});

// Installable + offline in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
