import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261008124500_checkout_attempt_idempotency_v1.sql');
const edge = read('supabase/functions/storefront-v2/index.ts');
const client = read('checkout-resilience.js');
const root = read('index.html');
const vitrine = read('vitrine/index.html');

assert.match(sql, /request_id uuid primary key/);
assert.match(sql, /order_id uuid not null unique references public\.orders\(id\)/);
assert.match(sql, /request_hash text not null/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke all on public\.order_checkout_attempts_v1 from public, anon, authenticated/);
assert.match(sql, /sha256\(convert_to\(/);
assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('vitrine-checkout:'\|\|p_request_id::text,0\)\)/);
assert.match(sql, /v_result := public\.create_vitrine_cart_order_v3\(/);
assert.match(sql, /insert into public\.order_checkout_attempts_v1\(request_id,request_hash,order_id,result\)/);
assert.match(sql, /checkout_request_changed/);

const replay = edge.indexOf('const replay=await replayExisting();');
const stock = edge.indexOf('const stock=await reconcileOrderItemsForStock(requestedItems)');
assert.ok(replay > 0 && stock > replay, 'retry must resolve before stock is checked');
assert.match(edge, /ops2_create_vitrine_checkout_once_v1/);
assert.match(edge, /invalid_checkout_request_id/);
assert.match(edge, /checkout_attempt_lookup_unavailable/);
assert.match(client, /body\.checkout_request_id=checkoutAttemptId\(body\)/);
assert.match(client, /sessionStorage\?\.setItem\(CHECKOUT_ATTEMPT_STORAGE/);
assert.match(client, /sessionStorage\?\.removeItem\(CHECKOUT_ATTEMPT_STORAGE/);
assert.equal(root, vitrine, 'site mirrors must match exactly');
assert.match(root, /renderOrderSuccess\(saved\);window\.DonaAntoniaCheckoutAttempt\?\.complete\?\.\(\)/);
assert.match(root, /checkout-resilience\.js\?v=20261008-idempotency1/);
console.log('PASS checkout idempotency contract checks');
