-- The storefront and checkout both require a lower price and a currently
-- active offer window when the offer comes from rotation.
CREATE FUNCTION public.storefront_order_unit_price_v1(
  p_price numeric, p_offer_price numeric, p_is_offer boolean, p_metadata jsonb, p_at timestamptz
)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO ''
AS $price$
  select case
    when p_is_offer is true and p_offer_price>=0 and p_offer_price<p_price
      and case when p_metadata->>'offer_source'='auto_rotation' then
        case when pg_input_is_valid(p_metadata->>'offer_starts_at','timestamp with time zone')
                  and pg_input_is_valid(p_metadata->>'offer_ends_at','timestamp with time zone')
             then isfinite((p_metadata->>'offer_starts_at')::timestamptz)
               and isfinite((p_metadata->>'offer_ends_at')::timestamptz)
               and (p_metadata->>'offer_starts_at')::timestamptz<=p_at
               and (p_metadata->>'offer_ends_at')::timestamptz>p_at
             else false end
        else true end
    then p_offer_price
    else p_price
  end;
$price$;

REVOKE ALL ON FUNCTION public.storefront_order_unit_price_v1(numeric,numeric,boolean,jsonb,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_order_unit_price_v1(numeric,numeric,boolean,jsonb,timestamptz)
  TO service_role;

-- Compare the total explicitly reviewed by the customer before the order
-- and stock reservation can be written, using the same transaction.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_old text[] := ARRAY[
    $piece$  v_total numeric(14,2):=0;$piece$,
    $piece$begin
  if nullif(btrim(coalesce(p_phone,'')),'') is null then$piece$,
    $piece$case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                   then v_product.offer_price else v_product.price end$piece$,
    $piece$case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                       then v_product.offer_price else v_product.price end$piece$,
    $piece$case when product.is_offer=true
                                      and product.offer_price is not null
                                      and product.offer_price>=0
                                 then product.offer_price else product.price end$piece$,
    $piece$      if not found then
        -- Recover saved carts only from an exact, unambiguous position set.$piece$,
    $piece$          if not found then
            select opt_row.product_id,opt_row.sort_order$piece$,
    $piece$          select public.basket_component_fresh_sellable_stock_v1(v_product.id) into v_existing_stock;
          if v_product.is_active is not true or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then$piece$,
    $piece$  if v_total<75 and $piece$,
    $piece$      if v_mold_component_demand=v_pair.value::numeric then
        select coalesce(jsonb_agg($piece$
  ];
  v_new text[] := ARRAY[
    $piece$  v_total numeric(14,2):=0;
  v_expected_total_cents bigint;
  v_actual_total_cents bigint;$piece$,
    $piece$begin
  -- Older clients do not send a reviewed total yet.
  if v_customer ? 'expected_total_cents' then
    if jsonb_typeof(v_customer->'expected_total_cents') is distinct from 'number'
       or coalesce(v_customer->>'expected_total_cents','') !~ '^[0-9]{1,14}$' then
      raise exception 'checkout_confirmation_invalid';
    end if;
    v_expected_total_cents:=(v_customer->>'expected_total_cents')::bigint;
  end if;
  if nullif(btrim(coalesce(p_phone,'')),'') is null then$piece$,
    $piece$public.storefront_order_unit_price_v1(v_product.price,v_product.offer_price,v_product.is_offer,v_product.metadata,statement_timestamp())$piece$,
    $piece$public.storefront_order_unit_price_v1(v_product.price,v_product.offer_price,v_product.is_offer,v_product.metadata,statement_timestamp())$piece$,
    $piece$public.storefront_order_unit_price_v1(product.price,product.offer_price,product.is_offer,product.metadata,statement_timestamp())$piece$,
    $piece$      if not found then
        if v_expected_total_cents is not null then raise exception 'basket_mold_unavailable'; end if;
        -- Recover saved carts only from an exact, unambiguous position set.$piece$,
    $piece$          if not found then
            if v_expected_total_cents is not null then raise exception 'basket_mold_option_invalid'; end if;
            select opt_row.product_id,opt_row.sort_order$piece$,
    $piece$          select public.basket_component_fresh_sellable_stock_v1(v_product.id) into v_existing_stock;
          if v_expected_total_cents is not null and v_selected_qty>0
             and (v_product.is_active is not true or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty) then
            raise exception 'insufficient_stock'
              using detail=jsonb_build_object(
                'kind','basket_mold_component','product_id',v_product.id,
                'requested',v_selected_qty*v_line_qty,
                'available',case when v_product.is_active is true then greatest(0,coalesce(v_existing_stock,0)) else 0 end,
                'reason','estoque_insuficiente'
              )::text;
          end if;
          if v_product.is_active is not true or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then$piece$,
    $piece$  if v_expected_total_cents is not null then
    v_actual_total_cents:=round(v_total*100)::bigint;
    if v_actual_total_cents<>v_expected_total_cents then
      raise exception 'checkout_price_changed'
        using detail=jsonb_build_object('actual_total_cents',v_actual_total_cents)::text;
    end if;
  end if;

  if v_total<75 and $piece$,
    $piece$      if v_expected_total_cents is null and v_mold_component_demand=v_pair.value::numeric then
        select coalesce(jsonb_agg($piece$
  ];
  v_index integer;
BEGIN
  FOR v_index IN 1..array_length(v_old,1) LOOP
    IF length(v_definition)-length(replace(v_definition,v_old[v_index],''))<>length(v_old[v_index]) THEN
      RAISE EXCEPTION 'checkout confirmation patch: unexpected section %', v_index;
    END IF;
    v_definition := replace(v_definition,v_old[v_index],v_new[v_index]);
  END LOOP;
  EXECUTE v_definition;
END;
$patch$;
