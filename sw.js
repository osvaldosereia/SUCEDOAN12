// Nome do nosso armazenamento em cache
const CACHE_NAME = 'dona-antonia-app-v1';

// Arquivos básicos que vamos guardar no celular do cliente
const arquivosParaCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Passo 1: Instalação do Service Worker
// Aqui ele guarda os arquivos básicos no cache do celular
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto com sucesso!');
        return cache.addAll(arquivosParaCache);
      })
  );
});

// Passo 2: Interceptar as requisições (Fetch)
// Quando o app pede uma imagem ou página, ele olha primeiro se já tem guardado
self.addEventListener('fetch', (evento) => {
  evento.respondWith(
    caches.match(evento.request)
      .then((resposta) => {
        // Se encontrou no cache, devolve. Se não, busca na internet.
        return resposta || fetch(evento.request);
      })
  );
});
