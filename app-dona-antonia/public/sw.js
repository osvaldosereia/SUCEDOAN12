const CACHE_NAME = 'da-hml-v1';
const APP_SHELL = ['./', './index.html'];
const STATIC_DESTINATIONS = new Set([
  'document',
  'script',
  'style',
  'image',
  'font',
]);

function hasSensitiveQuery(url) {
  const blocked = ['token', 'session', 'code', 'secret', 'auth'];
  return blocked.some((key) => url.searchParams.has(key));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('da-hml-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/comprar/')) return;
  if (hasSensitiveQuery(url)) return;
  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.destination === 'document') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }

        throw new Error('Offline and no cached response');
      }),
  );
});
