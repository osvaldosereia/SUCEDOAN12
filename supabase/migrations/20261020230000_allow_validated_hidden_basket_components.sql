-- Allow hidden products only when they are present exclusively as validated basket mold components.
-- Direct product lines and legacy basket components keep the regular active-product stock gate.
do $migration$
declare
  v_definition text;
  v_old text := $old$
  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid and is_active=true for update;
    if not found then raise exception 'product_unavailable'; end if;
    select loose_sellable_stock into v_existing_stock
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_pair.key::uuid and is_active=true;
    if not found then raise exception 'product_unavailable'; end if;
    if coalesce(v_existing_stock,0)<v_pair.value::numeric then
      raise exception 'insufficient_stock';
    end if;
  end loop;
$old$;
  v_new text := $new$
  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid for update;
    if not found then raise exception 'product_unavailable'; end if;

    if coalesce((select p.is_active from public.products p where p.id=v_pair.key::uuid),false) then
      select loose_sellable_stock into v_existing_stock
      from public.ops2_loose_sellable_stock_v1
      where product_id=v_pair.key::uuid and is_active=true;
      if not found then raise exception 'product_unavailable'; end if;
      if coalesce(v_existing_stock,0)<v_pair.value::numeric then
        raise exception 'insufficient_stock';
      end if;
    else
      -- A hidden product is allowed here only when the entire loose demand for it
      -- came from mold positions already validated against this basket's options.
      select coalesce(sum(nullif(item->>'quantity','')::numeric),0)
      into v_mold_component_demand
      from jsonb_array_elements(v_item_rows) as item
      where item->>'product_id'=v_pair.key
        and item#>>'{metadata,history_kind}'='basket_mold_component';

      if v_mold_component_demand<>v_pair.value::numeric then
        raise exception 'product_unavailable';
      end if;
      select public.basket_component_fresh_sellable_stock_v1(v_pair.key::uuid)
      into v_existing_stock;
      if coalesce(v_existing_stock,0)<v_pair.value::numeric then
        raise exception 'insufficient_stock';
      end if;
    end if;
  end loop;
$new$;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure)
  into v_definition;

  if position('v_mold_component_demand' in v_definition)>0 then
    return;
  end if;
  if position(v_old in v_definition)=0 then
    raise exception 'checkout stock gate changed; refusing to patch';
  end if;

  v_definition:=replace(v_definition,'  v_current_demand numeric;', '  v_current_demand numeric;'||chr(10)||'  v_mold_component_demand numeric;');
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$migration$;
