-- R11 regression: run against original R02->R10 checkout orders in PG17.
-- Legacy planning is allowed; physical release requires R10 evidence.
\set ON_ERROR_STOP on
DO $r11_test$
DECLARE
 authorized uuid;
 unapproved uuid;
 r_ok uuid;
 r_bad uuid;
 r_mixed uuid;
 reply jsonb;
BEGIN
 SELECT order_id INTO authorized FROM public.r2_r5_meta_test_orders WHERE kind='basket';
 SELECT order_id INTO unapproved FROM public.r2_r5_meta_test_orders WHERE kind='mold';
 SELECT run_id INTO r_ok FROM public.r11_test_runs WHERE kind='authorized_only';
 SELECT run_id INTO r_bad FROM public.r11_test_runs WHERE kind='unapproved_only';
 SELECT run_id INTO r_mixed FROM public.r11_test_runs WHERE kind='mixed';

 IF public.ops2_r11_has_dispatch_proof_v1(authorized) IS DISTINCT FROM true
    OR public.ops2_r11_has_dispatch_proof_v1(unapproved) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R10 proof chain not reflected in R11 release barrier'; END IF;

 -- The real Smart Delivery loading RPC must reject unauthorized goods.
 BEGIN
  reply:=public.smart_delivery_confirm_loading_v1(r_bad,null,null);
  RAISE EXCEPTION 'R11 failed to prevent fiscal-unapproved physical loading';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_sefaz_proof_required_before_custody:%'
  THEN RAISE; END IF;
 END;
 IF EXISTS (
   SELECT 1 FROM public.ops_delivery_stops
   WHERE run_id=r_bad AND (loaded_at IS NOT NULL OR custody_confirmed_at IS NOT NULL)
 ) OR (SELECT loading_started_at FROM public.ops_delivery_runs
       WHERE id=r_bad) IS NOT NULL
 THEN RAISE EXCEPTION 'failed loading left partial custody or audit state'; END IF;

 -- Even a direct database update or the legacy stop-sync RPC cannot bypass.
 BEGIN
  UPDATE public.ops_delivery_stops
     SET custody_confirmed_at=now() WHERE run_id=r_bad;
  RAISE EXCEPTION 'direct custody write bypassed R11 trigger';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_sefaz_proof_required_before_custody:%'
  THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ops_sync_delivery_stop_v1(unapproved,'out_for_delivery');
  RAISE EXCEPTION 'legacy stop status sync bypassed R11';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_sefaz_proof_required_before_custody:%'
  THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.ops_delivery_stops(run_id,order_id,sequence,status)
   VALUES(r_bad,unapproved,99,'out_for_delivery');
  RAISE EXCEPTION 'INSERT with released stop status bypassed R11';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_sefaz_proof_required_before_custody:%'
  THEN RAISE; END IF;
 END;

 -- Planning and driver assignment must stay possible before NF-e emission,
 -- but switching the route to DISPATCHED must remain blocked.
 IF (SELECT status FROM public.ops_delivery_runs WHERE id=r_bad)<>'planned'
 THEN RAISE EXCEPTION 'unauthorized route not planned'; END IF;
 BEGIN
  UPDATE public.ops_delivery_runs SET status='dispatched' WHERE id=r_bad;
  RAISE EXCEPTION 'route launched with uncertain Bling sale';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_route_contains_unapproved_fiscal_order:%'
  THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE public.ops_delivery_runs SET status='dispatched' WHERE id=r_mixed;
  RAISE EXCEPTION 'mixed route launched before every stop fiscal approved';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_route_contains_unapproved_fiscal_order:%'
  THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.ops_delivery_runs WHERE id=r_mixed)<>'planned'
 THEN RAISE EXCEPTION 'failed mixed dispatch persisted'; END IF;

 -- Existing valid R10 SEFAZ proof permits loading and route launch.
 reply:=public.smart_delivery_confirm_loading_v1(r_ok,null,null);
 IF reply->>'ok' IS DISTINCT FROM 'true'
    OR (reply->>'touched_stops')::integer<>1
    OR (SELECT loaded_at FROM public.ops_delivery_runs WHERE id=r_ok) IS NULL
    OR (SELECT count(*) FROM public.ops_delivery_stops
        WHERE run_id=r_ok AND loaded_at IS NOT NULL
          AND custody_confirmed_at IS NOT NULL)<>1
 THEN RAISE EXCEPTION 'valid R10 proof could not load route: %',reply; END IF;
 UPDATE public.ops_delivery_runs SET status='dispatched' WHERE id=r_ok;
 IF (SELECT status FROM public.ops_delivery_runs WHERE id=r_ok)<>'dispatched'
 THEN RAISE EXCEPTION 'authorized route could not launch'; END IF;
 -- An already dispatched vehicle CANNOT accept a new unapproved planned
 -- stop, including via the original Smart Delivery move-stop RPC. Without
 -- this trigger, the earlier run.status transition guard would be bypassed.
 BEGIN
  PERFORM public.smart_delivery_move_stop_v1(
    (SELECT id FROM public.ops_delivery_stops WHERE run_id=r_bad LIMIT 1),
    r_ok,null);
  RAISE EXCEPTION 'unapproved stop moved into already dispatched vehicle';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_dispatched_route_rejects_unapproved_stop:%'
  THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.ops_delivery_stops(run_id,order_id,sequence,status)
   VALUES(r_ok,unapproved,99,'planned');
  RAISE EXCEPTION 'unapproved planned stop inserted in dispatched vehicle';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'r11_dispatched_route_rejects_unapproved_stop:%'
  THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.ops_delivery_stops
     WHERE run_id=r_ok)<>1
    OR (SELECT count(*) FROM public.ops_delivery_stops
        WHERE run_id=r_bad)<>1
 THEN RAISE EXCEPTION 'failed stop transfer partially modified routes'; END IF;

 -- Idempotent repeat does not alter the authorization ledger.
 reply:=public.smart_delivery_confirm_loading_v1(r_ok,null,null);
 IF reply->>'ok' IS DISTINCT FROM 'true'
   OR (SELECT count(*) FROM public.order_fiscal_r10_authorization_evidence_v1)<>1
 THEN RAISE EXCEPTION 'loaded route replay changed fiscal proof'; END IF;

 -- Once the unauthorized stop is removed from the planned mixed run, the
 -- already authorized basket may launch; no global route lock deadlock.
 UPDATE public.ops_delivery_stops
   SET status='cancelled' WHERE run_id=r_mixed AND order_id=unapproved;
 UPDATE public.ops_delivery_runs SET status='dispatched' WHERE id=r_mixed;
 IF (SELECT status FROM public.ops_delivery_runs WHERE id=r_mixed)<>'dispatched'
 THEN RAISE EXCEPTION 'authorized remainder of mixed route could not dispatch'; END IF;

 -- Unenrolled historical orders are NOT subject to this new guard; legacy
 -- fiscal/physical protections still run separately.
 IF public.ops2_r11_has_dispatch_proof_v1(null) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'null order incorrectly authorized'; END IF;
 IF has_function_privilege('anon','public.ops2_r11_has_dispatch_proof_v1(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.ops2_r11_has_dispatch_proof_v1(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R11 helper leaked public execution privilege'; END IF;
END $r11_test$;

SELECT 'PASS R11: real loading and stop-sync blocked without SEFAZ, mixed routes gated, approved route progresses' result;
