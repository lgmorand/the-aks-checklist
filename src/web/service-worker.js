'use strict';

// Retire the legacy worker without serving stale checklists from its old caches.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('v1::')) await caches.delete(key);
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
