begin;

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
  v_cart_id uuid;
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

  select cs.cart_id into v_cart_id
  from public.catalog_sessions cs
  where cs.id=s.id;

  if v_cart_id is null then raise exception 'room_cart_unavailable'; end if;

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

  perform public.recalculate_cart(v_cart_id);
  select * into final_cart from public.carts where id=v_cart_id;

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
    'cart_id',v_cart_id,
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

revoke all on function public.room_repeat_last_purchase_apply_v1(text) from public,anon,authenticated;
grant execute on function public.room_repeat_last_purchase_apply_v1(text) to service_role;

commit;
