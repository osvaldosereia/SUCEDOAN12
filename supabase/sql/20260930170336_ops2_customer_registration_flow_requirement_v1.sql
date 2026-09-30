create or replace function public.ops2_customer_registration_state_v1(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_customer public.customers%rowtype;
  v_phone text;
  v_name_ok boolean:=false;
  v_phone_ok boolean:=false;
  v_document_ok boolean:=false;
  v_has_address boolean:=false;
  v_has_city boolean:=false;
  v_has_usable_address boolean:=false;
  v_identity_ready boolean:=false;
  v_registration_complete boolean:=false;
  v_already_linked_bling boolean:=false;
  v_bling_ready boolean:=false;
  v_flow_required boolean:=true;
  v_document_only_pending boolean:=false;
  v_missing text[]:=array[]::text[];
begin
  select c.* into v_customer
  from public.customers c
  where c.id=p_customer_id;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'error','customer_not_found',
      'customer_id',p_customer_id,
      'identity_ready',false,
      'registration_complete',false,
      'bling_ready',false,
      'already_linked_bling',false,
      'flow_required',true,
      'document_only_pending',false,
      'missing_fields',to_jsonb(array['name','phone','document','address','city']::text[])
    );
  end if;

  v_name_ok:=nullif(btrim(coalesce(v_customer.name,'')),'') is not null;
  v_phone:=public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
  v_phone_ok:=v_phone is not null;
  v_document_ok:=public.ops2_valid_cpf_cnpj_v1(v_customer.cpf_cnpj);

  select
    coalesce(bool_or(nullif(btrim(coalesce(a.street,'')),'') is not null),false),
    coalesce(bool_or(nullif(btrim(coalesce(a.city,'')),'') is not null),false),
    coalesce(bool_or(
      nullif(btrim(coalesce(a.street,'')),'') is not null
      and nullif(btrim(coalesce(a.city,'')),'') is not null
    ),false)
  into v_has_address,v_has_city,v_has_usable_address
  from public.customer_addresses a
  where a.customer_id=p_customer_id
    and a.is_active=true;

  v_identity_ready:=v_name_ok and v_phone_ok;
  v_registration_complete:=v_identity_ready and v_document_ok and v_has_usable_address;
  v_already_linked_bling:=coalesce(v_customer.bling_contact_id,0)>0;
  v_bling_ready:=v_already_linked_bling or v_registration_complete;

  if not v_name_ok then v_missing:=array_append(v_missing,'name'); end if;
  if not v_phone_ok then v_missing:=array_append(v_missing,'phone'); end if;
  if not v_document_ok then v_missing:=array_append(v_missing,'document'); end if;
  if not v_has_address then v_missing:=array_append(v_missing,'address'); end if;
  if not v_has_city then v_missing:=array_append(v_missing,'city'); end if;

  v_flow_required:=not (v_identity_ready and v_has_usable_address);
  v_document_only_pending:=v_identity_ready and v_has_usable_address and not v_document_ok;

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'identity_ready',v_identity_ready,
    'registration_complete',v_registration_complete,
    'bling_ready',v_bling_ready,
    'already_linked_bling',v_already_linked_bling,
    'flow_required',v_flow_required,
    'document_only_pending',v_document_only_pending,
    'missing_fields',to_jsonb(v_missing)
  );
end;
$$;

revoke all on function public.ops2_customer_registration_state_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_customer_registration_state_v1(uuid) to service_role;

create or replace function public.ops2_customer_registration_summary_v1(p_days integer default 31)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_days integer:=greatest(1,least(365,coalesce(p_days,31)));
  v_since timestamptz:=now()-make_interval(days=>greatest(1,least(365,coalesce(p_days,31))));
  v_result jsonb;
begin
  with recent_orders as (
    select o.id,o.customer_id
    from public.orders o
    where o.created_at>=v_since
      and o.source in ('vitrine','storefront_v2')
  ), distinct_customers as (
    select distinct ro.customer_id
    from recent_orders ro
    where ro.customer_id is not null
  ), customer_states as (
    select dc.customer_id,public.ops2_customer_registration_state_v1(dc.customer_id) as state
    from distinct_customers dc
  ), order_states as (
    select ro.id,ro.customer_id,cs.state
    from recent_orders ro
    left join customer_states cs on cs.customer_id=ro.customer_id
  )
  select jsonb_build_object(
    'generated_at',now(),
    'days',v_days,
    'recent_site_orders',(select count(*) from recent_orders),
    'recent_site_orders_incomplete_registration',(
      select count(*) from order_states os
      where os.customer_id is null or coalesce((os.state->>'registration_complete')::boolean,false)=false
    ),
    'recent_site_orders_flow_required',(
      select count(*) from order_states os
      where os.customer_id is null or coalesce((os.state->>'flow_required')::boolean,true)=true
    ),
    'distinct_customers_incomplete_registration',(
      select count(*) from customer_states cs
      where coalesce((cs.state->>'registration_complete')::boolean,false)=false
    ),
    'distinct_customers_registration_complete',(
      select count(*) from customer_states cs
      where coalesce((cs.state->>'registration_complete')::boolean,false)=true
    ),
    'distinct_customers_flow_required',(
      select count(*) from customer_states cs
      where coalesce((cs.state->>'flow_required')::boolean,true)=true
    ),
    'distinct_customers_document_only_pending',(
      select count(*) from customer_states cs
      where coalesce((cs.state->>'document_only_pending')::boolean,false)=true
    ),
    'distinct_customers_bling_ready_unlinked',(
      select count(*) from customer_states cs
      where coalesce((cs.state->>'bling_ready')::boolean,false)=true
        and coalesce((cs.state->>'already_linked_bling')::boolean,false)=false
    ),
    'flow_events_total',(
      select count(*) from public.papoai_customer_flow_events_v1 f where f.created_at>=v_since
    ),
    'flow_events_review',(
      select count(*) from public.papoai_customer_flow_events_v1 f
      where f.created_at>=v_since and f.status<>'processed'
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.ops2_customer_registration_summary_v1(integer) from public,anon,authenticated;
grant execute on function public.ops2_customer_registration_summary_v1(integer) to service_role;

create or replace function public.ops2_enrich_storefront_order_result_v1(p_result jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb:=coalesce(p_result,'{}'::jsonb);
  v_order_id uuid;
  v_customer_id uuid;
  v_state jsonb;
  v_complete boolean:=false;
  v_flow_required boolean:=true;
  v_document_only_pending boolean:=false;
  v_missing jsonb:='[]'::jsonb;
begin
  begin
    v_order_id:=nullif(v_result->>'order_id','')::uuid;
  exception when others then
    v_order_id:=null;
  end;

  if v_order_id is not null then
    select customer_id into v_customer_id from public.orders where id=v_order_id;
  end if;

  if v_customer_id is not null then
    v_state:=public.ops2_customer_registration_state_v1(v_customer_id);
    v_complete:=coalesce((v_state->>'registration_complete')::boolean,false);
    v_flow_required:=coalesce((v_state->>'flow_required')::boolean,true);
    v_document_only_pending:=coalesce((v_state->>'document_only_pending')::boolean,false);
    v_missing:=coalesce(v_state->'missing_fields','[]'::jsonb);
  else
    v_missing:='["customer"]'::jsonb;
  end if;

  return v_result || jsonb_build_object(
    'registration_complete',v_complete,
    'registration_state',case when v_complete then 'complete' else 'pending' end,
    'registration_missing_fields',v_missing,
    'flow_required',v_flow_required,
    'document_only_pending',v_document_only_pending
  );
end;
$$;

revoke all on function public.ops2_enrich_storefront_order_result_v1(jsonb) from public,anon,authenticated;
grant execute on function public.ops2_enrich_storefront_order_result_v1(jsonb) to service_role;
