import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922045000_papoai_customer_context_v3.sql','utf8');
for(const x of [
'get_papoai_commerce_customer_context_v3',
'search_papoai_commerce_products_for_customer_v1',
"'direct_preferences'",
"'soft_preferences'",
"'inferred_min_confidence',0.85",
"'inferred_min_evidence',2",
"'sensitive_fields_included',false",
'avoid_penalty',
'frequent_bonus'
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI customer context v3 and personalized search');
