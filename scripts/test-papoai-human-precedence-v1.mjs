import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922060000_papoai_human_precedence_v1.sql','utf8');
for(const x of [
'get_papoai_commerce_human_precedence_v1',
'queue_papoai_commerce_handoff_v1',
'resume_papoai_commerce_after_handoff_v1',
"'any_human_signal_makes_ai_silent'",
"'explicit_resume_only_when_no_open_handoff'",
"status in ('open','claimed')"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI human precedence contract');
