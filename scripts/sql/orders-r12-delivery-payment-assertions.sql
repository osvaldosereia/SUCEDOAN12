-- R12 full regression: one canonical captured split tender -> one delivery,
-- no duplicate settlement or fiscal bypass; zero external provider writes.
\set ON_ERROR_STOP on

CREATE TRIGGER trg_ops_payment_required_before_delivered
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.ops_enforce_delivery_payment_before_delivered_v1();

DO $r12_split_hml$
DECLARE
 oid uuid; p jsonb; replay jsonb; done jsonb; first_id uuid;
BEGIN
 SELECT order_id INTO oid FROM public.r12_test_payments WHERE scenario='authorized';
 IF public.ops2_r11_has_dispatch_proof_v1(oid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R10 approval missing for legitimate settlement'; END IF;

 -- Direct delivery without payment is forbidden by canonical DB trigger.
 BEGIN
   UPDATE public.orders SET status='delivered' WHERE id=oid;
   RAISE EXCEPTION 'unpaid delivery bypassed canonical payment trigger';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'delivery_payment_required_before_delivered'
   THEN RAISE; END IF;
 END;

 p:=public.ops_record_delivery_payment_v1(oid,
   '[{"method":"pix","amount_cents":7000},{"method":"cash","amount_cents":7000}]',
   'Motorista TESTE','r12:split:paid');
 first_id:=(p->>'settlement_id')::uuid;
 IF p->>'status' IS DISTINCT FROM 'captured'
   OR (p->>'captured_total_cents')::bigint<>14000
   OR (SELECT count(*) FROM public.order_payment_parts WHERE settlement_id=first_id)<>2
 THEN RAISE EXCEPTION 'real split settlement failed: %',p; END IF;

 replay:=public.ops_record_delivery_payment_v1(oid,
   '[{"method":"pix","amount_cents":7000},{"method":"cash","amount_cents":7000}]',
   'Motorista TESTE','r12:split:paid');
 IF replay->>'already_captured' IS DISTINCT FROM 'true'
   OR (replay->>'settlement_id')::uuid IS DISTINCT FROM first_id
 THEN RAISE EXCEPTION 'repeated payment resulted in a new receipt: %',replay; END IF;

 BEGIN
  PERFORM public.ops_record_delivery_payment_v1(oid,
    '[{"method":"pix","amount_cents":8000},{"method":"cash","amount_cents":6000}]',
    'Motorista TESTE','r12:split:changed');
  RAISE EXCEPTION 'different second payment accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'payment_already_captured' THEN RAISE; END IF;
 END;

 BEGIN
   UPDATE public.order_payment_parts SET amount_cents=1
   WHERE settlement_id=first_id AND sequence=1;
   RAISE EXCEPTION 'captured split payment mutable';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'r12_captured_payment_parts_immutable' THEN RAISE; END IF;
 END;

 BEGIN
   UPDATE public.order_payment_settlements SET captured_total_cents=13000
   WHERE id=first_id;
   RAISE EXCEPTION 'captured payment total mutable';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'r12_delivery_payment_amount_mismatch' AND
      SQLERRM IS DISTINCT FROM 'r12_captured_payment_immutable'
   THEN RAISE; END IF;
 END;

 BEGIN
   -- Directly adding a third portion would make total > order total.
   -- The deferred constraint must reject it before COMMIT; no partial DML.
   INSERT INTO public.order_payment_parts(
     settlement_id,sequence,method,amount_cents)
   VALUES(first_id,3,'cash',1);
   SET CONSTRAINTS ALL IMMEDIATE;
   RAISE EXCEPTION 'deferred payment mismatch not detected';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'r12_delivery_payment_parts_mismatch'
   THEN RAISE; END IF;
 END;

 BEGIN
   INSERT INTO public.order_delivery_return_cases(order_id,status,attempt_number)
   VALUES (oid,'returning',1);
   RAISE EXCEPTION 'failed delivery allowed after money captured';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'r12_return_after_payment_requires_review'
   THEN RAISE; END IF;
 END;

 BEGIN
   PERFORM public.ops_register_failed_delivery_v1(oid,'payment_failed','synthetic','motorista');
   RAISE EXCEPTION 'real return RPC allowed after payment';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'payment_already_captured'
   THEN RAISE; END IF;
 END;

 -- Critical R12 fix: original complete-delivery RPC now reuses the earlier
 -- verified split payment without creating a second settlement.
 done:=public.ops3_complete_delivery_v1(oid,'pix',14000,'Motorista TESTE','r12:delivered');
 IF done->>'status' IS DISTINCT FROM 'delivered'
   OR done->>'payment_method' IS DISTINCT FROM 'mixed'
   OR (done->>'settlement_id')::uuid IS DISTINCT FROM first_id
   OR (SELECT status FROM public.orders WHERE id=oid)<>'delivered'
   OR (SELECT count(*) FROM public.order_payment_settlements WHERE order_id=oid)<>1
 THEN RAISE EXCEPTION 'split payment blocked or duplicated real delivery: %',done; END IF;

 replay:=public.ops3_complete_delivery_v1(oid,'pix',14000,'Motorista TESTE','r12:delivered');
 IF replay->>'already_delivered' IS DISTINCT FROM 'true'
   OR (replay->>'settlement_id')::uuid IS DISTINCT FROM first_id
 THEN RAISE EXCEPTION 'delivery replay changed settlement: %',replay; END IF;

 IF (SELECT sum(amount_cents) FROM public.order_payment_parts
    WHERE settlement_id=first_id)<>14000 THEN
    RAISE EXCEPTION 'captured split amounts drifted'; END IF;
END $r12_split_hml$;

-- Deferred integrity check catches a fabricated settlement without matching
-- parts, even if a service role bypasses the canonical payment RPC.
DO $r12_unsafe_payment_test$
DECLARE oid uuid;
BEGIN
 SELECT order_id INTO oid FROM public.r12_test_payments WHERE scenario='uncertain';
 BEGIN
  INSERT INTO public.order_payment_settlements(
   order_id,status,expected_total_cents,captured_total_cents,
   source,bling_sync_state,idempotency_key)
  VALUES(oid,'captured',7500,7500,'delivery','blocked_homologation','r12:unsafe');
  RAISE EXCEPTION 'payment registered without out-for-delivery status';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM IS DISTINCT FROM 'r12_payment_order_not_in_delivery'
  THEN RAISE; END IF;
 END;
END $r12_unsafe_payment_test$;

-- In an isolated transaction ONLY, mimic an old integration that wrote the
-- pending mold as out_for_delivery without R10. R12 must stop payment even
-- though the order status is now permissive. No synthetic state persists.
BEGIN;
ALTER TABLE public.orders DISABLE TRIGGER trg_ops2_r10_require_sefaz_before_dispatch;
UPDATE public.orders SET status='out_for_delivery'
 WHERE id=(SELECT order_id FROM public.r12_test_payments WHERE scenario='uncertain');
ALTER TABLE public.orders ENABLE TRIGGER trg_ops2_r10_require_sefaz_before_dispatch;
DO $r12_unapproved$
DECLARE oid uuid;
BEGIN
 SELECT order_id INTO oid FROM public.r12_test_payments WHERE scenario='uncertain';
 IF public.ops2_r11_has_dispatch_proof_v1(oid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'unapproved mold unexpectedly has fiscal proof'; END IF;
 BEGIN
  INSERT INTO public.order_payment_settlements(
   order_id,status,expected_total_cents,captured_total_cents,
   source,bling_sync_state,idempotency_key)
  VALUES(oid,'captured',7500,7500,'delivery','blocked_homologation','r12:wrong-fiscal');
  RAISE EXCEPTION 'R07 uncertain payment captured without R10 proof';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM IS DISTINCT FROM 'r12_delivery_payment_sefaz_proof_required' THEN RAISE; END IF;
 END;
 INSERT INTO public.order_delivery_return_cases(order_id,status,attempt_number)
 VALUES(oid,'returning',1);
 BEGIN
  INSERT INTO public.order_payment_settlements(
   order_id,status,expected_total_cents,captured_total_cents,
   source,bling_sync_state,idempotency_key)
  VALUES(oid,'captured',7500,7500,'delivery','blocked_homologation','r12:return-open');
  RAISE EXCEPTION 'return-open payment recorded without settlement check';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM IS DISTINCT FROM 'r12_delivery_payment_return_open'
  THEN RAISE; END IF;
 END;
END $r12_unapproved$;
ROLLBACK;

DO $r12_final$
DECLARE oid uuid;
BEGIN
 SELECT order_id INTO oid FROM public.r12_test_payments WHERE scenario='authorized';
 IF (SELECT count(*) FROM public.order_payment_settlements)<>1
   OR (SELECT count(*) FROM public.order_payment_parts)<>2
   OR (SELECT status FROM public.orders WHERE id=oid)<>'delivered'
   OR (SELECT count(*) FROM public.order_fiscal_r10_authorization_evidence_v1)<>1
   OR (SELECT count(*) FROM public.order_delivery_return_cases)<>0
 THEN RAISE EXCEPTION 'R12 integration left duplicate payment, fiscal proof or open return'; END IF;
 IF has_function_privilege('anon','public.ops2_r12_guard_delivery_settlement_v1()','EXECUTE')
   OR has_function_privilege('authenticated',
      'public.ops2_r12_guard_return_after_payment_v1()','EXECUTE')
 THEN RAISE EXCEPTION 'internal R12 guard callable by client'; END IF;
END $r12_final$;
SELECT 'PASS R12: real split payment RPC, one receipt, real delivery completion, return and fiscal locks' result;
