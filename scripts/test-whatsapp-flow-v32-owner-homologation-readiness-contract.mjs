import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/20260911023000_whatsapp_flow_v32_owner_homologation_readiness_v3.sql','utf8');

assert.match(sql,/get_whatsapp_flow_v32_owner_homologation_readiness_v3/);
assert.match(sql,/get_whatsapp_flow_v32_live_session_audit_v2/);
assert.match(sql,/whatsapp_live_canary_percent,0\)=1/);
assert.match(sql,/not coalesce\(v_cfg\.experience_orchestrator_enabled,false\)/);
assert.match(sql,/not coalesce\(v_cfg\.whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(sql,/not coalesce\(v_cfg\.whatsapp_flow_send_enabled,false\)/);
assert.match(sql,/not coalesce\(v_cfg\.whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(sql,/not coalesce\(v_cfg\.bling_order_sync_enabled,false\)/);
assert.match(sql,/post_v32_error_count/);
assert.match(sql,/replay_cache_coverage_complete/);
assert.match(sql,/manual_action_required/);
assert.match(sql,/writes_executed',false/);
assert.match(sql,/pii_returned',false/);
assert.match(sql,/revoke all .* from public, anon, authenticated/i);
assert.match(sql,/grant execute .* to service_role/i);

console.log('WhatsApp Flow V32 owner homologation readiness contract OK');
