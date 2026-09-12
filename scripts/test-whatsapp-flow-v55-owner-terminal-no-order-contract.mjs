import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260912022619_whatsapp_flow_v55_owner_terminal_no_order_homologation.sql','utf8');

const required = [
  'handle_whatsapp_flow_commercial_exchange_v26',
  'process_whatsapp_flow_nfm_reply_legacy_v1',
  'get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1',
  "'homologation_terminal_preview',true",
  "'homologation_terminal_no_order',true",
  "w.purpose='controlled_live_homologation'",
  "d.slug<>'flow-cestas-comercial-v8-stable'",
  "coalesce(a.whatsapp_live_canary_percent,0)<>1",
  'coalesce(a.experience_orchestrator_enabled,false)',
  'coalesce(a.whatsapp_flow_data_exchange_enabled,false)',
  'coalesce(a.whatsapp_flow_send_enabled,false)',
  'coalesce(a.whatsapp_flow_commercial_write_enabled,false)',
  'coalesce(a.bling_order_sync_enabled,false)',
  "v_payment not in ('pix','dinheiro','cartao_entrega','cartao_alimentacao')",
  "'screen','FINALIZAR'",
  "'write_enabled',false",
  "'homologation_no_order',true",
  "v_preview_at>now()-interval '2 hours'",
  "'location_required',((v_order_id is not null or v_homologation_no_order) and not v_duplicate)",
  "'has_confirmed_order',v_order_id is not null",
  "get_whatsapp_flow_intent_products_v1(v_intent,20)",
  'v_count<1 or v_count>20',
  "'full_catalog_loaded',false",
  "'commercial_truth','backend_deterministic'",
  'revoke all on function public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb) from public,anon,authenticated',
  'grant execute on function public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb) to service_role',
  'revoke all on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) from public,anon,authenticated',
  'grant execute on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) to service_role',
  'revoke all on function public.get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1() from public,anon,authenticated',
  'grant execute on function public.get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1() to service_role'
];

for (const needle of required) {
  if (!sql.includes(needle)) throw new Error(`missing V55 contract marker: ${needle}`);
}

const runtimeStart = sql.indexOf('create or replace function public.handle_whatsapp_flow_commercial_exchange_v26');
const runtimeEnd = sql.indexOf('create or replace function public.process_whatsapp_flow_nfm_reply_legacy_v1');
if (runtimeStart < 0 || runtimeEnd <= runtimeStart) throw new Error('unable to isolate V26 runtime');
const runtime = sql.slice(runtimeStart, runtimeEnd).toLowerCase();
for (const forbidden of ['finalize_whatsapp_flow_commercial_order_v1','confirm_cart_order_v2','insert into public.orders','insert into public.outbound_jobs','insert into public.messages']) {
  if (runtime.includes(forbidden)) throw new Error(`V55 owner terminal runtime must not perform real commercial write: ${forbidden}`);
}

const globallyForbidden = [
  'update public.automation_config',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'experience_orchestrator_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
];
for (const needle of globallyForbidden) {
  if (sql.toLowerCase().includes(needle.toLowerCase())) throw new Error(`forbidden V55 rollout mutation: ${needle}`);
}

console.log('ok - WhatsApp Flow V55 owner terminal no-order homologation contract');
