-- R02 READ-ONLY EXPORT of two REAL production function definitions.
-- Capture date: 2026-10-08. Source project ssbesxgaijknwsjbsbcz.
-- Execute ONLY in an ephemeral PostgreSQL 17 GitHub Actions test database.
-- No credentials or customer data included. Dependencies remain synthetic.
-- Capture hashes: create_vitrine_cart_order_v3=798d9c25e61e2babafa2b21ca8d0e83a | reserve_vitrine_order_stock_v1=754d532252dd403a2fcbca2e2b267a52

CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v3(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_order_id uuid;
  v_reservation jsonb;
  v_error text;
begin
  v_result:=public.create_vitrine_cart_order_v3_base(
    p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );

  begin
    v_order_id:=nullif(v_result->>'order_id','')::uuid;
  exception when others then
    v_order_id:=null;
  end;
  if v_order_id is null then
    raise exception 'order_id_missing' using errcode='P0001';
  end if;

  v_reservation:=public.reserve_vitrine_order_stock_v1(v_order_id);
  if coalesce((v_reservation->>'ok')::boolean,false) is not true then
    v_error:=coalesce(nullif(v_reservation->>'error',''),'stock_reservation_failed');
    raise exception '%',v_error using errcode='P0001';
  end if;

  v_result:=v_result||jsonb_build_object(
    'stock_reserved',true,
    'reservation_timing','on_create',
    'reservation_status',coalesce(v_reservation->>'status','reserved')
  );

  return public.ops2_enrich_storefront_order_result_v1(v_result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
