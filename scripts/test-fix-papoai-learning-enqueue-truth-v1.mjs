import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922054500_fix_papoai_learning_enqueue_truth_v1.sql','utf8');
for(const x of [
'v_queued boolean:=false',
"v_queued:=coalesce((v_enqueued->>'queued')::boolean,false)",
"'enqueued',v_queued",
"'enqueue_declined'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: learning enqueue truthfulness contract');
