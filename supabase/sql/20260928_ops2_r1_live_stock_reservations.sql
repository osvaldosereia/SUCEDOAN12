-- Dona Antônia Operations 2.0 · R1 live cutover stock reservation model
-- Bling becomes stock authority; local reservations remain only as concurrency protection/tracking.

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
  select p_order_id,oi.product_id,sum(oi.quantity),'reserved',now()+interval '2 hours',now()
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
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
    into v_count,v_consumed,v_released
  from public.vitrine_stock_reservations where order_id=p_order_id;

  if v_count=0 then return jsonb_build_object('ok',false,'error','stock_reservation_not_found'); end if;
  if v_consumed=v_count then
    return jsonb_build_object('ok',true,'status',case when v_authority='bling' then 'bling_authority' else 'consumed' end,
      'already_consumed',true,'local_consume_skipped',v_authority='bling','reservations_consumed',true);
  end if;
  if v_released>0 then return jsonb_build_object('ok',false,'error','stock_reservation_released'); end if;

  if v_authority='bling' then
    update public.vitrine_stock_reservations
       set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
     where order_id=p_order_id and status='reserved';
    return jsonb_build_object(
      'ok',true,'status','bling_authority','already_consumed',false,
      'local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false
    );
  end if;

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
    where order_id=p_order_id and status='reserved' order by product_id
  loop
    update public.products set stock=stock-r.quantity,updated_at=now() where id=r.product_id;
  end loop;

  update public.vitrine_stock_reservations
     set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
   where order_id=p_order_id and status='reserved';

  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false,'physical_stock_changed',true);
end
$function$;

create or replace function public.release_vitrine_order_stock_v1(p_order_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  r record;
  v_consumed int;
  v_authority text;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  select count(*) filter(where status='consumed') into v_consumed
  from public.vitrine_stock_reservations where order_id=p_order_id;

  if v_authority='bling' then
    update public.vitrine_stock_reservations
       set status='released',released_at=now(),updated_at=now()
     where order_id=p_order_id and status in ('reserved','consumed');

    return jsonb_build_object(
      'ok',true,'status','bling_authority','local_release_recorded',true,
      'restored_physical_stock',false,'physical_stock_changed',false
    );
  end if;

  if coalesce(v_consumed,0)>0 then
    for r in
      select product_id,quantity from public.vitrine_stock_reservations
      where order_id=p_order_id and status='consumed' order by product_id
    loop
      perform 1 from public.products where id=r.product_id for update;
      update public.products set stock=coalesce(stock,0)+r.quantity,updated_at=now() where id=r.product_id;
    end loop;
  end if;

  update public.vitrine_stock_reservations
     set status='released',released_at=now(),updated_at=now()
   where order_id=p_order_id and status in ('reserved','consumed');

  return jsonb_build_object('ok',true,'status','released','restored_physical_stock',coalesce(v_consumed,0)>0);
end
$function$;

-- In R1 only real-time order/stock events are processed.
-- Product and invoice events stay held for later domain-specific reconciliation.
create or replace function public.claim_bling_webhook_inbox_v2(
  p_worker text,
  p_limit integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.bling_webhook_inbox_v2
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_runtime public.bling_hub_runtime_v2%rowtype;
  v_limit integer;
begin
  select * into v_runtime from public.bling_hub_runtime_v2 where id=1;
  if not found
     or v_runtime.hub_enabled is not true
     or v_runtime.webhooks_enabled is not true
     or v_runtime.mode not in ('homologation','live') then
    return;
  end if;
  if nullif(trim(coalesce(p_worker,'')),'') is null then raise exception 'worker_required'; end if;

  v_limit:=greatest(1,least(coalesce(p_limit,10),50));

  update public.bling_webhook_inbox_v2
     set status='retry',locked_at=null,locked_by=null,next_attempt_at=now(),updated_at=now(),
         last_error=coalesce(last_error,'lease_expired')
   where status='processing'
     and resource in ('order','stock','virtual_stock')
     and locked_at is not null
     and locked_at < now()-make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),1800)));

  return query
  with picked as (
    select i.event_id
      from public.bling_webhook_inbox_v2 i
     where i.status in ('held','received','retry')
       and i.resource in ('order','stock','virtual_stock')
       and i.next_attempt_at<=now()
       and i.attempt_count<i.max_attempts
     order by i.event_at nulls last,i.received_at,i.event_id
     for update skip locked
     limit v_limit
  )
  update public.bling_webhook_inbox_v2 i
     set status='processing',attempt_count=i.attempt_count+1,
         locked_by=left(trim(p_worker),120),locked_at=now(),updated_at=now()
    from picked
   where i.event_id=picked.event_id
  returning i.*;
end
$function$;
