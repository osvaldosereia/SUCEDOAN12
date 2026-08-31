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
const queue = read('li-github-queue-v1.js');
const crops = read('storefront-crops-github-v1.js');
const audit = read('archive-audit-v3.js');

const activeModules = [...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m => m[1]);
assert.deepEqual(activeModules, [
  'product-policy-v1.js',
  'li-payload-hardening-v1.js',
  'catalog-manager-v5.js',
  'product-images-v1.js',
  'banner-manager-v7.js',
  'banner-background-v1.js',
  'bulk-actions-v1.js',
  'li-github-queue-v1.js',
  'mug-grid-v1.js',
  'app-v2.js',
  'generator-category-v1.js',
  'storefront-crops-github-v1.js',
  'archive-audit-v3.js',
  'generator-v1.js',
  'generator-library-v1.js'
], 'index deve carregar somente os módulos ativos conhecidos');

for (const legacy of [
  'app.js', 'catalog-manager-v3.js', 'catalog-manager-v4.js', 'catalog-manager-bridge-v1.js',
  'loja-integrada-export-v1.js', 'canecafacil-config-v2.js', 'li-admin-runtime-v1.js',
  'mug-products-scope-v1.js', 'banner-manager-v1.js'
]) assert.equal(exists(legacy), false, `arquivo legado ainda existe: ${legacy}`);

for (const [name, code] of [
  ['app-v2.js', app], ['catalog-manager-v5.js', catalog], ['banner-manager-v7.js', banners],
  ['mug-store-v2.js', store], ['generator-v1.js', generator], ['bulk-actions-v1.js', bulk], ['mug-grid-v1.js', grid]
]) {
  assert.equal(/window\.fetch\s*=/.test(code), false, `${name} não deve sobrescrever window.fetch`);
  assert.equal(/fbGet\(\s*['"]produtos['"]\s*\)/.test(code), false, `${name} não deve ler /produtos inteiro diretamente`);
}

assert.match(store, /orderBy[^\n]+categoria/, 'store deve consultar por categoria');
assert.match(store, /CACHE_MS\s*=\s*120000/, 'store deve compartilhar cache de 2 minutos');
assert.match(app, /admin-canecas:route/, 'core deve publicar eventos de rota');
assert.equal(app.includes('function renderMugs'), false, 'core não deve competir com o catálogo pela aba Canecas');

// Arquitetura nova: o Admin não usa mais Make para decidir criar/atualizar Loja Integrada.
assert.ok(index.includes('li-github-queue-v1.js?v=20260830-1'), 'index deve carregar a fila GitHub Actions');
assert.equal(index.includes('li-sync-coordinator-v3.js'), false, 'coordenador antigo Make não deve estar ativo');
assert.equal(index.includes('li-recovery-v2.js'), false, 'recuperação antiga Make não deve estar ativa');
assert.match(queue, /QUEUE_NODE\s*=\s*['"]canecas\/integracoes\/loja_integrada\/fila['"]/, 'fila Loja Integrada deve ficar no Firebase');
assert.match(queue, /status:\s*['"]pendente['"]/, 'fila deve marcar itens pendentes');
assert.match(queue, /Enviar selecionadas/, 'UI deve permitir envio individual/lote selecionado');
assert.match(queue, /Enviar todas ativas/, 'UI deve permitir enviar todas as canecas ativas');
assert.match(queue, /Reenviar erros/, 'UI deve permitir reprocessar falhas');
assert.match(queue, /Salvar e atualizar CanecaFácil/, 'drawer deve deixar claro quando atualiza');
assert.match(queue, /Salvar e publicar no CanecaFácil/, 'drawer deve deixar claro quando publica');
assert.match(queue, /SKU repetido no Firebase/, 'fila deve bloquear SKUs locais duplicados');
assert.equal(queue.includes('hook.eu1.make.com'), false, 'fila Loja Integrada não pode depender do Make');

// Recortes são exclusivamente GitHub Actions + Sharp.
assert.ok(index.includes('storefront-crops-github-v1.js?v=20260830-1'), 'index deve usar monitor de recortes do GitHub');
assert.equal(index.includes('storefront-crops-v2.js'), false, 'recortes Base64/Make não devem estar ativos');
assert.match(crops, /GitHub Actions/, 'monitor deve explicar que os recortes são processados no GitHub');
assert.match(audit, /GitHub Actions/, 'auditoria deve refletir processamento GitHub');

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

console.log('OK admin-canecas: IA no Make, recortes e sincronização Loja Integrada via GitHub Actions, fila individual/em massa e UI validadas.');
