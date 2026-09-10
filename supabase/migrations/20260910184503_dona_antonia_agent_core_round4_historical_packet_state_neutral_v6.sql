begin;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  base jsonb;
  msg text; stage text; awaiting text; interactive_id text; topic text;
  selective jsonb; intelligence jsonb; tools jsonb:='[]'::jsonb; hist jsonb:='[]'::jsonb;
  v_historical jsonb:='{}'::jsonb; v_is_historical boolean:=false; v_family text:='';
  v_job_id uuid; v_conversation jsonb;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then
    return jsonb_build_object('enabled',false,'execution_mode','off');
  end if;

  base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
  msg:=coalesce(base#>>'{message,text}','');
  stage:=coalesce(base#>>'{conversation,stage}','');
  awaiting:=coalesce(base#>>'{sales_state,awaiting}','');
  interactive_id:=coalesce(base#>>'{message,interactive,id}','');

  select j.id into v_job_id
  from public.ai_jobs j
  where j.conversation_id=p_conversation_id and j.message_id=p_message_id
  order by j.created_at desc
  limit 1;

  if v_job_id is not null then
    v_historical:=public.is_agent_core_stateless_historical_replay_job_v3(v_job_id);
    v_is_historical:=coalesce((v_historical->>'safe')::boolean,false);
    v_family:=coalesce(v_historical->>'allowed_tool_family','');
  end if;

  if v_is_historical then
    topic:=public.resolve_whatsapp_agent_core_topic_v4(msg,'','',interactive_id);
    hist:='[]'::jsonb;
    selective:=jsonb_build_object('summary','','memories','[]'::jsonb);
    v_conversation:=jsonb_build_object(
      'id',p_conversation_id,
      'mode','ai',
      'stage','',
      'fast_checkout',false,
      'upsell_declined',false
    );
  else
    topic:=public.resolve_whatsapp_agent_core_topic_v4(msg,stage,awaiting,interactive_id);
    if jsonb_typeof(base->'history')='array' then
      select coalesce(jsonb_agg(value),'[]'::jsonb)
      into hist
      from (
        select value
        from jsonb_array_elements(base->'history') with ordinality x(value,ord)
        order by ord
        limit greatest(0,least(cfg.max_history_messages,8))
      ) q;
    end if;
    selective:=public.get_agent_core_selective_memory_v1(p_conversation_id);
    v_conversation:=base->'conversation';
  end if;

  tools:=public.get_whatsapp_agent_core_toolset_v1();
  if v_is_historical then
    if v_family='catalog_search' then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into tools
      from jsonb_array_elements(tools) x
      where x->>'name' in ('wa_search_products','wa_get_product','wa_get_policy');
    elsif v_family='basket_catalog' then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into tools
      from jsonb_array_elements(tools) x
      where x->>'name' in ('wa_list_baskets','wa_get_policy');
    elsif v_family='none' then
      tools:='[]'::jsonb;
    else
      tools:='[]'::jsonb;
    end if;
  end if;

  intelligence:=coalesce(
    public.get_service_intelligence_compact_v3(
      'whatsapp',msg,null,case when v_is_historical then null else stage end
    ),'{}'::jsonb
  ) || jsonb_build_object(
    'conversation_summary',case when v_is_historical then '' else coalesce(selective->>'summary','') end,
    'knowledge_text_matches',public.search_service_knowledge_text_v1(msg,3),
    'memory_policy',jsonb_build_object('declared_precedence',true,'sensitive_attributes_excluded',true),
    'product_vocabulary',public.match_whatsapp_product_vocabulary_v1(msg)
  );

  return jsonb_build_object(
    'enabled',true,
    'agent',jsonb_build_object(
      'version',cfg.agent_version,'execution_mode',cfg.execution_mode,
      'planner_model',cfg.planner_model,'escalation_model',cfg.escalation_model,
      'reasoning_effort',cfg.reasoning_effort,'max_tool_calls',cfg.max_tool_calls,
      'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,'prompt_cache_ttl',cfg.prompt_cache_ttl
    ),
    'topic',topic,
    'message',base->'message',
    'conversation',v_conversation,
    'customer',case when v_is_historical then null else base->'customer' end,
    'cart',case when v_is_historical then jsonb_build_object('exists',false,'items','[]'::jsonb) else base->'cart' end,
    'sales_state',case when v_is_historical then '{}'::jsonb else base->'sales_state' end,
    'history',hist,
    'conversation_summary',case when v_is_historical then '' else coalesce(selective->>'summary','') end,
    'customer_memory',case when v_is_historical then '[]'::jsonb else coalesce(selective->'memories','[]'::jsonb) end,
    'intelligence',intelligence,
    'toolset',tools,
    'truth_sources',jsonb_build_array('counter_verified','supabase_transactional_backend'),
    'rules',jsonb_build_object(
      'human_handoff_precedence',true,
      'no_invented_catalog',true,
      'explicit_confirmation_for_commitments',true,
      'basket_component_prices_hidden',true,
      'declared_memory_precedence',true,
      'global_learning_requires_human_review',true,
      'state_aware_topic',true,
      'product_vocabulary_separate_from_availability',true,
      'historical_replay',v_is_historical,
      'historical_state_neutral',v_is_historical,
      'historical_history_omitted',v_is_historical,
      'historical_toolset_restricted',v_is_historical
    ),
    'metadata',jsonb_build_object(
      'historical_replay',v_is_historical,
      'historical_state_neutral',v_is_historical,
      'historical_family',case when v_is_historical then v_family else null end,
      'historical_source_job_id',case when v_is_historical then v_job_id else null end
    )
  );
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

create or replace function public.get_agent_core_round4_historical_packet_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with candidates as (
  select j.id,j.conversation_id,j.message_id,
         public.is_agent_core_stateless_historical_replay_job_v3(j.id) safety
  from public.ai_jobs j
  join public.conversations c on c.id=j.conversation_id
  where j.status='done' and j.job_type='conversation'
    and c.automation_cohort='homologation'
    and j.created_at>=now()-interval '7 days'
), picked as (
  select distinct on (safety->>'allowed_tool_family')
         id,conversation_id,message_id,safety
  from candidates
  where coalesce((safety->>'safe')::boolean,false)
    and safety->>'allowed_tool_family' in ('catalog_search','basket_catalog')
  order by safety->>'allowed_tool_family',id
), packets as (
  select p.*,public.build_whatsapp_agent_core_packet_v1(p.conversation_id,p.message_id) packet
  from picked p
), checks as (
  select safety->>'allowed_tool_family' family,
         safety->>'resolved_topic' expected_topic,
         packet->>'topic' actual_topic,
         coalesce((packet#>>'{metadata,historical_replay}')::boolean,false) historical_replay,
         coalesce((packet#>>'{metadata,historical_state_neutral}')::boolean,false) state_neutral,
         coalesce(packet#>>'{conversation,stage}','')='' stage_blank,
         coalesce(packet->'sales_state','{}'::jsonb)='{}'::jsonb sales_state_empty,
         packet->'customer' is null customer_absent,
         coalesce(packet#>>'{cart,exists}','false')='false' cart_empty,
         coalesce(jsonb_array_length(packet->'history'),0)=0 history_omitted,
         not exists(
           select 1 from jsonb_array_elements(coalesce(packet->'toolset','[]'::jsonb)) t
           where case when safety->>'allowed_tool_family'='catalog_search'
             then t->>'name' not in ('wa_search_products','wa_get_product','wa_get_policy')
             else t->>'name' not in ('wa_list_baskets','wa_get_policy') end
         ) toolset_restricted
  from packets
)
select jsonb_build_object(
  'version',1,
  'families_checked',(select count(*) from checks),
  'catalog_search_present',exists(select 1 from checks where family='catalog_search'),
  'basket_catalog_present',exists(select 1 from checks where family='basket_catalog'),
  'topic_matches',not exists(select 1 from checks where actual_topic<>expected_topic),
  'historical_replay_marked',not exists(select 1 from checks where not historical_replay),
  'state_neutral',not exists(select 1 from checks where not state_neutral or not stage_blank or not sales_state_empty or not customer_absent or not cart_empty or not history_omitted),
  'toolset_restricted',not exists(select 1 from checks where not toolset_restricted),
  'ready',(
    (select count(*) from checks)=2
    and not exists(select 1 from checks where actual_topic<>expected_topic)
    and not exists(select 1 from checks where not historical_replay or not state_neutral or not stage_blank or not sales_state_empty or not customer_absent or not cart_empty or not history_omitted or not toolset_restricted)
  )
); $$;

revoke all on function public.get_agent_core_round4_historical_packet_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_historical_packet_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v6()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p jsonb:=public.get_agent_core_round4_parity_report_v5(168);
  b jsonb:=public.get_agent_core_round4_basket_tool_readiness_v1();
  c jsonb:=public.get_agent_core_round4_checkout_transition_readiness_v1();
  o jsonb:=public.get_agent_core_round4_router_observability_v1();
  h jsonb:=public.get_agent_core_round4_historical_replay_readiness_v3();
  hp jsonb:=public.get_agent_core_round4_historical_packet_readiness_v1();
  s jsonb:=public.get_agent_core_round4_structured_topic_readiness_v2();
  ps jsonb:=public.get_agent_core_round4_product_search_readiness_v1();
  rp jsonb:=public.get_agent_core_round4_replay_policy_readiness_v1();
  inv jsonb; rollout jsonb; blocked_count integer; hard_invalid integer; candidate_ready boolean; global_ready boolean;
begin
  select jsonb_build_object(
    'candidate_count',count(*) filter(where retirement_state='candidate'),
    'blocked_count',count(*) filter(where retirement_state='blocked'),
    'retired_count',count(*) filter(where retirement_state='retired'),
    'hard_safety_invalid_count',count(*) filter(where classification='hard_safety' and retirement_state<>'keep')
  ),count(*) filter(where retirement_state='blocked'),count(*) filter(where classification='hard_safety' and retirement_state<>'keep')
  into inv,blocked_count,hard_invalid
  from public.agent_core_router_inventory;

  select jsonb_build_object(
    'whatsapp_live_canary_percent',whatsapp_live_canary_percent,
    'experience_orchestrator_enabled',experience_orchestrator_enabled,
    'whatsapp_flow_data_exchange_enabled',whatsapp_flow_data_exchange_enabled,
    'whatsapp_flow_send_enabled',whatsapp_flow_send_enabled,
    'whatsapp_flow_commercial_write_enabled',whatsapp_flow_commercial_write_enabled,
    'bling_order_sync_enabled',bling_order_sync_enabled,
    'gates_preserved',(whatsapp_live_canary_percent=1 and not experience_orchestrator_enabled and not whatsapp_flow_data_exchange_enabled and not whatsapp_flow_send_enabled and not whatsapp_flow_commercial_write_enabled and not bling_order_sync_enabled)
  ) into rollout from public.automation_config limit 1;

  candidate_ready:=coalesce((p->>'candidate_retirement_ready')::boolean,false)
    and coalesce((rollout->>'gates_preserved')::boolean,false)
    and hard_invalid=0
    and coalesce((b->>'observe_only')::boolean,false)
    and coalesce((c->>'observe_only')::boolean,false)
    and coalesce((ps->>'intent_and_availability_separated')::boolean,false)
    and coalesce((hp->>'ready')::boolean,false);
  global_ready:=candidate_ready and blocked_count=0;

  return jsonb_build_object(
    'version',6,'round','4/6',
    'candidate_retirement_ready',candidate_ready,
    'global_retirement_ready',global_ready,
    'reason',case
      when not coalesce((hp->>'ready')::boolean,false) then 'historical_packet_not_state_neutral'
      when not coalesce((p->>'candidate_retirement_ready')::boolean,false) then p->>'reason'
      when not coalesce((rollout->>'gates_preserved')::boolean,false) then 'rollout_gate_not_preserved'
      when hard_invalid>0 then 'hard_safety_invalid'
      when not coalesce((b->>'observe_only')::boolean,false) then 'basket_tools_not_observe'
      when not coalesce((c->>'observe_only')::boolean,false) then 'checkout_tools_not_observe'
      when not coalesce((ps->>'intent_and_availability_separated')::boolean,false) then 'product_search_contract_invalid'
      when blocked_count>0 then 'blocked_routers_remain'
      else 'global_retirement_ready' end,
    'parity',p,'basket_tools',b,'checkout_tools',c,'router_observability',o,
    'historical_replay',h,'historical_packet',hp,'structured_topic',s,
    'product_search',ps,'replay_policy',rp,'router_inventory',inv,'rollout',rollout
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v6() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v6() to service_role;

commit;