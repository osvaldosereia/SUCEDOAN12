import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/sql/20261003_basket_lot_commercial_fields_v1.sql';
const adminUiPath='vitrine/admin/index.html';
const adminApiPath='supabase/functions/admin-products-live-v1/index.ts';
const storefrontPath='supabase/functions/storefront-v2/index.ts';

for(const path of [migrationPath,adminUiPath,adminApiPath,storefrontPath])assert.ok(fs.existsSync(path),`missing ${path}`);

const migration=fs.readFileSync(migrationPath,'utf8');
assert.match(migration,/add column if not exists public_name text/i);
assert.match(migration,/apply_basket_kit_lot_commercial_v1/i);
assert.match(migration,/component_sum_snapshot/i);
assert.match(migration,/hidden_adjustment_snapshot/i);
assert.match(migration,/sale_price_override/i);
assert.match(migration,/basket_lot_commercial_price_v1/i,'split checkout must start from the lot commercial price');
assert.match(migration,/v_basket_unit:=public\.basket_lot_commercial_price_v1/i,'personalization must apply deltas over the frozen lot price');

const adminUi=fs.readFileSync(adminUiPath,'utf8');
assert.match(adminUi,/kitLotPublicName/,'lot creator must expose public name');
assert.match(adminUi,/kitLotSalePrice/,'lot creator must expose own manual sale price');
assert.match(adminUi,/public_name:String\(draft\.public_name\|\|''\)\.trim\(\)/,'draft save must send public name for every lot type');
assert.match(adminUi,/sale_price:Number\(draft\.sale_price\)/,'draft save must send own manual sale price for every lot type');
assert.match(adminUi,/business_type:draft\.business_type/,'draft save must send lot business type');
assert.match(adminUi,/linked_lot_id:draft\.linked_lot_id\|\|null/,'draft save must send generic linked lot');

const adminApi=fs.readFileSync(adminApiPath,'utf8');
assert.match(adminApi,/save_basket_kit_lot_draft_v4/,'gateway must use generic linked-lot commercial draft RPC');
assert.match(adminApi,/create_basket_kit_lot_v4/,'gateway must use generic linked-lot commercial create RPC');
assert.match(adminApi,/p_business_type/,'gateway must persist lot business type');
assert.match(adminApi,/p_linked_lot_id/,'gateway must persist generic linked lot');
const detailStart=adminApi.indexOf('async function basketKitAdminDetail');
const detailEnd=adminApi.indexOf('async function basketKitLotCreate',detailStart);
assert.ok(detailStart>=0&&detailEnd>detailStart,'basketKitAdminDetail block missing');
const detail=adminApi.slice(detailStart,detailEnd);
assert.match(detail,/sale_price_override[^"]*public_name[^"]*business_type[^"]*linked_lot_id/,'admin detail must return saved type/link/commercial fields so resume/duplicate preserve them');
assert.match(detail,/linkableLots/,'admin detail must expose lots that can be linked');

const storefront=fs.readFileSync(storefrontPath,'utf8');
assert.match(storefront,/db\.from\("basket_commercial_catalog_v1"\)/,'storefront must read the canonical commercial catalog');
assert.match(storefront,/name:x\.public_name\|\|x\.model_name/,'home must use the selected public lot name');
assert.match(storefront,/display_price_cents:cents\(x\.sale_price\)/,'home must use canonical effective sale price');
assert.match(storefront,/name:c\.public_name\|\|c\.model_name/,'basket detail must use the selected public lot name');
assert.match(storefront,/display_price_cents:cents\(c\.sale_price\)/,'basket detail must use canonical effective sale price');
assert.match(storefront,/let total=Number\(c\.sale_price\|\|0\)/,'quote personalization must start from canonical lot sale price');

console.log('Basket lot commercial contract: PASS');
