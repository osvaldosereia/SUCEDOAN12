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

const activeModules = [...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m => m[1]);
assert.deepEqual(activeModules, [
  'product-policy-v1.js',
  'catalog-manager-v5.js',
  'product-images-v1.js',
  'banner-manager-v2.js',
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
  ['mug-store-v2.js', store], ['generator-v1.js', generator]
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

assert.ok(index.includes('generator-v1.css'), 'index deve carregar CSS do gerador');
assert.ok(index.includes('mugGeneratorWebhook'), 'webhook do gerador deve estar configurado no index');
assert.match(generator, /hook\.eu1\.make\.com\/cl3r1f56r9txezvltkkwlsspmnja6sw4/, 'gerador deve preservar o webhook oficial');
assert.match(generator, /action:\s*['"]generate_mug_art['"]/, 'gerador deve usar generate_mug_art');
assert.match(generator, /action:\s*['"]finalize_mug_product['"]/, 'gerador deve usar finalize_mug_product');
assert.match(generator, /estoque:\s*100/, 'gerador deve cadastrar estoque padrão 100');
assert.match(generator, /estoque_situacao_em_estoque:\s*1/, 'gerador deve cadastrar preparação de 1 dia');
assert.match(generator, /peso_embalado_kg:\s*0\.3/, 'gerador deve cadastrar peso 0,3 kg');
assert.match(generator, /altura_embalada_cm:\s*11/, 'gerador deve cadastrar altura 11 cm');
assert.match(generator, /largura_embalada_cm:\s*11/, 'gerador deve cadastrar largura 11 cm');
assert.match(generator, /comprimento_embalado_cm:\s*11/, 'gerador deve cadastrar profundidade 11 cm');
assert.match(generator, /tipo_producao:\s*['"]revenda['"]/, 'gerador deve cadastrar produção como revenda');
assert.match(generator, /origem_mercadoria:\s*['"]0['"]/, 'gerador deve cadastrar origem nacional');
assert.match(generator, /COMMANDS_NODE\s*=\s*['"]canecas\/comandos_criacao['"]/, 'gerador deve compartilhar a biblioteca de comandos');

const headerBlock = catalog.match(/const HEADERS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(headerBlock, 'cabeçalho da planilha Loja Integrada não encontrado');
const headers = [...headerBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.equal(headers.length, 49, `planilha Loja Integrada deve ter 49 colunas, encontrou ${headers.length}`);
assert.equal(new Set(headers).size, 49, 'cabeçalhos da planilha não podem ser duplicados');

for (const route of ['dashboard','orders','creations','mugs','banners','print','settings']) {
  assert.ok(index.includes(`data-route="${route}"`), `rota ausente no menu: ${route}`);
  assert.ok(index.includes(`data-view="${route}"`), `view ausente: ${route}`);
}

console.log('OK admin-canecas v2: arquitetura, gerador, store, Loja Integrada e ausência de conflitos legados validadas.');
