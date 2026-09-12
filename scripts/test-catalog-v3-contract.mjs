import fs from 'node:fs';
import assert from 'node:assert/strict';

const edgePath='supabase/functions/catalog-v3/index.ts';
assert.ok(fs.existsSync(edgePath),'faltando catalog-v3');
const edge=fs.readFileSync(edgePath,'utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const migrationFiles=fs.readdirSync('supabase/migrations');
const migrationName=migrationFiles.find(name=>name.includes('storefront_v3_commercial_categories'));
assert.ok(migrationName,'faltando migration de categorias comerciais e pedido V3');
const migration=fs.readFileSync(`supabase/migrations/${migrationName}`,'utf8');
const allMigrations=migrationFiles.map(name=>fs.readFileSync(`supabase/migrations/${name}`,'utf8')).join('\n');

assert.match(edge,/req\.method\s*!==\s*['"]GET['"]/,'catálogo deve ser GET/read-only');
assert.match(edge,/resource/);
for(const name of ['health','home','category','search','basket','product','offers']) assert.match(edge,new RegExp(name),`resource ${name} ausente`);
assert.match(edge,/Cache-Control/);
assert.match(edge,/public,\s*max-age=60/);
assert.match(edge,/s-maxage=300/);
assert.match(edge,/stale-while-revalidate=600/);
assert.match(edge,/\.eq\(['"]is_active['"],\s*true\)/);
assert.match(edge,/\.gt\(['"]stock['"],\s*0\)/);
assert.doesNotMatch(edge,/\.eq\(['"]physically_verified['"],\s*true\)/,'produto ativo com estoque não pode ser ocultado por conferência física');
assert.match(edge,/storefront_category/,'catálogo V3 precisa usar campo próprio de categoria comercial');
assert.doesNotMatch(edge,/\.eq\(['"]sales_category['"]/,'Vitrine V3 não pode depender da categoria legada do chat');
assert.match(edge,/searchParams\.get\(['"]sub['"]\)/,'categoria precisa aceitar subfiltro');
assert.match(edge,/validity_date/,'detalhe do produto precisa retornar validade');
assert.match(edge,/add_unit_delta/,'cesta precisa expor delta comercial de acréscimo');
assert.match(edge,/remove_unit_delta/,'cesta precisa expor delta comercial de retirada');
assert.match(edge,/limit/);
assert.doesNotMatch(edge,/insert\(|update\(|delete\(|upsert\(|create_order|create_storefront_order/i,'catalog-v3 deve ser somente leitura');
assert.match(config,/\[functions\.catalog-v3\][\s\S]*verify_jwt\s*=\s*false/);

// Ofertas são somente produtos marcados no Admin e relacionadas às categorias presentes no pedido.
assert.match(edge,/resource===['"]offers['"]/,'catálogo precisa de recurso dedicado para ofertas contextuais');
assert.match(edge,/searchParams\.get\(['"]categories['"]\)/,'ofertas precisam receber categorias do pedido');
assert.match(edge,/searchParams\.get\(['"]exclude['"]\)/,'ofertas precisam receber produtos já presentes no pedido');
assert.match(edge,/\.eq\(['"]is_offer['"],\s*true\)/,'ofertas devem respeitar exatamente o marcador Oferta do Admin');
assert.match(edge,/\.in\(['"]storefront_category['"],\s*categories\)/,'ofertas devem ser limitadas às categorias comerciais do pedido');
assert.match(edge,/excludedIds/,'endpoint deve excluir produtos já presentes no pedido antes de responder');
assert.doesNotMatch(edge,/Math\.random|random\(/i,'ofertas não podem ser aleatórias');

for(const category of ['Mercearia','Café da manhã','Massas, molhos e temperos','Biscoitos, doces e lanches','Bebidas','Limpeza da casa','Lavanderia','Higiene e beleza','Bebê','Pets','Utilidades']) assert.match(migration,new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`categoria comercial ausente: ${category}`);
assert.match(migration,/add\s+column\s+if\s+not\s+exists\s+storefront_category\s+text/i,'migration precisa criar campo próprio para a Vitrine V3');
assert.match(allMigrations,/alter\s+table\s+public\.basket_template_items[\s\S]+add\s+column\s+if\s+not\s+exists\s+updated_at\s+timestamptz/i,'basket_template_items precisa ter updated_at porque seu trigger já tenta atualizá-lo');
assert.match(migration,/update\s+public\.products[\s\S]+storefront_category/i,'migration precisa classificar os produtos da Vitrine');
assert.doesNotMatch(migration,/set\s+sales_category\s*=/i,'categoria legada do atendimento não pode ser reescrita');
assert.match(migration,/update\s+public\.basket_template_items[\s\S]+quantity_editable\s*=\s*false[\s\S]+coalesce\(p\.price,0\)\s*<=\s*0/i,'item de cesta sem preço precisa permanecer com quantidade fixa');
assert.match(migration,/create\s+or\s+replace\s+function\s+public\.create_storefront_order_v2/i,'pedido precisa continuar validado no servidor');
assert.doesNotMatch(migration,/is_active\s*=\s*true\s+and\s+physically_verified\s*=\s*true/i,'pedido não pode rejeitar item ativo só por falta de conferência física');

console.log('catalog-v3 contract ok');
