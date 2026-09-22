import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922062000_papoai_offer_choice_pending_safety_v1.sql','utf8');
for(const x of [
'cancel_papoai_commerce_pending_actions_v1',
"'new_product_search'",
'propose_papoai_commerce_offer_choice_v1',
"'explicit_offers'",
'propose_papoai_commerce_proactive_offer_choice_v1',
"'pending_action_exists'",
"'proactive_offer'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: offer choice and pending action safety');
