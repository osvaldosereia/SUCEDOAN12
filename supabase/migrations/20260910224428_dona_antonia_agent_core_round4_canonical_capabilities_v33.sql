begin;

create or replace function public.is_agent_core_tool_capability_valid_v1(
  p_action_key text,
  p_capability text
)
returns boolean
language sql
immutable
security definer
set search_path=''
as $$
  select case lower(trim(coalesce(p_action_key,'')))
    when 'wa_request_address_flow' then lower(trim(coalesce(p_capability,'')))='change_delivery_address'
    when 'wa_save_checkout_customer_data' then lower(trim(coalesce(p_capability,''))) in ('edit_checkout_customer_data','process_checkout_customer_data')
    else coalesce(nullif(trim(p_capability),''),'')=''
  end;
$$;
revoke all on function public.is_agent_core_tool_capability_valid_v1(text,text) from public,anon,authenticated;
grant execute on function public.is_agent_core_tool_capability_valid_v1(text,text) to service_role;

update public.ai_action_registry
set input_schema=jsonb_build_object(
      'type','object',
      'properties',jsonb_build_object(
        'capability',jsonb_build_object(
          'type','string',
          'enum',jsonb_build_array('change_delivery_address'),
          'description','Capacidade semântica canônica. Use change_delivery_address quando o cliente quiser que a entrega vá para outro endereço, corrigir o endereço de entrega ou alterar o destino da entrega, independentemente das palavras exatas usadas.'
        )
      ),
      'required',jsonb_build_array('capability'),
      'additionalProperties',false
    ),
    description='Prepara deterministicamente a alteração do endereço de entrega. A IA expressa somente a capacidade canônica change_delivery_address; o backend valida mensagem atual, conflito semântico explícito, cliente e estado. A IA não escolhe endereço, estado interno nem efetiva a alteração.',
    metadata=metadata||jsonb_build_object(
      'canonical_capability','change_delivery_address',
      'semantic_intent_argument',true,
      'phrase_enumeration_required',false,
      'model_is_execution_authority',false,
      'deterministic_conflict_guard',true,
      'capability_contract_version',1
    ),
    updated_at=now()
where action_key='wa_request_address_flow';

update public.ai_action_registry
set input_schema=jsonb_build_object(
      'type','object',
      'properties',jsonb_build_object(
        'capability',jsonb_build_object(
          'type','string',
          'enum',jsonb_build_array('edit_checkout_customer_data','process_checkout_customer_data'),
          'description','Capacidade semântica canônica. Use edit_checkout_customer_data quando o cliente pedir para alterar/atualizar os dados do cadastro no checkout. Use process_checkout_customer_data somente quando o backend já estiver aguardando os dados completos.'
        )
      ),
      'required',jsonb_build_array('capability'),
      'additionalProperties',false
    ),
    description='Gerencia deterministicamente os dados básicos do checkout. A IA informa somente edit_checkout_customer_data ou process_checkout_customer_data; PII permanece na mensagem atual e é processada pelo backend. Alteração específica de endereço de entrega pertence a wa_request_address_flow.',
    metadata=metadata||jsonb_build_object(
      'canonical_capabilities',jsonb_build_array('edit_checkout_customer_data','process_checkout_customer_data'),
      'semantic_intent_argument',true,
      'phrase_enumeration_required',false,
      'model_is_execution_authority',false,
      'deterministic_conflict_guard',true,
      'capability_contract_version',1
    ),
    updated_at=now()
where action_key='wa_save_checkout_customer_data';

create or replace function public.evaluate_whatsapp_agent_action_preconditions_v4(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.evaluate_whatsapp_agent_action_preconditions_v3(
    p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb)
  );
  v_missing jsonb:=coalesce(v_base->'missing','[]'::jsonb);
  v_checks jsonb:=coalesce(v_base->'checks','{}'::jsonb);
  v_unsupported jsonb:=coalesce(v_base->'unsupported','[]'::jsonb);
  v_state jsonb:=coalesce(v_base->'state','{}'::jsonb);
  v_capability text:=lower(trim(coalesce(p_input->>'capability','')));
  v_capability_valid boolean:=false;
  v_address_signal boolean:=false;
  v_customer_signal boolean:=false;
  v_current boolean:=coalesce((v_state->>'current_message_present')::boolean,false);
  v_customer_valid boolean:=coalesce((v_state->>'customer_valid')::boolean,false);
  v_basket_active boolean:=coalesce((v_state->>'basket_session_active')::boolean,false);
  v_cart_valid boolean:=coalesce((v_state->>'cart_valid')::boolean,false);
begin
  if p_action_key not in ('wa_request_address_flow','wa_save_checkout_customer_data') then
    return v_base||jsonb_build_object(
      'precondition_semantics_version',4,
      'canonical_capability_required',false,
      'pii_returned',false
    );
  end if;

  v_capability_valid:=public.is_agent_core_tool_capability_valid_v1(p_action_key,v_capability);
  if v_current then
    v_address_signal:=public.is_whatsapp_address_change_request_v1(p_conversation_id,p_message_id);
    v_customer_signal:=public.is_whatsapp_customer_data_change_request_v1(p_conversation_id,p_message_id);
  end if;

  v_checks:=v_checks||jsonb_build_object(
    'canonical_capability_valid',v_capability_valid,
    'deterministic_address_signal',v_address_signal,
    'deterministic_customer_data_signal',v_customer_signal
  );

  if not v_capability_valid then
    if not (v_missing ? 'canonical_capability_invalid') then
      v_missing:=v_missing||jsonb_build_array('canonical_capability_invalid');
    end if;
  elsif p_action_key='wa_request_address_flow' then
    if v_customer_signal then
      if not (v_missing ? 'semantic_conflict_customer_data') then
        v_missing:=v_missing||jsonb_build_array('semantic_conflict_customer_data');
      end if;
    elsif v_capability='change_delivery_address' and v_current and v_customer_valid then
      select coalesce(jsonb_agg(e.value),'[]'::jsonb) into v_missing
      from jsonb_array_elements(v_missing) e(value)
      where e.value <> to_jsonb('address_change_requested'::text);
      v_checks:=v_checks||jsonb_build_object(
        'address_change_requested',true,
        'semantic_capability_accepted',true
      );
    end if;
  elsif p_action_key='wa_save_checkout_customer_data' then
    if v_address_signal then
      if not (v_missing ? 'semantic_conflict_delivery_address') then
        v_missing:=v_missing||jsonb_build_array('semantic_conflict_delivery_address');
      end if;
    elsif v_capability='edit_checkout_customer_data' and v_current and (v_basket_active or v_cart_valid) then
      select coalesce(jsonb_agg(e.value),'[]'::jsonb) into v_missing
      from jsonb_array_elements(v_missing) e(value)
      where e.value <> to_jsonb('checkout_customer_data_requested'::text);
      v_checks:=v_checks||jsonb_build_object(
        'checkout_customer_data_requested',true,
        'semantic_capability_accepted',true
      );
    elsif v_capability='process_checkout_customer_data' then
      v_checks:=v_checks||jsonb_build_object('semantic_capability_accepted',true);
    end if;
  end if;

  return v_base||jsonb_build_object(
    'ready',jsonb_array_length(v_missing)=0 and jsonb_array_length(v_unsupported)=0,
    'missing',v_missing,
    'checks',v_checks,
    'precondition_semantics_version',4,
    'canonical_capability_required',true,
    'canonical_capability',v_capability,
    'capability_source','model_semantic_tool_argument',
    'deterministic_conflict_guard',true,
    'phrase_enumeration_required',false,
    'model_is_execution_authority',false,
    'pii_returned',false
  );
end;
$$;
revoke all on function public.evaluate_whatsapp_agent_action_preconditions_v4(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.evaluate_whatsapp_agent_action_preconditions_v4(uuid,uuid,text,jsonb) to service_role;

create or replace function public.preview_whatsapp_agent_action_v2(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb;
  pre jsonb;
  allowed boolean;
  decision text;
begin
  base:=public.preview_whatsapp_agent_action_v1(p_conversation_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  if coalesce((base->>'allowed')::boolean,false) is not true then
    return base||jsonb_build_object('precondition_version',5,'state_preconditions',null);
  end if;

  pre:=public.evaluate_whatsapp_agent_action_preconditions_v4(
    p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb)
  );
  allowed:=coalesce((pre->>'ready')::boolean,false);
  decision:=case when not allowed then 'blocked' else coalesce(base->>'decision','blocked') end;

  return base||jsonb_build_object(
    'allowed',allowed,
    'decision',decision,
    'reasons',coalesce(base->'reasons','[]'::jsonb)||coalesce(pre->'missing','[]'::jsonb)||coalesce(pre->'unsupported','[]'::jsonb),
    'precondition_version',5,
    'state_preconditions',pre
  );
end;
$$;
revoke all on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) to service_role;

create or replace function public.get_agent_core_round4_canonical_capability_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  addr public.ai_action_registry%rowtype;
  cust public.ai_action_registry%rowtype;
  cfg public.agent_core_runtime_config%rowtype;
  ac public.automation_config%rowtype;
  v_addr_schema boolean:=false;
  v_cust_schema boolean:=false;
begin
  select * into addr from public.ai_action_registry where action_key='wa_request_address_flow';
  select * into cust from public.ai_action_registry where action_key='wa_save_checkout_customer_data';
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into ac from public.automation_config where id=1;

  v_addr_schema:=coalesce(addr.input_schema#>'{properties,capability,enum}','[]'::jsonb) @> '["change_delivery_address"]'::jsonb;
  v_cust_schema:=coalesce(cust.input_schema#>'{properties,capability,enum}','[]'::jsonb) @> '["edit_checkout_customer_data","process_checkout_customer_data"]'::jsonb;

  return jsonb_build_object(
    'version',1,
    'ready',v_addr_schema and v_cust_schema and addr.execution_mode='observe' and cust.execution_mode='observe' and cfg.execution_mode='observe',
    'address_capability_schema_ready',v_addr_schema,
    'customer_data_capability_schema_ready',v_cust_schema,
    'phrase_enumeration_required',false,
    'semantic_intent_source','existing_agent_core_planner_tool_argument',
    'extra_model_call_required',false,
    'deterministic_conflict_guard',true,
    'structured_interaction_overrides_model',true,
    'model_is_execution_authority',false,
    'backend_remains_state_authority',true,
    'pii_in_capability_argument',false,
    'agent_core_execution_mode',cfg.execution_mode,
    'address_tool_execution_mode',addr.execution_mode,
    'customer_data_tool_execution_mode',cust.execution_mode,
    'whatsapp_live_canary_percent',ac.whatsapp_live_canary_percent,
    'flow_send_enabled',ac.whatsapp_flow_send_enabled,
    'flow_data_exchange_enabled',ac.whatsapp_flow_data_exchange_enabled,
    'flow_commercial_write_enabled',ac.whatsapp_flow_commercial_write_enabled,
    'bling_order_sync_enabled',ac.bling_order_sync_enabled,
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false
  );
end;
$$;
revoke all on function public.get_agent_core_round4_canonical_capability_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_canonical_capability_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v19(
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.get_agent_core_round4_consolidated_readiness_v18(p_conversation_id);
  v_caps jsonb:=public.get_agent_core_round4_canonical_capability_readiness_v1();
begin
  return v_base||jsonb_build_object(
    'version',19,
    'canonical_capabilities',v_caps,
    'canonical_capability_ready',coalesce((v_caps->>'ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false
  );
end;
$$;
revoke all on function public.get_agent_core_round4_consolidated_readiness_v19(uuid) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v19(uuid) to service_role;

comment on function public.evaluate_whatsapp_agent_action_preconditions_v4(uuid,uuid,text,jsonb) is
'Round 4 V33. Canonical semantic capability from the existing planner may satisfy reversible preparation semantics, but deterministic state/conflict guards remain authoritative. No phrase enumeration is required.';

commit;
