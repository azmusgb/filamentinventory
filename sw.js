const CACHE = 'filament-inventory-v26';
const CORE = ['/', '/index.html', '/styles.css', '/ui-system.css', '/app-version.js', '/user-isolation.js', '/state-merge.js', '/audit-core.js', '/personal-core.js', '/intake-core.js', '/scan-core.js', '/printer-core.js', '/inventory-command-core.js', '/spool-actions-core.js', '/bulk-actions-core.js', '/sync-client.js', '/security-client.js', '/labels-client.js', '/household-client.js', '/ux-client.js', '/audit-client.js', '/personal-dashboard.js', '/intake-client.js', '/scan-client.js', '/printer-dashboard.js', '/inventory-command-client.js', '/spool-actions-client.js', '/bulk-actions-client.js', '/ui-v10-client.js', '/app.js', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put('/index.html', response.clone()));
      return response;
    }).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
