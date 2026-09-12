create or replace function public.dispatch_product_image_grid18_worker_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret text;
  v_eligible bigint := 0;
  v_active bigint := 0;
  v_fallback bigint := 0;
  v_request bigint;
  v_enqueued integer := 0;
  v_event text;
begin
  select public.enqueue_product_image_jobs_v2(72) into v_enqueued;

  select count(*) into v_active
  from public.product_image_batches b
  where b.mode='grid_3x6_18'
    and b.status in ('processing','prepared','generated');

  select count(*) into v_fallback
  from public.product_image_jobs j
  where j.status in ('pending','error')
    and j.attempts < 3
    and j.force_individual = true;

  select count(*) into v_eligible
  from public.product_image_jobs j
  where j.status in ('pending','error')
    and j.attempts < 3
    and j.force_individual = false
    and j.grid_attempts < 1;

  if v_active > 0 then
    v_event := 'advance';
  elsif v_fallback > 0 then
    v_event := 'fallback';
  elsif v_eligible >= 18 then
    v_event := 'advance';
  else
    return jsonb_build_object(
      'dispatched', false,
      'reason', 'nothing_ready',
      'active_batches', v_active,
      'fallback', v_fallback,
      'eligible', v_eligible,
      'enqueued', v_enqueued
    );
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_image_worker_webhook_key_v1'
  order by created_at desc
  limit 1;

  if v_secret is null then
    return jsonb_build_object('dispatched',false,'reason','worker_secret_missing');
  end if;

  v_request := net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-openai-grid18-v1',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-da-product-image-key',v_secret
    ),
    body := jsonb_build_object('event',v_event),
    timeout_milliseconds := 120000
  );

  return jsonb_build_object(
    'dispatched', true,
    'event', v_event,
    'request_id', v_request,
    'active_batches', v_active,
    'fallback', v_fallback,
    'eligible', v_eligible,
    'enqueued', v_enqueued
  );
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end;
$function$;

revoke all on function public.dispatch_product_image_grid18_worker_v1() from public, anon, authenticated;
grant execute on function public.dispatch_product_image_grid18_worker_v1() to service_role;

revoke all on function public.claim_product_image_grid18_batch_v1() from public, anon, authenticated;
grant execute on function public.claim_product_image_grid18_batch_v1() to service_role;
revoke all on function public.claim_product_image_fallback_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_product_image_fallback_v1(integer) to service_role;

DO $do$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('product-image-openai-v1','product-image-openai-v2','product-image-grid-v1','product-image-grid18-v1') loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$do$;

select cron.schedule(
  'product-image-grid18-v1',
  '* * * * *',
  'select public.dispatch_product_image_grid18_worker_v1();'
);
