import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/20260911114000_whatsapp_flow_v41_physical_homologation_evidence_v1.sql','utf8');

for (const needle of [
  'get_whatsapp_flow_v41_physical_homologation_evidence_v1',
  "slug='flow-cestas-comercial-v8-stable'",
  "e.screen='PRODUTOS_A'",
  "e.screen='UPSELL'",
  "e.screen='REVISAO'",
  "e.screen in ('CLIENTE_EXISTENTE','CLIENTE_NOVO')",
  "e.screen='FINALIZAR'",
  'get_whatsapp_flow_v39_terminal_checkout_readiness_v1',
  'whatsapp_live_canary_percent=1',
  'not coalesce(cfg.experience_orchestrator_enabled,false)',
  'not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)',
  'not coalesce(cfg.whatsapp_flow_send_enabled,false)',
  'not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)',
  'not coalesce(cfg.bling_order_sync_enabled,false)',
  "'writes_executed',false",
  "'orders_created',false",
  "'pii_returned',false",
  "'nfm_reply_physical_evidence_required',true",
  "'location_request_physical_evidence_required',true",
  'grant execute on function public.get_whatsapp_flow_v41_physical_homologation_evidence_v1(uuid) to service_role'
]) assert.ok(sql.includes(needle), `V41 missing contract: ${needle}`);

assert.ok(sql.includes("revoke all on function public.get_whatsapp_flow_v41_physical_homologation_evidence_v1(uuid) from public,anon,authenticated"));
assert.ok(!/update\s+public\.automation_config/i.test(sql), 'V41 must not alter rollout gates');
assert.ok(!/insert\s+into\s+public\.orders/i.test(sql), 'V41 must not create orders');
assert.ok(!/delete\s+from/i.test(sql), 'V41 must be read-only');

console.log('whatsapp_flow_v41_physical_evidence_contract_ok');
