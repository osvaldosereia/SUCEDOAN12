import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
assert.match(sql, /create or replace function public\.ops2_wait_vitrine_checkout_attempt_v1\(/i);
assert.match(sql, /return public\.ops2_lookup_vitrine_checkout_attempt_v1\(p_request_id,p_request_context\)/i);
assert.match(sql, /grant execute on function public\.ops2_wait_vitrine_checkout_attempt_v1\(uuid,jsonb\)/i);

const replay = edge.indexOf('const replay=await replayExisting();');
const stock = edge.indexOf('const stock=await reconcileOrderItemsForStock(requestedItems)');
assert.ok(replay > 0 && stock > replay, 'retry must resolve before stock is checked');
assert.match(edge, /ops2_create_vitrine_checkout_once_v1/);
assert.match(edge, /invalid_checkout_request_id/);
assert.match(edge, /checkout_attempt_lookup_unavailable/);
assert.match(edge, /replayExisting\(true\)/, 'stock misses should await concurrent attempts');
assert.match(edge, /if\(created\.data\?\.replayed===true\)/);
const initialReplayBlock=edge.slice(edge.indexOf('async function replayExisting('),edge.indexOf('const replay=await replayExisting();'));
const concurrentReplayBlock=edge.slice(edge.indexOf('if(created.data?.replayed===true)'),edge.indexOf('if(orderId&&ph){try{const linked'));
assert.match(initialReplayBlock,/if\(ph\)kickWhatsappOrderOutbound\(savedId\)/,
  'replay after a lost response must resume pending WhatsApp outbox delivery');
assert.match(concurrentReplayBlock,/if\(ph\)kickWhatsappOrderOutbound\(orderId\)/,
  'concurrent replay must resume pending outbox without duplicating the order');
assert.match(initialReplayBlock,/minimum_order_cents:MINIMUM_ORDER_CENTS/,
  'replayed checkout preserves the minimum order metadata');
assert.match(concurrentReplayBlock,/minimum_order_cents:MINIMUM_ORDER_CENTS/,
  'concurrent replay preserves the checkout metadata');

assert.ok(edge.indexOf('if(created.data?.replayed===true)') < edge.indexOf('if(orderId&&ph){try{const linked'), 'concurrent replay must return before CRM and WhatsApp side effects');
assert.match(client, /body\.checkout_request_id=checkoutAttemptId\(body\)/);
assert.match(client, /sessionStorage\?\.setItem\(CHECKOUT_ATTEMPT_STORAGE/);
assert.match(client, /sessionStorage\?\.removeItem\(CHECKOUT_ATTEMPT_STORAGE/);
assert.equal(root, vitrine, 'site mirrors must match exactly');
assert.match(root, /renderOrderSuccess\(saved\);window\.DonaAntoniaCheckoutAttempt\?\.complete\?\.\(\)/);
assert.match(root, /checkout-resilience\.js\?v=20261008-idempotency1/);
assert.match(client, /registration:body\.checkout_registration\|\|null/);
assert.match(edge, /checkout_registration:p\?\.checkout_registration\|\|null/);

// Execute the real browser helper in a sandbox, not a duplicate implementation.
const start = client.indexOf('  const CHECKOUT_ATTEMPT_STORAGE');
const end = client.indexOf('  function byId(id)',start);
assert.ok(start>=0&&end>start,'checkout retry helper boundaries must be present');
const store=new Map();
let count=0;
const browser={crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++count).padStart(12,'0')}`},sessionStorage:{
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>store.set(key,value),
  removeItem:key=>store.delete(key)
}};
const context={window:browser};
vm.runInNewContext(client.slice(start,end)+';this.createAttempt=checkoutAttemptId;',context);
const payload={whatsapp_phone:'+5565999999999',payment_method:'PIX',
  items:[{type:'product',id:'X',qty:1}],checkout_registration:{street:'Rua A',number:'10'}};
const original=context.createAttempt(payload);
assert.equal(original,context.createAttempt(payload),'same registration retains attempt ID');
assert.notEqual(original,context.createAttempt({...payload,
  checkout_registration:{...payload.checkout_registration,number:'11'}}),
'changed delivery address must use a new attempt ID');
assert.ok(![...store.values()].join(' ').includes('Rua A'),
'no raw registration address may be persisted in session storage');

console.log('PASS checkout idempotency contract checks');
