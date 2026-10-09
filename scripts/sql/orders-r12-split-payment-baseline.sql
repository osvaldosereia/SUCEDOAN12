-- R12 real-life gap: split PIX+cash can be CAPTURED by the canonical
-- ops_record_delivery_payment_v1 but the original ops3_complete_delivery_v1
-- refuses to finish delivery, because it incorrectly expects one part.
-- Every change in this file rolls back in disposable PostgreSQL 17.
\set ON_ERROR_STOP on
BEGIN;
DO $r12_split_baseline$
DECLARE oid uuid; p jsonb; completed jsonb;
BEGIN
 SELECT order_id INTO oid FROM public.r12_test_payments WHERE scenario='authorized';
 p:=public.ops_record_delivery_payment_v1(oid,
   '[{"method":"pix","amount_cents":7000},{"method":"cash","amount_cents":7000}]',
   'TEST DRIVER','r12:test:split');
 IF p->>'status' IS DISTINCT FROM 'captured'
  OR (SELECT count(*) FROM public.order_payment_parts WHERE settlement_id=(p->>'settlement_id')::uuid)<>2
 THEN RAISE EXCEPTION 'canonical mixed payment capture failed in baseline: %',p; END IF;
 BEGIN
  completed:=public.ops3_complete_delivery_v1(oid,'pix',14000,'TEST DRIVER','r12:test:delivery');
  RAISE EXCEPTION 'legacy completion unexpectedly accepted split tender: %',completed;
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM IS DISTINCT FROM 'payment_already_captured' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.orders WHERE id=oid)<>'out_for_delivery'
 THEN RAISE EXCEPTION 'failed completion still marked delivered'; END IF;
END $r12_split_baseline$;
ROLLBACK;
SELECT 'BASELINE: existing checkout captures split payment but original delivery-complete rejects it (rolled back)' result;
