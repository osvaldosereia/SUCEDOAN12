// Mudamos para v2 para forçar o celular dos clientes a atualizar o sistema!
const CACHE_NAME = 'dona-antonia-app-v2'; 
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
  // Obriga o celular a ativar essa nova versão imediatamente
  self.skipWaiting();
});

// Limpeza de Caches Antigos (Apaga o v1 e deixa só o v2)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Apagando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar as requisições com INTELIGÊNCIA PARA IMAGENS
self.addEventListener('fetch', (event) => {
  // Se o que o site está pedindo for uma IMAGEM...
  if (event.request.destination === 'image' || event.request.url.match(/\.(webp|png|jpg|jpeg|avif)$/)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Se a imagem já estiver no cache do celular, devolve na hora! (Super rápido)
        if (cachedResponse) {
          return cachedResponse;
        }

        // Se não estiver, vai na internet buscar...
        return fetch(event.request).then((networkResponse) => {
          // Garante que a imagem veio certinha antes de salvar
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Clona a imagem e guarda no cache para a próxima visita!
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        });
      })
    );
  } else {
    // Para o resto das coisas (HTML, JSON), funciona como você já tinha feito
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});
