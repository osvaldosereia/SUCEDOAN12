import fs from 'node:fs';
import assert from 'node:assert/strict';

const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const guidedApi=fs.readFileSync('supabase/functions/admin-basket-guided-v1/index.ts','utf8');
const service=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const migration=fs.readFileSync('supabase/sql/20261004_basket_lot_types_links_financials_v1.sql','utf8');

for(const [key,label] of Object.entries({basic_complete:'Cesta completa',basic_food:'Só alimento',cleaning_hygiene:'Limpeza e higiene',cleaning:'Limpeza',hygiene:'Higiene'})){
  assert.match(guided,new RegExp(`${key}[^\\n]*${label}|${label}[^\\n]*${key}`),`editor guiado deve conhecer ${key}`);
}
assert.ok(guided.includes('id="bgLotLinkedType"'),'editor guiado deve selecionar primeiro o tipo do lote vinculado');
assert.ok(guided.includes('id="bgLotLinkedLot"'),'editor guiado deve ter seletor opcional de lote vinculado');
assert.match(guided,/\(state\.linkableLots\|\|\[\]\)\.filter\([^\n]*business_type/,'lotes vinculáveis devem ser filtrados pelo tipo escolhido');
assert.ok(guided.includes('Itens do lote vinculado'),'editor deve mostrar os itens do lote vinculado');
assert.match(guided,/linked\.items[\s\S]*bg-linked-item/,'itens vinculados devem usar o resumo visual canônico');
assert.match(guided,/cost_price/,'cards próprios devem mostrar custo unitário');
assert.match(guided,/sale_price/,'cards próprios devem mostrar venda unitária');
for(const label of ['Custo dos produtos','Soma dos preços','Preço final','Ajuste oculto'])assert.ok(guided.includes(label),`painel financeiro canônico deve renderizar ${label}`);

// Não manter um segundo motor de snapshots financeiros no JavaScript.
assert.doesNotMatch(guided,/function basketKitDraftFinancials/,'snapshots próprios+vinculados pertencem ao domínio SQL, não a um cálculo duplicado no navegador');
assert.match(guided,/summaryData\(\)/,'navegador pode derivar somente o resumo visual da composição atual');

assert.match(migration,/business_type text/i);assert.match(migration,/linked_lot_id uuid/i);
for(const field of ['own_sale_price_override','own_component_sum_snapshot','own_hidden_adjustment_snapshot','own_cost_sum_snapshot','cost_sum_snapshot'])assert.match(migration,new RegExp(field,'i'));
assert.match(migration,/create_basket_kit_lot_v4/i);assert.match(migration,/save_basket_kit_lot_draft_v4/i);
assert.match(migration,/invalid_linked_lot_cycle/i,'banco deve rejeitar ciclo de vínculo');
assert.match(migration,/p_business_type/i);assert.match(migration,/p_linked_lot_id/i);
assert.match(migration,/hidden_adjustment_snapshot\s*=\s*round\(v_own_hidden\s*\+\s*v_linked_hidden/i,'oculto efetivo deve somar oculto próprio e vinculado');
assert.match(migration,/\(v_group='hygiene'\s+or\s+sale_enabled=true\)/i,'lote vinculado interno deve poder ser consumido mesmo fora do site');

assert.match(guidedApi,/p_linked_lot_id:linked/,'gateway canônico deve persistir vínculo genérico via RPC');
assert.match(guidedApi,/p_sale_price:price/,'gateway canônico deve enviar o preço próprio do lote ao domínio SQL');
assert.match(guidedApi,/p_public_name:clean\(input\?\.public_name/,'gateway canônico deve enviar o nome público do lote ao domínio SQL');
assert.match(guidedApi,/["']linkable_lots["']/,'gateway canônico deve oferecer consulta protegida de lotes vinculáveis');
assert.match(guidedApi,/\.in\("status",\["draft","ready"\]\)/,'seletor canônico deve carregar lotes em montagem e montados');
assert.match(guidedApi,/\.is\("linked_lot_id",null\)/,'lote já composto deve continuar visível apenas fora do conjunto de novos alvos');

// API antiga pode permanecer como camada de compatibilidade de dados, mas não é o caminho da UI canônica.
assert.ok(service.includes('create_basket_kit_lot_v4')&&service.includes('save_basket_kit_lot_draft_v4'),'gateway legado deve continuar compatível com os mesmos RPCs de domínio');
assert.ok(service.includes('p_business_type')&&service.includes('p_linked_lot_id'),'compatibilidade antiga deve preservar tipo e vínculo');
assert.match(service,/\["insufficient_loose_stock","lot_product_unavailable","linked_lot_unavailable"\]/,'lote vinculado indisponível deve continuar conflito 409');

assert.ok(storefront.includes('linked_lot_id')||migration.includes('linked_lot_id'),'storefront/view deve conhecer vínculo genérico');
for(const forbidden of ['own_cost_sum_snapshot','cost_sum_snapshot','cost_to_retail_pct','cost_to_manual_pct'])assert.ok(!storefront.includes(`"${forbidden}"`),`storefront não deve publicar ${forbidden}`);
console.log('basket lot types/links/financials canonical: PASS');
