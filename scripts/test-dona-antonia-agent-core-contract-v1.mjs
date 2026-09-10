import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910134400_dona_antonia_agent_core_foundation_v1.sql','utf8');
const observe=fs.readFileSync('supabase/migrations/20260910135500_dona_antonia_agent_core_observe_v1.sql','utf8');
const hook=fs.readFileSync('supabase/migrations/20260910140200_dona_antonia_agent_core_shadow_hook_v1.sql','utf8');
const roadmap=fs.readFileSync('docs/ROADMAP-AGENT-CORE-DONA-ANTONIA-6-RODADAS.md','utf8');
const lower=(migration+'\n'+observe+'\n'+hook).toLowerCase();
const roadmapLower=roadmap.toLowerCase();

const must=(text,label)=>{if(!migration.includes(text))throw new Error(`missing:${label}`)};
const mustObserve=(text,label)=>{if(!observe.includes(text))throw new Error(`observe_missing:${label}`)};
const mustHook=(text,label)=>{if(!hook.includes(text))throw new Error(`hook_missing:${label}`)};
const mustRoadmap=(text,label)=>{if(!roadmapLower.includes(text.toLowerCase()))throw new Error(`roadmap_missing:${label}`)};

must("execution_mode text not null default 'observe'",'observe_default');
must("legacy_router_policy text not null default 'shadow'",'legacy_shadow');
must("prompt_cache_ttl text not null default '30m'",'prompt_cache_ttl');
must("get_service_intelligence_compact_v3",'intelligence_v3');
must("build_whatsapp_agent_core_packet_v1",'agent_packet');
must("preview_whatsapp_agent_action_v1",'tool_policy_preview');
must("human_handoff_precedence",'handoff_precedence');
must("explicit_confirmation_for_commitments",'commitment_confirmation');
must("counter_verified",'catalog_truth');
mustObserve('observe_whatsapp_agent_core_turn_v1','shadow_observer');
mustObserve('get_whatsapp_agent_core_readiness_v1','readiness');
mustObserve("'prompt_stored',false",'no_prompt_storage');
mustObserve('legacy_before_insert_router_count','router_inventory');
mustHook('trg_agent_core_shadow_observe_ai_job_v1','shadow_hook');
mustHook('exception when others','shadow_hook_fail_open_for_telemetry');
mustHook("when (new.status='done')",'done_only');

const tools=[
 'wa_search_products','wa_get_product','wa_get_cart','wa_list_baskets','wa_get_policy',
 'wa_get_recommendations','wa_add_product','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_handoff_human'
];
for(const tool of tools) must(`'${tool}'`,tool);

for(const forbidden of [
 "whatsapp_live_canary_percent=100",
 "experience_orchestrator_enabled=true",
 "whatsapp_flow_data_exchange_enabled=true",
 "whatsapp_flow_send_enabled=true",
 "bling_order_sync_enabled=true"
]) if(lower.includes(forbidden.toLowerCase())) throw new Error(`forbidden_rollout:${forbidden}`);

if(!lower.includes('revoke all on public.agent_core_runtime_config from public, anon, authenticated')) throw new Error('runtime_config_not_server_only');
if(!lower.includes('revoke all on public.agent_core_turns from public, anon, authenticated')) throw new Error('turns_not_server_only');

mustRoadmap('## Rodada 1','round1');
mustRoadmap('## Rodada 2','round2');
mustRoadmap('## Rodada 3','round3');
mustRoadmap('## Rodada 4','round4');
mustRoadmap('## Rodada 5','round5');
mustRoadmap('## Rodada 6','round6');
mustRoadmap('não aumentar canary acima de 1%','rollout_guard');

console.log(`Agent Core contract OK: ${tools.length} governed WhatsApp tools, observe/shadow defaults, readiness trace, non-blocking telemetry and rollout guards present.`);
