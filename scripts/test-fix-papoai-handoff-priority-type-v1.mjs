import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922061000_fix_papoai_handoff_priority_type_v1.sql','utf8');
assert.ok(sql.includes('v_priority smallint'));
assert.ok(sql.includes("::smallint"));
assert.ok(sql.includes("null::uuid"));
console.log('PASS: PapoAI handoff priority typing');
