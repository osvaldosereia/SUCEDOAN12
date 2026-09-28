-- Extend confirmed-order local reservation tracking through next-day delivery.
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
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  if p_order_id is null or not exists(
    select 1 from public.orders
    where id=p_order_id
      and source in ('vitrine','manual_whatsapp','papoai','reorder')
  ) then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  for r in
    select oi.product_id,sum(oi.quantity) quantity
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id is not null
    group by oi.product_id
    order by oi.product_id
  loop
    perform 1 from public.products p where p.id=r.product_id and p.is_active=true for update;
    if not found then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id);
    end if;

    if v_authority='bling' then
      select s.effective_sellable_stock into v_effective
      from public.ops2_sellable_stock_v1 s
      where s.product_id=r.product_id and s.is_active=true and s.bling_stock_ready=true;
      if not found then
        return jsonb_build_object('ok',false,'error','bling_stock_unavailable','product_id',r.product_id);
      end if;

      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      join public.orders o on o.id=x.order_id
      where x.product_id=r.product_id
        and x.status='reserved'
        and x.expires_at>now()
        and x.order_id<>p_order_id
        and (o.bling_synced_at is null or o.sync_status<>'sent_to_bling');

      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    else
      select p.stock into v_effective
      from public.products p
      where p.id=r.product_id and p.is_active=true;

      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      where x.product_id=r.product_id
        and x.status='reserved'
        and x.expires_at>now()
        and x.order_id<>p_order_id;

      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    end if;

    if v_available<r.quantity then
      return jsonb_build_object(
        'ok',false,'error','insufficient_stock','product_id',r.product_id,
        'available',v_available,'requested',r.quantity,'stock_authority',v_authority
      );
    end if;
  end loop;

  insert into public.vitrine_stock_reservations(order_id,product_id,quantity,status,expires_at,updated_at)
  select p_order_id,oi.product_id,sum(oi.quantity),'reserved',now()+interval '48 hours',now()
  from public.order_items oi
  where oi.order_id=p_order_id and oi.product_id is not null
  group by oi.product_id
  on conflict(order_id,product_id) do update
    set quantity=excluded.quantity,status='reserved',expires_at=excluded.expires_at,
        updated_at=now(),consumed_at=null,released_at=null;

  return jsonb_build_object(
    'ok',true,'status','reserved','stock_authority',v_authority,
    'local_reservation_tracking',true,'physical_stock_changed',false
  );
end
$function$;

