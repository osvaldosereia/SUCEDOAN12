-- R07: test durable "at most one attempt until reconciliation" intent.
-- All rows preloaded by synthetic R06 fixtures, including REAL captured
-- separation/stock/phase functions from the canonical runtime.
\set ON_ERROR_STOP on
SELECT public.ops2_mark_order_separation_completion_v2(
  '00000000-0000-4000-8000-000000000010'::uuid,'completed','{}'::jsonb);
SELECT public.ops2_mark_order_separation_completion_v2(
  '00000000-0000-4000-8000-000000000050'::uuid,'completed','{}'::jsonb);
DO $r7$
DECLARE
  o uuid:='00000000-0000-4000-8000-000000000010';
  basket uuid:='00000000-0000-4000-8000-000000000050';
  hash text:=repeat('a',64);
  v jsonb;token uuid;
BEGIN
  IF has_function_privilege('anon','public.ops2_claim_bling_r7_sync_v1(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.ops2_claim_bling_r7_sync_v1(uuid,text)','EXECUTE')
     OR has_table_privilege('anon','public.order_bling_r7_sync_intents_v1','SELECT')
  THEN RAISE EXCEPTION 'R07 privileged sync exposure'; END IF;
  IF NOT has_function_privilege('service_role','public.ops2_claim_bling_r7_sync_v1(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'R07 service role grant missing'; END IF;

  v:=public.ops2_claim_bling_r7_sync_v1(
    '00000000-0000-4000-8000-000000000030',hash);
  IF v->>'error'<>'separation_not_ready_for_bling' THEN
    RAISE EXCEPTION 'unprepared order was syncable: %',v;
  END IF;
  v:=public.ops2_claim_bling_r7_sync_v1(o,'nothex');
  IF v->>'error'<>'invalid_r7_claim' THEN RAISE EXCEPTION 'bad hash accepted'; END IF;
  v:=public.ops2_claim_bling_r7_sync_v1(o,hash);
  token:=(v->>'claim_token')::uuid;
  IF v->>'claimed'<>'true' OR token IS NULL
     OR v->'manifest'->>'ready'<>'true'
  THEN RAISE EXCEPTION 'R07 valid claim failed: %',v; END IF;
  v:=public.ops2_claim_bling_r7_sync_v1(o,hash);
  IF v->>'error'<>'r7_remote_reconciliation_required' THEN
    RAISE EXCEPTION 'duplicate processing claim allowed: %',v; END IF;
  v:=public.ops2_claim_bling_r7_sync_v1(o,repeat('b',64));
  IF v->>'error'<>'r7_immutable_manifest_or_payload_changed' THEN
    RAISE EXCEPTION 'payload tamper allowed: %',v; END IF;

  v:=public.ops2_finish_bling_r7_sync_v1(
    o,'00000000-0000-4000-8000-000000000999'::uuid,
    'verified',12345,'{}'::jsonb,NULL);
  IF v->>'error'<>'r7_invalid_claim_token' THEN
    RAISE EXCEPTION 'stale worker finalized another claim'; END IF;
  v:=public.ops2_finish_bling_r7_sync_v1(o,token,'verified',NULL,'{}'::jsonb,NULL);
  IF v->>'error'<>'verified_bling_order_id_required' THEN
    RAISE EXCEPTION 'Bling verification without provider ID accepted'; END IF;
  v:=public.ops2_finish_bling_r7_sync_v1(
    o,token,'verified',12345,'{"remote_get_verified":true}'::jsonb,NULL);
  IF v->>'ok'<>'true' OR v->>'bling_order_id'<>'12345' THEN
    RAISE EXCEPTION 'verified finish did not persist: %',v; END IF;
  v:=public.ops2_claim_bling_r7_sync_v1(o,hash);
  IF v->>'already_verified'<>'true'
     OR v->>'claimed'<>'false'
     OR v->>'bling_order_id'<>'12345' THEN
    RAISE EXCEPTION 'verified replay started a second write: %',v; END IF;

  -- No payload drift accepted even AFTER a verified order.
  UPDATE public.order_separation_completions_v1
    SET metadata=jsonb_set(metadata,'{r6_reconciliation,financial,final_total}','200'::jsonb)
    WHERE order_id=o;
  v:=public.ops2_claim_bling_r7_sync_v1(o,hash);
  IF v->>'error'<>'r6_frozen_manifest_invalid' THEN
    RAISE EXCEPTION 'altered financial receipt was accepted: %',v; END IF;
  -- Restore synthetic data for later checks.
  UPDATE public.order_separation_completions_v1
    SET metadata=jsonb_set(metadata,'{r6_reconciliation,financial,final_total}','198'::jsonb)
    WHERE order_id=o;
  IF (SELECT count(*) FROM public.order_bling_r7_sync_intents_v1 WHERE order_id=o)<>1
    OR (SELECT attempts FROM public.order_bling_r7_sync_intents_v1 WHERE order_id=o)<>1
  THEN RAISE EXCEPTION 'more than one attempt registered for same order'; END IF;

  -- Basket is intentionally NOT claimed here; concurrent CI exercises it.
  IF (SELECT count(*) FROM public.order_bling_r7_sync_intents_v1 WHERE order_id=basket)<>0
  THEN RAISE EXCEPTION 'concurrency fixture unexpectedly already claimed'; END IF;
END $r7$;
SELECT 'PASS R07: verified order at most one intent, immutable receipt, no retry on processing' AS result;
