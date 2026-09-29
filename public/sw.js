// Offline support: the app shell and built assets are cached so Shelf opens
// without a connection. Your data lives in the browser's database, not here.
const CACHE = 'shelf-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    // Network first for pages, falling back to the cached app shell.
    e.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./'))));
    return;
  }
  // Atlas data changes when it's rebuilt: network first, the cached copy offline.
  if (url.pathname.includes('/atlas/')) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || Response.error())));
    return;
  }
  // Cache first for hashed assets and icons.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
