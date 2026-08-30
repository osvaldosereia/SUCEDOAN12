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
const banners = read('banner-manager-v2.js');
const store = read('mug-store-v2.js');
const generator = read('generator-v1.js');
const bulk = read('bulk-actions-v1.js');
const grid = read('mug-grid-v1.js');

const activeModules = [...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m => m[1]);
assert.deepEqual(activeModules, [
  'product-policy-v1.js',
  'catalog-manager-v5.js',
  'product-images-v1.js',
  'banner-manager-v2.js',
  'bulk-actions-v1.js',
  'mug-grid-v1.js',
  'app-v2.js',
  'generator-v1.js'
], 'index deve carregar somente os módulos ativos conhecidos');

for (const legacy of [
  'app.js', 'catalog-manager-v3.js', 'catalog-manager-v4.js', 'catalog-manager-bridge-v1.js',
  'loja-integrada-export-v1.js', 'canecafacil-config-v2.js', 'li-admin-runtime-v1.js',
  'mug-products-scope-v1.js', 'banner-manager-v1.js'
]) assert.equal(exists(legacy), false, `arquivo legado ainda existe: ${legacy}`);

for (const [name, code] of [
  ['app-v2.js', app], ['catalog-manager-v5.js', catalog], ['banner-manager-v2.js', banners],
  ['mug-store-v2.js', store], ['generator-v1.js', generator], ['bulk-actions-v1.js', bulk], ['mug-grid-v1.js', grid]
]) {
  assert.equal(code.includes('MutationObserver'), false, `${name} não deve usar MutationObserver global`);
  assert.equal(/window\.fetch\s*=/.test(code), false, `${name} não deve sobrescrever window.fetch`);
  assert.equal(/fbGet\(\s*['"]produtos['"]\s*\)/.test(code), false, `${name} não deve ler /produtos inteiro`);
  assert.equal(/fbGet\(\s*MUG_NODES\.products\s*\)/.test(code), false, `${name} não deve ler MUG_NODES.products inteiro`);
}

assert.match(store, /orderBy[^\n]+categoria/, 'store deve consultar por categoria');
assert.match(store, /startAt/, 'store deve limitar início da consulta');
assert.match(store, /endAt/, 'store deve limitar fim da consulta');
assert.match(store, /CACHE_MS\s*=\s*120000/, 'store deve compartilhar cache de 2 minutos');
assert.match(app, /admin-canecas:route/, 'core deve publicar eventos de rota');
assert.equal(app.includes('function renderMugs'), false, 'core não deve competir com o catálogo pela aba Canecas');
assert.match(catalog, /loja_integrada_create_product/, 'catálogo deve preservar criação na Loja Integrada');
assert.match(catalog, /loja_integrada_update_product/, 'catálogo deve preservar atualização na Loja Integrada');
assert.match(catalog, /loja_integrada_catalog_refs/, 'catálogo deve preservar consulta de marca/categorias');
assert.match(banners, /loadMugs/, 'Banners IA deve reutilizar a store de canecas');

assert.ok(index.includes('generator-v1.css?v=20260829-2'), 'index deve carregar CSS atual do gerador');
assert.ok(index.includes('generator-v1.js?v=20260829-2'), 'index deve carregar JS atual do gerador');
assert.ok(index.includes('mugGeneratorWebhook'), 'webhook do gerador deve estar configurado no index');
assert.match(generator, /hook\.eu1\.make\.com\/cl3r1f56r9txezvltkkwlsspmnja6sw4/, 'gerador deve preservar o webhook oficial');
assert.match(generator, /action:\s*['"]generate_mug_art['"]/, 'gerador deve usar generate_mug_art');
assert.match(generator, /action:\s*['"]analyze_mug_product['"]/, 'gerador deve catalogar automaticamente como o Produção');
assert.match(generator, /action:\s*['"]finalize_mug_product['"]/, 'gerador deve usar finalize_mug_product');
assert.match(generator, /MASTER_WIDTH\s*=\s*2400/, 'arte deve usar largura atual do Produção');
assert.match(generator, /MASTER_HEIGHT\s*=\s*960/, 'arte deve usar altura atual do Produção');
assert.match(generator, /quality:\s*['"]low['"]/, 'qualidade deve ser LOW fixa como no Produção');
assert.equal(generator.includes('mugTheme'), false, 'gerador não deve pedir tema manual');
assert.equal(generator.includes('mugName'), false, 'gerador não deve pedir nome manual');
assert.equal(generator.includes('mugPrice'), false, 'gerador não deve pedir preço manual');
assert.equal(generator.includes('Informe o tema principal'), false, 'geração não deve bloquear por tema obrigatório');
assert.match(generator, /Nenhum campo de texto é obrigatório/, 'interface deve deixar claro que os campos são opcionais');
assert.match(generator, /estoque:\s*100/, 'gerador deve cadastrar estoque padrão 100');
assert.match(generator, /estoque_situacao_em_estoque:\s*1/, 'gerador deve cadastrar preparação de 1 dia');
assert.match(generator, /peso_embalado_kg:\s*0\.3/, 'gerador deve cadastrar peso 0,3 kg');
assert.match(generator, /altura_embalada_cm:\s*11/, 'gerador deve cadastrar altura 11 cm');
assert.match(generator, /largura_embalada_cm:\s*11/, 'gerador deve cadastrar largura 11 cm');
assert.match(generator, /comprimento_embalado_cm:\s*11/, 'gerador deve cadastrar profundidade 11 cm');
assert.match(generator, /tipo_producao:\s*['"]revenda['"]/, 'gerador deve cadastrar produção como revenda');
assert.match(generator, /origem_mercadoria:\s*['"]0['"]/, 'gerador deve cadastrar origem nacional');
assert.match(generator, /COMMANDS_NODE\s*=\s*['"]canecas\/comandos_criacao['"]/, 'gerador deve compartilhar a biblioteca de comandos');
assert.match(generator, /SELECTED_KEY\s*=\s*['"]da_admin_v2_mug_saved_commands_selected['"]/, 'seleção de comandos deve ser compartilhada com Produção');

assert.ok(index.includes('bulk-actions-v1.js?v=20260829-1'), 'index deve carregar ações em lote antes do core');
assert.match(bulk, /Ativar Dona Antônia/, 'lista deve permitir ativar Dona Antônia em lote');
assert.match(bulk, /Ativar Caneca Fácil \+ sincronizar/, 'lista deve permitir ativar Caneca Fácil em lote');
assert.match(bulk, /Ativar nos dois \+ sincronizar/, 'lista deve permitir ativar os dois canais');
assert.match(bulk, /Sincronizar Caneca Fácil/, 'lista deve permitir sincronizar selecionadas sem abrir cadastro');
assert.match(bulk, /loja_integrada_create_product/, 'ação em lote deve criar produto na Loja Integrada quando ainda não vinculado');
assert.match(bulk, /loja_integrada_update_product/, 'ação em lote deve atualizar produto já vinculado');
assert.match(bulk, /await sleep\(450\)/, 'sincronização em lote deve ser sequencial com intervalo de proteção');
assert.match(bulk, /POLICY\.stock/, 'ação em lote deve aplicar a política operacional compartilhada');
assert.match(bulk, /input\[data-select-mug\]:checked/, 'ação em lote deve usar os checkboxes existentes da lista');

assert.ok(index.includes('mug-grid-v1.js?v=20260829-2'), 'index deve carregar a grade visual de canecas');
assert.match(grid, /mugArt\(product\)/, 'grade deve priorizar a arte horizontal');
assert.match(grid, /class=\"cf-mug-grid\"/, 'canecas devem ser exibidas em grade');
assert.match(grid, /Dona Antônia/, 'card deve mostrar status Dona Antônia');
assert.match(grid, /Caneca Fácil/, 'card deve mostrar status Caneca Fácil');
assert.match(grid, /data-grid-edit/, 'card deve possuir botão Editar');
assert.match(grid, /data-grid-delete/, 'card deve possuir botão Apagar');
assert.match(grid, /Apagar selecionadas/, 'grade deve permitir exclusão em lote');
assert.match(grid, /Apagar caneca/, 'drawer deve permitir apagar dentro do cadastro');
assert.match(grid, /productBody\.removido\s*=\s*true/, 'exclusão vinculada deve mover produto para lixeira da Loja Integrada');
assert.match(grid, /productBody\.ativo\s*=\s*false/, 'exclusão vinculada deve desativar produto na Loja Integrada');
assert.match(grid, /action\s*=\s*['"]loja_integrada_update_product['"]/, 'exclusão deve reutilizar a rota segura de atualização da Loja Integrada');
assert.match(grid, /method:\s*['"]DELETE['"]/, 'exclusão deve apagar o registro do Firebase após Loja Integrada');
assert.match(grid, /hasLiEvidenceWithoutId/, 'exclusão deve bloquear vínculo Loja Integrada sem ID para evitar órfãos');
assert.match(grid, /arquivos físicos das imagens não são apagados automaticamente/, 'interface deve avisar que exclusão do produto não apaga mídia física');
assert.match(grid, /ensureGridOrder/, 'grade deve estabilizar a ordem em relação à barra de ações em lote');

const headerBlock = catalog.match(/const HEADERS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(headerBlock, 'cabeçalho da planilha Loja Integrada não encontrado');
const headers = [...headerBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.equal(headers.length, 49, `planilha Loja Integrada deve ter 49 colunas, encontrou ${headers.length}`);
assert.equal(new Set(headers).size, 49, 'cabeçalhos da planilha não podem ser duplicados');

for (const route of ['dashboard','orders','creations','mugs','banners','print','settings']) {
  assert.ok(index.includes(`data-route="${route}"`), `rota ausente no menu: ${route}`);
  assert.ok(index.includes(`data-view="${route}"`), `view ausente: ${route}`);
}

console.log('OK admin-canecas v2: arquitetura, gerador, grade horizontal, exclusão segura, ações em lote, store e Loja Integrada validados.');
