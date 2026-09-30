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
    v_missing:=coalesce(v_state->'missing_fields','[]'::jsonb);
  else
    v_missing:='["customer"]'::jsonb;
  end if;

  return v_result || jsonb_build_object(
    'registration_complete',v_complete,
    'registration_state',case when v_complete then 'complete' else 'pending' end,
    'registration_missing_fields',v_missing
  );
end;
$$;

revoke all on function public.ops2_enrich_storefront_order_result_v1(jsonb) from public,anon,authenticated;
grant execute on function public.ops2_enrich_storefront_order_result_v1(jsonb) to service_role;

alter function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb)
  rename to create_vitrine_cart_order_v3_base;

create function public.create_vitrine_cart_order_v3(
  p_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  v_result:=public.create_vitrine_cart_order_v3_base(
    p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );
  return public.ops2_enrich_storefront_order_result_v1(v_result);
end;
$$;

revoke all on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb) to service_role;

alter function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb)
  rename to create_canonical_cart_order_v2_base;

create function public.create_canonical_cart_order_v2(
  p_source text,
  p_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  v_result:=public.create_canonical_cart_order_v2_base(
    p_source,p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );
  return public.ops2_enrich_storefront_order_result_v1(v_result);
end;
$$;

revoke all on function public.create_canonical_cart_order_v2_base(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_canonical_cart_order_v2_base(text,text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb) to service_role;
