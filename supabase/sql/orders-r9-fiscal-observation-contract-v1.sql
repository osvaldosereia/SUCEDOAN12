-- R09 DRAFT ONLY; no production migration and NO NF-e creation.
-- Observation sidecar for the existing dispatch_fiscal_jobs, NOT a second emitter.
-- No cron, no external writes. Deploy only after canonical sandbox approval.
CREATE TABLE IF NOT EXISTS public.order_fiscal_r9_observations_v1 (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  bling_order_id bigint NOT NULL CHECK (bling_order_id>0),
  r7_payload_hash text NOT NULL CHECK (r7_payload_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN
    ('pending','observing','uncertain','observed_no_invoice','invoice_found','review_required')),
  claim_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=6),
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_fiscal_r9_observations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_fiscal_r9_observations_v1 FROM PUBLIC,anon,authenticated;

-- Enqueue is idempotent, never changes the linked invoice or any legacy fiscal job.
CREATE OR REPLACE FUNCTION public.ops2_enqueue_fiscal_r9_observation_v1(
 p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r9_enqueue$
DECLARE
 r public.order_bling_r7_sync_intents_v1%rowtype;
 c public.order_separation_completions_v1%rowtype;
 o public.orders%rowtype;
 l record;
 q public.order_fiscal_r9_observations_v1%rowtype;
BEGIN
  IF p_order_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','order_required'); END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','order_not_found'); END IF;
  SELECT * INTO c FROM public.order_separation_completions_v1 WHERE order_id=p_order_id;
  SELECT * INTO r FROM public.order_bling_r7_sync_intents_v1 WHERE order_id=p_order_id;
  SELECT status,bling_id,identity_value INTO l
    FROM public.bling_hub_entity_links_v2
    WHERE source_system='vitrine_qx' AND entity_type='order' AND source_id=p_order_id::text
    LIMIT 1;
  IF o.status<>'ready' OR c.phase IS DISTINCT FROM 'completed'
    OR coalesce((c.metadata->>'stock_applied')::boolean,false) IS NOT TRUE
    OR r.status IS DISTINCT FROM 'verified' OR r.bling_order_id IS NULL
    OR o.bling_order_id IS DISTINCT FROM r.bling_order_id
    OR l.status IS DISTINCT FROM 'matched'
    OR l.bling_id IS DISTINCT FROM r.bling_order_id
    OR c.metadata->'r6_reconciliation' IS DISTINCT FROM r.manifest
    OR r.manifest->>'ready' IS DISTINCT FROM 'true'
    OR l.identity_value IS NULL
    OR l.identity_value NOT LIKE 'VITRINE-%'
  THEN RETURN jsonb_build_object('ok',false,'error','r9_unverified_order_or_manifest'); END IF;
  INSERT INTO public.order_fiscal_r9_observations_v1(order_id,bling_order_id,r7_payload_hash)
  VALUES(p_order_id,r.bling_order_id,r.payload_hash)
  ON CONFLICT(order_id) DO NOTHING;
  SELECT * INTO q FROM public.order_fiscal_r9_observations_v1 WHERE order_id=p_order_id;
  IF q.bling_order_id IS DISTINCT FROM r.bling_order_id
    OR q.r7_payload_hash IS DISTINCT FROM r.payload_hash THEN
    RETURN jsonb_build_object('ok',false,'error','r9_identity_changed');
  END IF;
  RETURN jsonb_build_object('ok',true,'order_id',p_order_id,
    'status',q.status,'enqueued',q.attempts=0);
END $r9_enqueue$;

-- FOR UPDATE SKIP LOCKED: concurrent workers cannot observe same order on
-- one tick. Expired observing leases allow another READ only, never an NF-e POST.
CREATE OR REPLACE FUNCTION public.ops2_claim_fiscal_r9_observation_v1(
 p_limit integer DEFAULT 3
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r9_claim$
DECLARE v_rows jsonb;
BEGIN
  WITH selected AS (
    SELECT q.order_id
    FROM public.order_fiscal_r9_observations_v1 q
    WHERE q.attempts<6
      AND (
        (q.status IN ('pending','uncertain') AND q.next_check_at<=now())
        OR (q.status='observing' AND q.lease_until<now())
      )
    ORDER BY q.next_check_at,q.created_at
    LIMIT least(greatest(coalesce(p_limit,3),1),5)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.order_fiscal_r9_observations_v1 q
    SET status='observing',claim_token=pg_catalog.gen_random_uuid(),
      lease_until=clock_timestamp()+interval '120 seconds',
      attempts=q.attempts+1,updated_at=clock_timestamp()
    FROM selected s WHERE q.order_id=s.order_id
    RETURNING q.order_id,q.bling_order_id,q.r7_payload_hash,
      q.claim_token,q.attempts
  )
  SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) INTO v_rows FROM claimed;
  RETURN jsonb_build_object('ok',true,'claimed',v_rows,
    'external_write',false,'invoice_creation_enabled',false);
END $r9_claim$;

-- Server worker alone passes a SANITIZED, minimal remote observation verdict.
-- Only states arising from READ are valid, never "authorized" or "issued".
CREATE OR REPLACE FUNCTION public.ops2_finish_fiscal_r9_observation_v1(
 p_order_id uuid,p_claim_token uuid,p_verdict text,
 p_evidence jsonb DEFAULT '{}'::jsonb,p_error text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r9_finish$
DECLARE q public.order_fiscal_r9_observations_v1%rowtype;
 v_next text;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL
    OR p_verdict NOT IN ('no_invoice','one_invoice','uncertain','conflict') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_observation_verdict'); END IF;
  SELECT * INTO q FROM public.order_fiscal_r9_observations_v1
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR q.status<>'observing' OR q.claim_token IS DISTINCT FROM p_claim_token
  THEN RETURN jsonb_build_object('ok',false,'error','r9_claim_token_mismatch'); END IF;
  IF p_verdict IN ('no_invoice','one_invoice') AND (
     p_evidence->>'source' IS DISTINCT FROM 'bling_get'
     OR p_evidence->>'order_id' IS DISTINCT FROM p_order_id::text
     OR p_evidence->>'r7_payload_hash' IS DISTINCT FROM q.r7_payload_hash
     OR (p_evidence->>'bling_order_id')::bigint IS DISTINCT FROM q.bling_order_id
     OR p_evidence->>'order_read_ok' IS DISTINCT FROM 'true'
     OR p_evidence->>'external_write' IS DISTINCT FROM 'false'
     OR p_evidence->>'checked_at' IS NULL
     OR (p_verdict='no_invoice' AND p_evidence->>'invoice_count' IS DISTINCT FROM '0')
     OR (p_verdict='one_invoice' AND (
       p_evidence->>'invoice_count' IS DISTINCT FROM '1'
       OR coalesce((p_evidence->>'invoice_id')::bigint,0)<=0
     ))
  ) THEN RETURN jsonb_build_object('ok',false,'error','r9_observation_proof_invalid'); END IF;
  v_next:=CASE p_verdict
    WHEN 'no_invoice' THEN 'observed_no_invoice'
    WHEN 'one_invoice' THEN 'invoice_found'
    WHEN 'conflict' THEN 'review_required' ELSE 'uncertain' END;
  UPDATE public.order_fiscal_r9_observations_v1
  SET status=v_next,claim_token=NULL,lease_until=NULL,
    observed_at=CASE WHEN p_verdict IN ('no_invoice','one_invoice')
      THEN clock_timestamp() ELSE observed_at END,
    evidence=CASE WHEN p_verdict IN ('no_invoice','one_invoice')
      THEN p_evidence ELSE '{}'::jsonb END,
    last_error=nullif(left(coalesce(p_error,''),160),''),
    next_check_at=CASE WHEN v_next='uncertain'
      THEN clock_timestamp()+interval '30 minutes' ELSE next_check_at END,
    updated_at=clock_timestamp()
  WHERE order_id=p_order_id;
  RETURN jsonb_build_object('ok',true,'status',v_next,'external_write',false);
END $r9_finish$;

REVOKE ALL ON FUNCTION public.ops2_enqueue_fiscal_r9_observation_v1(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_claim_fiscal_r9_observation_v1(integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_finish_fiscal_r9_observation_v1(uuid,uuid,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_enqueue_fiscal_r9_observation_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops2_claim_fiscal_r9_observation_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops2_finish_fiscal_r9_observation_v1(uuid,uuid,text,jsonb,text) TO service_role;
