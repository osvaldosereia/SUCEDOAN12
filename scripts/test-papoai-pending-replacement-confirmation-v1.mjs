import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921231621_papoai_pending_replacement_confirmation_v1.sql','utf8');
for(const x of [
'papoai_commerce_pending_actions',
'propose_papoai_commerce_replacement_v1',
'get_papoai_commerce_pending_action_v1',
'confirm_papoai_commerce_pending_action_v1',
'replacement_ambiguous',
'expires_in_seconds',
"status='confirmed'"
]) assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: pending replacement confirmation contract');
