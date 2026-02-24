// TrackLogger Service Worker
// Strategy: Cache-first for app shell, network-first for external resources

const CACHE_NAME = 'tracklogger-v1';
const CACHE_URLS = [
  './race-setup-logger.html',
  './manifest.json',
  // Google Fonts — cached on first load
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;500;600&display=swap'
];

// ── Install: pre-cache app shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Add core files, ignore failures on external resources
      return cache.addAll(CACHE_URLS).catch(() => {
        return cache.add('./race-setup-logger.html');
      });
    })
  );
  // Take control immediately without waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Fetch: cache-first with network fallback ──────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  // Network-first for Open-Meteo weather API (always needs fresh data)
  if (url.hostname === 'api.open-meteo.com') {
    event.respondWith(
      fetch(request)
        .catch(() => new Response(
          JSON.stringify({ error: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // Cache-first for everything else (app shell, fonts, icons)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone and cache for next time
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback: return cached HTML for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('./race-setup-logger.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
