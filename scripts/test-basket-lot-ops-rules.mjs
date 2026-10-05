import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminUi=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const guidedApi=fs.readFileSync('supabase/functions/admin-basket-guided-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const migration=fs.readFileSync('supabase/sql/20261004_basket_lot_linked_hygiene_and_original_rule_v1.sql','utf8');
const optionalHygiene=fs.readFileSync('supabase/sql/20261004_optional_hygiene_per_food_lot_v1.sql','utf8');
const draftLinkMigrationPath='supabase/sql/20261004_basket_link_draft_selection_v1.sql';

// O controlador normal foi simplificado. Operação de lote permanece apenas na camada técnica de compatibilidade.
assert.doesNotMatch(section,/kitLotRow|paintBasketKitAdmin|basket_lot_sale_toggle|data-basket-edit-lot/,'controlador simples não deve possuir operação de lote');
for(const label of ['Pausar venda','Retomar venda','Editar lote','Imprimir'])assert.doesNotMatch(section,new RegExp(label),`operação normal não deve expor ${label}`);
assert.match(section,/Criador de Kits/,'operação normal deve começar no criador de kits');
assert.match(section,/Cestas do Site/,'operação normal deve separar cestas externas');

assert.ok(guided.includes('id="bgLotPublicName"'),'compatibilidade de lote deve manter nome público próprio');
assert.ok(guided.includes('id="bgLotSalePrice"'),'compatibilidade de lote deve manter preço próprio');
assert.ok(guided.includes('id="bgLotLinkedType"'),'vínculo opcional deve começar pelo tipo');
assert.ok(guided.includes('id="bgLotLinkedLot"'),'vínculo opcional deve permitir escolher o lote');
assert.match(guided,/\(state\.linkableLots\|\|\[\]\)\.filter\([^\n]*business_type/,'lotes vinculáveis devem ser filtrados pelo tipo');
assert.match(guided,/linked_lot_id\s*:/,'reserva/edição deve persistir o lote vinculado escolhido');
assert.ok(guided.includes('Itens do lote vinculado'),'composição vinculada deve ser visível no editor de compatibilidade');
for(const label of ['Em montagem','Montado','Cancelar lote','Reabrir para editar','Ativar venda'])assert.match(guided,new RegExp(label),`editor técnico deve manter a operação ${label}`);
assert.doesNotMatch(guided,/data-kit-lot-delete|deleteBasketKitLot/,'fluxo técnico deve cancelar/liberar reserva, não apagar lote fisicamente pela UI');

const linkedStart=guidedApi.indexOf('async function linkableLots');
const linkedEnd=guidedApi.indexOf('\nasync function modelEditor',linkedStart);
assert.ok(linkedStart>=0&&linkedEnd>linkedStart,'gateway guiado deve ter catálogo isolado de lotes vinculáveis');
const linked=guidedApi.slice(linkedStart,linkedEnd);
assert.match(linked,/\.in\("status",\["draft","ready"\]\)/,'seletor deve carregar lotes em montagem e montados');
assert.match(linked,/\.is\("linked_lot_id",null\)/,'um lote já composto não deve ser oferecido como nova dependência');
assert.match(linked,/quantity_available/,'catálogo deve trazer disponibilidade física do lote');
assert.match(linked,/basket_stock_lot_items/,'catálogo deve trazer snapshot dos itens vinculados');

// A separação de pedido continua preservando cesta original quando só há acréscimos.
assert.match(adminUi,/CESTA ORIGINAL|permanece original/i,'separação deve identificar cesta original preservada');
assert.match(adminUi,/loose_quantity/,'extras da separação devem sair do estoque avulso');

assert.ok(fs.existsSync(draftLinkMigrationPath),'draft linked-lot migration must exist');
const draftLinkMigration=fs.readFileSync(draftLinkMigrationPath,'utf8');
assert.match(draftLinkMigration,/status\s+in\s*\(\s*'draft'\s*,\s*'ready'\s*\)/i,'draft save must accept a linked lot that is still being edited');
assert.match(draftLinkMigration,/linked_lot_unavailable/i,'mounting must still reject an unavailable linked lot');
assert.match(draftLinkMigration,/apply_basket_kit_lot_commercial_v3/i,'mounting must refresh linked commercial snapshots before becoming ready');

assert.match(storefront,/linked=c\.linked_lot_id\?String\(c\.linked_lot_id\):""/,'canonical preview must derive the optional linked lot from the selected commercial lot');
assert.match(storefront,/hygiene=linked\?await splitLotItems\(linked,"hygiene"\):\[\]/,'canonical preview must load linked components only when the selected lot has a link');
assert.match(storefront,/requestedLinked=uid\(payload\?\.hygiene_lot_id\)/,'quote must validate any linked lot supplied by the browser');
assert.doesNotMatch(storefront,/const usesHygiene=pricing\?\.uses_hygiene_kit===true/,'canonical storefront must not derive hygiene from the legacy split availability view');

assert.match(migration,/add column if not exists linked_hygiene_lot_id uuid/i,'food lots need a persisted hygiene-lot link');
assert.match(migration,/references public\.basket_stock_lots\(id\)/i,'hygiene link must be referentially constrained');
assert.match(migration,/basket_group_preserves_original_lot_v1/i,'checkout needs a preservation rule that distinguishes additions from removals');
assert.match(migration,/supplied_qty\s*\+\s*0\.0001\s*<\s*expected_qty/i,'removal/reduction must break the premounted-lot match');
assert.match(migration,/v_preassembled_units:=case when v_group_changed then 0 else v_base_qty\*v_line_qty end/i,'preserved original basket must allocate only original quantity to the premounted lot');
assert.match(migration,/v_loose_units:=case when v_group_changed then v_selected_qty\*v_line_qty else greatest\(v_selected_qty-v_base_qty,0\)\*v_line_qty end/i,'only additions must become loose extras when original basket is preserved');

assert.match(optionalHygiene,/optional hygiene per food lot/i,'corrective migration must document the optional per-lot rule');
assert.match(optionalHygiene,/set uses_hygiene_kit=false/i,'the accidental global hygiene requirement must be reverted for baskets that were originally food-only');
assert.match(optionalHygiene,/v_linked is not null/i,'activation should validate hygiene only when a hygiene lot is actually linked');
assert.doesNotMatch(optionalHygiene,/raise exception 'linked_hygiene_lot_required'/i,'activation must not require hygiene when none was selected');
assert.match(optionalHygiene,/\(f\.linked_hygiene_lot_id is not null\) uses_hygiene_kit/i,'split availability must derive hygiene presence from the selected food-lot link');
assert.match(optionalHygiene,/v_basket\.uses_hygiene_kit:=exists/i,'legacy checkout migration must derive hygiene use from the selected food lot rather than a global basket requirement');
assert.match(optionalHygiene,/hl\.status='ready'/i,'a selected hygiene lot must still be physically ready');

console.log('Basket lot operational rules compatibility: PASS');
