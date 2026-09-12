DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'product-image-grid18-v1'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END
$do$;

SELECT cron.schedule(
  'product-image-grid18-v1',
  '*/3 * * * *',
  'select public.dispatch_product_image_grid18_worker_v1();'
);
