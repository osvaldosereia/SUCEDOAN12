const CACHE_NAME = 'dona-antonia-app-v1';
const urlsToCache = [
  './index.html',
  './manifest.json'
];

// Instalação do Service Worker e Cache dos arquivos principais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Arquivos em cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar as requisições para servir o cache quando offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retorna o cache se encontrar, senão busca na rede
        return response || fetch(event.request);
      })
  );
});
