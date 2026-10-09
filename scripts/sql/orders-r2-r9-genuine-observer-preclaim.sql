-- R02-R09: real checkout R02 + immutable R06 + actual R07 intent in
-- PostgreSQL 17. This does NOT enqueue or issue any real invoice.
\set ON_ERROR_STOP on
DO $r2_r9_before$
DECLARE
  basket uuid; mold uuid; v jsonb;
BEGIN
 SELECT order_id INTO basket FROM public.r2_r5_meta_test_orders WHERE kind='basket';
 SELECT order_id INTO mold FROM public.r2_r5_meta_test_orders WHERE kind='mold';
 IF basket IS NULL OR mold IS NULL THEN
   RAISE EXCEPTION 'genuine_checkout_order_not_found';
 END IF;
 IF has_table_privilege('anon','public.order_fiscal_r9_observations_v1','SELECT')
    OR has_function_privilege('authenticated',
      'public.ops2_claim_fiscal_r9_observation_v1(integer)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.ops2_claim_fiscal_r9_observation_v1(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'R09 role segregation regression'; END IF;
 -- R07 uncertain cannot be inferred as a successful remote Bling write,
 -- even if R06 physical stock is already finalized.
 v:=public.ops2_enqueue_fiscal_r9_observation_v1(mold);
 IF v->>'error' IS DISTINCT FROM 'r9_unverified_order_or_manifest'
 THEN RAISE EXCEPTION 'uncertain R07 illegally enqueued for fiscal: %',v; END IF;
 v:=public.ops2_enqueue_fiscal_r9_observation_v1(basket);
 IF v->>'ok' IS DISTINCT FROM 'true' OR v->>'status' IS DISTINCT FROM 'pending'
 THEN RAISE EXCEPTION 'verified checkout could not seed GET-only R09: %',v; END IF;
 v:=public.ops2_seed_fiscal_r9_observations_v1(5);
 IF (v->>'seeded')::integer IS DISTINCT FROM 0
 THEN RAISE EXCEPTION 'R09 double-created verified order: %',v; END IF;
 v:=public.ops2_enqueue_fiscal_r9_observation_v1(basket);
 IF v->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'R09 idempotent enqueue failed: %',v; END IF;
 IF (SELECT count(*) FROM public.order_fiscal_r9_observations_v1)<>1
    OR (SELECT count(*) FROM public.order_fiscal_r9_observations_v1 WHERE status='pending')<>1
 THEN RAISE EXCEPTION 'unknown or duplicate observation created'; END IF;
END $r2_r9_before$;
SELECT 'PASS R09: only R07 verified checkout order queued, Meta/R06/R07 identity intact' result;
