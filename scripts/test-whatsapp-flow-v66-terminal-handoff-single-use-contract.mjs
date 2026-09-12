import fs from 'node:fs';

const migration='supabase/migrations/20260912123000_whatsapp_flow_v66_terminal_handoff_single_use.sql';
const sql=fs.readFileSync(migration,'utf8');
const mustInclude=[
  'homologation_terminal_nfm_consumed',
  'homologation_terminal_nfm_consumed_at',
  'homologation_terminal_nfm_message_id',
  'no_order_handoff_already_consumed',
  "not v_no_order_consumed",
  "whatsapp_live_canary_percent,0)=1",
  'not coalesce(a.experience_orchestrator_enabled,false)',
  'not coalesce(a.whatsapp_flow_data_exchange_enabled,false)',
  'not coalesce(a.whatsapp_flow_send_enabled,false)',
  'not coalesce(a.whatsapp_flow_commercial_write_enabled,false)',
  'not coalesce(a.bling_order_sync_enabled,false)',
  "revoke all on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) from public,anon,authenticated",
  'get_whatsapp_flow_v66_terminal_handoff_readiness_v1'
];
for(const token of mustInclude){
  if(!sql.includes(token)) throw new Error(`V66 contract missing: ${token}`);
}
if(sql.includes('whatsapp_flow_send_enabled=true') || sql.includes('whatsapp_flow_data_exchange_enabled=true')){
  throw new Error('V66 must not open Flow rollout gates');
}
console.log(`V66 terminal handoff contract OK (${mustInclude.length} invariants)`);
