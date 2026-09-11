import fs from 'node:fs';
import assert from 'node:assert/strict';

const edgePath='supabase/functions/catalog-v3/index.ts';
assert.ok(fs.existsSync(edgePath),'faltando catalog-v3');
const edge=fs.readFileSync(edgePath,'utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const migrationName=fs.readdirSync('supabase/migrations').find(name=>name.includes('storefront_v3_commercial_categories'));
assert.ok(migrationName,'faltando migration de categorias comerciais e pedido V3');
const migration=fs.readFileSync(`supabase/migrations/${migrationName}`,'utf8');

assert.match(edge,/req\.method\s*!==\s*['"]GET['"]/,'catálogo deve ser GET/read-only');
assert.match(edge,/resource/);
for(const name of ['health','home','category','search','basket','product']) assert.match(edge,new RegExp(name),`resource ${name} ausente`);
assert.match(edge,/Cache-Control/);
assert.match(edge,/public,\s*max-age=60/);
assert.match(edge,/s-maxage=300/);
assert.match(edge,/stale-while-revalidate=600/);
assert.match(edge,/\.eq\(['"]is_active['"],\s*true\)/);
assert.match(edge,/\.gt\(['"]stock['"],\s*0\)/);
assert.doesNotMatch(edge,/\.eq\(['"]physically_verified['"],\s*true\)/,'produto ativo com estoque não pode ser ocultado por conferência física');
assert.match(edge,/sales_category/,'catálogo precisa usar a categoria comercial');
assert.match(edge,/searchParams\.get\(['"]sub['"]\)/,'categoria precisa aceitar subfiltro');
assert.match(edge,/validity_date/,'detalhe do produto precisa retornar validade');
assert.match(edge,/add_unit_delta/,'cesta precisa expor delta comercial de acréscimo');
assert.match(edge,/remove_unit_delta/,'cesta precisa expor delta comercial de retirada');
assert.match(edge,/limit/);
assert.doesNotMatch(edge,/insert\(|update\(|delete\(|upsert\(|create_order|create_storefront_order/i,'catalog-v3 deve ser somente leitura');
assert.match(config,/\[functions\.catalog-v3\][\s\S]*verify_jwt\s*=\s*false/);

for(const category of ['Mercearia','Café da manhã','Massas, molhos e temperos','Biscoitos, doces e lanches','Bebidas','Limpeza da casa','Lavanderia','Higiene e beleza','Bebê','Pets','Utilidades']) assert.match(migration,new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`categoria comercial ausente: ${category}`);
assert.match(migration,/update\s+public\.products[\s\S]+sales_category/i,'migration precisa classificar os produtos');
assert.match(migration,/create\s+or\s+replace\s+function\s+public\.create_storefront_order_v2/i,'pedido precisa continuar validado no servidor');
assert.doesNotMatch(migration,/is_active\s*=\s*true\s+and\s+physically_verified\s*=\s*true/i,'pedido não pode rejeitar item ativo só por falta de conferência física');

console.log('catalog-v3 contract ok');
