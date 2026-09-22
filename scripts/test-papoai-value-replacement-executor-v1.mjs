import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922032000_papoai_value_replacement_executor_v1.sql','utf8');
for(const x of [
"when 'recommend_value_replacement'",
"when 'propose_value_replacement'",
"when 'select_value_replacement'",
"selected_option"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: value replacement executor contract');
