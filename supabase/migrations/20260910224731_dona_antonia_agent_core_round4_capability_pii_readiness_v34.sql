begin;

create or replace function public.agent_core_schema_contains_pii_fields_v1(p_schema jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  kv record;
  item jsonb;
begin
  if p_schema is null then return false; end if;

  if jsonb_typeof(p_schema)='object' then
    for kv in select key,value from jsonb_each(p_schema)
    loop
      if lower(kv.key) ~ '(^|_)(cpf|cnpj|document|documento|phone|telefone|email|address|endereco|street|rua|city|cidade|neighborhood|bairro|house|casa|number|numero|name|nome|locator|localizador|reference|referencia)($|_)' then
        return true;
      end if;
      if jsonb_typeof(kv.value) in ('object','array') and public.agent_core_schema_contains_pii_fields_v1(kv.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_schema)='array' then
    for item in select value from jsonb_array_elements(p_schema)
    loop
      if jsonb_typeof(item) in ('object','array') and public.agent_core_schema_contains_pii_fields_v1(item) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;
revoke all on function public.agent_core_schema_contains_pii_fields_v1(jsonb) from public,anon,authenticated;
grant execute on function public.agent_core_schema_contains_pii_fields_v1(jsonb) to service_role;

create or replace function public.get_agent_core_round4_checkout_transition_readiness_v1()
returns jsonb
language sql
stable
security definer
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
    'version',2,
    'expected_count',(select count(*) from expected),
    'present_count',(select count(*) from actual where implementation_ref is not null),
    'observe_only',not exists(select 1 from actual where execution_mode is distinct from 'observe'),
    'reversible_only',not exists(select 1 from actual where risk_class is distinct from 'reversible_write'),
    'pii_in_tool_arguments',exists(
      select 1 from actual
      where public.agent_core_schema_contains_pii_fields_v1(coalesce(input_schema,'{}'::jsonb))
    ),
    'pii_detection','recursive_schema_property_names_v1',
    'non_pii_semantic_arguments_allowed',true,
    'canonical_capability_argument_is_pii',public.agent_core_schema_contains_pii_fields_v1(
      jsonb_build_object('type','object','properties',jsonb_build_object('capability',jsonb_build_object('type','string')))
    ),
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

comment on function public.agent_core_schema_contains_pii_fields_v1(jsonb) is
'Round 4 V34. Detects PII-bearing tool arguments by JSON-schema property names recursively; semantic enum arguments such as capability are non-PII.';

commit;
