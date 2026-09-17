begin;

-- Etapa 4 — repetir a última compra com catálogo/preços/estoque atuais.

create or replace function public.room_repeat_last_purchase_preview_v1(p_public_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  s public.catalog_sessions%rowtype;
  o public.orders%rowtype;
  b public.basket_templates%rowtype;
  addons jsonb:='[]'::jsonb;
  unavailable_count integer:=0;
  adjusted_count integer:=0;
  addon_count integer:=0;
  current_estimate numeric:=0;
  customized boolean:=false;
begin
  select * into s
  from public.catalog_sessions
  where public_token=p_public_token and status='open' and expires_at>now();

  if not found then
    return jsonb_build_object('available',false,'reason','room_unavailable');
  end if;

  if s.customer_id is null then
    return jsonb_build_object('available',false,'reason','customer_not_identified');
  end if;

  select * into o
  from public.orders
  where customer_id=s.customer_id
    and public.is_customer_purchase_valid_v1(status,cancelled_at,returned_at)
  order by coalesce(confirmed_at,created_at) desc,created_at desc,id desc
  limit 1;

  if not found then
    return jsonb_build_object('available',false,'reason','no_purchase_history');
  end if;

  if o.basket_id is null then
    return jsonb_build_object(
      'available',false,
      'reason','last_purchase_without_basket',
      'order_id',o.id,
      'order_number',o.order_number,
      'ordered_at',coalesce(o.confirmed_at,o.created_at)
    );
  end if;

  select * into b
  from public.basket_templates
  where id=o.basket_id and is_active=true and is_whatsapp_active=true;

  if not found then
    return jsonb_build_object(
      'available',false,
      'reason','basket_not_available',
      'order_id',o.id,
      'order_number',o.order_number,
      'basket_id',o.basket_id,
      'basket_name',coalesce(o.basket_name_snapshot,'Cesta básica')
    );
  end if;

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'product_id',x.product_id,
        'name',x.name,
        'historical_quantity',x.historical_quantity,
        'repeat_quantity',x.repeat_quantity,
        'available',x.available,
        'stock',x.stock,
        'current_price',x.current_price,
        'is_offer',x.is_offer,
        'offer_price',x.offer_price,
        'adjusted',x.repeat_quantity<>x.historical_quantity
      )
      order by x.name
    ),'[]'::jsonb),
    count(*)::int,
    count(*) filter(where not x.available)::int,
    count(*) filter(where x.available and x.repeat_quantity<>x.historical_quantity)::int,
    coalesce(sum(case when x.available then x.repeat_quantity*x.current_price else 0 end),0)
  into addons,addon_count,unavailable_count,adjusted_count,current_estimate
  from (
    select
      oi.product_id,
      coalesce(p.name,oi.name_snapshot,'Produto') as name,
      greatest(0,coalesce(oi.quantity,0))::numeric as historical_quantity,
      case
        when p.id is not null
         and p.physically_verified=true
         and p.is_active=true
         and p.is_whatsapp_active=true
         and coalesce(p.stock,0)>0
         and coalesce(p.price,0)>0
        then least(greatest(0,coalesce(oi.quantity,0)),least(6,floor(coalesce(p.stock,0))))::numeric
        else 0::numeric
      end as repeat_quantity,
      (
        p.id is not null
        and p.physically_verified=true
        and p.is_active=true
        and p.is_whatsapp_active=true
        and coalesce(p.stock,0)>0
        and coalesce(p.price,0)>0
      ) as available,
      greatest(0,floor(coalesce(p.stock,0)))::integer as stock,
      coalesce(p.price,0)::numeric as current_price,
      coalesce(p.is_offer,false) as is_offer,
      p.offer_price
    from public.order_items oi
    left join public.products p on p.id=oi.product_id
    where oi.order_id=o.id
      and coalesce(oi.metadata->>'source','')='addon'
  ) x;

  select exists(
    select 1
    from public.order_items oi
    left join public.basket_template_items bi
      on bi.basket_id=b.id and bi.product_id=oi.product_id
    where oi.order_id=o.id
      and (
        coalesce(oi.metadata->>'source','')='substitution'
        or (
          coalesce(oi.metadata->>'source','')='basket'
          and bi.id is not null
          and oi.quantity is distinct from bi.quantity
        )
      )
  ) into customized;

  current_estimate:=coalesce(b.base_price,0)+coalesce(current_estimate,0);

  return jsonb_build_object(
    'available',true,
    'order_id',o.id,
    'order_number',o.order_number,
    'ordered_at',coalesce(o.confirmed_at,o.created_at),
    'historical_total',o.total,
    'basket',jsonb_build_object(
      'id',b.id,
      'name',b.name,
      'current_price',b.base_price,
      'image_url',b.image_url
    ),
    'addon_count',addon_count,
    'unavailable_addon_count',unavailable_count,
    'adjusted_addon_count',adjusted_count,
    'basket_customization_detected',customized,
    'current_estimate',current_estimate,
    'addons',addons
  );
end
$$;

create or replace function public.room_repeat_last_purchase_apply_v1(p_public_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.catalog_sessions%rowtype;
  o public.orders%rowtype;
  b public.basket_templates%rowtype;
  basket_result jsonb;
  cart_id uuid;
  row record;
  target_qty numeric;
  applied_addons integer:=0;
  skipped_addons integer:=0;
  adjusted_addons integer:=0;
  basket_adjustments_applied integer:=0;
  basket_adjustments_skipped integer:=0;
  substitutions_skipped integer:=0;
  final_cart public.carts%rowtype;
begin
  select * into s
  from public.catalog_sessions
  where public_token=p_public_token and status='open' and expires_at>now()
  for update;

  if not found then raise exception 'room_unavailable'; end if;
  if s.customer_id is null then raise exception 'customer_not_identified'; end if;

  select * into o
  from public.orders
  where customer_id=s.customer_id
    and public.is_customer_purchase_valid_v1(status,cancelled_at,returned_at)
  order by coalesce(confirmed_at,created_at) desc,created_at desc,id desc
  limit 1;

  if not found then raise exception 'no_purchase_history'; end if;
  if o.basket_id is null then raise exception 'last_purchase_without_basket'; end if;

  select * into b
  from public.basket_templates
  where id=o.basket_id and is_active=true and is_whatsapp_active=true;

  if not found then raise exception 'basket_not_available'; end if;

  basket_result:=public.room_start_basket(p_public_token,b.id);

  select cart_id into cart_id
  from public.catalog_sessions
  where id=s.id;

  if cart_id is null then raise exception 'room_cart_unavailable'; end if;

  -- Reaplica quantidades antigas apenas quando o mesmo componente continua
  -- existindo na cesta atual e a regra atual permite a alteração.
  for row in
    select oi.product_id,oi.quantity
    from public.order_items oi
    join public.basket_template_items bi
      on bi.basket_id=b.id and bi.product_id=oi.product_id
    where oi.order_id=o.id
      and coalesce(oi.metadata->>'source','')='basket'
      and oi.quantity is distinct from bi.quantity
  loop
    begin
      perform public.room_set_basket_quantity(p_public_token,row.product_id,row.quantity);
      basket_adjustments_applied:=basket_adjustments_applied+1;
    exception when others then
      basket_adjustments_skipped:=basket_adjustments_skipped+1;
    end;
  end loop;

  select count(*)::int into substitutions_skipped
  from public.order_items oi
  where oi.order_id=o.id
    and coalesce(oi.metadata->>'source','')='substitution';

  -- Reaplica produtos extras com as regras de estoque e limite atuais.
  for row in
    select
      oi.product_id,
      oi.quantity as historical_quantity,
      p.stock,
      p.price,
      p.physically_verified,
      p.is_active,
      p.is_whatsapp_active
    from public.order_items oi
    left join public.products p on p.id=oi.product_id
    where oi.order_id=o.id
      and coalesce(oi.metadata->>'source','')='addon'
  loop
    if row.product_id is null
       or row.physically_verified is not true
       or row.is_active is not true
       or row.is_whatsapp_active is not true
       or coalesce(row.stock,0)<=0
       or coalesce(row.price,0)<=0 then
      skipped_addons:=skipped_addons+1;
      continue;
    end if;

    target_qty:=least(
      greatest(0,coalesce(row.historical_quantity,0)),
      least(6,floor(coalesce(row.stock,0)))
    );

    if target_qty<=0 then
      skipped_addons:=skipped_addons+1;
      continue;
    end if;

    if target_qty<>row.historical_quantity then
      adjusted_addons:=adjusted_addons+1;
    end if;

    begin
      perform public.room_set_product_quantity(p_public_token,row.product_id,target_qty);
      applied_addons:=applied_addons+1;
    exception when others then
      skipped_addons:=skipped_addons+1;
    end;
  end loop;

  perform public.recalculate_cart(cart_id);
  select * into final_cart from public.carts where id=cart_id;

  update public.catalog_sessions
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'repeated_from_order_id',o.id,
        'repeated_from_order_number',o.order_number,
        'repeat_applied_at',now()
      ),
      last_activity_at=now(),
      current_view='basket'
  where id=s.id;

  insert into public.customer_behavior_events(customer_id,conversation_id,event_type,event_data)
  values(
    s.customer_id,
    s.conversation_id,
    'repeat_last_purchase',
    jsonb_build_object(
      'source_order_id',o.id,
      'basket_id',b.id,
      'applied_addons',applied_addons,
      'skipped_addons',skipped_addons,
      'adjusted_addons',adjusted_addons,
      'basket_adjustments_applied',basket_adjustments_applied,
      'basket_adjustments_skipped',basket_adjustments_skipped,
      'substitutions_skipped',substitutions_skipped
    )
  );

  return jsonb_build_object(
    'ok',true,
    'source_order_id',o.id,
    'source_order_number',o.order_number,
    'basket_id',b.id,
    'basket_name',b.name,
    'cart_id',cart_id,
    'total',final_cart.total,
    'applied_addons',applied_addons,
    'skipped_addons',skipped_addons,
    'adjusted_addons',adjusted_addons,
    'basket_adjustments_applied',basket_adjustments_applied,
    'basket_adjustments_skipped',basket_adjustments_skipped,
    'substitutions_skipped',substitutions_skipped,
    'basket',basket_result
  );
end
$$;

revoke all on function public.room_repeat_last_purchase_preview_v1(text) from public,anon,authenticated;
revoke all on function public.room_repeat_last_purchase_apply_v1(text) from public,anon,authenticated;
grant execute on function public.room_repeat_last_purchase_preview_v1(text) to service_role;
grant execute on function public.room_repeat_last_purchase_apply_v1(text) to service_role;

commit;
