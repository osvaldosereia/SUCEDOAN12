-- R02+ integration: actual create_vitrine_cart_order_v3_base, v3 wrapper
-- and reserve_vitrine_order_stock_v1. Minimal catalog is synthetic.
\set ON_ERROR_STOP on
DO $checkout$
DECLARE
  order1 jsonb; order2 jsonb; err text; oid uuid; q numeric;
BEGIN
  -- Minimum R$75 must apply to ALL new orders even when attacker sets retry
  -- in JSON under customer-controlled snapshot.
  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(
      null,'PIX',
      '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":1}]'::jsonb,
      '{"stock_adjusted_retry":true}'::jsonb,'{}'::jsonb);
    RAISE EXCEPTION 'SECURITY: client-supplied retry bypassed checkout minimum';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'minimum_order' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(null,'PIX',
      '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":1}]'::jsonb,
      '{}'::jsonb,'{}'::jsonb);
    RAISE EXCEPTION 'checkout_minimum_bypassed_for_regular_customer';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'minimum_order' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.orders)<>0
    OR (SELECT count(*) FROM public.order_items)<>0
    OR (SELECT count(*) FROM public.vitrine_stock_reservations)<>0
  THEN RAISE EXCEPTION 'minimum rejection persisted orphan orders'; END IF;

  order1:=public.create_vitrine_cart_order_v3(
    null,'PIX',
    '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":2}]'::jsonb,
    '{"stock_adjusted_retry":true}'::jsonb,'{}'::jsonb);
  oid:=(order1->>'order_id')::uuid;
  IF (order1->>'total')::numeric<>100
    OR order1->>'stock_reserved' IS DISTINCT FROM 'true'
    OR order1->>'reservation_timing' IS DISTINCT FROM 'on_create'
    OR (SELECT count(*) FROM public.order_items WHERE order_id=oid)<>1
    OR (SELECT quantity FROM public.order_items WHERE order_id=oid)<>2
    OR (SELECT quantity FROM public.vitrine_stock_reservations WHERE order_id=oid)<>2
  THEN RAISE EXCEPTION 'actual checkout base -> reserve integration wrong: %',order1; END IF;

  -- The actual real reservation RPC must replay on existing order, not
  -- create another reserved line or double deduct available stock.
  order2:=public.reserve_vitrine_order_stock_v1(oid);
  IF order2->>'ok' IS DISTINCT FROM 'true'
    OR (SELECT count(*) FROM public.vitrine_stock_reservations WHERE order_id=oid)<>1
  THEN RAISE EXCEPTION 'reservation replay was not idempotent: %',order2; END IF;

  -- Separate item types and invalid values must fail without partial commit.
  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(null,'BOLETO',
      '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":2}]'::jsonb);
    RAISE EXCEPTION 'unsupported payment accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'invalid_payment' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(null,'PIX',
      '[{"type":"product","id":"00000000-0000-4000-8000-0000000000cc","qty":5}]'::jsonb);
    RAISE EXCEPTION 'zero stock accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'product_unavailable' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(null,'PIX',
      '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":31}]'::jsonb);
    RAISE EXCEPTION 'quantity > 30 accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'invalid_quantity' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_vitrine_cart_order_v3(null,'PIX','[]'::jsonb);
    RAISE EXCEPTION 'empty cart accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'cart_empty' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.orders)<>1
    OR (SELECT count(*) FROM public.order_items)<>1
    OR (SELECT count(*) FROM public.vitrine_stock_reservations)<>1
  THEN RAISE EXCEPTION 'failed checkout cases created orders or stock reservations'; END IF;

  -- Create a second order exactly at minimum R$80, and check stock.
  order2:=public.create_vitrine_cart_order_v3(null,'PIX',
    '[{"type":"product","id":"00000000-0000-4000-8000-0000000000bb","qty":1}]'::jsonb);
  IF (order2->>'total')::numeric<>80
    OR order2->>'stock_reserved' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'min-valid second checkout failed: %',order2; END IF;
  IF (SELECT sum(quantity) FROM public.vitrine_stock_reservations WHERE status='reserved')<>3
  THEN RAISE EXCEPTION 'physical reservations inconsistent'; END IF;
END $checkout$;
SELECT 'PASS real v3_base + wrapper + stock reservation, enforced minimum and rollback' result;
