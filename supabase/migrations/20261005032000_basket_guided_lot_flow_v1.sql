-- Dona Antônia · Cestas/Kits: prévia e criação de lote reservado v1
begin;

create or replace function public.preview_basket_commercial_lot_v1(
  p_basket_id uuid,
  p_quantity integer,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_basket public.basket_templates%rowtype;
  v_kit public.basket_kit_templates%rowtype;
  v_template public.basket_kit_template_items%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_item_id uuid;
  v_qty numeric;
  v_family text;
  v_seen_items uuid[]:=array[]::uuid[];
  v_requirements jsonb:='[]'::jsonb;
  v_component_sum numeric:=0;
  v_cost_sum numeric:=0;
  v_ok boolean:=true;
begin
  if p_basket_id is null then raise exception 'basket_required'; end if;
  if coalesce(p_quantity,0)<1 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>120 then
    raise exception 'empty_lot_composition';
  end if;

  select * into v_basket from public.basket_templates where id=p_basket_id;
  if not found then raise exception 'basket_not_found'; end if;
  select * into v_kit from public.basket_kit_templates
    where basket_id=p_basket_id and is_active=true
    order by sort_order,created_at,id limit 1;
  if not found then raise exception 'basket_kit_template_not_found'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin v_product_id:=(v_item->>'product_id')::uuid;
    exception when others then raise exception 'invalid_lot_product'; end;
    begin v_item_id:=(v_item->>'kit_template_item_id')::uuid;
    exception when others then raise exception 'invalid_kit_template_item'; end;
    begin v_qty:=(v_item->>'quantity_per_basket')::numeric;
    exception when others then raise exception 'invalid_lot_component_quantity'; end;
    if v_qty<=0 or v_qty>100 then raise exception 'invalid_lot_component_quantity'; end if;
    if v_item_id=any(v_seen_items) then raise exception 'duplicate_kit_template_item'; end if;
    v_seen_items:=array_append(v_seen_items,v_item_id);

    select * into v_template from public.basket_kit_template_items
      where id=v_item_id and kit_template_id=v_kit.id;
    if not found then raise exception 'invalid_kit_template_item'; end if;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then
      raise exception 'lot_product_unavailable';
    end if;
    if not v_template.quantity_editable and v_qty<>v_template.quantity then raise exception 'fixed_position_quantity_changed'; end if;
    if v_qty<coalesce(v_template.min_quantity,0) or (v_template.max_quantity is not null and v_qty>v_template.max_quantity) then
      raise exception 'position_quantity_out_of_bounds';
    end if;

    select m.family_key into v_family from public.basket_lot_substitution_products m where m.product_id=v_template.product_id;
    if v_family is not null and v_product_id<>v_template.product_id and not exists(
      select 1 from public.basket_lot_substitution_products m where m.product_id=v_product_id and m.family_key=v_family
    ) then raise exception 'position_product_not_in_family'; end if;
  end loop;

  if exists(
    select 1 from public.basket_kit_template_items t
    where t.kit_template_id=v_kit.id and t.removable=false and not (t.id=any(v_seen_items))
  ) then raise exception 'required_position_missing'; end if;

  with raw as (
    select (value->>'product_id')::uuid as product_id,
           (value->>'quantity_per_basket')::numeric as quantity_per_basket
    from jsonb_array_elements(p_items)
  ), needs as (
    select product_id,sum(quantity_per_basket)::numeric as quantity_per_basket
    from raw group by product_id
  ), calc as (
    select n.product_id,p.name,n.quantity_per_basket,
           round(n.quantity_per_basket*p_quantity,3) as required,
           coalesce(s.loose_sellable_stock,0)::numeric as available,
           round(coalesce(s.loose_sellable_stock,0)-n.quantity_per_basket*p_quantity,3) as balance_after,
           coalesce(p.price,0)::numeric as sale_price,
           coalesce(p.cost,0)::numeric as cost_price
    from needs n
    join public.products p on p.id=n.product_id
    left join public.ops2_loose_sellable_stock_v1 s on s.product_id=n.product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id',product_id,'name',name,'quantity_per_basket',quantity_per_basket,
           'required',required,'available',available,'balance_after',balance_after,
           'ok',available>=required
         ) order by name,product_id),'[]'::jsonb),
         coalesce(bool_and(available>=required),false),
         round(coalesce(sum(quantity_per_basket*sale_price),0),2),
         round(coalesce(sum(quantity_per_basket*cost_price),0),2)
    into v_requirements,v_ok,v_component_sum,v_cost_sum
  from calc;

  return jsonb_build_object(
    'ok',v_ok,'basket_id',p_basket_id,'quantity',p_quantity,'requirements',v_requirements,
    'component_sum',v_component_sum,'cost_sum',v_cost_sum,
    'sale_price',round(coalesce(v_basket.base_price,0),2),
    'hidden_adjustment',round(coalesce(v_basket.base_price,0)-v_component_sum,2)
  );
end;
$function$;

create or replace function public.create_basket_commercial_lot_reserved_v1(
  p_basket_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_public_name text,
  p_sale_price numeric,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_linked_lot_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_basket public.basket_templates%rowtype;
  v_kit public.basket_kit_templates%rowtype;
  v_item jsonb;
  v_req record;
  v_product_id uuid;
  v_item_id uuid;
  v_source_id uuid;
  v_qty numeric;
  v_available numeric;
  v_short text;
  v_lot_id uuid:=gen_random_uuid();
  v_lot_code text;
  v_name text;
  v_business_type text;
  v_final_sale numeric;
  v_linked_sale numeric:=0;
  v_own_sale numeric:=0;
  v_preview jsonb;
  v_commercial jsonb;
begin
  v_preview:=public.preview_basket_commercial_lot_v1(p_basket_id,p_quantity,p_items);
  if coalesce((v_preview->>'ok')::boolean,false)=false then raise exception 'insufficient_loose_stock'; end if;

  select * into v_basket from public.basket_templates where id=p_basket_id;
  if not found then raise exception 'basket_not_found'; end if;
  select * into v_kit from public.basket_kit_templates
    where basket_id=p_basket_id and is_active=true
    order by sort_order,created_at,id limit 1;
  if not found then raise exception 'basket_kit_template_not_found'; end if;

  v_final_sale:=round(coalesce(p_sale_price,v_basket.base_price,0),2);
  if v_final_sale<0 or v_final_sale>9999999 then raise exception 'invalid_sale_price'; end if;
  v_name:=coalesce(nullif(btrim(coalesce(p_public_name,'')),''),v_basket.name);
  if char_length(v_name)>120 then raise exception 'invalid_public_name'; end if;

  select case c.slug
    when 'cestas-completas' then 'basic_complete'
    when 'cestas-so-alimento' then 'basic_food'
    when 'kits-limpeza-e-higiene' then 'cleaning_hygiene'
    when 'kits-limpeza' then 'cleaning'
    when 'kits-higiene' then 'hygiene'
    else case when v_kit.kind='hygiene' then 'cleaning_hygiene' else 'basic_food' end
  end into v_business_type
  from public.basket_categories c where c.id=v_basket.category_id;
  v_business_type:=coalesce(v_business_type,case when v_kit.kind='hygiene' then 'cleaning_hygiene' else 'basic_food' end);

  if p_linked_lot_id is not null then
    select coalesce(l.sale_price_override,l.own_sale_price_override,0)
      into v_linked_sale
    from public.basket_stock_lots l
    where l.id=p_linked_lot_id
      and l.status in ('draft','ready')
      and l.linked_lot_id is null;
    if not found then raise exception 'invalid_linked_lot'; end if;
  end if;
  v_own_sale:=round(v_final_sale-coalesce(v_linked_sale,0),2);
  if v_own_sale<0 then raise exception 'linked_price_exceeds_total'; end if;

  for v_req in
    with raw as (
      select (value->>'product_id')::uuid as product_id,
             (value->>'quantity_per_basket')::numeric as quantity_per_basket
      from jsonb_array_elements(p_items)
    )
    select product_id,sum(quantity_per_basket)*p_quantity as required
    from raw group by product_id order by product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_req.product_id::text,0));
    perform 1 from public.products where id=v_req.product_id and is_active=true for update;
    v_available:=0;
    select coalesce(s.loose_sellable_stock,0) into v_available
    from public.ops2_loose_sellable_stock_v1 s where s.product_id=v_req.product_id;
    if coalesce(v_available,0)<v_req.required then
      raise exception 'insufficient_loose_stock:%',v_req.product_id;
    end if;
  end loop;

  v_short:=upper(btrim(coalesce(p_short_code,'')));
  if v_short='' then v_short:=public.next_basket_kit_short_code_v1(v_kit.id); end if;
  if v_short !~ '^[A-Z]{2}[0-9]$' or left(v_short,2)<>v_kit.code_prefix then raise exception 'invalid_kit_short_code'; end if;
  if exists(select 1 from public.basket_stock_lots where short_code=v_short and status in ('draft','ready')) then
    raise exception 'kit_short_code_in_use';
  end if;
  v_lot_code:='BG-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_lot_id::text,'-',''),1,8));

  insert into public.basket_stock_lots(
    id,basket_id,kit_template_id,lot_code,status,assembly_status,
    quantity_built,quantity_available,composition_hash,built_at,built_by,notes,source,metadata,
    lot_kind,short_code,quantity_dismantled,sale_enabled,public_name,business_type,linked_lot_id
  ) values (
    v_lot_id,p_basket_id,v_kit.id,v_lot_code,'draft','assembling',
    p_quantity,0,md5(p_items::text),now(),nullif(btrim(coalesce(p_operator,'')),''),nullif(btrim(coalesce(p_notes,'')),''),'admin',
    jsonb_build_object('guided_reserved_lot_v1',true,'assembly_started_at',now(),'reserved_by',nullif(btrim(coalesce(p_operator,'')),'')),
    v_kit.kind,v_short,0,false,v_name,v_business_type,p_linked_lot_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id:=(v_item->>'product_id')::uuid;
    v_item_id:=(v_item->>'kit_template_item_id')::uuid;
    begin v_source_id:=nullif(v_item->>'source_template_item_id','')::uuid; exception when others then v_source_id:=null; end;
    v_qty:=(v_item->>'quantity_per_basket')::numeric;
    insert into public.basket_stock_lot_items(
      lot_id,source_template_item_id,kit_template_item_id,product_id,quantity_per_basket,
      position_order,substitution_reason,metadata
    ) values (
      v_lot_id,v_source_id,v_item_id,v_product_id,v_qty,
      coalesce(nullif(v_item->>'position_order','')::integer,0),
      nullif(btrim(coalesce(v_item->>'substitution_reason','')),''),
      jsonb_build_object('position_label',nullif(v_item->>'position_label',''),'guided_position',true)
    );
  end loop;

  insert into public.basket_lot_component_reservations(lot_id,product_id,quantity_reserved,status,metadata)
  with raw as (
    select (value->>'product_id')::uuid as product_id,
           (value->>'quantity_per_basket')::numeric as quantity_per_basket
    from jsonb_array_elements(p_items)
  )
  select v_lot_id,product_id,sum(quantity_per_basket)*p_quantity,'active',
         jsonb_build_object('source','guided_reserved_lot_v1','quantity_built',p_quantity)
  from raw group by product_id;

  v_commercial:=public.apply_basket_kit_lot_commercial_v3(
    v_lot_id,v_name,v_own_sale,v_business_type,p_linked_lot_id
  );

  return jsonb_build_object(
    'ok',true,'lot_id',v_lot_id,'lot_code',v_lot_code,'short_code',v_short,
    'status','draft','assembly_status','assembling','quantity_built',p_quantity,'quantity_available',0,
    'sale_enabled',false,'preview',v_preview,'commercial',v_commercial,
    'component_sum_snapshot',v_commercial->'component_sum_snapshot',
    'hidden_adjustment_snapshot',v_commercial->'hidden_adjustment_snapshot',
    'cost_sum_snapshot',v_commercial->'cost_sum_snapshot'
  );
end;
$function$;

revoke all on function public.preview_basket_commercial_lot_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.preview_basket_commercial_lot_v1(uuid,integer,jsonb) to service_role;
revoke all on function public.create_basket_commercial_lot_reserved_v1(uuid,integer,jsonb,text,numeric,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_basket_commercial_lot_reserved_v1(uuid,integer,jsonb,text,numeric,text,text,text,uuid) to service_role;

commit;
