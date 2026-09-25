-- Dona Antonia Operations 2.0
-- Delivery runs v2: preserve failed attempts as terminal stops.

create or replace function public.ops_mark_delivery_stop_failed_v1(
  p_order_id uuid,
  p_reason text default null
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.ops_delivery_stops s
     set status='failed',
         updated_at=now()
   where s.order_id=p_order_id
     and s.status='out_for_delivery'
     and exists (
       select 1 from public.ops_delivery_runs r
       where r.id=s.run_id and r.status in ('planned','dispatched')
     );
  get diagnostics v_count=row_count;

  update public.ops_delivery_runs r
     set status='completed',
         completed_at=coalesce(completed_at,now()),
         updated_at=now()
   where r.status='dispatched'
     and not exists (
       select 1 from public.ops_delivery_stops s
       where s.run_id=r.id
         and s.status not in ('delivered','failed','cancelled')
     );

  return v_count;
end;
$$;

create or replace function public.ops_sync_delivery_stop_v1(
  p_order_id uuid,
  p_order_status text
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status text;
  v_count integer;
begin
  v_status:=case p_order_status
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'delivered'
    when 'ready' then 'planned'
    when 'cancelled' then 'cancelled'
    else null
  end;
  if v_status is null then return 0; end if;

  update public.ops_delivery_stops s
     set status=v_status,updated_at=now()
   where s.order_id=p_order_id
     and s.status<>'failed'
     and exists (
       select 1 from public.ops_delivery_runs r
       where r.id=s.run_id and r.status in ('planned','dispatched')
     );

  get diagnostics v_count=row_count;

  if p_order_status='out_for_delivery' then
    update public.ops_delivery_runs r
       set status='dispatched',
           dispatched_at=coalesce(dispatched_at,now()),
           updated_at=now()
     where r.id in (
       select run_id from public.ops_delivery_stops
       where order_id=p_order_id and status='out_for_delivery'
     )
       and r.status='planned';
  end if;

  update public.ops_delivery_runs r
     set status='completed',
         completed_at=coalesce(completed_at,now()),
         updated_at=now()
   where r.status='dispatched'
     and not exists (
       select 1 from public.ops_delivery_stops s
       where s.run_id=r.id
         and s.status not in ('delivered','failed','cancelled')
     );

  return v_count;
end;
$$;

revoke all on function public.ops_mark_delivery_stop_failed_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.ops_mark_delivery_stop_failed_v1(uuid,text) to service_role;
