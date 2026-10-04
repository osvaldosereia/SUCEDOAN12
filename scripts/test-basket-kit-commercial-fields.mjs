import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/sql/20261003_basket_lot_commercial_fields_v1.sql';
const adminPath='supabase/functions/basket-lot-commercial-admin-v1/index.ts';
const storefrontWrapperPath='supabase/functions/storefront-v2-commercial-wrapper/index.ts';
const adminEnhancerPath='vitrine/admin/basket-lot-image.js';

for(const path of [migrationPath,adminPath,storefrontWrapperPath,adminEnhancerPath]){
  assert.ok(fs.existsSync(path),`missing ${path}`);
}

const migration=fs.readFileSync(migrationPath,'utf8');
assert.match(migration,/add column if not exists public_name text/i);
assert.match(migration,/set_basket_lot_commercial_fields_v1/i);
assert.match(migration,/component_sum_snapshot/i);
assert.match(migration,/hidden_adjustment_snapshot/i);
assert.match(migration,/sale_price_override/i);
assert.match(migration,/create or replace function public\.create_vitrine_cart_order_v3\(/i);
assert.match(migration,/commercial_adjustment/i,'checkout wrapper must apply lot price over template base price');
assert.match(migration,/stock_adjusted_retry/i,'wrapper must perform minimum-order validation after commercial adjustment');

const admin=fs.readFileSync(adminPath,'utf8');
assert.match(admin,/set_basket_lot_commercial_fields_v1/);
assert.match(admin,/public_name/);
assert.match(admin,/sale_price/);
assert.match(admin,/admin_users/,'commercial endpoint must keep admin authorization');

const enhancer=fs.readFileSync(adminEnhancerPath,'utf8');
assert.match(enhancer,/kitLotPublicName/,'lot creator must expose public name');
assert.match(enhancer,/kitLotSalePrice/,'lot creator must expose sale price');
assert.match(enhancer,/basket-lot-commercial-admin-v1/,'draft save must persist commercial snapshot');

const storefront=fs.readFileSync(storefrontWrapperPath,'utf8');
assert.match(storefront,/public_name/);
assert.match(storefront,/sale_price_override/);
assert.match(storefront,/food_lot_id/,'split storefront must resolve commercial fields from food lot');
assert.match(storefront,/lot_id/,'legacy storefront must also support lot commercial fields');

console.log('Basket lot commercial contract: PASS');
