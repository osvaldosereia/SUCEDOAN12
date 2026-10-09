-- Original R07 unique intent RPCs with SHA-256 from the original adapter
-- executed on ACTUAL R06 PostgreSQL receipt (checkout R02 + Meta R04/R05).
-- Values of Bling IDs here are FICTITIOUS. No HTTP, POST/PUT or invoice.
\set ON_ERROR_STOP on
DO $r02_r07$
DECLARE
 basket uuid; mold uuid; frozen jsonb;
 basket_hash text; mold_hash text;
 v jsonb; token uuid; v_order_total numeric;
BEGIN
 SELECT order_id,payload_hash INTO basket,basket_hash
 FROM public.r2_r7_verified_payloads WHERE kind='basket';
 SELECT order_id,payload_hash INTO mold,mold_hash
 FROM public.r2_r7_verified_payloads WHERE kind='mold';
 IF basket IS NULL OR mold IS NULL
 THEN RAISE EXCEPTION 'real R06 SHA256 output missing'; END IF;
 IF has_table_privilege('anon','public.order_bling_r7_sync_intents_v1','SELECT')
   OR has_function_privilege('authenticated',
       'public.ops2_claim_bling_r7_sync_v1(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'R07 intent accessible to unprivileged clients'; END IF;
 IF NOT has_function_privilege('service_role',
        'public.ops2_claim_bling_r7_sync_v1(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'service_role cannot claim R07 intent'; END IF;
 IF (SELECT count(*) FROM public.order_bling_r7_sync_intents_v1)<>0
 THEN RAISE EXCEPTION 'Bling intents unexpectedly exist'; END IF;

 -- Hash of an already-completed R06 manifest is the only eligible claim.
 v:=public.ops2_claim_bling_r7_sync_v1(mold,'invalid_hash');
 IF v->>'error' IS DISTINCT FROM 'invalid_r7_claim'
 THEN RAISE EXCEPTION 'malformed Bling payload hash accepted: %',v; END IF;
 v:=public.ops2_claim_bling_r7_sync_v1(basket,basket_hash);
 token:=(v->>'claim_token')::uuid;
 IF v->>'claimed' IS DISTINCT FROM 'true'
   OR token IS NULL
   OR v->'manifest'->>'public_order_number' IS DISTINCT FROM
     (SELECT order_number FROM public.orders WHERE id=basket)
 THEN RAISE EXCEPTION 'basket original identity not frozen before Bling: %',v; END IF;
 v:=public.ops2_claim_bling_r7_sync_v1(basket,basket_hash);
 IF v->>'error' IS DISTINCT FROM 'r7_remote_reconciliation_required'
 THEN RAISE EXCEPTION 'second Bling write claim permitted: %',v; END IF;
 v:=public.ops2_claim_bling_r7_sync_v1(basket,repeat('b',64));
 IF v->>'error' IS DISTINCT FROM 'r7_immutable_manifest_or_payload_changed'
 THEN RAISE EXCEPTION 'Bling SHA256 altered without review: %',v; END IF;
 v:=public.ops2_finish_bling_r7_sync_v1(basket,token,'verified',NULL,
      '{}'::jsonb,NULL);
 IF v->>'error' IS DISTINCT FROM 'verified_bling_order_id_required'
 THEN RAISE EXCEPTION 'Bling verification without ID accepted: %',v; END IF;
 v:=public.ops2_finish_bling_r7_sync_v1(basket,token,'verified',123451,
   '{"synthetic_remote_get_verified":true}'::jsonb,NULL);
 IF v->>'status' IS DISTINCT FROM 'verified'
 THEN RAISE EXCEPTION 'basket verification not persisted: %',v; END IF;
 v:=public.ops2_claim_bling_r7_sync_v1(basket,basket_hash);
 IF v->>'already_verified' IS DISTINCT FROM 'true'
   OR v->>'claimed' IS DISTINCT FROM 'false'
   OR v->>'bling_order_id' IS DISTINCT FROM '123451'
 THEN RAISE EXCEPTION 'verified Bling intent double-wrote: %',v; END IF;

 -- One remote result may be ambiguous. Claim can NEVER retry even when
 -- all local data are unchanged or a worker restarts.
 v:=public.ops2_claim_bling_r7_sync_v1(mold,mold_hash);
 token:=(v->>'claim_token')::uuid;
 IF v->>'claimed' IS DISTINCT FROM 'true' OR token IS NULL
 THEN RAISE EXCEPTION 'mold first claim failed: %',v; END IF;
 v:=public.ops2_finish_bling_r7_sync_v1(mold,token,'uncertain',NULL,
   '{}'::jsonb,'synthetic_timeout');
 IF v->>'status' IS DISTINCT FROM 'uncertain'
 THEN RAISE EXCEPTION 'unknown remote write result not frozen: %',v; END IF;
 v:=public.ops2_claim_bling_r7_sync_v1(mold,mold_hash);
 IF v->>'error' IS DISTINCT FROM 'r7_remote_reconciliation_required'
 THEN RAISE EXCEPTION 'UNKNOWN provider result caused blind retry: %',v; END IF;

 IF (SELECT count(*) FROM public.order_bling_r7_sync_intents_v1)<>2
   OR (SELECT sum(attempts) FROM public.order_bling_r7_sync_intents_v1)<>2
   OR (SELECT count(*) FROM public.order_bling_r7_sync_intents_v1
       WHERE status='verified')<>1
   OR (SELECT count(*) FROM public.order_bling_r7_sync_intents_v1
       WHERE status='uncertain')<>1
 THEN RAISE EXCEPTION 'R07 intended exactly-one attempt per order failed'; END IF;

 -- A tampered historical R06 receipt fails the same hash/manifest gate.
 SELECT metadata->'r6_reconciliation' INTO frozen
 FROM public.order_separation_completions_v1 WHERE order_id=basket;
 v_order_total:=(SELECT o.total FROM public.orders o WHERE o.id=basket);
 UPDATE public.order_separation_completions_v1
 SET metadata=jsonb_set(metadata,'{r6_reconciliation,financial,final_total}',
      to_jsonb(v_order_total+10))
 WHERE order_id=basket;
 v:=public.ops2_claim_bling_r7_sync_v1(basket,basket_hash);
 IF v->>'error' IS DISTINCT FROM 'r6_frozen_manifest_invalid'
 THEN RAISE EXCEPTION 'tampered R06 receipt accepted for Bling: %',v; END IF;
 UPDATE public.order_separation_completions_v1
 SET metadata=jsonb_set(metadata,'{r6_reconciliation}',frozen)
 WHERE order_id=basket;
END $r02_r07$;
SELECT 'PASS R02-R07: actual separated-only SHA256, unique Bling intent, no blind retry after uncertain remote response' result;
