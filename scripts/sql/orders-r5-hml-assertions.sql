-- R05 guards must cover BOTH INSERT and UPDATE/UPSERT paths.
-- All orders/accounts here are synthetic fixtures; no live data.
\set ON_ERROR_STOP on
DO $r5$
DECLARE
  o uuid:='10000000-0000-4000-8000-000000000001';
  v jsonb;
  row_one jsonb;
  row_two jsonb;
BEGIN
  -- R04 suite previously confirmed two test orders. Reopen only order 1.
  DELETE FROM public.order_meta_confirmations_v1 WHERE order_id=o;
  UPDATE public.orders SET confirmed_at=NULL,status='confirmed' WHERE id=o;
  IF NOT public.ops2_meta_order_confirmation_required_v1(o) THEN
    RAISE EXCEPTION 'test_gate_not_active';
  END IF;
  v:=public.ops2_order_meta_confirmation_status_v1(o);
  IF v->>'confirmation_required'<>'true'
     OR v->>'confirmation_verified'<>'false' THEN
    RAISE EXCEPTION 'private_meta_status_not_consistent: %',v;
  END IF;
  IF has_function_privilege('anon','public.ops2_order_meta_confirmation_status_v1(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.ops2_order_meta_confirmation_status_v1(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'private_meta_status_exposed'; END IF;
  IF NOT has_function_privilege('authenticated','public.manual_pick_queue_meta_feed_v1()','EXECUTE')
     OR has_function_privilege('anon','public.manual_pick_queue_meta_feed_v1()','EXECUTE')
  THEN RAISE EXCEPTION 'queue_feed_grants_wrong'; END IF;

  v:=public.manual_pick_queue_meta_feed_v1();
  SELECT item.value INTO row_one FROM jsonb_array_elements(v->'orders') item(value)
  WHERE item.value->>'id'=o::text;
  SELECT item.value INTO row_two FROM jsonb_array_elements(v->'orders') item(value)
  WHERE item.value->>'id'='10000000-0000-4000-8000-000000000002';
  IF row_one->>'meta_confirmation_required'<>'true'
     OR row_two->>'meta_confirmation_required'<>'false'
     OR row_two->>'meta_confirmation_verified'<>'true' THEN
    RAISE EXCEPTION 'queue_meta_proof_not_reliable: %',v;
  END IF;

  BEGIN
    UPDATE public.order_separation_assignments_v1
      SET separator_key='NEW' WHERE order_id=o;
    RAISE EXCEPTION 'assignment_upsert_bypass';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.order_separation_assignments_v1(order_id,separator_key)
      VALUES(o,'NEW') ON CONFLICT(order_id) DO UPDATE
      SET separator_key=EXCLUDED.separator_key;
    RAISE EXCEPTION 'assignment_insert_bypass';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.order_separation_items_v1 SET state='missing' WHERE order_id=o;
    RAISE EXCEPTION 'picking_state_update_bypass';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.order_separation_items_v1(id,order_id,state)
      VALUES('50000000-0000-4000-8000-000000000005',o,'separated');
    RAISE EXCEPTION 'picking_state_insert_bypass';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.order_separation_completions_v1
       SET phase='completed' WHERE order_id=o;
    RAISE EXCEPTION 'completion_phase_update_bypass';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.orders SET status='ready' WHERE id=o;
    RAISE EXCEPTION 'direct_status_transition_bypass';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.order_meta_confirmations_v1 WHERE order_id=o)<>0
  THEN RAISE EXCEPTION 'invalid_callback_created_proof'; END IF;

  -- Only the original real-structure signed Meta WAMID may release it.
  v:=public.ops2_apply_order_meta_confirmation_v1(
      '40000000-0000-4000-8000-000000000001');
  IF v->>'applied'<>'true' OR public.ops2_meta_order_confirmation_required_v1(o)
  THEN RAISE EXCEPTION 'confirmation_not_released'; END IF;
  UPDATE public.order_separation_assignments_v1 SET separator_key='NEW' WHERE order_id=o;
  UPDATE public.order_separation_items_v1 SET state='missing' WHERE order_id=o;
  UPDATE public.order_separation_completions_v1 SET phase='completed' WHERE order_id=o;
  UPDATE public.orders SET status='ready' WHERE id=o;
  v:=public.manual_pick_queue_meta_feed_v1();
  SELECT item.value INTO row_one FROM jsonb_array_elements(v->'orders') item(value)
  WHERE item.value->>'id'=o::text;
  IF row_one->>'meta_confirmation_required'<>'false'
     OR row_one->>'meta_confirmation_verified'<>'true' THEN
    RAISE EXCEPTION 'queue_did_not_reconcile_confirmed_order: %',v;
  END IF;
  IF (SELECT count(*) FROM public.order_meta_confirmations_v1)<>2
  THEN RAISE EXCEPTION 'proof_ledger_missing_or_duplicated'; END IF;
END $r5$;
SELECT 'PASS R05: upsert gates, Meta ledger, queue badges, status and authorized separation' result;
