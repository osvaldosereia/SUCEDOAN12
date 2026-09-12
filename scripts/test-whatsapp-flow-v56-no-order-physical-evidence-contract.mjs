import fs from 'node:fs';

const sql = fs.readFileSync(
  'supabase/migrations/20260912032000_whatsapp_flow_v56_no_order_physical_evidence.sql',
  'utf8'
);

const required = [
  'get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1',
  'get_whatsapp_flow_v56_homologation_control_plane_v1',
  "'homologation_terminal_no_order'",
  "'homologation_no_order'",
  "'has_confirmed_order'",
  "'flow_order_id'",
  "'nfm_reply_no_order_after_finalize'",
  "'location_strictly_after_no_order_nfm'",
  "'terminal_no_order_sequence_ordered'",
  "'UPSELL'",
  "'REVISAO'",
  "'CLIENTE_EXISTENTE|CLIENTE_NOVO'",
  "'FINALIZAR_NO_ORDER'",
  "'nfm_reply_no_order'",
  "'location'",
  "'safe_to_launch_owner_v8',false",
  "'physical_requires_no_order_proof',true",
  "'v56-no-order-terminal-evidence'",
  'writes_performed',
  'revoke all on function public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1() from public, anon, authenticated',
  'grant execute on function public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1() to service_role',
  'revoke all on function public.get_whatsapp_flow_v56_homologation_control_plane_v1() from public, anon, authenticated',
  'grant execute on function public.get_whatsapp_flow_v56_homologation_control_plane_v1() to service_role'
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`V56 contract missing required token: ${token}`);
  }
}

const forbidden = [
  'insert into public.orders',
  'insert into public.messages',
  'insert into public.outbound_jobs',
  'update public.orders',
  'delete from public.orders',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'experience_orchestrator_enabled=true',
  'bling_order_sync_enabled=true'
];

const lower = sql.toLowerCase();
for (const token of forbidden) {
  if (lower.includes(token)) {
    throw new Error(`V56 contract contains forbidden write/rollout token: ${token}`);
  }
}

console.log('V56 no-order physical evidence contract: PASS');
