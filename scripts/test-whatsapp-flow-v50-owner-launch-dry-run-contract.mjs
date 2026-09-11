import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260911212209_whatsapp_flow_v50_owner_launch_dry_run_v1.sql', 'utf8');

const required = [
  'get_whatsapp_flow_v49_physical_terminal_evidence_v1',
  "flow-cestas-comercial-v8-stable",
  "'type','flow'",
  'flow_message_version',
  'flow_token',
  'flow_id',
  'flow_cta',
  'flow_action',
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
  "'writes_performed',false",
  "'session_created',false",
  "'token_issued',false",
  "'outbound_created',false",
  "'message_created',false",
  "'order_created',false",
  "revoke all on function public.get_whatsapp_flow_v50_owner_launch_dry_run_v1() from public, anon, authenticated",
  "grant execute on function public.get_whatsapp_flow_v50_owner_launch_dry_run_v1() to service_role"
];

for (const marker of required) {
  if (!sql.includes(marker)) throw new Error(`missing V50 contract marker: ${marker}`);
}

if (/insert\s+into|update\s+public\.|delete\s+from/i.test(sql)) {
  throw new Error('V50 owner launch dry-run must stay read-only');
}

console.log('ok - WhatsApp Flow V50 owner launch dry-run contract');
