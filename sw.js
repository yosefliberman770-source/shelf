/* Shelfmark service worker: the app works offline, and book covers are kept once seen.
   When you update the app, change VERSION so phones pick up the new files. */
const VERSION = '2.0.0';
const APP = 'shelfmark-app-' + VERSION;
const COVERS = 'shelfmark-covers';
const FILES = ['./', 'index.html', 'app.css', 'js/core.js', 'js/store.js', 'js/charts.js', 'js/views.js', 'js/stats.js', 'js/plan.js', 'js/sheets.js', 'js/app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'privacy.html'];

self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shelfmark-app-') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'covers.openlibrary.org') {
    e.respondWith(caches.open(COVERS).then(async c => {
      const hit = await c.match(e.request); if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  /* app files: network first so updates show up, cache when offline */
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request, {ignoreSearch:true}).then(r => r || caches.match('index.html'))));
});
