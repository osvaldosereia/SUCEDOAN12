import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922051500_papoai_pending_action_supersession_v1.sql','utf8');
for(const x of [
'supersede_papoai_commerce_pending_action_v1',
"'ignored'",
"'superseded_by_new_customer_intent'",
"when 'confirm_order'",
"when 'delegated_replacement'",
"v_intent in ('select_product_choice','confirm_pending','cancel_pending')"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: pending action supersession contract');
