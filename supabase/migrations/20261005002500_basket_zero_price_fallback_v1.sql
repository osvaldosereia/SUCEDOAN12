-- Dona Antônia · hotfix de preço para lotes legacy_full.
-- Nos lotes históricos, override = 0 significa "sem override"; preservamos os dados
-- e corrigimos somente a leitura canônica para cair no preço comercial do modelo.

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
  coalesce(
    nullif(c.sale_price_override,0),
    nullif(c.own_sale_price_override,0),
    m.default_price,
    0
  ) as sale_price,
  c.public_lot_built_at
from models m
left join (
  select
    commercial_id,lot_id,lot_kind,short_code,lot_code,linked_lot_id,linked_available,public_available,
    availability_reason,public_name,sale_price_override,own_sale_price_override,built_at as public_lot_built_at
  from candidates
  where rn=1
) c on c.commercial_id=m.commercial_id;

revoke all on public.basket_commercial_catalog_v1 from public,anon,authenticated;
grant select on public.basket_commercial_catalog_v1 to service_role;
