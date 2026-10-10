begin;

do $$
begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'pg_cron_required';
  end if;
  if not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'pg_net_required';
  end if;
end;
$$;

create or replace function public.run_marketing_campaign_worker_tick_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_locked boolean:=false;
  v_active_accounts integer:=0;
  v_secret text;
  v_tick_id uuid:=gen_random_uuid();
  v_request_id bigint;
begin
  select pg_try_advisory_xact_lock(hashtextextended('marketing-campaign-worker-v1',0)) into v_locked;
  if coalesce(v_locked,false) is not true then
    return jsonb_build_object('ok',true,'no_op',true,'reason','tick_already_running');
  end if;

  select count(*)::integer into v_active_accounts
  from public.marketing_campaign_execution_runtime_v1 e
  join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=e.whatsapp_account_id
  where e.mode in ('canary','live')
    and r.campaigns_enabled is true
    and r.send_enabled is true
    and r.outbound_provider='meta';

  if v_active_accounts=0 then
    return jsonb_build_object('ok',true,'no_op',true,'reason','campaigns_disabled','active_accounts',0);
  end if;

  v_secret:=public.marketing_campaign_worker_internal_key_v1();
  if nullif(btrim(coalesce(v_secret,'')),'') is null then
    return jsonb_build_object('ok',false,'error','worker_auth_unavailable');
  end if;

  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-marketing-worker-v1',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-marketing-worker-key',v_secret
    ),
    body:=jsonb_build_object('limit',10,'tick_id',v_tick_id::text),
    timeout_milliseconds:=55000
  ) into v_request_id;

  return jsonb_build_object(
    'ok',true,
    'no_op',false,
    'tick_id',v_tick_id,
    'request_id',v_request_id,
    'active_accounts',v_active_accounts
  );
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
