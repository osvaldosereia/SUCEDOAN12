-- Isolated staging only. Requires exact production stock views and basket stock trigger.
-- Fictional fixtures and BEGIN/ROLLBACK prevent persistent data changes.
BEGIN;
INSERT INTO public.products(id,name,stock) VALUES('10000000-0000-0000-0000-000000000076','R1 basket component',10);
INSERT INTO public.basket_stock_lots(id,assembly_status,status,quantity_built,quantity_available)
 VALUES('30000000-0000-0000-0000-000000000076','assembled','ready',3,2);
INSERT INTO public.basket_stock_lot_items(lot_id,product_id,quantity_per_basket)
 VALUES('30000000-0000-0000-0000-000000000076','10000000-0000-0000-0000-000000000076',2);
INSERT INTO public.orders(id,source,status) VALUES
 ('20000000-0000-0000-0000-000000000078','vitrine','created'),
 ('20000000-0000-0000-0000-000000000079','vitrine','created');
INSERT INTO public.order_items(order_id,product_id,quantity,metadata) VALUES
 ('20000000-0000-0000-0000-000000000078','10000000-0000-0000-0000-000000000076',5,'{}'),
 ('20000000-0000-0000-0000-000000000079','10000000-0000-0000-0000-000000000076',2,'{"history_kind":"basket_component","preassembled_units":2}');
INSERT INTO public.basket_stock_allocations(lot_id,order_id,quantity,status)
 VALUES('30000000-0000-0000-0000-000000000076','20000000-0000-0000-0000-000000000079',1,'allocated');
DO $r1_basket$ DECLARE r jsonb; BEGIN
  IF (SELECT basket_locked_quantity FROM public.basket_locked_component_stock_v1 WHERE product_id='10000000-0000-0000-0000-000000000076') IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'basket_locked_quantity mismatch'; END IF;
  BEGIN
    PERFORM public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000078','created','confirmed');
    RAISE EXCEPTION 'basket_reserved_stock_was_oversold';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%stock_transition_failed: insufficient_stock%' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.orders WHERE id='20000000-0000-0000-0000-000000000078') IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'basket oversell rollback failed'; END IF;
  UPDATE public.order_items SET quantity=4 WHERE order_id='20000000-0000-0000-0000-000000000078';
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000078','created','confirmed');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'basket loose quantity rejected %',r; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000079','created','confirmed');
  IF r->>'ok' IS DISTINCT FROM 'true' OR r->'stock'->>'status' IS DISTINCT FROM 'preassembled_only' THEN RAISE EXCEPTION 'preassembled reservation incorrect %',r; END IF;
  UPDATE public.orders SET status='processing' WHERE id='20000000-0000-0000-0000-000000000079';
  IF (SELECT stock FROM public.products WHERE id='10000000-0000-0000-0000-000000000076')<>10 THEN RAISE EXCEPTION 'preassembled incorrectly consumed physical stock'; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000079','processing','cancelled');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'preassembled cancellation failed %',r; END IF;
  IF (SELECT status FROM public.basket_stock_allocations WHERE order_id='20000000-0000-0000-0000-000000000079') IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'basket allocation not released'; END IF;
END $r1_basket$;
SELECT 'BASKET_STOCK_PARITY_PASSED' AS test_result;
ROLLBACK;
