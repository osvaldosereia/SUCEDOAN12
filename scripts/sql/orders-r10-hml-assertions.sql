-- Synthetic R10: no real POST, Bling, SEFAZ, customer or payment.
\set ON_ERROR_STOP on
DO $r10$
DECLARE
 o uuid;
 v jsonb;
 real_key text:='51261011222333000181550010000000011000000014';
 dummy_hash text:=repeat('a',64);
BEGIN
  SELECT order_id INTO o FROM public.order_fiscal_r9_observations_v1
    WHERE status='observed_no_invoice';
  IF o IS NULL THEN RAISE EXCEPTION 'missing R09 synthetic observation'; END IF;
  IF has_function_privilege('anon','public.ops2_r10_finalize_authorized_v1(uuid,bigint,text,integer,text,text,text,timestamptz)','EXECUTE')
    OR has_table_privilege('authenticated','public.order_fiscal_r10_authorization_evidence_v1','SELECT')
  THEN RAISE EXCEPTION 'R10 authorization evidence exposed'; END IF;
  IF NOT has_function_privilege('service_role',
    'public.ops2_r10_finalize_authorized_v1(uuid,bigint,text,integer,text,text,text,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'R10 service role grant missing'; END IF;
  v:=public.ops2_r10_claim_fiscal_generation_v1(o);
  IF v->>'error' IS DISTINCT FROM 'r8_approved_tax_attestation_not_integrated' THEN
    RAISE EXCEPTION 'generation was not blocked by missing tax approval: %',v; END IF;
  IF (SELECT attempts FROM public.dispatch_fiscal_jobs WHERE order_id=o)<>0
    THEN RAISE EXCEPTION 'R10 consumed generation attempt without R08 tax approval'; END IF;
  BEGIN
    UPDATE public.orders SET status='out_for_delivery' WHERE id=o;
    RAISE EXCEPTION 'dispatch escaped before proof';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'r10_sefaz_authorization_required%' THEN
      RAISE; END IF;
  END;
  IF (SELECT status FROM public.orders WHERE id=o)<>'ready' THEN
    RAISE EXCEPTION 'unauthorized dispatch status persisted'; END IF;
  v:=public.ops2_r10_finalize_authorized_v1(o,901,real_key,100,
      '123456789012345','11222333000181',dummy_hash,now());
  IF v->>'error' IS DISTINCT FROM 'r10_authorization_chain_incomplete' THEN
    RAISE EXCEPTION 'premature authorization permitted: %',v; END IF;
  -- A historical job exists after generation. Rearm ONLY observation GET.
  UPDATE public.dispatch_fiscal_jobs SET status='generated',
    attempts=1,bling_invoice_id=901 WHERE order_id=o;
  v:=public.ops2_r10_rearm_fiscal_observation_v1(o);
  IF v->>'rearmed_get_only' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'R09 read-only retry not rearmed: %',v; END IF;
  IF (SELECT status FROM public.order_fiscal_r9_observations_v1
      WHERE order_id=o)<>'pending' THEN
    RAISE EXCEPTION 'observation GET rearm did not change state'; END IF;
  -- A simulated authenticated GET now finds this ONE NF-e.
  UPDATE public.order_fiscal_r9_observations_v1
  SET status='invoice_found',observed_at=now(),
    evidence=jsonb_build_object('source','bling_get','invoice_id',901,
      'invoice_count',1,'external_write',false)
  WHERE order_id=o;
  v:=public.ops2_r10_finalize_authorized_v1(o,901,real_key,110,
      '123456789012345','11222333000181',dummy_hash,now());
  IF v->>'error' IS DISTINCT FROM 'r10_invalid_sefaz_evidence' THEN
    RAISE EXCEPTION 'denied SEFAZ status accepted: %',v; END IF;
  v:=public.ops2_r10_finalize_authorized_v1(o,901,real_key,100,
      'bad-protocol','11222333000181',dummy_hash,now());
  IF v->>'error' IS DISTINCT FROM 'r10_invalid_sefaz_evidence' THEN
    RAISE EXCEPTION 'invalid SEFAZ protocol accepted: %',v; END IF;
  v:=public.ops2_r10_finalize_authorized_v1(o,902,real_key,100,
      '123456789012345','11222333000181',dummy_hash,now());
  IF v->>'error' IS DISTINCT FROM 'r10_authorization_chain_incomplete' THEN
    RAISE EXCEPTION 'foreign invoice ID authorized: %',v; END IF;
  v:=public.ops2_r10_finalize_authorized_v1(o,901,real_key,100,
      '123456789012345','11222333000181',dummy_hash,now());
  IF v->>'authorized' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'valid synthetic XML evidence was not recorded: %',v; END IF;
  IF (SELECT status FROM public.dispatch_fiscal_jobs WHERE order_id=o)<>'authorized'
    OR (SELECT dispatch_fiscal_status FROM public.order_fiscal_controls
        WHERE order_id=o)<>'authorized'
    OR (SELECT count(*) FROM public.order_fiscal_r10_authorization_evidence_v1
        WHERE order_id=o)<>1 THEN
      RAISE EXCEPTION 'R10 atomic fiscal gate not updated'; END IF;
  v:=public.ops2_r10_finalize_authorized_v1(o,901,real_key,100,
      '123456789012345','11222333000181',dummy_hash,now());
  IF v->>'already_authorized' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'same SEFAZ evidence failed idempotent replay: %',v; END IF;
  IF (SELECT count(*) FROM public.order_fiscal_r10_authorization_evidence_v1)<>1
    THEN RAISE EXCEPTION 'duplicate SEFAZ proof'; END IF;
  UPDATE public.orders SET status='out_for_delivery' WHERE id=o;
  IF (SELECT status FROM public.orders WHERE id=o)<>'out_for_delivery' THEN
    RAISE EXCEPTION 'authorized dispatch not allowed'; END IF;
  UPDATE public.orders SET status='delivered' WHERE id=o;
  IF (SELECT status FROM public.orders WHERE id=o)<>'delivered' THEN
    RAISE EXCEPTION 'authorized delivery not allowed'; END IF;
END $r10$;
SELECT 'PASS R10 - fiscal claim off without tax approval, dispatch gate, authorized evidence, unique SEFAZ replay' AS result;
