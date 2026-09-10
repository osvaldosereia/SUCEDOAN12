import fs from 'node:fs';

const v20=fs.readFileSync('supabase/migrations/20260910202610_dona_antonia_agent_core_round4_pre_router_shadow_packet_v20.sql','utf8').toLowerCase();
const v21=fs.readFileSync('supabase/migrations/20260910202712_dona_antonia_agent_core_round4_shadow_eligibility_bridge_v21.sql','utf8').toLowerCase();
const v22=fs.readFileSync('supabase/migrations/20260910202748_dona_antonia_agent_core_round4_packet_v2_bridge_v22.sql','utf8').toLowerCase();
const v23=fs.readFileSync('supabase/migrations/20260910203052_dona_antonia_agent_core_round4_action_tool_parity_v23.sql','utf8').toLowerCase();
const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8').toLowerCase();
const must=(body,s,label)=>{if(!body.includes(s.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,s,label)=>{if(body.includes(s.toLowerCase()))throw new Error(`forbidden:${label}`)};

must(v20,'build_whatsapp_agent_core_packet_v2','packet_v2');
must(v20,"coalesce(c.automation_cohort,'')<>'homologation'",'snapshot_homologation_only');
must(v20,'fast_checkout','snapshot_fast_checkout');
must(v20,'upsell_declined','snapshot_upsell_declined');
must(v20,"'pre_router_snapshot_contains_pii',false",'packet_no_pii');
must(v20,"new.status='held' and new.error_message='deterministic_greeting_fastpath'",'greeting_postprocess');
must(v20,"v_greeting_held and (p_replay or coalesce(c.automation_cohort,'')<>'homologation')",'greeting_homologation_only');

must(v21,'is_whatsapp_agent_core_shadow_eligible_v2(p_job_id,p_replay)','eligibility_bridge');
must(v22,'rename to build_whatsapp_agent_core_packet_base_v1','frozen_base');
must(v22,'select public.build_whatsapp_agent_core_packet_v2(p_conversation_id,p_message_id)','packet_bridge');
must(v22,"'write_execution_permitted',false",'packet_bridge_no_write');

must(v23,'start_whatsapp_order_checkout_agent_v1','standalone_checkout_backend');
must(v23,"'wa_start_order_checkout'",'standalone_checkout_tool');
must(v23,'create table if not exists public.agent_core_router_action_contracts','action_contract_table');
must(v23,'get_agent_core_round4_action_tool_parity_v1','action_parity_report');
must(v23,"'minimum_alignment_rate',0.95",'alignment_threshold');
must(v23,"'historical_backfill_allowed',false",'no_historical_backfill');
must(v23,"'execution_authorized',false",'execution_not_authorized');
must(v23,"'retirement_authorized',false",'retirement_not_authorized');
must(v23,"'edge_allowlist_pending':true",'v23_edge_pending');
must(v23,"'executor_mapping_pending':true",'v23_executor_pending');
const mapped=(v23.match(/\('\w[^\n]*?,'route_|\('ab_whatsapp_checkout_flow_v1'|\('aa_whatsapp_sales_greeting_fastpath'|\('trg_/g)||[]).length;
if(mapped<38)throw new Error(`missing:expected_38_action_contracts_found_${mapped}`);

must(edge,'"wa_start_order_checkout"','edge_selects_standalone_checkout');
must(edge,'para checkout de produtos avulsos, use wa_start_order_checkout','standalone_checkout_prompt_guard');
must(edge,'risk==="read_only"','only_read_tools_execute');
must(edge,'observe_no_side_effects','writes_simulated');
mustNot(edge,'start_whatsapp_order_checkout_agent_v1','edge_must_not_execute_standalone_checkout_write');

for(const unsafe of [
  'whatsapp_live_canary_percent=100','whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true','whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true','whatsapp_flow_commercial_write_enabled=true','bling_order_sync_enabled=true'
]) mustNot(v20+v21+v22+v23+edge,unsafe,`unsafe_${unsafe}`);

console.log('Agent Core Round 4 V23 OK: pre-router state is authoritative for shadow, 38 action contracts are mapped, standalone checkout is selectable, and writes remain simulated.');