import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921232806_papoai_bling_queue_guard_v1.sql','utf8');
for(const x of [
'bling_queue_enabled',
"current_setting('app.suppress_bling_queue',true)",
"set_config('app.suppress_bling_queue','on',true)",
'queue_papoai_commerce_bling_v1',
'papoai_bling_queue_disabled',
"source='papoai_external_agent'",
"'legacy_auto_queue_suppressed_for_papoai',true"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI Bling queue isolation contract');
