import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const service=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const migration=fs.readFileSync('supabase/sql/20261004_basket_lot_types_links_financials_v1.sql','utf8');

for(const label of ['Cesta Básica Completa','Cesta Básica Só os Alimentos','Kit Limpeza e Higiene','Kit Limpeza','Kit Higiene']){
  assert.ok(admin.includes(label),`Admin deve oferecer o tipo ${label}`);
}
assert.ok(admin.includes('id="kitLotBusinessType"'),'editor deve ter seletor de tipo do lote');
assert.ok(admin.includes('id="kitLotLinkedLot"'),'editor deve ter seletor opcional para vincular outro lote');
assert.ok(admin.includes('Custo un.')&&admin.includes('Venda un.'),'cada item deve mostrar custo e venda unitários');
for(const id of ['kitLotCostSum','kitLotRetailSum','kitLotHiddenSum','kitLotCostToRetailPct','kitLotCostToManualPct']){
  assert.ok(admin.includes(`id="${id}"`),`painel financeiro deve renderizar ${id}`);
}
assert.ok(admin.includes('Itens do lote vinculado'),'editor deve mostrar os itens do lote vinculado');

const fnStart=admin.indexOf('  function basketKitDraftFinancials(');
const fnEnd=admin.indexOf('\n  function ',fnStart+12);
assert.ok(fnStart>0&&fnEnd>fnStart,'deve existir cálculo financeiro isolado');
const ctx={};vm.createContext(ctx);vm.runInContext(admin.slice(fnStart,fnEnd),ctx);
const f=vm.runInContext(`basketKitDraftFinancials({
  items:[{quantity_per_kit:2,cost:10,price:15}],
  sale_price:40,
  linked_lot_id:'l2'
},[{id:'l2',sale_price_override:30,hidden_adjustment_snapshot:5,cost_sum_snapshot:18,component_sum_snapshot:25,items:[{quantity_per_kit:1,product:{cost:18,price:25}}]}])`,ctx);
assert.equal(f.ownCost,20);
assert.equal(f.ownRetail,30);
assert.equal(f.linkedCost,18);
assert.equal(f.linkedRetail,25);
assert.equal(f.totalCost,38);
assert.equal(f.totalRetail,55);
assert.equal(f.ownManual,40);
assert.equal(f.linkedManual,30);
assert.equal(f.totalManual,70);
assert.equal(f.ownHidden,10);
assert.equal(f.linkedHidden,5);
assert.equal(f.totalHidden,15);
assert.equal(Math.round(f.costToRetailPct*100)/100,44.74);
assert.equal(Math.round(f.costToManualPct*100)/100,84.21);

assert.match(migration,/business_type text/i);
assert.match(migration,/linked_lot_id uuid/i);
assert.match(migration,/own_sale_price_override/i);
assert.match(migration,/own_component_sum_snapshot/i);
assert.match(migration,/own_hidden_adjustment_snapshot/i);
assert.match(migration,/own_cost_sum_snapshot/i);
assert.match(migration,/cost_sum_snapshot/i);
assert.match(migration,/create_basket_kit_lot_v4/i);
assert.match(migration,/save_basket_kit_lot_draft_v4/i);
assert.match(migration,/invalid_linked_lot_cycle/i,'banco deve rejeitar ciclo de vínculo');
assert.match(migration,/p_business_type/i);
assert.match(migration,/p_linked_lot_id/i);
assert.match(migration,/hidden_adjustment_snapshot\s*=\s*round\(v_own_hidden\s*\+\s*v_linked_hidden/i,'oculto efetivo deve somar oculto próprio e vinculado');

assert.ok(service.includes('create_basket_kit_lot_v4')&&service.includes('save_basket_kit_lot_draft_v4'),'gateway deve usar RPC v4');
assert.ok(service.includes('p_business_type')&&service.includes('p_linked_lot_id'),'gateway deve persistir tipo e vínculo genérico');
assert.ok(service.includes('linkable_lots'),'detalhe Admin deve devolver lotes vinculáveis');
assert.ok(storefront.includes('linked_lot_id')||migration.includes('linked_lot_id'),'storefront/view deve conhecer vínculo genérico');
for(const forbidden of ['own_cost_sum_snapshot','cost_sum_snapshot','cost_to_retail_pct','cost_to_manual_pct']){
  assert.ok(!storefront.includes(`"${forbidden}"`),`storefront não deve publicar ${forbidden}`);
}
console.log('basket lot types/links/financials: PASS');
