const CACHE_NAME = 'dona-antonia-v2'; // Versão do cache
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './lista/clientes.js',
  // Imagens principais
  './img/logo-super-cesta-basica-dona-antonia-cuiaba-varzea-grande.avif',
  './img/cesta-basica-cuiaba-varzea-grande-economica.avif',
  './img/cesta-basica-cuiaba-varzea-grande-mini.avif',
  './img/cesta-basica-cuiaba-varzea-grande-pequena.avif',
  './img/cesta-basica-cuiaba-varzea-grande-media.avif',
  './img/cesta-basica-cuiaba-varzea-grande-grande.avif',
  './img/cesta.png',
  './img/pagamento.png',
  './img/entrega.png',
  './img/amaciante.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: A fazer cache dos ficheiros');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting(); // Força o SW a ativar-se imediatamente
});

// Ativação e Limpeza de Caches Antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: A limpar cache antiga');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // Controla as páginas abertas imediatamente
});

// Interceção de Pedidos (Fetch)
self.addEventListener('fetch', (event) => {
  // Ignora pedidos que não sejam GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Se encontrar no cache, retorna o cache
        if (cachedResponse) {
            return cachedResponse;
        }

        // Se não, vai buscar à rede
        return fetch(event.request)
          .catch(() => {
            // Se falhar (offline) e for uma navegação, retorna a página principal
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
          });
      })
  );
});
