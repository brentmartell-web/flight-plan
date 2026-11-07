/* Flight Plan service worker: serve the app from cache so it opens with no connection,
   and refresh the cache in the background whenever the network is reachable.
   Bump VERSION when the list of files changes. */
const VERSION = 'fp-v2';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'maskable-512.png',
  'favicon-64.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pages always resolve to the cached app shell, whatever the query string.
  const key = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    const before = cached && key === 'index.html' ? cached.clone() : null;
    const fresh = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); cache.put(key, res.clone()).then(() => notifyIfChanged(key, before, copy)); }
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || new Response('Offline', { status: 503, statusText: 'Offline' });
  }));
});

/* Tell open pages when a newer index.html has been cached, so they can offer a reload. */
async function notifyIfChanged(key, cached, res) {
  if (key !== 'index.html' || !cached) return;
  const [a, b] = await Promise.all([cached.text(), res.text()]);
  if (a === b) return;
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'updated' }));
}
