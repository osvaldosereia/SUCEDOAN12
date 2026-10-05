import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const service=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const carousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const migration=fs.readFileSync('supabase/sql/20261004_basket_categories_and_financials_v1.sql','utf8');

const summaryStart=guided.indexOf('function summaryData()');
const summaryEnd=guided.indexOf('\n  function renderSummary',summaryStart);
assert.ok(summaryStart>=0&&summaryEnd>summaryStart,'editor guiado deve expor resumo financeiro próprio da composição');
const summary=guided.slice(summaryStart,summaryEnd);
assert.match(summary,/cost_price/,'resumo guiado deve ler custo unitário dos produtos');
assert.match(summary,/sale_price/,'resumo guiado deve ler preço unitário dos produtos');
assert.match(summary,/p\.quantity|quantity/,'resumo guiado deve multiplicar pela quantidade da posição');
assert.match(summary,/base_price/,'preço final do modelo deve ser a referência comercial');
assert.match(summary,/hidden\s*:\s*final-sale|hidden=final-sale/,'ajuste oculto visual deve ser derivado do preço final menos a soma dos itens');
for(const label of ['Custo dos produtos','Soma dos preços','Preço final','Ajuste oculto'])assert.ok(guided.includes(label),`resumo guiado deve mostrar ${label}`);

// O JavaScript exibe o resumo; snapshots financeiros de lote e vínculo pertencem ao banco.
assert.doesNotMatch(guided,/function basketKitDraftFinancials/,'não deve existir um segundo motor financeiro legado no editor guiado');
assert.match(migration,/cost_sum_snapshot|component_sum_snapshot|hidden_adjustment_snapshot/i,'banco deve persistir snapshots financeiros do lote');

assert.ok(admin.includes('Categorias de cestas'),'Admin deve oferecer gestão das categorias');
assert.ok(service.includes('basket_categories_admin')&&service.includes('basket_category_save')&&service.includes('basket_category_delete'),'API deve oferecer listar, salvar e excluir categorias');
assert.ok(service.includes('category_id'),'API deve permitir vincular cesta à categoria');
const writeActions=service.slice(service.indexOf('const WRITE_ACTIONS='),service.indexOf('const cors='));
for(const action of ['basket_category_save','basket_category_delete','basket_category_assign'])assert.ok(writeActions.includes('"'+action+'"'),action+' deve exigir autenticação de escrita');
assert.ok(migration.includes('create table if not exists public.basket_categories'),'migration deve criar categorias próprias de cestas');
assert.ok(migration.includes('category_id'),'migration deve vincular basket_templates à categoria');

const sandbox={window:{}};const vm=(await import('node:vm')).default;vm.createContext(sandbox);vm.runInContext(carousel,sandbox);
const html=sandbox.window.BasketCarousel.card({id:'b1',name:'Econômica 1',category_name:'Econômicas',display_price_cents:9800,carousel_items:[]},x=>String(x),x=>'R$ '+(x/100).toFixed(2),x=>x);
assert.ok(html.includes('basket-category-tag'),'card público deve renderizar tag da categoria');
assert.ok(html.indexOf('Econômicas')<html.indexOf('Econômica 1'),'tag deve aparecer antes/acima do nome da cesta');
assert.ok(storefront.includes('category_name')&&storefront.includes('category_slug'),'storefront deve publicar somente identificação pública da categoria');
assert.ok(!storefront.includes('cost_sum_cents'),'storefront não deve publicar custo interno do lote');
console.log('basket financials/categories canonical: PASS');
