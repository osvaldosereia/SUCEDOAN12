import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='supabase/functions/admin-store-baskets-v1/index.ts';
assert.ok(fs.existsSync(path),`missing ${path}`);
const source=fs.readFileSync(path,'utf8');

assert.match(source,/verify|Authorization|Bearer/i,'API must require authenticated admin context');
assert.match(source,/admin_users/,'API must authorize against admin_users');
assert.match(source,/viewer/,'API must distinguish read-only admin role');
for(const action of ['list','editor','save','preview'])assert.match(source,new RegExp(`["']${action}["']`),`missing action ${action}`);
assert.match(source,/store_basket_recipe_catalog_v1/,'list must use canonical catalog RPC');
assert.match(source,/store_basket_recipe_editor_v1/,'editor must use canonical editor RPC');
assert.match(source,/save_store_basket_recipe_v1/,'save must use canonical save RPC');
assert.match(source,/preview_store_basket_recipe_v1/,'preview must use canonical preview RPC');
assert.match(source,/MUTATIONS[\s\S]*save/,'save must be treated as mutation');
assert.match(source,/role\s*===?\s*["']viewer["']|role===["']viewer["']|role==["']viewer["']/,'viewer must be blocked from mutations');
assert.doesNotMatch(source,/basket_stock_lots.*insert|basket_lot_component_reservations.*insert/is,'API must not bypass recipe RPCs to reserve stock');

console.log('store baskets admin api v1: PASS');
