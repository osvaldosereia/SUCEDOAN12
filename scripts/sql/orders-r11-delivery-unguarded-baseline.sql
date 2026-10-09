-- BEFORE the R11 patch, the legacy delivery tables allow loading/dispatch
-- via their own status columns even though R10 blocks orders.status changes.
-- Reproduce in rollback-only transaction with real R02 -> R10 test receipts.
\set ON_ERROR_STOP on
BEGIN;
DO $r11_baseline$
DECLARE
 v_order uuid;
 v_run uuid;
BEGIN
 SELECT order_id INTO v_order FROM public.r2_r5_meta_test_orders WHERE kind='mold';
 SELECT run_id INTO v_run FROM public.r11_test_runs WHERE kind='unapproved_only';
 IF (SELECT status FROM public.order_bling_r7_sync_intents_v1
      WHERE order_id=v_order) IS DISTINCT FROM 'uncertain'
 THEN RAISE EXCEPTION 'R11 baseline requires an uncertain R07 sale'; END IF;
 IF EXISTS (SELECT 1 FROM public.order_fiscal_r10_authorization_evidence_v1
             WHERE order_id=v_order)
 THEN RAISE EXCEPTION 'R11 baseline requires absent authorization'; END IF;
 UPDATE public.ops_delivery_stops SET loaded_at=now(),custody_confirmed_at=now()
 WHERE run_id=v_run;
 UPDATE public.ops_delivery_runs SET status='dispatched' WHERE id=v_run;
 IF (SELECT status FROM public.ops_delivery_runs WHERE id=v_run)<>'dispatched'
 OR (SELECT count(*) FROM public.ops_delivery_stops WHERE run_id=v_run
     AND loaded_at IS NOT NULL)<>1
 THEN RAISE EXCEPTION 'unexpected existing R11 delivery gate, review before patch'; END IF;
END $r11_baseline$;
ROLLBACK;
SELECT 'BASELINE: unapproved NF-e can reach loading/route-dispatched states by separate columns (rolled back)' result;
