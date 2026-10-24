// Filament Inventory was retired on 24 Oct 2026. This worker replaces the old one, clears its caches,
// unregisters itself and reloads open pages so they show the retirement notice.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
