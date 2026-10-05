begin;

create or replace function public.run_marketing_campaign_worker_tick_v1()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_has_runnable boolean:=false;
  v_request_id bigint;
  v_internal_key text;
  v_tick_id text:=gen_random_uuid()::text;
begin
  if not pg_try_advisory_xact_lock(20261005021000::bigint) then
    return null;
  end if;

  select exists(
    select 1
    from public.marketing_campaign_execution_runtime_v1 e
    join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=e.whatsapp_account_id
    join public.whatsapp_accounts a on a.id=e.whatsapp_account_id
    where e.mode in ('canary','live')
      and r.campaigns_enabled is true
      and r.send_enabled is true
      and r.outbound_provider='meta'
      and a.is_active is true
  ) into v_has_runnable;

  if coalesce(v_has_runnable,false) is not true then
    return null; -- no-op: gate fechado, nenhum HTTP
  end if;

  v_internal_key:=public.marketing_campaign_worker_internal_key_v1();
  if nullif(btrim(coalesce(v_internal_key,'')),'') is null then
    return null;
  end if;

  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-marketing-worker-v1',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-marketing-worker-key',v_internal_key
    ),
    body:=jsonb_build_object('limit',10,'tick_id',v_tick_id),
    timeout_milliseconds:=55000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.run_marketing_campaign_worker_tick_v1() from public,anon,authenticated;
grant execute on function public.run_marketing_campaign_worker_tick_v1() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='marketing-campaign-worker-v1'
  order by jobid desc
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'marketing-campaign-worker-v1',
    '* * * * *',
    'select public.run_marketing_campaign_worker_tick_v1();'
  );
end;
$$;

commit;
