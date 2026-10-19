-- Shared full baskets: include all item types from all five sizes; never modify quantities or hidden surcharges.
-- Lowest in-stock effective unit price is displayed first in the public full-basket compositions.
begin;

with missing as (
 select pos.label,min(pos.sort_order) ord
 from public.basket_mold_positions pos
 join public.basket_molds mold on mold.id=pos.mold_id
 join public.basket_templates b on b.id=mold.basket_id
 join public.basket_categories cat on cat.id=b.category_id and cat.slug='cestas-completas'
 left join public.basket_mold_shared_items item on item.scope='cestas-completas' and item.label=pos.label
 where item.id is null group by pos.label
), offset_value as (
 select coalesce(max(sort_order)+1,0) val from public.basket_mold_shared_items where scope='cestas-completas'
)
insert into public.basket_mold_shared_items(scope,label,sort_order)
select 'cestas-completas',missing.label,
 (select val from offset_value) + row_number() over(order by missing.ord,missing.label)-1
from missing on conflict(scope,label) do nothing;

with candidates as (
 select pos.label,op.product_id,
 min(case when p.is_offer=true and p.offer_price>0 then p.offer_price
          when p.price>0 then p.price else 9999999 end) unit_price
 from public.basket_mold_positions pos
 join public.basket_molds mold on mold.id=pos.mold_id
 join public.basket_templates b on b.id=mold.basket_id
 join public.basket_categories cat on cat.id=b.category_id and cat.slug='cestas-completas'
 join public.basket_mold_position_options op on op.position_id=pos.id
 join public.products p on p.id=op.product_id and p.is_active=true
 group by pos.label,op.product_id
), ranked as (
 select item.id shared_item_id,c.product_id,
 row_number() over(partition by item.id order by c.unit_price,c.product_id)-1 ord
 from public.basket_mold_shared_items item join candidates c on c.label=item.label
 where item.scope='cestas-completas' and not exists (
   select 1 from public.basket_mold_shared_item_options existing where existing.shared_item_id=item.id)
)
insert into public.basket_mold_shared_item_options(shared_item_id,product_id,sort_order)
select shared_item_id,product_id,ord from ranked where ord<3
on conflict(shared_item_id,product_id) do nothing;

-- Atomic protection: never remove existing options when the shared mapping is incomplete.
do $guard$
begin
 if exists (
   select 1 from public.basket_mold_positions pos
   join public.basket_molds mold on mold.id=pos.mold_id
   join public.basket_templates b on b.id=mold.basket_id
   join public.basket_categories cat on cat.id=b.category_id and cat.slug='cestas-completas'
   where not exists (
     select 1 from public.basket_mold_shared_items item
     join public.basket_mold_shared_item_options opt on opt.shared_item_id=item.id
     where item.scope='cestas-completas' and item.label=pos.label
   )
 ) then raise exception 'basket_shared_registry_incomplete'; end if;
end $guard$;

delete from public.basket_mold_position_options opt
using public.basket_mold_positions pos, public.basket_molds mold,
      public.basket_templates b,public.basket_categories cat
where opt.position_id=pos.id and pos.mold_id=mold.id and mold.basket_id=b.id
  and b.category_id=cat.id and cat.slug='cestas-completas';

insert into public.basket_mold_position_options(position_id,product_id,sort_order,metadata)
select pos.id,opt.product_id,opt.sort_order,opt.metadata
from public.basket_mold_positions pos
join public.basket_molds mold on mold.id=pos.mold_id
join public.basket_templates b on b.id=mold.basket_id
join public.basket_categories cat on cat.id=b.category_id and cat.slug='cestas-completas'
join public.basket_mold_shared_items item on item.scope='cestas-completas' and item.label=pos.label
join public.basket_mold_shared_item_options opt on opt.shared_item_id=item.id
on conflict(position_id,product_id) do nothing;

-- Dona Antônia · Cestas Molde · múltiplos preferenciais por posição, com fallback seguro em estoque
-- Reaplica o RPC batch (mesma assinatura) mantendo o contrato de saída e as permissões.
-- A view de estoque avulso já desconta componentes em montagem, lotes prontos e alocações.
-- Calcula vários moldes de uma vez e desconta também as reservas ativas de pedidos.
begin;

create or replace function public.basket_mold_public_compositions_batch_v1(p_basket_ids uuid[])
returns jsonb
language sql stable security definer set search_path = ''
as $function$
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
), eligible as (
  select pos.id as position_id, pos.mold_id, m.basket_id, pos.label, pos.quantity,
         pos.sort_order as position_order, opt.product_id, opt.sort_order as option_order,
         (coalesce(opt.metadata, '{}'::jsonb) @> '{"preferred":true}'::jsonb) as is_preferred,
         p.name as product_name, p.sku, p.gtin, p.image_url, m.is_complete,
         case when p.is_offer=true and p.offer_price>0 then p.offer_price
              when p.price>0 then p.price else 9999999 end as unit_price,
         greatest(0, coalesce(s.loose_sellable_stock, 0)
           - coalesce(orr.reserved, 0))::numeric as available_stock
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.products p on p.id = opt.product_id and p.is_active = true
  join public.ops2_loose_sellable_stock_v1 s on s.product_id = p.id and s.is_active = true
  left join active_order_reservations orr on orr.product_id = p.id
  where greatest(0, coalesce(s.loose_sellable_stock, 0)
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
