begin;

create or replace function public.invoke_bling_history_customer_backfill_v1(p_batch_size integer default 5)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request_id bigint;
  v_batch integer:=greatest(1,least(coalesce(p_batch_size,5),5));
begin
  -- Recupera uma execução eventualmente abandonada.
  update public.bling_history_customer_backfill_queue
     set status='error',
         last_error='stale_running_recovered',
         next_retry_at=now(),
         updated_at=now()
   where status='running'
     and coalesce(last_run_at,updated_at)<now()-interval '10 minutes';

  if not exists(
    select 1
    from public.bling_history_customer_backfill_queue
    where status in ('pending','error','running')
  ) then
    if exists(select 1 from cron.job where jobname='bling-history-customer-backfill-v1') then
      perform cron.unschedule('bling-history-customer-backfill-v1');
    end if;
    return null;
  end if;

  if not exists(
    select 1
    from public.bling_history_customer_backfill_queue
    where status='pending'
       or (status='error' and (next_retry_at is null or next_retry_at<=now()))
  ) then
    return null;
  end if;

  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/bling-history-customer-backfill-v1',
    body:=jsonb_build_object('batch_size',v_batch),
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-import-key',public.get_bling_history_import_key_v1()
    ),
    timeout_milliseconds:=30000
  ) into v_request_id;

  return v_request_id;
end
$$;

revoke all on function public.invoke_bling_history_customer_backfill_v1(integer) from public,anon,authenticated;
grant execute on function public.invoke_bling_history_customer_backfill_v1(integer) to service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='bling-history-customer-backfill-v1') then
    perform cron.unschedule('bling-history-customer-backfill-v1');
  end if;
end
$$;

select cron.schedule(
  'bling-history-customer-backfill-v1',
  '* * * * *',
  'select public.invoke_bling_history_customer_backfill_v1(5);'
);

commit;
