import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260911072400_whatsapp_flow_v37_live_segmented_path_readiness_v1.sql','utf8');

assert.match(sql,/get_whatsapp_flow_v37_live_segmented_path_readiness_v1/);
assert.match(sql,/PERSONALIZAR_A/);
assert.match(sql,/SECOES_A/);
assert.match(sql,/TERMOS_A/);
assert.match(sql,/PRODUTOS_A/);
assert.match(sql,/v_max_products between 1 and 20/);
assert.match(sql,/response_cached_at is not null/);
assert.match(sql,/full_catalog_loaded',false/);
assert.match(sql,/whatsapp_live_canary_percent=1/);
assert.match(sql,/not coalesce\(cfg\.experience_orchestrator_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_send_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.bling_order_sync_enabled,false\)/);
assert.match(sql,/revoke all on function public\.get_whatsapp_flow_v37_live_segmented_path_readiness_v1\(uuid\) from public,anon,authenticated/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_v37_live_segmented_path_readiness_v1\(uuid\) to service_role/);

console.log('V37 live segmented path contract OK');
