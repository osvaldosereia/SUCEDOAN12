// Mudamos para v2 para forçar o telemóvel dos clientes a atualizar o sistema!
const CACHE_NAME = 'dona-antonia-app-v6'; 
const urlsToCache = [
  './index.html',
  './manifest.json'
];

// 1. Instalação do Service Worker e Cache dos arquivos principais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Arquivos básicos em cache');
        return cache.addAll(urlsToCache);
      })
  );
  // Obriga o telemóvel a ativar esta nova versão imediatamente
  self.skipWaiting();
});

// 2. Limpeza de Caches Antigos (Apaga o v1 e deixa só o v2 para não encher a memória)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('A apagar cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Intercetar as requisições com INTELIGÊNCIA PARA IMAGENS
self.addEventListener('fetch', (event) => {
  // Se o que o site está a pedir for uma IMAGEM (webp, png, jpg, avif)...
  if (event.request.destination === 'image' || event.request.url.match(/\.(webp|png|jpg|jpeg|avif)$/)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Se a imagem já estiver no cache do telemóvel, devolve na hora! (Super rápido)
        if (cachedResponse) {
          return cachedResponse;
        }

        // Se não estiver, vai à internet (GitHub) procurar...
        return fetch(event.request).then((networkResponse) => {
          // Garante que a imagem veio certinha antes de a guardar
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Clona a imagem e guarda no "cofre" (cache) para a próxima visita!
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        });
      })
    );
  } else {
    // Para o resto das coisas (HTML, JSON), funciona como tu já tinhas feito
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});
