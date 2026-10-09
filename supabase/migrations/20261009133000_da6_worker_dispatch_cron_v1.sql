-- DA6: fila OMR com índice de deduplicação e cron econômico.
-- A rotina só despacha se houver foto pendente; nenhuma função fiscal ou estoque.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_label_photos_operator_sha256_uidx
 ON public.inventory_label_photos(created_by,sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_label_photos_queue_v1_idx
 ON public.inventory_label_photos(status,next_attempt_at,created_at)
 WHERE status IN ('queued','retry','processing');
CREATE OR REPLACE FUNCTION public.da6_worker_dispatch_tick_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pending boolean;v_secret text;v_url text;v_request_id bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('inventory-label-worker-da6-v1',0)) THEN
  RETURN jsonb_build_object('ok',true,'no_op',true,'reason','tick_locked');
 END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.inventory_label_photos
  WHERE (status IN ('queued','retry') AND attempts<3 AND COALESCE(next_attempt_at,now())<=now())
    OR (status='processing' AND claimed_at<now()-interval '5 minutes')
 ) INTO v_pending;
 IF NOT v_pending THEN RETURN jsonb_build_object('ok',true,'no_op',true,'reason','queue_empty');END IF;
 SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
  WHERE name='da6_label_worker_key_v1';
 SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets
  WHERE name='da6_label_worker_url_v1';
 IF v_secret IS NULL OR length(v_secret)<16 THEN
   RETURN jsonb_build_object('ok',false,'error','worker_key_missing');
 END IF;
 -- Fail closed em homologação e produção até que a URL de CADA ambiente seja instalada.
 IF v_url IS NULL OR v_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/admin-products-live-v1[?]action=inventory_label_worker_tick$' THEN
   RETURN jsonb_build_object('ok',false,'error','worker_endpoint_not_configured');
 END IF;
 SELECT net.http_post(
  url:=v_url,
  headers:=jsonb_build_object('Content-Type','application/json','x-da6-worker-key',v_secret),
  body:='{"limit":3}'::jsonb,
  timeout_milliseconds:=55000
 ) INTO v_request_id;
 RETURN jsonb_build_object('ok',true,'queued',true,'request_id',v_request_id);
END $$;
REVOKE ALL ON FUNCTION public.da6_worker_dispatch_tick_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.da6_worker_dispatch_tick_v1() TO service_role;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='inventory-label-worker-da6-v1') THEN
  PERFORM cron.schedule('inventory-label-worker-da6-v1','* * * * *','select public.da6_worker_dispatch_tick_v1();');
 END IF;
END $$;
