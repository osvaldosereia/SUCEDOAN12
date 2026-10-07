-- Dona Antônia · Cestas Molde · composições públicas em lote v1
-- Calcula as opções de vários moldes com uma única leitura das reservas ativas.
begin;

create or replace function public.basket_mold_public_compositions_batch_v1(p_basket_ids uuid[])
returns jsonb
language sql stable security definer set search_path = ''
as $function$
with requested as (
  select distinct unnest(coalesce(p_basket_ids, '{}'::uuid[])) as basket_id
), mold as (
  select m.id, m.basket_id, m.hidden_adjustment, m.public_composition_count, b.name, b.image_url
  from public.basket_molds m
  join public.basket_templates b on b.id = m.basket_id
  join requested r on r.basket_id = m.basket_id
), active_order_reservations as (
  select r.product_id, coalesce(sum(r.quantity), 0)::numeric as reserved
  from public.vitrine_stock_reservations r
  where r.status in ('reserved', 'allocated')
    and (r.expires_at is null or r.expires_at > now())
  group by r.product_id
), active_lot_reservations as (
  select r.product_id, coalesce(sum(r.quantity_reserved), 0)::numeric as reserved
  from public.basket_lot_component_reservations r
  where r.status in ('reserved', 'active')
  group by r.product_id
), eligible as (
  select pos.id as position_id, pos.mold_id, m.basket_id, pos.label, pos.quantity,
         pos.sort_order as position_order, opt.product_id, opt.sort_order as option_order,
         p.name as product_name, p.sku, p.gtin, p.image_url,
         greatest(0, coalesce(s.effective_sellable_stock, 0)
           - coalesce(orr.reserved, 0) - coalesce(lrr.reserved, 0))::numeric as available_stock
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.products p on p.id = opt.product_id and p.is_active = true
  join public.ops2_sellable_stock_v1 s on s.product_id = p.id and s.is_active = true
  left join active_order_reservations orr on orr.product_id = p.id
  left join active_lot_reservations lrr on lrr.product_id = p.id
  where greatest(0, coalesce(s.effective_sellable_stock, 0)
      - coalesce(orr.reserved, 0) - coalesce(lrr.reserved, 0)) >= pos.quantity
), scored as (
  select e.*, floor(e.available_stock / nullif(e.quantity, 0))::bigint as coverage_baskets
  from eligible e
), ranked as (
  select s.*,
         row_number() over (partition by s.position_id order by s.coverage_baskets desc,
           s.available_stock desc, s.option_order, s.product_id) as option_rank,
         count(*) over (partition by s.position_id) as option_count
  from scored s
  where s.coverage_baskets >= 1
), slots as (
  select m.basket_id, gs as composition_number
  from mold m cross join lateral generate_series(1, m.public_composition_count) gs
), chosen as (
  select sl.basket_id, sl.composition_number, r.*,
         (r.coverage_baskets::numeric / greatest(1, ceil(sl.composition_number::numeric / r.option_count)))::numeric as selection_score
  from slots sl
  join ranked r on r.basket_id = sl.basket_id
    and r.option_rank = case when sl.composition_number <= r.option_count then sl.composition_number else 1 end
), compositions as (
  select c.basket_id, c.composition_number,
         jsonb_agg(jsonb_build_object(
           'position_id', c.position_id, 'label', c.label, 'quantity', c.quantity,
           'product_id', c.product_id, 'name', c.product_name, 'sku', c.sku,
           'gtin', c.gtin, 'image_url', c.image_url, 'available_stock', c.available_stock,
           'coverage_baskets', c.coverage_baskets, 'option_rank', c.option_rank,
           'selection_score', c.selection_score,
           'selection_reason', case when c.composition_number <= c.option_count
             then 'distinct_by_coverage' else 'highest_coverage_repeat' end
         ) order by c.position_order, c.position_id) as items
  from chosen c
  group by c.basket_id, c.composition_number
)
select coalesce(jsonb_agg(jsonb_build_object(
  'basket_id', m.basket_id, 'name', m.name, 'image_url', m.image_url,
  'hidden_adjustment', m.hidden_adjustment,
  'public_composition_count', m.public_composition_count,
  'balancing', 'sellable_coverage_v2',
  'compositions', coalesce((
    select jsonb_agg(jsonb_build_object('number', c.composition_number, 'items', c.items)
      order by c.composition_number)
    from compositions c where c.basket_id = m.basket_id
  ), '[]'::jsonb)
) order by m.basket_id), '[]'::jsonb)
from mold m;
$function$;

create or replace function public.basket_mold_public_compositions_v2(p_basket_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select result.item from jsonb_array_elements(
      public.basket_mold_public_compositions_batch_v1(array[p_basket_id])
    ) as result(item) where result.item->>'basket_id' = p_basket_id::text),
    jsonb_build_object('basket_id', p_basket_id, 'error', 'basket_mold_not_found')
  );
$function$;

revoke all on function public.basket_mold_public_compositions_batch_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.basket_mold_public_compositions_batch_v1(uuid[]) to service_role;
revoke all on function public.basket_mold_public_compositions_v2(uuid) from public, anon, authenticated;
grant execute on function public.basket_mold_public_compositions_v2(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
