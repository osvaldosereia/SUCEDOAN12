create or replace function public.consume_storefront_order_stock_v2(
  p_organization_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row record;
  v_count integer;
  v_consumed integer;
  v_released integer;
  v_locked integer := 0;
begin
  select count(*),
         count(*) filter(where status='consumed'),
         count(*) filter(where status='released')
    into v_count,v_consumed,v_released
  from public.order_stock_reservations
  where organization_id=p_organization_id and order_id=p_order_id;

  if v_count=0 then
    return jsonb_build_object('ok',false,'error','stock_reservation_not_found');
  end if;

  if v_consumed=v_count then
    return jsonb_build_object('ok',true,'status','consumed','already_consumed',true);
  end if;

  if v_released>0 then
    return jsonb_build_object('ok',false,'error','stock_reservation_released');
  end if;

  for v_row in
    select r.product_id,r.quantity
    from public.order_stock_reservations r
    where r.organization_id=p_organization_id
      and r.order_id=p_order_id
      and r.status='reserved'
    order by r.product_id
    for update
  loop
    v_locked := v_locked + 1;

    perform 1
    from public.products p
    where p.organization_id=p_organization_id and p.id=v_row.product_id
    for update;

    if not found then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',v_row.product_id);
    end if;

    if (select coalesce(stock_quantity,0) from public.products where id=v_row.product_id) < v_row.quantity then
      return jsonb_build_object(
        'ok',false,'error','insufficient_physical_stock',
        'product_id',v_row.product_id,
        'available',(select coalesce(stock_quantity,0) from public.products where id=v_row.product_id),
        'requested',v_row.quantity
      );
    end if;
  end loop;

  if v_locked=0 then
    select count(*),
           count(*) filter(where status='consumed'),
           count(*) filter(where status='released')
      into v_count,v_consumed,v_released
    from public.order_stock_reservations
    where organization_id=p_organization_id and order_id=p_order_id;

    if v_count>0 and v_consumed=v_count then
      return jsonb_build_object('ok',true,'status','consumed','already_consumed',true);
    end if;
    if v_released>0 then
      return jsonb_build_object('ok',false,'error','stock_reservation_released');
    end if;
    return jsonb_build_object('ok',false,'error','stock_reservation_not_found');
  end if;

  for v_row in
    select r.product_id,r.quantity
    from public.order_stock_reservations r
    where r.organization_id=p_organization_id
      and r.order_id=p_order_id
      and r.status='reserved'
    order by r.product_id
  loop
    update public.products
      set stock_quantity=stock_quantity-v_row.quantity,
          updated_at=now()
    where organization_id=p_organization_id and id=v_row.product_id;
  end loop;

  update public.order_stock_reservations
    set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
  where organization_id=p_organization_id
    and order_id=p_order_id
    and status='reserved';

  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false);
end;
$$;

revoke all on function public.consume_storefront_order_stock_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.consume_storefront_order_stock_v2(uuid,uuid) to service_role;
