import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='supabase/functions/admin-store-baskets-v1/index.ts';
assert.ok(fs.existsSync(path),`missing ${path}`);
const source=fs.readFileSync(path,'utf8');

assert.match(source,/verify|Authorization|Bearer/i,'API must require authenticated admin context');
assert.match(source,/admin_users/,'API must authorize against admin_users');
assert.match(source,/viewer/,'API must distinguish read-only admin role');
for(const action of ['list','editor','save','preview','builds','reserve','mount','cancel'])assert.match(source,new RegExp(`["']${action}["']`),`missing action ${action}`);
assert.match(source,/store_basket_recipe_catalog_v1/,'list must use canonical catalog RPC');
assert.match(source,/store_basket_recipe_editor_v1/,'editor must use canonical editor RPC');
assert.match(source,/save_store_basket_recipe_v1/,'save must use canonical save RPC');
assert.match(source,/preview_store_basket_recipe_v1/,'preview must use canonical preview RPC');
assert.match(source,/store_basket_builds_v1/,'builds must use protected build catalog RPC');
assert.match(source,/reserve_store_basket_recipe_v1/,'reserve must use atomic recipe reservation RPC');
assert.match(source,/mount_store_basket_reservation_v1/,'mount must use atomic mount RPC');
assert.match(source,/cancel_store_basket_reservation_v1/,'cancel must use atomic release RPC');
assert.match(source,/MUTATIONS[\s\S]*save[\s\S]*reserve[\s\S]*mount[\s\S]*cancel/,'all physical writes must be treated as mutations');
assert.match(source,/role\s*===?\s*["']viewer["']|role===["']viewer["']|role==["']viewer["']/,'viewer must be blocked from mutations');
assert.match(source,/integer\(input\?\.quantity/,'reserve quantity must be validated before RPC');
assert.match(source,/uuid\(input\?\.lot_id/,'mount/cancel lot id must be validated before RPC');
assert.doesNotMatch(source,/\.from\(["']basket_stock_lots["']\).*?(insert|update|delete)|\.from\(["']basket_lot_component_reservations["']\).*?(insert|update|delete)/is,'API must never write stock tables directly');

console.log('store baskets admin api v2: PASS');
