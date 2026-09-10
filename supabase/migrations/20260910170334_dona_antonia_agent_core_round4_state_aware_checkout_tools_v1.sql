create or replace function public.resolve_whatsapp_agent_core_topic_v2(
  p_message text,
  p_stage text default null,
  p_awaiting text default null
)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_awaiting text := public.service_norm_text_v1(p_awaiting);
  v_base text;
begin
  v_base := public.classify_whatsapp_service_topic_v1(p_message,p_stage);
  if v_awaiting='basket_payment_selection' then return 'payment'; end if;
  if v_awaiting in ('basket_final_confirmation','basket_customer_base_data','order_customer_base_data','basket_address_flow','basket_locator_confirmation','order_locator_confirmation') then return 'checkout'; end if;
  if v_awaiting='basket_post_storefront' then return 'basket'; end if;
  return v_base;
end
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v2(text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v2(text,text,text) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
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
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then
    return jsonb_build_object('enabled',false,'execution_mode','off');
  end if;
  base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
  msg:=coalesce(base#>>'{message,text}','');
  stage:=coalesce(base#>>'{conversation,stage}','');
  awaiting:=coalesce(base#>>'{sales_state,awaiting}','');
  topic:=public.resolve_whatsapp_agent_core_topic_v2(msg,stage,awaiting);
  max_hist:=greatest(0,least(cfg.max_history_messages,8));
  if jsonb_typeof(base->'history')='array' then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into hist
    from (
      select value from jsonb_array_elements(base->'history') with ordinality x(value,ord)
      order by ord limit max_hist
    ) q;
  end if;
  selective:=public.get_agent_core_selective_memory_v1(p_conversation_id);
  tools:=public.get_whatsapp_agent_core_toolset_v1();
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

insert into public.ai_action_registry(
  action_key,version,display_name,description,category,implementation_kind,implementation_ref,
  input_schema,output_schema,preconditions,side_effects,compensation,confirmation_required,
  autonomy_level,max_amount_brl,allowed_channels,allowed_roles,idempotency_strategy,cost_class,
  enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed
) values
(
  'wa_save_checkout_customer_data',1,'Salvar dados de checkout',
  'Processa deterministicamente a mensagem atual quando o checkout está aguardando dados básicos. O texto é injetado pelo backend; o modelo não replica nem reescreve PII nos argumentos.',
  'orders','deterministic','parse_and_save_whatsapp_customer_base_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["checkout_customer_data_requested","current_message_present"]'::jsonb,
  '["customer_base_update","delivery_address_update"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"checkout_router_decomposition","current_message_injected_by_backend":true,"pii_not_in_tool_arguments":true}'::jsonb,
  'reversible_write',false
),
(
  'wa_set_delivery_locator',1,'Registrar localizador de entrega',
  'Registra deterministicamente o localizador enviado na mensagem atual somente quando o estado de checkout o solicita. O conteúdo é injetado pelo backend.',
  'orders','deterministic','set_whatsapp_locator_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["locator_requested","current_message_present"]'::jsonb,
  '["delivery_locator_update"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"checkout_router_decomposition","current_message_injected_by_backend":true,"pii_not_in_tool_arguments":true}'::jsonb,
  'reversible_write',false
),
(
  'wa_request_address_flow',1,'Solicitar alteração de endereço',
  'Prepara deterministicamente a jornada de alteração de endereço. O destino de retorno é derivado do estado atual pelo backend; a IA não escolhe estados internos.',
  'orders','deterministic','queue_whatsapp_address_flow_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["address_change_requested"]'::jsonb,
  '["address_flow_prepare","checkout_state_change"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"checkout_router_decomposition","return_state_injected_by_backend":true,"flow_send_gate_respected":true}'::jsonb,
  'reversible_write',false
),
(
  'wa_cancel_address_flow',1,'Cancelar alteração de endereço',
  'Cancela deterministicamente uma jornada de endereço pendente sem finalizar pedido.',
  'orders','deterministic','cancel_whatsapp_address_flow_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["address_flow_pending"]'::jsonb,
  '["address_flow_cancel"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"checkout_router_decomposition"}'::jsonb,
  'reversible_write',false
)
on conflict(action_key) do update set
  version=excluded.version,
  display_name=excluded.display_name,
  description=excluded.description,
  category=excluded.category,
  implementation_kind=excluded.implementation_kind,
  implementation_ref=excluded.implementation_ref,
  input_schema=excluded.input_schema,
  output_schema=excluded.output_schema,
  preconditions=excluded.preconditions,
  side_effects=excluded.side_effects,
  compensation=excluded.compensation,
  confirmation_required=excluded.confirmation_required,
  autonomy_level=excluded.autonomy_level,
  max_amount_brl=excluded.max_amount_brl,
  allowed_channels=excluded.allowed_channels,
  allowed_roles=excluded.allowed_roles,
  idempotency_strategy=excluded.idempotency_strategy,
  cost_class=excluded.cost_class,
  enabled=excluded.enabled,
  execution_mode=excluded.execution_mode,
  requires_human_handoff_clear=excluded.requires_human_handoff_clear,
  metadata=excluded.metadata,
  risk_class=excluded.risk_class,
  confidence_autorun_allowed=excluded.confidence_autorun_allowed,
  updated_at=now();

create or replace function public.get_agent_core_round4_checkout_transition_readiness_v1()
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  with expected(action_key) as (values
    ('wa_save_checkout_customer_data'),
    ('wa_set_delivery_locator'),
    ('wa_request_address_flow'),
    ('wa_cancel_address_flow')
  ), actual as (
    select e.action_key,a.risk_class,a.execution_mode,a.implementation_ref,a.input_schema,a.metadata
    from expected e left join public.ai_action_registry a using(action_key)
  )
  select jsonb_build_object(
    'version',1,
    'expected_count',(select count(*) from expected),
    'present_count',(select count(*) from actual where implementation_ref is not null),
    'observe_only',not exists(select 1 from actual where execution_mode is distinct from 'observe'),
    'reversible_only',not exists(select 1 from actual where risk_class is distinct from 'reversible_write'),
    'pii_in_tool_arguments',exists(select 1 from actual where coalesce(input_schema,'{}'::jsonb) <> '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb),
    'state_aware_topics',jsonb_build_object(
      'basket_payment_selection',public.resolve_whatsapp_agent_core_topic_v2('',null,'basket_payment_selection'),
      'basket_final_confirmation',public.resolve_whatsapp_agent_core_topic_v2('',null,'basket_final_confirmation'),
      'basket_customer_base_data',public.resolve_whatsapp_agent_core_topic_v2('',null,'basket_customer_base_data'),
      'basket_locator_confirmation',public.resolve_whatsapp_agent_core_topic_v2('',null,'basket_locator_confirmation'),
      'order_customer_base_data',public.resolve_whatsapp_agent_core_topic_v2('',null,'order_customer_base_data')
    )
  )
$$;

revoke all on function public.get_agent_core_round4_checkout_transition_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_checkout_transition_readiness_v1() to service_role;