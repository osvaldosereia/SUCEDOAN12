import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const [index, productMedia, publicRuntime, customerLibrary, publicContract, publicController, publicResultLink, publicResultPage, checkoutPhone, admin, prodLoader, caneca10, canecaRecovery, stabilizer, printCache, transport, forceLow] = await Promise.all([
  read('index.html'),
  read('app-next/src/product-media.js'),
  read('app-next/src/mug-public-runtime-v6.js'),
  read('app-next/src/customer-favorites-v27.js'),
  read('app-next/src/mug-public-personalization-contract-v25.js'),
  read('app-next/src/mug-public-personalization-v5.js'),
  read('app-next/src/mug-public-result-link-v26.js'),
  read('caneca10/resultado.html'),
  read('app-next/src/checkout-phone-fix.js'),
  read('producao-v2/admin-produtivo.html'),
  read('producao-v2/js/mug-make-native-openai-bridge.js'),
  read('caneca10/index.html'),
  read('caneca10/art-recovery-v1.js'),
  read('scripts/estabilizar-catalogo-publico.mjs'),
  read('site/canecas-print.json'),
  read('shared/mug-make-fast-ack-v1.js'),
  read('producao-v2/js/mug-force-low-quality-v23.js')
]);

assert.match(index, /public-mug-recovery-v21|customer-library-v27/);
assert.match(index, /mug-public-runtime-v6\.js/);
assert.equal((index.match(/mug-public-runtime-v6\.js/g) || []).length, 2, 'runtime público deve aparecer apenas no preload e no script');
assert.doesNotMatch(index, /<script[^>]+mug-public-personalization-v[0-9]+\.js/i, 'index não deve carregar controlador público diretamente');

assert.match(publicRuntime, /customer-favorites-v27\.js/);
assert.match(publicRuntime, /loadCustomerLibrary/);
assert.ok(publicRuntime.indexOf('loadCustomerLibrary') < publicRuntime.indexOf('if (!isProductRoute()) return'), 'biblioteca do cliente deve carregar também fora da rota de produto');
assert.match(publicRuntime, /da:mug-personalized-added/);
assert.match(publicRuntime, /__DA_CUSTOMER_LIBRARY__/);
assert.match(publicRuntime, /mug-make-fast-ack-v1\.js/);
assert.match(publicRuntime, /mug-public-personalization-contract-v25\.js/);
assert.match(publicRuntime, /mug-public-personalization-v5\.js/);
assert.match(publicRuntime, /mug-public-result-link-v26\.js/);
assert.match(publicRuntime, /mug-public-thumbnails-v1\.js/);
assert.match(publicRuntime, /mug-public-3d-v1\.js/);
assert.ok(publicRuntime.indexOf('mug-public-personalization-contract-v25.js') < publicRuntime.indexOf('mug-public-personalization-v5.js'), 'contrato público deve carregar antes do controlador');
assert.ok(publicRuntime.indexOf('mug-public-personalization-v5.js') < publicRuntime.indexOf('mug-public-result-link-v26.js'), 'correção do resultado deve carregar depois do controlador');
assert.match(publicRuntime, /isProductRoute/);
assert.match(publicRuntime, /featurePromise/);
assert.doesNotMatch(publicRuntime, /mug-public-route-guard-v6\.js/);
assert.doesNotMatch(publicRuntime, /dispatchEvent\(new Event\('hashchange'\)\)/, 'runtime não pode provocar hashchange sintético');
assert.doesNotMatch(publicRuntime, /setInterval\(/, 'runtime não deve usar polling contínuo de rota');

assert.match(customerLibrary, /const CUSTOMER_ROOT = 'canecas\/clientes'/);
assert.match(customerLibrary, /crypto\.subtle\.digest\('SHA-256'/);
assert.match(customerLibrary, /Minhas canecas/);
assert.match(customerLibrary, /Recuperar minhas canecas/);
assert.match(customerLibrary, /status: 'rascunho'/);
assert.match(customerLibrary, /status: 'arquivada'/);
assert.match(customerLibrary, /da:mug-personalized-added/);
assert.match(customerLibrary, /syncFavorites/);
assert.match(customerLibrary, /captureMug/);
assert.match(customerLibrary, /migrateKnownMugs/);
assert.match(customerLibrary, /mockup_3/);
assert.match(customerLibrary, /arte_horizontal/);
assert.doesNotMatch(customerLibrary, /setInterval\(/, 'biblioteca não deve usar polling contínuo');
assert.doesNotMatch(customerLibrary, /dispatchEvent\(new Event\(['"]hashchange/, 'biblioteca não deve provocar hashchange sintético');

assert.match(publicContract, /personalize_mug_model/);
assert.match(publicContract, /payload\.image_base64 = firstCustomerPhoto\(payload\)/);
assert.match(publicContract, /fallbackModelImage/);
assert.match(publicContract, /payload\.quality = 'low'/);
assert.match(publicContract, /canecas\/geracoes/);
assert.match(publicContract, /waitForPersonalizedArt/);
assert.match(publicContract, /Failed to fetch/);
assert.doesNotMatch(publicController, /personalizacao_cliente:\{[^}]*\bfrase\s*,/s, 'não pode existir shorthand `frase` sem variável declarada');
assert.match(publicController, /frase:phraseValue/);

assert.match(publicResultLink, /\/ceneca10\/resultado\.html/);
assert.match(publicResultLink, /\/caneca10\/resultado\.html/);
assert.match(publicResultPage, /cedar-chemist-310801-default-rtdb\.firebaseio\.com/);
assert.match(publicResultPage, /mockup_3/);
assert.match(publicResultPage, /arte_horizontal/);

assert.match(checkoutPhone, /getElementById\('checkout-content'\)/);
assert.doesNotMatch(checkoutPhone, /observer\.observe\(document\.documentElement/, 'observer do checkout não deve observar o site inteiro');

assert.match(productMedia, /const branch = decodeURIComponent/);
assert.match(productMedia, /branch === 'main' && path \? `\/\$\{path\}` : raw/);
assert.match(stabilizer, /\(\?:main\|master\)/, 'compactador só deve converter main/master para caminho local');

assert.match(admin, /20260827-canecas-clean-v24-low-async/);
assert.match(prodLoader, /mug-personalizer-v15-clean\.js/);
assert.match(prodLoader, /mug-make-art-recovery-v22\.js/);
assert.match(prodLoader, /mug-force-low-quality-v23\.js/);
assert.doesNotMatch(prodLoader, /mug-make-fast-ack-v1\.js/, 'Produção não deve usar o ACK sintético compartilhado; usa recuperação de arte + acompanhamento Firebase');

const canecaTransportPos = caneca10.indexOf('../shared/mug-make-fast-ack-v1.js');
const canecaRecoveryPos = caneca10.indexOf('./art-recovery-v1.js');
const canecaAppPos = caneca10.indexOf('./app-v4-clean.js');
assert.ok(canecaTransportPos >= 0 && canecaRecoveryPos > canecaTransportPos && canecaAppPos > canecaRecoveryPos, 'Caneca10 deve carregar transporte LOW, recovery e então o app');
assert.match(caneca10, /20260828-caneca10-art-only-v1/);
assert.doesNotMatch(caneca10, /3 mockups|mockupCarousel|mockup1|mockup2|mockup3/);
assert.doesNotMatch(caneca10, /gallery-refresh-v5\.js/);
assert.match(canecaRecovery, /canecas\/geracoes/);
assert.match(canecaRecovery, /generate_mug_art/);
assert.match(canecaRecovery, /waitForArt/);
assert.match(canecaRecovery, /progressDetail/);

assert.match(transport, /finalize_mug_product/);
assert.match(transport, /ACK_AFTER_MS = 10000/);
assert.match(transport, /inner\.quality = 'low'/);
assert.match(transport, /Promise\.race\(\[request, earlyAck\]\)/);
assert.match(forceLow, /inner\.quality = 'low'/);
assert.match(forceLow, /generate_mug_art/);
assert.match(forceLow, /finalize_mug_product/);

assert.match(printCache, /mug-1787777190767-nmn7zk/);
assert.match(printCache, /SUCEDOAN12\/canecas-media\/canecas\/imagens\/mockups/);

console.log('OK · Runtime público + biblioteca V27 + previews/3D + Produção + Caneca10 arte horizontal validados.');