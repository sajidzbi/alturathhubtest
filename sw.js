/* ════════════════════════════════════════════════════════════
   Al-Turath NotebookLM Hub — Service Worker
   Strategy:
   - HTML (navigation): NETWORK-FIRST. Every time the user opens
     the app while online, the latest index.html is fetched from
     the server directly — so even a one-word edit shows up on
     the very next load, with no manual cache-busting needed.
     Falls back to the cached copy only when offline.
   - Everything else (manifest, icons, fonts, notebooks-data.js):
     STALE-WHILE-REVALIDATE at runtime — instant load from cache,
     silently refreshed in the background for next time.
   - INSTALL step fetches every core asset with {cache:'reload'},
     bypassing the browser's own HTTP cache - so a fresh deploy's
     notebooks-data.js/manifest/fonts can never be seeded from a
     stale HTTP-cached copy the browser happened to already have.
   - skipWaiting() + clients.claim() so a new version activates
     itself immediately, and a 'waiting' worker (if the browser
     ever leaves one stuck there) is nudged to skip waiting too -
     the page listens for 'controllerchange' and reloads once,
     automatically. No uninstall/reinstall/sign-out/manual cache
     clear should ever be needed on the user's end.
   ════════════════════════════════════════════════════════════ */

// Bump this on every deploy so old caches are dropped and every core
// asset is re-fetched fresh (see install handler below).
const CACHE_NAME = 'alturath-hub-cache-v11';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable-icon-512.png',
  './JAMEEL_NOORI_NASTALEEQ.woff2',
  './KFGQPC_UTHMAN_TAHA_NASKH_REGULAR.woff2',
  './cal-mask-bismillah.png',
  './cal-mask-iqra.png',
  './notebooks-data.js?v=15'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE_ASSETS.map((url) =>
        // {cache:'reload'} forces a real network round-trip, ignoring
        // any HTTP-cached copy the browser already has for this URL -
        // otherwise a fresh deploy could get seeded with yesterday's
        // notebooks-data.js/manifest straight from HTTP cache.
        fetch(url, { cache: 'reload' })
          .then((res) => res && res.ok && cache.put(url, res))
          .catch(() => {}) // don't block install if one asset is briefly unreachable
      ))
    )
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
