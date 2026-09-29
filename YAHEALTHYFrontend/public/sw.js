/* YAHealthy service worker — hand-written, no build-time dependency.
 *
 * Caching:
 *   navigations      network-first; offline → cached app shell → /offline.html
 *   /assets/*        cache-first (Vite content-hashes these file names)
 *   /api/*           network-only when the request carries Authorization — a
 *                    user's health data is never written to the Cache Storage
 *                    on disk. Anonymous GETs (e.g. marketing plans) fall back
 *                    to their last good copy unless marked no-store/private.
 *   other same-origin static files: stale-while-revalidate
 *   Google Fonts     cache-first
 *
 * Updates: a new worker waits until the page asks it to take over
 * ({type:'SKIP_WAITING'}), so the "new version — reload" toast decides when.
 * SW_VERSION is replaced at build time by the sw-version plugin in
 * vite.config.{ts,js}; any new build therefore changes this file's bytes,
 * which is what makes the browser notice an update.
 *
 * Registered with ?dev=1 by the Vite dev server: caching is then off entirely
 * (HMR and stale caches do not mix) and only push handling runs.
 */

const SW_VERSION = 'dev';
const DEV = new URL(self.location.href).searchParams.get('dev') === '1';

const SHELL_CACHE = `yah-shell-${SW_VERSION}`;
const ASSET_CACHE = 'yah-assets-v1';
const STATIC_CACHE = `yah-static-${SW_VERSION}`;
const PUBLIC_API_CACHE = 'yah-public-api-v1';
const FONT_CACHE = 'yah-fonts-v1';
const KEEP = [SHELL_CACHE, ASSET_CACHE, STATIC_CACHE, PUBLIC_API_CACHE, FONT_CACHE];

// The SPA shell is app.html: '/' and the other public pages are prerendered
// (scripts/prerender.mjs), so they would be the wrong document to fall back to.
const SHELL = '/app.html';

const SHELL_URLS = [
  SHELL,
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/badge-96.png'
];

const MAX_ASSET_ENTRIES = 120;

// ─── lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  if (DEV) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_URLS);

      // The shell is useless offline without the entry bundle it references,
      // and the very first page load happens before this worker controls
      // anything, so pull the hashed assets named in index.html now.
      try {
        const html = await (await shell.match(SHELL)).text();
        const assets = Array.from(new Set(html.match(/\/assets\/[^"'\s)]+/g) || []));
        if (assets.length) await (await caches.open(ASSET_CACHE)).addAll(assets);
      } catch (e) {
        /* the shell alone is still worth having */
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('yah-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(SW_VERSION);
});

// ─── fetch ──────────────────────────────────────────────────────────────────

const offlineApiResponse = () =>
  new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    // The shell is cached once per worker version at install; navigation
    // responses are not reused as it, since public routes are prerendered pages.
    return response;
  } catch (e) {
    return (await caches.match(SHELL, { cacheName: SHELL_CACHE })) ||
      (await caches.match('/offline.html')) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(cacheName).then(async (c) => {
      await c.put(request, copy);
      if (maxEntries) await trim(cacheName, maxEntries);
    });
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit || Response.error());
  return hit || network;
}

function isCacheableApiResponse(response) {
  const cc = (response.headers.get('Cache-Control') || '').toLowerCase();
  return response.ok && !cc.includes('no-store') && !cc.includes('private');
}

async function handleApi(request) {
  // Authenticated: straight to the network, never stored.
  if (request.headers.has('Authorization')) {
    try {
      return await fetch(request);
    } catch (e) {
      return offlineApiResponse();
    }
  }
  try {
    const response = await fetch(request);
    if (isCacheableApiResponse(response)) {
      const copy = response.clone();
      caches.open(PUBLIC_API_CACHE).then(async (c) => {
        await c.put(request, copy);
        await trim(PUBLIC_API_CACHE, 30);
      });
    }
    return response;
  } catch (e) {
    return (await caches.match(request, { cacheName: PUBLIC_API_CACHE })) || offlineApiResponse();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (DEV || request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(cacheFirst(request, FONT_CACHE, 30));
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApi(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE, MAX_ASSET_ENTRIES));
    return;
  }
  if (url.pathname === '/sw.js') return;
  event.respondWith(staleWhileRevalidate(request));
});

// ─── push ───────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'YAHealthy';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge-96.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      lang: data.lang || 'he',
      dir: data.dir || 'auto',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/dashboard' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        // In-app navigation keeps the SPA state; the page listens for this.
        existing.postMessage({ type: 'NAVIGATE', url: target.pathname + target.search + target.hash });
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
