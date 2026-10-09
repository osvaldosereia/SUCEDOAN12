-- R10 DRAFT - not a Supabase migration. NO production application.
-- Add cryptographically hashed evidence metadata to the EXISTING fiscal outbox.
-- The Edge worker must verify authenticated Bling XML/protocol BEFORE invoking
-- the service-only registration RPC. This SQL is not an XML signature verifier.
CREATE TABLE public.order_fiscal_r10_authorization_evidence_v1(
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  bling_order_id bigint NOT NULL CHECK(bling_order_id>0),
  bling_invoice_id bigint NOT NULL UNIQUE CHECK(bling_invoice_id>0),
  access_key text NOT NULL UNIQUE CHECK(access_key ~ '^[0-9]{44}$'),
  sefaz_cstat integer NOT NULL CHECK(sefaz_cstat IN (100,150)),
  authorization_protocol text NOT NULL CHECK(authorization_protocol ~ '^[0-9]{15}$'),
  issuer_cnpj text NOT NULL CHECK(issuer_cnpj ~ '^[0-9]{14}$'),
  xml_sha256 text NOT NULL CHECK(xml_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'authorized' CHECK(status='authorized'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_fiscal_r10_authorization_evidence_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_fiscal_r10_authorization_evidence_v1 FROM PUBLIC,anon,authenticated;

-- A confirmed generation followed by an uncertain result may be observed
-- again; this RPC only rearms GET, never POST. No new attempt counter reset.
CREATE OR REPLACE FUNCTION public.ops2_r10_rearm_fiscal_observation_v1(
  p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r10_rearm$
DECLARE
  j public.dispatch_fiscal_jobs%rowtype;
  obs public.order_fiscal_r9_observations_v1%rowtype;
BEGIN
  SELECT * INTO j FROM public.dispatch_fiscal_jobs
    WHERE order_id=p_order_id AND fiscal_version=1 FOR UPDATE;
  SELECT * INTO obs FROM public.order_fiscal_r9_observations_v1
    WHERE order_id=p_order_id FOR UPDATE;
  IF j.id IS NULL OR obs.order_id IS NULL OR j.status NOT IN
     ('generating','generated','authorizing','review_required')
     OR j.attempts>1 OR obs.attempts>=6
     OR obs.status NOT IN ('observed_no_invoice','uncertain')
  THEN RETURN jsonb_build_object('ok',false,'error','r10_reobservation_not_eligible'); END IF;
  UPDATE public.order_fiscal_r9_observations_v1
  SET status='pending',claim_token=NULL,lease_until=NULL,next_check_at=now(),
    evidence='{}'::jsonb,observed_at=NULL,updated_at=now()
  WHERE order_id=p_order_id;
  RETURN jsonb_build_object('ok',true,'rearmed_get_only',true,
    'invoice_created',false,'external_write',false);
END $r10_rearm$;

-- Irreversible invoice generation can be claimed ONCE by the existing
-- dispatch_fiscal_jobs row; never retry after timeout/crash.
-- No client-supplied fiscal approval: release requires R08 server-side
-- approval source AND trusted R09 fresh evidence (wired in R11).
CREATE OR REPLACE FUNCTION public.ops2_r10_claim_fiscal_generation_v1(
  p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r10_generate$
DECLARE
  j public.dispatch_fiscal_jobs%rowtype;
  obs public.order_fiscal_r9_observations_v1%rowtype;
  r7 public.order_bling_r7_sync_intents_v1%rowtype;
  o public.orders%rowtype;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT * INTO j FROM public.dispatch_fiscal_jobs
    WHERE order_id=p_order_id AND fiscal_version=1 FOR UPDATE;
  SELECT * INTO obs FROM public.order_fiscal_r9_observations_v1
    WHERE order_id=p_order_id FOR UPDATE;
  SELECT * INTO r7 FROM public.order_bling_r7_sync_intents_v1
    WHERE order_id=p_order_id;
  IF o.id IS NULL OR o.status IS DISTINCT FROM 'ready'
    OR j.id IS NULL OR j.status IS DISTINCT FROM 'ready'
    OR j.attempts<>0 OR j.max_attempts<>1
    OR obs.status IS DISTINCT FROM 'observed_no_invoice'
    OR obs.observed_at<now()-interval '5 minutes'
    OR obs.r7_payload_hash IS DISTINCT FROM r7.payload_hash
    OR j.bling_order_id IS DISTINCT FROM r7.bling_order_id
    OR r7.status IS DISTINCT FROM 'verified'
  THEN RETURN jsonb_build_object('ok',false,'error','r10_generation_claim_blocked'); END IF;

  -- Strict release barrier: R08's approved tax/classification evidence does
  -- not yet have a canonical materialized, signed server-side attestation.
  -- This is an INTENTIONAL fail-closed placeholder until R11, not an emitter.
  RETURN jsonb_build_object('ok',false,
    'error','r8_approved_tax_attestation_not_integrated',
    'external_write',false,'attempts_consumed',false);
END $r10_generate$;

-- Only service-role after external GET (Bling) + XML protocol evidence.
-- Consumes the SAME dispatch_fiscal_jobs; no second fiscal issuer.
CREATE OR REPLACE FUNCTION public.ops2_r10_finalize_authorized_v1(
 p_order_id uuid,p_invoice_id bigint,p_access_key text,p_cstat integer,
 p_protocol text,p_issuer_cnpj text,p_xml_sha256 text,p_observed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r10_finalize$
DECLARE
 o public.orders%rowtype;
 j public.dispatch_fiscal_jobs%rowtype;
 r public.order_fiscal_r9_observations_v1%rowtype;
 intent public.order_bling_r7_sync_intents_v1%rowtype;
 e public.order_fiscal_r10_authorization_evidence_v1%rowtype;
BEGIN
 IF p_order_id IS NULL OR coalesce(p_invoice_id,0)<=0
    OR p_access_key !~ '^[0-9]{44}$' OR p_cstat NOT IN (100,150)
    OR p_protocol !~ '^[0-9]{15}$' OR p_issuer_cnpj !~ '^[0-9]{14}$'
    OR p_xml_sha256 !~ '^[0-9a-f]{64}$'
    OR p_observed_at IS NULL
    OR p_observed_at NOT BETWEEN now()-interval '5 minutes'
                             AND now()+interval '30 seconds'
 THEN RETURN jsonb_build_object('ok',false,'error','r10_invalid_sefaz_evidence'); END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO j FROM public.dispatch_fiscal_jobs
   WHERE order_id=p_order_id AND fiscal_version=1 FOR UPDATE;
 SELECT * INTO intent FROM public.order_bling_r7_sync_intents_v1
   WHERE order_id=p_order_id;
 SELECT * INTO r FROM public.order_fiscal_r9_observations_v1
   WHERE order_id=p_order_id;
 IF o.id IS NULL OR o.status NOT IN ('ready','out_for_delivery','delivered')
    OR j.id IS NULL OR j.status NOT IN
     ('generated','authorizing','review_required','authorized')
    OR intent.status IS DISTINCT FROM 'verified'
    OR j.bling_order_id IS DISTINCT FROM intent.bling_order_id
    OR r.status IS DISTINCT FROM 'invoice_found'
    OR r.bling_order_id IS DISTINCT FROM intent.bling_order_id
    OR coalesce((r.evidence->>'invoice_id')::bigint,0) IS DISTINCT FROM p_invoice_id
    OR r.observed_at<now()-interval '5 minutes'
 THEN RETURN jsonb_build_object('ok',false,'error','r10_authorization_chain_incomplete'); END IF;
 SELECT * INTO e FROM public.order_fiscal_r10_authorization_evidence_v1
   WHERE order_id=p_order_id FOR UPDATE;
 IF FOUND THEN
   IF e.bling_invoice_id=p_invoice_id AND e.access_key=p_access_key
     AND e.sefaz_cstat=p_cstat AND e.authorization_protocol=p_protocol
     AND e.xml_sha256=p_xml_sha256 AND e.issuer_cnpj=p_issuer_cnpj
   THEN RETURN jsonb_build_object('ok',true,'already_authorized',true,
        'invoice_id',p_invoice_id,'external_write',false); END IF;
   RETURN jsonb_build_object('ok',false,'error','r10_conflicting_authorization_evidence');
 END IF;

 INSERT INTO public.order_fiscal_r10_authorization_evidence_v1(
   order_id,bling_order_id,bling_invoice_id,access_key,sefaz_cstat,
   authorization_protocol,issuer_cnpj,xml_sha256,observed_at)
 VALUES(p_order_id,intent.bling_order_id,p_invoice_id,p_access_key,p_cstat,
   p_protocol,p_issuer_cnpj,p_xml_sha256,p_observed_at);
 UPDATE public.dispatch_fiscal_jobs SET status='authorized',
   bling_invoice_id=p_invoice_id,access_key=p_access_key,
   sefaz_status=p_cstat::text,finished_at=coalesce(finished_at,now()),
   updated_at=now(),error_code=NULL,error_detail=NULL
 WHERE id=j.id;
 INSERT INTO public.order_fiscal_controls(
   order_id,dispatch_fiscal_status,dispatch_fiscal_authorized_at,
   dispatch_fiscal_source,dispatch_fiscal_reason,
   bling_invoice_id,sefaz_status,issued_at,updated_at
 ) VALUES(
   p_order_id,'authorized',now(),'r10_verified_bling_sefaz_xml',NULL,
   p_invoice_id,p_cstat::text,now(),now())
 ON CONFLICT(order_id) DO UPDATE SET
   dispatch_fiscal_status='authorized',
   dispatch_fiscal_authorized_at=now(),
   dispatch_fiscal_source='r10_verified_bling_sefaz_xml',
   dispatch_fiscal_reason=NULL,
   bling_invoice_id=p_invoice_id,sefaz_status=p_cstat::text,
   issued_at=coalesce(public.order_fiscal_controls.issued_at,now()),
   updated_at=now();
 RETURN jsonb_build_object('ok',true,'authorized',true,
   'invoice_id',p_invoice_id,'sefaz_cstat',p_cstat,
   'external_write',false);
END $r10_finalize$;

-- Unlike the older gate's observe mode, any R07-enrolled NEW order must
-- have a trusted R10 authorization before dispatch / delivery transition.
-- Earlier orders with no R07 enrollment remain untouched by this draft.
CREATE OR REPLACE FUNCTION public.ops2_r10_guard_dispatch_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r10_gate$
BEGIN
 IF NEW.status IN ('out_for_delivery','delivered')
    AND OLD.status NOT IN ('out_for_delivery','delivered')
    AND EXISTS(SELECT 1 FROM public.order_bling_r7_sync_intents_v1 r
       WHERE r.order_id=NEW.id) THEN
   IF NOT EXISTS(
     SELECT 1 FROM public.order_fiscal_r10_authorization_evidence_v1 e
     JOIN public.dispatch_fiscal_jobs j ON j.order_id=e.order_id
       AND j.fiscal_version=1
     JOIN public.order_fiscal_controls c ON c.order_id=e.order_id
     WHERE e.order_id=NEW.id AND e.status='authorized'
       AND e.sefaz_cstat IN (100,150)
       AND j.status='authorized'
       AND j.bling_invoice_id=e.bling_invoice_id
       AND j.access_key=e.access_key
       AND c.dispatch_fiscal_status='authorized'
       AND c.bling_invoice_id=e.bling_invoice_id
   ) THEN
     RAISE EXCEPTION 'r10_sefaz_authorization_required_before_dispatch'
       USING ERRCODE='P0001';
   END IF;
 END IF;
 RETURN NEW;
END $r10_gate$;

CREATE TRIGGER trg_ops2_r10_require_sefaz_before_dispatch
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.ops2_r10_guard_dispatch_v1();

REVOKE ALL ON FUNCTION public.ops2_r10_rearm_fiscal_observation_v1(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r10_claim_fiscal_generation_v1(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r10_finalize_authorized_v1(uuid,bigint,text,integer,text,text,text,timestamptz)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r10_guard_dispatch_v1()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_r10_rearm_fiscal_observation_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops2_r10_claim_fiscal_generation_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops2_r10_finalize_authorized_v1(uuid,bigint,text,integer,text,text,text,timestamptz)
 TO service_role;
