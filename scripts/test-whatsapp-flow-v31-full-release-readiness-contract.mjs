import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260910172000_whatsapp_flow_v31_full_release_readiness_v1.sql', 'utf8');

assert.match(sql, /get_whatsapp_flow_v31_full_release_readiness_v1/);
assert.match(sql, /get_whatsapp_flow_v31_commercial_journey_readiness_v1/);
assert.match(sql, /get_whatsapp_flow_v31_terminal_readiness_v1/);
assert.match(sql, /get_whatsapp_flow_v31_homologation_preflight_v3/);
assert.match(sql, /get_whatsapp_flow_v31_journey_audit_v4/);
assert.match(sql, /handle_whatsapp_flow_commercial_exchange_v23/);
assert.match(sql, /process_whatsapp_flow_nfm_reply_v1\(uuid,uuid,jsonb\)/);

for (const check of [
  'commercial_journey_ready',
  'terminal_bridge_ready',
  'journey_healthy',
  'canary_locked_1',
  'orchestrator_off',
  'data_exchange_global_off',
  'flow_send_global_off',
  'commercial_write_off',
  'bling_off',
  'runtime_v23_present',
  'nfm_reply_present',
  'owner_target_authorized',
  'owner_conversation_ai',
  'owner_service_window_open',
  'owner_handoff_clear',
]) assert.match(sql, new RegExp(check));

assert.match(sql, /revoke all on function public\.get_whatsapp_flow_v31_full_release_readiness_v1\(uuid\) from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.get_whatsapp_flow_v31_full_release_readiness_v1\(uuid\) to service_role/);
assert.doesNotMatch(sql, /update\s+public\./i);
assert.doesNotMatch(sql, /insert\s+into\s+public\./i);
assert.doesNotMatch(sql, /delete\s+from\s+public\./i);

console.log('WhatsApp Flow V31 unified fail-closed release readiness contract: ok');
