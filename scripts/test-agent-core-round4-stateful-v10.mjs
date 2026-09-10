import fs from 'node:fs';

const v9=fs.readFileSync('supabase/migrations/20260910185912_dona_antonia_agent_core_round4_stateful_preconditions_v9.sql','utf8').toLowerCase();
const v10=fs.readFileSync('supabase/migrations/20260910190016_dona_antonia_agent_core_round4_stateful_preconditions_hardening_v10.sql','utf8').toLowerCase();
const v11=fs.readFileSync('supabase/migrations/20260910191049_dona_antonia_agent_core_round4_stateful_transition_gate_v11.sql','utf8').toLowerCase();
const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8').toLowerCase();

const must=(body,s,label)=>{if(!body.includes(s.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,s,label)=>{if(body.includes(s.toLowerCase()))throw new Error(`forbidden:${label}`)};

must(v9,'evaluate_whatsapp_agent_action_preconditions_v1','precondition_evaluator');
must(v9,'preview_whatsapp_agent_action_v2','stateful_preview_v2');
must(v9,'get_agent_core_round4_stateful_precondition_readiness_v1','stateful_readiness');
must(v9,"'all_stateful_still_observe'",'stateful_observe_gate');
must(v9,"'pii_returned',false",'precondition_no_pii_contract');

const preconditions=[
  'address_change_requested','address_flow_pending','basket_active','basket_checkout_ready','basket_exists',
  'basket_session_active','basket_valid','cart_item_exists','cart_valid','checkout_customer_data_requested',
  'current_message_present','customer_valid','explicit_customer_confirmation','locator_requested','payment_method_valid',
  'product_validated','replacement_validated','source_product_in_basket','valid_address'
];
for(const p of preconditions){
  must(v9,`'${p}'`,`declared_precondition_${p}`);
  must(v10,`'${p}'`,`hardened_precondition_${p}`);
}

must(v10,'v_uuid_pattern','uuid_guard');
must(v10,"coalesce(p_input->>'quantity','') ~ '^[0-9]+([.][0-9]+)?$'",'quantity_regex_guard');
must(v10,"lower(coalesce(p_input->>'customer_confirmed','')) in ('true','false')",'boolean_guard');
must(v10,"coalesce(v_quantity,0)>0",'validated_quantity_use');
must(v10,'v_base_basket_id is not null','basket_id_guard');
mustNot(v10,"coalesce((p_input->>'quantity')::numeric",'unsafe_quantity_cast');
mustNot(v10,"coalesce((p_input->>'customer_confirmed')::boolean",'unsafe_boolean_cast');

must(v11,'get_agent_core_round4_stateful_transition_readiness_v1','stateful_transition_gate');
must(v11,'get_agent_core_round4_consolidated_readiness_v8','consolidated_v8');
must(v11,"cfg.execution_mode='observe'",'transition_requires_observe');
must(v11,"cfg.legacy_router_policy='shadow'",'transition_requires_shadow_policy');
must(v11,"'manual_authorization_required',true",'manual_authorization_gate');
must(v11,"'stateful_execution_permitted_now',false",'stateful_execution_off');
must(v11,"'future_homologation_ready'",'future_homologation_readiness');
must(v11,"stateful_non_observe=0",'all_stateful_actions_observe');
must(v11,"'global_retirement_ready',false",'global_retirement_forced_off');
must(v11,"'retirement_execution_permitted',false",'retirement_execution_forced_off');

must(edge,'preview_whatsapp_agent_action_v2','edge_uses_preview_v2');
must(edge,'p_message_id:job.message_id','edge_passes_current_message');
mustNot(edge,'sb.rpc("preview_whatsapp_agent_action_v1"','edge_must_not_call_preview_v1_directly');
must(edge,'risk==="read_only"','only_read_tools_execute');
must(edge,'observe_no_side_effects','stateful_shadow_simulation');
for(const implementation of [
  'create_whatsapp_basket_replacement_session_v1',
  'start_whatsapp_basket_checkout_v2',
  'finalize_whatsapp_basket_order_request_v2',
  'parse_and_save_whatsapp_customer_base_v1',
  'set_whatsapp_locator_v1'
]) mustNot(edge,implementation,`edge_must_not_execute_${implementation}`);

for(const unsafe of [
  'whatsapp_live_canary_percent=100',
  'whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]){
  mustNot(v9+v10+v11+edge,unsafe,`unsafe_rollout_change_${unsafe}`);
}

console.log('Agent Core Round 4 stateful V11 OK: 19 preconditions, hardened inputs, observe-only execution and transition gates are protected.');
