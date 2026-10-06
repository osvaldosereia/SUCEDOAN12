-- Dona Antônia · Cestas Molde · Rodada 4/6 + alinhamento R5
-- Balanceamento determinístico: cobertura = estoque avulso vendável líquido / consumo por cesta.
-- A view ops2_loose_sellable_stock_v1 já exclui unidades travadas em montagem, lotes prontos e alocações.
-- Descontamos apenas reservas de pedidos ainda ativas. Somente leitura: exibição nunca cria reserva.

begin;

create or replace function public.basket_mold_public_compositions_v2(p_basket_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with mold as (
  select m.id,m.basket_id,m.hidden_adjustment,m.public_composition_count,b.name,b.image_url
  from public.basket_molds m
  join public.basket_templates b on b.id=m.basket_id
  where m.basket_id=p_basket_id
),
active_order_reservations as (
  select r.product_id,coalesce(sum(r.quantity),0)::numeric reserved
  from public.vitrine_stock_reservations r
  where r.status in ('reserved','allocated') and (r.expires_at is null or r.expires_at>now())
  group by r.product_id
),
eligible as (
  select pos.id position_id,pos.label,pos.quantity,pos.sort_order position_order,
         opt.product_id,opt.sort_order option_order,p.name product_name,p.sku,p.gtin,p.image_url,
         greatest(0,coalesce(s.loose_sellable_stock,0)-coalesce(orr.reserved,0))::numeric available_stock
  from mold m
  join public.basket_mold_positions pos on pos.mold_id=m.id
  join public.basket_mold_position_options opt on opt.position_id=pos.id
  join public.products p on p.id=opt.product_id and p.is_active=true
  join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id and s.is_active=true
  left join active_order_reservations orr on orr.product_id=p.id
  where greatest(0,coalesce(s.loose_sellable_stock,0)-coalesce(orr.reserved,0)) >= pos.quantity
),
scored as (
  select e.*,
         floor(e.available_stock / nullif(e.quantity,0))::bigint coverage_baskets
  from eligible e
),
ranked as (
  select s.*,
         row_number() over(partition by s.position_id order by s.coverage_baskets desc,s.available_stock desc,s.option_order,s.product_id) option_rank,
         count(*) over(partition by s.position_id) option_count
  from scored s
  where s.coverage_baskets >= 1
),
slots as (
  select gs composition_number
  from mold m cross join lateral generate_series(1,m.public_composition_count) gs
),
chosen as (
  select sl.composition_number,r.*,
         (r.coverage_baskets::numeric / greatest(1,ceil(sl.composition_number::numeric / r.option_count)))::numeric selection_score
  from slots sl
  join ranked r
    on r.option_rank = case
      when sl.composition_number <= r.option_count then sl.composition_number
      else 1
    end
),
compositions as (
  select c.composition_number,
         jsonb_agg(jsonb_build_object(
           'position_id',c.position_id,'label',c.label,'quantity',c.quantity,
           'product_id',c.product_id,'name',c.product_name,'sku',c.sku,'gtin',c.gtin,
           'image_url',c.image_url,'available_stock',c.available_stock,
           'coverage_baskets',c.coverage_baskets,'option_rank',c.option_rank,
           'selection_score',c.selection_score,
           'selection_reason',case when c.composition_number <= c.option_count then 'distinct_by_coverage' else 'highest_coverage_repeat' end
         ) order by c.position_order,c.position_id) items
  from chosen c group by c.composition_number
)
select coalesce((
  select jsonb_build_object(
    'basket_id',m.basket_id,'name',m.name,'image_url',m.image_url,
    'hidden_adjustment',m.hidden_adjustment,'public_composition_count',m.public_composition_count,
    'balancing','loose_sellable_coverage_v3',
    'compositions',coalesce((select jsonb_agg(jsonb_build_object('number',c.composition_number,'items',c.items) order by c.composition_number) from compositions c),'[]'::jsonb)
  ) from mold m
),jsonb_build_object('basket_id',p_basket_id,'error','basket_mold_not_found'));
$function$;

-- Keep the R3 public contract stable for callers while upgrading its engine.
create or replace function public.basket_mold_public_compositions_v1(p_basket_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select public.basket_mold_public_compositions_v2(p_basket_id);
$function$;

revoke all on function public.basket_mold_public_compositions_v2(uuid) from public, anon, authenticated;
grant execute on function public.basket_mold_public_compositions_v2(uuid) to service_role;
revoke all on function public.basket_mold_public_compositions_v1(uuid) from public, anon, authenticated;
grant execute on function public.basket_mold_public_compositions_v1(uuid) to service_role;

commit;
