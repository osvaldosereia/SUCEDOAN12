-- Dona Antônia · motor único de pedidos para Cestas/Kits v1
-- Permite no mesmo pedido: produtos avulsos, lotes legacy_full e lotes novos food/linked.
-- A disponibilidade pública é sempre revalidada sob lock.

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure)
    into v_def;

  v_old:=$old$  v_all_split boolean;$old$;
  v_new:=$new$  v_all_split boolean;
  v_legacy_lot_id uuid;
  v_legacy_lot public.basket_stock_lots%rowtype;
  v_supplied boolean;
  v_selected jsonb;$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_unified_decl_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$  select exists(
    select 1 from public.basket_sales_runtime_v1 where id=1 and sales_mode='split'
  ) into v_all_split;
  if not v_all_split then raise exception 'split_kits_not_globally_ready'; end if;

$old$;
  if position(v_old in v_def)=0 then raise exception 'basket_unified_global_gate_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,$new$  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.
  v_all_split:=true;

$new$);

  v_old:=$old$    if not found then raise exception 'basket_unavailable'; end if;

    if v_first_basket is null then v_first_basket:=v_basket.id; end if;$old$;
  v_new:=$new$    if not found then raise exception 'basket_unavailable'; end if;

    -- Compatibilidade transacional com lotes completos antigos. Eles permanecem
    -- vendáveis até esgotarem e podem coexistir no mesmo carrinho com lotes novos.
    begin v_legacy_lot_id:=nullif(v_line->>'lot_id','')::uuid;
    exception when others then v_legacy_lot_id:=null; end;
    if v_legacy_lot_id is not null then
      select * into v_legacy_lot
      from public.basket_stock_lots
      where id=v_legacy_lot_id
        and basket_id=v_basket.id
        and lot_kind='legacy_full'
      for update;
      if not found then raise exception 'basket_lot_unavailable'; end if;

      select public_available into v_existing_stock
      from public.basket_lot_public_availability_v1
      where lot_id=v_legacy_lot.id
        and availability_reason='available';
      if not found then raise exception 'basket_lot_unavailable'; end if;

      v_lot_requested:=coalesce((v_lot_demand->>v_legacy_lot.id::text)::integer,0)+v_line_qty::integer;
      if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_lot_insufficient'; end if;
      v_lot_demand:=jsonb_set(v_lot_demand,array[v_legacy_lot.id::text],to_jsonb(v_lot_requested),true);

      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_basket_unit:=coalesce(v_legacy_lot.sale_price_override,v_basket.base_price,0);
      if v_basket_unit<0 then raise exception 'basket_price_invalid'; end if;
      v_basket_fiscal_unit:=0;
      v_supplied:=jsonb_typeof(v_line->'components')='array' and jsonb_array_length(v_line->'components')>0;

      for v_li in
        select
          li.id as lot_item_id,
          li.source_template_item_id,
          li.product_id as actual_product_id,
          li.quantity_per_basket,
          li.position_order,
          ti.product_id as template_product_id,
          ti.removable,
          ti.quantity_editable,
          ti.min_quantity,
          ti.max_quantity,
          ti.remove_unit_delta,
          ti.add_unit_delta
        from public.basket_stock_lot_items li
        left join public.basket_template_items ti on ti.id=li.source_template_item_id
        where li.lot_id=v_legacy_lot.id
        order by li.position_order,li.created_at,li.id
      loop
        select * into v_product from public.products where id=v_li.actual_product_id and is_active=true;
        if not found then raise exception 'basket_product_unavailable'; end if;

        v_base_qty:=v_li.quantity_per_basket;
        v_selected_qty:=v_base_qty;
        if v_supplied then
          v_selected:=null;
          select value into v_selected
          from jsonb_array_elements(v_line->'components')
          where value->>'product_id'=v_li.actual_product_id::text
          limit 1;
          if v_selected is null
             and v_li.template_product_id is not null
             and v_li.template_product_id<>v_li.actual_product_id then
            select value into v_selected
            from jsonb_array_elements(v_line->'components')
            where value->>'product_id'=v_li.template_product_id::text
            limit 1;
          end if;
          if v_selected is null then v_selected_qty:=0;
          else
            begin v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,0);
            exception when others then raise exception 'invalid_basket_quantity'; end;
          end if;
        end if;

        if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then
          raise exception 'invalid_basket_quantity';
        end if;
        if v_selected_qty=0 and not coalesce(v_li.removable,true) then raise exception 'item_not_removable'; end if;
        if v_selected_qty<v_base_qty and not (coalesce(v_li.removable,true) or coalesce(v_li.quantity_editable,true)) then
          raise exception 'quantity_not_editable';
        end if;
        if v_selected_qty>v_base_qty and not coalesce(v_li.quantity_editable,true) then raise exception 'quantity_not_editable'; end if;

        select coalesce(loose_sellable_stock,0) into v_existing_stock
        from public.ops2_loose_sellable_stock_v1 where product_id=v_product.id;
        v_min:=greatest(0,coalesce(v_li.min_quantity,case when coalesce(v_li.removable,true) then 0 else v_base_qty end));
        v_max:=coalesce(v_li.max_quantity,v_base_qty+floor(coalesce(v_existing_stock,0)));
        if v_selected_qty<v_min or v_selected_qty>v_max then raise exception 'basket_quantity_out_of_range'; end if;

        v_delta:=0;
        if v_selected_qty<v_base_qty then
          v_delta:=abs(v_selected_qty-v_base_qty)*coalesce(v_li.remove_unit_delta,-coalesce(v_product.price,0));
        elsif v_selected_qty>v_base_qty then
          v_delta:=(v_selected_qty-v_base_qty)*coalesce(v_li.add_unit_delta,coalesce(v_product.price,0));
        end if;
        v_basket_unit:=v_basket_unit+v_delta;

        if v_selected_qty>0 then
          v_unit:=coalesce(v_product.price,0);
          v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
          v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
          v_preassembled_units:=least(v_selected_qty,v_base_qty)*v_line_qty;
          v_loose_units:=greatest(v_selected_qty-v_base_qty,0)*v_line_qty;
          if v_loose_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_loose_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;
          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'basket_lot_id',v_legacy_lot.id,'basket_lot_code',v_legacy_lot.lot_code,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_extra_quantity',v_loose_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,''),
              'template_product_id',v_li.template_product_id
            )
          ));
        end if;
      end loop;

      if v_supplied and exists(
        select 1 from jsonb_array_elements(v_line->'components') c
        where coalesce(c->>'product_id','')<>''
          and not exists(
            select 1
            from public.basket_stock_lot_items li
            left join public.basket_template_items ti on ti.id=li.source_template_item_id
            where li.lot_id=v_legacy_lot.id
              and (li.product_id::text=c->>'product_id' or ti.product_id::text=c->>'product_id')
          )
      ) then raise exception 'basket_component_not_in_lot'; end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id',li.product_id,'quantity_per_basket',li.quantity_per_basket,
        'source_template_item_id',li.source_template_item_id
      ) order by li.position_order,li.created_at),'[]'::jsonb)
      into v_component_snapshot
      from public.basket_stock_lot_items li where li.lot_id=v_legacy_lot.id;

      v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'lot_id',v_legacy_lot.id,'quantity',v_line_qty,
        'component_snapshot',v_component_snapshot,'allocation_role','legacy','short_code',null
      ));
      v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'basket_name',coalesce(v_legacy_lot.public_name,v_basket.name),'quantity',v_line_qty,
        'legacy',jsonb_build_object('mode','lot','lot_id',v_legacy_lot.id,'lot_code',v_legacy_lot.lot_code)
      ));
      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);
      continue;
    end if;

    if v_first_basket is null then v_first_basket:=v_basket.id; end if;$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_unified_legacy_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  execute v_def;
end
$patch$;
