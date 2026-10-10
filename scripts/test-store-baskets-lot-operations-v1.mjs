import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
const api=fs.readFileSync('supabase/functions/admin-store-baskets-v1/index.ts','utf8');

// A mounted lot remains visible as an operational record with code, quantity and state.
assert.match(ui,/function historyHtml\(\)/);
assert.match(ui,/b\.code\|\|b\.lot_code/);
assert.match(ui,/b\.quantity_built\?\?b\.quantity\?\?b\.qty\?\?b\.units/);
assert.match(ui,/Montado/);
assert.match(ui,/Em montagem/);
assert.match(ui,/Cancelado/);

// Only pre-mount builds expose physical state-changing actions.
assert.match(ui,/st\[0\]===['"]Em montagem['"]/);
assert.match(ui,/data-store-mount/);
assert.match(ui,/data-store-cancel/);

// Mutations stay behind the authenticated admin edge function and viewer cannot execute them.
assert.match(api,/const MUTATIONS=new Set\(\[[^\]]*['"]reserve['"][^\]]*['"]mount['"][^\]]*['"]cancel['"]/s);
assert.match(api,/MUTATIONS\.has\(action\)&&auth\.role===?['"]viewer['"]/);
assert.match(api,/mount_store_basket_reservation_v1/);
assert.match(api,/cancel_store_basket_reservation_v1/);

console.log('store baskets lot operations v1: PASS');
