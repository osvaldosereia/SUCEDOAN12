import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260911101833_whatsapp_flow_v40_end_to_end_homologation_readiness_v1.sql','utf8');

assert.match(migration,/get_whatsapp_flow_v40_end_to_end_homologation_readiness_v1/);
assert.match(migration,/get_whatsapp_flow_v34_direct_search_readiness_v1/);
assert.match(migration,/get_whatsapp_flow_v37_live_segmented_path_readiness_v1/);
assert.match(migration,/get_whatsapp_flow_v35_session_upsell_readiness_v1/);
assert.match(migration,/get_whatsapp_flow_v39_terminal_checkout_readiness_v1/);
assert.match(migration,/screen='PRODUTOS_A'/);
assert.match(migration,/homologation_test/);
assert.match(migration,/full_catalog_loaded',false/);
assert.match(migration,/ai_authoritative_for_catalog',false/);
assert.match(migration,/ai_authoritative_for_products',false/);
assert.match(migration,/writes_executed',false/);
assert.match(migration,/orders_created',false/);
assert.match(migration,/pii_returned',false/);
assert.match(migration,/revoke all on function public\.get_whatsapp_flow_v40_end_to_end_homologation_readiness_v1\(\) from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.get_whatsapp_flow_v40_end_to_end_homologation_readiness_v1\(\) to service_role/);

console.log('WhatsApp Flow V40 end-to-end readiness contract OK');
