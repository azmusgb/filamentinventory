const CACHE = 'filament-inventory-v33';
const CORE = [
  '/', '/index.html', '/styles.css', '/ui-system.css',
  '/css/tokens.css', '/css/base.css', '/css/layout.css', '/css/foundation.css',
  '/css/components/app-shell.css', '/css/components/dashboard.css', '/css/components/printer.css',
  '/css/components/weigh.css', '/css/components/physical-spool.css', '/css/components/profile-preferences.css',
  '/app-version.js', '/events.js', '/user-isolation.js', '/state-merge.js', '/audit-core.js', '/personal-core.js',
  '/profile-preferences-core.js', '/intake-core.js', '/scan-core.js', '/printer-core.js', '/inventory-command-core.js',
  '/spool-actions-core.js', '/smart-weigh-core.js', '/bulk-actions-core.js', '/print-readiness-core.js', '/workflows.js',
  '/sync-client.js', '/security-client.js', '/labels-client.js', '/household-client.js', '/ux-client.js', '/audit-client.js',
  '/personal-dashboard.js', '/profile-preferences-client.js', '/intake-client.js', '/scan-client.js', '/printer-dashboard.js',
  '/inventory-command-client.js', '/spool-actions-client.js', '/smart-weigh-client.js', '/bulk-actions-client.js',
  '/print-readiness-client.js', '/ui-v10-client.js', '/app-shell-client.js', '/app.js', '/manifest.webmanifest', '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put('/index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // UI code must update immediately while online. Fall back to cache only when the network is unavailable.
  if (request.destination === 'style' || request.destination === 'script') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
