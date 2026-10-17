import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const guidedApi=fs.readFileSync('supabase/functions/admin-basket-guided-v1/index.ts','utf8');
const service=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const carousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const categoryMigration=fs.readFileSync('supabase/sql/20261004_basket_categories_and_financials_v1.sql','utf8');
const lotFinancialMigration=fs.readFileSync('supabase/sql/20261004_basket_lot_types_links_financials_v1.sql','utf8');

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

assert.doesNotMatch(guided,/function basketKitDraftFinancials/,'não deve existir um segundo motor financeiro legado no editor guiado');
for(const field of ['cost_sum_snapshot','component_sum_snapshot','hidden_adjustment_snapshot'])assert.match(lotFinancialMigration,new RegExp(field,'i'),`domínio SQL deve persistir ${field}`);

// Categoria comercial é selecionada no mesmo editor canônico; não há segundo cadastro livre na tela principal.
assert.ok(guided.includes('id="bgCommercialCategory"'),'editor comercial deve permitir escolher a categoria oficial');
assert.match(guidedApi,/basket_categories[^\n]*select|from\("basket_categories"\)/,'API guiada deve carregar as categorias oficiais');
assert.doesNotMatch(admin,/Nova categoria<\/span><input|id="basketCategoryName"/,'runtime principal não deve manter um segundo editor livre de categorias');
assert.ok(service.includes('basket_categories_admin')&&service.includes('basket_category_save')&&service.includes('basket_category_delete'),'API de compatibilidade/gestão deve preservar CRUD de categorias');
assert.ok(service.includes('category_id'),'API deve preservar vínculo de cesta à categoria');
const writeActions=service.slice(service.indexOf('const WRITE_ACTIONS='),service.indexOf('const cors='));
for(const action of ['basket_category_save','basket_category_delete','basket_category_assign'])assert.ok(writeActions.includes('"'+action+'"'),action+' deve exigir autenticação de escrita');
assert.ok(categoryMigration.includes('create table if not exists public.basket_categories'),'migration deve criar categorias próprias de cestas');
assert.ok(categoryMigration.includes('category_id'),'migration deve vincular basket_templates à categoria');

const sandbox={window:{}};const vm=(await import('node:vm')).default;vm.createContext(sandbox);vm.runInContext(carousel,sandbox);
const html=sandbox.window.BasketCarousel.card({id:'b1',name:'Econômica 1',category_name:'Econômicas',display_price_cents:9800,carousel_items:[]},x=>String(x),x=>'R$ '+(x/100).toFixed(2),x=>x);
assert.ok(!html.includes('basket-category-tag'),'card público não deve renderizar tag da categoria');
assert.ok(!html.includes('Econômicas'),'nome da categoria não deve ocupar espaço no card');
assert.ok(storefront.includes('category_name')&&storefront.includes('category_slug'),'storefront deve publicar somente identificação pública da categoria');
assert.ok(!storefront.includes('cost_sum_cents'),'storefront não deve publicar custo interno do lote');
console.log('basket financials/categories canonical: PASS');
