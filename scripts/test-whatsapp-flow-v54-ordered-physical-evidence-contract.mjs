import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260912012100_whatsapp_flow_v54_ordered_physical_terminal_evidence.sql','utf8');

const required = [
  'get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1',
  'get_whatsapp_flow_v54_homologation_control_plane_v1',
  "'UPSELL'",
  "'REVISAO'",
  "'CLIENTE_EXISTENTE','CLIENTE_NOVO','CLIENTE'",
  "'FINALIZAR','SUCCESS','COMPLETE'",
  "event_type='flow_nfm_reply'",
  "interface_type='whatsapp_flow'",
  "message_type,''))='location'",
  'm.created_at>v_nfm_at',
  'v_review_at>=v_upsell_at',
  'v_customer_at>=v_review_at',
  'v_finalize_at>=v_customer_at',
  'v_nfm_at>=v_finalize_at',
  'v_location_at>v_nfm_at',
  "'sequence_strict',true",
  "'writes_performed',false",
  "'safe_to_launch_owner_v8',false",
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v9',
  'revoke all on function public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1() from public, anon, authenticated',
  'grant execute on function public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1() to service_role'
];

for (const needle of required) {
  if (!sql.includes(needle)) throw new Error(`missing contract marker: ${needle}`);
}

const forbidden = [
  'update public.automation_config',
  'insert into public.orders',
  'insert into public.outbound_jobs',
  'insert into public.messages',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'experience_orchestrator_enabled=true',
  'bling_order_sync_enabled=true'
];
for (const needle of forbidden) {
  if (sql.toLowerCase().includes(needle.toLowerCase())) throw new Error(`forbidden mutation marker: ${needle}`);
}

console.log('ok - WhatsApp Flow V54 ordered physical evidence contract');
