begin;

create or replace function public.resolve_whatsapp_agent_core_topic_v3(
  p_message text,
  p_stage text,
  p_awaiting text,
  p_interactive_id text
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_key text:=lower(split_part(trim(coalesce(p_interactive_id,'')),':',1));
begin
  if v_key in ('da_basket_payment_credit','da_basket_payment_pix','da_basket_payment_cash','da_basket_payment_food','menu_pagamento')
     or v_key like 'da_basket_payment_%' then
    return 'payment';
  end if;
  if v_key in ('da_basket_finalize','da_confirm_order','da_basket_change_address') then
    return 'checkout';
  end if;
  if v_key='da_cart' then
    return 'cart_review';
  end if;
  if v_key in ('da_add_product','da_qty') then
    return 'cart_change';
  end if;
  if v_key like 'da_basket%' then
    return 'basket';
  end if;
  return public.resolve_whatsapp_agent_core_topic_v2(p_message,p_stage,p_awaiting);
end
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v3(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v3(text,text,text,text) to service_role;

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
  interactive_id text;
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
    interactive_id:=coalesce(m.ai_interpretation->>'id','');
    topic:=public.resolve_whatsapp_agent_core_topic_v3(msg,stage,awaiting,interactive_id);

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
        'interactive',jsonb_build_object('id',interactive_id)
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
      'truth_sources',jsonb_build_array('historical_message','structured_interactive_id','current_deterministic_tools'),
      'rules',jsonb_build_object(
        'human_handoff_precedence',true,
        'no_invented_catalog',true,
        'explicit_confirmation_for_commitments',true,
        'basket_component_prices_hidden',true,
        'declared_memory_precedence',true,
        'global_learning_requires_human_review',true,
        'state_aware_topic',true,
        'structured_topic_v3',true,
        'historical_replay_context',true,
        'historical_state_neutral',true
      )
    );
  end if;

  base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
  msg:=coalesce(base#>>'{message,text}','');
  stage:=coalesce(base#>>'{conversation,stage}','');
  awaiting:=coalesce(base#>>'{sales_state,awaiting}','');
  interactive_id:=coalesce(base#>>'{message,interactive,id}','');
  topic:=public.resolve_whatsapp_agent_core_topic_v3(msg,stage,awaiting,interactive_id);
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
    'truth_sources',jsonb_build_array('counter_verified','structured_interactive_id','supabase_transactional_backend'),
    'rules',jsonb_build_object(
      'human_handoff_precedence',true,
      'no_invented_catalog',true,
      'explicit_confirmation_for_commitments',true,
      'basket_component_prices_hidden',true,
      'declared_memory_precedence',true,
      'global_learning_requires_human_review',true,
      'state_aware_topic',true,
      'structured_topic_v3',true
    )
  );
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

create or replace function public.get_agent_core_round4_structured_topic_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',1,
  'resolver','resolve_whatsapp_agent_core_topic_v3',
  'basket_structured',public.resolve_whatsapp_agent_core_topic_v3('', '', '', 'da_basket:00000000-0000-0000-0000-000000000000')='basket',
  'basket_customize_structured',public.resolve_whatsapp_agent_core_topic_v3('', '', '', 'da_basket_customize')='basket',
  'payment_structured',public.resolve_whatsapp_agent_core_topic_v3('', '', '', 'da_basket_payment_credit')='payment',
  'checkout_structured',public.resolve_whatsapp_agent_core_topic_v3('', '', '', 'da_confirm_order')='checkout',
  'cart_structured',public.resolve_whatsapp_agent_core_topic_v3('', '', '', 'da_cart')='cart_review',
  'quantity_structured',public.resolve_whatsapp_agent_core_topic_v3('', '', '', 'da_qty:abc')='cart_change'
);
$$;

revoke all on function public.get_agent_core_round4_structured_topic_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_structured_topic_readiness_v1() to service_role;

commit;