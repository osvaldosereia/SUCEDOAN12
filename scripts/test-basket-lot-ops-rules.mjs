import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminUiPath='vitrine/admin/index.html';
const adminApiPath='supabase/functions/admin-products-live-v1/index.ts';
const migrationPath='supabase/sql/20261004_basket_lot_linked_hygiene_and_original_rule_v1.sql';
const hygienePolicyPath='supabase/sql/20261004_all_food_baskets_require_hygiene_v1.sql';

for(const path of [adminUiPath,adminApiPath,migrationPath,hygienePolicyPath])assert.ok(fs.existsSync(path),`missing ${path}`);

const adminUi=fs.readFileSync(adminUiPath,'utf8');
const adminApi=fs.readFileSync(adminApiPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
const hygienePolicy=fs.readFileSync(hygienePolicyPath,'utf8');

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

assert.match(adminUi,/id="kitLotHygieneLot"/,'food lot composer must allow selecting an existing hygiene lot');
assert.match(adminUi,/linked_hygiene_lot_id/,'food lot save must persist the selected hygiene lot');
assert.match(adminUi,/data-kit-lot-delete[^\n]*deleteBasketKitLot|deleteBasketKitLot\(/,'lot delete UI must be wired to a handler');
assert.match(adminUi,/CESTA ORIGINAL|permanece original/i,'separation UI must explicitly identify preserved original baskets');
assert.match(adminUi,/loose_quantity/,'separation UI must use loose quantity for extras instead of re-picking preassembled components');
assert.match(adminUi,/linked_hygiene_lot_required/,'activation UI must explain when a food lot still needs its hygiene lot');

assert.match(adminApi,/linked_hygiene_lot_id/,'admin API must return and accept the linked hygiene lot');
assert.match(adminApi,/basket_kit_lot_delete/,'admin API must expose safe lot deletion');
assert.match(adminApi,/linked_hygiene_lot_required/,'admin API must preserve the hygiene-link activation error');
assert.match(adminApi,/linked_hygiene_lot_unavailable/,'admin API must preserve the unavailable hygiene-lot activation error');

assert.match(migration,/add column if not exists linked_hygiene_lot_id uuid/i,'food lots need a persisted hygiene-lot link');
assert.match(migration,/references public\.basket_stock_lots\(id\)/i,'hygiene link must be referentially constrained');
assert.match(migration,/basket_group_preserves_original_lot_v1/i,'checkout needs a preservation rule that distinguishes additions from removals');
assert.match(migration,/supplied_qty\s*\+\s*0\.0001\s*<\s*expected_qty/i,'removal/reduction must break the premounted-lot match');
assert.match(migration,/v_preassembled_units:=case when v_group_changed then 0 else v_base_qty\*v_line_qty end/i,'preserved original basket must allocate only original quantity to the premounted lot');
assert.match(migration,/v_loose_units:=case when v_group_changed then v_selected_qty\*v_line_qty else greatest\(v_selected_qty-v_base_qty,0\)\*v_line_qty end/i,'only additions must become loose extras when original basket is preserved');
assert.match(migration,/linked_hygiene_lot_id/,'availability/checkout must use the hygiene lot linked to the food lot');
assert.match(migration,/basket_kit_lot_delete_v1/i,'database must implement safe deletion for never-used lots');
assert.match(migration,/basket_stock_allocations/i,'safe deletion must protect lots that have order allocation history');

assert.match(hygienePolicy,/set uses_hygiene_kit=true/i,'all food basket templates must use the universal hygiene kit');
assert.match(hygienePolicy,/linked_hygiene_lot_required/i,'food lots cannot be activated without their linked hygiene lot');
assert.match(hygienePolicy,/linked_hygiene_lot_unavailable/i,'food lots cannot be activated with a dismantled/unavailable hygiene lot');
assert.match(hygienePolicy,/hl\.status='ready'/i,'cancelled hygiene lots must never be reused implicitly');

console.log('Basket lot operational rules contract: PASS');