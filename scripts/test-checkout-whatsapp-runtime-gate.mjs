import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql';
assert.ok(fs.existsSync(sqlPath),'checkout WhatsApp outbox migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');

assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.ops2_whatsapp_order_runtime_v1/i,'runtime gate table must exist');
assert.match(sql,/mode\s+text\s+not\s+null\s+default\s+'off'/i,'runtime mode must default to off');
for(const mode of ['off','canary','live']) assert.ok(sql.includes(`'${mode}'`),`runtime mode ${mode} must be supported`);
assert.match(sql,/canary_order_id\s+uuid/i,'runtime gate must support one controlled canary order');
assert.match(sql,/insert\s+into\s+public\.ops2_whatsapp_order_runtime_v1[\s\S]*'off'/i,'runtime gate must be initialized off');
assert.match(sql,/alter\s+table\s+public\.ops2_whatsapp_order_runtime_v1\s+enable\s+row\s+level\s+security/i,'runtime gate must have RLS enabled');
assert.match(sql,/revoke\s+all\s+on\s+table\s+public\.ops2_whatsapp_order_runtime_v1\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,'runtime gate must not be client-accessible');
assert.match(sql,/grant\s+all\s+on\s+table\s+public\.ops2_whatsapp_order_runtime_v1\s+to\s+service_role/i,'service role must control runtime gate');

const enqueue=sql.match(/create\s+or\s+replace\s+function\s+public\.ops2_enqueue_order_whatsapp_v1[\s\S]*?\n\$\$;/i)?.[0]||'';
assert.ok(enqueue,'enqueue function must exist');
assert.match(enqueue,/ops2_whatsapp_order_runtime_v1/i,'enqueue must read runtime gate');
assert.match(enqueue,/runtime_off/i,'enqueue must explicitly skip while runtime is off');
assert.match(enqueue,/not_canary_order/i,'enqueue must reject non-canary orders in canary mode');
assert.match(enqueue,/v_runtime_mode\s*=\s*'canary'[\s\S]*p_order_id\s+is\s+distinct\s+from\s+v_canary_order_id/i,'canary enqueue must be limited to the configured order id');

const claim=sql.match(/create\s+or\s+replace\s+function\s+public\.ops2_claim_whatsapp_outbox_v1[\s\S]*?\n\$\$;/i)?.[0]||'';
assert.ok(claim,'claim function must exist');
assert.match(claim,/ops2_whatsapp_order_runtime_v1/i,'claim must read runtime gate');
assert.match(claim,/runtime_off/i,'claim must refuse delivery while runtime is off');
assert.match(claim,/v_runtime_mode\s*=\s*'live'\s+or\s+q\.order_id\s*=\s*v_canary_order_id/i,'claim must only expose the selected canary order before live mode');

console.log('checkout WhatsApp runtime gate contract: ok');
