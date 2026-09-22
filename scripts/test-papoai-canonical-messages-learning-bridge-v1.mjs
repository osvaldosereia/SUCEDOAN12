import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922053000_papoai_canonical_messages_learning_bridge_v1.sql','utf8');
for(const x of [
'canonical_message_persistence_enabled',
'learning_enqueue_enabled',
'persist_papoai_commerce_message_v1',
'maybe_enqueue_papoai_commerce_learning_v1',
"'commerce_learning_disabled'",
"'agent_learning_disabled'",
"'papoai_inbound_message'",
"'learning_requires_double_gate',true"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI canonical message and learning bridge contract');
