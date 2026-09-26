-- Dona Antônia Operations 2.0
-- Move canonical order availability reads to ops2_sellable_stock_v1.
-- Safe to deploy before cutover: under legacy_shadow effective_sellable_stock equals products.stock.

CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v1(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
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
    v_component jsonb;
    v_basket public.basket_templates%rowtype;
    v_bi public.basket_template_items%rowtype;
    v_product public.products%rowtype;
    v_product_id uuid;
    v_basket_id uuid;
    v_line_qty numeric;
    v_component_qty numeric;
    v_base_qty numeric;
    v_selected_qty numeric;
    v_min numeric;
    v_max numeric;
    v_delta numeric;
    v_unit numeric;
    v_line_total numeric;
    v_basket_unit numeric;
    v_basket_fiscal_unit numeric;
    v_total numeric(14,2):=0;
    v_fiscal numeric(14,2):=0;
    v_demand jsonb:='{}'::jsonb;
    v_item_rows jsonb:='[]'::jsonb;
    v_selected jsonb;
    v_supplied boolean;
    v_current_demand numeric;
    v_pair record;
    v_existing_stock numeric;
    v_first_basket uuid:=null;
    v_basket_names text[]:='{}'::text[];
    v_addr jsonb;
  begin
    v_phone:=public.normalize_storefront_phone_v2(p_phone);
    if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then
      raise exception 'cart_empty';
    end if;
    if jsonb_array_length(v_cart)>80 then raise exception 'too_many_items'; end if;

    v_payment_label:=trim(coalesce(p_payment_method,''));
    v_payment_code:=case v_payment_label
      when 'PIX' then 'pix'
      when 'Dinheiro' then 'cash'
      when 'Cartão de crédito' then 'credit_card'
      when 'Cartão alimentação/refeição' then 'food_card'
      else null
    end;
    if v_payment_code is null then raise exception 'invalid_payment'; end if;

    begin
      if coalesce(v_customer->>'id','')<>'' then
        v_customer_id:=(v_customer->>'id')::uuid;
        if not exists(select 1 from public.customers where id=v_customer_id) then v_customer_id:=null; end if;
      end if;
    exception when others then v_customer_id:=null;
    end;
    if v_customer_id is null then
      select id into v_customer_id
      from public.customers
      where primary_whatsapp_e164=v_phone
      limit 1;
    end if;
    if v_customer_id is null then
      select customer_id into v_customer_id
      from public.customer_phones
      where phone_e164=v_phone
      order by is_primary desc,created_at asc
      limit 1;
    end if;

    for v_line in select value from jsonb_array_elements(v_cart) loop
      if jsonb_typeof(v_line)<>'object' then raise exception 'item_must_be_object'; end if;
      if coalesce(v_line->>'type','product') not in ('product','basket') then raise exception 'invalid_item_type'; end if;
      begin
        v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
      exception when others then raise exception 'invalid_quantity';
      end;
      if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

      if coalesce(v_line->>'type','product')='product' then
        begin v_product_id:=(v_line->>'id')::uuid; exception when others then raise exception 'invalid_product_id'; end;
        select * into v_product from public.products where id=v_product_id and is_active=true;
        if not found or v_product.price is null or coalesce((select s.effective_sellable_stock from public.ops2_sellable_stock_v1 s where s.product_id=v_product.id),0)<=0 then raise exception 'product_unavailable'; end if;
        v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0 then v_product.offer_price else v_product.price end;
        v_line_total:=round(v_unit*v_line_qty,2);
        v_total:=v_total+v_line_total;
        v_fiscal:=v_fiscal+v_line_total;
        v_current_demand:=coalesce((v_demand->>v_product.id::text)::numeric,0)+v_line_qty;
        v_demand:=jsonb_set(v_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
        v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
          'product_id',v_product.id,
          'sku',v_product.sku,
          'name',v_product.name,
          'quantity',v_line_qty,
          'unit_price',v_unit,
          'line_total',v_line_total,
          'metadata',jsonb_build_object(
            'source','vitrine_direct',
            'history_kind','product',
            'image_url',coalesce(v_product.image_url,''),
            'regular_price',v_product.price,
            'offer_price',case when v_product.is_offer then v_product.offer_price else null end
          )
        ));
      else
        begin v_basket_id:=(v_line->>'id')::uuid; exception when others then raise exception 'invalid_basket_id'; end;
        select * into v_basket from public.basket_templates where id=v_basket_id and is_active=true;
        if not found then raise exception 'basket_unavailable'; end if;
        if v_first_basket is null then v_first_basket:=v_basket.id; end if;
        if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
        v_basket_unit:=coalesce(v_basket.base_price,0);
        if v_basket_unit<0 then raise exception 'basket_price_invalid'; end if;
        v_basket_fiscal_unit:=0;
        v_supplied:=jsonb_typeof(v_line->'components')='array' and jsonb_array_length(v_line->'components')>0;

        for v_bi in
          select * from public.basket_template_items
          where basket_id=v_basket_id
          order by sort_order,created_at
        loop
          select * into v_product from public.products where id=v_bi.product_id and is_active=true;
          if not found then raise exception 'basket_product_unavailable'; end if;
          v_base_qty:=v_bi.quantity;
          v_selected_qty:=v_base_qty;

          if v_supplied then
            v_selected:=null;
            select value into v_selected
            from jsonb_array_elements(v_line->'components')
            where value->>'product_id'=v_bi.product_id::text
            limit 1;
            if v_selected is null then
              v_selected_qty:=0;
            else
              begin v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,0);
              exception when others then raise exception 'invalid_basket_quantity'; end;
            end if;
          end if;

          if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;
          if v_selected_qty=0 and not v_bi.removable then raise exception 'item_not_removable'; end if;
          if v_selected_qty<v_base_qty and not (v_bi.removable or v_bi.quantity_editable) then raise exception 'quantity_not_editable'; end if;
          if v_selected_qty>v_base_qty and not v_bi.quantity_editable then raise exception 'quantity_not_editable'; end if;

          v_min:=greatest(0,coalesce(v_bi.min_quantity,case when v_bi.removable then 0 else v_base_qty end));
          v_max:=coalesce(v_bi.max_quantity,greatest(v_base_qty,floor(coalesce((select s.effective_sellable_stock from public.ops2_sellable_stock_v1 s where s.product_id=v_product.id),0))));
          if v_selected_qty<v_min or v_selected_qty>v_max then raise exception 'basket_quantity_out_of_range'; end if;

          v_delta:=0;
          if v_selected_qty<v_base_qty then
            if v_bi.remove_unit_delta is null and coalesce(v_product.price,0)<=0 then raise exception 'remove_pricing_not_configured'; end if;
            v_delta:=abs(v_selected_qty-v_base_qty)*coalesce(v_bi.remove_unit_delta,-v_product.price);
          elsif v_selected_qty>v_base_qty then
            if v_bi.add_unit_delta is null and coalesce(v_product.price,0)<=0 then raise exception 'add_pricing_not_configured'; end if;
            v_delta:=(v_selected_qty-v_base_qty)*coalesce(v_bi.add_unit_delta,v_product.price);
          end if;
          v_basket_unit:=v_basket_unit+v_delta;

          if v_selected_qty>0 then
            v_unit:=coalesce(v_product.price,0);
            v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
            v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
            v_current_demand:=coalesce((v_demand->>v_product.id::text)::numeric,0)+(v_selected_qty*v_line_qty);
            v_demand:=jsonb_set(v_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
            v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
              'product_id',v_product.id,
              'sku',v_product.sku,
              'name',v_product.name,
              'quantity',v_selected_qty*v_line_qty,
              'unit_price',v_unit,
              'line_total',v_line_total,
              'metadata',jsonb_build_object(
                'source','vitrine_direct',
                'history_kind','basket_component',
                'basket_id',v_basket.id,
                'basket_name',v_basket.name,
                'basket_quantity',v_line_qty,
                'base_quantity',v_base_qty,
                'selected_quantity',v_selected_qty,
                'commercial_delta_per_basket',v_delta,
                'image_url',coalesce(v_product.image_url,'')
              )
            ));
          end if;
        end loop;

        if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
        v_total:=v_total+round(v_basket_unit*v_line_qty,2);
        v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);
      end if;
    end loop;

    if v_total<75 then raise exception 'minimum_order'; end if;

    for v_pair in select key,value from jsonb_each_text(v_demand) loop
      perform 1 from public.products where id=v_pair.key::uuid and is_active=true for update; if not found then raise exception 'product_unavailable'; end if; select s.effective_sellable_stock into v_existing_stock from public.ops2_sellable_stock_v1 s where s.product_id=v_pair.key::uuid and s.is_active=true;
      if not found then raise exception 'product_unavailable'; end if;
      if coalesce(v_existing_stock,0)<v_pair.value::numeric then raise exception 'insufficient_stock'; end if;
    end loop;

    v_order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,8));
    v_addr:=jsonb_strip_nulls(jsonb_build_object(
      'customer_name',nullif(v_customer->>'display_name',''),
      'source_customer_id',v_customer_id,
      'phone',v_phone,
      'street',nullif(v_customer#>>'{address,street}',''),
      'number',nullif(v_customer#>>'{address,number}',''),
      'complement',nullif(v_customer#>>'{address,complement}',''),
      'district',coalesce(nullif(v_customer#>>'{address,district}',''),nullif(v_customer#>>'{address,neighborhood}','')),
      'city',nullif(v_customer#>>'{address,city}',''),
      'state',nullif(v_customer#>>'{address,state}',''),
      'postal_code',nullif(v_customer#>>'{address,postal_code}',''),
      'raw_text',nullif(v_customer#>>'{address,raw_text}',''),
      'google_maps_url',nullif(v_customer#>>'{address,google_maps_url}',''),
      'delivery_date',nullif(v_delivery->>'date',''),
      'delivery_label',nullif(v_delivery->>'label',''),
      'delivery_reason',nullif(v_delivery->>'reason',''),
      'delivery_time_zone',nullif(v_delivery->>'time_zone',''),
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
        'customer_id',v_customer_id,
        'name',nullif(v_customer->>'display_name',''),
        'phone_e164',v_phone,
        'status',case when v_customer_id is null then 'new' else 'registered' end
      )),
      null,now(),now(),
      case when array_length(v_basket_names,1)=1 then v_first_basket else null end,
      round(v_fiscal,2),greatest(round(v_total-v_fiscal,2),0),greatest(round(v_fiscal-v_total,2),0),
      'local','vitrine-direct:'||v_order_id::text,v_payment_code,v_phone,'vitrine',
      round(v_total,2),v_order_number,
      case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
      jsonb_build_object(
        'source','vitrine_direct',
        'cart',v_cart,
        'payment_label',v_payment_label,
        'delivery',v_delivery,
        'customer',v_customer,
        'basket_names',to_jsonb(v_basket_names)
      )
    );

    for v_line in select value from jsonb_array_elements(v_item_rows) loop
      insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
      values(
        v_order_id,
        (v_line->>'product_id')::uuid,
        nullif(v_line->>'sku',''),
        v_line->>'name',
        (v_line->>'quantity')::numeric,
        (v_line->>'unit_price')::numeric,
        (v_line->>'line_total')::numeric,
        coalesce(v_line->'metadata','{}'::jsonb)
      );
    end loop;

    return jsonb_build_object(
      'order_id',v_order_id,
      'order_number',v_order_number,
      'total_cents',round(v_total*100)::bigint,
      'total',round(v_total,2),
      'customer_id',v_customer_id,
      'phone_e164',v_phone,
      'payment_method',v_payment_label
    );
  end;
  $function$
;
