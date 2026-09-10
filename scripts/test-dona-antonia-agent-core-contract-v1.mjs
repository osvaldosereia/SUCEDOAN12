import fs from 'node:fs';

const foundation=fs.readFileSync('supabase/migrations/20260910134400_dona_antonia_agent_core_foundation_v1.sql','utf8');
const observe=fs.readFileSync('supabase/migrations/20260910135500_dona_antonia_agent_core_observe_v1.sql','utf8');
const hook=fs.readFileSync('supabase/migrations/20260910140200_dona_antonia_agent_core_shadow_hook_v1.sql','utf8');
const round2=fs.readFileSync('supabase/migrations/20260910142000_dona_antonia_agent_core_round2_shadow_v1.sql','utf8');
const report=fs.readFileSync('supabase/migrations/20260910143500_dona_antonia_agent_core_round2_report_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8');
const roadmap=fs.readFileSync('docs/ROADMAP-AGENT-CORE-DONA-ANTONIA-6-RODADAS.md','utf8');
const allSql=(foundation+'\n'+observe+'\n'+hook+'\n'+round2+'\n'+report).toLowerCase();
const edgeLower=edge.toLowerCase();
const roadmapLower=roadmap.toLowerCase();

const must=(body,text,label)=>{if(!body.includes(text))throw new Error(`missing:${label}`)};
const mustLower=(body,text,label)=>must(body.toLowerCase(),text.toLowerCase(),label);

must(foundation,"execution_mode text not null default 'observe'",'observe_default');
must(foundation,"legacy_router_policy text not null default 'shadow'",'legacy_shadow');
must(foundation,"prompt_cache_ttl text not null default '30m'",'prompt_cache_ttl');
must(foundation,'get_service_intelligence_compact_v3','intelligence_v3');
must(foundation,'build_whatsapp_agent_core_packet_v1','agent_packet');
// V1 continua sendo a policy-base no banco; a Edge moderna chama V2, que adiciona preconditions stateful e delega a V1.
must(foundation,'preview_whatsapp_agent_action_v1','tool_policy_preview_base');
must(foundation,'human_handoff_precedence','handoff_precedence');
must(foundation,'explicit_confirmation_for_commitments','commitment_confirmation');
must(foundation,'counter_verified','catalog_truth');
must(observe,'observe_whatsapp_agent_core_turn_v1','shadow_observer');
must(observe,'get_whatsapp_agent_core_readiness_v1','readiness');
must(observe,"'prompt_stored',false",'no_prompt_storage');
must(observe,'legacy_before_insert_router_count','router_inventory');
must(hook,'trg_agent_core_shadow_observe_ai_job_v1','shadow_observer_hook');
must(hook,'exception when others','shadow_observer_fail_open');
must(hook,"when (new.status='done')",'shadow_observer_done_only');

const tools=[
 'wa_search_products','wa_get_product','wa_get_cart','wa_list_baskets','wa_get_policy',
 'wa_get_recommendations','wa_add_product','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_handoff_human'
];
for(const tool of tools) must(foundation,`'${tool}'`,tool);

// Rodada 2: OpenAI shadow precisa continuar isolado, limitado e sem writes comerciais.
must(round2,"execution_mode<>'observe'",'round2_observe_only');
must(round2,'shadow_max_runs_per_hour','shadow_hourly_cap');
must(round2,'human_handoff_precedence','round2_handoff_precedence');
must(round2,'agent_core_webhook_v1','dedicated_shadow_secret');
must(round2,'trg_agent_core_shadow_dispatch_ai_job_v1','round2_dispatch_hook');
must(round2,'get_agent_core_round2_readiness_v1','round2_readiness');
must(round2,'agent_core_tool_calls','tool_trace');
must(report,'get_agent_core_round2_report_v1','round2_report');
must(report,'unsafe_write_executions','unsafe_write_metric');
must(report,'shadow_only','shadow_only_metric');

must(edge,'https://api.openai.com/v1/responses','responses_api');
must(edge,'store:false','provider_store_disabled');
must(edge,'prompt_cache_key','prompt_cache_key');
must(edge,'prompt_cache_options','prompt_cache_options');
must(edge,'strict:true','strict_function_tools');
must(edge,'custom_tool_call_limit_reached','custom_tool_budget');
must(edge,'critic_attempted_tool_call','terra_no_tools_guard');
must(edge,'risk==="read_only"','read_only_execution_only');
must(edge,'observe_no_side_effects','write_simulation_in_observe');
must(edge,'secondary_intents','multi_intent_support');
must(edge,'reused_same_turn','same_turn_tool_reuse');
must(edge,'preview_whatsapp_agent_action_v2','policy_before_tool');
must(edge,'p_message_id:job.message_id','policy_uses_current_message');
must(edge,'gpt-5.6-luna','luna_default');
must(edge,'gpt-5.6-terra','terra_critic');
must(edge,'Handoff humano tem precedência absoluta','kernel_handoff_precedence');
must(edge,'Cestas têm preço comercial próprio','basket_price_rule');

for(const forbiddenEdge of [
 '.from("outbound_jobs")',
 'queue_whatsapp_sales_reply_v1',
 'confirm_whatsapp_sales_order_v1",{',
 'add_whatsapp_sales_product_v1",{',
 'set_whatsapp_sales_product_quantity_v1",{',
 'replace_whatsapp_sales_product_v1",{',
 'queue_human_handoff_v1",{'
]) if(edge.includes(forbiddenEdge)) throw new Error(`shadow_side_effect_path:${forbiddenEdge}`);

for(const forbidden of [
 'whatsapp_live_canary_percent=100',
 'experience_orchestrator_enabled=true',
 'whatsapp_flow_data_exchange_enabled=true',
 'whatsapp_flow_send_enabled=true',
 'bling_order_sync_enabled=true'
]) if(allSql.includes(forbidden)) throw new Error(`forbidden_rollout:${forbidden}`);

mustLower(allSql,'revoke all on public.agent_core_runtime_config from public, anon, authenticated','runtime_config_server_only');
mustLower(allSql,'revoke all on public.agent_core_turns from public, anon, authenticated','turns_server_only');
mustLower(allSql,'revoke all on public.agent_core_tool_calls from public,anon,authenticated','tool_calls_server_only');

for(let i=1;i<=6;i++) mustLower(roadmapLower,`## Rodada ${i}`,`round${i}`);
mustLower(roadmapLower,'não aumentar canary acima de 1%','rollout_guard');

console.log(`Agent Core contract OK: ${tools.length} governed WhatsApp tools; Responses API shadow, cache, Luna/Terra critic, preview V2 state guard, read-only execution, no-side-effect writes and rollout guards verified.`);
