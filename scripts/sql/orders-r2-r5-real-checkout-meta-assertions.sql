-- R02/R03/R04/R05 integrated assertions with real checkout, original
-- R03 migration and ORIGINAL pinned R04/R05 SQL. Fake Meta messages only.
\set ON_ERROR_STOP on
DO $meta_r2_r5$
DECLARE
  simple_id uuid;
  v_basket_order_id uuid;
  mold_id uuid;
  v jsonb;
  row_simple jsonb;
  row_basket jsonb;
  old_code text;
BEGIN
  SELECT order_id INTO simple_id FROM public.r2_r5_meta_test_orders WHERE kind='simple';
  SELECT order_id INTO v_basket_order_id FROM public.r2_r5_meta_test_orders WHERE kind='basket';
  SELECT order_id INTO mold_id FROM public.r2_r5_meta_test_orders WHERE kind='mold';
  IF simple_id IS NULL OR v_basket_order_id IS NULL OR mold_id IS NULL THEN
    RAISE EXCEPTION 'test_checkout_orders_missing';
  END IF;
  -- The R03 code is already frozen and the snapshot must agree.
  IF EXISTS(
    SELECT 1 FROM public.r2_r5_meta_test_orders t
    JOIN public.orders o ON o.id=t.order_id
    JOIN public.order_public_snapshots_v1 snap ON snap.order_id=o.id
    WHERE o.order_number IS DISTINCT FROM snap.public_code
      OR o.order_number !~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
  ) THEN RAISE EXCEPTION 'r03_public_identity_inconsistent_before_meta'; END IF;

  -- Meta enforcement starts OFF: do not accidentally prevent historical orders.
  IF (SELECT enforce_new_orders FROM public.order_meta_confirmation_runtime_v1 WHERE id=1)
    OR public.ops2_meta_order_confirmation_required_v1(simple_id)
  THEN RAISE EXCEPTION 'r04_flag_was_enabled_by_default'; END IF;

  IF has_function_privilege('anon','public.ops2_apply_order_meta_confirmation_v1(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.ops2_apply_order_meta_confirmation_v1(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.ops2_order_meta_confirmation_status_v1(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.ops2_order_meta_confirmation_status_v1(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.ops2_apply_order_meta_confirmation_v1(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'meta_proof_rpc_exposed_to_browser'; END IF;

  -- Pre-existing assignment/pending item, an important R05 UPDATE bypass.
  INSERT INTO public.order_separation_assignments_v1(order_id,separator_key)
    VALUES(simple_id,'LEGACY');
  INSERT INTO public.order_separation_items_v1
    (id,order_id,state,quantity) VALUES
    ('50000000-0000-4000-8000-000000000001',simple_id,'pending',2),
    ('50000000-0000-4000-8000-000000000002',v_basket_order_id,'pending',1);

  UPDATE public.order_meta_confirmation_runtime_v1
   SET enforce_new_orders=true,enabled_at=now()-interval '1 day' WHERE id=1;

  IF NOT public.ops2_meta_order_confirmation_required_v1(simple_id)
    OR NOT public.ops2_meta_order_confirmation_required_v1(v_basket_order_id)
    OR NOT public.ops2_meta_order_confirmation_required_v1(mold_id)
  THEN RAISE EXCEPTION 'customer_orders_not_protected'; END IF;

  v:=public.ops2_order_meta_confirmation_status_v1(simple_id);
  IF v->>'confirmation_required' IS DISTINCT FROM 'true'
     OR v->>'confirmation_verified' IS DISTINCT FROM 'false'
  THEN RAISE EXCEPTION 'meta_server_ledger_status_wrong: %',v; END IF;

  v:=public.manual_pick_queue_meta_feed_v1();
  SELECT rowval.value INTO row_simple FROM jsonb_array_elements(v->'orders') rowval(value)
    WHERE rowval.value->>'id'=simple_id::text;
  SELECT rowval.value INTO row_basket FROM jsonb_array_elements(v->'orders') rowval(value)
    WHERE rowval.value->>'id'=v_basket_order_id::text;
  IF row_simple->>'meta_confirmation_required' IS DISTINCT FROM 'true'
    OR row_simple->>'public_code' IS DISTINCT FROM
      (SELECT order_number FROM public.orders WHERE id=simple_id)
    OR row_basket->>'meta_confirmation_required' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'queue_did_not_match_original_public_codes: %',v; END IF;

  -- Direct status mutation, assignment UPSERT, picked UPDATE/INSERT and
  -- completion all need valid ledger proof, not mere status confirmed.
  BEGIN
    UPDATE public.orders SET status='ready' WHERE id=simple_id;
    RAISE EXCEPTION 'UNCONFIRMED_STATUS_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.order_separation_assignments_v1 SET separator_key='CLAUDIO'
      WHERE order_id=simple_id;
    RAISE EXCEPTION 'UNCONFIRMED_ASSIGNMENT_UPDATE_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.order_separation_assignments_v1(order_id,separator_key)
      VALUES(v_basket_order_id,'KELLY')
      ON CONFLICT(order_id) DO UPDATE SET separator_key=EXCLUDED.separator_key;
    RAISE EXCEPTION 'UNCONFIRMED_ASSIGNMENT_INSERT_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.order_separation_items_v1 SET state='separated' WHERE order_id=simple_id;
    RAISE EXCEPTION 'UNCONFIRMED_PICKING_UPDATE_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.order_separation_items_v1(id,order_id,state)
    VALUES('50000000-0000-4000-8000-000000000003',v_basket_order_id,'missing');
    RAISE EXCEPTION 'UNCONFIRMED_PICKING_INSERT_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.order_separation_completions_v1(order_id,final_total)
    VALUES(simple_id,100);
    RAISE EXCEPTION 'UNCONFIRMED_COMPLETION_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;

  -- An intercepted text reply or the button from a different Meta number
  -- must never authorize a basket/order.
  v:=public.ops2_apply_order_meta_confirmation_v1(
     '40000000-0000-4000-8000-000000000004');
  IF v->>'error' IS DISTINCT FROM 'unverified_order_button' THEN
    RAISE EXCEPTION 'text_confirmed_order: %',v; END IF;
  v:=public.ops2_apply_order_meta_confirmation_v1(
     '40000000-0000-4000-8000-000000000005');
  IF v->>'matched' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'cross_account_reply_accepted: %',v; END IF;
  IF (SELECT count(*) FROM public.order_meta_confirmations_v1)<>0
  THEN RAISE EXCEPTION 'fraudulent_confirmation_created_a_ledger'; END IF;

  old_code:=(SELECT order_number FROM public.orders WHERE id=simple_id);
  v:=public.ops2_apply_order_meta_confirmation_v1(
     '40000000-0000-4000-8000-000000000001');
  IF v->>'applied' IS DISTINCT FROM 'true'
    OR v->>'channel_origin' IS DISTINCT FROM '0975'
    OR public.ops2_meta_order_confirmation_required_v1(simple_id)
  THEN RAISE EXCEPTION 'legitimate_0975_button_failed: %',v; END IF;

  v:=public.ops2_apply_order_meta_confirmation_v1(
     '40000000-0000-4000-8000-000000000001');
  IF v->>'duplicate' IS DISTINCT FROM 'true'
    OR (SELECT count(*) FROM public.order_meta_confirmations_v1
        WHERE order_id=simple_id)<>1
  THEN RAISE EXCEPTION 'webhook_retry_created_duplicate_approval: %',v; END IF;

  UPDATE public.order_separation_assignments_v1 SET separator_key='CLAUDIO'
    WHERE order_id=simple_id;
  UPDATE public.order_separation_items_v1 SET state='separated' WHERE order_id=simple_id;
  INSERT INTO public.order_separation_completions_v1(order_id,final_total,phase)
    VALUES(simple_id,100,'completed');
  UPDATE public.orders SET status='ready' WHERE id=simple_id;
  IF (SELECT order_number FROM public.orders WHERE id=simple_id) IS DISTINCT FROM old_code
  THEN RAISE EXCEPTION 'meta_confirmation_reassigned_customer_number'; END IF;

  v:=public.ops2_apply_order_meta_confirmation_v1(
     '40000000-0000-4000-8000-000000000002');
  IF v->>'applied' IS DISTINCT FROM 'true'
     OR v->>'channel_origin' IS DISTINCT FROM '1018'
     OR public.ops2_meta_order_confirmation_required_v1(v_basket_order_id)
  THEN RAISE EXCEPTION 'legitimate_1018_basket_button_failed: %',v; END IF;
  INSERT INTO public.order_separation_assignments_v1(order_id,separator_key)
    VALUES(v_basket_order_id,'KELLY');
  UPDATE public.order_separation_items_v1 SET state='missing' WHERE order_id=v_basket_order_id;
  UPDATE public.orders SET status='processing' WHERE id=v_basket_order_id;

  -- The still-unconfirmed mold remains blocked, no matter that another
  -- Meta channel and another order have valid ledger proofs.
  IF NOT public.ops2_meta_order_confirmation_required_v1(mold_id)
    OR (SELECT count(*) FROM public.order_meta_confirmations_v1)<>2
    OR (SELECT count(*) FROM public.vitrine_stock_reservations r
        JOIN public.r2_r5_meta_test_orders t ON t.order_id=r.order_id
        WHERE t.kind='simple')<>1
    OR (SELECT count(*) FROM public.basket_stock_allocations r
        JOIN public.r2_r5_meta_test_orders t ON t.order_id=r.order_id
        WHERE t.kind='basket')<>2
  THEN RAISE EXCEPTION 'meta_scope_leaked_or_checkout_reservations_changed'; END IF;
  BEGIN
    UPDATE public.orders SET status='out_for_delivery' WHERE id=mold_id;
    RAISE EXCEPTION 'MOLD_UNCONFIRMED_DISPATCH_BYPASS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
END $meta_r2_r5$;
SELECT 'PASS: real checkout + R03 unique code + Meta 0975/1018 signed button + R05 guarded assignment/picking/completion' AS result;
