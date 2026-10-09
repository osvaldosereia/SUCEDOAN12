-- R02: test REAL, unchanged ops2_* separation functions from canonical database
-- against synthetic rows and a documented stub of initialization.
\set ON_ERROR_STOP on
DO $r2sep$
DECLARE
  good_id uuid := '00000000-0000-4000-8000-000000000010';
  bad_id uuid := '00000000-0000-4000-8000-000000000020';
  original_updated_at timestamptz;
  prepared jsonb;
  replay jsonb;
  applied jsonb;
  reapplied jsonb;
  completed jsonb;
  expected_code text := '08|10|2026 - 001';
BEGIN
  -- A stale picker cannot overwrite a newer version of the order.
  prepared:=public.ops2_prepare_order_separation_completion_v2(
    bad_id,'2000-01-01T00:00:00Z'::timestamptz);
  IF prepared->>'error'<>'stale_order_version' THEN
    RAISE EXCEPTION 'stale_version_was_accepted: %',prepared;
  END IF;
  -- A pending item prevents conclusion.
  SELECT updated_at INTO original_updated_at FROM public.orders WHERE id=bad_id;
  prepared:=public.ops2_prepare_order_separation_completion_v2(bad_id,original_updated_at);
  IF prepared->>'error'<>'separation_incomplete'
    OR (SELECT count(*) FROM public.order_separation_completions_v1 WHERE order_id=bad_id)<>0 THEN
    RAISE EXCEPTION 'pending_items_were_billed: %',prepared;
  END IF;
  SELECT updated_at INTO original_updated_at FROM public.orders WHERE id=good_id;
  prepared:=public.ops2_prepare_order_separation_completion_v2(good_id,original_updated_at);
  IF prepared->>'ok'<>'true' OR prepared->>'status'<>'prepared'
     OR (prepared->>'final_total')::numeric<>198
     OR (prepared->>'missing_subtotal')::numeric<>32
     OR prepared->>'order_number'<>expected_code
  THEN RAISE EXCEPTION 'incorrect_real_separation_snapshot: %',prepared; END IF;
  IF (SELECT total FROM public.orders WHERE id=good_id) <>198
     OR (SELECT subtotal FROM public.orders WHERE id=good_id)<>198
     OR (SELECT fiscal_subtotal FROM public.orders WHERE id=good_id)<>198
  THEN RAISE EXCEPTION 'financial_reconciliation_did_not_commit'; END IF;

  -- Exact same RPC replay must preserve the final amount and original public label.
  replay:=public.ops2_prepare_order_separation_completion_v2(good_id,original_updated_at);
  IF replay->>'status'<>'already_prepared' OR (replay->>'final_total')::numeric<>198
     OR (SELECT count(*) FROM public.order_separation_completions_v1 WHERE order_id=good_id)<>1
  THEN RAISE EXCEPTION 'preparation_replay_not_idempotent: %',replay; END IF;
  applied:=public.ops2_apply_order_separation_stock_v2(good_id);
  IF applied->>'ok'<>'true' OR applied->>'status'<>'stock_applied'
     OR applied->>'physical_stock_changed'<>'false'
     OR (SELECT status FROM public.orders WHERE id=good_id)<>'ready'
     OR (SELECT quantity FROM public.vitrine_stock_reservations
         WHERE order_id=good_id AND product_id='00000000-0000-4000-8000-000000000111')<>3
     OR (SELECT status FROM public.vitrine_stock_reservations
         WHERE order_id=good_id AND product_id='00000000-0000-4000-8000-000000000111')<>'consumed'
     OR (SELECT status FROM public.vitrine_stock_reservations
         WHERE order_id=good_id AND product_id='00000000-0000-4000-8000-000000000112')<>'released'
  THEN RAISE EXCEPTION 'real_stock_reconciliation_failed: %',applied; END IF;
  reapplied:=public.ops2_apply_order_separation_stock_v2(good_id);
  IF reapplied->>'status'<>'already_applied'
     OR (SELECT count(*) FROM public.vitrine_stock_reservations
        WHERE order_id=good_id AND status='consumed')<>1
  THEN RAISE EXCEPTION 'stock_reconciliation_replay_made_second_change: %',reapplied; END IF;
  completed:=public.ops2_mark_order_separation_completion_v2(
    good_id,'completed','{"source":"synthetic-r2-ci"}'::jsonb);
  IF completed->>'ok'<>'true' OR completed->>'phase'<>'completed'
     OR (SELECT completed_at FROM public.order_separation_completions_v1
         WHERE order_id=good_id) IS NULL
     OR (SELECT order_number FROM public.order_separation_completions_v1
         WHERE order_id=good_id) IS DISTINCT FROM expected_code
  THEN RAISE EXCEPTION 'separation_phase_not_persistent: %',completed; END IF;
  IF (SELECT count(*) FROM public.order_separation_completions_v1)<>1 THEN
    RAISE EXCEPTION 'synthetic_separation_created_extra_completion';
  END IF;
END
$r2sep$;
SELECT 'PASS: real separation prepare/apply/mark functions with missing items, replay and original order number' AS result;
