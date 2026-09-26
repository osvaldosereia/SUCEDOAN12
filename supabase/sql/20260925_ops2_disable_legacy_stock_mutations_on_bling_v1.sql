-- Dona Antônia Operations 2.0
-- Prevent legacy local reservation/physical stock mutations once Bling is stock authority.
-- Under legacy_shadow all three functions preserve their previous behavior.

CREATE OR REPLACE FUNCTION public.consume_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
  declare
    r record;
    v_count int;
    v_consumed int;
    v_released int;
    v_stock numeric;
  begin
    if coalesce((select metadata->>'ops2_stock_authority' from public.bling_hub_runtime_v2 where id=1),'legacy_shadow')='bling' then return jsonb_build_object('ok',true,'status','bling_authority','local_consume_skipped',true,'already_consumed',true); end if;
    select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
      into v_count,v_consumed,v_released
    from public.vitrine_stock_reservations where order_id=p_order_id;
    if v_count=0 then return jsonb_build_object('ok',false,'error','stock_reservation_not_found'); end if;
    if v_consumed=v_count then return jsonb_build_object('ok',true,'status','consumed','already_consumed',true); end if;
    if v_released>0 then return jsonb_build_object('ok',false,'error','stock_reservation_released'); end if;

    for r in
      select product_id,quantity from public.vitrine_stock_reservations
      where order_id=p_order_id and status='reserved'
      order by product_id for update
    loop
      select stock into v_stock from public.products where id=r.product_id and is_active=true for update;
      if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;
      if coalesce(v_stock,0)<r.quantity then
        return jsonb_build_object('ok',false,'error','insufficient_physical_stock','product_id',r.product_id,'available',coalesce(v_stock,0),'requested',r.quantity);
      end if;
    end loop;
    for r in
      select product_id,quantity from public.vitrine_stock_reservations
      where order_id=p_order_id and status='reserved'
      order by product_id
    loop
      update public.products set stock=stock-r.quantity,updated_at=now() where id=r.product_id;
    end loop;
    update public.vitrine_stock_reservations
       set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
     where order_id=p_order_id and status='reserved';
    return jsonb_build_object('ok',true,'status','consumed','already_consumed',false);
  end $function$
;

CREATE OR REPLACE FUNCTION public.release_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
  declare r record; v_consumed int;
  begin
    if coalesce((select metadata->>'ops2_stock_authority' from public.bling_hub_runtime_v2 where id=1),'legacy_shadow')='bling' then return jsonb_build_object('ok',true,'status','bling_authority','local_release_skipped',true,'restored_physical_stock',false); end if;
    select count(*) filter(where status='consumed') into v_consumed
    from public.vitrine_stock_reservations where order_id=p_order_id;
    if coalesce(v_consumed,0)>0 then
      for r in select product_id,quantity from public.vitrine_stock_reservations where order_id=p_order_id and status='consumed' order by product_id
      loop
        perform 1 from public.products where id=r.product_id for update;
        update public.products set stock=coalesce(stock,0)+r.quantity,updated_at=now() where id=r.product_id;
      end loop;
    end if;
    update public.vitrine_stock_reservations
       set status='released',released_at=now(),updated_at=now()
     where order_id=p_order_id and status in ('reserved','consumed');
    return jsonb_build_object('ok',true,'status','released','restored_physical_stock',coalesce(v_consumed,0)>0);
  end $function$
;

CREATE OR REPLACE FUNCTION public.reserve_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
  declare
    r record;
    v_physical numeric;
    v_reserved numeric;
    v_available numeric;
  begin
    if coalesce((select metadata->>'ops2_stock_authority' from public.bling_hub_runtime_v2 where id=1),'legacy_shadow')='bling' then return jsonb_build_object('ok',true,'status','bling_authority','local_reservation_skipped',true); end if;
    if p_order_id is null or not exists(select 1 from public.orders where id=p_order_id and source='vitrine') then
      return jsonb_build_object('ok',false,'error','order_not_found');
    end if;
    for r in
      select oi.product_id,sum(oi.quantity) quantity
      from public.order_items oi
      where oi.order_id=p_order_id and oi.product_id is not null
      group by oi.product_id
      order by oi.product_id
    loop
      select p.stock into v_physical
      from public.products p
      where p.id=r.product_id and p.is_active=true
      for update;
      if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;
      select coalesce(sum(x.quantity),0) into v_reserved
      from public.vitrine_stock_reservations x
      where x.product_id=r.product_id
        and x.status='reserved'
        and x.expires_at>now()
        and x.order_id<>p_order_id;
      v_available:=coalesce(v_physical,0)-coalesce(v_reserved,0);
      if v_available<r.quantity then
        return jsonb_build_object('ok',false,'error','insufficient_stock','product_id',r.product_id,'available',greatest(v_available,0),'requested',r.quantity);
      end if;
    end loop;
    insert into public.vitrine_stock_reservations(order_id,product_id,quantity,status,expires_at,updated_at)
    select p_order_id,oi.product_id,sum(oi.quantity),'reserved',now()+interval '2 hours',now()
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id is not null
    group by oi.product_id
    on conflict(order_id,product_id) do update
      set quantity=excluded.quantity,status='reserved',expires_at=excluded.expires_at,updated_at=now(),consumed_at=null,released_at=null;
    return jsonb_build_object('ok',true,'status','reserved');
  end $function$
;