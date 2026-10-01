import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql';
assert.ok(fs.existsSync(sqlPath),'checkout WhatsApp outbox migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');

assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.ops2_whatsapp_outbox_v1/i,'outbox table must exist');
assert.match(sql,/unique\s*\(\s*order_id\s*,\s*message_kind\s*\)/i,'order_id + message_kind must be unique');
for(const status of ['pending','sending','sent','retry','failed','suppressed']){
  assert.ok(sql.includes(`'${status}'`),`status ${status} must be supported`);
}
for(const column of ['channel_origin','channel_phone_e164','phone_e164','external_message_id','last_error','attempt_count']){
  assert.match(sql,new RegExp(`\\b${column}\\b`,'i'),`${column} must exist`);
}
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_enqueue_order_whatsapp_v1\s*\(/i,'enqueue RPC must exist');
assert.match(sql,/p_order_id\s+uuid/i,'enqueue RPC must accept order id');
assert.match(sql,/p_message_kind\s+text\s+default\s+'order_received'/i,'enqueue RPC must default to order_received');
assert.match(sql,/from\s+public\.conversations/i,'enqueue must inspect conversations');
assert.match(sql,/whatsapp_account_id/i,'enqueue must use whatsapp_account_id');
assert.match(sql,/public\.whatsapp_accounts/i,'enqueue must resolve active WhatsApp account');
assert.match(sql,/wa\.phone_e164/i,'enqueue must resolve channel phone from WhatsApp account');
assert.match(sql,/right\([^\n]*0975|0975[^\n]*channel_origin/i,'0975 channel must be recognized');
assert.match(sql,/right\([^\n]*1018|1018[^\n]*channel_origin/i,'1018 channel must be recognized');
assert.match(sql,/on\s+conflict\s*\(\s*order_id\s*,\s*message_kind\s*\)/i,'enqueue must be idempotent');
assert.match(sql,/canonical_whatsapp_e164_br_v2/i,'customer/order phone must be canonicalized');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.ops2_enqueue_order_whatsapp_v1[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'enqueue RPC must not be public');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.ops2_enqueue_order_whatsapp_v1[^;]*to\s+service_role/i,'service role must be authorized');

const sfPath='supabase/functions/storefront-v2/index.ts';
assert.ok(fs.existsSync(sfPath),'storefront-v2 source must exist');
const sf=fs.readFileSync(sfPath,'utf8');
const orderIdPos=sf.indexOf('const orderId=created.data?.order_id');
const enqueuePos=sf.indexOf('ops2_enqueue_order_whatsapp_v1');
assert.ok(orderIdPos>=0&&enqueuePos>orderIdPos,'WhatsApp confirmation must enqueue only after canonical order id exists');
assert.match(sf,/db\.rpc\("ops2_enqueue_order_whatsapp_v1",\{p_order_id:orderId,p_message_kind:"order_received"\}\)/,'storefront must enqueue order_received confirmation');
assert.match(sf,/whatsappConfirmation[^;]*status[^;]*unavailable|whatsapp_confirmation/,'storefront must expose informational WhatsApp confirmation state');
assert.match(sf,/catch\(e\)\{console\.error\("whatsapp_confirmation_enqueue"/,'enqueue failure must be caught and logged');
assert.match(sf,/whatsapp_confirmation:whatsappConfirmation/,'order response must include confirmation status without failing the order');

console.log('checkout WhatsApp outbox contract: ok');
