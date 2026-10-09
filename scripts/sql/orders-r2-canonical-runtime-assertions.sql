-- R02: execute REAL deployed checkout wrapper and stock reservation code
-- against disposable synthetic fixture. Not a full production transaction test.
\set ON_ERROR_STOP on
-- The fixture's legacy placeholder identity defaults to AA999; disable only
-- its mocked deferred identity trigger to avoid requiring PR #953's obsolete
-- four-digit public-code migration. R03 will test final weekly public identity.
DROP TRIGGER IF EXISTS trg_order_item_public_snapshot_v1 ON public.order_items;

DO $r2$
DECLARE result jsonb; oid uuid; next_result jsonb;
BEGIN
  result:=public.create_vitrine_cart_order_v3(
    'SYNTHETIC-ONLY','PIX','[{"qty":2}]'::jsonb,'{}'::jsonb,'{}'::jsonb
  );
  oid:=nullif(result->>'order_id','')::uuid;
  IF oid IS NULL OR result->>'stock_reserved'<>'true'
     OR result->>'reservation_timing'<>'on_create'
     OR (SELECT count(*) FROM public.orders) <> 2
     OR (SELECT count(*) FROM public.vitrine_stock_reservations WHERE order_id=oid) <> 1
     OR (SELECT quantity FROM public.vitrine_stock_reservations WHERE order_id=oid) <> 2
  THEN RAISE EXCEPTION 'live_wrapper_did_not_reserve_atomically'; END IF;

  next_result:=public.reserve_vitrine_order_stock_v1(oid);
  IF next_result->>'ok'<>'true'
     OR (SELECT coalesce(sum(quantity),0)
         FROM public.vitrine_stock_reservations WHERE status='reserved') <> 2
  THEN RAISE EXCEPTION 'reservation_replay_doubled_stock'; END IF;

  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(
      'SYNTHETIC-ONLY','PIX','[{"qty":9}]'::jsonb,'{}'::jsonb,'{}'::jsonb
    );
    RAISE EXCEPTION 'insufficient_stock_was_not_rejected';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'insufficient_stock' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(
      'SYNTHETIC-ONLY','TEST_ERROR','[{"qty":1}]'::jsonb,'{}'::jsonb,'{}'::jsonb
    );
    RAISE EXCEPTION 'injected_error_was_not_raised';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'simulated_reservation_or_order_failure' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.orders) <> 2
     OR (SELECT count(*) FROM public.order_items) <> 1
     OR (SELECT coalesce(sum(quantity),0) FROM public.vitrine_stock_reservations) <> 2
  THEN RAISE EXCEPTION 'transaction_error_left_orphan_rows'; END IF;
END
$r2$;

SELECT 'PASS: actual production checkout wrapper, stock reservation, retries and rollback in synthetic DB' AS result;
