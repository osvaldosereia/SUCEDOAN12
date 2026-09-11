create or replace function public.dispatch_inventory_product_research_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_pending bigint:=0;
  v_backfill bigint:=0;
  v_request bigint;
begin
  select count(*) into v_pending
  from public.unresolved_product_eans
  where research_attempts < 5
    and (
      status in ('pending','error')
      or (status='researching' and last_research_at < now() - interval '30 minutes')
    );

  select count(*) into v_backfill
  from public.products
  where source_system='ai_ean_research'
    and coalesce(metadata->>'rich_research_version','') not in ('v2','v2_failed');

  if v_pending=0 and v_backfill=0 then
    return jsonb_build_object('dispatched',false,'reason','queue_empty');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='inventory_product_research_webhook_key_v1'
  order by created_at desc limit 1;
  if v_secret is null then
    return jsonb_build_object('dispatched',false,'reason','worker_secret_missing');
  end if;

  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/inventory-product-research-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-product-research-key',v_secret),
    body:=jsonb_build_object('event','drain','limit',5),
    timeout_milliseconds:=120000
  );
  return jsonb_build_object('dispatched',true,'request_id',v_request,'pending',v_pending,'backfill',v_backfill);
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end;
$$;

revoke execute on function public.dispatch_inventory_product_research_v1() from public,anon,authenticated;
grant execute on function public.dispatch_inventory_product_research_v1() to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='inventory-product-research-v1' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('inventory-product-research-v1','*/10 * * * *','select public.dispatch_inventory_product_research_v1();');
end $$;
