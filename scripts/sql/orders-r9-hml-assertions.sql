-- R09 test-only assertions, all identifiers synthetic.
\set ON_ERROR_STOP on
DO $r9$
DECLARE
  a uuid:='00000000-0000-4000-8000-000000000010';
  b uuid:='00000000-0000-4000-8000-000000000050';
  wrong uuid:='00000000-0000-4000-8000-000000000777';
  h text:=repeat('a',64);
  v jsonb;tok uuid;second_token uuid;
BEGIN
  IF has_table_privilege('anon','public.order_fiscal_r9_observations_v1','SELECT')
    OR has_function_privilege('anon','public.ops2_claim_fiscal_r9_observation_v1(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.ops2_finish_fiscal_r9_observation_v1(uuid,uuid,text,jsonb,text)','EXECUTE')
  THEN RAISE EXCEPTION 'observer privilege exposed'; END IF;
  IF NOT has_function_privilege('service_role','public.ops2_claim_fiscal_r9_observation_v1(integer)','EXECUTE')
  THEN RAISE EXCEPTION 'observer service_role grant missing'; END IF;

  v:=public.ops2_enqueue_fiscal_r9_observation_v1(wrong);
  IF v->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'unknown order enqueued'; END IF;
  v:=public.ops2_seed_fiscal_r9_observations_v1(10);
  IF (v->>'seeded')::integer<>2 THEN RAISE EXCEPTION 'valid observer seeds missing: %',v; END IF;
  v:=public.ops2_seed_fiscal_r9_observations_v1(10);
  IF (v->>'seeded')::integer<>0 THEN RAISE EXCEPTION 'duplicate seeds created: %',v; END IF;
  IF (SELECT count(*) FROM public.order_fiscal_r9_observations_v1)<>2
  THEN RAISE EXCEPTION 'r9 receipt count wrong'; END IF;

  -- Take exactly one order via the single claim, leaving the other for the
  -- concurrent two-process workflow check.
  v:=public.ops2_claim_fiscal_r9_observation_v1(1);
  IF jsonb_array_length(v->'claimed')<>1 THEN RAISE EXCEPTION 'claim one wrong'; END IF;
  tok:=(v->'claimed'->0->>'claim_token')::uuid;
  a:=(v->'claimed'->0->>'order_id')::uuid;
  v:=public.ops2_finish_fiscal_r9_observation_v1(a,wrong,'no_invoice',
      '{}'::jsonb,NULL);
  IF v->>'error' IS DISTINCT FROM 'r9_claim_token_mismatch' THEN
    RAISE EXCEPTION 'stale token accepted'; END IF;
  v:=public.ops2_finish_fiscal_r9_observation_v1(a,tok,'authorized',
      '{}'::jsonb,NULL);
  IF v->>'error' IS DISTINCT FROM 'invalid_observation_verdict' THEN
    RAISE EXCEPTION 'R09 illegally allowed authorization'; END IF;
  v:=public.ops2_finish_fiscal_r9_observation_v1(a,tok,'no_invoice',
      '{"source":"unknown","external_write":false}'::jsonb,NULL);
  IF v->>'error' IS DISTINCT FROM 'r9_observation_proof_invalid' THEN
    RAISE EXCEPTION 'forged provider proof accepted'; END IF;
  v:=public.ops2_finish_fiscal_r9_observation_v1(a,tok,'no_invoice',
    jsonb_build_object('source','bling_get','order_id',a,
      'r7_payload_hash',(SELECT r7_payload_hash FROM public.order_fiscal_r9_observations_v1 WHERE order_id=a),
      'bling_order_id',(SELECT bling_order_id FROM public.order_fiscal_r9_observations_v1 WHERE order_id=a),
      'order_read_ok',true,'external_write',false,'checked_at',now(),
      'invoice_count',0,'commercial_match',true),
    NULL);
  IF v->>'status' IS DISTINCT FROM 'observed_no_invoice' THEN
    RAISE EXCEPTION 'valid GET observation failed: %',v;
  END IF;

  -- The worker persists its update in a separate command/transaction before
  -- another request re-enqueues it. This avoids DO-block SPI snapshot caching.
END $r9$;

-- A second command with a fresh statement snapshot validates the committed
-- observation, replay safety, and the other order still pending.
DO $r9_replay$
DECLARE
  a uuid;
  v jsonb;
BEGIN
  SELECT order_id INTO a FROM public.order_fiscal_r9_observations_v1
  WHERE status='observed_no_invoice';
  IF a IS NULL THEN
    RAISE EXCEPTION 'finished observation was not persisted';
  END IF;
  v:=public.ops2_enqueue_fiscal_r9_observation_v1(a);
  IF v->>'status' IS DISTINCT FROM 'observed_no_invoice' THEN
    RAISE EXCEPTION 're-enqueue altered completed observation: %',v;
  END IF;
  IF (SELECT attempts FROM public.order_fiscal_r9_observations_v1 WHERE order_id=a)<>1
  THEN RAISE EXCEPTION 'completed observation replayed as claim'; END IF;
  IF (SELECT count(*) FROM public.order_fiscal_r9_observations_v1 WHERE status='pending')<>1
  THEN RAISE EXCEPTION 'concurrency candidate not pending'; END IF;
END $r9_replay$;
SELECT 'PASS R09: service-only, valid enqueue, no duplicates, claim token, no authorization, attested GET' result;
