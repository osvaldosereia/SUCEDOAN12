begin;

create or replace function public.is_agent_core_stateless_historical_replay_job_v1(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  j public.ai_jobs%rowtype;
  c public.conversations%rowtype;
  v_action text;
begin
  select * into j from public.ai_jobs where id=p_job_id;
  if not found then return jsonb_build_object('safe',false,'reason','job_not_found'); end if;
  if j.status<>'done' or j.job_type<>'conversation' then
    return jsonb_build_object('safe',false,'reason','job_not_replayable');
  end if;
  select * into c from public.conversations where id=j.conversation_id;
  if not found then return jsonb_build_object('safe',false,'reason','conversation_not_found'); end if;
  if coalesce(c.automation_cohort,'')<>'homologation' then
    return jsonb_build_object('safe',false,'reason','not_homologation');
  end if;
  if j.created_at >= now()-interval '15 minutes' then
    return jsonb_build_object('safe',false,'reason','message_not_historical');
  end if;

  v_action:=lower(coalesce(j.result->>'action',j.result#>>'{plan,intent}',''));
  if v_action not in (
    'search','show_baskets','basket_catalog_link','basket_storefront_link',
    'basket_selected_followup','basket_list_fallback','basket_choice_flow',
    'whatsapp_flow_baskets','greeting'
  ) then
    return jsonb_build_object('safe',false,'reason','historical_stateful_replay_blocked','action',v_action);
  end if;

  return jsonb_build_object(
    'safe',true,
    'reason','homologation_stateless_historical_replay',
    'action',v_action,
    'conversation_id',j.conversation_id,
    'message_id',j.message_id
  );
end
$$;

revoke all on function public.is_agent_core_stateless_historical_replay_job_v1(uuid) from public,anon,authenticated;
grant execute on function public.is_agent_core_stateless_historical_replay_job_v1(uuid) to service_role;

create or replace function public.is_whatsapp_agent_core_shadow_eligible_v1(p_job_id uuid, p_replay boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  j public.ai_jobs%rowtype;
  c public.conversations%rowtype;
  v_open_handoff boolean;
  v_hour integer;
  v_historical jsonb;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode<>'observe' or not cfg.shadow_openai_enabled then
    return jsonb_build_object('eligible',false,'reason','agent_core_shadow_disabled');
  end if;

  select * into j from public.ai_jobs where id=p_job_id;
  if not found then return jsonb_build_object('eligible',false,'reason','job_not_found'); end if;
  if j.status<>'done' or j.job_type<>'conversation' then
    return jsonb_build_object('eligible',false,'reason','job_not_shadowable','status',j.status,'job_type',j.job_type);
  end if;

  select * into c from public.conversations where id=j.conversation_id;
  if not found then return jsonb_build_object('eligible',false,'reason','conversation_not_found'); end if;

  -- Replay historico e permitido somente em homologacao e somente para acoes stateless.
  -- Ele nao depende do modo/handoff atuais porque nenhuma escrita e executada em observe.
  if p_replay and coalesce(c.automation_cohort,'')='homologation' and j.created_at < now()-interval '15 minutes' then
    v_historical:=public.is_agent_core_stateless_historical_replay_job_v1(p_job_id);
    if coalesce((v_historical->>'safe')::boolean,false) then
      return jsonb_build_object(
        'eligible',true,
        'reason','authorized_homologation_historical_replay',
        'conversation_id',j.conversation_id,
        'message_id',j.message_id,
        'agent_version',cfg.agent_version,
        'replay',true,
        'historical_context',true,
        'historical_action',v_historical->>'action'
      );
    end if;
    return jsonb_build_object(
      'eligible',false,
      'reason',coalesce(v_historical->>'reason','historical_replay_blocked'),
      'historical_context',true,
      'historical_action',v_historical->>'action'
    );
  end if;

  select exists(
    select 1 from public.human_handoffs h
    where h.conversation_id=c.id and h.status in ('open','claimed')
  ) into v_open_handoff;
  if v_open_handoff then return jsonb_build_object('eligible',false,'reason','human_handoff_precedence'); end if;
  if c.mode<>'ai' then return jsonb_build_object('eligible',false,'reason','conversation_not_ai'); end if;

  if not p_replay and coalesce(c.automation_cohort,'') not in ('ai_canary','homologation') then
    return jsonb_build_object('eligible',false,'reason','cohort_not_shadow_enabled','cohort',c.automation_cohort);
  end if;

  if not p_replay and exists(
    select 1 from public.agent_core_turns t
    where t.message_id=j.message_id
      and t.agent_version=cfg.agent_version
      and t.execution_mode=cfg.execution_mode
      and t.model is not null
  ) then
    return jsonb_build_object('eligible',false,'reason','already_shadow_planned');
  end if;

  if not p_replay then
    select count(*) into v_hour
    from public.agent_core_turns t
    where t.created_at>=now()-interval '1 hour' and t.model is not null;
    if v_hour>=cfg.shadow_max_runs_per_hour then
      return jsonb_build_object('eligible',false,'reason','shadow_hourly_cap','count',v_hour);
    end if;
  end if;

  return jsonb_build_object(
    'eligible',true,
    'reason',case when p_replay then 'authorized_replay' else 'eligible_shadow' end,
    'conversation_id',j.conversation_id,
    'message_id',j.message_id,
    'agent_version',cfg.agent_version,
    'replay',coalesce(p_replay,false),
    'historical_context',false
  );
end
$$;

revoke all on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  c public.conversations%rowtype;
  m public.messages%rowtype;
  base jsonb;
  msg text;
  stage text;
  awaiting text;
  topic text;
  selective jsonb;
  intelligence jsonb;
  tools jsonb:='[]'::jsonb;
  hist jsonb:='[]'::jsonb;
  max_hist integer;
  v_historical boolean:=false;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then
    return jsonb_build_object('enabled',false,'execution_mode','off');
  end if;

  select * into c from public.conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  select * into m from public.messages where id=p_message_id and conversation_id=c.id;
  if not found then raise exception 'message_not_found'; end if;

  v_historical:=coalesce(c.automation_cohort,'')='homologation'
    and c.mode='human'
    and m.created_at < now()-interval '15 minutes';

  max_hist:=greatest(0,least(cfg.max_history_messages,8));
  tools:=public.get_whatsapp_agent_core_toolset_v1();

  if v_historical then
    msg:=left(coalesce(m.body_text,m.transcript,''),1000);
    stage:='';
    awaiting:='';
    topic:=public.resolve_whatsapp_agent_core_topic_v2(msg,stage,awaiting);

    select coalesce(jsonb_agg(jsonb_build_object(
      'direction',x.direction,
      'type',x.message_type,
      'text',left(coalesce(x.body_text,x.transcript,''),220)
    ) order by x.created_at),'[]'::jsonb)
    into hist
    from (
      select direction,message_type,body_text,transcript,created_at
      from public.messages
      where conversation_id=c.id and created_at<m.created_at
      order by created_at desc
      limit max_hist
    ) x;

    selective:=jsonb_build_object('summary','','memories','[]'::jsonb);
    intelligence:=coalesce(public.get_service_intelligence_compact_v3('whatsapp',msg,null,''),'{}'::jsonb)
      || jsonb_build_object(
        'conversation_summary','',
        'knowledge_text_matches',public.search_service_knowledge_text_v1(msg,3),
        'memory_policy',jsonb_build_object('declared_precedence',true,'sensitive_attributes_excluded',true),
        'historical_context_neutral',true
      );

    return jsonb_build_object(
      'enabled',true,
      'agent',jsonb_build_object(
        'version',cfg.agent_version,
        'execution_mode',cfg.execution_mode,
        'planner_model',cfg.planner_model,
        'escalation_model',cfg.escalation_model,
        'reasoning_effort',cfg.reasoning_effort,
        'max_tool_calls',cfg.max_tool_calls,
        'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,
        'prompt_cache_ttl',cfg.prompt_cache_ttl
      ),
      'topic',topic,
      'message',jsonb_build_object(
        'id',m.id,
        'type',m.message_type,
        'text',msg,
        'interactive',jsonb_build_object('id',coalesce(m.ai_interpretation->>'id',''))
      ),
      'conversation',jsonb_build_object(
        'id',c.id,
        'stage','',
        'mode','ai',
        'fast_checkout',false,
        'upsell_declined',false,
        'historical_replay',true
      ),
      'customer',jsonb_build_object('registered',false,'has_address',false),
      'cart',jsonb_build_object('exists',false,'items','[]'::jsonb),
      'sales_state','{}'::jsonb,
      'history',coalesce(hist,'[]'::jsonb),
      'conversation_summary','',
      'customer_memory','[]'::jsonb,
      'intelligence',intelligence,
      'toolset',tools,
      'truth_sources',jsonb_build_array('historical_message','current_deterministic_tools'),
      'rules',jsonb_build_object(
        'human_handoff_precedence',true,
        'no_invented_catalog',true,
        'explicit_confirmation_for_commitments',true,
        'basket_component_prices_hidden',true,
        'declared_memory_precedence',true,
        'global_learning_requires_human_review',true,
        'state_aware_topic',true,
        'historical_replay_context',true,
        'historical_state_neutral',true
      )
    );
  end if;

  base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
  msg:=coalesce(base#>>'{message,text}','');
  stage:=coalesce(base#>>'{conversation,stage}','');
  awaiting:=coalesce(base#>>'{sales_state,awaiting}','');
  topic:=public.resolve_whatsapp_agent_core_topic_v2(msg,stage,awaiting);
  if jsonb_typeof(base->'history')='array' then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into hist
    from (
      select value from jsonb_array_elements(base->'history') with ordinality x(value,ord)
      order by ord limit max_hist
    ) q;
  end if;
  selective:=public.get_agent_core_selective_memory_v1(p_conversation_id);
  intelligence:=coalesce(public.get_service_intelligence_compact_v3('whatsapp',msg,null,stage),'{}'::jsonb)
    || jsonb_build_object(
      'conversation_summary',coalesce(selective->>'summary',''),
      'knowledge_text_matches',public.search_service_knowledge_text_v1(msg,3),
      'memory_policy',jsonb_build_object('declared_precedence',true,'sensitive_attributes_excluded',true)
    );
  return jsonb_build_object(
    'enabled',true,
    'agent',jsonb_build_object(
      'version',cfg.agent_version,
      'execution_mode',cfg.execution_mode,
      'planner_model',cfg.planner_model,
      'escalation_model',cfg.escalation_model,
      'reasoning_effort',cfg.reasoning_effort,
      'max_tool_calls',cfg.max_tool_calls,
      'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,
      'prompt_cache_ttl',cfg.prompt_cache_ttl
    ),
    'topic',topic,
    'message',base->'message',
    'conversation',base->'conversation',
    'customer',base->'customer',
    'cart',base->'cart',
    'sales_state',base->'sales_state',
    'history',hist,
    'conversation_summary',coalesce(selective->>'summary',''),
    'customer_memory',coalesce(selective->'memories','[]'::jsonb),
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
      'state_aware_topic',true
    )
  );
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

create or replace function public.get_agent_core_round4_historical_replay_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with eligible as (
  select j.id,
         lower(coalesce(j.result->>'action',j.result#>>'{plan,intent}','')) as action,
         public.is_agent_core_stateless_historical_replay_job_v1(j.id) as safety
  from public.ai_jobs j
  join public.conversations c on c.id=j.conversation_id
  where j.status='done' and j.job_type='conversation'
    and c.automation_cohort='homologation'
    and j.created_at>=now()-interval '7 days'
), safe as (
  select * from eligible where coalesce((safety->>'safe')::boolean,false)
)
select jsonb_build_object(
  'version',1,
  'safe_candidate_count',(select count(*) from safe),
  'search_candidates',(select count(*) from safe where action='search'),
  'basket_candidates',(select count(*) from safe where action in ('show_baskets','basket_catalog_link','basket_storefront_link','basket_selected_followup','basket_list_fallback','basket_choice_flow','whatsapp_flow_baskets')),
  'greeting_candidates',(select count(*) from safe where action='greeting'),
  'stateful_replay_blocked',true,
  'current_handoff_ignored_only_for_safe_historical_replay',true,
  'historical_state_neutral',true
);
$$;

revoke all on function public.get_agent_core_round4_historical_replay_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_historical_replay_readiness_v1() to service_role;

commit;