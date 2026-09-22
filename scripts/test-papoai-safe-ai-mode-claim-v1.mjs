import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922062000_papoai_safe_ai_mode_claim_v1.sql','utf8');
for(const x of [
'activate_papoai_commerce_ai_mode_v1',
"'commerce_brain_disabled'",
"'human_required'",
"'open_handoff'",
"'conversation_paused'",
"set mode='ai'",
"'commerce_enabled_and_no_human_precedence'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: safe PapoAI AI-mode claim contract');
