-- R02+ READ-ONLY export of deployed checkout base from canonical Supabase.
-- MD5 of pg_get_functiondef: b765301f2dfb833341bf01762749c7e8. Original source project ssbesxgaijknwsjbsbcz.
-- TEST ONLY: never execute this fixture on live Supabase; no customer records included.
CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v3_base(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_customer_id uuid;
  v_order_id uuid:=gen_random_uuid();
  v_order_number text;
  v_payment_code text;
  v_payment_label text;
  v_cart jsonb:=coalesce(p_items,'[]'::jsonb);
  v_customer jsonb:=coalesce(p_customer_snapshot,'{}'::jsonb);
  v_delivery jsonb:=coalesce(p_delivery,'{}'::jsonb);
  v_line jsonb;
  v_components jsonb;
  v_basket public.basket_templates%rowtype;
  v_product public.products%rowtype;
  v_line_qty numeric;
  v_product_id uuid;
  v_unit numeric;
  v_line_total numeric;
  v_total numeric(14,2):=0;
  v_fiscal numeric(14,2):=0;
  v_item_rows jsonb:='[]'::jsonb;
  v_alloc_rows jsonb:='[]'::jsonb;
  v_sep_rows jsonb:='[]'::jsonb;
  v_loose_demand jsonb:='{}'::jsonb;
  v_lot_demand jsonb:='{}'::jsonb;
  v_current_demand numeric;
  v_existing_stock numeric;
  v_pair record;
  v_basket_unit numeric;
  v_basket_fiscal_unit numeric;
  v_group text;
  v_group_lot_id uuid;
  v_group_kind text;
  v_group_changed boolean;
  v_group_short text;
  v_food_lot_id uuid;
  v_hygiene_lot_id uuid;
  v_food_changed boolean:=false;
  v_hygiene_changed boolean:=false;
  v_food_short text:=null;
  v_hygiene_short text:=null;
  v_lot_requested integer;
  v_li record;
  v_selected_qty numeric;
  v_base_qty numeric;
  v_min numeric;
  v_max numeric;
  v_delta numeric;
  v_preassembled_units numeric;
  v_loose_units numeric;
  v_component_snapshot jsonb;
  v_addr jsonb;
  v_first_basket uuid:=null;
  v_basket_names text[]:='{}'::text[];
  v_all_split boolean;
  v_legacy_lot_id uuid;
  v_legacy_lot public.basket_stock_lots%rowtype;
  v_supplied boolean;
  v_selected jsonb;
  v_mold public.basket_molds%rowtype;
  v_mold_position record;
  v_mold_component_count integer;
  v_mold_position_count integer;
  v_composition_number integer;
  v_conditional_hidden_applied numeric:=0;

begin
  if nullif(btrim(coalesce(p_phone,'')),'') is null then
    v_phone:=null;
  else
    v_phone:=public.normalize_storefront_phone_v2(p_phone);
  end if;
  if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then raise exception 'cart_empty'; end if;
  if jsonb_array_length(v_cart)>80 then raise exception 'too_many_items'; end if;

  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.
  v_all_split:=true;

  v_payment_label:=trim(coalesce(p_payment_method,''));
  v_payment_code:=case v_payment_label
    when 'PIX' then 'pix'
    when 'Dinheiro' then 'cash'
    when 'Cartão de crédito' then 'credit_card'
    when 'Cartão alimentação/refeição' then 'food_card'
    else null
  end;
  if v_payment_label<>'' and v_payment_code is null then raise exception 'invalid_payment'; end if;

  begin
    if coalesce(v_customer->>'id','')<>'' then
      v_customer_id:=(v_customer->>'id')::uuid;
      if not exists(select 1 from public.customers where id=v_customer_id) then v_customer_id:=null; end if;
    end if;
  exception when others then v_customer_id:=null;
  end;
  if v_customer_id is null then
    select id into v_customer_id from public.customers where primary_whatsapp_e164=v_phone limit 1;
  end if;
  if v_customer_id is null then
    select customer_id into v_customer_id
    from public.customer_phones where phone_e164=v_phone
    order by is_primary desc,created_at asc limit 1;
  end if;

  for v_line in select value from jsonb_array_elements(v_cart) loop
    if jsonb_typeof(v_line)<>'object' then raise exception 'item_must_be_object'; end if;
    if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;
    begin v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
    exception when others then raise exception 'invalid_quantity'; end;
    if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

    if coalesce(v_line->>'type','product')='product' then
      begin v_product_id:=(v_line->>'id')::uuid;
      exception when others then raise exception 'invalid_product_id'; end;
      select * into v_product from public.products where id=v_product_id and is_active=true;
      if not found or v_product.price is null then raise exception 'product_unavailable'; end if;
      select loose_sellable_stock into v_existing_stock
      from public.ops2_loose_sellable_stock_v1
      where product_id=v_product.id and is_active=true;
      if coalesce(v_existing_stock,0)<=0 then raise exception 'product_unavailable'; end if;

      v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                   then v_product.offer_price else v_product.price end;
      v_line_total:=round(v_unit*v_line_qty,2);
      v_total:=v_total+v_line_total;
      v_fiscal:=v_fiscal+v_line_total;
      v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_line_qty;
      v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
        'quantity',v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','product',
          'image_url',coalesce(v_product.image_url,'')
        )
      ));
      continue;
    end if;

    if coalesce(v_line->>'type','product')='basket_mold' then
      begin
        select * into v_basket
        from public.basket_templates
        where id=(v_line->>'id')::uuid and is_active=true;
      exception when others then raise exception 'invalid_basket_id'; end;
      if not found then raise exception 'basket_mold_unavailable'; end if;

      select * into v_mold from public.basket_molds where basket_id=v_basket.id;
      if not found then raise exception 'basket_mold_not_configured'; end if;
      if not public.basket_mold_cutover_ready_v1(v_basket.id) then
        raise exception 'basket_mold_legacy_pending';
      end if;

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

        begin
          v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,v_mold_position.quantity);
        exception when others then raise exception 'invalid_basket_quantity'; end;
        if v_selected_qty<0 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;
        select loose_sellable_stock into v_existing_stock
        from public.ops2_loose_sellable_stock_v1
        where product_id=v_product.id and is_active=true;
        if coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then raise exception 'insufficient_stock'; end if;
        if v_selected_qty=0 then
          v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
            'position_id',v_mold_position.id,'label',v_mold_position.label,
            'product_id',v_product.id,'quantity',0
          ));
          continue;
        end if;

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

      v_conditional_hidden_applied:=0;
      if coalesce(v_mold.conditional_hidden_enabled,false)
         and v_mold.conditional_hidden_product_id is not null
         and coalesce(v_mold.conditional_hidden_adjustment,0)>0
         and exists(
           select 1
           from jsonb_array_elements(v_component_snapshot) c
           where c->>'product_id'=v_mold.conditional_hidden_product_id::text
             and coalesce(nullif(c->>'quantity','')::numeric,0)>0
         )
      then
        v_conditional_hidden_applied:=round(v_mold.conditional_hidden_adjustment,2);
        v_basket_unit:=v_basket_unit+v_conditional_hidden_applied;
      end if;

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
          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_enabled',v_mold.conditional_hidden_enabled,
          'conditional_hidden_product_id',v_mold.conditional_hidden_product_id,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',coalesce(v_mold.hidden_adjustment,0)+v_conditional_hidden_applied,
          'hidden_value_preserved',true,
          'component_snapshot',v_component_snapshot,'image_url',coalesce(v_basket.image_url,'')
        )
      ));
      v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'basket_name',v_basket.name,'quantity',v_line_qty,
        'mold',jsonb_build_object('mode','loose','mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',coalesce(v_mold.hidden_adjustment,0)+v_conditional_hidden_applied,
          'components',v_component_snapshot)
      ));
      continue;
    end if;

    begin
      select * into v_basket
      from public.basket_templates
      where id=(v_line->>'id')::uuid and is_active=true;
    exception when others then raise exception 'invalid_basket_id'; end;
    if not found then raise exception 'basket_unavailable'; end if;

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
        'component_snapshot',v_component_snapshot,'allocation_role','legacy_full','short_code',null
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

    if v_first_basket is null then v_first_basket:=v_basket.id; end if;
    if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;

    v_components:=coalesce(v_line->'components','[]'::jsonb);
    if jsonb_typeof(v_components)<>'array' or jsonb_array_length(v_components)=0 then
      raise exception 'basket_components_required';
    end if;

    begin v_food_lot_id:=nullif(v_line->>'food_lot_id','')::uuid;
    exception when others then v_food_lot_id:=null; end;
    begin v_hygiene_lot_id:=nullif(v_line->>'hygiene_lot_id','')::uuid;
    exception when others then v_hygiene_lot_id:=null; end;
    if v_food_lot_id is null then raise exception 'basket_food_lot_required'; end if;

    if not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_food_lot_id and k.kind='food' and k.basket_id=v_basket.id
    ) then raise exception 'basket_food_lot_invalid'; end if;

    v_basket.uses_hygiene_kit:=exists(
      select 1
      from public.basket_stock_lots fl
      where fl.id=v_food_lot_id and coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) is not null
    );
    if v_basket.uses_hygiene_kit then
      select coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) into v_hygiene_lot_id
      from public.basket_stock_lots fl
      where fl.id=v_food_lot_id;
    else
      v_hygiene_lot_id:=null;
    end if;

    if v_basket.uses_hygiene_kit and not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_hygiene_lot_id
        and l.status='ready' and l.quantity_available>0
    ) then raise exception 'basket_hygiene_lot_invalid'; end if;

    v_food_changed:=not public.basket_group_preserves_original_lot_v1(v_components,'food',v_food_lot_id);
    v_hygiene_changed:=case when v_basket.uses_hygiene_kit
      then not public.basket_group_preserves_original_lot_v1(v_components,'hygiene',v_hygiene_lot_id)
      else false end;
    if v_food_changed or v_hygiene_changed then
      v_food_changed:=true;
      if v_basket.uses_hygiene_kit then v_hygiene_changed:=true; end if;
    end if;

    v_basket_unit:=public.basket_lot_commercial_price_v1(v_basket.id,v_food_lot_id);
    v_basket_fiscal_unit:=0;
    v_food_short:=null;
    v_hygiene_short:=null;

    foreach v_group in array array['food','hygiene'] loop
      if v_group='hygiene' and not v_basket.uses_hygiene_kit then continue; end if;
      v_group_lot_id:=case when v_group='food' then v_food_lot_id else v_hygiene_lot_id end;
      v_group_changed:=case when v_group='food' then v_food_changed else v_hygiene_changed end;
      v_group_kind:=v_group;

      select short_code into v_group_short
      from public.basket_stock_lots where id=v_group_lot_id;
      if v_group='food' then v_food_short:=v_group_short; else v_hygiene_short:=v_group_short; end if;

      if not v_group_changed then
        -- Lock first, then read the canonical view. A concurrent checkout cannot
        -- reuse the same last unit after the first transaction updates the lot.
        perform 1
        from public.basket_stock_lots
        where id=v_group_lot_id
        for update;
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;

        v_lot_requested:=coalesce((v_lot_demand->>v_group_lot_id::text)::integer,0)+v_line_qty::integer;
        select public_available into v_existing_stock
        from public.basket_lot_public_availability_v1
        where lot_id=v_group_lot_id
          and availability_reason='available';
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;
        if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_kit_lot_insufficient'; end if;
        v_lot_demand:=jsonb_set(v_lot_demand,array[v_group_lot_id::text],to_jsonb(v_lot_requested),true);

        select coalesce(jsonb_agg(jsonb_build_object(
          'product_id',li.product_id,'quantity_per_kit',li.quantity_per_basket,
          'kit_template_item_id',li.kit_template_item_id
        ) order by li.position_order,li.created_at),'[]'::jsonb)
        into v_component_snapshot
        from public.basket_stock_lot_items li
        where li.lot_id=v_group_lot_id;

        v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
          'basket_id',v_basket.id,'lot_id',v_group_lot_id,'quantity',v_line_qty,
          'allocation_role',v_group_kind,'short_code',v_group_short,
          'component_snapshot',v_component_snapshot
        ));
      end if;

      if exists(
        select 1
        from jsonb_array_elements(v_components) c
        where coalesce(c->>'component_group','')=v_group
          and coalesce(c->>'product_id','')<>''
          and not exists(
            select 1 from public.basket_stock_lot_items li
            where li.lot_id=v_group_lot_id and li.product_id::text=c->>'product_id'
          )
      ) then raise exception 'basket_component_not_in_selected_kit'; end if;

      for v_li in
        select
          li.product_id,
          li.quantity_per_basket,
          li.position_order,
          li.kit_template_item_id,
          ki.removable,ki.quantity_editable,ki.min_quantity,ki.max_quantity,
          ki.remove_unit_delta,ki.add_unit_delta
        from public.basket_stock_lot_items li
        left join public.basket_kit_template_items ki on ki.id=li.kit_template_item_id
        where li.lot_id=v_group_lot_id
        order by li.position_order,li.created_at,li.id
      loop
        select * into v_product from public.products where id=v_li.product_id and is_active=true;
        if not found then raise exception 'basket_product_unavailable'; end if;

        v_base_qty:=v_li.quantity_per_basket;
        select coalesce(sum(nullif(c.value->>'quantity','')::numeric),0)
        into v_selected_qty
        from jsonb_array_elements(v_components) c(value)
        where coalesce(c.value->>'component_group','')=v_group
          and c.value->>'product_id'=v_li.product_id::text;

        if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then
          raise exception 'invalid_basket_quantity';
        end if;

        if v_selected_qty=0 and coalesce(v_li.removable,true)=false then raise exception 'item_not_removable'; end if;
        if v_selected_qty<v_base_qty
           and not (coalesce(v_li.removable,true) or coalesce(v_li.quantity_editable,true)) then
          raise exception 'quantity_not_editable';
        end if;
        if v_selected_qty>v_base_qty and coalesce(v_li.quantity_editable,true)=false then
          raise exception 'quantity_not_editable';
        end if;

        select coalesce(loose_sellable_stock,0) into v_existing_stock
        from public.ops2_loose_sellable_stock_v1
        where product_id=v_product.id;
        v_min:=greatest(0,coalesce(v_li.min_quantity,case when coalesce(v_li.removable,true) then 0 else v_base_qty end));
        v_max:=coalesce(v_li.max_quantity,
          case when v_group_changed then floor(coalesce(v_existing_stock,0)) else v_base_qty+floor(coalesce(v_existing_stock,0)) end);
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
          v_preassembled_units:=case when v_group_changed then 0 else v_base_qty*v_line_qty end;
          v_loose_units:=case when v_group_changed then v_selected_qty*v_line_qty else greatest(v_selected_qty-v_base_qty,0)*v_line_qty end;

          if v_loose_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_loose_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;

          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'parent_basket_name',v_basket.name,'basket_id',v_basket.id,
              'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'component_group',v_group,'group_mode',case when v_group_changed then 'loose' else 'lot' end,
              'kit_lot_id',v_group_lot_id,'kit_lot_short_code',case when v_group_changed then null else v_group_short end,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_quantity',v_loose_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,'')
            )
          ));
        end if;
      end loop;
    end loop;

    if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
    v_total:=v_total+round(v_basket_unit*v_line_qty,2);
    v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);

    v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
      'product_id',null,'sku',null,'name',v_basket.name,
      'quantity',v_line_qty,'unit_price',round(v_basket_unit,2),'line_total',round(v_basket_unit*v_line_qty,2),
      'metadata',jsonb_build_object(
        'source','vitrine_direct','history_kind','basket','basket_id',v_basket.id,
        'image_url',coalesce(v_basket.image_url,''),
        'food_mode',case when v_food_changed then 'loose' else 'lot' end,
        'food_lot_id',v_food_lot_id,
        'food_lot_short_code',case when v_food_changed then null else v_food_short end,
        'hygiene_required',v_basket.uses_hygiene_kit,
        'hygiene_mode',case when not v_basket.uses_hygiene_kit then 'none' when v_hygiene_changed then 'loose' else 'lot' end,
        'hygiene_lot_id',case when v_basket.uses_hygiene_kit then v_hygiene_lot_id else null end,
        'hygiene_lot_short_code',case when v_basket.uses_hygiene_kit and not v_hygiene_changed then v_hygiene_short else null end,
        'commercial_base_price',public.basket_lot_commercial_price_v1(v_basket.id,v_food_lot_id),
        'hidden_value_preserved',true
      )
    ));

    v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
      'basket_id',v_basket.id,'basket_name',coalesce((select public_name from public.basket_stock_lots where id=v_food_lot_id),v_basket.name),'quantity',v_line_qty,
      'food',jsonb_build_object(
        'mode',case when v_food_changed then 'loose' else 'lot' end,
        'lot_id',case when v_food_changed then null else v_food_lot_id end,
        'short_code',case when v_food_changed then null else v_food_short end
      ),
      'hygiene',case when not v_basket.uses_hygiene_kit then jsonb_build_object('mode','none')
        else jsonb_build_object(
          'mode',case when v_hygiene_changed then 'loose' else 'lot' end,
          'lot_id',case when v_hygiene_changed then null else v_hygiene_lot_id end,
          'short_code',case when v_hygiene_changed then null else v_hygiene_short end
        ) end
    ));
  end loop;

  if v_total<75 and coalesce((v_customer->>'stock_adjusted_retry')::boolean,false)=false then raise exception 'minimum_order'; end if;

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

  v_order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,8));
  v_addr:=jsonb_strip_nulls(jsonb_build_object(
    'customer_name',nullif(v_customer->>'display_name',''),'source_customer_id',v_customer_id,
    'phone',v_phone,'street',nullif(v_customer#>>'{address,street}',''),
    'number',nullif(v_customer#>>'{address,number}',''),'complement',nullif(v_customer#>>'{address,complement}',''),
    'district',coalesce(nullif(v_customer#>>'{address,district}',''),nullif(v_customer#>>'{address,neighborhood}','')),
    'city',nullif(v_customer#>>'{address,city}',''),'state',nullif(v_customer#>>'{address,state}',''),
    'postal_code',nullif(v_customer#>>'{address,postal_code}',''),'raw_text',nullif(v_customer#>>'{address,raw_text}',''),
    'google_maps_url',nullif(v_customer#>>'{address,google_maps_url}',''),
    'delivery_date',nullif(v_delivery->>'date',''),'delivery_label',nullif(v_delivery->>'label',''),
    'delivery_reason',nullif(v_delivery->>'reason',''),'delivery_time_zone',nullif(v_delivery->>'time_zone',''),
    'delivery_cutoff_hour',v_delivery->'cutoff_hour'
  ));

  insert into public.orders(
    id,customer_id,status,total,currency,delivery_address,customer_snapshot,confirmed_at,
    created_at,updated_at,basket_id,fiscal_subtotal,other_expenses,discount,sync_status,
    idempotency_key,payment_method,phone_e164,source,subtotal,order_number,basket_name_snapshot,
    checkout_snapshot
  ) values(
    v_order_id,v_customer_id,'storefront_received',round(v_total,2),'BRL',coalesce(v_addr,'{}'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'customer_id',v_customer_id,'name',nullif(v_customer->>'display_name',''),
      'phone_e164',v_phone,'status',case when v_customer_id is null then 'new' else 'registered' end
    )),
    null,now(),now(),
    case when array_length(v_basket_names,1)=1 then v_first_basket else null end,
    round(v_fiscal,2),greatest(round(v_total-v_fiscal,2),0),greatest(round(v_fiscal-v_total,2),0),
    'local','vitrine-direct-v3:'||v_order_id::text,v_payment_code,v_phone,'vitrine',
    round(v_total,2),v_order_number,
    case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
    jsonb_build_object(
      'source','vitrine_direct','cart',v_cart,'payment_label',v_payment_label,
      'delivery',v_delivery,'customer',v_customer,'basket_names',to_jsonb(v_basket_names),
      'split_kits',true,'separation_plan',v_sep_rows,'hidden_value_preserved',true
    )
  );

  for v_line in select value from jsonb_array_elements(v_item_rows) loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,
      case when nullif(v_line->>'product_id','') is null then null else (v_line->>'product_id')::uuid end,
      nullif(v_line->>'sku',''),v_line->>'name',
      (v_line->>'quantity')::numeric,(v_line->>'unit_price')::numeric,(v_line->>'line_total')::numeric,
      coalesce(v_line->'metadata','{}'::jsonb)
    );
  end loop;

  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop
    update public.basket_stock_lots
    set quantity_available=quantity_available-(v_line->>'quantity')::integer,
        status=case when quantity_available-(v_line->>'quantity')::integer=0 then 'depleted' else 'ready' end,
        updated_at=now()
    where id=(v_line->>'lot_id')::uuid
      and status='ready'
      and quantity_available>=(v_line->>'quantity')::integer;
    if not found then raise exception 'basket_kit_lot_insufficient'; end if;

    insert into public.basket_stock_allocations(
      order_id,basket_id,lot_id,quantity,status,component_snapshot,allocation_role,metadata
    ) values(
      v_order_id,(v_line->>'basket_id')::uuid,(v_line->>'lot_id')::uuid,
      (v_line->>'quantity')::integer,'allocated',
      coalesce(v_line->'component_snapshot','[]'::jsonb),
      v_line->>'allocation_role',
      jsonb_build_object(
        'source','order_create_v3','preassembled',true,
        'short_code',v_line->>'short_code','allocation_role',v_line->>'allocation_role'
      )
    )
    on conflict(order_id,lot_id,basket_id,allocation_role) do update
      set quantity=public.basket_stock_allocations.quantity+excluded.quantity,
          component_snapshot=excluded.component_snapshot,
          metadata=excluded.metadata;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'total_cents',round(v_total*100)::bigint,'total',round(v_total,2),
    'customer_id',v_customer_id,'phone_e164',v_phone,'payment_method',v_payment_label,
    'split_kits',true,'separation_plan',v_sep_rows,'hidden_value_preserved',true
  );
end;
$function$
;
