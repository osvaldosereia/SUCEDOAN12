-- Only synthetic records in isolated PG17; transaction rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE v_id bigint;v_finished timestamptz;v_count integer;
BEGIN
 -- The authentic fiscal SQL must reject a fake authorized invoice.
 BEGIN
  INSERT INTO public.dispatch_fiscal_jobs(status,bling_invoice_id,access_key,sefaz_status)
  VALUES('authorized',0,repeat('1',44),'100');
  RAISE EXCEPTION 'did_not_reject_missing_invoice_id';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'authorized_fiscal_job_missing_invoice_id' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.dispatch_fiscal_jobs(status,bling_invoice_id,access_key,sefaz_status)
  VALUES('authorized',123,'invalid','100');
  RAISE EXCEPTION 'did_not_reject_invalid_access_key';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'authorized_fiscal_job_invalid_access_key' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.dispatch_fiscal_jobs(status,bling_invoice_id,access_key,sefaz_status)
  VALUES('authorized',123,repeat('1',44),null);
  RAISE EXCEPTION 'did_not_reject_missing_sefaz_status';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'authorized_fiscal_job_missing_sefaz_status' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.dispatch_fiscal_jobs(status,attempts,max_attempts)
  VALUES('generating',3,2);
  RAISE EXCEPTION 'did_not_reject_attempt_limit';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'fiscal_job_attempt_limit_exceeded' THEN RAISE; END IF;
 END;
 INSERT INTO public.dispatch_fiscal_jobs(status,bling_invoice_id,access_key,sefaz_status)
 VALUES('authorized',123,repeat('1',44),'100')
 RETURNING id,finished_at INTO v_id,v_finished;
 IF v_finished IS NULL THEN RAISE EXCEPTION 'authorized_missing_finished_at';END IF;
 BEGIN
  UPDATE public.dispatch_fiscal_jobs SET bling_invoice_id=0 WHERE id=v_id;
  RAISE EXCEPTION 'did_not_reject_invoice_invalidation';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'authorized_fiscal_job_missing_invoice_id' THEN RAISE; END IF;
 END;
 -- The V4 operator guard must reject missing, invalid and changed separators.
 BEGIN
  INSERT INTO public.order_separation_completions_v1(separator_key) VALUES(NULL);
  RAISE EXCEPTION 'did_not_reject_missing_separator';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'separator_required_before_completion' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.order_separation_completions_v1(separator_key) VALUES('random');
  RAISE EXCEPTION 'did_not_reject_invalid_separator';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'separator_required_before_completion' THEN RAISE; END IF;
 END;
 INSERT INTO public.order_separation_completions_v1(separator_key) VALUES('claudio') RETURNING id INTO v_id;
 BEGIN
  UPDATE public.order_separation_completions_v1 SET separator_key='unknown' WHERE id=v_id;
  RAISE EXCEPTION 'did_not_reject_invalid_reassignment';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'separator_required_before_completion' THEN RAISE; END IF;
 END;
 IF NOT has_function_privilege('service_role','public.ops2_guard_dispatch_fiscal_job_v1()','EXECUTE')
   OR has_function_privilege('anon','public.ops2_guard_dispatch_fiscal_job_v1()','EXECUTE')
   OR has_function_privilege('authenticated','public.ops2_guard_dispatch_fiscal_job_v1()','EXECUTE')
   OR has_function_privilege('anon','public.ops2_require_separator_completion_v4()','EXECUTE')
 THEN RAISE EXCEPTION 'unsafe_trigger_function_execute_grants'; END IF;
 SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relnamespace='public'::regnamespace AND
 t.tgname IN('trg_ops2_guard_dispatch_fiscal_job_v1','trg_ops2_require_separator_completion_v4');
 IF v_count<>2 THEN RAISE EXCEPTION 'expected_two_authentic_triggers_got_%',v_count;END IF;
END
$test$;
ROLLBACK;
SELECT 'PASS: original fiscal and separator triggers enforce fail-closed isolated DB behavior' AS result;
