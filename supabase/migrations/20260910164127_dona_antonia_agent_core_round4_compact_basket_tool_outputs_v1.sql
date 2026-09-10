begin;

create or replace function public.get_agent_core_basket_state_compact_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
begin
  return jsonb_build_object(
    'active',coalesce((v->>'active')::boolean,false),
    'basket',case when jsonb_typeof(v->'basket')='object' then jsonb_build_object(
      'id',v#>>'{basket,id}',
      'name',v#>>'{basket,name}',
      'commercial_price',v#>'{basket,base_price}'
    ) else null end,
    'cart',case when jsonb_typeof(v->'cart')='object' then jsonb_build_object(
      'id',v#>>'{cart,id}',
      'basket_id',v#>>'{cart,basket_id}',
      'base_commercial_price',v#>'{cart,base_commercial_price}',
      'total',v#>'{cart,total}'
    ) else null end,
    'customer_registered',coalesce((v#>>'{customer_status,registered}')::boolean,false),
    'has_pending_return',v->'pending_return' is not null and v->'pending_return'<>'null'::jsonb,
    'has_extras_session',v->'extras_session' is not null and v->'extras_session'<>'null'::jsonb
  );
end;
$$;

create or replace function public.get_agent_core_checkout_contact_compact_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  a jsonb:=coalesce(v->'address','{}'::jsonb);
begin
  return jsonb_build_object(
    'known_customer',coalesce((v->>'known_customer')::boolean,false),
    'base_complete',coalesce((v->>'base_complete')::boolean,false),
    'address_known',nullif(coalesce(a->>'street',''),'') is not null and nullif(coalesce(a->>'number',''),'') is not null,
    'locator_known',nullif(coalesce(v->>'locator',''),'') is not null,
    'city_known',nullif(coalesce(a->>'city',''),'') is not null
  );
end;
$$;

create or replace function public.get_agent_core_basket_customer_status_compact_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb:=public.get_whatsapp_basket_customer_status_v1(p_conversation_id);
begin
  return jsonb_build_object(
    'registered',coalesce((v->>'registered')::boolean,false),
    'has_customer',v->'customer' is not null and v->'customer'<>'null'::jsonb,
    'has_address',v->'address' is not null and v->'address'<>'null'::jsonb
  );
end;
$$;

revoke all on function public.get_agent_core_basket_state_compact_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_agent_core_checkout_contact_compact_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_agent_core_basket_customer_status_compact_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_agent_core_basket_state_compact_v1(uuid) to service_role;
grant execute on function public.get_agent_core_checkout_contact_compact_v1(uuid) to service_role;
grant execute on function public.get_agent_core_basket_customer_status_compact_v1(uuid) to service_role;

update public.ai_action_registry
set implementation_ref='get_agent_core_basket_state_compact_v1',
    metadata=metadata||'{"compact_output":true,"internal_token_excluded":true,"pii_excluded":true}'::jsonb,
    updated_at=now()
where action_key='wa_get_basket_state';

update public.ai_action_registry
set implementation_ref='get_agent_core_checkout_contact_compact_v1',
    metadata=metadata||'{"compact_output":true,"pii_excluded":true}'::jsonb,
    updated_at=now()
where action_key='wa_get_checkout_contact';

update public.ai_action_registry
set implementation_ref='get_agent_core_basket_customer_status_compact_v1',
    metadata=metadata||'{"compact_output":true,"pii_excluded":true}'::jsonb,
    updated_at=now()
where action_key='wa_get_basket_customer_status';

create or replace function public.get_agent_core_round4_compact_tool_output_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'basket_state_compact',to_regprocedure('public.get_agent_core_basket_state_compact_v1(uuid)') is not null,
    'checkout_contact_compact',to_regprocedure('public.get_agent_core_checkout_contact_compact_v1(uuid)') is not null,
    'basket_customer_status_compact',to_regprocedure('public.get_agent_core_basket_customer_status_compact_v1(uuid)') is not null,
    'raw_basket_token_not_exposed',position('token' in lower(public.get_agent_core_basket_state_compact_v1('00000000-0000-0000-0000-000000000000'::uuid)::text))=0,
    'registry_compact_refs',(select count(*) from public.ai_action_registry where action_key in ('wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status') and metadata->>'compact_output'='true')
  );
$$;

revoke all on function public.get_agent_core_round4_compact_tool_output_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_compact_tool_output_readiness_v1() to service_role;

commit;
