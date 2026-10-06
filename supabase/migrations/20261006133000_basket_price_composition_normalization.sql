-- Dona Antônia · Cestas Molde · normalização de preço e composição
-- Regra comercial: preço = produtos efetivos da composição + ajuste fixo do molde.
-- Esta migration NÃO altera quantidade/status/reserva de nenhum lote físico.

begin;

create or replace function public.basket_transition_commercial_price_v1(
  p_basket_id uuid,
  p_lot_id uuid
) returns numeric
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_source_mold public.basket_molds%rowtype;
  v_target_mold public.basket_molds%rowtype;
  v_product_total numeric;
begin
  if p_basket_id is null or p_lot_id is null then return null; end if;

  select * into v_lot
  from public.basket_stock_lots l
  where l.id=p_lot_id and l.basket_id=p_basket_id;
  if not found then return null; end if;

  select m.* into v_source_mold
  from public.basket_molds m
  where m.basket_id=p_basket_id
     or coalesce(m.metadata->'legacy_source_basket_ids','[]'::jsonb) @> jsonb_build_array(p_basket_id::text)
  order by
    case when m.basket_id=p_basket_id then 0 else 1 end,
    case when coalesce(m.metadata->>'mold_kind','') in ('standard','complete') then 0 else 1 end,
    m.created_at,m.id
  limit 1;
  if not found then return null; end if;

  v_target_mold:=v_source_mold;

  -- Um lote somente de alimentos de uma família completa usa o ajuste
  -- comercial do molde "Só Alimento" da mesma família.
  if v_lot.lot_kind='food'
     and v_lot.linked_hygiene_lot_id is null
     and coalesce(v_source_mold.metadata->>'mold_kind','')='complete' then
    select m.* into v_target_mold
    from public.basket_molds m
    where coalesce(m.metadata->>'mold_kind','')='food_only'
      and m.metadata->>'derived_from_basket_id'=v_source_mold.basket_id::text
    order by m.created_at,m.id
    limit 1;
    if not found then return null; end if;
  end if;

  select round(sum(
    li.quantity_per_basket *
    case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0
         then p.offer_price else p.price end
  ),2)
  into v_product_total
  from public.basket_stock_lot_items li
  join public.products p on p.id=li.product_id and p.is_active=true
  where li.lot_id=v_lot.id
     or (v_lot.linked_hygiene_lot_id is not null and li.lot_id=v_lot.linked_hygiene_lot_id);

  if v_product_total is null then return null; end if;
  return round(v_product_total+coalesce(v_target_mold.hidden_adjustment,0),2);
end
$function$;

revoke all on function public.basket_transition_commercial_price_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.basket_transition_commercial_price_v1(uuid,uuid) to service_role;

create or replace function public.basket_lot_commercial_price_v1(
  p_basket_id uuid,
  p_food_lot_id uuid
) returns numeric
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    public.basket_transition_commercial_price_v1(p_basket_id,p_food_lot_id),
    (select l.sale_price_override
       from public.basket_stock_lots l
       join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=p_food_lot_id and k.kind='food' and k.basket_id=p_basket_id),
    (select b.base_price from public.basket_templates b where b.id=p_basket_id),
    0::numeric
  );
$function$;

-- O catálogo público usa exatamente a mesma fonte de preço do checkout.
create or replace view public.basket_commercial_catalog_v1 as
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
    a.lot_id,
    a.basket_id,
    a.kit_template_id,
    a.lot_kind,
    a.short_code,
    a.lot_code,
    a.status,
    a.quantity_built,
    a.quantity_available,
    a.sale_enabled,
    a.public_name,
    a.sale_price_override,
    a.own_sale_price_override,
    a.linked_lot_id,
    a.business_type,
    a.built_at,
    a.created_at,
    a.category_id,
    a.model_active,
    a.category_active,
    a.components_in_stock,
    a.linked_available,
    a.public_available,
    a.availability_reason,
    row_number() over(partition by m.commercial_id order by a.built_at,a.created_at,a.lot_id) as rn
  from models m
  join public.basket_lot_public_availability_v1 a on a.basket_id=m.commercial_id
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
  coalesce(c.public_available,0) as public_available,
  coalesce(c.availability_reason,
    case when not m.is_active then 'model_inactive'
         when not coalesce(m.category_active,false) then 'category_inactive'
         else 'depleted' end) as availability_reason,
  coalesce(nullif(c.public_name,''),m.name) as public_name,
  coalesce(
    public.basket_transition_commercial_price_v1(m.commercial_id,c.lot_id),
    nullif(c.sale_price_override,0),
    nullif(c.own_sale_price_override,0),
    m.default_price,
    0::numeric
  ) as sale_price,
  c.built_at as public_lot_built_at
from models m
left join (
  select commercial_id,lot_id,lot_kind,short_code,lot_code,linked_lot_id,linked_available,
         public_available,availability_reason,public_name,sale_price_override,own_sale_price_override,built_at
  from candidates where rn=1
) c on c.commercial_id=m.commercial_id;

-- Higienização objetiva das composições atuais.
-- "Só Alimento" não pode conter Papel Higiênico.
delete from public.basket_mold_positions pos
using public.basket_molds m
where pos.mold_id=m.id
  and coalesce(m.metadata->>'mold_kind','')='food_only'
  and lower(pos.label) like '%papel higi%';

-- Caldo de galinha não é variação de macarrão lámen.
delete from public.basket_mold_position_options opt
using public.basket_mold_positions pos, public.products p
where opt.position_id=pos.id
  and opt.product_id=p.id
  and (lower(pos.label) like '%lámen%' or lower(pos.label) like '%lamen%')
  and (lower(p.name) like '%caldo%' or upper(coalesce(p.subcategory,''))='CALDO');

-- Toda posição de Rosquinha mantém/restaura a Rosquinha Rancheiro 500 g (SKU P0061).
insert into public.basket_mold_position_options(position_id,product_id,sort_order,metadata)
select pos.id,p.id,0,jsonb_build_object('normalized_by','basket_price_composition_20261006')
from public.basket_mold_positions pos
cross join lateral (
  select id from public.products where sku='P0061' and is_active=true order by id limit 1
) p
where lower(pos.label) like '%rosquinha%'
  and not exists(
    select 1 from public.basket_mold_position_options o
    where o.position_id=pos.id and o.product_id=p.id
  );

-- Opções de biscoito pequeno/cream cracker não são variações equivalentes de Rosquinha 500 g.
delete from public.basket_mold_position_options opt
using public.basket_mold_positions pos, public.products p
where opt.position_id=pos.id
  and opt.product_id=p.id
  and lower(pos.label) like '%rosquinha%'
  and lower(p.name) not like '%rosquinha%';

-- Editor administrativo: inclui preços efetivos e uma prévia auditável por composição.
create or replace function public.basket_mold_editor_v1(p_basket_id uuid)
returns jsonb
language sql
stable
set search_path to 'public','pg_temp'
as $function$
  select jsonb_build_object(
    'basket_id',b.id,
    'basket_name',b.name,
    'basket_image_url',b.image_url,
    'mold_id',m.id,
    'hidden_adjustment',coalesce(m.hidden_adjustment,0),
    'public_composition_count',coalesce(m.public_composition_count,2),
    'metadata',coalesce(m.metadata,'{}'::jsonb),
    'positions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'position_id',pos.id,
        'label',pos.label,
        'quantity',pos.quantity,
        'sort_order',pos.sort_order,
        'metadata',pos.metadata,
        'options',coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id',opt.id,
            'product_id',p.id,
            'name',p.name,
            'sku',p.sku,
            'gtin',p.gtin,
            'image_url',p.image_url,
            'is_active',p.is_active,
            'price',p.price,
            'offer_price',p.offer_price,
            'is_offer',p.is_offer,
            'effective_price',case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end,
            'loose_sellable_stock',coalesce(s.loose_sellable_stock,0),
            'sort_order',opt.sort_order,
            'metadata',opt.metadata
          ) order by opt.sort_order,opt.id)
          from public.basket_mold_position_options opt
          join public.products p on p.id=opt.product_id
          left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
          where opt.position_id=pos.id
        ),'[]'::jsonb)
      ) order by pos.sort_order,pos.id)
      from public.basket_mold_positions pos
      where pos.mold_id=m.id
    ),'[]'::jsonb),
    'price_preview',coalesce((
      with generated as (
        select public.basket_mold_public_compositions_v2(p_basket_id) payload
      ), totals as (
        select (c->>'number')::integer composition_number,
               round(sum((i->>'quantity')::numeric *
                 case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end),2) product_total
        from generated g
        cross join lateral jsonb_array_elements(coalesce(g.payload->'compositions','[]'::jsonb)) c
        cross join lateral jsonb_array_elements(coalesce(c->'items','[]'::jsonb)) i
        join public.products p on p.id=(i->>'product_id')::uuid
        group by (c->>'number')::integer
      )
      select jsonb_agg(jsonb_build_object(
        'composition_number',composition_number,
        'product_total',product_total,
        'hidden_adjustment',coalesce(m.hidden_adjustment,0),
        'final_total',round(product_total+coalesce(m.hidden_adjustment,0),2)
      ) order by composition_number)
      from totals
    ),'[]'::jsonb)
  )
  from public.basket_templates b
  left join public.basket_molds m on m.basket_id=b.id
  where b.id=p_basket_id;
$function$;

-- Busca administrativa: preço exibido deve ser o mesmo preço efetivo usado no cálculo.
create or replace function public.admin_basket_mold_products_v1(p_query text default null,p_limit integer default 24)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_query text:=btrim(coalesce(p_query,''));
  v_limit integer:=least(40,greatest(1,coalesce(p_limit,24)));
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a where a.user_id=v_uid and a.is_active=true
  ) then raise exception 'admin_not_authorized'; end if;

  return jsonb_build_object('products',coalesce((
    select jsonb_agg(row_data order by row_data->>'name',row_data->>'id')
    from (
      select jsonb_build_object(
        'id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,'packaging',p.packaging,
        'image_url',p.image_url,'price',p.price,'offer_price',p.offer_price,'is_offer',p.is_offer,
        'effective_price',case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end,
        'cost',p.cost,'is_active',p.is_active,
        'loose_sellable_stock',coalesce(s.loose_sellable_stock,0),
        'effective_sellable_stock',coalesce(s.effective_sellable_stock,0),
        'basket_locked_quantity',coalesce(s.basket_locked_quantity,0)
      ) row_data
      from public.products p
      left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
      where p.is_active=true
        and (v_query='' or p.name ilike '%'||v_query||'%' or coalesce(p.sku,'') ilike '%'||v_query||'%' or coalesce(p.gtin,'') ilike '%'||v_query||'%')
      order by p.name,p.id limit v_limit
    ) q
  ),'[]'::jsonb));
end
$function$;

commit;
