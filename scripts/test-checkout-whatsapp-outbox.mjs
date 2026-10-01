import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql';
assert.ok(fs.existsSync(sqlPath),'checkout WhatsApp outbox migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');

assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.ops2_whatsapp_outbox_v1/i,'outbox table must exist');
assert.match(sql,/unique\s*\(\s*order_id\s*,\s*message_kind\s*\)/i,'order_id + message_kind must be unique');
for(const status of ['pending','sending','sent','retry','failed','suppressed']) assert.ok(sql.includes(`'${status}'`),`status ${status} must be supported`);
for(const mode of ['session_text','utility_template']) assert.ok(sql.includes(`'${mode}'`),`delivery mode ${mode} must be supported`);
for(const column of ['channel_origin','channel_phone_e164','phone_e164','delivery_mode','external_message_id','last_error','attempt_count']) assert.match(sql,new RegExp(`\\b${column}\\b`,'i'),`${column} must exist`);

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_enqueue_order_whatsapp_v1\s*\(/i,'enqueue RPC must exist');
assert.match(sql,/p_order_id\s+uuid/i,'enqueue RPC must accept order id');
assert.match(sql,/p_message_kind\s+text\s+default\s+'order_received'/i,'enqueue RPC must default to order_received');
assert.match(sql,/from\s+public\.conversations/i,'enqueue must inspect conversations');
assert.match(sql,/whatsapp_account_id/i,'enqueue must use whatsapp_account_id');
assert.match(sql,/public\.whatsapp_accounts/i,'enqueue must resolve active WhatsApp account');
assert.match(sql,/wa\.phone_e164/i,'enqueue must resolve channel phone from WhatsApp account');
assert.match(sql,/right\([^\n]*0975|0975[^\n]*channel_origin/i,'0975 channel must be recognized');
assert.match(sql,/right\([^\n]*1018|1018[^\n]*channel_origin/i,'1018 channel must be recognized');
assert.match(sql,/last_inbound_at[\s\S]*23 hours 50 minutes/i,'Meta service-window decision must use recent inbound activity with safety margin');
assert.match(sql,/on\s+conflict\s*\(\s*order_id\s*,\s*message_kind\s*\)\s+do\s+update/i,'enqueue must be idempotent and refresh pending routing');
assert.match(sql,/where\s+q\.status\s+in\s*\(\s*'pending'\s*,\s*'retry'\s*\)/i,'routing refresh must never rewrite sent rows');
assert.match(sql,/canonical_whatsapp_e164_br_v2/i,'customer/order phone must be canonicalized');
assert.doesNotMatch(sql,/order_snapshot'\s*,\s*to_jsonb\(v_order\)/i,'outbox must not expose the full internal order row to the provider');
assert.match(sql,/'delivery'\s*,\s*coalesce\(v_order\.checkout_snapshot->'delivery'/i,'outbox must include only the delivery slice needed for confirmation');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.ops2_enqueue_order_whatsapp_v1[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'enqueue RPC must not be public');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.ops2_enqueue_order_whatsapp_v1[^;]*to\s+service_role/i,'service role must be authorized');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_enqueue_storefront_order_whatsapp_v1\s*\(\s*\)/i,'site-order enqueue trigger function must exist');
assert.match(sql,/new\.source\s+not\s+in\s*\(\s*'vitrine'\s*,\s*'storefront_v2'\s*\)/i,'trigger must only target site orders');
assert.match(sql,/perform\s+public\.ops2_enqueue_order_whatsapp_v1\(new\.id\s*,\s*'order_received'\)/i,'trigger must enqueue the created site order');
assert.match(sql,/exception\s+when\s+others[\s\S]*return\s+new/i,'WhatsApp enqueue trigger must fail open');
assert.match(sql,/create\s+trigger\s+trg_ops2_enqueue_storefront_order_whatsapp_v1[\s\S]*after\s+insert\s+on\s+public\.orders/i,'orders insert trigger must exist');
assert.match(sql,/create\s+trigger\s+trg_ops2_refresh_storefront_order_whatsapp_v1[\s\S]*after\s+update\s+of\s+conversation_id\s*,\s*whatsapp_account_id\s*,\s*customer_id\s*,\s*phone_e164\s+on\s+public\.orders/i,'PapoAI channel link must refresh pending outbox routing');

const gatewayPath='supabase/functions/whatsapp-order-outbound-v1/index.ts';
assert.ok(fs.existsSync(gatewayPath),'WhatsApp outbound gateway must exist');
const gateway=fs.readFileSync(gatewayPath,'utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_claim_whatsapp_outbox_v1\s*\(\s*p_delivery_mode\s+text\s+default\s+null\s*,\s*p_channel_origin\s+text\s+default\s+null\s*\)/i,'claim RPC must filter by delivery mode and channel');
assert.match(sql,/for\s+update\s+skip\s+locked/i,'claim must be concurrency-safe');
assert.match(sql,/status\s+in\s*\(\s*'pending'\s*,\s*'retry'\s*\)/i,'claim must only read sendable states');
assert.match(sql,/attempt_count\s*<\s*5/i,'claim must cap attempts');
assert.match(sql,/delivery_mode\s*=\s*'session_text'[\s\S]*last_inbound_at/i,'claim must refresh a pending row into session_text when the customer recently messaged');
assert.match(sql,/set\s+status\s*=\s*'sending'/i,'claim must transition to sending');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_finish_whatsapp_outbox_v1\s*\(/i,'finish RPC must exist');
assert.match(sql,/external_message_id/i,'finish RPC must persist provider message id');
assert.match(sql,/v_status\s+not\s+in\s*\([^)]*'sent'[^)]*'retry'[^)]*'failed'[^)]*'suppressed'/i,'finish RPC must whitelist terminal/retry statuses');

for(const envName of [
  'PAPOAI_ORDER_TEXT_WEBHOOK_0975_URL','PAPOAI_ORDER_TEXT_WEBHOOK_1018_URL',
  'PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL','PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL'
]) assert.match(gateway,new RegExp(`Deno\\.env\\.get\\(\"${envName}\"\\)`),`${envName} must be server-side configurable`);
assert.ok(!/Access-Control-Allow-Origin/i.test(gateway),'internal gateway must not expose public CORS');
assert.match(gateway,/ops2_claim_whatsapp_outbox_v1/,'gateway must claim one outbox item');
assert.match(gateway,/p_delivery_mode:provider\.deliveryMode/,'claim must be constrained to configured provider mode');
assert.match(gateway,/p_channel_origin:provider\.channelOrigin/,'claim must be constrained to configured provider channel');
assert.match(gateway,/const providers:Provider\[\]=\[[\s\S]*?\]\.filter\(p=>p\.url\);/,'gateway must only claim routes that actually have a provider configured');
assert.match(gateway,/provider_not_configured/,'missing provider configuration must be explicit');
assert.match(gateway,/message_text/,'PapoAI text webhook payload must contain the confirmation text');
assert.match(gateway,/external_message_id|message_id/,'gateway must capture provider message id when available');
assert.match(config,/\[functions\.whatsapp-order-outbound-v1\][\s\S]*verify_jwt\s*=\s*true/i,'outbound gateway must require JWT');

console.log('checkout WhatsApp outbox contract: ok');
