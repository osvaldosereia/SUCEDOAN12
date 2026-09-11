import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260911221750_whatsapp_flow_v51_owner_launch_runtime_v26.sql', 'utf8');

const required = [
  'get_whatsapp_flow_owner_homologation_preflight_v5',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v8',
  'get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1',
  "flow-cestas-comercial-v8-stable",
  "handle_whatsapp_flow_commercial_exchange_v26",
  "'v26'",
  'edge_version',
  '49',
  'max_products_per_query',
  'never_load_full_catalog',
  'full_catalog_load_forbidden',
  'ai_catalog_authoritative',
  'component_prices_visible',
  'whatsapp_live_canary_percent',
  'experience_orchestrator_enabled',
  'whatsapp_flow_data_exchange_enabled',
  'whatsapp_flow_send_enabled',
  'whatsapp_flow_commercial_write_enabled',
  'bling_order_sync_enabled',
  "purpose='controlled_live_homologation'",
  'service_window_expires_at>now()',
  "h.status in ('open','claimed')",
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v2',
  "'dispatch_version','v8-runtime-v26-edge49'",
  "'writes_performed',false",
  "'physical_send_performed',false",
  'revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v5(uuid) from public,anon,authenticated',
  'revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text) from public,anon,authenticated',
  'revoke all on function public.get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1() from public,anon,authenticated'
];

for (const marker of required) {
  if (!sql.includes(marker)) throw new Error(`missing V51 contract marker: ${marker}`);
}

if (!sql.includes("grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text) to service_role")) {
  throw new Error('V51 owner dispatch must remain service-role-only');
}

console.log('ok - WhatsApp Flow V51 owner launch runtime contract');
