import fs from 'node:fs';
import assert from 'node:assert/strict';

const controls=fs.readFileSync('admin-v3/products-inline-controls-v4.js','utf8');
const css=fs.readFileSync('admin-v3/products-inline-controls-v4.css','utf8');
const html=fs.readFileSync('admin-v3/index.html','utf8');
const api=fs.readFileSync('supabase/functions/admin-simple-v2/index.ts','utf8');

for(const heading of ['Produto','Estoque','Preço normal','Ativo','Oferta','Preço da oferta','Ações']){
  assert.match(controls,new RegExp(`<th>${heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<\\/th>`,'i'),`Admin V3 precisa exibir a coluna ${heading}`);
}

const rowStart=controls.indexOf('function productRow');
const rowEnd=controls.indexOf('function pageMarkup',rowStart+1);
const rowSource=controls.slice(rowStart,rowEnd>rowStart?rowEnd:rowStart+6000);
assert.ok(rowStart>=0,'Admin V3 precisa ter renderização própria da linha');
assert.doesNotMatch(rowSource,/p\.gtin|Sem EAN/i,'EAN não deve aparecer na linha da lista; fica apenas no editor');
assert.match(rowSource,/data-inline-stock/i,'estoque precisa ser editável diretamente na linha');
assert.match(rowSource,/data-inline-active/i,'ativo precisa ser controlado diretamente na linha');
assert.match(rowSource,/data-inline-offer/i,'oferta precisa ser controlada diretamente na linha');
assert.match(rowSource,/data-inline-offer-price/i,'preço da oferta precisa ser editável diretamente na linha');
assert.match(rowSource,/data-inline-edit-product/i,'linha precisa permitir editar o card completo');
assert.match(rowSource,/data-inline-delete-product/i,'linha precisa permitir apagar com proteção');

assert.match(controls,/name="gtin"/i,'EAN deve continuar dentro do editor completo');
assert.match(controls,/name="offer_price"/i,'editor completo precisa ter preço da oferta');
assert.match(controls,/data-product-inline/i,'controles inline devem salvar sem botão Salvar da linha');
assert.match(controls,/product_in_use/i,'UI precisa tratar exclusão protegida');
assert.match(controls,/admin-simple-v2/i,'Admin V3 deve usar o backend de produto já endurecido');
assert.match(controls,/is_offer:control\.checked,offer_price:price/i,'ativação de oferta deve salvar preço junto');
assert.match(controls,/syncRow\(row,data\.product\)/i,'linha deve refletir o estado devolvido pelo banco após salvar');

assert.match(api,/offer_price/i,'backend de produto precisa ler e salvar preço da oferta');
assert.match(api,/nextOffer/i,'backend precisa validar estado final da oferta');
assert.match(api,/nextOfferPrice/i,'backend precisa exigir preço quando oferta estiver ativa');
assert.match(api,/action\s*===?\s*["']delete_product["']/i,'backend precisa ter exclusão protegida');
assert.match(api,/select\(column,\{count:["']exact["'],head:true\}\)/i,'checagem de vínculos deve selecionar a coluna real do relacionamento');
for(const table of ['basket_template_items','order_items','inventory_count_items','product_changes','inventory_fast_balance_events_v2']){
  assert.match(api,new RegExp(table,'i'),`exclusão precisa proteger vínculo em ${table}`);
}
assert.match(api,/product_in_use/i,'backend precisa bloquear exclusão de produto com histórico/vínculo');

assert.match(html,/products-inline-controls-v4\.css\?v=20260912-1/i,'Admin V3 precisa carregar o CSS dos controles novos');
assert.match(html,/products-inline-controls-v4\.js\?v=20260912-1/i,'Admin V3 precisa carregar o módulo dos controles novos');
assert.match(html,/app\.js\?v=20260912-4/i,'Admin V3 deve usar cache-bust novo do app base');
assert.match(css,/inline-products-table/i,'controles rápidos precisam de estilo próprio');
console.log('admin-v3-inline-product-controls ok');
