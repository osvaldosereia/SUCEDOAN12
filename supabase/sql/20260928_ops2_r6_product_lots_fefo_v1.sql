-- R6 - product lots / expiry / FEFO / automatic offers.
-- Additive and fail-safe: legacy products keep current behavior until lot tracking is explicitly complete.

create table if not exists public.product_inventory_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  lot_code text,
  expiration_date date not null,
  quantity_on_hand numeric(14,3),
  quantity_reserved numeric(14,3) not null default 0,
  status text not null default 'active'
    check (status in ('active','quarantine','depleted','expired','cancelled')),
  source text not null default 'manual'
    check (source in ('manual','inventory_count','purchase_xml','bling','legacy')),
  source_ref text,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_on_hand is null or quantity_on_hand>=0),
  check (quantity_reserved>=0),
  unique(product_id,lot_code,expiration_date,source_ref)
);

create index if not exists product_inventory_lots_product_expiry_idx
  on public.product_inventory_lots(product_id,expiration_date,status);
create index if not exists product_inventory_lots_expiry_active_idx
  on public.product_inventory_lots(expiration_date,product_id)
  where status='active';

alter table public.product_inventory_lots enable row level security;
revoke all on table public.product_inventory_lots from public,anon,authenticated;
grant select,insert,update,delete on table public.product_inventory_lots to service_role;

create or replace view public.ops2_product_lot_summary_v1 as
with lots as (
  select
    l.product_id,
    count(*) filter(where l.status not in ('cancelled')) as lot_count,
    count(*) filter(where l.status='active' and l.quantity_on_hand is not null) as quantified_lot_count,
    coalesce(sum(greatest(coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0),0))
      filter(where l.status='active' and l.expiration_date>=current_date and l.quantity_on_hand is not null),0)::numeric(14,3) as sellable_lot_qty,
    coalesce(sum(greatest(coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0),0))
      filter(where l.status='active' and l.expiration_date<current_date and l.quantity_on_hand is not null),0)::numeric(14,3) as expired_lot_qty,
    min(l.expiration_date)
      filter(where l.status='active' and l.expiration_date>=current_date
             and (l.quantity_on_hand is null or greatest(l.quantity_on_hand-l.quantity_reserved,0)>0)) as earliest_sellable_expiration,
    min(l.expiration_date)
      filter(where l.status='active' and l.expiration_date<current_date
             and (l.quantity_on_hand is null or greatest(l.quantity_on_hand-l.quantity_reserved,0)>0)) as earliest_expired_expiration
  from public.product_inventory_lots l
  group by l.product_id
)
select
  p.id as product_id,
  p.name,
  p.is_active,
  p.price,
  p.validity_date as legacy_validity_date,
  coalesce((p.metadata->>'lot_tracking_complete')::boolean,false) as lot_tracking_complete,
  coalesce(l.lot_count,0) as lot_count,
  coalesce(l.quantified_lot_count,0) as quantified_lot_count,
  coalesce(l.sellable_lot_qty,0)::numeric(14,3) as sellable_lot_qty,
  coalesce(l.expired_lot_qty,0)::numeric(14,3) as expired_lot_qty,
  l.earliest_sellable_expiration,
  l.earliest_expired_expiration,
  case
    when coalesce((p.metadata->>'lot_tracking_complete')::boolean,false)
      then l.earliest_sellable_expiration
    else p.validity_date
  end as effective_expiration_date,
  case
    when coalesce((p.metadata->>'lot_tracking_complete')::boolean,false)
      then (l.earliest_sellable_expiration is not null)
    else (p.validity_date is null or p.validity_date>=current_date)
  end as has_sellable_validity,
  case
    when coalesce((p.metadata->>'lot_tracking_complete')::boolean,false)
      then (l.earliest_sellable_expiration is null and coalesce(l.expired_lot_qty,0)>0)
    else (p.validity_date is not null and p.validity_date<current_date)
  end as expiry_deactivation_candidate
from public.products p
left join lots l on l.product_id=p.id;

create or replace view public.ops2_expiry_offer_policy_v1 as
select
  s.*,
  case
    when s.effective_expiration_date is null then null
    else (s.effective_expiration_date-current_date)
  end as days_to_expiry,
  case
    when s.effective_expiration_date is null then null
    when s.effective_expiration_date<current_date then null
    when s.effective_expiration_date<current_date+30 then 40
    when s.effective_expiration_date<current_date+60 then 20
    when s.effective_expiration_date<=current_date+90 then 10
    else null
  end as recommended_discount_percent
from public.ops2_product_lot_summary_v1 s;

create or replace function public.ops2_upsert_product_lot_v1(
  p_product_id uuid,
  p_lot_code text,
  p_expiration_date date,
  p_quantity_on_hand numeric default null,
  p_source text default 'manual',
  p_source_ref text default null,
  p_received_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if p_product_id is null or p_expiration_date is null then
    raise exception 'invalid_product_lot';
  end if;
  if p_quantity_on_hand is not null and p_quantity_on_hand<0 then
    raise exception 'invalid_lot_quantity';
  end if;
  if lower(trim(coalesce(p_source,''))) not in ('manual','inventory_count','purchase_xml','bling','legacy') then
    raise exception 'invalid_lot_source';
  end if;

  insert into public.product_inventory_lots(
    product_id,lot_code,expiration_date,quantity_on_hand,status,source,source_ref,received_at,metadata,updated_at
  ) values(
    p_product_id,nullif(trim(coalesce(p_lot_code,'')),''),
    p_expiration_date,p_quantity_on_hand,
    case when p_expiration_date<current_date then 'expired' else 'active' end,
    lower(trim(p_source)),nullif(trim(coalesce(p_source_ref,'')),''),
    p_received_at,coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict(product_id,lot_code,expiration_date,source_ref)
  do update set
    quantity_on_hand=excluded.quantity_on_hand,
    status=case
      when product_inventory_lots.status in ('quarantine','cancelled') then product_inventory_lots.status
      when excluded.expiration_date<current_date then 'expired'
      when coalesce(excluded.quantity_on_hand,0)=0 and excluded.quantity_on_hand is not null then 'depleted'
      else 'active' end,
    received_at=coalesce(excluded.received_at,product_inventory_lots.received_at),
    metadata=coalesce(product_inventory_lots.metadata,'{}'::jsonb)||coalesce(excluded.metadata,'{}'::jsonb),
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'lot_id',v_id,'product_id',p_product_id,'expiration_date',p_expiration_date);
end;
$$;

revoke all on function public.ops2_upsert_product_lot_v1(uuid,text,date,numeric,text,text,timestamptz,jsonb)
  from public,anon,authenticated;
grant execute on function public.ops2_upsert_product_lot_v1(uuid,text,date,numeric,text,text,timestamptz,jsonb)
  to service_role;

create or replace function public.ops2_set_lot_tracking_complete_v1(
  p_product_id uuid,
  p_complete boolean,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products%rowtype;
  v_quantified integer;
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;

  select count(*) into v_quantified
  from public.product_inventory_lots
  where product_id=p_product_id
    and status not in ('cancelled')
    and quantity_on_hand is not null;

  if p_complete and v_quantified=0 then
    raise exception 'lot_tracking_requires_quantified_lot';
  end if;

  update public.products
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'lot_tracking_complete',coalesce(p_complete,false),
       'lot_tracking_updated_at',now(),
       'lot_tracking_updated_by',nullif(trim(coalesce(p_operator,'')),'')
     ),
     updated_at=now()
   where id=p_product_id;

  return jsonb_build_object('ok',true,'product_id',p_product_id,'lot_tracking_complete',coalesce(p_complete,false),'quantified_lots',v_quantified);
end;
$$;

revoke all on function public.ops2_set_lot_tracking_complete_v1(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.ops2_set_lot_tracking_complete_v1(uuid,boolean,text) to service_role;

create or replace function public.ops2_fefo_preview_v1(
  p_product_id uuid,
  p_quantity numeric
) returns jsonb
language sql
security definer
set search_path=public
stable
as $$
with eligible as (
  select id,lot_code,expiration_date,
         greatest(coalesce(quantity_on_hand,0)-coalesce(quantity_reserved,0),0)::numeric(14,3) available
  from public.product_inventory_lots
  where product_id=p_product_id
    and status='active'
    and expiration_date>=current_date
    and quantity_on_hand is not null
    and greatest(quantity_on_hand-quantity_reserved,0)>0
  order by expiration_date,id
),
walk as (
  select id,lot_code,expiration_date,available,
         sum(available) over(order by expiration_date,id rows unbounded preceding) cumulative
  from eligible
),
alloc as (
  select id,lot_code,expiration_date,available,
         greatest(least(available,p_quantity-(cumulative-available)),0)::numeric(14,3) allocate
  from walk
)
select jsonb_build_object(
  'ok',true,
  'product_id',p_product_id,
  'requested_quantity',p_quantity,
  'available_quantity',coalesce((select sum(available) from eligible),0),
  'fully_allocatable',coalesce((select sum(available) from eligible),0)>=p_quantity,
  'allocations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'lot_id',id,'lot_code',lot_code,'expiration_date',expiration_date,
      'available',available,'allocate',allocate
    ) order by expiration_date,id)
    from alloc where allocate>0
  ),'[]'::jsonb)
)
$$;

revoke all on function public.ops2_fefo_preview_v1(uuid,numeric) from public,anon,authenticated;
grant execute on function public.ops2_fefo_preview_v1(uuid,numeric) to service_role;

create or replace function public.ops2_reconcile_lot_expiry_status_v1()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expired integer:=0;
  v_reactivated integer:=0;
  v_depleted integer:=0;
begin
  update public.product_inventory_lots
     set status='expired',updated_at=now()
   where status='active' and expiration_date<current_date;
  get diagnostics v_expired=row_count;

  update public.product_inventory_lots
     set status='depleted',updated_at=now()
   where status='active' and quantity_on_hand is not null
     and greatest(quantity_on_hand-quantity_reserved,0)<=0;
  get diagnostics v_depleted=row_count;

  update public.product_inventory_lots
     set status='active',updated_at=now()
   where status in ('expired','depleted')
     and expiration_date>=current_date
     and quantity_on_hand is not null
     and greatest(quantity_on_hand-quantity_reserved,0)>0;
  get diagnostics v_reactivated=row_count;

  return jsonb_build_object('ok',true,'expired',v_expired,'depleted',v_depleted,'reactivated',v_reactivated);
end;
$$;

revoke all on function public.ops2_reconcile_lot_expiry_status_v1() from public,anon,authenticated;
grant execute on function public.ops2_reconcile_lot_expiry_status_v1() to service_role;