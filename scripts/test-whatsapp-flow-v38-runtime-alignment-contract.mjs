import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='supabase/migrations/20260911082000_whatsapp_flow_v38_runtime_definition_alignment_v1.sql';
const sql=fs.readFileSync(p,'utf8');

assert.match(sql,/get_whatsapp_flow_v38_runtime_alignment_readiness_v1/);
assert.match(sql,/handle_whatsapp_flow_commercial_exchange_v25/);
assert.match(sql,/handle_whatsapp_flow_commercial_exchange_v24/);
assert.match(sql,/get_whatsapp_flow_session_recommendations_v1/);
assert.match(sql,/runtime_edge_version'\s*,\s*48/);
assert.match(sql,/edge_version'\s*,\s*48/);
assert.match(sql,/handler_version'\s*,\s*'v25'/);
assert.match(sql,/never_load_full_catalog/);
assert.match(sql,/full_catalog_load_forbidden/);
assert.match(sql,/max_products_per_query/);
assert.match(sql,/whatsapp_live_canary_percent=1/);
assert.match(sql,/experience_orchestrator_enabled,false/);
assert.match(sql,/whatsapp_flow_data_exchange_enabled,false/);
assert.match(sql,/whatsapp_flow_send_enabled,false/);
assert.match(sql,/whatsapp_flow_commercial_write_enabled,false/);
assert.match(sql,/bling_order_sync_enabled,false/);
assert.match(sql,/revoke all on function public\.get_whatsapp_flow_v38_runtime_alignment_readiness_v1\(uuid\) from public,anon,authenticated/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_v38_runtime_alignment_readiness_v1\(uuid\) to service_role/);
assert.doesNotMatch(sql,/production_enabled'\s*,\s*true/i);
assert.doesNotMatch(sql,/customer_exposure'\s*,\s*true/i);
assert.doesNotMatch(sql,/whatsapp_flow_send_enabled\s*=\s*true/i);

console.log('V38 runtime alignment contract: ok');
