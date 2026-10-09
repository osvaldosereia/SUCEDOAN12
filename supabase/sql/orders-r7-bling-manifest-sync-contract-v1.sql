-- R07 DRAFT ONLY, not a deployed Supabase migration.
-- Exactly-once server-side claim before external Bling order reconcile/PUT.
-- A timeout/unknown result is NEVER retried as an unattended POST/PUT.
-- The admin worker must first build its snapshot from frozen R06 receipt.
CREATE TABLE IF NOT EXISTS public.order_bling_r7_sync_intents_v1(
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  manifest jsonb NOT NULL,
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','verified','uncertain','review_required')),
  claim_token uuid,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  bling_order_id bigint CHECK(bling_order_id>0),
  error_code text,
  provider_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.order_bling_r7_sync_intents_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_bling_r7_sync_intents_v1 FROM PUBLIC,anon,authenticated;

-- Both RPCs are called exclusively by Edge service_role; browser cannot claim.
CREATE OR REPLACE FUNCTION public.ops2_claim_bling_r7_sync_v1(
  p_order_id uuid,p_payload_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $claim$
DECLARE
  c public.order_separation_completions_v1%rowtype;
  o public.orders%rowtype;
  j public.order_bling_r7_sync_intents_v1%rowtype;
  v_manifest jsonb;
  v_claim uuid;
BEGIN
  IF p_order_id IS NULL OR p_payload_hash IS NULL
     OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_r7_claim');
  END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','order_not_found'); END IF;
  SELECT * INTO c FROM public.order_separation_completions_v1
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR c.phase IS DISTINCT FROM 'completed'
    OR coalesce((c.metadata->>'stock_applied')::boolean,false) IS NOT TRUE
    OR o.status IS DISTINCT FROM 'ready' THEN
    RETURN jsonb_build_object('ok',false,'error','separation_not_ready_for_bling');
  END IF;
  v_manifest:=c.metadata->'r6_reconciliation';
  IF v_manifest IS NULL OR v_manifest->>'ok' IS DISTINCT FROM 'true'
    OR v_manifest->>'ready' IS DISTINCT FROM 'true'
    OR v_manifest->>'order_id' IS DISTINCT FROM p_order_id::text
    OR jsonb_array_length(coalesce(v_manifest->'blockers','[]'::jsonb))>0
    OR (v_manifest->'financial'->>'final_total')::numeric IS DISTINCT FROM o.total
  THEN RETURN jsonb_build_object('ok',false,'error','r6_frozen_manifest_invalid'); END IF;

  INSERT INTO public.order_bling_r7_sync_intents_v1(order_id,manifest,payload_hash)
  VALUES(p_order_id,v_manifest,p_payload_hash)
  ON CONFLICT(order_id) DO NOTHING;
  SELECT * INTO j FROM public.order_bling_r7_sync_intents_v1
    WHERE order_id=p_order_id FOR UPDATE;
  IF j.manifest IS DISTINCT FROM v_manifest OR j.payload_hash IS DISTINCT FROM p_payload_hash THEN
    RETURN jsonb_build_object('ok',false,'error','r7_immutable_manifest_or_payload_changed');
  END IF;
  IF j.status='verified' THEN
    RETURN jsonb_build_object('ok',true,'claimed',false,'already_verified',true,
      'bling_order_id',j.bling_order_id,'manifest',v_manifest);
  END IF;
  -- Stale processing can mean a Bling POST/PUT happened before a crash.
  -- Never turn a stale lease into an automatic new write.
  IF j.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'error','r7_remote_reconciliation_required',
      'intent_status',j.status,'bling_order_id',j.bling_order_id);
  END IF;
  v_claim:=pg_catalog.gen_random_uuid();
  UPDATE public.order_bling_r7_sync_intents_v1
    SET status='processing',claim_token=v_claim,attempts=attempts+1,
      locked_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE order_id=p_order_id;
  RETURN jsonb_build_object('ok',true,'claimed',true,
    'claim_token',v_claim,'manifest',v_manifest,'payload_hash',p_payload_hash);
END
$claim$;
REVOKE ALL ON FUNCTION public.ops2_claim_bling_r7_sync_v1(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_claim_bling_r7_sync_v1(uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ops2_finish_bling_r7_sync_v1(
  p_order_id uuid,p_claim_token uuid,p_status text,
  p_bling_order_id bigint DEFAULT NULL,p_provider_result jsonb DEFAULT '{}'::jsonb,
  p_error_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $finish$
DECLARE j public.order_bling_r7_sync_intents_v1%rowtype;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL
    OR p_status NOT IN ('verified','uncertain','review_required') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_r7_finish');
  END IF;
  SELECT * INTO j FROM public.order_bling_r7_sync_intents_v1
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','r7_intent_missing'); END IF;
  IF j.status IS DISTINCT FROM 'processing'
    OR j.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object('ok',false,'error','r7_invalid_claim_token');
  END IF;
  IF p_status='verified' AND (p_bling_order_id IS NULL OR p_bling_order_id<=0) THEN
    RETURN jsonb_build_object('ok',false,'error','verified_bling_order_id_required');
  END IF;
  UPDATE public.order_bling_r7_sync_intents_v1
  SET status=p_status,claim_token=NULL,locked_at=NULL,
    bling_order_id=coalesce(p_bling_order_id,bling_order_id),
    provider_result=coalesce(p_provider_result,'{}'::jsonb),
    error_code=nullif(left(coalesce(p_error_code,''),180),''),
    finished_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE order_id=p_order_id;
  RETURN jsonb_build_object('ok',true,'status',p_status,
    'bling_order_id',p_bling_order_id);
END
$finish$;
REVOKE ALL ON FUNCTION public.ops2_finish_bling_r7_sync_v1(
  uuid,uuid,text,bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_finish_bling_r7_sync_v1(
  uuid,uuid,text,bigint,jsonb,text) TO service_role;
