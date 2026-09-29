
create or replace function public.create_basket_stock_lot_v1(
  p_basket_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_source text default 'admin',
  p_allow_stock_gap boolean default false
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_basket public.basket_templates%rowtype;
  v_lot_id uuid:=gen_random_uuid();
  v_code text;
  v_item jsonb;
  v_product_id uuid;
  v_template_item_id uuid;
  v_qty numeric;
  v_available numeric;
  v_required numeric;
  v_hash text;
  v_gap jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_req record;
begin
  if p_basket_id is null then raise exception 'invalid_basket'; end if;
  if coalesce(p_quantity,0)<=0 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'empty_lot_composition';
  end if;

  select * into v_basket from public.basket_templates where id=p_basket_id and is_active=true;
  if not found then raise exception 'basket_not_found'; end if;

  v_hash:=md5(coalesce(p_items::text,'[]'));
  v_code:='CB-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'
          ||lpad(coalesce(v_basket.sort_order,0)::text,2,'0')||'-'
          ||upper(substr(replace(v_lot_id::text,'-',''),1,4));

  -- Validate each position first.
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid;
    exception when others then raise exception 'invalid_lot_product'; end;
    begin v_template_item_id:=nullif(v_item->>'template_item_id','')::uuid;
    exception when others then v_template_item_id:=null; end;
    begin v_qty:=coalesce(nullif(v_item->>'quantity_per_basket','')::numeric,0);
    exception when others then raise exception 'invalid_lot_component_quantity'; end;
    if v_qty<=0 or v_qty>100 then raise exception 'invalid_lot_component_quantity'; end if;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then
      raise exception 'lot_product_unavailable';
    end if;
    if v_template_item_id is not null and not exists(
      select 1 from public.basket_template_items
      where id=v_template_item_id and basket_id=p_basket_id
    ) then raise exception 'invalid_template_item'; end if;
    v_count:=v_count+1;
  end loop;

  -- Validate cumulative demand per SKU. A substitute may fill more than one position.
  for v_req in
    select (x.value->>'product_id')::uuid as product_id,
           sum((x.value->>'quantity_per_basket')::numeric * p_quantity)::numeric as required
    from jsonb_array_elements(p_items) x(value)
    group by (x.value->>'product_id')::uuid
  loop
    select loose_sellable_stock into v_available
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_req.product_id;
    v_required:=v_req.required;
    if coalesce(v_available,0)<v_required then
      v_gap:=v_gap||jsonb_build_array(jsonb_build_object(
        'product_id',v_req.product_id,'available',coalesce(v_available,0),
        'required',v_required,'shortage',v_required-coalesce(v_available,0)
      ));
      if not p_allow_stock_gap then raise exception 'insufficient_loose_stock'; end if;
    end if;
  end loop;

  insert into public.basket_stock_lots(
    id,basket_id,lot_code,status,quantity_built,quantity_available,
    composition_hash,built_at,built_by,notes,source,metadata
  ) values(
    v_lot_id,p_basket_id,v_code,'ready',p_quantity,p_quantity,
    v_hash,now(),nullif(trim(coalesce(p_operator,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),
    case when p_source in ('admin','bootstrap_existing','import') then p_source else 'admin' end,
    jsonb_build_object('stock_gap_at_creation',v_gap,'component_count',v_count)
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    begin v_template_item_id:=nullif(v_item->>'template_item_id','')::uuid;
    exception when others then v_template_item_id:=null; end;
    v_qty:=(v_item->>'quantity_per_basket')::numeric;
    insert into public.basket_stock_lot_items(
      lot_id,source_template_item_id,product_id,quantity_per_basket,
      position_order,substitution_reason,metadata
    ) values(
      v_lot_id,v_template_item_id,v_product_id,v_qty,
      coalesce(nullif(v_item->>'position_order','')::integer,0),
      nullif(trim(coalesce(v_item->>'substitution_reason','')),''),
      jsonb_build_object(
        'template_product_id',nullif(v_item->>'template_product_id',''),
        'is_substitution',coalesce((v_item->>'is_substitution')::boolean,false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok',true,'lot_id',v_lot_id,'lot_code',v_code,
    'quantity_built',p_quantity,'stock_gap',v_gap
  );
end;
$$;

revoke all on function public.create_basket_stock_lot_v1(uuid,integer,jsonb,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_basket_stock_lot_v1(uuid,integer,jsonb,text,text,text,boolean) to service_role;

