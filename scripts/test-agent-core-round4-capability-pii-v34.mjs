import fs from 'node:fs';

const path='supabase/migrations/20260910224731_dona_antonia_agent_core_round4_capability_pii_readiness_v34.sql';
const sql=fs.readFileSync(path,'utf8');
const must=(needle,label)=>{if(!sql.includes(needle))throw new Error(`V34 missing ${label}: ${needle}`)};
const mustNot=(needle,label)=>{if(sql.includes(needle))throw new Error(`V34 forbidden ${label}: ${needle}`)};

must('agent_core_schema_contains_pii_fields_v1','recursive_pii_detector');
must("jsonb_typeof(p_schema)='object'",'object_recursion');
must("jsonb_typeof(p_schema)='array'",'array_recursion');
must('get_agent_core_round4_checkout_transition_readiness_v1','checkout_readiness');
must("'pii_detection','recursive_schema_property_names_v1'",'detector_version');
must("'non_pii_semantic_arguments_allowed',true",'semantic_arguments_allowed');
must("'canonical_capability_argument_is_pii'",'capability_pii_assertion');
must("public.agent_core_schema_contains_pii_fields_v1(coalesce(input_schema,'{}'::jsonb))",'schema_detector_use');

mustNot('whatsapp_live_canary_percent=', 'canary_change');
mustNot('whatsapp_flow_send_enabled=', 'flow_send_change');
mustNot('whatsapp_flow_data_exchange_enabled=', 'flow_exchange_change');
mustNot('bling_order_sync_enabled=', 'bling_change');
mustNot("execution_mode='live'",'live_activation');

console.log('OK Agent Core Round 4 V34 capability PII readiness contract');
