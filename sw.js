// TrackLogger Service Worker
// Cache name is set dynamically from the app's version meta tag.
// To push an update: bump <meta name="app-version"> in race-setup-logger.html.
// localStorage data is NEVER touched by the SW — updates are safe.

const SHELL = 'race-setup-logger.html';
let CACHE_NAME = 'tracklogger-v1'; // fallback, overwritten on install

async function getVersionFromHTML(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    const match = text.match(/<meta name="app-version" content="([^"]+)"/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const version = await getVersionFromHTML(SHELL);
    CACHE_NAME = `tracklogger-${version}`;
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      SHELL,
      'manifest.json',
      'icons/icon-192.png',
      'icons/icon-512.png',
    ]).catch(() => cache.add(SHELL));
    await self.skipWaiting();
  })());
});

// ── Activate: delete old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('tracklogger-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
    // Notify all open tabs that an update is available
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
  })());
});

// ── Fetch ─────────────────────────────────────────────────
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
      fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
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
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match(SHELL);
      });
    })
  );
});
