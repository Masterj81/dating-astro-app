// Safer PWA caching strategy for SPA + fast updates

const CACHE_VERSION = 'v8';
const STATIC_CACHE = `astrodating-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `astrodating-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Only immutable/static assets here
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  OFFLINE_URL,
];

// Install: cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Utility guards
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isHttp(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_expo/') ||
    pathname.startsWith('/assets/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2')
  );
}

function shouldBypass(url) {
  return (
    url.href.includes('/api/') ||
    url.href.includes('supabase.co') ||
    url.href.includes('hot-update') ||
    url.href.includes('__webpack')
  );
}

// Fetch strategy:
// 1) Navigation requests: network-first (prevents stale UI/routes)
// 2) Static assets: stale-while-revalidate
// 3) Others: network-first with runtime fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (!isHttp(url)) return;
  if (!isSameOrigin(url)) return;
  if (shouldBypass(url)) return;

  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Optionally cache successful HTML navigations in runtime
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          // fallback to cached page if available
          const cached = await caches.match(req);
          if (cached) return cached;

          // fallback to app shell
          const shell = await caches.match('/');
          if (shell) return shell;

          // final offline page
          const offline = await caches.match(OFFLINE_URL);
          return offline || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const clone = res.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);

        // stale-while-revalidate
        return cached || networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503 });
      })
  );
});

// Push
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || 'AstroDating', {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [100, 50, 100],
    })
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification?.data?.url || '/'));
});
