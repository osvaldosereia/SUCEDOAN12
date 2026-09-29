
-- Dona Antonia · motor de pedidos para cestas pre-montadas v2

create or replace function public.create_vitrine_cart_order_v1(
  p_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path to ''
as $function$
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
  v_basket public.basket_templates%rowtype;
  v_product public.products%rowtype;
  v_lot public.basket_stock_lots%rowtype;
  v_li record;
  v_product_id uuid;
  v_basket_id uuid;
  v_lot_id uuid;
  v_line_qty numeric;
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
  v_loose_demand jsonb:='{}'::jsonb;
  v_item_rows jsonb:='[]'::jsonb;
  v_alloc_rows jsonb:='[]'::jsonb;
  v_lot_demand jsonb:='{}'::jsonb;
  v_selected jsonb;
  v_supplied boolean;
  v_current_demand numeric;
  v_pair record;
  v_existing_stock numeric;
  v_first_basket uuid:=null;
  v_basket_names text[]:='{}'::text[];
  v_addr jsonb;
  v_preassembled_units numeric;
  v_extra_units numeric;
  v_lot_requested integer;
  v_component_snapshot jsonb;
begin
  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then raise exception 'cart_empty'; end if;
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
    select id into v_customer_id from public.customers where primary_whatsapp_e164=v_phone limit 1;
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
    begin v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
    exception when others then raise exception 'invalid_quantity'; end;
    if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

    if coalesce(v_line->>'type','product')='product' then
      begin v_product_id:=(v_line->>'id')::uuid; exception when others then raise exception 'invalid_product_id'; end;
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
          'image_url',coalesce(v_product.image_url,''),
          'regular_price',v_product.price,
          'offer_price',case when v_product.is_offer then v_product.offer_price else null end
        )
      ));
    else
      begin v_basket_id:=(v_line->>'id')::uuid; exception when others then raise exception 'invalid_basket_id'; end;
      select * into v_basket from public.basket_templates where id=v_basket_id and is_active=true;
      if not found then raise exception 'basket_unavailable'; end if;

      begin v_lot_id:=nullif(v_line->>'lot_id','')::uuid;
      exception when others then v_lot_id:=null; end;

      if v_lot_id is not null then
        select * into v_lot
        from public.basket_stock_lots
        where id=v_lot_id and basket_id=v_basket_id and status='ready' and quantity_available>0
        for update;
      else
        select * into v_lot
        from public.basket_stock_lots
        where basket_id=v_basket_id and status='ready' and quantity_available>0
        order by built_at,created_at,id
        limit 1
        for update;
      end if;
      if not found then raise exception 'basket_lot_unavailable'; end if;

      v_lot_requested:=coalesce((v_lot_demand->>v_lot.id::text)::integer,0)+v_line_qty::integer;
      if v_lot_requested>v_lot.quantity_available then raise exception 'basket_lot_insufficient'; end if;
      v_lot_demand:=jsonb_set(v_lot_demand,array[v_lot.id::text],to_jsonb(v_lot_requested),true);

      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_basket_unit:=coalesce(v_basket.base_price,0);
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
        where li.lot_id=v_lot.id
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
        if v_selected_qty>v_base_qty and not coalesce(v_li.quantity_editable,true) then
          raise exception 'quantity_not_editable';
        end if;

        select coalesce(loose_sellable_stock,0) into v_existing_stock
        from public.ops2_loose_sellable_stock_v1
        where product_id=v_product.id;
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
          v_extra_units:=greatest(v_selected_qty-v_base_qty,0)*v_line_qty;
          if v_extra_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_extra_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;
          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'basket_lot_id',v_lot.id,'basket_lot_code',v_lot.lot_code,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_extra_quantity',v_extra_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,''),
              'template_product_id',v_li.template_product_id
            )
          ));
        end if;
      end loop;

      if v_supplied and exists(
        select 1
        from jsonb_array_elements(v_line->'components') c
        where coalesce(c->>'product_id','')<>''
          and not exists(
            select 1 from public.basket_stock_lot_items li
            where li.lot_id=v_lot.id and li.product_id::text=c->>'product_id'
          )
      ) then raise exception 'basket_component_not_in_lot'; end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id',li.product_id,'quantity_per_basket',li.quantity_per_basket,
        'source_template_item_id',li.source_template_item_id
      ) order by li.position_order,li.created_at),'[]'::jsonb)
      into v_component_snapshot
      from public.basket_stock_lot_items li
      where li.lot_id=v_lot.id;

      v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'lot_id',v_lot.id,'quantity',v_line_qty,
        'component_snapshot',v_component_snapshot
      ));

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);
    end if;
  end loop;

  if v_total<75 then raise exception 'minimum_order'; end if;

  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid and is_active=true for update;
    if not found then raise exception 'product_unavailable'; end if;
    select loose_sellable_stock into v_existing_stock
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_pair.key::uuid and is_active=true;
    if not found then raise exception 'product_unavailable'; end if;
    if coalesce(v_existing_stock,0)<v_pair.value::numeric then raise exception 'insufficient_stock'; end if;
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
    'local','vitrine-direct:'||v_order_id::text,v_payment_code,v_phone,'vitrine',
    round(v_total,2),v_order_number,
    case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
    jsonb_build_object(
      'source','vitrine_direct','cart',v_cart,'payment_label',v_payment_label,
      'delivery',v_delivery,'customer',v_customer,'basket_names',to_jsonb(v_basket_names),
      'preassembled_baskets',jsonb_array_length(v_alloc_rows)>0
    )
  );

  for v_line in select value from jsonb_array_elements(v_item_rows) loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,(v_line->>'product_id')::uuid,nullif(v_line->>'sku',''),v_line->>'name',
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
       and quantity_available>=(v_line->>'quantity')::integer;
    if not found then raise exception 'basket_lot_insufficient'; end if;

    insert into public.basket_stock_allocations(
      order_id,basket_id,lot_id,quantity,status,component_snapshot,metadata
    ) values(
      v_order_id,(v_line->>'basket_id')::uuid,(v_line->>'lot_id')::uuid,
      (v_line->>'quantity')::integer,'allocated',
      coalesce(v_line->'component_snapshot','[]'::jsonb),
      jsonb_build_object('source','order_create','preassembled',true)
    )
    on conflict(order_id,lot_id) do update
      set quantity=public.basket_stock_allocations.quantity+excluded.quantity,
          component_snapshot=excluded.component_snapshot;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'total_cents',round(v_total*100)::bigint,'total',round(v_total,2),
    'customer_id',v_customer_id,'phone_e164',v_phone,'payment_method',v_payment_label,
    'preassembled_baskets',jsonb_array_length(v_alloc_rows)>0
  );
end;
$function$;

create or replace function public.reserve_vitrine_order_stock_v1(p_order_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  r record;
  v_authority text;
  v_effective numeric;
  v_pending_local numeric;
  v_available numeric;
  v_demand_count integer:=0;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  if p_order_id is null or not exists(
    select 1 from public.orders
    where id=p_order_id and source in ('vitrine','manual_whatsapp','papoai','reorder')
  ) then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  if exists(select 1 from public.vitrine_stock_reservations where order_id=p_order_id and status='consumed') then
    return jsonb_build_object('ok',true,'status','already_consumed','stock_authority',v_authority);
  end if;

  for r in
    select oi.product_id,
      sum(case
        when coalesce(oi.metadata->>'history_kind','')='basket_component'
          then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
        else oi.quantity
      end) as quantity
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id is not null
    group by oi.product_id
    having sum(case
      when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
      else oi.quantity
    end)>0
    order by oi.product_id
  loop
    v_demand_count:=v_demand_count+1;
    perform 1 from public.products p where p.id=r.product_id and p.is_active=true for update;
    if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;

    if v_authority='bling' then
      select s.loose_sellable_stock into v_effective
      from public.ops2_loose_sellable_stock_v1 s
      where s.product_id=r.product_id and s.is_active=true and s.bling_stock_ready=true;
      if not found then return jsonb_build_object('ok',false,'error','bling_stock_unavailable','product_id',r.product_id); end if;

      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      join public.orders o on o.id=x.order_id
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now()
        and x.order_id<>p_order_id and (o.bling_synced_at is null or o.sync_status<>'sent_to_bling');
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    else
      select greatest(0,coalesce(p.stock,0)-coalesce(l.basket_locked_quantity,0))
        into v_effective
      from public.products p
      left join public.basket_locked_component_stock_v1 l on l.product_id=p.id
      where p.id=r.product_id and p.is_active=true;
      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now() and x.order_id<>p_order_id;
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    end if;

    if v_available<r.quantity then
      return jsonb_build_object('ok',false,'error','insufficient_stock','product_id',r.product_id,
        'available',v_available,'requested',r.quantity,'stock_authority',v_authority);
    end if;
  end loop;

  if v_demand_count=0 then
    return jsonb_build_object('ok',true,'status','preassembled_only','stock_authority',v_authority,
      'local_reservation_tracking',true,'physical_stock_changed',false);
  end if;

  insert into public.vitrine_stock_reservations(order_id,product_id,quantity,status,expires_at,updated_at)
  select p_order_id,oi.product_id,
    sum(case
      when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
      else oi.quantity
    end),
    'reserved',now()+interval '48 hours',now()
  from public.order_items oi
  where oi.order_id=p_order_id and oi.product_id is not null
  group by oi.product_id
  having sum(case
    when coalesce(oi.metadata->>'history_kind','')='basket_component'
      then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
    else oi.quantity
  end)>0
  on conflict(order_id,product_id) do update
    set quantity=excluded.quantity,status='reserved',expires_at=excluded.expires_at,
        updated_at=now(),consumed_at=null,released_at=null;

  return jsonb_build_object('ok',true,'status','reserved','stock_authority',v_authority,
    'local_reservation_tracking',true,'physical_stock_changed',false);
end;
$function$;

create or replace function public.consume_vitrine_order_stock_v1(p_order_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  r record;
  v_authority text;
  v_count int;
  v_consumed int;
  v_released int;
  v_stock numeric;
  v_has_basket boolean;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority from public.bling_hub_runtime_v2 where id=1;

  select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
    into v_count,v_consumed,v_released
  from public.vitrine_stock_reservations where order_id=p_order_id;

  select exists(
    select 1 from public.basket_stock_allocations
    where order_id=p_order_id and status in ('allocated','consumed')
  ) into v_has_basket;

  if v_count=0 then
    if v_has_basket then
      return jsonb_build_object('ok',true,'status','preassembled_only','already_consumed',false,
        'local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false);
    end if;
    return jsonb_build_object('ok',false,'error','stock_reservation_not_found');
  end if;

  if v_consumed=v_count then
    return jsonb_build_object('ok',true,'status',case when v_authority='bling' then 'bling_authority' else 'consumed' end,
      'already_consumed',true,'local_consume_skipped',v_authority='bling','reservations_consumed',true);
  end if;
  if v_released>0 then return jsonb_build_object('ok',false,'error','stock_reservation_released'); end if;

  if v_authority='bling' then
    update public.vitrine_stock_reservations
       set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
     where order_id=p_order_id and status='reserved';
    return jsonb_build_object('ok',true,'status','bling_authority','already_consumed',false,
      'local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false);
  end if;

  for r in
    select product_id,quantity from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved'
    order by product_id for update
  loop
    select stock into v_stock from public.products where id=r.product_id and is_active=true for update;
    if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;
    if coalesce(v_stock,0)<r.quantity then
      return jsonb_build_object('ok',false,'error','insufficient_physical_stock','product_id',r.product_id,
        'available',coalesce(v_stock,0),'requested',r.quantity);
    end if;
  end loop;

  for r in
    select product_id,quantity from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved' order by product_id
  loop
    update public.products set stock=stock-r.quantity,updated_at=now() where id=r.product_id;
  end loop;

  update public.vitrine_stock_reservations
     set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
   where order_id=p_order_id and status='reserved';

  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false,'physical_stock_changed',true);
end;
$function$;

revoke all on function public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.reserve_vitrine_order_stock_v1(uuid) from public,anon,authenticated;
grant execute on function public.reserve_vitrine_order_stock_v1(uuid) to service_role;
revoke all on function public.consume_vitrine_order_stock_v1(uuid) from public,anon,authenticated;
grant execute on function public.consume_vitrine_order_stock_v1(uuid) to service_role;

