-- Dona Antônia · Cestas e Kits V2 core
-- Isolated V2 schema. Does not alter legacy basket tables.

create extension if not exists pgcrypto;

create table if not exists public.basket_v2_items (
  id uuid primary key default gen_random_uuid(),
  public_name text not null check (length(trim(public_name)) between 1 and 160),
  category_id uuid not null references public.basket_categories(id),
  image_url text,
  description_short text,
  sale_price numeric(12,2) not null check (sale_price > 0),
  composition_mode text not null default 'products' check (composition_mode in ('products','combined_kits')),
  paused boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  legacy_source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.basket_v2_product_components (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.basket_v2_items(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  position_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(item_id, product_id)
);

create table if not exists public.basket_v2_kit_components (
  id uuid primary key default gen_random_uuid(),
  parent_item_id uuid not null references public.basket_v2_items(id) on delete cascade,
  component_item_id uuid not null references public.basket_v2_items(id),
  quantity integer not null check (quantity >= 1),
  position_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_item_id <> component_item_id),
  unique(parent_item_id, component_item_id)
);

create table if not exists public.basket_v2_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.basket_v2_items(id) on delete restrict,
  code text not null check (length(trim(code)) between 1 and 32),
  status text not null default 'draft' check (status in ('draft','mounted','exhausted')),
  quantity_built integer not null default 0 check (quantity_built >= 0),
  quantity_available integer not null default 0 check (quantity_available >= 0 and quantity_available <= quantity_built),
  cost_total_snapshot numeric(12,2),
  retail_total_snapshot numeric(12,2),
  mounted_at timestamptz,
  legacy_source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(item_id, code)
);

create table if not exists public.basket_v2_lot_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.basket_v2_lots(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity_per_kit numeric(12,3) not null check (quantity_per_kit > 0),
  unit_cost_snapshot numeric(12,4),
  unit_price_snapshot numeric(12,4),
  position_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(lot_id, product_id)
);

create index if not exists basket_v2_items_category_idx on public.basket_v2_items(category_id, sort_order, public_name);
create index if not exists basket_v2_product_components_item_idx on public.basket_v2_product_components(item_id, position_order);
create index if not exists basket_v2_kit_components_parent_idx on public.basket_v2_kit_components(parent_item_id, position_order);
create index if not exists basket_v2_kit_components_component_idx on public.basket_v2_kit_components(component_item_id);
create index if not exists basket_v2_lots_fifo_idx on public.basket_v2_lots(item_id, status, mounted_at, created_at) where quantity_available > 0;
create index if not exists basket_v2_lot_items_lot_idx on public.basket_v2_lot_items(lot_id, position_order);

alter table public.basket_v2_items enable row level security;
alter table public.basket_v2_product_components enable row level security;
alter table public.basket_v2_kit_components enable row level security;
alter table public.basket_v2_lots enable row level security;
alter table public.basket_v2_lot_items enable row level security;

create or replace function public.basket_v2_touch_updated_at_v1()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists basket_v2_items_touch on public.basket_v2_items;
create trigger basket_v2_items_touch before update on public.basket_v2_items for each row execute function public.basket_v2_touch_updated_at_v1();
drop trigger if exists basket_v2_product_components_touch on public.basket_v2_product_components;
create trigger basket_v2_product_components_touch before update on public.basket_v2_product_components for each row execute function public.basket_v2_touch_updated_at_v1();
drop trigger if exists basket_v2_kit_components_touch on public.basket_v2_kit_components;
create trigger basket_v2_kit_components_touch before update on public.basket_v2_kit_components for each row execute function public.basket_v2_touch_updated_at_v1();
drop trigger if exists basket_v2_lots_touch on public.basket_v2_lots;
create trigger basket_v2_lots_touch before update on public.basket_v2_lots for each row execute function public.basket_v2_touch_updated_at_v1();

create or replace function public.basket_v2_validate_component_v1()
returns trigger language plpgsql as $$
declare
  v_parent_mode text;
  v_component_mode text;
  v_component_active boolean;
begin
  if new.parent_item_id = new.component_item_id then
    raise exception 'basket_v2_self_component';
  end if;
  select composition_mode into v_parent_mode from public.basket_v2_items where id = new.parent_item_id;
  if v_parent_mode is distinct from 'combined_kits' then
    raise exception 'basket_v2_parent_not_combined';
  end if;
  select composition_mode, is_active into v_component_mode, v_component_active
  from public.basket_v2_items where id = new.component_item_id;
  if v_component_mode is null then
    raise exception 'basket_v2_component_not_found';
  end if;
  if v_component_mode = 'combined_kits' then
    raise exception 'basket_v2_nested_combination_not_allowed';
  end if;
  if v_component_active is not true then
    raise exception 'basket_v2_component_inactive';
  end if;
  return new;
end $$;

drop trigger if exists basket_v2_kit_components_validate on public.basket_v2_kit_components;
create trigger basket_v2_kit_components_validate
before insert or update on public.basket_v2_kit_components
for each row execute function public.basket_v2_validate_component_v1();

create or replace view public.basket_v2_direct_availability_v1 as
select
  i.id as item_id,
  case when i.paused or not i.is_active then 0
       else coalesce(sum(case when l.status='mounted' then l.quantity_available else 0 end),0)::bigint end as availability
from public.basket_v2_items i
left join public.basket_v2_lots l on l.item_id=i.id
where i.composition_mode='products'
group by i.id,i.paused,i.is_active;

create or replace view public.basket_v2_item_availability_v1 as
with direct as (
  select item_id, availability from public.basket_v2_direct_availability_v1
), combined_calc as (
  select
    p.id as item_id,
    case
      when p.paused or not p.is_active then 0::bigint
      when count(k.id)=0 then 0::bigint
      else min(floor(coalesce(d.availability,0)::numeric / k.quantity))::bigint
    end as availability
  from public.basket_v2_items p
  left join public.basket_v2_kit_components k on k.parent_item_id=p.id
  left join direct d on d.item_id=k.component_item_id
  where p.composition_mode='combined_kits'
  group by p.id,p.paused,p.is_active
)
select * from direct
union all
select * from combined_calc;

create or replace view public.basket_v2_direct_financials_v1 as
select
  i.id as item_id,
  fifo.cost_total_snapshot as current_cost,
  fifo.retail_total_snapshot as retail_products_total,
  i.sale_price as sale_price
from public.basket_v2_items i
left join lateral (
  select l.cost_total_snapshot,l.retail_total_snapshot
  from public.basket_v2_lots l
  where l.item_id=i.id and l.status='mounted' and l.quantity_available>0
  order by l.mounted_at nulls last,l.created_at,l.id
  limit 1
) fifo on true
where i.composition_mode='products';

create or replace view public.basket_v2_item_financials_v1 as
with direct as (
  select item_id,current_cost,retail_products_total,sale_price from public.basket_v2_direct_financials_v1
), combined as (
  select
    p.id as item_id,
    case when count(k.id)>0 and count(*) filter (where d.current_cost is not null)=count(k.id)
         then sum(d.current_cost*k.quantity)::numeric(12,2) else null::numeric end as current_cost,
    case when count(k.id)>0 and count(*) filter (where d.retail_products_total is not null)=count(k.id)
         then sum(d.retail_products_total*k.quantity)::numeric(12,2) else null::numeric end as retail_products_total,
    p.sale_price
  from public.basket_v2_items p
  left join public.basket_v2_kit_components k on k.parent_item_id=p.id
  left join direct d on d.item_id=k.component_item_id
  where p.composition_mode='combined_kits'
  group by p.id,p.sale_price
)
select * from direct
union all
select * from combined;

create or replace function public.basket_v2_item_detail_admin_v1(p_item_id uuid)
returns jsonb
language sql
stable
set search_path=public
as $$
  select jsonb_build_object(
    'item', to_jsonb(i),
    'availability', coalesce(a.availability,0),
    'financial', jsonb_build_object(
      'current_cost', f.current_cost,
      'retail_products_total', f.retail_products_total,
      'sale_price', f.sale_price
    ),
    'product_components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pc.id,'product_id',pc.product_id,'quantity',pc.quantity,'position_order',pc.position_order,
        'product',jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,'image_url',p.image_url,'packaging',p.packaging,'cost',p.cost,'price',p.price)
      ) order by pc.position_order,pc.id)
      from public.basket_v2_product_components pc
      join public.products p on p.id=pc.product_id
      where pc.item_id=i.id
    ),'[]'::jsonb),
    'kit_components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',kc.id,'component_item_id',kc.component_item_id,'quantity',kc.quantity,'position_order',kc.position_order,
        'name',ci.public_name,'sale_price',ci.sale_price,'availability',coalesce(ca.availability,0),
        'current_cost',cf.current_cost,'retail_products_total',cf.retail_products_total
      ) order by kc.position_order,kc.id)
      from public.basket_v2_kit_components kc
      join public.basket_v2_items ci on ci.id=kc.component_item_id
      left join public.basket_v2_item_availability_v1 ca on ca.item_id=ci.id
      left join public.basket_v2_item_financials_v1 cf on cf.item_id=ci.id
      where kc.parent_item_id=i.id
    ),'[]'::jsonb),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,'code',l.code,'status',l.status,'quantity_built',l.quantity_built,'quantity_available',l.quantity_available,
        'cost_total_snapshot',l.cost_total_snapshot,'retail_total_snapshot',l.retail_total_snapshot,'mounted_at',l.mounted_at,
        'items',coalesce((select jsonb_agg(jsonb_build_object(
          'product_id',li.product_id,'quantity_per_kit',li.quantity_per_kit,'unit_cost_snapshot',li.unit_cost_snapshot,
          'unit_price_snapshot',li.unit_price_snapshot,'position_order',li.position_order,
          'product',jsonb_build_object('id',p2.id,'name',p2.name,'sku',p2.sku,'gtin',p2.gtin,'image_url',p2.image_url,'packaging',p2.packaging)
        ) order by li.position_order,li.id) from public.basket_v2_lot_items li join public.products p2 on p2.id=li.product_id where li.lot_id=l.id),'[]'::jsonb)
      ) order by l.created_at,l.id)
      from public.basket_v2_lots l where l.item_id=i.id
    ),'[]'::jsonb)
  )
  from public.basket_v2_items i
  left join public.basket_v2_item_availability_v1 a on a.item_id=i.id
  left join public.basket_v2_item_financials_v1 f on f.item_id=i.id
  where i.id=p_item_id;
$$;

revoke all on public.basket_v2_items from anon, authenticated;
revoke all on public.basket_v2_product_components from anon, authenticated;
revoke all on public.basket_v2_kit_components from anon, authenticated;
revoke all on public.basket_v2_lots from anon, authenticated;
revoke all on public.basket_v2_lot_items from anon, authenticated;
revoke all on function public.basket_v2_item_detail_admin_v1(uuid) from public, anon, authenticated;
grant select,insert,update,delete on public.basket_v2_items to service_role;
grant select,insert,update,delete on public.basket_v2_product_components to service_role;
grant select,insert,update,delete on public.basket_v2_kit_components to service_role;
grant select,insert,update,delete on public.basket_v2_lots to service_role;
grant select,insert,update,delete on public.basket_v2_lot_items to service_role;
grant select on public.basket_v2_direct_availability_v1, public.basket_v2_item_availability_v1, public.basket_v2_direct_financials_v1, public.basket_v2_item_financials_v1 to service_role;
grant execute on function public.basket_v2_item_detail_admin_v1(uuid) to service_role;
