import fs from 'node:fs';

const replay=fs.readFileSync('supabase/migrations/20260910171940_dona_antonia_agent_core_round4_safe_historical_replay_v1.sql','utf8').toLowerCase();
const must=(text,label)=>{if(!replay.includes(text.toLowerCase()))throw new Error(`missing:${label}`)};
const forbid=(text,label)=>{if(replay.includes(text.toLowerCase()))throw new Error(`forbidden:${label}`)};

must('is_agent_core_stateless_historical_replay_job_v1','safe_replay_classifier');
must("automation_cohort,'')<>'homologation'",'homologation_only');
must("j.created_at >= now()-interval '15 minutes'",'historical_only');
for(const action of ['search','show_baskets','basket_catalog_link','basket_storefront_link','basket_selected_followup','basket_list_fallback','basket_choice_flow','whatsapp_flow_baskets','greeting']) must(`'${action}'`,`safe_action_${action}`);
must('historical_stateful_replay_blocked','stateful_block');
must('authorized_homologation_historical_replay','historical_authorization_reason');
must("c.mode='human'",'neutralize_current_human_mode');
must("created_at<m.created_at",'history_anchored_before_message');
must("'mode','ai'",'historical_neutral_ai_mode');
must("'customer',jsonb_build_object('registered',false,'has_address',false)",'historical_customer_neutral');
must("'cart',jsonb_build_object('exists',false",'historical_cart_neutral');
must("'sales_state','{}'::jsonb",'historical_sales_state_neutral');
must("'historical_replay_context',true",'historical_context_marker');
must("'historical_state_neutral',true",'historical_state_marker');
must('get_agent_core_round4_historical_replay_readiness_v1','replay_readiness');
must("'stateful_replay_blocked',true",'readiness_stateful_block');
must('revoke all on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) from public,anon,authenticated','eligibility_private');
must('grant execute on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) to service_role','eligibility_service_role');

for(const unsafe of [
  'whatsapp_live_canary_percent=100',
  'experience_orchestrator_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]) forbid(unsafe,unsafe);

console.log('Agent Core safe historical replay contract OK: homologation-only, stateless-only, state-neutral and service-role restricted.');
