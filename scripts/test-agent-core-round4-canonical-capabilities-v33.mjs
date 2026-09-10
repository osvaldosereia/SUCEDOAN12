import fs from 'node:fs';

const path='supabase/migrations/20260910224428_dona_antonia_agent_core_round4_canonical_capabilities_v33.sql';
const sql=fs.readFileSync(path,'utf8');
const must=(needle,label)=>{if(!sql.includes(needle))throw new Error(`V33 missing ${label}: ${needle}`)};
const mustNot=(needle,label)=>{if(sql.includes(needle))throw new Error(`V33 forbidden ${label}: ${needle}`)};

must('is_agent_core_tool_capability_valid_v1','capability_validator');
must('change_delivery_address','address_capability');
must('edit_checkout_customer_data','edit_customer_capability');
must('process_checkout_customer_data','process_customer_capability');
must('evaluate_whatsapp_agent_action_preconditions_v4','precondition_v4');
must("'canonical_capability_invalid'",'invalid_capability_fail_closed');
must("'semantic_conflict_customer_data'",'customer_conflict_guard');
must("'semantic_conflict_delivery_address'",'address_conflict_guard');
must("'model_is_execution_authority',false",'model_not_authority');
must("'phrase_enumeration_required',false",'no_phrase_enumeration');
must("'extra_model_call_required',false",'no_extra_model_call');
must("'structured_interaction_overrides_model',true",'structured_signal_precedence');
must('get_agent_core_round4_canonical_capability_readiness_v1','readiness');
must('get_agent_core_round4_consolidated_readiness_v19','consolidated_v19');
must("addr.execution_mode='observe'",'address_observe_guard');
must("cust.execution_mode='observe'",'customer_observe_guard');
must("cfg.execution_mode='observe'",'agent_observe_guard');
must("'stateful_execution_permitted_now',false",'no_stateful_execution');
must("'retirement_execution_permitted',false",'no_retirement');

mustNot('whatsapp_live_canary_percent=', 'canary_change');
mustNot('experience_orchestrator_enabled=', 'orchestrator_activation');
mustNot('whatsapp_flow_send_enabled=', 'flow_send_activation');
mustNot('whatsapp_flow_data_exchange_enabled=', 'flow_exchange_activation');
mustNot('whatsapp_flow_commercial_write_enabled=', 'flow_write_activation');
mustNot('bling_order_sync_enabled=', 'bling_activation');
mustNot("execution_mode='live'",'live_mode');

console.log('OK Agent Core Round 4 V33 canonical capability contract');
