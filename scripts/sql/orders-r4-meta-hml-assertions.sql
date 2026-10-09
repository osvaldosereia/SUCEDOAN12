-- Disposable PostgreSQL 17 assertions; no production connections.
\set ON_ERROR_STOP on
DO $check$
DECLARE
  v jsonb;
  first_order uuid := '10000000-0000-4000-8000-000000000001';
  second_order uuid := '10000000-0000-4000-8000-000000000002';
BEGIN
  IF (SELECT enforce_new_orders FROM public.order_meta_confirmation_runtime_v1 WHERE id=1)
     OR public.ops2_meta_order_confirmation_required_v1(first_order)
  THEN RAISE EXCEPTION 'runtime_flag_not_off'; END IF;
  IF has_function_privilege('anon','public.ops2_apply_order_meta_confirmation_v1(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.ops2_apply_order_meta_confirmation_v1(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'unrestricted_rpc'; END IF;
  IF NOT has_function_privilege('service_role','public.ops2_apply_order_meta_confirmation_v1(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'service_role_rpc_missing'; END IF;

  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000003');
  IF v->>'error'<>'unverified_order_button' THEN RAISE EXCEPTION 'text_reply_accepted'; END IF;
  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000004');
  IF v->>'error'<>'unverified_order_button' THEN RAISE EXCEPTION 'unsigned_reply_accepted'; END IF;
  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000005');
  IF v->>'matched'<>'false' THEN RAISE EXCEPTION 'cross_account_reply_accepted'; END IF;
  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000006');
  IF v->>'matched'<>'false' THEN RAISE EXCEPTION 'unknown_outbound_accepted'; END IF;

  -- Opt-in ONLY for disposable laboratory; deployment flag remains false.
  UPDATE public.order_meta_confirmation_runtime_v1
  SET enforce_new_orders=true,enabled_at=now()-interval '1 day' WHERE id=1;
  IF NOT public.ops2_meta_order_confirmation_required_v1(first_order)
     OR public.ops2_meta_order_confirmation_required_v1('10000000-0000-4000-8000-000000000003')
  THEN RAISE EXCEPTION 'gate_scope_incorrect'; END IF;
  BEGIN
    INSERT INTO public.order_separation_assignments_v1 VALUES(first_order,'TEST');
    RAISE EXCEPTION 'unconfirmed_assignment_accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;
  INSERT INTO public.order_separation_items_v1 VALUES('50000000-0000-4000-8000-000000000001',first_order,'pending');
  BEGIN
    UPDATE public.order_separation_items_v1 SET state='separated' WHERE order_id=first_order;
    RAISE EXCEPTION 'unconfirmed_item_separated';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
  END;

  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000001');
  IF v->>'applied'<>'true' OR public.ops2_meta_order_confirmation_required_v1(first_order)
  THEN RAISE EXCEPTION 'signed_0975_reply_not_applied'; END IF;
  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000001');
  IF v->>'duplicate'<>'true' THEN RAISE EXCEPTION 'duplicate_not_collapsed'; END IF;
  INSERT INTO public.order_separation_assignments_v1 VALUES(first_order,'TEST');
  UPDATE public.order_separation_items_v1 SET state='separated' WHERE order_id=first_order;
  INSERT INTO public.order_separation_completions_v1 VALUES(first_order,120);

  v:=public.ops2_apply_order_meta_confirmation_v1('40000000-0000-4000-8000-000000000002');
  IF v->>'applied'<>'true' OR v->>'channel_origin'<>'1018'
     OR public.ops2_meta_order_confirmation_required_v1(second_order)
  THEN RAISE EXCEPTION 'signed_1018_reply_not_applied'; END IF;
  IF (SELECT count(*) FROM public.order_meta_confirmations_v1)<>2
     OR (SELECT status FROM public.orders WHERE id=first_order)<>'confirmed'
  THEN RAISE EXCEPTION 'proof_or_status_changed_unexpectedly'; END IF;
END $check$;
SELECT 'PASS signed Meta replies and opt-in guard' AS result;
