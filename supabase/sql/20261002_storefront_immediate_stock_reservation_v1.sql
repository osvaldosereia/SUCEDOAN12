-- Dona Antônia · Storefront immediate stock reservation
-- Scope: new storefront orders only. Existing orders are intentionally untouched.
-- Goal: create the order and its local stock reservation in the same transaction.

create or replace function public.create_vitrine_cart_order_v3(
  p_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_order_id uuid;
  v_reservation jsonb;
  v_error text;
begin
  v_result:=public.create_vitrine_cart_order_v3_base(
    p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );

  begin
    v_order_id:=nullif(v_result->>'order_id','')::uuid;
  exception when others then
    v_order_id:=null;
  end;
  if v_order_id is null then
    raise exception 'order_id_missing' using errcode='P0001';
  end if;

  v_reservation:=public.reserve_vitrine_order_stock_v1(v_order_id);
  if coalesce((v_reservation->>'ok')::boolean,false) is not true then
    v_error:=coalesce(nullif(v_reservation->>'error',''),'stock_reservation_failed');
    raise exception '%',v_error using errcode='P0001';
  end if;

  v_result:=v_result||jsonb_build_object(
    'stock_reserved',true,
    'reservation_timing','on_create',
    'reservation_status',coalesce(v_reservation->>'status','reserved')
  );

  return public.ops2_enrich_storefront_order_result_v1(v_result);
end;
$function$;

create or replace function public.create_canonical_cart_order_v2(
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
as $function$
declare
  v_source text:=lower(trim(coalesce(p_source,'')));
  v_result jsonb;
  v_order_id uuid;
  v_reservation jsonb;
  v_error text;
begin
  v_result:=public.create_canonical_cart_order_v2_base(
    p_source,p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );

  if v_source='vitrine' then
    begin
      v_order_id:=nullif(v_result->>'order_id','')::uuid;
    exception when others then
      v_order_id:=null;
    end;
    if v_order_id is null then
      raise exception 'order_id_missing' using errcode='P0001';
    end if;

    v_reservation:=public.reserve_vitrine_order_stock_v1(v_order_id);
    if coalesce((v_reservation->>'ok')::boolean,false) is not true then
      v_error:=coalesce(nullif(v_reservation->>'error',''),'stock_reservation_failed');
      raise exception '%',v_error using errcode='P0001';
    end if;

    v_result:=v_result||jsonb_build_object(
      'stock_reserved',true,
      'reservation_timing','on_create',
      'reservation_status',coalesce(v_reservation->>'status','reserved')
    );
  end if;

  return public.ops2_enrich_storefront_order_result_v1(v_result);
end;
$function$;

-- Keep these internal RPCs unavailable to public clients.
revoke all on function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb) to service_role;
