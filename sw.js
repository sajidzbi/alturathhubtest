/* ════════════════════════════════════════════════════════════
   Al-Turath NotebookLM Hub — Service Worker
   Strategy:
   - HTML (navigation): NETWORK-FIRST. Every time the user opens
     the app while online, the latest index.html is fetched from
     the server directly — so even a one-word edit shows up on
     the very next load, with no manual cache-busting needed.
     Falls back to the cached copy only when offline.
   - Everything else (manifest, icons, fonts): STALE-WHILE-
     REVALIDATE — instant load from cache, silently refreshed
     in the background for next time.
   - skipWaiting() + clients.claim() so a new version activates
     itself immediately; the page listens for 'controllerchange'
     and reloads once, automatically.
   ════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'alturath-hub-cache-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable-icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // don't block install if a core asset is briefly unreachable
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.startsWith('chrome-extension://')) return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
