-- Staging-only operational gate regression: real production SQL, fictitious data, rollback.
-- Requires ops_enforce_order_check_before_ready_v1, ops_enforce_delivery_payment_before_delivered_v1
-- and check_order_dispatch_fiscal_gate_v1/enforce_order_dispatch_fiscal_gate_trigger_v1.
BEGIN;
INSERT INTO public.products(id,name,stock) VALUES('10000000-0000-0000-0000-000000000081','Ready gate fixture',6);
INSERT INTO public.orders(id,source,status,total) VALUES
 ('20000000-0000-0000-0000-000000000081','vitrine','created',20),
 ('20000000-0000-0000-0000-000000000082','manual_whatsapp','out_for_delivery',100),
 ('20000000-0000-0000-0000-000000000083','manual_whatsapp','ready',50);
INSERT INTO public.order_items(order_id,product_id,quantity)
 VALUES('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081',2);
DO $operational$
DECLARE r jsonb; v_settlement uuid;
BEGIN
  -- Confirmation -> processing -> ready must require a verified separation check.
  r:=public.admin_order_stock_transition_atomic_v1('20000000-0000-0000-0000-000000000081','created','confirmed');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ready_fixture_confirmation_failed %',r; END IF;
  UPDATE public.orders SET status='processing' WHERE id='20000000-0000-0000-0000-000000000081';
  BEGIN
    UPDATE public.orders SET status='ready' WHERE id='20000000-0000-0000-0000-000000000081';
    RAISE EXCEPTION 'ready_without_check_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%order_check_required_before_ready%' THEN RAISE; END IF;
  END;
  INSERT INTO public.ops_order_check_sessions(order_id,status,verified_at)
    VALUES('20000000-0000-0000-0000-000000000081','verified',now());
  UPDATE public.orders SET status='ready' WHERE id='20000000-0000-0000-0000-000000000081';
  IF (SELECT stock FROM public.products WHERE id='10000000-0000-0000-0000-000000000081')<>4 THEN RAISE EXCEPTION 'duplicate_stock_consume_on_ready'; END IF;

  -- Delivery payment settlement and parts must match exactly.
  BEGIN
    UPDATE public.orders SET status='delivered' WHERE id='20000000-0000-0000-0000-000000000082';
    RAISE EXCEPTION 'delivery_without_payment_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%delivery_payment_required_before_delivered%' THEN RAISE; END IF;
  END;
  INSERT INTO public.order_payment_settlements(order_id,source,status,expected_total_cents,captured_total_cents)
    VALUES('20000000-0000-0000-0000-000000000082','delivery','captured',10000,10000) RETURNING id INTO v_settlement;
  INSERT INTO public.order_payment_parts(settlement_id,amount_cents) VALUES(v_settlement,10000);
  UPDATE public.orders SET status='delivered' WHERE id='20000000-0000-0000-0000-000000000082';

  -- Fiscal authorization and Bling physical launch must both pass in enforce mode.
  BEGIN
    UPDATE public.orders SET status='out_for_delivery' WHERE id='20000000-0000-0000-0000-000000000083';
    RAISE EXCEPTION 'dispatch_without_fiscal_authorization_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%fiscal_dispatch_not_authorized%' THEN RAISE; END IF;
  END;
  INSERT INTO public.order_fiscal_controls(order_id,dispatch_fiscal_status,dispatch_fiscal_authorized_at)
    VALUES('20000000-0000-0000-0000-000000000083','authorized',now());
  UPDATE public.bling_hub_runtime_v2 SET metadata='{"ops2_stock_authority":"bling"}'::jsonb WHERE id=1;
  BEGIN
    UPDATE public.orders SET status='out_for_delivery' WHERE id='20000000-0000-0000-0000-000000000083';
    RAISE EXCEPTION 'dispatch_without_bling_physical_launch_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%fiscal_dispatch_not_authorized%' THEN RAISE; END IF;
  END;
  INSERT INTO public.bling_order_stock_controls_v2(source_order_id,state)
    VALUES('20000000-0000-0000-0000-000000000083','launched');
  r:=public.check_order_dispatch_fiscal_gate_v1('20000000-0000-0000-0000-000000000083');
  IF r->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'fiscal_gate_rejected_authorized_order %',r; END IF;
  UPDATE public.orders SET status='out_for_delivery' WHERE id='20000000-0000-0000-0000-000000000083';
END $operational$;
SELECT 'OPERATIONAL_GATES_PASSED' AS suite_status;
ROLLBACK;
