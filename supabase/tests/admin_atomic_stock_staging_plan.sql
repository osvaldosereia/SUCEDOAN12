-- Reproducible staging-only stock transition regression suite (never run in production).
-- Prerequisites: isolated staging stock fixture schema, current reserve/consume/release RPCs,
-- admin_order_stock_transition_atomic_v1, production-equivalent stock status trigger,
-- ops3 storefront queue trigger, and order_separation_completions_v1 stub.
-- All fixture writes are inside a rollback transaction.
BEGIN;
INSERT INTO public.products(id,name,stock) VALUES
('10000000-0000-0000-0000-000000000071','R1 storefront fixture',10),
('10000000-0000-0000-0000-000000000072','R1 legacy fixture',10),
('10000000-0000-0000-0000-000000000073','R1 insufficient fixture',1),
('10000000-0000-0000-0000-000000000074','R1 bling fixture',10),
('10000000-0000-0000-0000-000000000075','R1 manual fixture',10);
INSERT INTO public.orders(id,source,status,checkout_snapshot) VALUES
('20000000-0000-0000-0000-000000000071','vitrine','storefront_received','{"customer_confirmed":true}'::jsonb),
('20000000-0000-0000-0000-000000000072','vitrine','created','{}'::jsonb),
('20000000-0000-0000-0000-000000000073','vitrine','created','{}'::jsonb),
('20000000-0000-0000-0000-000000000074','vitrine','created','{}'::jsonb),
('20000000-0000-0000-0000-000000000075','manual_whatsapp','created','{}'::jsonb),
('20000000-0000-0000-0000-000000000076','vitrine','created','{}'::jsonb);
INSERT INTO public.order_items(order_id,product_id,quantity) VALUES
('20000000-0000-0000-0000-000000000071','10000000-0000-0000-0000-000000000071',3),
('20000000-0000-0000-0000-000000000072','10000000-0000-0000-0000-000000000072',4),
('20000000-0000-0000-0000-000000000073','10000000-0000-0000-0000-000000000073',2),
('20000000-0000-0000-0000-000000000074','10000000-0000-0000-0000-000000000074',2),
('20000000-0000-0000-0000-000000000075','10000000-0000-0000-0000-000000000075',2);
DO $r1$
DECLARE r jsonb; v text;
BEGIN
  -- Real site status (not normalized UI alias), patch, queue and release.
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000071','storefront_received','confirmed','{"payment_method":"pix","delivery_address":{"street":"Rua Staging","number":"10"}}'::jsonb);
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'storefront_confirm_failed %',r; END IF;
  IF (SELECT selected_source FROM public.order_manual_separation_queue_v1 WHERE order_id='20000000-0000-0000-0000-000000000071') IS DISTINCT FROM 'customer_confirmed' THEN RAISE EXCEPTION 'storefront_queue_failed'; END IF;
  IF (SELECT payment_method FROM public.orders WHERE id='20000000-0000-0000-0000-000000000071') IS DISTINCT FROM 'pix' THEN RAISE EXCEPTION 'payment_patch_failed'; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000071','storefront_received','cancelled');
  IF r->>'error' IS DISTINCT FROM 'stale_order_status' THEN RAISE EXCEPTION 'stale_guard_failed %',r; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000071','confirmed','cancelled');
  IF r->>'ok' IS DISTINCT FROM 'true' OR (SELECT status FROM public.vitrine_stock_reservations WHERE order_id='20000000-0000-0000-0000-000000000071') IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'storefront_cancel_release_failed %',r; END IF;

  -- Legacy consumption and physical-stock restoration.
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000072','created','confirmed');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'legacy_confirm_failed %',r; END IF;
  UPDATE public.orders SET status='processing' WHERE id='20000000-0000-0000-0000-000000000072';
  IF (SELECT stock FROM public.products WHERE id='10000000-0000-0000-0000-000000000072')<>6 THEN RAISE EXCEPTION 'legacy_consume_failed'; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000072','processing','cancelled');
  IF r->>'ok' IS DISTINCT FROM 'true' OR (SELECT stock FROM public.products WHERE id='10000000-0000-0000-0000-000000000072')<>10 THEN RAISE EXCEPTION 'legacy_stock_restore_failed %',r; END IF;

  -- Insufficient stock must leave no order status/reservation changes.
  BEGIN
    PERFORM public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000073','created','confirmed');
    RAISE EXCEPTION 'insufficient_stock_was_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%stock_transition_failed: insufficient_stock%' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.orders WHERE id='20000000-0000-0000-0000-000000000073')<>'created' OR EXISTS(SELECT 1 FROM public.vitrine_stock_reservations WHERE order_id='20000000-0000-0000-0000-000000000073') THEN RAISE EXCEPTION 'insufficient_stock_rollback_failed'; END IF;

  -- Patch allowlist and empty-order guard.
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000076','created','confirmed','{"status":"cancelled"}'::jsonb);
  IF r->>'error' IS DISTINCT FROM 'invalid_patch' THEN RAISE EXCEPTION 'patch_allowlist_failed %',r; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000076','created','confirmed');
  IF r->>'error' IS DISTINCT FROM 'empty_order' OR (SELECT status FROM public.orders WHERE id='20000000-0000-0000-0000-000000000076')<>'created' THEN RAISE EXCEPTION 'empty_order_guard_failed %',r; END IF;

  -- Manual order cancellation: no vitrine trigger, explicit atomic release.
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000075','created','confirmed');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'manual_confirm_failed %',r; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000075','confirmed','cancelled');
  IF r->>'ok' IS DISTINCT FROM 'true' OR (SELECT status FROM public.vitrine_stock_reservations WHERE order_id='20000000-0000-0000-0000-000000000075') IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'manual_cancel_release_failed %',r; END IF;

  -- Bling authority: reservation and consumption tracked, no local physical decrement.
  UPDATE public.bling_hub_runtime_v2 SET metadata='{"ops2_stock_authority":"bling"}'::jsonb WHERE id=1;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000074','created','confirmed');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'bling_confirm_failed %',r; END IF;
  UPDATE public.orders SET status='processing' WHERE id='20000000-0000-0000-0000-000000000074';
  IF (SELECT stock FROM public.products WHERE id='10000000-0000-0000-0000-000000000074')<>10 OR (SELECT status FROM public.vitrine_stock_reservations WHERE order_id='20000000-0000-0000-0000-000000000074') IS DISTINCT FROM 'consumed' THEN RAISE EXCEPTION 'bling_consume_contract_failed'; END IF;
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000074','processing','cancelled');
  IF r->>'ok' IS DISTINCT FROM 'true' OR (SELECT stock FROM public.products WHERE id='10000000-0000-0000-0000-000000000074')<>10 OR (SELECT status FROM public.vitrine_stock_reservations WHERE order_id='20000000-0000-0000-0000-000000000074') IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'bling_cancel_contract_failed %',r; END IF;

  -- Role restriction on the exposed atomic RPC.
  IF has_function_privilege('anon','public.admin_order_stock_transition_atomic_v1(uuid,text,text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.admin_order_stock_transition_atomic_v1(uuid,text,text,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.admin_order_stock_transition_atomic_v1(uuid,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'rpc_execute_role_mismatch'; END IF;
END $r1$;
SELECT 'R1_STAGING_TESTS_PASSED' AS suite_status;
ROLLBACK;
