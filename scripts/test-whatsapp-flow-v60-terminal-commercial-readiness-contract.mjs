import fs from 'node:fs';

const path = new URL('../supabase/migrations/20260912072400_whatsapp_flow_v60_terminal_commercial_readiness_v1.sql', import.meta.url);
const sql = fs.readFileSync(path, 'utf8');

const required = [
  'get_whatsapp_flow_v60_terminal_commercial_readiness_v1',
  'get_whatsapp_flow_v59_dynamic_search_quality_v1',
  'get_whatsapp_flow_v35_session_upsell_readiness_v1',
  'handle_whatsapp_flow_commercial_exchange_v26',
  'handle_whatsapp_flow_commercial_exchange_v25',
  'get_whatsapp_flow_session_recommendations_v1',
  'homologation_terminal_no_order',
  "coalesce((d.config->>'upsell_after_extras')::boolean,false)",
  "coalesce((d.config->>'upsell_optional')::boolean,false)",
  "coalesce((d.config->>'customer_prefill')::boolean,false)",
  "coalesce((d.config->>'payment_on_delivery_only')::boolean,false)",
  "not coalesce((d.config->>'component_prices_visible')::boolean,true)",
  "coalesce((d.config->>'max_products_per_query')::int,999)=20",
  'whatsapp_live_canary_percent',
  'whatsapp_flow_data_exchange_enabled',
  'whatsapp_flow_send_enabled',
  'whatsapp_flow_commercial_write_enabled',
  'bling_order_sync_enabled',
  'writes_performed',
  'revoke all on function public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1() from public,anon,authenticated',
  'grant execute on function public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1() to service_role'
];

for (const token of required) {
  if (!sql.includes(token)) throw new Error(`V60 contract missing: ${token}`);
}

const forbidden = [
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
];
for (const token of forbidden) {
  if (sql.includes(token)) throw new Error(`V60 contract contains forbidden gate opening: ${token}`);
}

console.log('V60 terminal commercial readiness contract: OK');
