import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922042000_product_knowledge_queue_guard_v1.sql','utf8');
for(const x of [
'max_daily_products-v_completed_today',
"'America/Cuiaba'",
'product_no_longer_sellable',
"enrichment_status='researched'",
"'untrusted_enrichment_searchable',false"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: product knowledge queue guard');
