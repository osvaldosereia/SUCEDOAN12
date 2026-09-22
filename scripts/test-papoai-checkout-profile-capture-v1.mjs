import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922042000_papoai_checkout_profile_capture_v1.sql','utf8');
for(const x of [
'pending_name',
'get_papoai_commerce_checkout_profile_v1',
'begin_papoai_commerce_checkout_profile_v1',
'save_papoai_commerce_checkout_profile_pending_v1',
"'persisted_to_customer',false",
"'checkout_profile_max_questions',2"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI checkout profile capture contract');
