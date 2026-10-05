// Offline support: the app shell and built assets are cached so Shelf opens
// without a connection. Your data lives in the browser's database, not here.
const CACHE = 'shelf-v2';
// Map and place data are kept in their own cache, emptied whenever a new build of the data is seen (its manifest's
// build date changes), so an offline session never mixes name shards and cells from different builds.
const DATA = 'shelf-data';
async function dataResponse(req) {
  const res = await fetch(req);
  if (!res.ok) return res;
  const copy = res.clone();
  const c = await caches.open(DATA);
  if (new URL(req.url).pathname.endsWith('/world/manifest.json')) {
    const old = await c.match(req);
    const built = (r) => r.clone().json().then((m) => m.built).catch(() => undefined);
    if (old && (await built(old)) !== (await built(res))) {
      await caches.delete(DATA);
      await (await caches.open(DATA)).put(req, copy);
      return res;
    }
  }
  await c.put(req, copy);
  return res;
}
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
  // Map tiles are read in pieces (range requests); let the browser handle those directly.
  if (req.headers.has('range')) return;
  // Atlas and World data change when rebuilt: network first, the cached copy offline.
  if (url.pathname.includes('/atlas/') || url.pathname.includes('/world/')) {
    e.respondWith(dataResponse(req).catch(() => caches.match(req).then((r) => r || Response.error())));
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
