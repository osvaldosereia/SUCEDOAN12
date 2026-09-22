import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922040000_product_sales_knowledge_v1.sql','utf8');
for(const x of [
'product_sales_knowledge',
'product_semantic_rules',
'product_knowledge_enrichment_jobs',
'product_knowledge_config',
'refresh_product_sales_knowledge_v1',
'queue_active_product_knowledge_enrichment_v1',
'claim_product_knowledge_enrichment_jobs_v1',
'get_papoai_product_search_document_v1',
"'hair_curls'",
"'cabelo crespo'",
"'external_calls_allowed',false",
'search_papoai_commerce_products_v1'
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: product sales knowledge foundation');
