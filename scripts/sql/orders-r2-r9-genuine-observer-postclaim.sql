-- R09 post-concurrency: only one of TWO PostgreSQL workers must have
-- claimed the checkout-generated basket after R07 verified its exact hash.
\set ON_ERROR_STOP on
DO $r2_r9_after$
DECLARE
 b uuid; m uuid; claim uuid; hash text; remote_id bigint; v jsonb;
 observed jsonb;
BEGIN
 SELECT order_id INTO b FROM public.r2_r5_meta_test_orders WHERE kind='basket';
 SELECT order_id INTO m FROM public.r2_r5_meta_test_orders WHERE kind='mold';
 SELECT claim_token,r7_payload_hash,bling_order_id
 INTO claim,hash,remote_id
 FROM public.order_fiscal_r9_observations_v1 WHERE order_id=b;
 IF claim IS NULL OR remote_id<>123451 OR
    (SELECT status FROM public.order_fiscal_r9_observations_v1 WHERE order_id=b)<>'observing'
    OR (SELECT attempts FROM public.order_fiscal_r9_observations_v1 WHERE order_id=b)<>1
 THEN RAISE EXCEPTION 'R09 concurrent claim did not select one original basket'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_fiscal_r9_observations_v1 WHERE order_id=m)
 THEN RAISE EXCEPTION 'uncertain R07 mold reached invoice observation'; END IF;
 -- Never accept worker-controlled unverified HTTP evidence as a fact.
 v:=public.ops2_finish_fiscal_r9_observation_v1(b,claim,'no_invoice',
   '{"source":"mocked_client","invoice_count":0,"external_write":false}'::jsonb);
 IF v->>'error' IS DISTINCT FROM 'r9_observation_proof_invalid'
 THEN RAISE EXCEPTION 'unverified observation was accepted: %',v; END IF;
 v:=public.ops2_finish_fiscal_r9_observation_v1(b,gen_random_uuid(),'no_invoice',
   '{}'::jsonb);
 IF v->>'error' IS DISTINCT FROM 'r9_claim_token_mismatch'
 THEN RAISE EXCEPTION 'wrong worker completed observation: %',v; END IF;
 observed:=jsonb_build_object(
   'source','bling_get',
   'order_id',b,
   'r7_payload_hash',hash,
   'bling_order_id',remote_id,
   'order_read_ok',true,
   'commercial_match',true,
   'checked_at',clock_timestamp(),
   'invoice_count',0,
   'invoice_linked',false,
   'external_write',false);
 v:=public.ops2_finish_fiscal_r9_observation_v1(
   b,claim,'no_invoice',observed,NULL);
 IF v->>'status' IS DISTINCT FROM 'observed_no_invoice' OR
    v->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'synthetic GET observation not persisted: %',v; END IF;
 IF (SELECT evidence FROM public.order_fiscal_r9_observations_v1 WHERE order_id=b)
      IS DISTINCT FROM observed
 THEN RAISE EXCEPTION 'saved GET evidence hash differs from R07'; END IF;
 IF (SELECT count(*) FROM public.order_fiscal_r9_observations_v1)<>1
 THEN RAISE EXCEPTION 'fiscal observer inserted extra order'; END IF;
END $r2_r9_after$;

-- Separate PostgreSQL statement snapshot avoids stale PL/pgSQL SPI
-- visibility assumptions and confirms R09 is terminal, no POST retry.
DO $r2_r9_replay$
DECLARE b uuid; v jsonb;
BEGIN
 SELECT order_id INTO b FROM public.r2_r5_meta_test_orders WHERE kind='basket';
 v:=public.ops2_claim_fiscal_r9_observation_v1(4);
 IF jsonb_array_length(v->'claimed')<>0
 THEN RAISE EXCEPTION 'already observed basket re-claimed: %',v; END IF;
 v:=public.ops2_enqueue_fiscal_r9_observation_v1(b);
 IF v->>'status' IS DISTINCT FROM 'observed_no_invoice'
 THEN RAISE EXCEPTION 're-enqueue replaced fiscal GET evidence: %',v; END IF;
 IF (SELECT attempts FROM public.order_fiscal_r9_observations_v1 WHERE order_id=b)<>1
 THEN RAISE EXCEPTION 'fiscal observer tried another write'; END IF;
END $r2_r9_replay$;
SELECT 'PASS R02-R09: one exclusive claim, real R07 hash, GET observation, spoof rejected, no re-POST' result;
