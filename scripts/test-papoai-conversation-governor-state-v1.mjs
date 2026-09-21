import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922024000_papoai_conversation_governor_state_v1.sql','utf8');
for(const x of [
'papoai_conversation_governor_state',
'papoai_conversation_governor_audit',
'clarification_count between 0 and 2',
'get_papoai_conversation_governor_state_v1',
'record_papoai_conversation_governor_decision_v1',
"'conversation_governor_enabled',false",
"'max_segmenting_questions',2",
"'manageable_result_count',10"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: conversation governor state contract');
