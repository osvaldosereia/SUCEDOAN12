-- Dona Antônia · Cestas Molde · Rodada 5/6
-- Integra composições geradas pelo molde ao pedido canônico sem criar lote físico falso.
-- A visualização permanece read-only; a reserva de componentes ocorre somente após o pedido,
-- pelo reserve_vitrine_order_stock_v1 já chamado por create_vitrine_cart_order_v3.

begin;

do $patch$
declare
  v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;

  v_old := $old$  v_selected jsonb;$old$;
  v_new := $new$  v_selected jsonb;
  v_mold public.basket_molds%rowtype;
  v_mold_position record;
  v_mold_component_count integer;
  v_mold_position_count integer;
  v_composition_number integer;
$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_mold_checkout_decl_anchor_missing'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$    if coalesce(v_line->>'type','product') not in ('product','basket') then raise exception 'invalid_item_type'; end if;$old$;
  v_new := $new$    if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_mold_checkout_type_anchor_missing'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$
    begin
      select * into v_basket
      from public.basket_templates
      where id=(v_line->>'id')::uuid and is_active=true;
    exception when others then raise exception 'invalid_basket_id'; end;
    if not found then raise exception 'basket_unavailable'; end if;
$old$;
  v_new := $new$
    if coalesce(v_line->>'type','product')='basket_mold' then
      begin
        select * into v_basket
        from public.basket_templates
        where id=(v_line->>'id')::uuid and is_active=true;
      exception when others then raise exception 'invalid_basket_id'; end;
      if not found then raise exception 'basket_mold_unavailable'; end if;

      select * into v_mold from public.basket_molds where basket_id=v_basket.id;
      if not found then raise exception 'basket_mold_not_configured'; end if;

      begin v_composition_number:=coalesce(nullif(v_line->>'composition_number','')::integer,1);
      exception when others then raise exception 'basket_mold_composition_invalid'; end;
      if v_composition_number<1 or v_composition_number>v_mold.public_composition_count then
        raise exception 'basket_mold_composition_invalid';
      end if;

      v_components:=coalesce(v_line->'components','[]'::jsonb);
      if jsonb_typeof(v_components)<>'array' then raise exception 'basket_mold_components_required'; end if;
      select count(*) into v_mold_position_count from public.basket_mold_positions where mold_id=v_mold.id;
      if v_mold_position_count=0 or jsonb_array_length(v_components)<>v_mold_position_count then
        raise exception 'basket_mold_component_invalid';
      end if;

      if exists(
        select 1 from jsonb_array_elements(v_components) c
        where not exists(
          select 1 from public.basket_mold_positions pos
          where pos.mold_id=v_mold.id and pos.id::text=c->>'position_id'
        )
      ) then raise exception 'basket_mold_component_invalid'; end if;

      v_basket_unit:=coalesce(v_mold.hidden_adjustment,0);
      v_basket_fiscal_unit:=0;
      v_component_snapshot:='[]'::jsonb;

      for v_mold_position in
        select id,label,quantity,sort_order
        from public.basket_mold_positions
        where mold_id=v_mold.id
        order by sort_order,id
      loop
        select count(*) into v_mold_component_count
        from jsonb_array_elements(v_components) c
        where c->>'position_id'=v_mold_position.id::text;
        if v_mold_component_count<>1 then raise exception 'basket_mold_component_invalid'; end if;

        select value into v_selected
        from jsonb_array_elements(v_components)
        where value->>'position_id'=v_mold_position.id::text
        limit 1;

        begin v_product_id:=nullif(v_selected->>'product_id','')::uuid;
        exception when others then raise exception 'basket_mold_component_invalid'; end;
        if v_product_id is null or not exists(
          select 1 from public.basket_mold_position_options opt
          where opt.position_id=v_mold_position.id and opt.product_id=v_product_id
        ) then raise exception 'basket_mold_option_invalid'; end if;

        select * into v_product from public.products where id=v_product_id and is_active=true;
        if not found or v_product.price is null then raise exception 'basket_mold_option_invalid'; end if;

        v_selected_qty:=v_mold_position.quantity;
        select loose_sellable_stock into v_existing_stock
        from public.ops2_loose_sellable_stock_v1
        where product_id=v_product.id and is_active=true;
        if coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then raise exception 'insufficient_stock'; end if;

        v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                     then v_product.offer_price else v_product.price end;
        v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
        v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
        v_basket_unit:=v_basket_unit+round(v_unit*v_selected_qty,2);
        v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+(v_selected_qty*v_line_qty);
        v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);

        v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
          'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
          'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
          'metadata',jsonb_build_object(
            'source','vitrine_direct','history_kind','basket_mold_component',
            'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
            'mold_id',v_mold.id,'position_id',v_mold_position.id,'position_label',v_mold_position.label,
            'composition_number',v_composition_number,'selected_quantity',v_selected_qty,
            'image_url',coalesce(v_product.image_url,'')
          )
        ));
        v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
          'position_id',v_mold_position.id,'label',v_mold_position.label,
          'product_id',v_product.id,'quantity',v_selected_qty
        ));
      end loop;

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);

      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',null,'sku',null,'name',v_basket.name,
        'quantity',v_line_qty,'unit_price',round(v_basket_unit,2),'line_total',round(v_basket_unit*v_line_qty,2),
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','basket_mold','basket_id',v_basket.id,
          'mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,'hidden_value_preserved',true,
          'component_snapshot',v_component_snapshot,'image_url',coalesce(v_basket.image_url,'')
        )
      ));
      v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'basket_name',v_basket.name,'quantity',v_line_qty,
        'mold',jsonb_build_object('mode','loose','mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,'components',v_component_snapshot)
      ));
      continue;
    end if;

    begin
      select * into v_basket
      from public.basket_templates
      where id=(v_line->>'id')::uuid and is_active=true;
    exception when others then raise exception 'invalid_basket_id'; end;
    if not found then raise exception 'basket_unavailable'; end if;
$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_mold_checkout_branch_anchor_missing'; end if;
  v_def := replace(v_def,v_old,v_new);

  execute v_def;
end
$patch$;

revoke all on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) to service_role;

commit;
