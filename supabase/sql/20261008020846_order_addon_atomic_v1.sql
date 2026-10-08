create or replace function public.ops3_add_items_to_existing_order_v1(
  p_token_hash text,
  p_request_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token_hash text:=lower(trim(coalesce(p_token_hash,'')));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_runtime private.order_addon_runtime_v1%rowtype;
  v_session private.order_addon_sessions_v1%rowtype;
  v_order public.orders%rowtype;
  v_existing_op private.order_addon_operations_v1%rowtype;
  v_product public.products%rowtype;
  v_existing_item public.order_items%rowtype;
  v_line jsonb;
  v_pair record;
  v_product_id uuid;
  v_qty numeric;
  v_aggregate_qty numeric;
  v_demand jsonb:='{}'::jsonb;
  v_normalized_items jsonb:='[]'::jsonb;
  v_distinct_count integer:=0;
  v_fingerprint text;
  v_unit numeric;
  v_added_total numeric(14,2):=0;
  v_added_items jsonb:='[]'::jsonb;
  v_reservation jsonb;
  v_result jsonb;
  v_old_total numeric(14,2);
  v_new_total numeric(14,2);
  v_line_id uuid;
  v_operation_count integer;
begin
  if v_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','invalid_token'); end if;
  if v_request_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' then return jsonb_build_object('ok',false,'error','invalid_request_key'); end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then return jsonb_build_object('ok',false,'error','items_required'); end if;
  if jsonb_array_length(p_items)>40 then return jsonb_build_object('ok',false,'error','too_many_items'); end if;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_line)<>'object' then return jsonb_build_object('ok',false,'error','item_must_be_object'); end if;
    if exists(select 1 from jsonb_object_keys(v_line) as k(key) where k.key not in ('product_id','quantity')) then
      return jsonb_build_object('ok',false,'error','invalid_item_fields');
    end if;
    begin v_product_id:=(v_line->>'product_id')::uuid;
    exception when others then return jsonb_build_object('ok',false,'error','invalid_product_id'); end;
    begin v_qty:=(v_line->>'quantity')::numeric;
    exception when others then return jsonb_build_object('ok',false,'error','invalid_quantity','product_id',v_product_id); end;
    if v_qty<=0 or v_qty>30 or trunc(v_qty)<>v_qty then return jsonb_build_object('ok',false,'error','invalid_quantity','product_id',v_product_id); end if;
    v_aggregate_qty:=coalesce((v_demand->>v_product_id::text)::numeric,0)+v_qty;
    if v_aggregate_qty>30 then return jsonb_build_object('ok',false,'error','quantity_limit_exceeded','product_id',v_product_id); end if;
    v_demand:=jsonb_set(v_demand,array[v_product_id::text],to_jsonb(v_aggregate_qty),true);
  end loop;

  select count(*) into v_distinct_count from jsonb_object_keys(v_demand);
  select coalesce(jsonb_agg(jsonb_build_object('product_id',e.key,'quantity',e.value::numeric) order by e.key),'[]'::jsonb)
  into v_normalized_items from jsonb_each_text(v_demand) e;

  v_fingerprint:=encode(extensions.digest(convert_to(v_normalized_items::text,'UTF8'),'sha256'),'hex');

  select * into v_session from private.order_addon_sessions_v1 where token_hash=v_token_hash for update;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;

  select * into v_existing_op
  from private.order_addon_operations_v1
  where session_id=v_session.id and request_key=v_request_key;

  if found then
    if v_existing_op.payload_fingerprint<>v_fingerprint then return jsonb_build_object('ok',false,'error','idempotency_key_reused'); end if;
    if v_existing_op.status='applied' then return coalesce(v_existing_op.result,'{}'::jsonb)||jsonb_build_object('idempotent_replay',true); end if;
    if v_existing_op.status='rejected' then return coalesce(v_existing_op.result,'{}'::jsonb)||jsonb_build_object('idempotent_replay',true); end if;
    return jsonb_build_object('ok',false,'error','operation_in_progress');
  end if;

  select * into v_runtime from private.order_addon_runtime_v1 where singleton;
  if not found or coalesce(v_runtime.enabled,false) is not true then return jsonb_build_object('ok',false,'error','feature_disabled'); end if;
  if v_distinct_count>v_runtime.max_distinct_products_per_operation then
    return jsonb_build_object('ok',false,'error','too_many_distinct_products','max',v_runtime.max_distinct_products_per_operation);
  end if;

  if v_session.status<>'open' then return jsonb_build_object('ok',false,'error','session_closed'); end if;
  if now()>=v_session.expires_at then return jsonb_build_object('ok',false,'error','session_expired'); end if;
  if v_session.operation_count>=v_session.max_operations then return jsonb_build_object('ok',false,'error','operation_limit_reached'); end if;

  select * into v_order from public.orders where id=v_session.order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if coalesce(v_order.source,'') not in ('vitrine','storefront_v2') then return jsonb_build_object('ok',false,'error','order_source_not_supported'); end if;
  if coalesce(v_order.status,'')<>'storefront_received' then return jsonb_build_object('ok',false,'error','order_status_closed','status',v_order.status); end if;
  if v_order.confirmed_at is not null then return jsonb_build_object('ok',false,'error','order_already_confirmed'); end if;
  if v_order.bling_order_id is not null or v_order.bling_synced_at is not null or coalesce(v_order.sync_status,'local')<>'local' then
    return jsonb_build_object('ok',false,'error','bling_sync_started');
  end if;
  if exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=v_order.id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=v_order.id)
     or exists(select 1 from public.order_separation_completions_v1 x where x.order_id=v_order.id) then
    return jsonb_build_object('ok',false,'error','separation_started');
  end if;
  if exists(select 1 from public.vitrine_stock_reservations x where x.order_id=v_order.id and x.status='consumed') then
    return jsonb_build_object('ok',false,'error','stock_already_consumed');
  end if;

  for v_pair in select key,value from jsonb_each_text(v_demand) order by key
  loop
    v_product_id:=v_pair.key::uuid;
    select * into v_product from public.products where id=v_product_id and is_active=true for update;
    if not found or v_product.price is null or v_product.price<0 then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',v_product_id);
    end if;
    v_unit:=round(case when coalesce(v_product.is_offer,false) and v_product.offer_price is not null and v_product.offer_price>=0
                        then v_product.offer_price else v_product.price end,2);
    if v_unit<0 then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',v_product_id); end if;
  end loop;

  insert into private.order_addon_operations_v1(session_id,order_id,request_key,payload_fingerprint,status,result)
  values(v_session.id,v_order.id,v_request_key,v_fingerprint,'pending','{}'::jsonb);

  v_old_total:=round(coalesce(v_order.total,0),2);

  for v_pair in select key,value from jsonb_each_text(v_demand) order by key
  loop
    v_product_id:=v_pair.key::uuid;
    v_qty:=v_pair.value::numeric;
    select * into v_product from public.products where id=v_product_id and is_active=true;
    v_unit:=round(case when coalesce(v_product.is_offer,false) and v_product.offer_price is not null and v_product.offer_price>=0
                        then v_product.offer_price else v_product.price end,2);

    select * into v_existing_item
    from public.order_items
    where order_id=v_order.id
      and product_id=v_product_id
      and coalesce(metadata->>'history_kind','product')='product'
      and coalesce(metadata->>'basket_id','')=''
      and unit_price=v_unit
    order by case when metadata->>'source'='order_addon' then 0 else 1 end,created_at,id
    limit 1 for update;

    if found then
      v_line_id:=v_existing_item.id;
      update public.order_items
      set quantity=quantity+v_qty,
          line_total=round(unit_price*(quantity+v_qty),2),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'addon_last_session_id',v_session.id,'addon_last_request_key',v_request_key,'addon_last_at',now()
          ),
          updated_at=now()
      where id=v_line_id;
    else
      insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
      values(
        v_order.id,v_product.id,v_product.sku,v_product.name,v_qty,v_unit,round(v_unit*v_qty,2),
        jsonb_build_object(
          'source','order_addon','history_kind','product','image_url',coalesce(v_product.image_url,''),
          'addon_session_id',v_session.id,'addon_request_key',v_request_key,'addon_added_at',now()
        )
      ) returning id into v_line_id;
    end if;

    v_added_total:=round(v_added_total+round(v_unit*v_qty,2),2);
    v_added_items:=v_added_items||jsonb_build_array(jsonb_build_object(
      'order_item_id',v_line_id,'product_id',v_product.id,'name',v_product.name,
      'quantity_added',v_qty,'unit_price',v_unit,'line_total_added',round(v_unit*v_qty,2)
    ));
  end loop;

  update public.orders
  set total=round(coalesce(total,0)+v_added_total,2),
      subtotal=round(coalesce(subtotal,total,0)+v_added_total,2),
      fiscal_subtotal=round(coalesce(fiscal_subtotal,subtotal,total,0)+v_added_total,2),
      checkout_snapshot=jsonb_set(
        coalesce(checkout_snapshot,'{}'::jsonb),'{order_addon}',
        coalesce(checkout_snapshot->'order_addon','{}'::jsonb)||jsonb_build_object(
          'last_at',now(),'last_request_key',v_request_key,'last_added_total',v_added_total
        ),true
      ),
      updated_at=now()
  where id=v_order.id
  returning total into v_new_total;

  v_reservation:=public.reserve_vitrine_order_stock_v1(v_order.id);
  if coalesce((v_reservation->>'ok')::boolean,false) is not true then
    raise exception 'stock_reservation_failed:%',coalesce(v_reservation->>'error','unknown') using errcode='P0001';
  end if;

  perform public.ops2_refresh_order_public_snapshot_v1(v_order.id);

  update private.order_addon_sessions_v1
  set operation_count=operation_count+1,updated_at=now()
  where id=v_session.id
  returning operation_count into v_operation_count;

  v_result:=jsonb_build_object(
    'ok',true,'order_id',v_order.id,'order_number',v_order.order_number,'previous_total',v_old_total,
    'added_total',v_added_total,'total',v_new_total,'added_items',v_added_items,
    'operation_count',v_operation_count,'max_operations',v_session.max_operations,
    'expires_at',v_session.expires_at,'reservation_status',coalesce(v_reservation->>'status','reserved'),
    'idempotent_replay',false
  );

  update private.order_addon_operations_v1
  set status='applied',result=v_result,completed_at=now()
  where session_id=v_session.id and request_key=v_request_key;

  begin
    perform public.ops_record_event_v1(
      'order','order.addon_items_added','Itens acrescentados ao pedido existente.','customer',
      'order',v_order.id::text,v_order.id::text,null,null,'dona_antonia','info',
      jsonb_build_object(
        'session_id',v_session.id,'request_key',v_request_key,'distinct_products',v_distinct_count,
        'added_total',v_added_total,'new_total',v_new_total
      ),
      null,'order-addon:'||v_session.id::text||':'||v_request_key,now()
    );
  exception when others then null;
  end;

  return v_result;
end;
$$;

revoke all on function public.ops3_add_items_to_existing_order_v1(text,text,jsonb) from public;
revoke execute on function public.ops3_add_items_to_existing_order_v1(text,text,jsonb) from anon;
revoke execute on function public.ops3_add_items_to_existing_order_v1(text,text,jsonb) from authenticated;
grant execute on function public.ops3_add_items_to_existing_order_v1(text,text,jsonb) to service_role;
