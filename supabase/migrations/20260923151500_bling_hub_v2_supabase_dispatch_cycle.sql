
create or replace function public.dispatch_bling_hub_cycle_v2()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request_id bigint;
begin
  if not exists(
    select 1
    from public.bling_hub_runtime_v2
    where id=1
      and hub_enabled=true
      and mode in ('homologation','live')
  ) then
    return null;
  end if;

  select net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()
    ),
    body := jsonb_build_object(
      'action','vitrine_bling_hub_internal',
      'subaction','process_cycle',
      'limit',3
    ),
    timeout_milliseconds := 55000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_bling_hub_cycle_v2() from public,anon,authenticated;
grant execute on function public.dispatch_bling_hub_cycle_v2() to service_role;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='bling-hub-v2-cycle';
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule(
  'bling-hub-v2-cycle',
  '*/2 * * * *',
  'select public.dispatch_bling_hub_cycle_v2();'
);
