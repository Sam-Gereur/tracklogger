// TrackLogger Service Worker v2
const CACHE_NAME = 'tracklogger-v2';

const CACHE_URLS = [
  './race-setup-logger.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: pre-cache app shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CACHE_URLS)
    ).catch(err => console.warn('SW cache install error:', err))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
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

  // Always network for Google Fonts (non-critical, skip caching errors)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (request.mode === 'navigate') {
          return caches.match('./race-setup-logger.html');
        }
      });
    })
  );
});
