import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922022500_papoai_product_choice_executor_v1.sql','utf8');
for(const x of ["when 'propose_product_choice'","when 'select_product_choice'","selected_product_id"])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: product choice executor contract');
