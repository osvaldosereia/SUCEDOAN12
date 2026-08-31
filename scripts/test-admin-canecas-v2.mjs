import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const admin = path.join(root, 'admin-canecas');
const read = name => fs.readFileSync(path.join(admin, name), 'utf8');
const exists = name => fs.existsSync(path.join(admin, name));

const index = read('index.html');
const app = read('app-v2.js');
const catalog = read('catalog-manager-v5.js');
const banners = read('banner-manager-v7.js');
const store = read('mug-store-v2.js');
const generator = read('generator-v1.js');
const bulk = read('bulk-actions-v1.js');
const grid = read('mug-grid-v1.js');
const dual = read('li-dual-sync-v3.js');
const stability = read('mugs-stability-v2.js');
const inlineCategory = read('mug-inline-category-v2.js');
const recovery = read('li-recovery-v3.js');
const coordinator = read('li-sync-coordinator-v4.js');
const crops = read('storefront-crops-github-v2.js');
const contentManager = read('product-content-manager-v1.js');
const registrationStatus = read('li-registration-status-v1.js');
const liWorker = fs.readFileSync(path.join(root, 'scripts', 'sincronizar-loja-integrada.mjs'), 'utf8');
const cropWorker = fs.readFileSync(path.join(root, 'scripts', 'processar-vitrine-canecas.mjs'), 'utf8');

const activeModules = [...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m => m[1]);
assert.deepEqual(activeModules, [
  'product-policy-v1.js',
  'li-payload-hardening-v1.js',
  'catalog-manager-v5.js',
  'product-images-v1.js',
  'banner-manager-v7.js',
  'banner-background-v1.js',
  'li-recovery-v3.js',
  'li-sync-coordinator-v4.js',
  'bulk-actions-v1.js',
  'mug-grid-v1.js',
  'app-v2.js',
  'generator-category-v1.js',
  'storefront-crops-github-v2.js',
  'generator-v1.js',
  'generator-library-v1.js',
  'make-webhook-settings-v1.js',
  'product-content-manager-v1.js',
  'li-dual-sync-v3.js',
  'mugs-stability-v2.js',
  'mug-inline-category-v2.js',
  'li-registration-status-v1.js'
], 'index deve carregar somente os módulos ativos conhecidos');

for (const legacy of [
  'app.js', 'catalog-manager-v3.js', 'catalog-manager-v4.js', 'catalog-manager-bridge-v1.js',
  'loja-integrada-export-v1.js', 'canecafacil-config-v2.js', 'li-admin-runtime-v1.js',
  'mug-products-scope-v1.js', 'banner-manager-v1.js'
]) assert.equal(exists(legacy), false, `arquivo legado ainda existe: ${legacy}`);

for (const [name, code] of [
  ['app-v2.js', app], ['catalog-manager-v5.js', catalog], ['banner-manager-v7.js', banners],
  ['mug-store-v2.js', store], ['generator-v1.js', generator], ['bulk-actions-v1.js', bulk], ['mug-grid-v1.js', grid],
  ['li-dual-sync-v3.js', dual], ['mugs-stability-v2.js', stability], ['mug-inline-category-v2.js', inlineCategory],
  ['li-recovery-v3.js', recovery], ['li-sync-coordinator-v4.js', coordinator],
  ['product-content-manager-v1.js', contentManager], ['li-registration-status-v1.js', registrationStatus]
]) {
  assert.equal(/fbGet\(\s*['"]produtos['"]\s*\)/.test(code), false, `${name} não deve ler /produtos inteiro diretamente`);
}

assert.match(store, /orderBy[^\n]+categoria/, 'store deve consultar por categoria');
assert.match(store, /CACHE_MS\s*=\s*120000/, 'store deve compartilhar cache de 2 minutos');
assert.match(app, /admin-canecas:route/, 'core deve publicar eventos de rota');
assert.equal(app.includes('function renderMugs'), false, 'core não deve competir com o catálogo pela aba Canecas');

assert.ok(index.includes('mugs-stability-v2.js?v=20260831-1'), 'index deve carregar estabilizador v2');
assert.match(stability, /const\s+PRESERVE\s*=\s*\[/, 'estabilizador deve preservar nós visuais');
assert.match(stability, /cfMugGridWrap/, 'estabilizador deve preservar a grade');
assert.match(stability, /cfBulkActions/, 'estabilizador deve preservar seleção em lote');
assert.match(stability, /cfDualSyncPanel/, 'estabilizador deve preservar publicação');
assert.match(stability, /mutationIsCatalogRender/, 'grade deve reagir apenas ao render real do catálogo');
assert.match(stability, /observer\.observe\(root,\s*\{\s*childList:\s*true\s*\}\)/, 'observer deve observar somente filhos diretos de #mugs');
assert.equal(/observer\.observe\(document\.documentElement/.test(stability), false, 'estabilizador não pode observar o documento inteiro');
assert.match(stability, /await\s+renderGrid\(\)/, 'grade deve ser atualizada depois do catálogo');
assert.match(stability, /admin-canecas:mugs-stable-rendered/, 'deve publicar evento de grade estável');

for (const [name, code] of [
  ['li-dual-sync-v3.js', dual],
  ['li-recovery-v3.js', recovery],
  ['li-sync-coordinator-v4.js', coordinator],
  ['li-registration-status-v1.js', registrationStatus]
]) {
  assert.equal(/new\s+MutationObserver/.test(code), false, `${name} não pode usar MutationObserver`);
  assert.equal(/setInterval\s*\(/.test(code), false, `${name} não pode atualizar UI periodicamente`);
}

assert.ok(index.includes('mug-inline-category-v2.js?v=20260831-1'), 'index deve usar categoria rápida v2');
assert.match(inlineCategory, /await\s+loadMugs\(\)/, 'categoria rápida deve reaproveitar cache');
assert.match(inlineCategory, /admin-canecas:mugs-stable-rendered/, 'categoria rápida deve esperar grade estável');
assert.equal(/attempt\s*<\s*35/.test(inlineCategory), false, 'não pode usar tentativas progressivas por card');

assert.ok(index.includes('li-dual-sync-v3.js?v=20260831-1'), 'index deve carregar UI dual v3');
assert.match(dual, /Publicar na Loja Integrada/, 'painel deve ter linguagem simples de publicação');
assert.match(dual, /Publicar selecionadas · GitHub/, 'GitHub deve ser ação principal clara');
assert.match(dual, /Publicar selecionadas · Make/, 'Make deve permanecer como reserva clara');
assert.match(dual, /cfBulkActivateDa,#cfBulkActivateCf,#cfBulkActivateBoth/, 'ações antigas confusas devem ficar ocultas');
assert.match(dual, /Salvar \+ publicar · Make/, 'drawer deve identificar contingência Make');
assert.match(dual, /Salvar \+ publicar · GitHub/, 'drawer deve identificar GitHub');
assert.match(dual, /SKU repetido no Firebase/, 'fila GitHub deve bloquear SKU local duplicado');
assert.ok(index.includes('li-recovery-v3.js?v=20260831-1'), 'recuperação silenciosa por SKU deve estar ativa');
assert.ok(index.includes('li-sync-coordinator-v4.js?v=20260831-1'), 'coordenador Make silencioso deve estar ativo');
assert.match(recovery, /loja_integrada_find_product_by_sku/, 'Make deve reconciliar por SKU antes de criar');
assert.match(coordinator, /recoverOne/, 'coordenador Make deve recuperar produto existente');
assert.match(coordinator, /stopImmediatePropagation/, 'coordenador deve interceptar somente a ação explícita do usuário');

assert.ok(index.includes('product-content-manager-v1.js?v=20260831-2'), 'index deve carregar editor central de conteúdo atualizado');
assert.match(contentManager, /Conteúdo do Produto/, 'editor central deve existir em Configurações');
assert.equal((contentManager.match(/id=\\?"cfContentEnabled\\?"/g) || []).length, 1, 'editor deve possuir somente um controle Ativo');
assert.match(contentManager, /Testar em 1 caneca/, 'editor deve oferecer teste individual antes da publicação em massa');
assert.match(contentManager, /Publicar em todas as cadastradas/, 'editor deve oferecer publicação em massa explícita');
assert.ok(index.includes('li-registration-status-v1.js?v=20260831-2'), 'status de cadastro Loja Integrada deve usar versão sem observer global');
assert.match(registrationStatus, /admin-canecas:mugs-stable-rendered/, 'status deve atualizar por evento da grade estável');

assert.equal(index.includes('archive-audit-v4.js'), false, 'auditoria técnica não deve carregar na aba Canecas');
assert.equal(index.includes('archive-audit-v3.js'), false, 'auditoria antiga não deve carregar');

assert.ok(index.includes('storefront-crops-github-v2.js?v=20260831-1'), 'index deve usar vitrine v2');
assert.match(crops, /return \[text\(product\.mockup_2\), text\(product\.mockup_1\), crops\.left, crops\.right, crops\.center\]/, 'payload Make deve usar ordem oficial');
assert.match(liWorker, /return\s*\[\s*p\.mockup_2,\s*p\.mockup_1,\s*p\.vitrine_recorte_esquerda[\s\S]*?p\.vitrine_recorte_direita[\s\S]*?p\.vitrine_recorte_centro/, 'worker GitHub deve usar ordem oficial');
assert.match(cropWorker, /imagens_canecafacil:\[item\.mockup_2,item\.mockup_1,item\.urls\.left,item\.urls\.right,item\.urls\.center\]/, 'Firebase deve salvar nova ordem para recortes futuros');

assert.ok(index.includes('generator-v1.css?v=20260829-2'), 'index deve carregar CSS atual do gerador');
assert.ok(index.includes('generator-v1.js?v=20260829-2'), 'index deve carregar JS atual do gerador');
assert.ok(index.includes('mugGeneratorWebhook'), 'webhook do gerador IA deve permanecer configurado');
assert.match(generator, /action:\s*['"]generate_mug_art['"]/, 'gerador deve usar generate_mug_art');
assert.match(generator, /action:\s*['"]analyze_mug_product['"]/, 'gerador deve analisar cadastro');
assert.match(generator, /action:\s*['"]finalize_mug_product['"]/, 'gerador deve finalizar arte');
assert.match(generator, /MASTER_WIDTH\s*=\s*2400/, 'arte deve usar largura 2400');
assert.match(generator, /MASTER_HEIGHT\s*=\s*960/, 'arte deve usar altura 960');
assert.match(generator, /estoque:\s*100/, 'gerador deve cadastrar estoque padrão 100');

assert.ok(index.includes('bulk-actions-v1.js?v=20260829-1'), 'barra de seleção deve permanecer como motor de contingência');
assert.match(bulk, /input\[data-select-mug\]:checked/, 'ações em lote devem usar checkboxes existentes');
assert.ok(index.includes('mug-grid-v1.js?v=20260829-2'), 'index deve carregar grade visual');
assert.match(grid, /class=\"cf-mug-grid\"/, 'canecas devem ser exibidas em grade');
assert.match(grid, /data-grid-edit/, 'card deve possuir Editar');
assert.match(grid, /data-grid-delete/, 'card deve possuir Apagar');

const headerBlock = catalog.match(/const HEADERS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(headerBlock, 'cabeçalho da planilha Loja Integrada não encontrado');
const headers = [...headerBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.equal(headers.length, 49, `planilha Loja Integrada deve ter 49 colunas, encontrou ${headers.length}`);
assert.equal(new Set(headers).size, 49, 'cabeçalhos da planilha não podem ser duplicados');

for (const route of ['dashboard','orders','creations','mugs','banners','print','settings']) {
  assert.ok(index.includes(`data-route="${route}"`), `rota ausente no menu: ${route}`);
  assert.ok(index.includes(`data-view="${route}"`), `view ausente: ${route}`);
}

console.log('OK admin-canecas: sem observers globais de sincronização, lista estável, conteúdo central versionado, GitHub principal, Make reserva e 5 imagens na ordem oficial.');
