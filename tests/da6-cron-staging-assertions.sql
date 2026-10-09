-- DA6: dispatch faz no-op sem segredos/URL; só staging configurado emite HTTP mock.
\set ON_ERROR_STOP on
DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.da6_worker_dispatch_tick_v1() INTO v;
 IF v->>'error' <> 'worker_key_missing' THEN
  RAISE EXCEPTION 'missing_worker_key_was_not_rejected: %',v;
 END IF;
 INSERT INTO vault.decrypted_secrets(name,decrypted_secret)
 VALUES('da6_label_worker_key_v1',repeat('K',40));
 SELECT public.da6_worker_dispatch_tick_v1() INTO v;
 IF v->>'error'<>'worker_endpoint_not_configured' THEN
  RAISE EXCEPTION 'missing_worker_url_was_not_rejected: %',v;
 END IF;
 INSERT INTO vault.decrypted_secrets(name,decrypted_secret)
 VALUES('da6_label_worker_url_v1','https://example.com/hacker');
 SELECT public.da6_worker_dispatch_tick_v1() INTO v;
 IF v->>'error'<>'worker_endpoint_not_configured' THEN
  RAISE EXCEPTION 'unsafe_worker_url_accepted: %',v;
 END IF;
 UPDATE vault.decrypted_secrets
 SET decrypted_secret='https://da6-staging-synthetic.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick'
 WHERE name='da6_label_worker_url_v1';
 SELECT public.da6_worker_dispatch_tick_v1() INTO v;
 IF coalesce((v->>'queued')::boolean,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'staging_url_not_dispatched: %',v;
 END IF;
 IF (SELECT count(*) FROM public.da6_outbound_requests)<>1 THEN
  RAISE EXCEPTION 'unwanted_http_request';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.da6_outbound_requests
  WHERE url='https://da6-staging-synthetic.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick'
  AND headers->>'x-da6-worker-key'=repeat('K',40)
  AND body='{"limit":3}'::jsonb AND timeout_ms=55000) THEN
  RAISE EXCEPTION 'wrong_staging_url_or_credentials';
 END IF;
 IF EXISTS(SELECT 1 FROM public.da6_outbound_requests WHERE url LIKE '%ssbesxgaijknwsjbsbcz%') THEN
  RAISE EXCEPTION 'production_endpoint_called_from_staging';
 END IF;
 UPDATE public.inventory_label_photos SET status='complete';
 SELECT public.da6_worker_dispatch_tick_v1() INTO v;
 IF v->>'reason'<>'queue_empty' THEN
  RAISE EXCEPTION 'empty_queue_sent_http: %',v;
 END IF;
 IF (SELECT count(*) FROM public.da6_outbound_requests)<>1 THEN
  RAISE EXCEPTION 'empty_queue_created_extra_request';
 END IF;
 RAISE NOTICE 'DA6 cron isolated: fail-closed secrets and URL, staging only, empty queue PASS';
END $$;
ROLLBACK;
