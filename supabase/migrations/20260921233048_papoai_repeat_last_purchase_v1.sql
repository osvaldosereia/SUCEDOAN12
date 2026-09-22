begin;

alter table public.papoai_commerce_pending_actions
  drop constraint if exists papoai_commerce_pending_actions_action_type_check;

alter table public.papoai_commerce_pending_actions
  add constraint papoai_commerce_pending_actions_action_type_check
  check(action_type in ('replace_basket_item','confirm_order','repeat_last_purchase'));

create or replace function public.preview_papoai_commerce_repeat_last_purchase_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_order public.orders%rowtype;
  v_basket public.basket_templates%rowtype;
  v_addons jsonb:='[]'::jsonb;
  v_basket_changes jsonb:='[]'::jsonb;
  v_addon_total numeric:=0;
  v_basket_delta numeric:=0;
  v_unavailable_addons integer:=0;
  v_adjusted_addons integer:=0;
  v_skipped_basket_changes integer:=0;
  v_substitutions integer:=0;
begin
  select * into v_conv
  from public.conversations
  where id=p_conversation_id;

  if not found then return jsonb_build_object('available',false,'reason','conversation_not_found'); end if;
  if v_conv.customer_id is null then return jsonb_build_object('available',false,'reason','customer_not_identified'); end if;

  select * into v_order
  from public.orders
  where customer_id=v_conv.customer_id
    and public.is_customer_purchase_valid_v1(status,cancelled_at,returned_at)
  order by coalesce(confirmed_at,created_at) desc,created_at desc,id desc
  limit 1;

  if not found then return jsonb_build_object('available',false,'reason','no_purchase_history'); end if;
  if v_order.basket_id is null then
    return jsonb_build_object(
      'available',false,'reason','last_purchase_without_basket',
      'order_id',v_order.id,'order_number',v_order.order_number,
      'ordered_at',coalesce(v_order.confirmed_at,v_order.created_at)
    );
  end if;

  select * into v_basket
  from public.basket_templates
  where id=v_order.basket_id
    and is_active=true
    and is_whatsapp_active=true;

  if not found then
    return jsonb_build_object(
      'available',false,'reason','basket_not_available',
      'order_id',v_order.id,'order_number',v_order.order_number,
      'basket_id',v_order.basket_id,
      'basket_name',coalesce(v_order.basket_name_snapshot,'Cesta básica')
    );
  end if;

  with historical_addons as (
    select oi.product_id,oi.quantity,
           p.name,p.price,p.offer_price,p.is_offer,p.stock,
           p.physically_verified,p.is_active,p.is_whatsapp_active,
           coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url
    from public.order_items oi
    left join public.products p on p.id=oi.product_id
    where oi.order_id=v_order.id
      and coalesce(oi.metadata->>'source','')='addon'
  ), normalized as (
    select *,
      (
        product_id is not null
        and physically_verified=true
        and is_active=true
        and is_whatsapp_active=true
        and coalesce(stock,0)>0
        and coalesce(price,0)>0
      ) available,
      case
        when product_id is not null
         and physically_verified=true
         and is_active=true
         and is_whatsapp_active=true
         and coalesce(stock,0)>0
         and coalesce(price,0)>0
        then least(greatest(0,quantity),least(6,floor(stock)))::numeric
        else 0::numeric
      end repeat_quantity,
      case
        when is_offer=true and coalesce(offer_price,0)>0 and offer_price<=price then offer_price
        else price
      end commercial_price
    from historical_addons
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',product_id,
      'name',coalesce(name,'Produto'),
      'historical_quantity',quantity,
      'repeat_quantity',repeat_quantity,
      'available',available,
      'stock',coalesce(stock,0),
      'commercial_price',coalesce(commercial_price,0),
      'is_offer',coalesce(is_offer,false),
      'image_url',image_url,
      'adjusted',available and repeat_quantity<>quantity
    ) order by name),'[]'::jsonb),
    coalesce(sum(case when available then repeat_quantity*coalesce(commercial_price,0) else 0 end),0),
    count(*) filter(where not available)::integer,
    count(*) filter(where available and repeat_quantity<>quantity)::integer
  into v_addons,v_addon_total,v_unavailable_addons,v_adjusted_addons
  from normalized;

  with historical_basket as (
    select
      oi.product_id,
      oi.quantity historical_quantity,
      bi.id template_item_id,
      bi.quantity template_quantity,
      bi.removable,
      bi.quantity_editable,
      bi.min_quantity,
      bi.max_quantity,
      bi.remove_unit_delta,
      bi.add_unit_delta,
      p.name,
      p.price
    from public.order_items oi
    left join public.basket_template_items bi
      on bi.basket_id=v_basket.id and bi.product_id=oi.product_id
    left join public.products p on p.id=oi.product_id
    where oi.order_id=v_order.id
      and coalesce(oi.metadata->>'source','')='basket'
  ), evaluated as (
    select *,
      case
        when template_item_id is null then false
        when historical_quantity=template_quantity then true
        when historical_quantity=0 and not removable then false
        when historical_quantity<>template_quantity and not quantity_editable then false
        when historical_quantity<coalesce(min_quantity,case when removable then 0 else template_quantity end) then false
        when historical_quantity>coalesce(max_quantity,greatest(template_quantity,20)) then false
        else true
      end can_repeat,
      case
        when template_item_id is null or historical_quantity=template_quantity then 0::numeric
        when historical_quantity<template_quantity then
          abs(historical_quantity-template_quantity) *
          case
            when remove_unit_delta is null then -coalesce(price,0)
            when remove_unit_delta>0 then -remove_unit_delta
            else remove_unit_delta
          end
        when historical_quantity>template_quantity then
          (historical_quantity-template_quantity)*coalesce(add_unit_delta,price,0)
        else 0::numeric
      end delta
    from historical_basket
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',product_id,
      'name',coalesce(name,'Produto'),
      'template_quantity',template_quantity,
      'historical_quantity',historical_quantity,
      'can_repeat',can_repeat,
      'will_change',can_repeat and historical_quantity is distinct from template_quantity
    ) order by name),'[]'::jsonb),
    coalesce(sum(case when can_repeat then delta else 0 end),0),
    count(*) filter(where not can_repeat)::integer
  into v_basket_changes,v_basket_delta,v_skipped_basket_changes
  from evaluated
  where historical_quantity is distinct from template_quantity
     or template_item_id is null;

  select count(*)::integer into v_substitutions
  from public.order_items
  where order_id=v_order.id
    and coalesce(metadata->>'source','')='substitution';

  return jsonb_build_object(
    'available',true,
    'source_order_id',v_order.id,
    'source_order_number',v_order.order_number,
    'ordered_at',coalesce(v_order.confirmed_at,v_order.created_at),
    'historical_total',v_order.total,
    'basket',jsonb_build_object(
      'id',v_basket.id,
      'name',v_basket.name,
      'current_base_price',v_basket.base_price,
      'image_url',v_basket.image_url
    ),
    'basket_changes',v_basket_changes,
    'basket_delta_estimate',round(v_basket_delta,2),
    'addons',v_addons,
    'addons_current_total',round(v_addon_total,2),
    'unavailable_addon_count',v_unavailable_addons,
    'adjusted_addon_count',v_adjusted_addons,
    'skipped_basket_change_count',v_skipped_basket_changes,
    'historical_substitution_count',v_substitutions,
    'substitutions_will_repeat',false,
    'current_estimate',round(greatest(0,v_basket.base_price+v_basket_delta+v_addon_total),2),
    'writes_performed',false
  );
end;
$$;

create or replace function public.propose_papoai_commerce_repeat_last_purchase_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_preview jsonb;
  v_action_id uuid;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  v_preview:=public.preview_papoai_commerce_repeat_last_purchase_v1(p_conversation_id);
  if not coalesce((v_preview->>'available')::boolean,false) then return v_preview; end if;

  update public.papoai_commerce_pending_actions
     set status='cancelled',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,'repeat_last_purchase','pending',
    jsonb_build_object(
      'preview',v_preview,
      'source_order_id',v_preview->>'source_order_id',
      'prepared_estimate',v_preview->>'current_estimate',
      'prepared_at',now()
    ),
    now()+interval '15 minutes'
  ) returning id into v_action_id;

  return jsonb_build_object(
    'ok',true,
    'pending_action_id',v_action_id,
    'action_type','repeat_last_purchase',
    'preview',v_preview,
    'requires_confirmation',true,
    'expires_in_seconds',900,
    'writes_performed',false
  );
end;
$$;

create or replace function public.apply_papoai_commerce_repeat_last_purchase_v1(
  p_conversation_id uuid,
  p_source_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_conv public.conversations%rowtype;
  v_order public.orders%rowtype;
  v_basket public.basket_templates%rowtype;
  v_started jsonb;
  v_cart public.carts%rowtype;
  v_row record;
  v_target_qty numeric;
  v_applied_basket integer:=0;
  v_skipped_basket integer:=0;
  v_applied_addons integer:=0;
  v_skipped_addons integer:=0;
  v_adjusted_addons integer:=0;
  v_substitutions_skipped integer:=0;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  select * into v_conv from public.conversations where id=p_conversation_id;
  if not found or v_conv.customer_id is null then raise exception 'customer_not_identified'; end if;

  select * into v_order
  from public.orders
  where id=p_source_order_id
    and customer_id=v_conv.customer_id
    and public.is_customer_purchase_valid_v1(status,cancelled_at,returned_at);
  if not found then raise exception 'source_order_unavailable'; end if;
  if v_order.basket_id is null then raise exception 'source_order_without_basket'; end if;

  select * into v_basket
  from public.basket_templates
  where id=v_order.basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  v_started:=public.start_papoai_commerce_basket_v1(p_conversation_id,v_basket.name);

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;
  if not found then raise exception 'cart_not_found_after_repeat_start'; end if;

  for v_row in
    select oi.product_id,oi.quantity
    from public.order_items oi
    join public.basket_template_items bi
      on bi.basket_id=v_basket.id and bi.product_id=oi.product_id
    where oi.order_id=v_order.id
      and coalesce(oi.metadata->>'source','')='basket'
      and oi.quantity is distinct from bi.quantity
  loop
    begin
      perform public.set_papoai_commerce_basket_quantity_v1(
        p_conversation_id,v_row.product_id,v_row.quantity
      );
      v_applied_basket:=v_applied_basket+1;
    exception when others then
      v_skipped_basket:=v_skipped_basket+1;
    end;
  end loop;

  select count(*)::integer into v_substitutions_skipped
  from public.order_items
  where order_id=v_order.id
    and coalesce(metadata->>'source','')='substitution';

  for v_row in
    select oi.product_id,oi.quantity historical_quantity,
           p.stock,p.price,p.offer_price,p.is_offer,
           p.physically_verified,p.is_active,p.is_whatsapp_active
    from public.order_items oi
    left join public.products p on p.id=oi.product_id
    where oi.order_id=v_order.id
      and coalesce(oi.metadata->>'source','')='addon'
  loop
    if v_row.product_id is null
       or v_row.physically_verified is not true
       or v_row.is_active is not true
       or v_row.is_whatsapp_active is not true
       or coalesce(v_row.stock,0)<=0
       or coalesce(v_row.price,0)<=0 then
      v_skipped_addons:=v_skipped_addons+1;
      continue;
    end if;

    v_target_qty:=least(
      greatest(0,coalesce(v_row.historical_quantity,0)),
      least(6,floor(coalesce(v_row.stock,0)))
    );

    if v_target_qty<=0 then
      v_skipped_addons:=v_skipped_addons+1;
      continue;
    end if;

    if v_target_qty<>v_row.historical_quantity then
      v_adjusted_addons:=v_adjusted_addons+1;
    end if;

    begin
      perform public.set_papoai_commerce_addon_quantity_v1(
        p_conversation_id,v_row.product_id,v_target_qty
      );
      v_applied_addons:=v_applied_addons+1;
    exception when others then
      v_skipped_addons:=v_skipped_addons+1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'source_order_id',v_order.id,
    'source_order_number',v_order.order_number,
    'basket_id',v_basket.id,
    'basket_name',v_basket.name,
    'applied_basket_adjustments',v_applied_basket,
    'skipped_basket_adjustments',v_skipped_basket,
    'applied_addons',v_applied_addons,
    'skipped_addons',v_skipped_addons,
    'adjusted_addons',v_adjusted_addons,
    'substitutions_skipped',v_substitutions_skipped,
    'cart',public.get_papoai_commerce_cart_state_v1(p_conversation_id),
    'summary',public.format_papoai_commerce_cart_summary_v1(p_conversation_id)
  );
end;
$$;

create or replace function public.confirm_papoai_commerce_pending_action_v1(
  p_conversation_id uuid,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_result jsonb;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id and status='pending'
  order by created_at desc limit 1
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','no_pending_action'); end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','pending_action_expired');
  end if;

  if not coalesce(p_confirm,false) then
    update public.papoai_commerce_pending_actions
       set status='cancelled',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',true,'cancelled',true,'action_type',v_action.action_type);
  end if;

  if v_action.action_type='replace_basket_item' then
    v_result:=public.replace_papoai_commerce_basket_item_v2(
      p_conversation_id,
      (v_action.payload#>>'{source,product_id}')::uuid,
      (v_action.payload#>>'{replacement,product_id}')::uuid,
      true
    );
  elsif v_action.action_type='confirm_order' then
    v_result:=public.finalize_papoai_commerce_order_v1(
      p_conversation_id,
      v_action.id
    );
  elsif v_action.action_type='repeat_last_purchase' then
    v_result:=public.apply_papoai_commerce_repeat_last_purchase_v1(
      p_conversation_id,
      (v_action.payload->>'source_order_id')::uuid
    );
  else
    raise exception 'unsupported_pending_action';
  end if;

  if not coalesce((v_result->>'ok')::boolean,false) then
    if v_result->>'reason'='cart_changed_reconfirm' then
      update public.papoai_commerce_pending_actions
         set status='failed',resolved_at=now(),updated_at=now()
       where id=v_action.id;
    end if;
    return v_result;
  end if;

  update public.papoai_commerce_pending_actions
     set status='confirmed',resolved_at=now(),updated_at=now()
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'confirmed',true,
    'action_type',v_action.action_type,
    'result',v_result
  );
end;
$$;

revoke all on function public.preview_papoai_commerce_repeat_last_purchase_v1(uuid) from public,anon,authenticated;
grant execute on function public.preview_papoai_commerce_repeat_last_purchase_v1(uuid) to service_role;
revoke all on function public.propose_papoai_commerce_repeat_last_purchase_v1(uuid) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_repeat_last_purchase_v1(uuid) to service_role;
revoke all on function public.apply_papoai_commerce_repeat_last_purchase_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_papoai_commerce_repeat_last_purchase_v1(uuid,uuid) to service_role;
revoke all on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'repeat_purchase_policy','preview_current_conditions_then_confirm',
  'repeat_substitution_policy','never_auto_repeat_historical_substitutions'
),
updated_at=now()
where id=1;

commit;
