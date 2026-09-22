import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921233212_papoai_executor_repeat_bling_v1.sql','utf8');
for(const x of ["when 'repeat_preview'","when 'repeat_last_purchase'","when 'queue_bling'"])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: executor repeat and Bling gate commands');
