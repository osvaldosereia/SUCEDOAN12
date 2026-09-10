import fs from 'node:fs';

const path='supabase/migrations/20260910223656_dona_antonia_agent_core_round4_customer_data_and_address_semantics_v32.sql';
const sql=fs.readFileSync(path,'utf8');
const must=(needle,label)=>{if(!sql.includes(needle))throw new Error(`V32 missing ${label}: ${needle}`)};
const mustNot=(needle,label)=>{if(sql.includes(needle))throw new Error(`V32 forbidden ${label}: ${needle}`)};

must('is_whatsapp_customer_data_change_request_v1','customer_change_detector');
must("da_basket_customer_change","structured_customer_change_id");
must("return 'checkout'","checkout_topic_normalization");
must('evaluate_whatsapp_agent_action_preconditions_v3','precondition_v3');
must("p_action_key='wa_save_checkout_customer_data'",'customer_data_tool_gate');
must('handle_whatsapp_checkout_customer_data_agent_v2','customer_data_backend_wrapper');
must("address_change_is_separate_tool",'address_customer_data_separation');
must("public.is_whatsapp_address_change_request_v1(new.conversation_id,m.id)",'basket_swap_address_exclusion');
must("public.is_whatsapp_customer_data_change_request_v1(new.conversation_id,m.id)",'basket_swap_customer_data_exclusion');
must("execution_mode",'registry_keeps_governed_tool_contract');
must("'pii_returned',false",'no_pii_report');

mustNot('whatsapp_live_canary_percent=', 'canary_change');
mustNot('experience_orchestrator_enabled=', 'orchestrator_activation');
mustNot('whatsapp_flow_send_enabled=', 'flow_send_activation');
mustNot('whatsapp_flow_data_exchange_enabled=', 'flow_exchange_activation');
mustNot('whatsapp_flow_commercial_write_enabled=', 'flow_write_activation');
mustNot('bling_order_sync_enabled=', 'bling_activation');

console.log('OK Agent Core Round 4 V32 customer-data/address semantics contract');
