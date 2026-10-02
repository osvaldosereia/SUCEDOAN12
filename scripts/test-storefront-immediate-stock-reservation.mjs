import fs from 'node:fs';
import assert from 'node:assert/strict';

const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const migration=fs.readFileSync('supabase/sql/20261002_storefront_immediate_stock_reservation_v1.sql','utf8');

assert.match(storefront,/create_storefront_reserved_order_v1/,'storefront must create orders through the atomic reserved-order RPC');
assert.doesNotMatch(storefront,/reservation_on_confirmation:true/,'storefront must not postpone reservation until confirmation');
assert.match(storefront,/stock_reserved:true/,'storefront response/event must report immediate reservation');
assert.match(storefront,/reservation_timing:"on_create"/,'storefront must report on-create reservation timing');
assert.match(migration,/create or replace function public\.create_storefront_reserved_order_v1/i,'migration must define atomic storefront order+reservation RPC');
assert.match(migration,/reserve_vitrine_order_stock_v1\(v_order_id\)/,'atomic RPC must reserve the just-created order');
assert.match(migration,/raise exception '%',v_error/,'reservation failure must abort and roll back order creation');
assert.match(migration,/revoke all on function public\.create_storefront_reserved_order_v1/i,'RPC must not be publicly callable');
assert.match(migration,/grant execute on function public\.create_storefront_reserved_order_v1/i,'service role must be able to invoke RPC');

console.log('storefront immediate stock reservation contract: OK');
