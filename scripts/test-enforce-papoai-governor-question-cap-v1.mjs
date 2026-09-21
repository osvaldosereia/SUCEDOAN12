import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922025000_enforce_papoai_governor_question_cap_v1.sql','utf8');
assert.ok(sql.includes("v_action='ASK' and v_before>=2"));
assert.ok(sql.includes("v_action:='RECOMMEND'"));
assert.ok(sql.includes("clarification_limit_enforced"));
console.log('PASS: governor question cap enforced in database');
