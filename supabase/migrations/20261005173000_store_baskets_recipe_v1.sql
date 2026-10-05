-- Dona Antônia · Cestas do Site por receitas de kits internos v1
-- Configurar/salvar receita não cria lote físico nem reserva estoque.
begin;

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
        'calculated_hidden_adjustment',b.base_price-coalesce(fin.sale_total,0)
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
    where exists(select 1 from public.store_basket_recipe_kits r where r.basket_id=b.id)
  ) q;
$function$;

create or replace function public.store_basket_recipe_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_basket jsonb;
  v_linked jsonb;
  v_available jsonb;
begin
  if p_basket_id is null then raise exception 'store_basket_required'; end if;

  select jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'image_url',b.image_url,
    'sale_price',b.base_price,
    'hidden_adjustment',b.hidden_adjustment,
    'is_active',b.is_active,
    'sort_order',b.sort_order,
    'category_id',b.category_id,
    'category_name',c.name,
    'category_slug',c.slug
  ) into v_basket
  from public.basket_templates b
  left join public.basket_categories c on c.id=b.category_id
  where b.id=p_basket_id;
  if v_basket is null then raise exception 'store_basket_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kit_id',r.kit_id,
    'name',k.name,
    'type',k.type,
    'quantity',r.quantity,
    'is_required',r.is_required,
    'sort_order',r.sort_order,
    'item_count',coalesce(fin.item_count,0),
    'cost_total',coalesce(fin.cost_total,0)*r.quantity,
    'sale_total',coalesce(fin.sale_total,0)*r.quantity,
    'unit_cost_total',coalesce(fin.cost_total,0),
    'unit_sale_total',coalesce(fin.sale_total,0)
  ) order by r.sort_order,r.id),'[]'::jsonb) into v_linked
  from public.store_basket_recipe_kits r
  join public.assembly_kits k on k.id=r.kit_id
  left join lateral (
    select count(*)::integer as item_count,
           coalesce(sum(coalesce(p.cost,0)*i.quantity),0)::numeric as cost_total,
           coalesce(sum(coalesce(p.price,0)*i.quantity),0)::numeric as sale_total
    from public.assembly_kit_items i
    join public.products p on p.id=i.product_id
    where i.kit_id=k.id
  ) fin on true
  where r.basket_id=p_basket_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',k.id,
    'name',k.name,
    'type',k.type,
    'item_count',coalesce(fin.item_count,0),
    'cost_total',coalesce(fin.cost_total,0),
    'sale_total',coalesce(fin.sale_total,0)
  ) order by case k.type when 'food' then 1 when 'cleaning_hygiene' then 2 else 3 end,k.name,k.id),'[]'::jsonb)
  into v_available
  from public.assembly_kits k
  left join lateral (
    select count(*)::integer as item_count,
           coalesce(sum(coalesce(p.cost,0)*i.quantity),0)::numeric as cost_total,
           coalesce(sum(coalesce(p.price,0)*i.quantity),0)::numeric as sale_total
    from public.assembly_kit_items i
    join public.products p on p.id=i.product_id
    where i.kit_id=k.id
  ) fin on true
  where k.is_active=true;

  return jsonb_build_object(
    'basket',v_basket,
    'recipe_kits',coalesce(v_linked,'[]'::jsonb),
    'available_kits',coalesce(v_available,'[]'::jsonb),
    'cost_total',coalesce((select sum((x->>'cost_total')::numeric) from jsonb_array_elements(coalesce(v_linked,'[]'::jsonb)) x),0),
    'product_sale_total',coalesce((select sum((x->>'sale_total')::numeric) from jsonb_array_elements(coalesce(v_linked,'[]'::jsonb)) x),0)
  );
end;
$function$;

create or replace function public.save_store_basket_recipe_v1(
  p_basket_id uuid,
  p_name text,
  p_sale_price numeric,
  p_image_url text,
  p_kits jsonb,
  p_operator text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_basket_id uuid:=p_basket_id;
  v_name text:=btrim(coalesce(p_name,''));
  v_sale_price numeric:=p_sale_price;
  v_image_url text:=nullif(btrim(coalesce(p_image_url,'')),'');
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_category_slug text;
  v_category_id uuid;
  v_cost_total numeric:=0;
  v_product_sale_total numeric:=0;
  v_kit_count integer:=0;
  v_food_count integer:=0;
  v_cleaning_count integer:=0;
  v_other_count integer:=0;
begin
  if length(v_name)<1 or length(v_name)>180 then raise exception 'store_basket_name_invalid'; end if;
  if v_sale_price is null or v_sale_price<0 or v_sale_price>9999999 then raise exception 'store_basket_price_invalid'; end if;
  if v_image_url is not null and length(v_image_url)>1000 then raise exception 'store_basket_image_invalid'; end if;
  if jsonb_typeof(coalesce(p_kits,'null'::jsonb))<>'array' or jsonb_array_length(p_kits)<1 or jsonb_array_length(p_kits)>20 then
    raise exception 'store_basket_kits_invalid';
  end if;

  with input_kits as (
    select
      (e.value->>'kit_id')::uuid as kit_id,
      coalesce(nullif(e.value->>'quantity','')::numeric,1) as quantity,
      coalesce(nullif(e.value->>'sort_order','')::integer,e.ordinality::integer-1) as sort_order,
      coalesce((e.value->>'is_required')::boolean,true) as is_required
    from jsonb_array_elements(p_kits) with ordinality e(value,ordinality)
  )
  select count(distinct ik.kit_id),
         count(distinct ik.kit_id) filter(where k.type='food'),
         count(distinct ik.kit_id) filter(where k.type='cleaning_hygiene'),
         count(distinct ik.kit_id) filter(where k.type not in ('food','cleaning_hygiene')),
         coalesce(sum(coalesce(p.cost,0)*i.quantity*ik.quantity),0),
         coalesce(sum(coalesce(p.price,0)*i.quantity*ik.quantity),0)
  into v_kit_count,v_food_count,v_cleaning_count,v_other_count,v_cost_total,v_product_sale_total
  from input_kits ik
  join public.assembly_kits k on k.id=ik.kit_id and k.is_active=true
  join public.assembly_kit_items i on i.kit_id=k.id
  join public.products p on p.id=i.product_id;

  if v_kit_count<>jsonb_array_length(p_kits) then raise exception 'store_basket_kit_unavailable'; end if;
  if exists(
    select 1 from (
      select (e.value->>'kit_id')::uuid kit_id,count(*) n
      from jsonb_array_elements(p_kits) e(value)
      group by (e.value->>'kit_id')::uuid
      having count(*)>1
    ) d
  ) then raise exception 'store_basket_kit_duplicate'; end if;
  if exists(
    select 1
    from jsonb_array_elements(p_kits) e(value)
    where coalesce(nullif(e.value->>'quantity','')::numeric,1)<=0
       or coalesce(nullif(e.value->>'quantity','')::numeric,1)>100
  ) then raise exception 'store_basket_kit_quantity_invalid'; end if;

  if v_food_count=v_kit_count and v_kit_count>0 then
    v_category_slug:='cestas-so-alimento';
  elsif v_cleaning_count=v_kit_count and v_kit_count>0 then
    v_category_slug:='kits-limpeza-e-higiene';
  else
    v_category_slug:='cestas-completas';
  end if;

  select c.id into v_category_id
  from public.basket_categories c
  where c.slug=v_category_slug and c.is_active=true
  order by c.sort_order,c.id
  limit 1;
  if v_category_id is null then raise exception 'store_basket_category_missing:%',v_category_slug; end if;

  if v_basket_id is null then
    insert into public.basket_templates(
      name,image_url,base_price,hidden_adjustment,is_active,sort_order,rules,category_id,internal_notes
    ) values(
      v_name,v_image_url,v_sale_price,v_sale_price-v_product_sale_total,true,
      coalesce((select max(sort_order)+10 from public.basket_templates),10),
      jsonb_build_object('store_recipe_v1',true,'created_by',v_operator),v_category_id,
      'Cesta do Site criada por receitas internas.'
    ) returning id into v_basket_id;
  else
    perform 1 from public.basket_templates b where b.id=v_basket_id for update;
    if not found then raise exception 'store_basket_not_found'; end if;
    update public.basket_templates
    set name=v_name,
        image_url=v_image_url,
        base_price=v_sale_price,
        hidden_adjustment=v_sale_price-v_product_sale_total,
        category_id=v_category_id,
        rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object('store_recipe_v1',true,'updated_by',v_operator),
        updated_at=now()
    where id=v_basket_id;
  end if;

  delete from public.store_basket_recipe_kits where basket_id=v_basket_id;
  insert into public.store_basket_recipe_kits(basket_id,kit_id,quantity,is_required,sort_order,metadata)
  select
    v_basket_id,
    (e.value->>'kit_id')::uuid,
    coalesce(nullif(e.value->>'quantity','')::numeric,1),
    coalesce((e.value->>'is_required')::boolean,true),
    coalesce(nullif(e.value->>'sort_order','')::integer,e.ordinality::integer-1),
    jsonb_build_object('saved_via','store_basket_recipe_v1','operator',v_operator)
  from jsonb_array_elements(p_kits) with ordinality e(value,ordinality);

  return jsonb_build_object(
    'ok',true,
    'basket_id',v_basket_id,
    'name',v_name,
    'category_slug',v_category_slug,
    'sale_price',v_sale_price,
    'cost_total',v_cost_total,
    'product_sale_total',v_product_sale_total,
    'hidden_adjustment',v_sale_price-v_product_sale_total,
    'editor',public.store_basket_recipe_editor_v1(v_basket_id)
  );
end;
$function$;

create or replace function public.preview_store_basket_recipe_v1(
  p_basket_id uuid,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_basket public.basket_templates%rowtype;
  v_requirements jsonb;
  v_unit_cost numeric:=0;
  v_unit_sale numeric:=0;
  v_ok boolean:=true;
begin
  if p_basket_id is null then raise exception 'store_basket_required'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>500 then raise exception 'store_basket_quantity_invalid'; end if;
  select * into v_basket from public.basket_templates where id=p_basket_id;
  if not found then raise exception 'store_basket_not_found'; end if;
  if not exists(select 1 from public.store_basket_recipe_kits r where r.basket_id=p_basket_id) then
    raise exception 'store_basket_recipe_empty';
  end if;

  with composition as (
    select
      i.product_id,
      sum(i.quantity*r.quantity)::numeric as quantity_per_basket
    from public.store_basket_recipe_kits r
    join public.assembly_kit_items i on i.kit_id=r.kit_id
    where r.basket_id=p_basket_id
    group by i.product_id
  ), rows as (
    select
      c.product_id,
      p.name,
      p.sku,
      p.gtin,
      p.image_url,
      c.quantity_per_basket,
      (c.quantity_per_basket*p_quantity)::numeric as required,
      coalesce(s.loose_sellable_stock,0)::numeric as available,
      (coalesce(s.loose_sellable_stock,0)-c.quantity_per_basket*p_quantity)::numeric as balance_after,
      (coalesce(s.loose_sellable_stock,0)>=c.quantity_per_basket*p_quantity) as ok,
      coalesce(p.cost,0)::numeric as cost_price,
      coalesce(p.price,0)::numeric as sale_price
    from composition c
    join public.products p on p.id=c.product_id
    left join public.ops2_loose_sellable_stock_v1 s on s.product_id=c.product_id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',product_id,
      'name',name,
      'sku',sku,
      'gtin',gtin,
      'image_url',image_url,
      'quantity_per_basket',quantity_per_basket,
      'required',required,
      'available',available,
      'balance_after',balance_after,
      'ok',ok,
      'cost_price',cost_price,
      'sale_price',sale_price
    ) order by name,product_id),'[]'::jsonb),
    coalesce(sum(cost_price*quantity_per_basket),0),
    coalesce(sum(sale_price*quantity_per_basket),0),
    coalesce(bool_and(ok),true)
  into v_requirements,v_unit_cost,v_unit_sale,v_ok
  from rows;

  return jsonb_build_object(
    'ok',v_ok,
    'basket_id',v_basket.id,
    'name',v_basket.name,
    'quantity',p_quantity,
    'sale_price',v_basket.base_price,
    'unit_cost_total',v_unit_cost,
    'unit_product_sale_total',v_unit_sale,
    'hidden_adjustment',v_basket.base_price-v_unit_sale,
    'lot_cost_total',v_unit_cost*p_quantity,
    'lot_sale_total',v_basket.base_price*p_quantity,
    'requirements',v_requirements
  );
end;
$function$;

revoke all on function public.store_basket_recipe_catalog_v1() from public,anon,authenticated;
grant execute on function public.store_basket_recipe_catalog_v1() to service_role;
revoke all on function public.store_basket_recipe_editor_v1(uuid) from public,anon,authenticated;
grant execute on function public.store_basket_recipe_editor_v1(uuid) to service_role;
revoke all on function public.save_store_basket_recipe_v1(uuid,text,numeric,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_store_basket_recipe_v1(uuid,text,numeric,text,jsonb,text) to service_role;
revoke all on function public.preview_store_basket_recipe_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.preview_store_basket_recipe_v1(uuid,integer) to service_role;

commit;
