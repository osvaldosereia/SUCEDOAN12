import fs from 'node:fs';
import assert from 'node:assert/strict';

const files=['admin-v3/index.html','admin-v3/styles.css','admin-v3/config.js','admin-v3/api.js','admin-v3/app.js','admin-v3/nav-fix.js','admin-v3/comprar-ui.js','admin-v3/imagens-ia.html','admin-v3/nomes-produtos-v3.html','supabase/functions/admin-v3-api/index.ts','vitrine-v3/index.html'];
for(const file of files) assert.ok(fs.existsSync(file),`faltando ${file}`);
const html=fs.readFileSync('admin-v3/index.html','utf8');
const css=fs.readFileSync('admin-v3/styles.css','utf8');
const app=fs.readFileSync('admin-v3/app.js','utf8');
const navFix=fs.readFileSync('admin-v3/nav-fix.js','utf8');
const comprarUi=fs.readFileSync('admin-v3/comprar-ui.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-v3-api/index.ts','utf8');
const config=fs.readFileSync('admin-v3/config.js','utf8');
const images=fs.readFileSync('admin-v3/imagens-ia.html','utf8');
const names=fs.readFileSync('admin-v3/nomes-produtos-v3.html','utf8');
const legacyStorefront=fs.readFileSync('vitrine-v3/index.html','utf8');
const all=[html,css,app,navFix,comprarUi,edge,config,images,names].join('\n');
const adminUi=[html,config,images,names].join('\n');

for(const route of ['dashboard','baskets','products','categories','orders','customers']) assert.match(html,new RegExp(`data-route=["']${route}["']`),`menu ${route} ausente`);
assert.doesNotMatch(html,/data-route=["']storefront["']/,'menu legado Vitrine não deve mais aparecer');
assert.match(html,/Balanço rápido/);
assert.match(html,/\.\.\/contagem\//);
assert.match(config,/admin-v3-api/);
assert.match(config,/storefrontUrl:\s*['"]\.\.\/comprar\//,'Admin deve apontar storefrontUrl para Comprar');
assert.doesNotMatch(all,/\.\.\/vitrine-v3\//,'Admin não deve mais apontar para a Vitrine V3');
assert.doesNotMatch(adminUi,/vitrine/i,'páginas do Admin não devem mais exibir a antiga Vitrine');
for(const adminPage of [html,images,names]){
  assert.match(adminPage,/\.\.\/comprar\//,'atalho do Admin deve abrir Comprar');
  assert.match(adminPage,/Abrir Comprar/,'atalho deve se chamar Abrir Comprar');
}
assert.match(html,/comprar-ui\.js/,'Admin principal deve carregar adaptação Comprar');
assert.match(comprarUi,/location\.hash===['"]#storefront['"]/,'hash legado deve ser redirecionado para Comprar');
assert.match(comprarUi,/addEventListener\(['"]hashchange['"]/,'hash legado digitado depois do carregamento também deve ser bloqueado');
assert.match(comprarUi,/stopImmediatePropagation\(\)/,'painel legado não deve renderizar nem por um instante');
assert.match(comprarUi,/Pedidos recentes do Comprar/);
assert.match(comprarUi,/Somente pedidos recebidos pelo Comprar/);
assert.match(comprarUi,/Destaque no Comprar/);
assert.match(legacyStorefront,/http-equiv=["']refresh["'][^>]+url=\.\.\/comprar\//i,'vitrine-v3 deve redirecionar para Comprar');
assert.match(legacyStorefront,/location\.replace\(['"]\.\.\/comprar\//,'redirecionamento legado deve ter fallback JavaScript');
assert.match(html,/nav-fix\.js/,'ponte de navegação do menu precisa ser carregada');
assert.match(navFix,/sidebar\?\.addEventListener\(['"]click['"]/,'menu lateral precisa capturar os próprios cliques');
assert.match(navFix,/location\.hash/,'menu precisa acionar o roteamento já existente do Admin');
assert.match(css,/font-size:\s*1[67]px/,'texto base deve ficar em 16–17px');
assert.match(css,/font-size:\s*2[2-8]px/,'títulos precisam de 22–28px');
assert.match(css,/min-height:\s*(4[6-9]|[5-9]\d)px/,'controles precisam de pelo menos 46px');
assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[0-3])px/,'Admin V3 não deve usar textos minúsculos');
for(const action of ['dashboard','storefront','products','baskets','categories','orders','customers']) assert.match(edge,new RegExp(action),`ação ${action} ausente`);
assert.match(edge,/storefront_featured/);
assert.match(edge,/storefront_v3_categories/);
assert.doesNotMatch(edge,/balance_scan|inventory-fast-balance|record_inventory_fast_balance/i,'Admin V3 não deve escrever balanço rápido');
assert.doesNotMatch(all,/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+/,'segredo não pode estar hardcoded no navegador');

console.log('admin-v3 contract ok');
