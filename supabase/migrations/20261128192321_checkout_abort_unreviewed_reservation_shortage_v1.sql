-- Keep the order and its reservations atomic when reviewed stock changes.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_anchor text := $piece$  v_result:=v_result||jsonb_build_object($piece$;
BEGIN
  IF length(v_definition)-length(replace(v_definition,v_anchor,''))<>length(v_anchor)
     OR strpos(v_definition,'manual_replacement_count')=0 THEN
    RAISE EXCEPTION 'checkout reservation patch: unexpected order function definition';
  END IF;
  EXECUTE replace(v_definition,v_anchor,$guard$  -- Discard the whole transaction if a concurrent order consumed a reviewed item.
  if p_customer_snapshot ? 'expected_total_cents'
     and coalesce((v_reservation->>'manual_replacement_count')::integer,0)>0 then
    raise exception 'checkout_stock_changed';
  end if;

$guard$||v_anchor);
END;
$patch$;
