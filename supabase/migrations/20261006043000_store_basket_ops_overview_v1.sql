-- Dona Antônia · Cestas do Site: visão operacional de estoque v1
-- Somente leitura: consolida estoque público, montagens em curso e capacidade do estoque avulso.
begin;

create or replace function public.store_basket_ops_overview_v1()
returns table(
  basket_id uuid,
  public_available integer,
  assembling_units integer,
  max_buildable_now integer,
  sellable_lots integer,
  existing_available_units integer,
  new_flow_available_units integer,
  existing_sellable_lots integer,
  new_flow_sellable_lots integer,
  assembling_lots integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with composition as (
    select
      r.basket_id,
      i.product_id,
      sum(i.quantity*r.quantity)::numeric as quantity_per_basket,
      bool_and(coalesce(k.is_active,false) and coalesce(p.is_active,false)) as components_active
    from public.store_basket_recipe_kits r
    join public.assembly_kits k on k.id=r.kit_id
    join public.assembly_kit_items i on i.kit_id=k.id
    left join public.products p on p.id=i.product_id
    group by r.basket_id,i.product_id
  ),
  buildable as (
    select
      b.id as basket_id,
      case
        when not b.is_active then 0
        when count(c.product_id)=0 then 0
        when bool_and(coalesce(c.components_active,false)) is not true then 0
        else greatest(
          0,
          coalesce(
            min(floor(coalesce(s.loose_sellable_stock,0)::numeric/nullif(c.quantity_per_basket,0))),
            0
          )::integer
        )
      end as max_buildable_now
    from public.basket_templates b
    left join composition c on c.basket_id=b.id
    left join public.ops2_loose_sellable_stock_v1 s on s.product_id=c.product_id
    group by b.id,b.is_active
  ),
  lot_availability as (
    select
      l.basket_id,
      coalesce(sum(coalesce(v.public_available,0)),0)::integer as public_available,
      (count(*) filter (where coalesce(v.public_available,0)>0))::integer as sellable_lots,
      coalesce(sum(coalesce(v.public_available,0)) filter (
        where coalesce(l.metadata->>'store_basket_reserved_v1','false')<>'true'
      ),0)::integer as existing_available_units,
      coalesce(sum(coalesce(v.public_available,0)) filter (
        where coalesce(l.metadata->>'store_basket_reserved_v1','false')='true'
      ),0)::integer as new_flow_available_units,
      (count(*) filter (
        where coalesce(v.public_available,0)>0
          and coalesce(l.metadata->>'store_basket_reserved_v1','false')<>'true'
      ))::integer as existing_sellable_lots,
      (count(*) filter (
        where coalesce(v.public_available,0)>0
          and coalesce(l.metadata->>'store_basket_reserved_v1','false')='true'
      ))::integer as new_flow_sellable_lots
    from public.basket_stock_lots l
    left join public.basket_lot_public_availability_v1 v on v.lot_id=l.id
    group by l.basket_id
  ),
  assembling as (
    select
      l.basket_id,
      coalesce(sum(l.quantity_built),0)::integer as assembling_units,
      count(*)::integer as assembling_lots
    from public.basket_stock_lots l
    where coalesce(l.metadata->>'store_basket_reserved_v1','false')='true'
      and l.status='draft'
      and l.assembly_status='assembling'
    group by l.basket_id
  )
  select
    b.id,
    coalesce(a.public_available,0),
    coalesce(m.assembling_units,0),
    coalesce(c.max_buildable_now,0),
    coalesce(a.sellable_lots,0),
    coalesce(a.existing_available_units,0),
    coalesce(a.new_flow_available_units,0),
    coalesce(a.existing_sellable_lots,0),
    coalesce(a.new_flow_sellable_lots,0),
    coalesce(m.assembling_lots,0)
  from public.basket_templates b
  left join buildable c on c.basket_id=b.id
  left join lot_availability a on a.basket_id=b.id
  left join assembling m on m.basket_id=b.id
  where exists(select 1 from public.store_basket_recipe_kits r where r.basket_id=b.id);
$function$;

-- O list administrativo continua usando o mesmo RPC; apenas recebe `operations` em cada cesta.
create or replace function public.store_basket_recipe_catalog_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'baskets',coalesce(jsonb_agg(row_data order by sort_order,name),'[]'::jsonb)
  )
  from (
    select
      b.sort_order,
      b.name,
      jsonb_build_object(
        'id',b.id,
        'name',b.name,
        'image_url',b.image_url,
        'sale_price',b.base_price,
        'hidden_adjustment',b.hidden_adjustment,
        'is_active',b.is_active,
        'sort_order',b.sort_order,
        'category_id',b.category_id,
        'category_name',c.name,
        'category_slug',c.slug,
        'kit_count',coalesce(recipe.kit_count,0),
        'kits',coalesce(recipe.kits,'[]'::jsonb),
        'cost_total',coalesce(fin.cost_total,0),
        'product_sale_total',coalesce(fin.sale_total,0),
        'calculated_hidden_adjustment',b.base_price-coalesce(fin.sale_total,0),
        'operations',jsonb_build_object(
          'public_available',coalesce(ops.public_available,0),
          'assembling_units',coalesce(ops.assembling_units,0),
          'max_buildable_now',coalesce(ops.max_buildable_now,0),
          'sellable_lots',coalesce(ops.sellable_lots,0),
          'existing_available_units',coalesce(ops.existing_available_units,0),
          'new_flow_available_units',coalesce(ops.new_flow_available_units,0),
          'existing_sellable_lots',coalesce(ops.existing_sellable_lots,0),
          'new_flow_sellable_lots',coalesce(ops.new_flow_sellable_lots,0),
          'assembling_lots',coalesce(ops.assembling_lots,0)
        )
      ) as row_data
    from public.basket_templates b
    left join public.basket_categories c on c.id=b.category_id
    left join lateral (
      select
        count(*)::integer as kit_count,
        jsonb_agg(jsonb_build_object(
          'kit_id',r.kit_id,
          'name',k.name,
          'type',k.type,
          'quantity',r.quantity,
          'is_required',r.is_required,
          'sort_order',r.sort_order
        ) order by r.sort_order,r.id) as kits
      from public.store_basket_recipe_kits r
      join public.assembly_kits k on k.id=r.kit_id
      where r.basket_id=b.id
    ) recipe on true
    left join lateral (
      select
        coalesce(sum(coalesce(p.cost,0)*i.quantity*r.quantity),0)::numeric as cost_total,
        coalesce(sum(coalesce(p.price,0)*i.quantity*r.quantity),0)::numeric as sale_total
      from public.store_basket_recipe_kits r
      join public.assembly_kit_items i on i.kit_id=r.kit_id
      join public.products p on p.id=i.product_id
      where r.basket_id=b.id
    ) fin on true
    left join public.store_basket_ops_overview_v1() ops on ops.basket_id=b.id
    where exists(select 1 from public.store_basket_recipe_kits r where r.basket_id=b.id)
  ) q;
$function$;

revoke all on function public.store_basket_ops_overview_v1() from public,anon,authenticated;
grant execute on function public.store_basket_ops_overview_v1() to service_role;

revoke all on function public.store_basket_recipe_catalog_v1() from public,anon,authenticated;
grant execute on function public.store_basket_recipe_catalog_v1() to service_role;

commit;
