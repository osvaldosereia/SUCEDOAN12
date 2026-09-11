import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260911041700_whatsapp_flow_v34_direct_intent_search_v1.sql','utf8');

assert.match(sql,/get_whatsapp_flow_direct_search_v1/);
assert.match(sql,/get_whatsapp_flow_product_results_page_v2\(v_query,v_page,v_page_size\)/);
assert.match(sql,/least\(coalesce\(p_page_size,12\),20\)/);
assert.match(sql,/query_too_short/);
assert.match(sql,/full_catalog_loaded',false/);
assert.match(sql,/ai_authoritative_for_catalog',false/);
assert.match(sql,/writes_executed',false/);
assert.match(sql,/pii_returned',false/);
assert.match(sql,/get_whatsapp_flow_v34_direct_search_readiness_v1/);
assert.match(sql,/array\['leite','arroz','detergente','sabonete','shampoo'\]/);
assert.match(sql,/get_whatsapp_flow_v34_owner_homologation_readiness_v5/);
assert.match(sql,/get_whatsapp_flow_v33_owner_homologation_readiness_v4/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_direct_search_v1\(text,integer,integer\) to service_role/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_v34_direct_search_readiness_v1\(\) to service_role/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_v34_owner_homologation_readiness_v5\(uuid\) to service_role/);

console.log('whatsapp-flow-v34-direct-intent-search-contract: ok');
