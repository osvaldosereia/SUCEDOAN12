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
const dual = read('li-dual-sync-v2.js');
const stability = read('mugs-stability-v1.js');
const inlineCategory = read('mug-inline-category-v2.js');
const recovery = read('li-recovery-v2.js');
const coordinator = read('li-sync-coordinator-v3.js');
const crops = read('storefront-crops-github-v1.js');
const audit = read('archive-audit-v4.js');

const activeModules = [...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m => m[1]);
assert.deepEqual(activeModules, [
  'product-policy-v1.js',
  'li-payload-hardening-v1.js',
  'catalog-manager-v5.js',
  'product-images-v1.js',
  'banner-manager-v7.js',
  'banner-background-v1.js',
  'li-recovery-v2.js',
  'li-sync-coordinator-v3.js',
  'bulk-actions-v1.js',
  'mug-grid-v1.js',
  'app-v2.js',
  'generator-category-v1.js',
  'storefront-crops-github-v1.js',
  'archive-audit-v4.js',
  'generator-v1.js',
  'generator-library-v1.js',
  'make-webhook-settings-v1.js',
  'li-dual-sync-v2.js',
  'mugs-stability-v1.js',
  'mug-inline-category-v2.js'
], 'index deve carregar somente os módulos ativos conhecidos');

for (const legacy of [
  'app.js', 'catalog-manager-v3.js', 'catalog-manager-v4.js', 'catalog-manager-bridge-v1.js',
  'loja-integrada-export-v1.js', 'canecafacil-config-v2.js', 'li-admin-runtime-v1.js',
  'mug-products-scope-v1.js', 'banner-manager-v1.js'
]) assert.equal(exists(legacy), false, `arquivo legado ainda existe: ${legacy}`);

for (const [name, code] of [
  ['app-v2.js', app], ['catalog-manager-v5.js', catalog], ['banner-manager-v7.js', banners],
  ['mug-store-v2.js', store], ['generator-v1.js', generator], ['bulk-actions-v1.js', bulk], ['mug-grid-v1.js', grid],
  ['li-dual-sync-v2.js', dual], ['mugs-stability-v1.js', stability], ['mug-inline-category-v2.js', inlineCategory], ['archive-audit-v4.js', audit]
]) {
  assert.equal(/window\.fetch\s*=/.test(code), false, `${name} não deve sobrescrever window.fetch`);
  assert.equal(/fbGet\(\s*['"]produtos['"]\s*\)/.test(code), false, `${name} não deve ler /produtos inteiro diretamente`);
}

assert.match(store, /orderBy[^\n]+categoria/, 'store deve consultar por categoria');
assert.match(store, /CACHE_MS\s*=\s*120000/, 'store deve compartilhar cache de 2 minutos');
assert.match(app, /admin-canecas:route/, 'core deve publicar eventos de rota');
assert.equal(app.includes('function renderMugs'), false, 'core não deve competir com o catálogo pela aba Canecas');

assert.ok(index.includes('mugs-stability-v1.js?v=20260831-2'), 'index deve carregar estabilizador atualizado da grade');
assert.match(stability, /const\s+PRESERVE\s*=\s*\[/, 'estabilizador deve manter nós visuais persistentes');
assert.match(stability, /cfMugGridWrap/, 'estabilizador deve preservar a grade das canecas');
assert.match(stability, /cfBulkActions/, 'estabilizador deve preservar ações em lote');
assert.match(stability, /cfDualSyncPanel/, 'estabilizador deve preservar painel GitHub\/Make');
assert.match(stability, /cfArchiveAudit/, 'estabilizador deve preservar auditoria');
assert.match(stability, /observer\.observe\(root,\s*\{\s*childList:\s*true\s*\}\)/, 'observer deve ficar restrito ao root #mugs e somente filhos diretos');
assert.equal(/observer\.observe\(document\.documentElement/.test(stability), false, 'estabilizador não pode observar o documento inteiro');
assert.match(stability, /await\s+renderGrid\(\)/, 'grade deve ser atualizada após o catálogo terminar sem desaparecer antes');
assert.match(stability, /admin-canecas:mugs-stable-rendered/, 'estabilizador deve avisar quando a grade terminou');

assert.ok(index.includes('mug-inline-category-v2.js?v=20260831-1'), 'index deve usar categoria rápida em lote');
assert.equal(index.includes('mug-inline-category-v1.js'), false, 'categoria rápida antiga com retries progressivos não deve estar ativa');
assert.match(inlineCategory, /await\s+loadMugs\(\)/, 'categoria rápida deve reaproveitar cache das canecas');
assert.match(inlineCategory, /admin-canecas:mugs-stable-rendered/, 'categoria rápida deve instalar somente após grade estável');
assert.equal(/attempt\s*<\s*35/.test(inlineCategory), false, 'categoria rápida não pode usar 35 tentativas em cascata');
assert.equal(/setTimeout\([^]*140/.test(inlineCategory), false, 'categoria rápida não pode reprocessar cards a cada 140 ms');

assert.ok(index.includes('li-dual-sync-v2.js?v=20260831-2'), 'index deve carregar controle dual GitHub/Make estável');
assert.equal(index.includes('li-dual-sync-v1.js'), false, 'versão dual antiga com observer global não deve estar ativa');
assert.ok(index.includes('li-sync-coordinator-v3.js?v=20260831-1'), 'coordenador Make deve permanecer ativo como contingência');
assert.ok(index.includes('li-recovery-v2.js?v=20260831-1'), 'recuperação por SKU do Make deve permanecer ativa');
assert.match(dual, /QUEUE_NODE\s*=\s*['"]canecas\/integracoes\/loja_integrada\/fila['"]/, 'fila GitHub deve ficar no Firebase');
assert.match(dual, /status:\s*['"]pendente['"]/, 'fila GitHub deve marcar itens pendentes');
assert.match(dual, /GitHub · selecionadas/, 'UI deve permitir envio em massa pelo GitHub');
assert.match(dual, /GitHub · todas ativas/, 'UI deve permitir envio de todas as ativas pelo GitHub');
assert.match(dual, /GitHub · reenviar erros/, 'UI deve permitir reprocessar erros pelo GitHub');
assert.match(dual, /Salvar \+ atualizar via GitHub/, 'drawer deve distinguir atualização pelo GitHub');
assert.match(dual, /Salvar \+ publicar via GitHub/, 'drawer deve distinguir publicação pelo GitHub');
assert.match(dual, /Salvar \+ sincronizar via Make/, 'drawer deve manter contingência pelo Make');
assert.match(dual, /Sincronizar selecionadas via Make/, 'lote deve manter contingência pelo Make');
assert.match(dual, /SKU repetido no Firebase/, 'fila GitHub deve bloquear SKUs locais duplicados');
assert.equal(dual.includes('hook.eu1.make.com'), false, 'fila GitHub não pode depender do webhook Make');
assert.equal(/new\s+MutationObserver/.test(dual), false, 'sincronização dual não pode usar MutationObserver global');
assert.match(recovery, /loja_integrada_find_product_by_sku/, 'contingência Make deve reconciliar produto por SKU');
assert.match(coordinator, /recoverOne/, 'coordenador Make deve executar recuperação antes de criar');

assert.ok(index.includes('storefront-crops-github-v1.js?v=20260831-1'), 'index deve usar monitor de recortes do GitHub');
assert.equal(index.includes('storefront-crops-v2.js'), false, 'recortes Base64/Make não devem estar ativos');
assert.match(crops, /GitHub Actions/, 'monitor deve explicar que os recortes são processados no GitHub');
assert.ok(index.includes('archive-audit-v4.js?v=20260831-1'), 'index deve usar auditoria sem observer global');
assert.match(audit, /GitHub Actions/, 'auditoria deve refletir processamento GitHub');
assert.equal(/new\s+MutationObserver/.test(audit), false, 'auditoria não pode observar o documento inteiro');

assert.ok(index.includes('generator-v1.css?v=20260829-2'), 'index deve carregar CSS atual do gerador');
assert.ok(index.includes('generator-v1.js?v=20260829-2'), 'index deve carregar JS atual do gerador');
assert.ok(index.includes('mugGeneratorWebhook'), 'webhook do gerador IA deve permanecer configurado');
assert.match(generator, /action:\s*['"]generate_mug_art['"]/, 'gerador deve usar generate_mug_art');
assert.match(generator, /action:\s*['"]analyze_mug_product['"]/, 'gerador deve analisar cadastro');
assert.match(generator, /action:\s*['"]finalize_mug_product['"]/, 'gerador deve finalizar arte');
assert.match(generator, /MASTER_WIDTH\s*=\s*2400/, 'arte deve usar largura 2400');
assert.match(generator, /MASTER_HEIGHT\s*=\s*960/, 'arte deve usar altura 960');
assert.match(generator, /estoque:\s*100/, 'gerador deve cadastrar estoque padrão 100');
assert.match(generator, /peso_embalado_kg:\s*0\.3/, 'gerador deve cadastrar peso 0,3 kg');
assert.match(generator, /tipo_producao:\s*['"]revenda['"]/, 'gerador deve cadastrar produção como revenda');
assert.match(generator, /origem_mercadoria:\s*['"]0['"]/, 'gerador deve cadastrar origem nacional');

assert.ok(index.includes('bulk-actions-v1.js?v=20260829-1'), 'index deve manter barra de seleção em lote');
assert.match(bulk, /input\[data-select-mug\]:checked/, 'ações em lote devem usar checkboxes existentes');
assert.ok(index.includes('mug-grid-v1.js?v=20260829-2'), 'index deve carregar grade visual');
assert.match(grid, /class=\"cf-mug-grid\"/, 'canecas devem ser exibidas em grade');
assert.match(grid, /data-grid-edit/, 'card deve possuir botão Editar');
assert.match(grid, /data-grid-delete/, 'card deve possuir botão Apagar');

const headerBlock = catalog.match(/const HEADERS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(headerBlock, 'cabeçalho da planilha Loja Integrada não encontrado');
const headers = [...headerBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.equal(headers.length, 49, `planilha Loja Integrada deve ter 49 colunas, encontrou ${headers.length}`);
assert.equal(new Set(headers).size, 49, 'cabeçalhos da planilha não podem ser duplicados');

for (const route of ['dashboard','orders','creations','mugs','banners','print','settings']) {
  assert.ok(index.includes(`data-route="${route}"`), `rota ausente no menu: ${route}`);
  assert.ok(index.includes(`data-view="${route}"`), `view ausente: ${route}`);
}

console.log('OK admin-canecas: grade preservada, categoria rápida em lote, sem observers globais auxiliares, GitHub principal e Make contingência.');
