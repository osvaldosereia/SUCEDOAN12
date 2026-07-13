/* Kill switch: remove Service Workers/cache de versões antigas. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(windows.map(client => client.navigate(client.url)));
    } catch (_) {}
  })());
});
