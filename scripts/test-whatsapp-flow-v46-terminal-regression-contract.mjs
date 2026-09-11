import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath = 'supabase/migrations/20260911162500_whatsapp_flow_v46_terminal_regression_readiness_v1.sql';
assert.ok(fs.existsSync(migrationPath), `missing ${migrationPath}`);
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

for (const token of [
  'get_whatsapp_flow_v46_terminal_regression_readiness_v1',
  'get_whatsapp_flow_v45_runtime_v26_readiness_v1',
  'data-exchange-v26',
  'handle_whatsapp_flow_commercial_exchange_v26',
  'runtime_edge_version',
  'max_products_per_query',
  'never_load_full_catalog',
  'component_prices_visible',
  'finalize_whatsapp_flow_commercial_order_v1',
  'process_whatsapp_flow_nfm_reply_v1',
  'whatsapp_checkout_locator_followup_outbound_v1',
  'dispatch_whatsapp_flow_outbound_job_v1',
  'whatsapp_live_canary_percent',
  'experience_orchestrator_enabled',
  'whatsapp_flow_data_exchange_enabled',
  'whatsapp_flow_send_enabled',
  'whatsapp_flow_commercial_write_enabled',
  'bling_order_sync_enabled',
]) assert.ok(sql.includes(token), `missing contract token: ${token}`);

assert.ok(!sql.includes("='v25'"), 'V46 must not require stale handler v25');
assert.ok(!sql.includes('=48'), 'V46 must not require stale Edge 48');
assert.ok(sql.includes('<=20'), 'catalog subset must remain bounded to 20');
assert.ok(sql.includes('grant execute on function public.get_whatsapp_flow_v46_terminal_regression_readiness_v1'), 'service role grant missing');

console.log('ok - WhatsApp Flow V46 terminal regression contract');
