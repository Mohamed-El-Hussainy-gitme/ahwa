const SW_VERSION = "ahwa-sw-v4";
const STATIC_CACHE = `${SW_VERSION}-static`;
const PAGE_CACHE = `${SW_VERSION}-pages`;
const MENU_CACHE = `${SW_VERSION}-menu`;
const OFFLINE_URL = "/offline";

const STATIC_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-icon.png",
  "/brand/ahwa-logo.png",
  "/brand/ahwa-logo.svg",
  "/brand/ahwa-login-logo.webp",
  "/brand/ahwa-mark.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, PAGE_CACHE, MENU_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isMenuRequest(url) {
  return url.pathname.startsWith("/api/public/cafes/") && url.pathname.endsWith("/menu");
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || Response.error();
}

async function networkFirstMenu(request) {
  const cache = await caches.open(MENU_CACHE);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const staticCache = await caches.open(STATIC_CACHE);
    const offlineResponse = await staticCache.match(OFFLINE_URL);
    return offlineResponse || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isMenuRequest(url)) {
    event.respondWith(networkFirstMenu(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});


self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasVisibleClient = clientsList.some((client) => client.visibilityState === 'visible');
    for (const client of clientsList) {
      client.postMessage({ type: 'ahwa:push', payload });
    }
    if (hasVisibleClient) return;
    await self.registration.showNotification(payload.title || 'تنبيه التشغيل', {
      body: payload.body || 'لديك تحديث جديد في التشغيل.',
      tag: payload.tag || 'ahwa-ops-notification',
      data: { url: payload.url || '/', signal: payload.signal || 'station-order' },
      requireInteraction: payload.requireInteraction !== false,
      renotify: true,
      badge: '/icon-192x192.png',
      icon: '/icon-192x192.png',
      vibrate: payload.signal === 'waiter-ready' ? [120, 50, 120, 50, 180] : [180, 70, 180, 70, 240],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
