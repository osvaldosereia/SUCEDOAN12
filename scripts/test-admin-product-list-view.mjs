import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{},String,Number,Object,Boolean,Array,Date};
vm.createContext(context);
vm.runInContext(fs.readFileSync('vitrine/admin/products/list-view.js','utf8'),context);
const view=context.window.DonaAntoniaAdminProductListView.create({
  escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),
  formatQuantity:value=>String(Number(value||0)),categoryLabel:value=>value==='mercearia'?'Mercearia':value
});

const product={id:'p<1>',name:'Café <forte>',category:'mercearia',detailed_subcategory:'Grãos',sku:'SKU1',gtin:'7890',packaging:'500 g',sale_price_cents:1299,cost_cents:800,stock_quantity:5,loose_stock_quantity:3,basket_locked_quantity:2,gondola_number:4,expiration_date:'2026-12-31',image_url:'/cafe.png',active:true,linked_kits:[{basket_id:'b1',name:'Cesta <A>'}]};
const row=view.row(product),card=view.mobileCard(product);
assert.match(row,/Café &lt;forte&gt;/);
assert.doesNotMatch(row,/Café <forte>/,'product text cannot inject markup into the row');
assert.match(row,/data-mobile-product-field="price" data-product-id="p&lt;1&gt;"/);
assert.match(row,/3 avulso · 2 em cestas\/kits/);
assert.match(row,/data-open-product-basket="b1">Cesta &lt;A&gt;/);
assert.match(card,/data-mobile-product-active="p&lt;1&gt;"/);
assert.match(card,/data-mobile-product-field="gondola"/);
assert.match(card,/data-mobile-product-field="expiration"/);
assert.match(card,/Zerar estoque/);
assert.equal(view.linkedKits({linked_kits:null}).length,0);
console.log('Admin product list rows and mobile cards: PASS');
