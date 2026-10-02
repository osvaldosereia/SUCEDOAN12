import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/sql/20261002_storefront_immediate_stock_reservation_v1.sql','utf8');

assert.match(migration,/create or replace function public\.create_vitrine_cart_order_v3/i,'split storefront wrapper must be replaced');
assert.match(migration,/create or replace function public\.create_canonical_cart_order_v2/i,'fallback storefront wrapper must be replaced');
assert.match(migration,/reserve_vitrine_order_stock_v1\(v_order_id\)/,'new storefront order must reserve stock in the same transaction');
assert.match(migration,/if coalesce\(\(v_reservation->>'ok'\)::boolean,false\) is not true/i,'reservation failure must be checked');
assert.match(migration,/raise exception '%',v_error/i,'reservation failure must abort and roll back order creation');
assert.match(migration,/stock_reserved',true/i,'successful creation must expose stock_reserved=true');
assert.match(migration,/reservation_timing','on_create/i,'successful creation must expose on-create timing');
assert.match(migration,/if v_source='vitrine' then/i,'canonical fallback must only change immediate reservation for storefront orders');

console.log('storefront immediate stock reservation contract: OK');
