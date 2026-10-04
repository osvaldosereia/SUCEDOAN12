import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const service=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const carousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const migration=fs.readFileSync('supabase/sql/20261004_basket_categories_and_financials_v1.sql','utf8');

const start=admin.indexOf('  function basketKitDraftFinancials(');
const end=admin.indexOf('\n  function ',start+12);
assert.ok(start>0&&end>start,'Admin deve expor cálculo isolado dos totais financeiros do lote');
const ctx={};vm.createContext(ctx);vm.runInContext(admin.slice(start,end),ctx);
const result=vm.runInContext(`basketKitDraftFinancials({
  items:[
    {quantity:2,product:{cost:10,price:15}},
    {quantity:1,product:{cost:4.5,price:8}}
  ],
  linked_hygiene_lot_id:'h1'
},[
  {id:'h1',items:[{quantity_per_kit:1,product:{cost:6,price:9}},{quantity_per_kit:2,product:{cost:2,price:3}}]}
])`,ctx);
assert.deepEqual(JSON.parse(JSON.stringify(result)),{cost:34.5,retail:53},'somatórios devem incluir alimentos e o lote de limpeza escolhido');
assert.ok(admin.includes('id="kitLotCostSum"')&&admin.includes('id="kitLotRetailSum"'),'criação do lote deve mostrar custo e venda internos');
assert.ok(admin.includes('Categorias de cestas'),'Admin deve oferecer gestão das categorias');
assert.ok(service.includes('basket_categories_admin')&&service.includes('basket_category_save')&&service.includes('basket_category_delete'),'API deve oferecer listar, salvar e excluir categorias');
assert.ok(service.includes('category_id'),'API deve permitir vincular cesta à categoria');
assert.ok(migration.includes('create table if not exists public.basket_categories'),'migration deve criar categorias próprias de cestas');
assert.ok(migration.includes('category_id'),'migration deve vincular basket_templates à categoria');

const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(carousel,sandbox);
const html=sandbox.window.BasketCarousel.card({id:'b1',name:'Econômica 1',category_name:'Econômicas',display_price_cents:9800,carousel_items:[]},x=>String(x),x=>'R$ '+(x/100).toFixed(2),x=>x);
assert.ok(html.includes('basket-category-tag'),'card público deve renderizar tag da categoria');
assert.ok(html.indexOf('Econômicas')<html.indexOf('Econômica 1'),'tag deve aparecer antes/acima do nome da cesta');
assert.ok(storefront.includes('category_name')&&storefront.includes('category_slug'),'storefront deve publicar somente identificação pública da categoria');
assert.ok(!storefront.includes('cost_sum_cents'),'storefront não deve publicar custo interno do lote');
console.log('basket financials/categories: PASS');
