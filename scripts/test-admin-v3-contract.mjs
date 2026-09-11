import fs from 'node:fs';
import assert from 'node:assert/strict';

const files=['admin-v3/index.html','admin-v3/styles.css','admin-v3/config.js','admin-v3/api.js','admin-v3/app.js','supabase/functions/admin-v3-api/index.ts'];
for(const file of files) assert.ok(fs.existsSync(file),`faltando ${file}`);
const html=fs.readFileSync('admin-v3/index.html','utf8');
const css=fs.readFileSync('admin-v3/styles.css','utf8');
const app=fs.readFileSync('admin-v3/app.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-v3-api/index.ts','utf8');
const config=fs.readFileSync('admin-v3/config.js','utf8');
const all=[html,css,app,edge,config].join('\n');

for(const route of ['dashboard','storefront','baskets','products','categories','orders','customers']) assert.match(html,new RegExp(`data-route=["']${route}["']`),`menu ${route} ausente`);
assert.match(html,/Balanço rápido/);
assert.match(html,/\.\.\/contagem\//);
assert.match(html,/\.\.\/vitrine-v3\//);
assert.match(config,/admin-v3-api/);
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
