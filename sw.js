// TrackLogger Service Worker
// IMPORTANT: When you bump <meta name="app-version"> in the HTML,
// also update CACHE_VERSION here to match. Both must stay in sync.

const CACHE_VERSION = '1.0.0';
const CACHE_NAME = `tracklogger-${CACHE_VERSION}`;

const CACHE_URLS = [
  'race-setup-logger.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// ── Install: pre-cache app shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches, take control ─────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('tracklogger-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(async () => {
        // Tell open tabs an update landed
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
      })
  );
});

// ── Fetch: cache-first, network fallback ──────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Always network for weather API
  if (url.hostname === 'api.open-meteo.com') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Network-first for Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for everything else (HTML, icons, manifest)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('race-setup-logger.html');
      });
    })
  );
});
