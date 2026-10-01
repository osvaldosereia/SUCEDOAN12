import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const migrationPath='supabase/sql/20261001_checkout_whatsapp_admin_interop_v1.sql';
const adminPath='supabase/functions/admin-orders-v1/index.ts';
assert.ok(fs.existsSync(migrationPath),'checkout/admin interop migration must exist');
assert.ok(fs.existsSync(adminPath),'admin-orders-v1 must be versioned');

const sql=read(migrationPath);
const admin=read(adminPath);
const storefront=read('supabase/functions/storefront-v2/index.ts');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_enqueue_order_whatsapp_v1_base/i,'automatic enqueue base must be reconciled');
assert.match(sql,/recipient_kind[\s\S]*'customer'/i,'automatic checkout enqueue must use customer recipient kind');
assert.match(sql,/on\s+conflict\s*\(\s*order_id\s*,\s*message_kind\s*,\s*recipient_kind\s*\)/i,'checkout enqueue must use shared triple idempotency key');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_claim_checkout_order_whatsapp_v1/i,'gated checkout claim RPC must exist');
assert.match(sql,/ops2_whatsapp_order_runtime_v1/i,'checkout claim must read runtime gate');
assert.match(sql,/recipient_kind\s*=\s*'customer'/i,'checkout claim may only claim customer rows');
assert.match(sql,/runtime_off/i,'checkout claim must fail closed in OFF');
assert.match(sql,/not_canary_order/i,'checkout claim must reject non-canary orders');

assert.match(admin,/dispatch_scope/i,'admin dispatcher must distinguish manual and checkout automatic dispatch');
assert.match(admin,/checkout_auto/i,'checkout automatic dispatch scope must exist');
assert.match(admin,/ops2_claim_checkout_order_whatsapp_v1/i,'checkout automatic path must use gated claim');
assert.match(admin,/ops2_claim_order_whatsapp_outbox_v1/i,'manual admin path must keep existing order claim');
assert.match(admin,/dona_antonia_supabase/i,'checkout automatic provider payload must identify canonical backend source');
assert.match(admin,/dona_antonia_admin/i,'manual admin provider payload source must remain available');

assert.match(storefront,/functions\/v1\/admin-orders-v1/i,'storefront must reuse existing admin-orders-v1 transport');
assert.match(storefront,/x-internal-key/i,'storefront internal kick must authenticate with internal key');
assert.match(storefront,/dispatch_scope\s*:\s*['"]checkout_auto['"]/i,'storefront kick must request checkout_auto scope');
assert.match(storefront,/order_id\s*:\s*orderId/i,'storefront kick must target the persisted order');
assert.doesNotMatch(storefront,/functions\/v1\/whatsapp-order-outbound-v1/i,'storefront must not call unavailable extra Edge Function');
assert.match(storefront,/waitUntil/i,'automatic WhatsApp dispatch must remain fire-and-forget');

console.log('checkout WhatsApp admin interoperability contract: ok');
