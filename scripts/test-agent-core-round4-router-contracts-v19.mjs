import fs from 'node:fs';

const v17=fs.readFileSync('supabase/migrations/20260910195654_dona_antonia_whatsapp_delivery_promise_wording_guard_v17.sql','utf8').toLowerCase();
const v18=fs.readFileSync('supabase/migrations/20260910195743_dona_antonia_agent_core_round4_blocked_router_contracts_v18.sql','utf8').toLowerCase();
const v19=fs.readFileSync('supabase/migrations/20260910200112_dona_antonia_agent_core_round4_missing_router_tools_v19.sql','utf8').toLowerCase();
const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8').toLowerCase();

const must=(body,s,label)=>{if(!body.includes(s.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,s,label)=>{if(body.includes(s.toLowerCase()))throw new Error(`forbidden:${label}`)};

// V17: prazo é previsão, nunca promessa rígida.
must(v17,'têm previsão de entrega no mesmo dia','same_day_is_prediction');
must(v17,'têm previsão de entrega no próximo dia útil','next_day_is_prediction');
must(v17,'o horário depende da rota e do bairro','route_dependency');
must(v17,'delivery promise wording drift','wording_drift_guard');
must(v17,'replace(replace(v_def','guarded_function_rewrite');

// V18: todos os routers bloqueados possuem contrato mensurável e continuam sem autorização de corte.
must(v18,'get_agent_core_round4_blocked_router_contract_readiness_v1','blocked_router_readiness');
must(v18,'get_agent_core_round4_consolidated_readiness_v13','consolidated_v13');
for(const trigger of [
  'aa_whatsapp_sales_greeting_fastpath',
  'aaa_whatsapp_basket_payment_checkout_v1',
  'ab_whatsapp_checkout_flow_v1',
  'trg_001_whatsapp_basket_fallback_v1',
  'trg_00_route_whatsapp_basket_swap_v1',
  'trg_01_whatsapp_basket_personalization_choice_v1',
  'trg_route_whatsapp_basic_sales_ai_job_v1',
  'trg_whatsapp_sales_multi_search_cta_v1'
]) must(v18,trigger,`router_contract_${trigger}`);
for(const tool of ['wa_link_customer_identity','wa_open_basket_storefront','wa_create_search_showcase']) must(v18,tool,`required_tool_${tool}`);
must(v18,"'historical_backfill_allowed',false",'no_stateful_backfill');
must(v18,"'execution_authorized',false",'execution_not_authorized');
must(v18,"'retirement_authorized',false",'retirement_not_authorized');
must(v18,"'can_disable_now',false",'router_disable_forced_off');
must(v18,"'minimum_router_samples',min_router_samples",'router_sample_threshold_reported');
must(v18,"array['greeting']::text[],3",'minimum_three_greeting_samples');

// V19: três lacunas viram tools governadas, todas observe-only e com saída minimizada.
for(const tool of ['wa_link_customer_identity','wa_open_basket_storefront','wa_create_search_showcase']) must(v19,`'${tool}'`, `registered_${tool}`);
must(v19,'link_whatsapp_customer_identity_compact_v1','identity_compact_impl');
must(v19,'queue_whatsapp_basket_storefront_link_agent_v1','storefront_impl');
must(v19,'queue_whatsapp_search_showcase_agent_v1','search_showcase_impl');
must(v19,"'display_name_available'",'identity_no_name_value');
mustNot(v19,"'person_name',v_ident->>",'identity_must_not_return_name');
mustNot(v19,"'phone',v_ident->>",'identity_must_not_return_phone');
mustNot(v19,"'address',v_ident->>",'identity_must_not_return_address');
must(v19,'"session_token_hidden_from_model":true','storefront_token_hidden');
must(v19,'"max_showcases_per_call":1','single_extra_showcase');
must(v19,"true,'observe',true",'observe_only_registry_entries');
must(v19,"'reversible_write',false",'new_tools_are_non_autorun_reversible_writes');

// Edge: tools podem ser escolhidas em shadow, mas jamais executadas como write nesta versão.
must(edge,'greeting:["wa_link_customer_identity","wa_handoff_human"]','greeting_tool_exposure');
must(edge,'"wa_open_basket_storefront"','storefront_tool_exposure');
must(edge,'"wa_create_search_showcase"','showcase_tool_exposure');
must(edge,'para múltiplas buscas de produto, proponha no máximo uma vitrine adicional no turno','single_showcase_prompt_guard');
must(edge,'risk==="read_only"','only_read_tools_execute');
must(edge,'observe_no_side_effects','stateful_tools_simulated');
for(const implementation of [
  'link_whatsapp_customer_identity_compact_v1',
  'queue_whatsapp_basket_storefront_link_agent_v1',
  'queue_whatsapp_search_showcase_agent_v1'
]) mustNot(edge,implementation,`edge_must_not_execute_${implementation}`);

for(const unsafe of [
  'whatsapp_live_canary_percent=100',
  'whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]) mustNot(v17+v18+v19+edge,unsafe,`unsafe_rollout_change_${unsafe}`);

console.log('Agent Core Round 4 V19 OK: 8/8 router contracts are defined, missing tool surfaces are observe-only, and delivery wording is prediction-safe.');
