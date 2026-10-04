import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminUiPath='vitrine/admin/index.html';
const adminApiPath='supabase/functions/admin-products-live-v1/index.ts';
const storefrontPath='supabase/functions/storefront-v2/index.ts';
const migrationPath='supabase/sql/20261004_basket_lot_linked_hygiene_and_original_rule_v1.sql';
const optionalHygienePath='supabase/sql/20261004_optional_hygiene_per_food_lot_v1.sql';

for(const path of [adminUiPath,adminApiPath,storefrontPath,migrationPath,optionalHygienePath])assert.ok(fs.existsSync(path),`missing ${path}`);

const adminUi=fs.readFileSync(adminUiPath,'utf8');
const adminApi=fs.readFileSync(adminApiPath,'utf8');
const storefront=fs.readFileSync(storefrontPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
const optionalHygiene=fs.readFileSync(optionalHygienePath,'utf8');

const rowStart=adminUi.indexOf('function kitLotRow');
const rowEnd=adminUi.indexOf('function paintBasketKitAdmin',rowStart);
assert.ok(rowStart>=0&&rowEnd>rowStart,'kitLotRow block missing');
const row=adminUi.slice(rowStart,rowEnd);
assert.match(row,/public_name\s*\|\|\s*code/,'lot card must prefer the public basket name over physical code');
assert.doesNotMatch(row,/Gerar imagem|data-lot-image/,'new basket lot cards must not expose image generation');
assert.doesNotMatch(row,/Ver composição|<details/,'composition must be visible without opening details');
assert.match(row,/basket-lot-inline-strip/,'composition must render as an inline horizontal strip');
assert.match(row,/data-kit-lot-delete/,'ready/depleted lots must expose delete action');
assert.match(row,/Desativar no site/,'active lots must remain disable-able');
assert.match(row,/Ativar no site/,'inactive lots must remain activate-able');
assert.match(adminUi,/flex:0 0 360px;width:360px/,'horizontal product cards must be wide enough to keep quantity inside');
assert.match(adminUi,/\.basket-lot-component-card\{display:grid;grid-template-columns:48px minmax\(0,1fr\) 64px/,'desktop lot card grid must keep quantity inside the card');
assert.match(adminUi,/\.basket-lot-component-stock\{grid-column:2\/-1/,'stock block should move below the main row instead of overflowing the card');

assert.match(adminUi,/Tipo da cesta\/kit/,'every lot must expose business classification');
assert.match(adminUi,/Tipo do lote vinculado \(opcional\)/,'linked-lot flow must start with an optional type selector');
assert.match(adminUi,/Escolher lote/,'linked-lot flow must expose the lot selector after the type');
assert.match(adminUi,/kitLotLinkedType/,'linked-lot type selector must be wired');
assert.match(adminUi,/kitLotLinkedLot/,'generic linked-lot selector must be wired');
assert.match(adminUi,/linkableLots\.filter\([^\n]*business_type/,'linked-lot choices must be filtered by selected business type');
assert.match(adminUi,/linked_lot_id/,'lot save must persist the selected generic linked lot when one is chosen');
assert.match(adminUi,/data-kit-lot-delete[^\n]*deleteBasketKitLot|deleteBasketKitLot\(/,'lot delete UI must be wired to a handler');
assert.match(adminUi,/CESTA ORIGINAL|permanece original/i,'separation UI must explicitly identify preserved original baskets');
assert.match(adminUi,/loose_quantity/,'separation UI must use loose quantity for extras instead of re-picking preassembled components');

assert.match(adminApi,/linkableLots/,'admin API must load linkable ready lots for every kit');
assert.match(adminApi,/linked_lot_id/,'admin API must return and accept the generic linked lot');
assert.match(adminApi,/basket_kit_lot_delete/,'admin API must expose safe lot deletion');
assert.match(adminApi,/Number\(a\?\.split_available\|\|0\)<=0/,'split readiness must trust per-lot availability instead of global hygiene requirement');

assert.match(storefront,/const usesHygiene=pricing\?\.uses_hygiene_kit===true/,'price preview must derive hygiene use from split availability');
assert.doesNotMatch(storefront,/if\(b\.uses_hygiene_kit&&uid\(pricing\.hygiene_lot_id\)!==hygieneLot\)/,'price preview must not use the global basket flag for hygiene');
assert.match(storefront,/hygiene=usesHygiene\?/,'price preview must load hygiene components only when the selected food lot links a hygiene lot');

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
assert.match(optionalHygiene,/v_basket\.uses_hygiene_kit:=exists/i,'checkout must derive hygiene use from the selected food lot rather than a global basket requirement');
assert.match(optionalHygiene,/hl\.status='ready'/i,'a selected hygiene lot must still be physically ready');

console.log('Basket lot operational rules contract: PASS');
