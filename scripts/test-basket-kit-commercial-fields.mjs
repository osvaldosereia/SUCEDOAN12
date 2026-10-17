import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/sql/20261003_basket_lot_commercial_fields_v1.sql';
const adminUiPath='vitrine/admin/index.html';
const guidedUiPath='vitrine/admin/basket-guided-builder.js';
const guidedApiPath='supabase/functions/admin-basket-guided-v1/index.ts';
const adminApiPath='supabase/functions/admin-products-live-v1/index.ts';
const storefrontPath='supabase/functions/storefront-v2/index.ts';

for(const path of [migrationPath,adminUiPath,guidedUiPath,guidedApiPath,adminApiPath,storefrontPath])assert.ok(fs.existsSync(path),`missing ${path}`);

const migration=fs.readFileSync(migrationPath,'utf8');
assert.match(migration,/add column if not exists public_name text/i);
assert.match(migration,/apply_basket_kit_lot_commercial_v1/i);
assert.match(migration,/component_sum_snapshot/i);
assert.match(migration,/hidden_adjustment_snapshot/i);
assert.match(migration,/sale_price_override/i);
assert.match(migration,/basket_lot_commercial_price_v1/i,'split checkout must start from the lot commercial price');
assert.match(migration,/v_basket_unit:=public\.basket_lot_commercial_price_v1/i,'personalization must apply deltas over the frozen lot price');

const adminUi=fs.readFileSync(adminUiPath,'utf8');
const guidedUi=fs.readFileSync(guidedUiPath,'utf8');
const guidedApi=fs.readFileSync(guidedApiPath,'utf8');
assert.doesNotMatch(adminUi,/id="kitLotPublicName"|id="kitLotSalePrice"/,'legacy lot commercial editor must not remain in the monolithic admin runtime');
assert.match(guidedUi,/id="bgLotPublicName"/,'guided lot creator must expose public name');
assert.match(guidedUi,/id="bgLotSalePrice"/,'guided lot creator must expose own manual sale price');
assert.match(guidedUi,/public_name\s*:\s*state\.lotPublicName|public_name\s*:\s*lotPublicName/i,'guided save must send public name');
assert.match(guidedUi,/sale_price\s*:\s*Number\(state\.lotSalePrice|sale_price\s*:\s*state\.lotSalePrice/i,'guided save must send manual sale price');
assert.match(guidedUi,/linked_lot_id\s*:/i,'guided save must persist generic linked lot when selected');
assert.match(guidedApi,/p_public_name:clean\(input\?\.public_name/,'guided gateway must persist lot public name');
assert.match(guidedApi,/p_sale_price:price/,'guided gateway must persist lot manual sale price');
assert.match(guidedApi,/p_linked_lot_id:linked/,'guided gateway must persist linked lot');

const adminApi=fs.readFileSync(adminApiPath,'utf8');
assert.match(adminApi,/save_basket_kit_lot_draft_v4/,'legacy compatibility gateway must still use generic linked-lot commercial draft RPC');
assert.match(adminApi,/create_basket_kit_lot_v4/,'legacy compatibility gateway must still use generic linked-lot commercial create RPC');
assert.match(adminApi,/p_business_type/,'compatibility gateway must persist lot business type');
assert.match(adminApi,/p_linked_lot_id/,'compatibility gateway must persist generic linked lot');
const detailStart=adminApi.indexOf('async function basketKitAdminDetail');
const detailEnd=adminApi.indexOf('async function basketKitLotCreate',detailStart);
assert.ok(detailStart>=0&&detailEnd>detailStart,'basketKitAdminDetail block missing');
const detail=adminApi.slice(detailStart,detailEnd);
assert.match(detail,/sale_price_override[^\"]*public_name[^\"]*business_type[^\"]*linked_lot_id/,'compatibility detail must preserve saved type/link/commercial fields');

const storefront=fs.readFileSync(storefrontPath,'utf8');
assert.match(storefront,/db\.from\("basket_commercial_catalog_v1"\)/,'storefront must read the canonical commercial catalog');
assert.match(storefront,/name:x\.public_name\|\|x\.model_name/,'home must use the selected public lot name');
assert.match(storefront,/display_price_cents:cents\(x\.sale_price\)/,'home must use canonical effective sale price');
assert.match(storefront,/name:c\.public_name\|\|c\.model_name/,'basket detail must use the selected public lot name');
assert.match(storefront,/display_price_cents:cents\(c\.sale_price\)/,'basket detail must use canonical effective sale price');
assert.match(storefront,/let total=Number\(c\.sale_price\|\|0\)/,'quote personalization must start from canonical lot sale price');

console.log('Basket lot commercial contract: PASS');
