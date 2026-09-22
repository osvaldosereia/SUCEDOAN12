import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921232255_papoai_order_confirmation_v1.sql','utf8');
for(const x of [
"confirm_order'",
'papoai_commerce_cart_fingerprint_v1',
'prepare_papoai_commerce_order_confirmation_v1',
'finalize_papoai_commerce_order_v1',
'cart_changed_reconfirm',
'confirm_cart_order_v2',
"source='papoai_external_agent'",
"'bling_queue_on_confirm',false",
"when 'prepare_order_confirmation'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI two-step order confirmation contract');
