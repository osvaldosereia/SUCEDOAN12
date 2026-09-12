import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = 'supabase/migrations/20260912041800_whatsapp_flow_v57_unified_launch_authority.sql';
const sql = fs.readFileSync(path, 'utf8').toLowerCase();

for (const token of [
  'get_whatsapp_flow_owner_homologation_preflight_v7',
  'get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v10',
  'get_whatsapp_flow_v57_homologation_control_plane_v1',
  "physical_evidence_authority', 'v56-no-order-terminal'",
  'pg_advisory_xact_lock',
  'revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9',
  'revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8',
  "'safe_to_launch_owner_v9', false",
  "'safe_to_launch_owner_v10', safe_v10"
]) {
  assert.ok(sql.includes(token), `missing contract token: ${token}`);
}

for (const forbidden of [
  'update public.automation_config',
  'insert into public.orders',
  'insert into public.messages',
  'insert into public.outbound_jobs',
  'whatsapp_live_canary_percent=100',
  'experience_orchestrator_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'bling_order_sync_enabled=true'
]) {
  assert.ok(!sql.includes(forbidden), `forbidden mutation in V57 migration: ${forbidden}`);
}

console.log('V57 unified launch authority contract: OK');
