import fs from 'node:fs';
import assert from 'node:assert/strict';

const files=[
  'admin/index.html','admin/styles.css','admin/runtime-config.js','admin/api.js','admin/app.js',
  'admin/nav-fix.js','admin/comprar-ui.js','admin/imagens-ia.html','admin/nomes-produtos.html',
  'supabase/functions/admin-core-v1/index.ts','supabase/functions/admin-product-names-v1/index.ts',
  'vitrine-v3/index.html'
];
for(const file of files) assert.ok(fs.existsSync(file),`faltando ${file}`);
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('admin/styles.css','utf8');
const app=fs.readFileSync('admin/app.js','utf8');
const navFix=fs.readFileSync('admin/nav-fix.js','utf8');
const registry=fs.readFileSync('admin/module-registry.js','utf8');
const shellV2=fs.readFileSync('admin/admin-shell-v2.js','utf8');
const comprarUi=fs.readFileSync('admin/comprar-ui.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-core-v1/index.ts','utf8');
const namesEdge=fs.readFileSync('supabase/functions/admin-product-names-v1/index.ts','utf8');
const config=fs.readFileSync('admin/runtime-config.js','utf8');
const images=fs.readFileSync('admin/imagens-ia.html','utf8');
const names=fs.readFileSync('admin/nomes-produtos.html','utf8');
const legacyStorefront=fs.readFileSync('vitrine-v3/index.html','utf8');
const all=[html,css,app,navFix,comprarUi,edge,namesEdge,config,images,names,registry,shellV2].join('\n');
const adminUi=[html,config,images,names].join('\n');

for(const route of ['dashboard','baskets','products','categories','orders','customers']) assert.match(registry,new RegExp(`id:'${route}'[\\s\\S]*?route:\\{type:'hash',value:'${route}'\\}`),`módulo ${route} ausente do registry canônico`);
assert.match(registry,/id:'buy'[\s\S]*?route:\{type:'external',value:'\.\.\/comprar\/'/,'Comprar deve permanecer como destino externo canônico');
assert.doesNotMatch(registry,/vitrine-v3/i,'registry canônico não pode apontar para a Vitrine V3');
assert.match(registry,/id:'stockCount'[\s\S]*?label:'Balanço rápido'[\s\S]*?value:'\.\.\/contagem\/'/);
assert.match(config,/adminFunction:\s*['"]admin-core-v1['"]/,'Admin deve usar endpoint principal neutro');
assert.match(config,/adminOrdersFunction:\s*['"]admin-orders-comprar-v1['"]/,'Admin deve usar endpoint de pedidos oficial');
assert.match(config,/storefrontUrl:\s*['"]\.\.\/comprar\//,'Admin deve apontar storefrontUrl para Comprar');
assert.doesNotMatch(all,/\/admin-v3\/|\.\.\/admin-v3\/|admin-v3-api|admin-v3-product-names|DA_ADMIN_V3_CONFIG|da_admin_v3_auth/,'Admin oficial não pode depender do legado V3');
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
assert.match(html,/admin-shell-v2\.js/,'Admin principal deve carregar o shell canônico');
assert.match(shellV2,/adminNavigationModel/,'shell canônico deve montar o menu a partir do registry');
assert.match(shellV2,/addEventListener\(['"]click['"]/,'shell canônico deve tratar interação do menu');
assert.match(css,/font-size:\s*1[67]px/,'texto base deve ficar em 16–17px');
assert.match(css,/font-size:\s*2[2-8]px/,'títulos precisam de 22–28px');
assert.match(css,/min-height:\s*(4[6-9]|[5-9]\d)px/,'controles precisam de pelo menos 46px');
assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[0-3])px/,'Admin não deve usar textos minúsculos');
for(const action of ['dashboard','storefront','products','baskets','categories','orders','customers']) assert.match(edge,new RegExp(action),`ação ${action} ausente`);
assert.match(edge,/storefront_featured/);
assert.match(edge,/storefront_v3_categories/);
assert.match(namesEdge,/product_name_normalization/,'backend neutro de nomes deve manter normalização');
assert.doesNotMatch(edge,/balance_scan|inventory-fast-balance|record_inventory_fast_balance/i,'Admin não deve escrever balanço rápido');
assert.doesNotMatch(all,/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+/,'segredo não pode estar hardcoded no navegador');

console.log('admin contract ok');
