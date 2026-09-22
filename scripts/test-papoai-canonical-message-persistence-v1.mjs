import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922053000_papoai_canonical_message_persistence_v1.sql','utf8');
for(const x of [
'persist_papoai_commerce_message_v1',
'on conflict(whatsapp_message_id) do nothing',
"'minimal_no_secrets'",
"'generated_by','commerce_brain'",
'last_outbound_at',
'last_inbound_at'
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: canonical PapoAI message persistence contract');
