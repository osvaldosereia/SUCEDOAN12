-- Replace the per-product stock-function call in public basket composition reads
-- with one set-based read while preserving the same inventory authority rules.
begin;

CREATE OR REPLACE FUNCTION public.basket_mold_public_compositions_batch_v1(p_basket_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with requested as (
  select distinct unnest(coalesce(p_basket_ids, '{}'::uuid[])) as basket_id
), mold as (
  select m.id, m.basket_id, m.hidden_adjustment, m.public_composition_count, b.name, b.image_url,
         (cat.slug='cestas-completas') as is_complete
  from public.basket_molds m
  join public.basket_templates b on b.id = m.basket_id
  join public.basket_categories cat on cat.id=b.category_id
  join requested r on r.basket_id = m.basket_id
), active_order_reservations as (
  select r.product_id, coalesce(sum(r.quantity), 0)::numeric as reserved
  from public.vitrine_stock_reservations r
  where r.status in ('reserved', 'allocated')
    and (r.expires_at is null or r.expires_at > now())
  group by r.product_id
), stock_candidates as (
  select distinct opt.product_id
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.ops2_loose_sellable_stock_v1 s on s.product_id = opt.product_id
), fresh_stock as materialized (
  select sc.product_id,
         greatest(0, case
           when s.stock_authority='bling' then
             case
               when s.is_active=true and s.bling_stock_ready=true
                 then coalesce(s.loose_sellable_stock,0)
               when s.is_active=false
                 and s.link_status='matched'
                 and s.bling_product_id is not null
                 and s.selected_deposit_id is not null
                 and s.sellable_virtual is not null
                 and s.mirror_observed_at > now()-interval '48 hours'
                 and s.mirror_observed_at <= now()+interval '5 minutes'
                 then coalesce(s.sellable_virtual,0)-coalesce(s.basket_locked_quantity,0)
               else 0
             end
           when s.ean_sellable_stock is not null then s.ean_sellable_stock
           when s.is_active=true then coalesce(s.loose_sellable_stock,0)
           else 0
         end)::numeric as sellable_stock
  from stock_candidates sc
  join public.storefront_ean_sellable_stock_v1 s on s.product_id = sc.product_id
  where
    (s.stock_authority='bling' and (
      (s.is_active=true and s.bling_stock_ready=true)
      or (s.is_active=false
        and s.link_status='matched'
        and s.bling_product_id is not null
        and s.selected_deposit_id is not null
        and s.sellable_virtual is not null
        and s.mirror_observed_at > now()-interval '48 hours'
        and s.mirror_observed_at <= now()+interval '5 minutes')
    ))
    or (s.stock_authority is distinct from 'bling' and s.ean_sellable_stock is not null)
    or (s.is_active=true and s.stock_authority is distinct from 'bling')
), eligible as (
  select pos.id as position_id, pos.mold_id, m.basket_id, pos.label, pos.quantity,
         pos.sort_order as position_order, opt.product_id, opt.sort_order as option_order,
         (coalesce(opt.metadata, '{}'::jsonb) @> '{"preferred":true}'::jsonb) as is_preferred,
         p.name as product_name, p.sku, p.gtin, p.image_url, m.is_complete,
         case when p.is_offer=true and p.offer_price>0 then p.offer_price
              when p.price>0 then p.price else 9999999 end as unit_price,
         greatest(0, fs.sellable_stock
           - coalesce(orr.reserved, 0))::numeric as available_stock
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.products p on p.id = opt.product_id
  join fresh_stock fs on fs.product_id = p.id
  left join active_order_reservations orr on orr.product_id = p.id
  where greatest(0, fs.sellable_stock
      - coalesce(orr.reserved, 0)) >= pos.quantity
), scored as (
  select e.*, floor(e.available_stock / nullif(e.quantity, 0))::bigint as coverage_baskets
  from eligible e
), ranked as (
  select s.*,
         row_number() over (partition by s.position_id order by
           case when s.is_complete then s.unit_price end asc nulls last,
           case when not s.is_complete and s.is_preferred then 0 else 1 end,
           case when not s.is_complete then s.coverage_baskets end desc nulls last,
           case when not s.is_complete then s.available_stock end desc nulls last,
           s.option_order, s.product_id) as option_rank,
         bool_or(s.is_preferred) over (partition by s.position_id) as has_preferred,
         count(*) filter (where s.is_preferred) over (partition by s.position_id) as preferred_count,
         count(*) over (partition by s.position_id) as option_count
  from scored s
  where s.coverage_baskets >= 1
), slots as (
  select m.basket_id, gs as composition_number
  from mold m cross join lateral generate_series(1, m.public_composition_count) gs
), chosen as (
  select sl.composition_number, r.*,
         (r.coverage_baskets::numeric / greatest(1, ceil(sl.composition_number::numeric / r.option_count)))::numeric as selection_score
  from slots sl
  join ranked r on r.basket_id = sl.basket_id
    and r.option_rank = case
      when r.is_complete then case when sl.composition_number <= r.option_count then sl.composition_number else 1 end
      when r.preferred_count > 0 then ((sl.composition_number - 1) % r.preferred_count) + 1
      when sl.composition_number <= r.option_count then sl.composition_number
      else 1 end
), compositions as (
  select c.basket_id, c.composition_number,
         jsonb_agg(jsonb_build_object(
           'position_id', c.position_id, 'label', c.label, 'quantity', c.quantity,
           'product_id', c.product_id, 'name', c.product_name, 'sku', c.sku,
           'gtin', c.gtin, 'image_url', c.image_url, 'available_stock', c.available_stock,
           'coverage_baskets', c.coverage_baskets, 'option_rank', c.option_rank,
           'selection_score', c.selection_score,
           'selection_reason', case
             when c.is_complete and c.option_rank=1 then 'lowest_price_in_stock'
             when c.is_complete then 'price_ascending_alternative'
             when c.is_preferred then 'preferred_in_stock'
             when c.composition_number <= c.option_count then 'distinct_by_coverage'
             else 'highest_coverage_repeat' end
         ) order by c.position_order, c.position_id) as items
  from chosen c
  group by c.basket_id, c.composition_number
)
select coalesce(jsonb_agg(jsonb_build_object(
  'basket_id', m.basket_id, 'name', m.name, 'image_url', m.image_url,
  'hidden_adjustment', m.hidden_adjustment,
  'public_composition_count', m.public_composition_count,
  'balancing', 'loose_sellable_coverage_v3',
  'compositions', coalesce((
    select jsonb_agg(jsonb_build_object('number', c.composition_number, 'items', c.items)
      order by c.composition_number)
    from compositions c where c.basket_id = m.basket_id
  ), '[]'::jsonb)
) order by m.basket_id), '[]'::jsonb)
from mold m;
$function$
;

revoke all on function public.basket_mold_public_compositions_batch_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.basket_mold_public_compositions_batch_v1(uuid[]) to service_role;
commit;
