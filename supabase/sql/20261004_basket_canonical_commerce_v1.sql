-- Dona Antônia · Cestas/Kits: disponibilidade e catálogo canônicos v1
-- Uma única regra pública para Admin, storefront e checkout.

insert into public.basket_categories(name,slug,sort_order,is_active)
values
  ('Cestas Completas','cestas-completas',10,true),
  ('Cestas Só Alimento','cestas-so-alimento',20,true),
  ('Kits Limpeza e Higiene','kits-limpeza-e-higiene',30,true),
  ('Kits Limpeza','kits-limpeza',40,true),
  ('Kits Higiene','kits-higiene',50,true)
on conflict(slug) do update set
  name=excluded.name,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

alter table public.basket_kit_templates add column if not exists category_id uuid;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='basket_kit_templates_category_id_fkey') then
    alter table public.basket_kit_templates
      add constraint basket_kit_templates_category_id_fkey
      foreign key(category_id) references public.basket_categories(id) on delete restrict;
  end if;
end$$;

update public.basket_templates b
set category_id=c.id,updated_at=now()
from public.basket_categories c
where b.category_id is null
  and c.slug=case when b.uses_hygiene_kit then 'cestas-completas' else 'cestas-so-alimento' end;

update public.basket_kit_templates k
set category_id=c.id,updated_at=now()
from public.basket_categories c
where k.basket_id is null
  and k.category_id is null
  and c.slug=case
    when lower(k.name) like '%limpeza%' and lower(k.name) like '%higiene%' then 'kits-limpeza-e-higiene'
    when lower(k.name) like '%limpeza%' then 'kits-limpeza'
    when lower(k.name) like '%higiene%' then 'kits-higiene'
    else 'kits-limpeza-e-higiene'
  end;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='basket_kit_templates_public_category_check') then
    alter table public.basket_kit_templates
      add constraint basket_kit_templates_public_category_check
      check (basket_id is not null or category_id is not null) not valid;
  end if;
end$$;
alter table public.basket_kit_templates validate constraint basket_kit_templates_public_category_check;

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

create or replace view public.basket_commercial_catalog_v1
with (security_invoker=true) as
with models as (
  select
    'basket'::text as source_kind,
    bt.id as commercial_id,
    bt.id as basket_id,
    null::uuid as standalone_kit_template_id,
    bt.name,
    bt.base_price as default_price,
    bt.image_url,
    bt.sort_order,
    bt.is_active,
    bt.category_id,
    c.name as category_name,
    c.slug as category_slug,
    c.sort_order as category_sort_order,
    c.is_active as category_active
  from public.basket_templates bt
  left join public.basket_categories c on c.id=bt.category_id
), candidates as (
  select
    m.commercial_id,
    a.*,
    row_number() over(partition by m.commercial_id order by a.built_at,a.created_at,a.lot_id) as rn
  from models m
  join public.basket_lot_public_availability_v1 a
    on a.basket_id=m.commercial_id
  where a.public_available>0 and a.availability_reason='available'
)
select
  m.source_kind,
  m.commercial_id,
  m.basket_id,
  m.standalone_kit_template_id,
  m.name as model_name,
  m.category_id,
  m.category_name,
  m.category_slug,
  m.category_sort_order,
  m.is_active as model_active,
  m.category_active,
  m.image_url,
  m.default_price,
  c.lot_id as public_lot_id,
  c.lot_kind as public_lot_kind,
  c.short_code as public_lot_code,
  c.lot_code as public_internal_lot_code,
  c.linked_lot_id,
  c.linked_available,
  coalesce(c.public_available,0)::integer as public_available,
  coalesce(
    c.availability_reason,
    case
      when not m.is_active then 'model_inactive'
      when not coalesce(m.category_active,false) then 'category_inactive'
      else 'depleted'
    end
  )::text as availability_reason,
  coalesce(nullif(c.public_name,''),m.name) as public_name,
  coalesce(c.sale_price_override,c.own_sale_price_override,m.default_price,0) as sale_price,
  c.public_lot_built_at
from models m
left join (
  select
    commercial_id,lot_id,lot_kind,short_code,lot_code,linked_lot_id,linked_available,public_available,
    availability_reason,public_name,sale_price_override,own_sale_price_override,built_at as public_lot_built_at
  from candidates
  where rn=1
) c on c.commercial_id=m.commercial_id;

create or replace view public.basket_current_lot_v1
with (security_invoker=true) as
select distinct on (a.basket_id)
  a.basket_id,
  a.lot_id,
  a.lot_code,
  a.quantity_built,
  a.public_available as quantity_available,
  l.composition_hash,
  a.built_at,
  l.built_by,
  l.source,
  l.metadata,
  a.sale_price_override,
  a.short_code,
  l.component_sum_snapshot,
  l.hidden_adjustment_snapshot,
  a.public_name
from public.basket_lot_public_availability_v1 a
join public.basket_stock_lots l on l.id=a.lot_id
where a.basket_id is not null
  and a.lot_kind='legacy_full'
  and a.public_available>0
order by a.basket_id,a.built_at,a.created_at,a.lot_id;

create or replace view public.basket_current_kit_lot_v2
with (security_invoker=true) as
select distinct on (a.kit_template_id)
  a.kit_template_id,
  a.lot_id,
  a.basket_id,
  a.lot_kind,
  a.short_code,
  a.lot_code,
  a.quantity_built,
  a.public_available as quantity_available,
  l.composition_hash,
  a.built_at,
  l.built_by,
  l.duplicated_from_lot_id,
  l.source,
  l.metadata,
  a.sale_price_override,
  l.component_sum_snapshot,
  l.hidden_adjustment_snapshot,
  a.public_name,
  l.linked_hygiene_lot_id,
  a.business_type,
  a.linked_lot_id,
  l.own_sale_price_override,
  l.own_component_sum_snapshot,
  l.own_hidden_adjustment_snapshot,
  l.own_cost_sum_snapshot,
  l.cost_sum_snapshot
from public.basket_lot_public_availability_v1 a
join public.basket_stock_lots l on l.id=a.lot_id
where a.kit_template_id is not null
  and a.public_available>0
order by a.kit_template_id,a.built_at,a.created_at,a.lot_id;

revoke all on public.basket_lot_public_availability_v1 from public,anon,authenticated;
revoke all on public.basket_commercial_catalog_v1 from public,anon,authenticated;
grant select on public.basket_lot_public_availability_v1 to service_role;
grant select on public.basket_commercial_catalog_v1 to service_role;
