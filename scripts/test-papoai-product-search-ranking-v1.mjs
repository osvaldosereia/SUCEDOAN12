import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921234800_papoai_product_search_ranking_v1.sql','utf8');
for(const x of [
'relevance_score',
'brand_requested',
'token_hits',
"action_type='product_choice'",
'product_selection_required'
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: product search ranking and single-choice confirmation contract');
