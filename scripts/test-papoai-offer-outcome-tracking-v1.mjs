import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922050000_papoai_offer_outcome_tracking_v1.sql','utf8');
for(const x of [
'record_papoai_product_choice_offer_outcome_v1',
"'added'",
"'rejected'",
"'declined_all'",
"choice_kind','proactive_offer'",
"choice_kind','explicit_offers'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: offer outcome tracking contract');
