-- Dona Antonia Operations 2.0
-- Lightweight delivery runs for 1-2 company cars.
-- No external routing API; stores operational grouping and sequence only.

create table if not exists public.ops_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  service_date date not null default (now() at time zone 'America/Cuiaba')::date,
  vehicle_key text not null check (vehicle_key in ('car_1','car_2')),
  status text not null default 'planned'
    check (status in ('planned','dispatched','completed','cancelled')),
  operator_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz
);

create index if not exists ops_delivery_runs_today_idx
  on public.ops_delivery_runs(service_date,status,vehicle_key,created_at desc);

alter table public.ops_delivery_runs enable row level security;

create table if not exists public.ops_delivery_stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ops_delivery_runs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  sequence integer not null check (sequence between 1 and 100),
  status text not null default 'planned'
    check (status in ('planned','out_for_delivery','delivered','failed','cancelled')),
  address_snapshot jsonb not null default '{}'::jsonb,
  phone_snapshot text,
  customer_name_snapshot text,
  order_number_snapshot text,
  total_cents bigint not null default 0,
  payment_method_snapshot text,
  maps_url_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,order_id),
  unique(run_id,sequence)
);

create index if not exists ops_delivery_stops_order_idx
  on public.ops_delivery_stops(order_id,created_at desc);
create index if not exists ops_delivery_stops_run_idx
  on public.ops_delivery_stops(run_id,sequence);

alter table public.ops_delivery_stops enable row level security;

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
begin
  if p_vehicle_key not in ('car_1','car_2') then
    raise exception 'invalid_vehicle';
  end if;
  if coalesce(array_length(p_order_ids,1),0)<1 or array_length(p_order_ids,1)>30 then
    raise exception 'invalid_route_size';
  end if;

  -- Keep at most one planned run per vehicle/day. Historical dispatched runs remain intact.
  update public.ops_delivery_runs
     set status='cancelled',updated_at=now()
   where service_date=v_today
     and vehicle_key=p_vehicle_key
     and status='planned';

  insert into public.ops_delivery_runs(id,service_date,vehicle_key,status,operator_label)
  values(v_run_id,v_today,p_vehicle_key,'planned',nullif(trim(coalesce(p_operator_label,'')),''));

  foreach v_order_id in array p_order_ids loop
    select * into v_order
      from public.orders
     where id=v_order_id
       and status='ready';
    if not found then
      raise exception 'order_not_ready:%',v_order_id;
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
  end loop;

  return v_run_id;
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
     where r.id in (select run_id from public.ops_delivery_stops where order_id=p_order_id)
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

create or replace function public.get_ops_delivery_runs_today_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
with runs as (
  select *
  from public.ops_delivery_runs
  where service_date=(now() at time zone 'America/Cuiaba')::date
    and status<>'cancelled'
  order by created_at desc
),
packed as (
  select r.id,r.vehicle_key,r.status,r.operator_label,r.created_at,r.dispatched_at,r.completed_at,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'stop_id',s.id,
        'order_id',s.order_id,
        'sequence',s.sequence,
        'status',s.status,
        'address',s.address_snapshot,
        'phone',s.phone_snapshot,
        'customer_name',s.customer_name_snapshot,
        'order_number',s.order_number_snapshot,
        'total_cents',s.total_cents,
        'payment_method',s.payment_method_snapshot,
        'maps_url',s.maps_url_snapshot
      ) order by s.sequence
    ) filter(where s.id is not null),'[]'::jsonb) stops
  from runs r
  left join public.ops_delivery_stops s on s.run_id=r.id
  group by r.id,r.vehicle_key,r.status,r.operator_label,r.created_at,r.dispatched_at,r.completed_at
)
select jsonb_build_object(
  'generated_at',now(),
  'runs',coalesce(jsonb_agg(to_jsonb(packed) order by created_at desc),'[]'::jsonb)
)
from packed;
$$;

revoke all on function public.ops_plan_delivery_run_v1(text,uuid[],text) from public,anon,authenticated;
revoke all on function public.ops_sync_delivery_stop_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.get_ops_delivery_runs_today_v1() from public,anon,authenticated;

grant execute on function public.ops_plan_delivery_run_v1(text,uuid[],text) to service_role;
grant execute on function public.ops_sync_delivery_stop_v1(uuid,text) to service_role;
grant execute on function public.get_ops_delivery_runs_today_v1() to service_role;
