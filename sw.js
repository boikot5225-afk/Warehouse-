/* L'Enfer PWA service worker — v137: починен выбор файла в приложении (аватарка, фото к заметкам) — onShowFileChooser в WebView
   Network-first worker: old cached index.html should not haunt the app. */
const SW_VERSION = 'lenfer-v137-file-chooser';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (e) {
      // Cache cleanup is best-effort.
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      try { client.postMessage({ type: 'LENFER_SW_UPDATED', version: SW_VERSION }); } catch (e) {}
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML and app files: always try network first so fixes arrive immediately.
  if (req.mode === 'navigate' || /\/(index\.html|register\.html|manifest\.webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Other local static files: network first, then cache fallback.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
