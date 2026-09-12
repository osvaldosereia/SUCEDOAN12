create or replace function public.sync_rejected_product_image_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='rejected' and (old.status is distinct from new.status or old.updated_at is distinct from new.updated_at) then
    update public.products
       set image_url=case when nullif(new.source_used_url,'') is not null then new.source_used_url else image_url end,
           image_original_url=case when nullif(new.source_used_url,'') is not null then new.source_used_url else image_original_url end,
           image_ai_url=null,
           image_ai_status='rejected',
           image_ai_error=coalesce(new.error_message,'image_generation_rejected'),
           image_ai_validation=coalesce(new.validation,'{}'::jsonb),
           updated_at=now()
     where id=new.product_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_rejected_product_image_v2 on public.product_image_jobs;
create trigger trg_sync_rejected_product_image_v2
after update of status,updated_at on public.product_image_jobs
for each row execute function public.sync_rejected_product_image_v2();

create or replace function public.dispatch_product_image_worker_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_secret text;
  v_pending bigint:=0;
  v_request bigint;
  v_enqueued integer:=0;
begin
  select public.enqueue_product_image_jobs_v2(12) into v_enqueued;

  select count(*) into v_pending
  from public.product_image_jobs
  where status in ('pending','error') and attempts<3;

  if v_pending=0 then
    return jsonb_build_object('dispatched',false,'reason','queue_empty','enqueued',v_enqueued);
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_image_worker_webhook_key_v1'
  order by created_at desc
  limit 1;

  if v_secret is null then
    return jsonb_build_object('dispatched',false,'reason','worker_secret_missing');
  end if;

  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-openai-v2',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-product-image-key',v_secret),
    body:=jsonb_build_object('event','drain','limit',1),
    timeout_milliseconds:=120000
  );

  return jsonb_build_object('dispatched',true,'request_id',v_request,'pending',v_pending,'enqueued',v_enqueued);
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end;
$function$;

revoke all on function public.dispatch_product_image_worker_v2() from public, anon, authenticated;
grant execute on function public.dispatch_product_image_worker_v2() to service_role;
revoke all on function public.sync_rejected_product_image_v2() from public, anon, authenticated;
grant execute on function public.sync_rejected_product_image_v2() to service_role;

do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('product-image-openai-v1','product-image-openai-v2') loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule('product-image-openai-v2','*/10 * * * *','select public.dispatch_product_image_worker_v2();');