import fs from 'node:fs';
import assert from 'node:assert/strict';

const apiPath='supabase/functions/admin-basket-guided-v1/index.ts';
assert.equal(fs.existsSync(apiPath),true,'guided basket admin edge function must exist');
const api=fs.readFileSync(apiPath,'utf8');

assert.match(api,/admin_users/i,'guided API must reuse admin_users authorization');
assert.match(api,/db\.auth\.getUser/i,'guided API must validate the bearer token with Supabase Auth');
assert.match(api,/role[^\n]*viewer|viewer[^\n]*forbidden/i,'viewer role must not mutate guided baskets');
assert.match(api,/Access-Control-Allow-Origin/i,'guided API must provide explicit CORS');

for(const action of ['model_editor','position_products','linkable_lots','model_save','lot_preview','lot_reserve','lot_update','lot_mount','lot_cancel','lot_reopen']){
  assert.match(api,new RegExp(`["']${action}["']`),`guided API must expose ${action}`);
}

for(const rpc of [
  'basket_commercial_model_editor_v1',
  'save_basket_commercial_model_v2',
  'preview_basket_commercial_lot_v1',
  'create_basket_commercial_lot_reserved_v1',
  'update_basket_reserved_lot_v1',
  'mark_basket_reserved_lot_mounted_v1',
  'cancel_basket_reserved_lot_v1',
  'reopen_basket_kit_lot_for_edit_v1'
]){
  assert.match(api,new RegExp(`db\\.rpc\\(["']${rpc}["']`),`guided API must delegate to ${rpc}`);
}

assert.match(api,/basket_lot_substitution_products/i,'position catalog must reuse explicit family membership');
assert.match(api,/ops2_loose_sellable_stock_v1/i,'position catalog must use canonical loose stock');
assert.match(api,/family_key/i,'position catalog must support explicit family selection');
assert.match(api,/search_query|searchParams\.get\(["']q["']\)/i,'position catalog must support textual fallback search');
assert.match(api,/limit/i,'position catalog must support a bounded page size');
assert.match(api,/offset/i,'position catalog must support pagination');
for(const field of ['cost_price','sale_price','effective_sellable_stock','basket_locked_quantity','loose_stock']){
  assert.match(api,new RegExp(field),`position product cards must return ${field}`);
}

const linkedStart=api.indexOf('async function linkableLots');
const linkedEnd=api.indexOf('\nasync function modelEditor',linkedStart);
assert.ok(linkedStart>=0&&linkedEnd>linkedStart,'linkable lots helper must be isolated');
const linked=api.slice(linkedStart,linkedEnd);
assert.match(linked,/basket_stock_lots/,'linked lot catalog must use canonical lots');
assert.match(linked,/basket_stock_lot_items/,'linked lot catalog must return its component snapshot');
assert.match(linked,/business_type/,'linked lot catalog must preserve operational type');
assert.match(linked,/ops2_loose_sellable_stock_v1|stockMap/,'linked lot components must expose canonical loose stock');
assert.doesNotMatch(linked,/\.insert\(|\.update\(|\.delete\(/,'linkable lot catalog must remain read-only');

assert.doesNotMatch(api,/from\(["']basket_lot_component_reservations["']\)\.(insert|update|delete)/i,'edge function must not duplicate reservation mutation rules');
assert.doesNotMatch(api,/from\(["']basket_stock_lots["']\)\.(insert|update|delete)/i,'edge function must not mutate lots directly');
assert.doesNotMatch(api,/service_role[^\n]*(response|json)|SUPABASE_SERVICE_ROLE_KEY[^\n]*(response|json)/i,'service role credentials must never be returned');

for(const code of ['insufficient_loose_stock','lot_has_order_history','lot_is_dependency','lot_sale_must_be_disabled','linked_lot_unavailable']){
  assert.match(api,new RegExp(code),`guided API must map ${code}`);
}

console.log('basket guided admin api v2: PASS');
