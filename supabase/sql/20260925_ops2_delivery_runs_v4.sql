-- Dona Antonia Operations 2.0
-- Delivery runs v4: serialize planning per vehicle and enforce one active route per vehicle/day.

create unique index if not exists ops_delivery_runs_one_active_vehicle_day_uidx
  on public.ops_delivery_runs(service_date, vehicle_key)
  where status in ('planned','dispatched');

create or replace function public.ops_plan_delivery_run_v1(
  p_vehicle_key text,
  p_order_ids uuid[],
  p_operator_label text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid:=gen_random_uuid();
  v_today date:=(now() at time zone 'America/Cuiaba')::date;
  v_order_id uuid;
  v_seq integer:=0;
  v_order public.orders%rowtype;
  v_existing_run uuid;
  v_existing_status text;
begin
  if p_vehicle_key not in ('car_1','car_2') then raise exception 'invalid_vehicle'; end if;
  if coalesce(array_length(p_order_ids,1),0)<1 or array_length(p_order_ids,1)>30 then raise exception 'invalid_route_size'; end if;
  if (select count(distinct x) from unnest(p_order_ids) x)<>array_length(p_order_ids,1) then raise exception 'duplicate_order_in_route'; end if;

  -- Serialize route planning for the same vehicle/day so concurrent operators
  -- cannot create two active routes or overwrite each other mid-transaction.
  perform pg_advisory_xact_lock(
    hashtextextended('ops_delivery_run:'||v_today::text||':'||p_vehicle_key,0)
  );

  if exists (
    select 1 from public.ops_delivery_runs
    where service_date=v_today and vehicle_key=p_vehicle_key and status='dispatched'
  ) then raise exception 'vehicle_already_dispatched'; end if;

  -- A planned route can be rebuilt safely before departure.
  update public.ops_delivery_runs
     set status='cancelled',updated_at=now()
   where service_date=v_today and vehicle_key=p_vehicle_key and status='planned';

  insert into public.ops_delivery_runs(id,service_date,vehicle_key,status,operator_label)
  values(v_run_id,v_today,p_vehicle_key,'planned',nullif(trim(coalesce(p_operator_label,'')),''));

  foreach v_order_id in array p_order_ids loop
    select * into v_order from public.orders
     where id=v_order_id and status='ready'
     for update;
    if not found then raise exception 'order_not_ready:%',v_order_id; end if;

    if exists (
      select 1 from public.order_delivery_return_cases
      where order_id=v_order_id and status='returned_review'
    ) then raise exception 'delivery_return_review_open:%',v_order_id; end if;

    select r.id,r.status into v_existing_run,v_existing_status
    from public.ops_delivery_stops s
    join public.ops_delivery_runs r on r.id=s.run_id
    where s.order_id=v_order_id
      and r.service_date=v_today
      and r.status in ('planned','dispatched')
      and r.id<>v_run_id
    order by case r.status when 'dispatched' then 0 else 1 end,r.created_at desc
    limit 1;

    if v_existing_run is not null and v_existing_status='dispatched' then
      raise exception 'order_already_dispatched:%',v_order_id;
    end if;

    if v_existing_run is not null then
      delete from public.ops_delivery_stops
       where run_id=v_existing_run and order_id=v_order_id;
      update public.ops_delivery_runs
         set status='cancelled',updated_at=now()
       where id=v_existing_run
         and status='planned'
         and not exists(select 1 from public.ops_delivery_stops where run_id=v_existing_run);
    end if;

    v_seq:=v_seq+1;
    insert into public.ops_delivery_stops(
      run_id,order_id,sequence,status,address_snapshot,phone_snapshot,
      customer_name_snapshot,order_number_snapshot,total_cents,payment_method_snapshot,maps_url_snapshot
    ) values (
      v_run_id,v_order.id,v_seq,'planned',coalesce(v_order.delivery_address,'{}'::jsonb),
      coalesce(v_order.phone_e164,v_order.delivery_address->>'phone'),
      coalesce(v_order.customer_snapshot->>'name',v_order.delivery_address->>'customer_name',v_order.delivery_address->>'recipient_name'),
      v_order.order_number,round(coalesce(v_order.total,0)*100)::bigint,v_order.payment_method,
      v_order.delivery_address->>'google_maps_url'
    );

    v_existing_run:=null; v_existing_status:=null;
  end loop;

  return v_run_id;
end;
$$;

revoke all on function public.ops_plan_delivery_run_v1(text,uuid[],text)
  from public,anon,authenticated;
grant execute on function public.ops_plan_delivery_run_v1(text,uuid[],text)
  to service_role;
