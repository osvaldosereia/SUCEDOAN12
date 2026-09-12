do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname='product-image-openai-v1' loop
    perform cron.unschedule(r.jobid);
  end loop;
  perform cron.schedule(
    'product-image-openai-v1',
    '*/10 * * * *',
    'select public.dispatch_product_image_worker_v1();'
  );
end $$;