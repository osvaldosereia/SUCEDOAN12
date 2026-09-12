import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin/index.html','utf8');
const app=fs.readFileSync('admin/app-lite.js','utf8');
const css=fs.readFileSync('admin/simple.css','utf8');
const adminEdge=fs.readFileSync('supabase/functions/admin-simple-v2/index.ts','utf8');
const catalog=fs.readFileSync('supabase/functions/catalog-v3/index.ts','utf8');
const migrationFiles=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql'));
const migrations=migrationFiles.map(name=>fs.readFileSync(`supabase/migrations/${name}`,'utf8')).join('\n');

assert.doesNotMatch(html,/EAN\s*\/\s*SKU/i,'EAN não deve aparecer como coluna da lista de produtos');
for(const heading of ['Produto','Estoque','Preço normal','Ativo','Oferta','Preço da oferta','Ações']) {
  assert.match(html,new RegExp(`<th[^>]*>${heading}<\\/th>`,'i'),`lista precisa da coluna ${heading}`);
}

assert.match(app,/data-inline-stock/i,'estoque precisa ser editável diretamente na linha');
assert.match(app,/data-inline-active/i,'produto precisa poder ser ativado/desativado diretamente na linha');
assert.match(app,/data-inline-offer/i,'oferta precisa poder ser ativada/desativada diretamente na linha');
assert.match(app,/data-inline-offer-price/i,'preço da oferta precisa ser editável diretamente na linha');
assert.match(app,/data-delete-product/i,'linha precisa ter ação de apagar');
assert.match(app,/ep_gtin/i,'EAN deve continuar disponível dentro do card de edição');
assert.match(app,/offer_price/i,'editor completo também deve conhecer o preço da oferta');

assert.match(adminEdge,/offer_price/i,'API do Admin precisa ler e salvar preço da oferta');
assert.match(adminEdge,/stock/i,'API do Admin precisa permitir salvar estoque');
assert.match(adminEdge,/action\s*===?\s*["']delete_product["']/i,'API do Admin precisa ter exclusão protegida');
for(const table of ['basket_template_items','order_items','inventory_count_items']) {
  assert.match(adminEdge,new RegExp(table,'i'),`exclusão precisa verificar vínculo em ${table}`);
}
assert.match(adminEdge,/product_in_use/i,'produto com histórico/vínculo não pode ser apagado fisicamente');

assert.match(migrations,/add\s+column\s+if\s+not\s+exists\s+offer_price/i,'banco precisa de preço promocional separado');
assert.match(migrations,/is_offer[\s\S]{0,120}offer_price|offer_price[\s\S]{0,120}is_offer/i,'pedido precisa considerar preço promocional quando oferta estiver ativa');

assert.match(catalog,/offer_price/i,'catálogo precisa expor preço promocional');
assert.match(catalog,/regular_price/i,'catálogo precisa preservar preço normal separadamente');

assert.match(css,/inline-product-control/i,'controles rápidos precisam de estilo próprio');
console.log('admin-inline-product-controls ok');
