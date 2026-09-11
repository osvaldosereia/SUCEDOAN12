import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260911011500_dona_antonia_agent_core_packet_v4_topic_v6_v51.sql','utf8');
const core=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8');
const evaluator=fs.readFileSync('supabase/functions/dona-antonia-agent-eval-v1/index.ts','utf8');
const harness=fs.readFileSync('scripts/test-agent-eval-harness-v1.mjs','utf8');

const must=(src,needle,label)=>{if(!src.includes(needle))throw new Error(`V51 missing ${label}: ${needle}`)};
const mustNot=(src,needle,label)=>{if(src.includes(needle))throw new Error(`V51 forbidden ${label}: ${needle}`)};

must(migration,'create or replace function public.resolve_whatsapp_agent_core_topic_v6','topic resolver v6');
must(migration,'create or replace function public.build_whatsapp_agent_core_packet_v4','packet v4');
must(migration,"'da_basket_change_address','da_basket_customer_change'",'structured address/customer IDs');
must(migration,"(alterar|mudar|corrigir|atualizar|trocar)",'natural address semantic guard');
must(migration,"v_packet:=public.build_whatsapp_agent_core_packet_v3",'V3 order/pre-router inheritance');
must(migration,"'packet_version',4",'packet metadata version');
must(migration,"'pii_added_by_v4',false",'no new PII marker');
must(migration,"'rollout_changed',false",'no rollout change readiness marker');

must(core,'sb.rpc("build_whatsapp_agent_core_packet_v4",','production uses packet v4');
mustNot(core,'sb.rpc("build_whatsapp_agent_core_packet_v1",','production no longer plans from packet v1');
must(evaluator,'resolve_whatsapp_agent_core_topic_v6','evaluator uses resolver v6');
must(harness,"must(ev,'resolve_whatsapp_agent_core_topic_v6','same topic resolver');",'harness expects resolver v6');

for(const forbidden of [
  'whatsapp_live_canary_percent=',
  'whatsapp_flow_send_enabled=',
  'whatsapp_flow_data_exchange_enabled=',
  'whatsapp_flow_commercial_write_enabled=',
  'bling_order_sync_enabled=',
  "execution_mode='live'",
  'stateful_execution_permitted_now=true',
  'retirement_execution_permitted=true'
]) mustNot(migration,forbidden,`gate mutation ${forbidden}`);

console.log('OK Round 4 V51 canonical packet/topic contract');
