-- R02-R10: genuine checkout-generated orders, R06 picked/missing, R07
-- verified/uncertain and R09 GET-only result, finally R10 fiscal dispatch.
-- The R10 evidence below was inserted by ORIGINAL R10 synthetic assertions.
-- It is NOT a real SEFAZ response. No real invoice is emitted.
\set ON_ERROR_STOP on
DO $r02_r10$
DECLARE
  basket uuid; mold uuid; display_code text; v jsonb;
BEGIN
  SELECT order_id INTO basket FROM public.r2_r5_meta_test_orders WHERE kind='basket';
  SELECT order_id INTO mold FROM public.r2_r5_meta_test_orders WHERE kind='mold';
  IF basket IS NULL OR mold IS NULL THEN
    RAISE EXCEPTION 'original_checkout_receipts_missing';
  END IF;
  SELECT order_number INTO display_code FROM public.orders WHERE id=basket;
  IF (SELECT status FROM public.orders WHERE id=basket) IS DISTINCT FROM 'delivered'
    OR (SELECT status FROM public.dispatch_fiscal_jobs WHERE order_id=basket)
       IS DISTINCT FROM 'authorized'
    OR (SELECT count(*) FROM public.order_fiscal_r10_authorization_evidence_v1
        WHERE order_id=basket)<>1
    OR (SELECT bling_order_id FROM public.order_fiscal_r10_authorization_evidence_v1
        WHERE order_id=basket)<>123451
    OR (SELECT sefaz_cstat FROM public.order_fiscal_r10_authorization_evidence_v1
        WHERE order_id=basket)<>100
  THEN RAISE EXCEPTION 'R10 synthetic authorized chain not linked to original basket'; END IF;
  IF display_code IS DISTINCT FROM (
     SELECT c.metadata->'r6_reconciliation'->>'public_order_number'
     FROM public.order_separation_completions_v1 c WHERE c.order_id=basket)
  THEN RAISE EXCEPTION 'R03 public order code changed during R10 authorization'; END IF;
  IF (SELECT total FROM public.orders WHERE id=basket)<>140
    OR (SELECT other_expenses FROM public.orders WHERE id=basket)<>90
  THEN RAISE EXCEPTION 'commercial adjustments lost after R10'; END IF;
  IF (SELECT status FROM public.order_bling_r7_sync_intents_v1
      WHERE order_id=mold) IS DISTINCT FROM 'uncertain'
    OR EXISTS(SELECT 1 FROM public.order_fiscal_r10_authorization_evidence_v1
              WHERE order_id=mold)
    OR EXISTS(SELECT 1 FROM public.dispatch_fiscal_jobs WHERE order_id=mold)
  THEN RAISE EXCEPTION 'uncertain R07 mold was fiscally processed'; END IF;
  -- The existing order trigger is independent of dispatch_gate_mode='observe'.
  -- Even the UNKNOWN Bling sale must not leave the warehouse.
  BEGIN
    UPDATE public.orders SET status='out_for_delivery' WHERE id=mold;
    RAISE EXCEPTION 'uncertain Bling order escaped dispatch gate';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'r10_sefaz_authorization_required_before_dispatch%'
    THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.orders WHERE id=mold) IS DISTINCT FROM 'ready'
  THEN RAISE EXCEPTION 'dispatch denial did not roll back unknown sale'; END IF;
  v:=public.ops2_r10_claim_fiscal_generation_v1(mold);
  IF v->>'error' IS DISTINCT FROM 'r10_generation_claim_blocked'
  THEN RAISE EXCEPTION 'R07 uncertain order gained fiscal claim: %',v; END IF;
  IF (SELECT count(*) FROM public.dispatch_fiscal_jobs)<>1
  THEN RAISE EXCEPTION 'duplicate canonical fiscal job created'; END IF;
END $r02_r10$;
SELECT 'PASS R02-R10 genuine basket authorized synthetically, original R03 code preserved, uncertain R07 mold cannot dispatch or emit' result;
