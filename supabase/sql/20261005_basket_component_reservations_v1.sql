-- Dona Antônia · Cestas/Kits: reserva explícita de componentes v1
-- Reservas explícitas existem enquanto o lote está Em montagem.
begin;

alter table public.basket_stock_lots
  add column if not exists assembly_status text not null default 'legacy';

do $$
begin
  if not exists(select 1 from pg_constraint where conname='basket_stock_lots_assembly_status_chk') then
    alter table public.basket_stock_lots
      add constraint basket_stock_lots_assembly_status_chk
      check (assembly_status in ('legacy','assembling','mounted'));
  end if;
end$$;

create table if not exists public.basket_lot_component_reservations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.basket_stock_lots(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_reserved numeric(14,3) not null check(quantity_reserved > 0),
  status text not null default 'active' check(status in ('active','converted','released')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lot_id,product_id)
);

create index if not exists basket_lot_component_reservations_product_status_idx
  on public.basket_lot_component_reservations(product_id,status);
create index if not exists basket_lot_component_reservations_lot_status_idx
  on public.basket_lot_component_reservations(lot_id,status);

alter table public.basket_lot_component_reservations enable row level security;
revoke all on public.basket_lot_component_reservations from public,anon,authenticated;
grant all on public.basket_lot_component_reservations to service_role;

-- Lotes já prontos continuam protegidos pela regra histórica de lote disponível.
update public.basket_stock_lots
set assembly_status='mounted',updated_at=now()
where status in ('ready','depleted') and assembly_status='legacy';

-- Drafts históricos não recebem reserva retroativa.
update public.basket_stock_lots
set assembly_status='legacy',updated_at=now()
where status='draft' and assembly_status<>'legacy';

create or replace view public.basket_locked_component_stock_v1
with (security_invoker=true)
as
with explicit_reservations as (
  select r.product_id,
         sum(r.quantity_reserved)::numeric as qty
  from public.basket_lot_component_reservations r
  join public.basket_stock_lots l on l.id=r.lot_id
  where r.status='active'
    and l.assembly_status='assembling'
  group by r.product_id
),
available_lots as (
  select li.product_id,
         sum(li.quantity_per_basket * l.quantity_available)::numeric as qty
  from public.basket_stock_lots l
  join public.basket_stock_lot_items li on li.lot_id=l.id
  where l.status in ('ready','depleted')
    and l.quantity_available>0
    and not exists(
      select 1
      from public.basket_lot_component_reservations r
      where r.lot_id=l.id and r.status='active'
    )
  group by li.product_id
),
active_allocations as (
  select li.product_id,
         sum(li.quantity_per_basket * a.quantity)::numeric as qty
  from public.basket_stock_allocations a
  join public.basket_stock_lot_items li on li.lot_id=a.lot_id
  where a.status='allocated'
  group by li.product_id
)
select p.id as product_id,
       coalesce(r.qty,0)+coalesce(a.qty,0)+coalesce(x.qty,0) as basket_locked_quantity
from public.products p
left join explicit_reservations r on r.product_id=p.id
left join available_lots a on a.product_id=p.id
left join active_allocations x on x.product_id=p.id
where coalesce(r.qty,0)+coalesce(a.qty,0)+coalesce(x.qty,0)>0;

revoke all on public.basket_locked_component_stock_v1 from public,anon,authenticated;
grant select on public.basket_locked_component_stock_v1 to service_role;

create or replace view public.ops2_loose_sellable_stock_v1
with (security_invoker=true)
as
select s.*,
       coalesce(l.basket_locked_quantity,0)::numeric as basket_locked_quantity,
       greatest(0,coalesce(s.effective_sellable_stock,0)-coalesce(l.basket_locked_quantity,0))::numeric as loose_sellable_stock
from public.ops2_sellable_stock_v1 s
left join public.basket_locked_component_stock_v1 l on l.product_id=s.product_id;

revoke all on public.ops2_loose_sellable_stock_v1 from public,anon,authenticated;
grant select on public.ops2_loose_sellable_stock_v1 to service_role;

-- Em montagem nunca é público. Legacy pronto permanece compatível durante a transição.
create or replace view public.basket_lot_public_availability_v1
with (security_invoker=true) as
with component_health as (
  select
    l.id as lot_id,
    coalesce(
      bool_and(
        li.id is not null
        and coalesce(p.is_active,false)
        and coalesce(s.effective_sellable_stock,0)>0
      ),
      false
    ) as components_in_stock
  from public.basket_stock_lots l
  left join public.basket_stock_lot_items li on li.lot_id=l.id
  left join public.products p on p.id=li.product_id
  left join public.ops2_sellable_stock_v1 s on s.product_id=li.product_id
  group by l.id
), lot_model as (
  select
    l.*,
    coalesce(l.linked_lot_id,l.linked_hygiene_lot_id) as canonical_linked_lot_id,
    case
      when l.basket_id is not null then coalesce(bt.is_active,false)
      else coalesce(kt.is_active,false)
    end as model_active,
    case
      when l.basket_id is not null then bt.category_id
      else kt.category_id
    end as category_id,
    coalesce(ch.components_in_stock,false) as components_in_stock
  from public.basket_stock_lots l
  left join public.basket_templates bt on bt.id=l.basket_id
  left join public.basket_kit_templates kt on kt.id=l.kit_template_id
  left join component_health ch on ch.lot_id=l.id
), base as (
  select
    l.*,
    coalesce(c.is_active,false) as category_active,
    case
      when l.assembly_status='assembling' then 'assembling'
      when l.status='draft' then 'draft'
      when l.status in ('depleted','cancelled') or coalesce(l.quantity_available,0)<=0 then 'depleted'
      when not l.model_active then 'model_inactive'
      when l.category_id is null or not coalesce(c.is_active,false) then 'category_inactive'
      when l.status<>'ready' then 'depleted'
      when not coalesce(l.sale_enabled,false) then 'paused'
      when not l.components_in_stock then 'component_out_of_stock'
      else 'available'
    end as base_reason,
    case
      when l.status='ready'
       and l.assembly_status in ('legacy','mounted')
       and coalesce(l.sale_enabled,false)
       and coalesce(l.quantity_available,0)>0
       and l.model_active
       and l.category_id is not null
       and coalesce(c.is_active,false)
       and l.components_in_stock
      then l.quantity_available
      else 0
    end::integer as own_available
  from lot_model l
  left join public.basket_categories c on c.id=l.category_id
)
select
  b.id as lot_id,
  b.basket_id,
  b.kit_template_id,
  b.lot_kind,
  b.short_code,
  b.lot_code,
  b.status,
  b.quantity_built,
  b.quantity_available,
  b.sale_enabled,
  b.public_name,
  b.sale_price_override,
  b.own_sale_price_override,
  b.canonical_linked_lot_id as linked_lot_id,
  b.business_type,
  b.built_at,
  b.created_at,
  b.category_id,
  b.model_active,
  b.category_active,
  b.components_in_stock,
  case when b.canonical_linked_lot_id is null then null else coalesce(x.own_available,0) end::integer as linked_available,
  case
    when b.base_reason<>'available' then 0
    when b.canonical_linked_lot_id is null then b.own_available
    when x.id is null or x.base_reason<>'available' or x.canonical_linked_lot_id is not null then 0
    else least(b.own_available,x.own_available)
  end::integer as public_available,
  case
    when b.base_reason<>'available' then b.base_reason
    when b.canonical_linked_lot_id is not null
      and (x.id is null or x.base_reason<>'available' or x.canonical_linked_lot_id is not null)
      then 'linked_lot_unavailable'
    else 'available'
  end::text as availability_reason
from base b
left join base x on x.id=b.canonical_linked_lot_id;

revoke all on public.basket_lot_public_availability_v1 from public,anon,authenticated;
grant select on public.basket_lot_public_availability_v1 to service_role;

commit;
