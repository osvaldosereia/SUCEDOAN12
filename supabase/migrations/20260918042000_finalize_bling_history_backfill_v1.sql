begin;

create table if not exists public.purchase_history_integrity_snapshots (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  backfill_summary jsonb not null default '{}'::jsonb,
  integrity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.purchase_history_integrity_snapshots enable row level security;
revoke all on public.purchase_history_integrity_snapshots from public,anon,authenticated;
grant select,insert on public.purchase_history_integrity_snapshots to service_role;

create or replace function public.finalize_bling_history_backfill_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_summary jsonb;
  v_integrity jsonb;
  r record;
  v_snapshot uuid;
begin
  v_summary:=public.bling_history_customer_backfill_summary_v1();

  if coalesce((v_summary->>'pending')::int,0)>0
     or coalesce((v_summary->>'running')::int,0)>0
     or coalesce((v_summary->>'error')::int,0)>0
     or coalesce((v_summary->>'paused')::int,0)>0 then
    return jsonb_build_object(
      'ok',false,
      'finalized',false,
      'reason','backfill_not_finished',
      'summary',v_summary
    );
  end if;

  for r in select id from public.customers order by id loop
    perform public.refresh_customer_purchase_profile(r.id);
  end loop;

  v_integrity:=public.get_purchase_history_integrity_v1();

  insert into public.purchase_history_integrity_snapshots(reason,backfill_summary,integrity)
  values('bling_history_backfill_completed',v_summary,v_integrity)
  returning id into v_snapshot;

  update public.bling_history_import_runtime
     set enabled=false,
         fetch_enabled=false,
         promotion_enabled=false,
         notes='Backfill histórico Bling concluído; importação automática encerrada e auditoria final registrada.',
         updated_at=now()
   where id=1;

  if exists(select 1 from cron.job where jobname='bling-history-customer-backfill-v1') then
    perform cron.unschedule('bling-history-customer-backfill-v1');
  end if;

  return jsonb_build_object(
    'ok',true,
    'finalized',true,
    'snapshot_id',v_snapshot,
    'summary',v_summary,
    'integrity',v_integrity
  );
end
$$;

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
    where status in ('pending','error','running','paused')
  ) then
    perform public.finalize_bling_history_backfill_v1();
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

revoke all on function public.finalize_bling_history_backfill_v1() from public,anon,authenticated;
revoke all on function public.invoke_bling_history_customer_backfill_v1(integer) from public,anon,authenticated;
grant execute on function public.finalize_bling_history_backfill_v1() to service_role;
grant execute on function public.invoke_bling_history_customer_backfill_v1(integer) to service_role;

commit;
