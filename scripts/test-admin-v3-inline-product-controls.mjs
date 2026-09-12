import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('admin-v3/app.js','utf8');
const html=fs.readFileSync('admin-v3/index.html','utf8');
const api=fs.readFileSync('supabase/functions/admin-v3-api/index.ts','utf8');

for(const heading of ['Produto','Estoque','Preço normal','Ativo','Oferta','Preço da oferta','Ações']){
  assert.match(app,new RegExp(`<th>${heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<\\/th>`,'i'),`Admin V3 precisa exibir a coluna ${heading}`);
}

const rowStart=app.indexOf('function renderProductRow');
const rowEnd=app.indexOf('async function ',rowStart+1);
const rowSource=app.slice(rowStart,rowEnd>rowStart?rowEnd:rowStart+5000);
assert.ok(rowStart>=0,'Admin V3 precisa ter renderProductRow');
assert.doesNotMatch(rowSource,/p\.gtin|Sem EAN/i,'EAN não deve aparecer na linha da lista; fica apenas no editor');
assert.match(rowSource,/data-quick-stock/i,'estoque precisa ser editável diretamente na linha');
assert.match(rowSource,/data-quick-active/i,'ativo precisa ser controlado diretamente na linha');
assert.match(rowSource,/data-quick-offer/i,'oferta precisa ser controlada diretamente na linha');
assert.match(rowSource,/data-quick-offer-price/i,'preço da oferta precisa ser editável diretamente na linha');
assert.match(rowSource,/data-edit-product/i,'linha precisa permitir editar o card completo');
assert.match(rowSource,/data-delete-product/i,'linha precisa permitir apagar com proteção');

assert.match(app,/name="gtin"/i,'EAN deve continuar dentro do editor completo');
assert.match(app,/name="offer_price"/i,'editor completo precisa ter preço da oferta');
assert.match(app,/data-product-inline/i,'controles inline devem salvar sem botão Salvar da linha');
assert.match(app,/product_in_use/i,'UI precisa tratar exclusão protegida');

assert.match(api,/offer_price/i,'API V3 precisa ler e salvar preço da oferta');
assert.match(api,/nextOffer/i,'API V3 precisa validar estado final da oferta');
assert.match(api,/nextOfferPrice/i,'API V3 precisa exigir preço quando oferta estiver ativa');
assert.match(api,/action\s*===?\s*["']delete_product["']/i,'API V3 precisa ter exclusão protegida');
assert.match(api,/select\(column,\{count:["']exact["'],head:true\}\)/i,'checagem de vínculos deve selecionar a coluna real do relacionamento');
for(const table of ['basket_template_items','order_items','inventory_count_items','product_changes','inventory_fast_balance_events_v2']){
  assert.match(api,new RegExp(table,'i'),`exclusão precisa proteger vínculo em ${table}`);
}
assert.match(api,/product_in_use/i,'API V3 precisa bloquear exclusão de produto com histórico/vínculo');

assert.match(html,/app\.js\?v=20260912-4/i,'Admin V3 deve usar cache-bust novo do app');
console.log('admin-v3-inline-product-controls ok');
