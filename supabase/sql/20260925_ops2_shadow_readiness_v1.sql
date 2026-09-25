-- Dona Antonia Operations 2.0
-- Shadow readiness for early-order Bling migration.
-- Read-only projection. No external writes.

create or replace function public.get_ops2_order_shadow_readiness_v1()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with cfg as (
  select coalesce(live_orders_since,'2026-09-24T03:19:06.631396Z'::timestamptz) as live_since
  from public.vitrine_operational_cutover_config
  where id=1
),
open_orders as (
  select o.*
  from public.orders o, cfg
  where o.created_at >= cfg.live_since
    and o.status in ('storefront_received','confirmed')
),
product_stats as (
  select
    oi.order_id,
    count(distinct oi.product_id) filter (where oi.product_id is not null) as product_count,
    count(distinct oi.product_id) filter (
      where oi.product_id is not null
        and not exists (
          select 1
          from public.bling_hub_entity_links_v2 l
          where l.source_system='vitrine_qx'
            and l.entity_type='product'
            and l.source_id=oi.product_id::text
            and l.status='matched'
            and l.bling_id is not null
        )
    ) as unresolved_products
  from public.order_items oi
  join open_orders o on o.id=oi.order_id
  group by oi.order_id
),
detail as (
  select
    o.id,
    o.order_number,
    o.status,
    o.created_at,
    o.source,
    coalesce(ps.product_count,0) as product_count,
    coalesce(ps.unresolved_products,0) as unresolved_products,
    case
      when o.customer_id is null then true
      when exists (
        select 1
        from public.bling_hub_entity_links_v2 l
        where l.source_system='canonical_ssbes'
          and l.entity_type='customer'
          and l.source_id=o.customer_id::text
          and l.status='matched'
          and l.bling_id is not null
      ) then false
      else true
    end as unresolved_customer,
    (
      coalesce(trim(o.delivery_address->>'street'),'')='' or
      coalesce(trim(o.delivery_address->>'number'),'')='' or
      coalesce(trim(o.delivery_address->>'city'),'')='' or
      coalesce(trim(o.delivery_address->>'state'),'')=''
    ) as incomplete_address,
    coalesce(trim(o.payment_method),'')='' as missing_payment
  from open_orders o
  left join product_stats ps on ps.order_id=o.id
),
classified as (
  select *,
    (
      product_count > 0
      and unresolved_products=0
      and unresolved_customer=false
      and incomplete_address=false
      and missing_payment=false
    ) as erp_ready
  from detail
)
select jsonb_build_object(
  'generated_at',now(),
  'total',count(*),
  'erp_ready',count(*) filter (where erp_ready),
  'blocked',count(*) filter (where not erp_ready),
  'unresolved_customer',count(*) filter (where unresolved_customer),
  'unresolved_products',count(*) filter (where unresolved_products>0),
  'incomplete_address',count(*) filter (where incomplete_address),
  'missing_payment',count(*) filter (where missing_payment),
  'orders',coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',id,
        'order_number',order_number,
        'status',status,
        'source',source,
        'created_at',created_at,
        'product_count',product_count,
        'unresolved_products',unresolved_products,
        'unresolved_customer',unresolved_customer,
        'incomplete_address',incomplete_address,
        'missing_payment',missing_payment,
        'erp_ready',erp_ready
      )
      order by erp_ready desc, created_at desc
    ),
    '[]'::jsonb
  )
)
from classified;
$$;

revoke all on function public.get_ops2_order_shadow_readiness_v1() from public, anon, authenticated;
grant execute on function public.get_ops2_order_shadow_readiness_v1() to service_role;
