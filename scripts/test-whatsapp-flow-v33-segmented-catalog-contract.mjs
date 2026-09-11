import fs from 'node:fs';
import assert from 'node:assert/strict';

const readiness=fs.readFileSync('supabase/migrations/20260911031800_whatsapp_flow_v33_segmented_catalog_readiness_v1.sql','utf8');
const aliasFix=fs.readFileSync('supabase/migrations/20260911031900_whatsapp_flow_v33_utilidades_pet_alias_fix_v1.sql','utf8');

assert.match(readiness,/get_whatsapp_flow_v33_segmented_catalog_readiness_v1/);
assert.match(readiness,/get_whatsapp_flow_product_results_page_v2\(v_search,1,20\)/);
assert.match(readiness,/max_products_per_page/);
assert.match(readiness,/full_catalog_loaded',false/);
assert.match(readiness,/invalid_product_count/);
assert.match(readiness,/writes_executed',false/);
assert.match(readiness,/pii_returned',false/);
assert.match(readiness,/get_whatsapp_flow_v33_owner_homologation_readiness_v4/);
assert.match(readiness,/get_whatsapp_flow_v32_owner_homologation_readiness_v3/);
assert.match(readiness,/grant execute on function public\.get_whatsapp_flow_v33_segmented_catalog_readiness_v1\(\) to service_role/);
assert.match(readiness,/grant execute on function public\.get_whatsapp_flow_v33_owner_homologation_readiness_v4\(uuid\) to service_role/);

assert.match(aliasFix,/when 'casa_pet' then 'utilidades_pet'/);
assert.match(aliasFix,/when 'utilidades_pet' then 'Casa e pet'/);
assert.match(aliasFix,/get_whatsapp_flow_search_terms_v1\(v_section\)/);
assert.match(aliasFix,/grant execute on function public\.get_whatsapp_flow_segmented_terms_v1\(text\) to service_role/);

console.log('whatsapp-flow-v33-segmented-catalog-contract: ok');
