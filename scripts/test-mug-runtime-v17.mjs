import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = path => readFile(path, 'utf8');
const filesToCheck = [
  'app-next/src/mug-public-runtime-v6.js',
  'app-next/src/mug-public-personalization-v6.js',
  'app-next/src/mug-public-3d-v2.js',
  'app-next/src/mug-public-thumbnails-v2.js',
  'app-next/src/customer-favorites-v27.js',
  'app-next/src/mug-public-personalization-contract-v25.js',
  'app-next/src/mug-public-result-link-v26.js',
  'app-next/src/checkout-phone-fix.js',
  'producao-v2/js/mug-make-native-openai-bridge.js',
  'caneca10/art-recovery-v1.js',
  'shared/mug-make-fast-ack-v1.js',
  'producao-v2/js/mug-force-low-quality-v23.js'
];
for (const file of filesToCheck) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || `Erro de sintaxe em ${file}`);
}

const [
  index, productMedia, publicRuntime, customerLibrary, publicContract, publicController,
  public3d, publicThumbs, publicResultLink, publicResultPage, checkoutPhone, admin, prodLoader,
  caneca10, canecaRecovery, stabilizer, printCache, transport, forceLow
] = await Promise.all([
  read('index.html'),
  read('app-next/src/product-media.js'),
  read('app-next/src/mug-public-runtime-v6.js'),
  read('app-next/src/customer-favorites-v27.js'),
  read('app-next/src/mug-public-personalization-contract-v25.js'),
  read('app-next/src/mug-public-personalization-v6.js'),
  read('app-next/src/mug-public-3d-v2.js'),
  read('app-next/src/mug-public-thumbnails-v2.js'),
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

assert.match(index, /public-mug-recovery-v21|customer-library-v27|mug-printable-arc-v3/);
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
assert.match(publicRuntime, /mug-public-personalization-v6\.js/);
assert.doesNotMatch(publicRuntime, /mug-public-personalization-v5\.js/);
assert.match(publicRuntime, /mug-public-result-link-v26\.js/);
assert.match(publicRuntime, /mug-public-thumbnails-v2\.js/);
assert.match(publicRuntime, /mug-public-3d-v2\.js/);
assert.match(publicRuntime, /v21-printable-arc/);
assert.ok(publicRuntime.indexOf('mug-public-personalization-contract-v25.js') < publicRuntime.indexOf('mug-public-personalization-v6.js'), 'contrato público deve carregar antes do controlador');
assert.ok(publicRuntime.indexOf('mug-public-personalization-v6.js') < publicRuntime.indexOf('mug-public-result-link-v26.js'), 'correção de links deve carregar depois do controlador');
assert.ok(publicRuntime.indexOf('mug-public-result-link-v26.js') < publicRuntime.indexOf('mug-public-3d-v2.js'), '3D deve carregar depois do controlador e do ajuste de links');
assert.match(publicRuntime, /isProductRoute/);
assert.match(publicRuntime, /featurePromise/);
assert.doesNotMatch(publicRuntime, /setInterval\(/, 'runtime não deve usar polling contínuo de rota');

assert.match(publicController, /action:'personalize_mug_model'/);
assert.match(publicController, /action:'finalize_mug_product'/);
assert.match(publicController, /arte_horizontal/);
assert.match(publicController, /preview_esquerda:''/);
assert.match(publicController, /preview_direita:''/);
assert.match(publicController, /render_3d_version:'mug-public-3d-v2'/);
assert.match(publicController, /frase:phraseValue/);
assert.doesNotMatch(publicController, /mockup_left_base64|mockup_right_base64|mockup_center_base64/);
assert.doesNotMatch(publicController, /prompt_mockup_1|prompt_mockup_2|prompt_mockup_3/);
assert.doesNotMatch(publicController, /cropReference\(/);
assert.match(publicController, /A automação aceitou a criação, mas a arte horizontal não apareceu/);

assert.match(public3d, /RoomEnvironment/);
assert.match(public3d, /PMREMGenerator/);
assert.match(public3d, /MeshPhysicalMaterial/);
assert.match(public3d, /preview_esquerda/);
assert.match(public3d, /preview_direita/);
assert.match(public3d, /Ver caneca em 360°/);
assert.match(public3d, /pointers=new Map/);
assert.match(public3d, /PRINT_WIDTH_MM=235/);
assert.match(public3d, /MUG_CIRCUMFERENCE_MM=260/);
assert.match(public3d, /PRINT_ARC_RAD/);
assert.match(public3d, /HANDLE_GAP_RAD/);
assert.match(public3d, /ART_SHELL_THETA_START/);
assert.doesNotMatch(public3d, /setInterval\(/);
assert.match(publicThumbs, /thumbnail/);
assert.match(publicThumbs, /IntersectionObserver/);
assert.match(publicThumbs, /arte_horizontal/);
assert.doesNotMatch(publicThumbs, /THREE_URL|three\.module/);

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
assert.match(customerLibrary, /arte_horizontal/);
assert.match(customerLibrary, /record\.mockup_1 \|\| record\.arte_horizontal/, 'biblioteca deve aceitar arte horizontal quando não há mockup legado');
assert.doesNotMatch(customerLibrary, /setInterval\(/, 'biblioteca não deve usar polling contínuo');

assert.match(publicContract, /personalize_mug_model/);
assert.match(publicContract, /payload\.image_base64 = firstCustomerPhoto\(payload\)/);
assert.match(publicContract, /fallbackModelImage/);
assert.match(publicContract, /payload\.quality = 'low'/);
assert.match(publicContract, /canecas\/geracoes/);
assert.match(publicContract, /waitForPersonalizedArt/);

assert.match(publicResultLink, /\/ceneca10\/resultado\.html/);
assert.match(publicResultLink, /\/caneca10\/resultado\.html/);
assert.match(publicResultPage, /cedar-chemist-310801-default-rtdb\.firebaseio\.com/);
assert.match(publicResultPage, /arte_horizontal/);
assert.match(publicResultPage, /mug-public-3d-v2\.js/);
assert.match(publicResultPage, /generatePreviews/);
assert.match(publicResultPage, /Ver caneca em 360°/);
assert.match(publicResultPage, /printable-arc-v3/);
assert.doesNotMatch(publicResultPage, /mockup_1|mockup_2|mockup_3|três prévias|quatro imagens/i);

assert.match(checkoutPhone, /getElementById\('checkout-content'\)/);
assert.doesNotMatch(checkoutPhone, /observer\.observe\(document\.documentElement/, 'observer do checkout não deve observar o site inteiro');
assert.match(productMedia, /const branch = decodeURIComponent/);
assert.match(productMedia, /branch === 'main' && path \? `\/\$\{path\}` : raw/);
assert.match(stabilizer, /\(\?:main\|master\)/, 'compactador só deve converter main/master para caminho local');

assert.match(admin, /20260827-canecas-clean-v24-low-async/);
assert.match(prodLoader, /mug-personalizer-v15-clean\.js/);
assert.match(prodLoader, /mug-make-art-recovery-v22\.js/);
assert.match(prodLoader, /mug-force-low-quality-v23\.js/);
assert.doesNotMatch(prodLoader, /mug-make-fast-ack-v1\.js/, 'Produção não deve usar ACK sintético compartilhado');

const canecaTransportPos = caneca10.indexOf('../shared/mug-make-fast-ack-v1.js');
const canecaRecoveryPos = caneca10.indexOf('./art-recovery-v1.js');
const canecaAppPos = caneca10.indexOf('./app-v4-clean.js');
assert.ok(canecaTransportPos >= 0 && canecaRecoveryPos > canecaTransportPos && canecaAppPos > canecaRecoveryPos, 'Caneca10 deve carregar transporte LOW, recovery e então o app');
assert.match(caneca10, /20260828-caneca10-art-only-v1/);
assert.doesNotMatch(caneca10, /3 mockups|mockupCarousel|mockup1|mockup2|mockup3/);
assert.match(canecaRecovery, /canecas\/geracoes/);
assert.match(canecaRecovery, /generate_mug_art/);
assert.match(canecaRecovery, /waitForArt/);

assert.match(transport, /finalize_mug_product/);
assert.match(transport, /ACK_AFTER_MS = 10000/);
assert.match(transport, /inner\.quality = 'low'/);
assert.match(forceLow, /inner\.quality = 'low'/);
assert.match(forceLow, /generate_mug_art/);
assert.match(forceLow, /finalize_mug_product/);

const printData=JSON.parse(printCache);
const printable=Object.values(printData||{}).filter(item=>item&&item.arte_horizontal);
assert.ok(printable.length>0,'cache do Caneca Print deve conter ao menos uma arte horizontal');
assert.ok(printable.every(item=>typeof item.arte_horizontal==='string'&&item.arte_horizontal.length>0),'todas as canecas imprimíveis precisam da arte horizontal');

console.log('OK · Runtime público art-only + 3D com arco sublimável + Produção + Caneca10 validados.');