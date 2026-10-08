-- Current production create_vitrine_cart_order_v3 wrapper, exported via pg_get_functiondef.
-- No customer data. Run ONLY against a disposable CI PostgreSQL database.
-- All business dependencies are isolated stubs in test fixture; not a full production clone.
CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v3(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
