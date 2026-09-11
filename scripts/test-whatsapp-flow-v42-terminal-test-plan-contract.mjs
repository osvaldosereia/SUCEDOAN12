import assert from 'node:assert/strict';
import fs from 'node:fs';

const p='supabase/migrations/20260911123000_whatsapp_flow_v42_terminal_physical_test_plan_v1.sql';
const sql=fs.readFileSync(p,'utf8');

for(const needle of [
  'get_whatsapp_flow_v42_terminal_physical_test_plan_v1',
  'get_whatsapp_flow_v41_physical_homologation_evidence_v1',
  'get_whatsapp_flow_v39_terminal_checkout_readiness_v1',
  'handle_whatsapp_flow_commercial_exchange_v25',
  'handle_whatsapp_flow_commercial_exchange_v24',
  'handle_whatsapp_flow_commercial_exchange_v23',
  'UPSELL','REVISAO','CLIENTE_EXISTENTE|CLIENTE_NOVO','FINALIZAR','nfm_reply','location_request',
  'whatsapp_live_canary_percent',
  'experience_orchestrator_enabled',
  'whatsapp_flow_data_exchange_enabled',
  'whatsapp_flow_send_enabled',
  'whatsapp_flow_commercial_write_enabled',
  'bling_order_sync_enabled',
  'writes_executed',
  'orders_created',
  'pii_returned'
]) assert.ok(sql.includes(needle),`missing ${needle}`);

assert.match(sql,/max_products_per_query[\s\S]*<=20/);
assert.match(sql,/candidate_not_live/);
assert.match(sql,/customer_exposure/);
assert.match(sql,/default_for_new_sessions/);
assert.match(sql,/interactive\.type=flow|native_flow_outbound/);
assert.match(sql,/manual_test_required/);
assert.match(sql,/security definer/);
assert.match(sql,/grant execute[\s\S]*service_role/);
assert.doesNotMatch(sql,/\b(insert|update|delete)\s+(into\s+)?public\./i);

console.log('OK Flow V42 terminal physical-test-plan contract');
