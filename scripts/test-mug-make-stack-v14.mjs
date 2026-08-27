import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = {
  productionNavigation: 'producao-v2/js/navigation-v12.js',
  productionCatalogSync: 'producao-v2/js/catalog-auto-sync.js',
  productionMedia: 'producao-v2/js/mug-product-media-enhancement-v19.js',
  productionBridge: 'producao-v2/js/mug-make-native-openai-bridge.js',
  productionClient: 'producao-v2/js/mug-personalizer-v15-clean.js',
  productionGallery: 'producao-v2/js/mug-studio-gallery.js',
  productionFinalizer: 'producao-v2/js/mug-studio-v8-finalizer.js',
  publicRuntime: 'app-next/src/mug-public-runtime-v6.js',
  publicClient: 'app-next/src/mug-public-personalization-v5.js',
  mobileIndex: 'ceneca10/index.html',
  mobileClient: 'ceneca10/app-v4-clean.js',
  sharedTransport: 'shared/mug-make-fast-ack-v1.js',
};

const src = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));
const failures = [];
const need = (key, token, message) => { if (!src[key].includes(token)) failures.push(message); };
const reject = (key, token, message) => { if (src[key].includes(token)) failures.push(message); };
const count = (key, token) => src[key].split(token).length - 1;

for (const path of Object.values(files).filter(path => path.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path}: ${result.stderr || result.stdout}`);
}

const hook = 'cl3r1f56r9txezvltkkwlsspmnja6sw4';

// PRODUÇÃO: um único gerador atual; módulo legado de 2 mockups não pode ser carregado.
need('productionNavigation', './mug-product-media-enhancement-v19.js', 'Navegação não carrega o módulo leve de mídia atual.');
reject('productionNavigation', './mug-products-enhancement.js', 'Navegação ainda carrega o gerador legado de 2 mockups.');
need('productionNavigation', 'três mockups', 'Texto do Criador ainda descreve fluxo antigo de dois mockups.');
need('productionCatalogSync', './mug-product-media-enhancement-v19.js', 'Sincronizador ainda não usa o módulo leve de mídia.');
reject('productionCatalogSync', './mug-products-enhancement.js', 'Sincronizador global ainda carrega o gerador legado.');
need('productionMedia', 'const MASTER_WIDTH = 2400', 'Editor de mídia usa largura antiga da arte.');
need('productionMedia', 'const MASTER_HEIGHT = 960', 'Editor de mídia usa altura antiga da arte.');
reject('productionMedia', 'installMugPanel', 'Módulo de mídia não pode montar um segundo gerador.');
reject('productionMedia', 'generate_mug_mockup', 'Módulo de mídia não pode chamar geração de mockup.');

need('productionBridge', './mug-personalizer-v15-clean.js', 'Produção não carrega o controlador atual de canecas.');
reject('productionBridge', 'mug-make-fast-ack-v1.js', 'Produção voltou a instalar o Accepted sintético de 10 s.');
if (count('productionBridge', 'mug-personalizer-') !== 1) failures.push('Produção deve carregar exatamente um controlador mug-personalizer.');
need('productionClient', hook, 'Produção não usa o webhook oficial configurado.');
need('productionClient', "action:'finalize_mug_product'", 'Produção não chama a finalização da caneca.');
need('productionClient', 'waitFinalProduct', 'Produção perdeu o fallback de polling quando o Make responde Accepted.');
need('productionClient', "cache:'no-store'", 'Polling do Produção pode ler o Firebase em cache.');
need('productionClient', '[urls.art,urls.m1,urls.m2,urls.m3].every(isHttpUrl)', 'Produção não valida arte + 3 mockups.');
need('productionClient', 'renderResult(resultBox,urls,catalog);', 'Produção não renderiza as quatro imagens ao concluir.');
need('productionClient', "new CustomEvent('admin-v2-products-invalidated'", 'Produção não invalida a lista após salvar a caneca.');
need('productionClient', "new CustomEvent('da:mug-created'", 'Produção não anuncia a caneca criada à interface.');
reject('productionClient', 'window.fetch =', 'Controlador do Produção não deve monkey-patchar window.fetch.');
need('productionGallery', "window.addEventListener('admin-v2-products-invalidated'", 'Galeria do Produção não reage à criação sem F5.');
need('productionGallery', 'scheduleRefresh(400)', 'Galeria do Produção não agenda atualização após criação.');
need('productionFinalizer', "window.addEventListener('admin-v2-products-invalidated'", 'Finalizador não força atualização da galeria após criação.');

// SITE PÚBLICO: Accepted rápido permanece isolado fora do Produção.
const publicTransportPos = src.publicRuntime.indexOf('../../shared/mug-make-fast-ack-v1.js');
const publicControllerPos = src.publicRuntime.indexOf('./mug-public-personalization-v5.js');
if (publicTransportPos < 0 || publicControllerPos <= publicTransportPos) failures.push('Site público deve carregar o transporte compartilhado antes do personalizador.');
need('publicClient', "action:'finalize_mug_product'", 'Site público não finaliza canecas.');
need('publicClient', 'waitFinalProduct', 'Site público não recupera finalização Accepted pelo Firebase.');
reject('publicClient', 'window.fetch =', 'Controlador público não deve monkey-patchar window.fetch diretamente.');

// CANECA10: mantém o transporte rápido antes do app móvel.
const mobileTransportPos = src.mobileIndex.indexOf('../shared/mug-make-fast-ack-v1.js');
const mobileAppPos = src.mobileIndex.indexOf('./app-v4-clean.js');
if (mobileTransportPos < 0 || mobileAppPos <= mobileTransportPos) failures.push('Caneca10 deve carregar o transporte compartilhado antes do app atual.');
need('mobileClient', "action:'finalize_mug_product'", 'Caneca10 não finaliza canecas.');
need('mobileClient', 'waitFinalProduct', 'Caneca10 não recupera finalização Accepted pelo Firebase.');

need('sharedTransport', 'ACK_AFTER_MS = 10000', 'Transporte compartilhado perdeu o Accepted rápido de 10 s.');
need('sharedTransport', "inner?.action === 'finalize_mug_product'", 'Transporte compartilhado não restringe a interceptação à finalização.');
need('sharedTransport', 'Promise.race([request, earlyAck])', 'Transporte compartilhado não preserva a requisição real em paralelo.');

if (failures.length) {
  console.error(`Stack atual de canecas FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Stack atual OK: Produção com um gerador, mídia 2400×960, resposta real do Make, 4 imagens e galeria sem F5.');
