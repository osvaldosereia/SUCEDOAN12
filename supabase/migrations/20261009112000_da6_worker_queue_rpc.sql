-- DA6: funções aplicadas ao Supabase canônico, versionadas por leitura do próprio banco.
-- Contagens entram como pending_review; estas RPCs nunca alteram o estoque ou o Bling.

CREATE OR REPLACE FUNCTION public.inventory_label_claim_next()
 RETURNS TABLE(photo_id uuid, storage_path text, attempt_no integer, claim_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'worker_only' USING ERRCODE='42501';
  END IF;
  UPDATE public.inventory_label_photos
  SET status='failed',error_code='worker_timeout',error_detail='Limite de tentativas',
      finished_at=now(),updated_at=now(),claim_token=NULL
  WHERE status='processing' AND attempts>=3 AND claimed_at<now()-interval '5 minutes';
  SELECT p.id INTO v_id
    FROM public.inventory_label_photos AS p
    WHERE p.attempts<3 AND
    ((p.status IN ('queued','retry') AND COALESCE(p.next_attempt_at,now())<=now())
    OR (p.status='processing' AND p.claimed_at<now()-interval '5 minutes'))
    ORDER BY p.created_at,p.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE public.inventory_label_photos
  SET status='processing',attempts=attempts+1,claim_token=gen_random_uuid(),
      claimed_at=now(),next_attempt_at=NULL,updated_at=now(),
      error_code=NULL,error_detail=NULL
  WHERE id=v_id;
  RETURN QUERY SELECT p.id,p.storage_path,p.attempts::integer,p.claim_token
    FROM public.inventory_label_photos AS p WHERE p.id=v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.inventory_label_fail_photo(p_photo_id uuid, p_claim_token uuid, p_error_code text, p_error_detail text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempts integer;v_status text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'worker_only' USING ERRCODE='42501';
 END IF;
 SELECT attempts INTO v_attempts FROM public.inventory_label_photos
  WHERE id=p_photo_id AND claim_token=p_claim_token AND status='processing' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale_claim' USING ERRCODE='40001'; END IF;
 v_status:=CASE WHEN v_attempts>=3 THEN 'failed' ELSE 'retry' END;
 UPDATE public.inventory_label_photos
 SET status=v_status,error_code=left(coalesce(p_error_code,'read_failed'),80),
  error_detail=left(coalesce(p_error_detail,''),500),
  next_attempt_at=CASE WHEN v_status='retry' THEN now()+make_interval(secs=>CASE WHEN v_attempts=1 THEN 15 ELSE 60 END) ELSE NULL END,
  finished_at=CASE WHEN v_status='failed' THEN now() ELSE NULL END,
  claim_token=NULL,claimed_at=NULL,updated_at=now()
 WHERE id=p_photo_id;
 RETURN v_status;
END $function$
;

CREATE OR REPLACE FUNCTION public.inventory_label_finish_photo(p_photo_id uuid, p_claim_token uuid, p_product_id uuid, p_label_serial text, p_readings jsonb, p_errors jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_photo public.inventory_label_photos%ROWTYPE;
 v_reading jsonb;v_slot integer;v_qty integer;v_conf numeric;
 v_duplicates integer:=0;v_inserted integer:=0;v_status text;
 v_seen integer[]:='{}';
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'worker_only' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_photo FROM public.inventory_label_photos
 WHERE id=p_photo_id AND claim_token=p_claim_token AND status='processing' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale_claim' USING ERRCODE='40001'; END IF;
 IF p_label_serial !~ '^[0-9A-F]{10,20}$' OR p_product_id IS NULL THEN
  RAISE EXCEPTION 'invalid_identity' USING ERRCODE='22023';
 END IF;
 IF p_readings IS NULL OR p_errors IS NULL
  OR jsonb_typeof(p_readings) IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_errors) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'invalid_readings' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_readings)>6 THEN
  RAISE EXCEPTION 'too_many_readings' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id) THEN
  RAISE EXCEPTION 'product_not_found' USING ERRCODE='22023';
 END IF;
 FOR v_reading IN SELECT value FROM jsonb_array_elements(p_readings) LOOP
  IF jsonb_typeof(v_reading) <> 'object' THEN
   RAISE EXCEPTION 'invalid_reading' USING ERRCODE='22023';
  END IF;
  BEGIN
   v_slot:=(v_reading->>'slot')::integer;
   v_qty:=(v_reading->>'quantity')::integer;
   v_conf:=(v_reading->>'confidence')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_reading' USING ERRCODE='22023';
  END;
  IF v_slot IS NULL OR v_slot NOT BETWEEN 1 AND 6
   OR v_qty IS NULL OR v_qty NOT BETWEEN 0 AND 99
   OR v_conf IS NULL OR v_conf NOT BETWEEN 0 AND 1
   OR v_slot=ANY(v_seen) THEN
   RAISE EXCEPTION 'invalid_reading' USING ERRCODE='22023';
  END IF;
  v_seen:=array_append(v_seen,v_slot);
  INSERT INTO public.inventory_label_counts
   (photo_id,batch_id,product_id,label_serial,balance_slot,quantity,confidence,status)
  VALUES(p_photo_id,v_photo.batch_id,p_product_id,p_label_serial,v_slot,v_qty,v_conf,'pending_review')
  ON CONFLICT (label_serial,balance_slot) DO NOTHING;
  IF FOUND THEN v_inserted:=v_inserted+1; ELSE v_duplicates:=v_duplicates+1; END IF;
 END LOOP;
 v_status:=CASE WHEN v_duplicates>0 OR jsonb_array_length(p_errors)>0 OR v_inserted=0
  THEN 'needs_review' ELSE 'complete' END;
 UPDATE public.inventory_label_photos
 SET status=v_status,parsed=jsonb_build_object('product_id',p_product_id,'label_serial',p_label_serial,
  'readings',p_readings,'errors',p_errors,'duplicates',v_duplicates),
  error_code=CASE WHEN v_duplicates>0 THEN 'duplicate_balance_slot'
   WHEN jsonb_array_length(p_errors)>0 THEN 'ambiguous_marks'
   WHEN v_inserted=0 THEN 'no_active_balance' ELSE NULL END,
  claim_token=NULL,claimed_at=NULL,finished_at=now(),updated_at=now()
 WHERE id=p_photo_id;
 RETURN jsonb_build_object('status',v_status,'inserted',v_inserted,'duplicates',v_duplicates);
END $function$
;

REVOKE ALL ON FUNCTION public.inventory_label_claim_next() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.inventory_label_fail_photo(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.inventory_label_finish_photo(uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_label_claim_next() TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_label_fail_photo(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_label_finish_photo(uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;
