-- R02+R03 joint contract, REAL R02 v3_base and REAL R03 weekly migration.
-- Synthetic PostgreSQL17 only. No Meta, Bling, SEFAZ or customer data.
\set ON_ERROR_STOP on
CREATE TABLE public.r2_r3_test_orders (
  kind text PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  expected_item_count integer NOT NULL, expected_total numeric(14,2) NOT NULL
);

DO $integrated$
DECLARE
  d jsonb; oid uuid; basket jsonb; mold jsonb;
  food uuid:='00000000-0000-4000-8000-0000000000e1';
  clean uuid:='00000000-0000-4000-8000-0000000000e2';
  foodlot uuid:='00000000-0000-4000-8000-0000000000f1';
  sku uuid:='00000000-0000-4000-8000-0000000000aa';
BEGIN
  d:=public.create_vitrine_cart_order_v3(null,'PIX',
     jsonb_build_array(jsonb_build_object('type','product','id',sku,'qty',2)));
  oid:=(d->>'order_id')::uuid;
  IF (d->>'total')::numeric IS DISTINCT FROM 100
     OR d->>'stock_reserved' IS DISTINCT FROM 'true'
     OR (SELECT quantity FROM public.vitrine_stock_reservations WHERE order_id=oid)<>2
  THEN RAISE EXCEPTION 'r02_real_simple_checkout_broken_after_r03: %',d; END IF;
  INSERT INTO public.r2_r3_test_orders VALUES('simple',oid,1,100);

  basket:=jsonb_build_array(jsonb_build_object(
    'type','basket','id','00000000-0000-4000-8000-0000000000d1',
    'food_lot_id',foodlot,
    'components',jsonb_build_array(
      jsonb_build_object('component_group','food','product_id',food,'quantity',1),
      jsonb_build_object('component_group','hygiene','product_id',clean,'quantity',1))));
  d:=public.create_vitrine_cart_order_v3(null,'PIX',basket);
  oid:=(d->>'order_id')::uuid;
  IF (d->>'total')::numeric<>160
     OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>2
     OR (SELECT count(*) FROM public.vitrine_stock_reservations WHERE order_id=oid)<>0
  THEN RAISE EXCEPTION 'r02_intact_lots_broken_by_r03: %',d; END IF;
  INSERT INTO public.r2_r3_test_orders VALUES('basket_intact',oid,3,160);

  basket:=jsonb_build_array(jsonb_build_object(
    'type','basket','id','00000000-0000-4000-8000-0000000000d1',
    'food_lot_id',foodlot,
    'components',jsonb_build_array(
      jsonb_build_object('component_group','food','product_id',food,'quantity',0),
      jsonb_build_object('component_group','hygiene','product_id',clean,'quantity',1))));
  d:=public.create_vitrine_cart_order_v3(null,'PIX',basket);
  oid:=(d->>'order_id')::uuid;
  IF (d->>'total')::numeric<>110
     OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>1
     OR (SELECT allocation_role FROM public.basket_stock_allocations WHERE order_id=oid)<>'hygiene'
  THEN RAISE EXCEPTION 'r02_independent_hygiene_kit_broken_by_r03: %',d; END IF;
  INSERT INTO public.r2_r3_test_orders VALUES('basket_food_edited',oid,2,110);

  mold:=jsonb_build_array(jsonb_build_object(
    'type','basket_mold','id','00000000-0000-4000-8000-0000000000d3',
    'composition_number',2,'components',jsonb_build_array(
       jsonb_build_object('position_id','00000000-0000-4000-8000-0000000000c2',
          'product_id','00000000-0000-4000-8000-0000000000e3','quantity',1),
       jsonb_build_object('position_id','00000000-0000-4000-8000-0000000000c3',
          'product_id','00000000-0000-4000-8000-0000000000e4','quantity',1))));
  d:=public.create_vitrine_cart_order_v3(null,'PIX',mold);
  oid:=(d->>'order_id')::uuid;
  IF (d->>'total')::numeric<>105
     OR (SELECT other_expenses FROM public.orders WHERE id=oid)<>15
     OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>90
  THEN RAISE EXCEPTION 'r02_mold_hidden_price_broken_by_r03: %',d; END IF;
  INSERT INTO public.r2_r3_test_orders VALUES('mold',oid,3,105);
END $integrated$;

-- Deferred snapshot trigger executes on COMMIT, so inspect next statement.
DO $stable$
DECLARE
  v record; prefix text;count_weeks integer; before_seq integer;after_seq integer;
  snap text;
BEGIN
 prefix:=to_char((now() AT TIME ZONE 'America/Cuiaba')::date,'DD|MM|YYYY')||' - ';
 FOR v IN SELECT kind,order_id,expected_total,expected_item_count
          FROM public.r2_r3_test_orders LOOP
   IF NOT EXISTS(
     SELECT 1 FROM public.orders o
     JOIN public.order_public_snapshots_v1 s ON s.order_id=o.id
     WHERE o.id=v.order_id AND o.total=v.expected_total
       AND o.order_number=s.public_code
       AND o.order_number LIKE prefix||'%'
       AND o.order_number ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
       AND (s.snapshot->>'item_count')::integer=v.expected_item_count
   ) THEN
      RAISE EXCEPTION 'public_order_number_snapshot_mismatch kind=% uuid=%',
         v.kind,v.order_id;
   END IF;
 END LOOP;
 IF (SELECT count(DISTINCT o.order_number) FROM public.orders o
     JOIN public.r2_r3_test_orders t ON t.order_id=o.id)<>4
 THEN RAISE EXCEPTION 'non_unique_public_numbers_after_checkout'; END IF;
 IF (SELECT public_code FROM public.order_public_snapshots_v1
     WHERE order_id='00000000-0000-4000-8000-000000000099')<>'AA001'
 THEN RAISE EXCEPTION 'historical_identity_changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders o
     JOIN public.r2_r3_test_orders t ON t.order_id=o.id
     WHERE o.order_number IS NULL)
 THEN RAISE EXCEPTION 'new_customer_order_missing_number'; END IF;
 SELECT last_seq INTO before_seq FROM public.order_public_weekly_counters_v1
 WHERE week_start=(now() AT TIME ZONE 'America/Cuiaba')::date -
   (extract(isodow FROM (now() AT TIME ZONE 'America/Cuiaba')::date)::integer-1);
 IF before_seq IS DISTINCT FROM 4 THEN
   RAISE EXCEPTION 'expected 4 weekly codes, got %',before_seq; END IF;

 SELECT public_code INTO snap FROM public.order_public_snapshots_v1
 WHERE order_id=(SELECT order_id FROM public.r2_r3_test_orders WHERE kind='mold');
 INSERT INTO public.order_public_snapshots_v1(order_id,snapshot)
 VALUES((SELECT order_id FROM public.r2_r3_test_orders WHERE kind='mold'),
   '{"version":4,"item_count":3}'::jsonb)
 ON CONFLICT(order_id) DO UPDATE SET snapshot=EXCLUDED.snapshot;
 SELECT last_seq INTO after_seq FROM public.order_public_weekly_counters_v1
 WHERE week_start=(now() AT TIME ZONE 'America/Cuiaba')::date -
   (extract(isodow FROM (now() AT TIME ZONE 'America/Cuiaba')::date)::integer-1);
 IF before_seq IS DISTINCT FROM after_seq OR
   (SELECT public_code FROM public.order_public_snapshots_v1
    WHERE order_id=(SELECT order_id FROM public.r2_r3_test_orders WHERE kind='mold'))<>snap
 THEN RAISE EXCEPTION 'snapshot_refresh_changed_or_consumed_weekly_number'; END IF;

 BEGIN
 UPDATE public.orders SET order_number='01|01|2030 - 999'
 WHERE id=(SELECT order_id FROM public.r2_r3_test_orders WHERE kind='simple');
 RAISE EXCEPTION 'new_weekly_number_mutable';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'order_public_identity_immutable' THEN RAISE; END IF;
 END;
END $stable$;

SELECT 'PASS R02 + R03: 4 real checkouts, snapshot ready after deferred triggers, immutable unique weekly numbers, unchanged kit, mold totals' AS result;
