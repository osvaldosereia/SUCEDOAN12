import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath = 'supabase/migrations/20260911172252_whatsapp_flow_v47_terminal_contract_readiness_v1.sql';
assert.ok(fs.existsSync(migrationPath), `missing ${migrationPath}`);
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

for (const token of [
  'get_whatsapp_flow_v47_terminal_contract_readiness_v1',
  'get_whatsapp_flow_v46_terminal_regression_readiness_v1',
  'handle_whatsapp_flow_commercial_exchange_v26',
  'handle_whatsapp_flow_commercial_exchange_v25',
  'get_whatsapp_flow_session_recommendations_v1',
  'get_whatsapp_checkout_contact_v1',
  'cliente_existente',
  'cliente_novo',
  'cartao_alimentacao',
  'finalize_whatsapp_flow_commercial_order_v1',
  'whatsapp_flow_commercial_write_disabled',
  'experience_orchestrator_disabled',
  'whatsapp_flow_data_exchange_disabled',
  'whatsapp_flow_send_disabled',
  'send_location_in_chat',
  'process_whatsapp_flow_nfm_reply_v1',
  'process_whatsapp_flow_nfm_reply_legacy_v1',
  'flow-cestas-comercial-v8-stable',
  'location_required',
  'whatsapp_live_canary_percent',
  'bling_order_sync_enabled',
]) assert.ok(sql.includes(token), `missing contract token: ${token}`);

assert.ok(sql.includes('continuar sem adicionar nada'), 'upsell must remain optional');
assert.ok(sql.includes('envie sua localização pelo whatsapp'), 'nfm_reply must request WhatsApp location after confirmed order');
assert.ok(sql.includes("coalesce(cfg.whatsapp_live_canary_percent,0)=1"), 'canary must remain at 1%');
assert.ok(sql.includes('not cfg.whatsapp_flow_commercial_write_enabled'), 'commercial writes must remain locked');
assert.ok(sql.includes('grant execute on function public.get_whatsapp_flow_v47_terminal_contract_readiness_v1'), 'service role grant missing');

console.log('ok - WhatsApp Flow V47 terminal contract readiness');
