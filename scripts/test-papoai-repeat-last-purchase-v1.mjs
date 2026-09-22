import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921233048_papoai_repeat_last_purchase_v1.sql','utf8');
for(const x of [
"'repeat_last_purchase'",
'preview_papoai_commerce_repeat_last_purchase_v1',
'propose_papoai_commerce_repeat_last_purchase_v1',
'apply_papoai_commerce_repeat_last_purchase_v1',
"'substitutions_will_repeat',false",
"'repeat_substitution_policy','never_auto_repeat_historical_substitutions'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI repeat last purchase contract');
