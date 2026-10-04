import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminUiPath='vitrine/admin/index.html';
const adminApiPath='supabase/functions/admin-products-live-v1/index.ts';
const storefrontPath='supabase/functions/storefront-v2/index.ts';
const migrationPath='supabase/sql/20261004_basket_lot_linked_hygiene_and_original_rule_v1.sql';
const optionalHygienePath='supabase/sql/20261004_optional_hygiene_per_food_lot_v1.sql';
const draftLinkMigrationPath='supabase/sql/20261004_basket_link_draft_selection_v1.sql';

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
assert.match(row,/Pausar venda/,'active lots must remain pause-able');
assert.match(row,/Retomar venda/,'paused lots must remain resumable');
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

const detailStart=adminApi.indexOf('async function basketKitAdminDetail');
const detailEnd=adminApi.indexOf('\nasync function ',detailStart+20);
assert.ok(detailStart>=0&&detailEnd>detailStart,'basketKitAdminDetail block missing');
const detail=adminApi.slice(detailStart,detailEnd);
assert.match(detail,/linkableLots/,'admin API must load linkable lots for every kit');
assert.doesNotMatch(detail,/\.eq\("status","ready"\)\.gt\("quantity_available",0\)/,'linked-lot picker must not hide draft lots or mounted lots with zero availability');
assert.match(detail,/\.in\("status",\["draft","ready"\]\)/,'linked-lot picker must load both draft and mounted lots');
assert.match(adminUi,/Lotes existentes[\s\S]*d\.lots/,'kit summary must expose the number of existing lot records');
assert.match(adminUi,/Lotes montados[\s\S]*ready_lot_count/,'mounted KPI must count mounted lots, not available units');
assert.match(adminUi,/Kits disponíveis[\s\S]*ready_quantity/,'available-unit KPI must be separate from mounted lot count');
assert.match(adminUi,/Em edição[\s\S]*draft_lot_count/,'draft KPI must keep counting editable lots');
assert.match(adminUi,/status==='draft'[^\n]*Em edição|Em edição[^\n]*status==='draft'/,'linked-lot options must visibly identify drafts');
assert.match(adminUi,/status==='ready'[^\n]*Montado|Montado[^\n]*status==='ready'/,'linked-lot options must visibly identify mounted lots');
assert.match(adminApi,/linked_lot_id/,'admin API must return and accept the generic linked lot');
assert.match(adminApi,/basket_kit_lot_delete/,'admin API must expose safe lot deletion');
assert.match(adminApi,/Number\(a\?\.split_available\|\|0\)<=0/,'legacy readiness helper must still tolerate optional hygiene per food lot');

assert.ok(fs.existsSync(draftLinkMigrationPath),'draft linked-lot migration must exist');
const draftLinkMigration=fs.existsSync(draftLinkMigrationPath)?fs.readFileSync(draftLinkMigrationPath,'utf8'):'';
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

console.log('Basket lot operational rules contract: PASS');
