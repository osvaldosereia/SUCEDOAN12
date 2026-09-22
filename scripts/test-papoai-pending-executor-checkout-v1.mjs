import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921231737_papoai_pending_executor_checkout_v1.sql','utf8');
for(const x of [
"when 'pending_action'",
"when 'confirm_pending'",
"when 'propose_replacement'",
"when 'checkout_readiness'",
"papoai_commerce_write_disabled"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: pending executor and checkout readiness command contract');
