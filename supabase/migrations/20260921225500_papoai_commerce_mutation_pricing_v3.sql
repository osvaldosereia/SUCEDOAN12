begin;

create or replace function public.start_papoai_commerce_basket_v1(
  p_conversation_id uuid,
  p_basket_query text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_detail jsonb;
  v_basket_id uuid;
  v_started jsonb;
  v_cart_id uuid;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  v_detail:=public.get_papoai_commerce_basket_detail_v1(p_basket_query);
  if not coalesce((v_detail->>'found')::boolean,false) then return v_detail; end if;
  v_basket_id:=(v_detail#>>'{basket,id}')::uuid;

  v_started:=public.start_basket_cart(p_conversation_id,v_basket_id);
  v_cart_id:=(v_started->>'cart_id')::uuid;
  perform public.recalculate_papoai_commerce_cart_v1(v_cart_id);

  return jsonb_build_object(
    'ok',true,
    'basket',v_detail->'basket',
    'cart',public.get_papoai_commerce_cart_state_v1(p_conversation_id)
  );
end;
$$;

create or replace function public.set_papoai_commerce_basket_quantity_v1(
  p_conversation_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart public.carts%rowtype;
  v_item public.cart_items%rowtype;
  v_template public.basket_template_items%rowtype;
  v_diff numeric;
  v_unit_delta numeric;
  v_delta numeric:=0;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  if p_quantity is null or p_quantity<0 or trunc(p_quantity)<>p_quantity then
    raise exception 'invalid_quantity';
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select * into v_item
  from public.cart_items
  where cart_id=v_cart.id and product_id=p_product_id and source='basket'
  limit 1
  for update;
  if not found then raise exception 'basket_item_not_found'; end if;

  select * into v_template
  from public.basket_template_items
  where id=nullif(v_item.metadata->>'basket_template_item_id','')::uuid;
  if not found then raise exception 'basket_template_item_not_found'; end if;

  if p_quantity=0 and not v_template.removable then raise exception 'item_not_removable'; end if;
  if p_quantity<>v_template.quantity and not v_template.quantity_editable then raise exception 'quantity_not_editable'; end if;
  if p_quantity<coalesce(v_template.min_quantity,case when v_template.removable then 0 else v_template.quantity end) then
    raise exception 'below_min_quantity';
  end if;
  if p_quantity>coalesce(v_template.max_quantity,greatest(v_template.quantity,20)) then
    raise exception 'above_max_quantity';
  end if;

  v_diff:=p_quantity-v_template.quantity;
  if v_diff<0 then
    v_unit_delta:=case
      when v_template.remove_unit_delta is null then -coalesce(v_item.unit_price,0)
      when v_template.remove_unit_delta>0 then -v_template.remove_unit_delta
      else v_template.remove_unit_delta
    end;
    if v_unit_delta=0 and coalesce(v_item.unit_price,0)<=0 then raise exception 'remove_pricing_not_configured'; end if;
    v_delta:=abs(v_diff)*v_unit_delta;
  elsif v_diff>0 then
    v_unit_delta:=coalesce(v_template.add_unit_delta,v_item.unit_price);
    if v_unit_delta is null or v_unit_delta<=0 then raise exception 'add_pricing_not_configured'; end if;
    v_delta:=v_diff*v_unit_delta;
  end if;

  update public.cart_items
     set quantity=p_quantity,
         commercial_delta=v_delta,
         updated_at=now()
   where id=v_item.id;

  perform public.recalculate_papoai_commerce_cart_v1(v_cart.id);
  return public.get_papoai_commerce_cart_state_v1(p_conversation_id);
end;
$$;

create or replace function public.set_papoai_commerce_addon_quantity_v1(
  p_conversation_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart public.carts%rowtype;
  v_product public.products%rowtype;
  v_commercial_price numeric;
  v_stock integer;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  if p_quantity is null or p_quantity<0 or trunc(p_quantity)<>p_quantity or p_quantity>6 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select * into v_product
  from public.products
  where id=p_product_id
    and physically_verified=true
    and is_active=true
    and is_whatsapp_active=true
    and coalesce(price,0)>0;
  if not found then raise exception 'product_not_available'; end if;

  v_stock:=greatest(0,floor(coalesce(v_product.stock,0))::integer);
  if p_quantity>least(6,v_stock) then raise exception 'quantity_exceeds_stock'; end if;

  if exists(
    select 1 from public.cart_items
    where cart_id=v_cart.id and product_id=p_product_id
      and source in ('basket','substitution') and quantity>0
  ) then raise exception 'product_already_in_basket'; end if;

  v_commercial_price:=case
    when v_product.is_offer
      and coalesce(v_product.offer_price,0)>0
      and v_product.offer_price<=v_product.price
      then v_product.offer_price
    else v_product.price
  end;

  delete from public.cart_items
  where cart_id=v_cart.id and product_id=p_product_id and source='addon';

  if p_quantity>0 then
    insert into public.cart_items(
      cart_id,product_id,source,quantity,unit_price,line_total,
      commercial_unit_price,metadata
    ) values(
      v_cart.id,v_product.id,'addon',p_quantity,v_commercial_price,
      p_quantity*v_commercial_price,v_commercial_price,
      jsonb_build_object(
        'pricing_source',case when v_commercial_price<>v_product.price then 'offer_price' else 'product_price' end,
        'regular_price',v_product.price,
        'commercial_price',v_commercial_price,
        'offer_discount_unit',greatest(0,v_product.price-v_commercial_price),
        'stock_at_write',v_stock,
        'source','papoai_commerce'
      )
    );
  end if;

  perform public.recalculate_papoai_commerce_cart_v1(v_cart.id);
  return public.get_papoai_commerce_cart_state_v1(p_conversation_id);
end;
$$;

create or replace function public.replace_papoai_commerce_basket_item_v1(
  p_conversation_id uuid,
  p_source_product_id uuid,
  p_replacement_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart public.carts%rowtype;
  v_source public.cart_items%rowtype;
  v_source_product public.products%rowtype;
  v_target public.products%rowtype;
  v_target_commercial numeric;
  v_qty numeric;
  v_source_base numeric;
  v_source_price numeric;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;
  if p_source_product_id=p_replacement_product_id then raise exception 'replacement_same_product'; end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select * into v_source
  from public.cart_items
  where cart_id=v_cart.id
    and product_id=p_source_product_id
    and source='basket'
    and quantity>0
  limit 1
  for update;
  if not found then raise exception 'basket_source_product_not_found'; end if;

  select * into v_source_product from public.products where id=p_source_product_id;
  if not found then raise exception 'source_product_missing'; end if;

  select * into v_target
  from public.products
  where id=p_replacement_product_id
    and physically_verified=true
    and is_active=true
    and is_whatsapp_active=true
    and coalesce(price,0)>0
    and coalesce(stock,0)>0;
  if not found then raise exception 'replacement_product_unavailable'; end if;

  v_qty:=v_source.quantity;
  if v_target.stock<v_qty then raise exception 'replacement_insufficient_stock'; end if;

  if exists(
    select 1 from public.cart_items
    where cart_id=v_cart.id and product_id=p_replacement_product_id and quantity>0
  ) then raise exception 'replacement_already_in_cart'; end if;

  v_source_base:=coalesce(v_source.base_quantity,v_source.quantity);
  v_source_price:=coalesce(v_source.unit_price,0);
  if v_source_price<=0 then raise exception 'source_price_missing'; end if;

  v_target_commercial:=case
    when v_target.is_offer
      and coalesce(v_target.offer_price,0)>0
      and v_target.offer_price<=v_target.price
      then v_target.offer_price
    else v_target.price
  end;

  update public.cart_items
     set quantity=0,
         commercial_delta=-(v_source_base*v_source_price),
         updated_at=now()
   where id=v_source.id;

  insert into public.cart_items(
    cart_id,product_id,source,quantity,base_quantity,unit_price,line_total,
    commercial_delta,commercial_unit_price,metadata
  ) values(
    v_cart.id,v_target.id,'substitution',v_qty,0,v_target_commercial,
    v_qty*v_target_commercial,v_qty*v_target_commercial,v_target_commercial,
    jsonb_build_object(
      'substitution',true,
      'replaces_product_id',v_source_product.id,
      'replaces_product_name',v_source_product.name,
      'replacement_product_id',v_target.id,
      'replacement_product_name',v_target.name,
      'regular_price',v_target.price,
      'commercial_price',v_target_commercial,
      'offer_discount_unit',greatest(0,v_target.price-v_target_commercial),
      'source','papoai_commerce'
    )
  );

  perform public.recalculate_papoai_commerce_cart_v1(v_cart.id);
  return public.get_papoai_commerce_cart_state_v1(p_conversation_id);
end;
$$;

revoke all on function public.start_papoai_commerce_basket_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.start_papoai_commerce_basket_v1(uuid,text) to service_role;
revoke all on function public.set_papoai_commerce_basket_quantity_v1(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_basket_quantity_v1(uuid,uuid,numeric) to service_role;
revoke all on function public.set_papoai_commerce_addon_quantity_v1(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_addon_quantity_v1(uuid,uuid,numeric) to service_role;
revoke all on function public.replace_papoai_commerce_basket_item_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_papoai_commerce_basket_item_v1(uuid,uuid,uuid) to service_role;

commit;
