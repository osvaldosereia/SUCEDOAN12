-- Supabase products.stock is the only inventory balance used for availability,
-- reservation, storefront display, basket substitution, and order consumption.
-- Bling remains available for order/fiscal integration, but its stock mirror is
-- intentionally excluded from all stock calculations.

create or replace function public.force_supabase_stock_authority_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  new.metadata := jsonb_set(
    coalesce(new.metadata, '{}'::jsonb),
    '{ops2_stock_authority}',
    '"supabase"'::jsonb,
    true
  );
  if nullif(new.metadata->>'ops2_supabase_stock_authority_at','') is null then
    new.metadata := jsonb_set(new.metadata, '{ops2_supabase_stock_authority_at}', to_jsonb(now()::text), true);
  end if;
  if nullif(new.metadata->>'ops2_stock_cutover_at','') is null then
    new.metadata := jsonb_set(new.metadata, '{ops2_stock_cutover_at}', new.metadata->'ops2_supabase_stock_authority_at', true);
  end if;
  new.metadata := jsonb_set(new.metadata, '{ops2_stock_authority_fixed}', 'true'::jsonb, true);
  return new;
end;
$function$;

update public.bling_hub_runtime_v2
   set metadata = jsonb_set(
     jsonb_set(
       jsonb_set(coalesce(metadata,'{}'::jsonb), '{ops2_stock_authority}', '"supabase"'::jsonb, true),
       '{ops2_supabase_stock_authority_at}', to_jsonb(now()::text), true
     ),
     '{ops2_stock_authority_fixed}', 'true'::jsonb, true
   ),
   updated_at = now()
 where id = 1;
update public.bling_hub_runtime_v2
   set metadata = jsonb_set(metadata, '{ops2_stock_cutover_at}', metadata->'ops2_supabase_stock_authority_at', true)
 where id = 1 and nullif(metadata->>'ops2_stock_cutover_at','') is null;
create trigger force_supabase_stock_authority_v1
before insert or update of metadata on public.bling_hub_runtime_v2
for each row execute function public.force_supabase_stock_authority_v1();

create or replace function public.ops2_activate_bling_stock_authority_v1()
returns jsonb
language sql
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'ok',false,
    'error','supabase_stock_authority_fixed',
    'authority','supabase',
    'message','O estoque oficial é o saldo cadastrado em products.stock no Supabase.'
  );
$function$;

create or replace function public.ops2_rollback_bling_stock_authority_v1(p_reason text)
returns jsonb
language sql
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'ok',false,
    'error','supabase_stock_authority_fixed',
    'authority','supabase',
    'message','A autoridade do estoque está fixada no Supabase.'
  );
$function$;

create or replace view public.ops2_sellable_stock_v1 as
select
  p.id as product_id,
  p.name,
  p.sku,
  p.gtin,
  p.is_active,
  coalesce(p.stock,0)::numeric as legacy_stock,
  p.bling_product_id,
  null::text as link_status,
  null::numeric as bling_physical_total,
  null::numeric as bling_virtual_total,
  null::bigint as selected_deposit_id,
  null::numeric as sellable_physical,
  null::numeric as sellable_virtual,
  null::timestamptz as mirror_observed_at,
  null::text as source_event_id,
  null::text as source_resource,
  'supabase'::text as stock_authority,
  nullif(rt.metadata->>'ops2_supabase_stock_authority_at','')::timestamptz as stock_cutover_at,
  false as bling_stock_ready,
  greatest(0,coalesce(p.stock,0))::numeric as effective_sellable_stock,
  'supabase_products_stock'::text as stock_source_reason
from public.products p
cross join public.bling_hub_runtime_v2 rt
where rt.id=1;

create or replace function public.supabase_stock_pending_reservations_v1(
  p_product_id uuid,
  p_exclude_order_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(r.quantity),0)::numeric
  from public.vitrine_stock_reservations r
  join public.orders o on o.id=r.order_id
  cross join public.bling_hub_runtime_v2 rt
  left join public.order_separation_completions_v1 c on c.order_id=r.order_id
  where r.product_id=p_product_id
    and (p_exclude_order_id is null or r.order_id<>p_exclude_order_id)
    and o.status not in ('cancelled','delivered','returned')
    and (
      (r.status in ('reserved','allocated') and (r.expires_at is null or r.expires_at>now()))
      or (
        r.status='consumed'
        and coalesce(r.consumed_at,r.updated_at,r.created_at)
          < nullif(rt.metadata->>'ops2_supabase_stock_authority_at','')::timestamptz
        and coalesce((c.metadata->>'stock_applied')::boolean,false)=false
      )
    );
$function$;

create or replace view public.storefront_product_sellable_stock_v1 as
select
  p.id as product_id,
  coalesce(p.stock,0)::numeric as catalog_stock,
  coalesce(l.basket_locked_quantity,0)::numeric as basket_locked_quantity,
  public.supabase_stock_pending_reservations_v1(p.id,null::uuid) as pending_order_quantity,
  greatest(0,coalesce(p.stock,0)-coalesce(l.basket_locked_quantity,0)
    -public.supabase_stock_pending_reservations_v1(p.id,null::uuid))::numeric as sellable_stock,
  p.is_active,
  p.is_whatsapp_active,
  coalesce(p.price,0)::numeric as price,
  p.validity_date
from public.products p
left join public.basket_locked_component_stock_v1 l on l.product_id=p.id;

create or replace view public.storefront_ean_sellable_stock_v1 as
select
  s.product_id,
  s.name,
  s.sku,
  s.gtin,
  s.is_active,
  s.legacy_stock,
  s.bling_product_id,
  s.link_status,
  s.bling_physical_total,
  s.bling_virtual_total,
  s.selected_deposit_id,
  s.sellable_physical,
  s.sellable_virtual,
  s.mirror_observed_at,
  s.source_event_id,
  s.source_resource,
  s.stock_authority,
  s.stock_cutover_at,
  s.bling_stock_ready,
  s.effective_sellable_stock,
  s.stock_source_reason,
  s.basket_locked_quantity,
  s.loose_sellable_stock,
  case
    when p.is_active is not true
      or p.is_whatsapp_active is not true
      or coalesce(p.price,0)<=0
      or (p.validity_date is not null and p.validity_date<current_date)
      then 0::numeric
    else greatest(0,floor(s.loose_sellable_stock
      - public.supabase_stock_pending_reservations_v1(p.id,null::uuid)))::numeric
  end as ean_sellable_stock
from public.ops2_loose_sellable_stock_v1 s
join public.products p on p.id=s.product_id;

create or replace function public.basket_component_fresh_sellable_stock_v1(p_product_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select greatest(0,coalesce(s.loose_sellable_stock,0))::numeric
  from public.ops2_loose_sellable_stock_v1 s
  where s.product_id=p_product_id;
$function$;

-- Composition availability uses local reservations, including orders consumed
-- before this cutover but still waiting for separation.
do $migration$
declare
  v_def text;
  v_old text := $old$active_order_reservations as (
  select r.product_id, coalesce(sum(r.quantity), 0)::numeric as reserved
  from public.vitrine_stock_reservations r
  where r.status in ('reserved', 'allocated')
    and (r.expires_at is null or r.expires_at > now())
  group by r.product_id
),$old$;
  v_new text := $new$active_order_reservations as (
  select r.product_id,
         public.supabase_stock_pending_reservations_v1(r.product_id,null::uuid)::numeric as reserved
  from public.vitrine_stock_reservations r
  where r.status in ('reserved','allocated')
     or r.status='consumed'
  group by r.product_id
),$new$;
begin
  v_def:=pg_get_functiondef('public.basket_mold_public_compositions_batch_v1(uuid[])'::regprocedure);
  if position(v_old in v_def)=0 then
    raise exception 'basket_mold_public_compositions_batch_v1 stock reservation block changed';
  end if;
  execute replace(v_def,v_old,v_new);
end;
$migration$;

-- Preserve the existing order eligibility and manual replacement behavior, but
-- calculate every reservation from local catalog stock and local commitments.
do $migration$
declare
  v_def text;
  v_old text := $old$    select case when v_authority='bling' then null::numeric else ean_sellable_stock end into v_effective
    from public.storefront_ean_sellable_stock_v1
    where product_id=r.product_id;
    if v_effective is not null then
      v_available:=greatest(0,v_effective);
    elsif v_authority='bling' then
      select public.basket_component_fresh_sellable_stock_v1(r.product_id) into v_effective;
      if v_effective is null then return jsonb_build_object('ok',false,'error','bling_stock_unavailable','product_id',r.product_id); end if;

      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      join public.orders o on o.id=x.order_id
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now()
        and x.order_id<>p_order_id and (o.bling_synced_at is null or o.sync_status<>'sent_to_bling');
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    else
      select public.basket_component_fresh_sellable_stock_v1(r.product_id) into v_effective;
      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now() and x.order_id<>p_order_id;
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    end if;$old$;
  v_new text := $new$    select public.basket_component_fresh_sellable_stock_v1(r.product_id)
      into v_effective;
    select public.supabase_stock_pending_reservations_v1(r.product_id,p_order_id)
      into v_pending_local;
    v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));$new$;
begin
  v_def:=pg_get_functiondef('public.reserve_vitrine_order_stock_v1(uuid)'::regprocedure);
  if position(v_old in v_def)=0 then
    raise exception 'reserve_vitrine_order_stock_v1 stock block changed';
  end if;
  execute replace(v_def,v_old,v_new);
end;
$migration$;

create or replace function public.consume_vitrine_order_stock_v1(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  r record;
  v_count integer;
  v_consumed integer;
  v_released integer;
  v_stock numeric;
  v_has_basket boolean;
begin
  select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
    into v_count,v_consumed,v_released
  from public.vitrine_stock_reservations where order_id=p_order_id;
  select exists(select 1 from public.basket_stock_allocations where order_id=p_order_id and status in ('allocated','consumed'))
    into v_has_basket;
  if v_count=0 then
    if v_has_basket then
      return jsonb_build_object('ok',true,'status','preassembled_only','local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false);
    end if;
    return jsonb_build_object('ok',false,'error','stock_reservation_not_found');
  end if;
  if v_consumed=v_count then
    return jsonb_build_object('ok',true,'status','consumed','already_consumed',true,'local_consume_skipped',false,'reservations_consumed',true);
  end if;
  if v_released>0 then return jsonb_build_object('ok',false,'error','stock_reservation_released'); end if;
  for r in
    select product_id,quantity from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved' order by product_id for update
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
    update public.products set stock=coalesce(stock,0)-r.quantity,updated_at=now() where id=r.product_id;
  end loop;
  update public.vitrine_stock_reservations
     set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
   where order_id=p_order_id and status='reserved';
  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false,'stock_source','supabase_products_stock','physical_stock_changed',true);
end;
$function$;

create or replace function public.release_vitrine_order_stock_v1(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  r record;
  v_consumed integer;
  v_cutover timestamptz;
begin
  select nullif(metadata->>'ops2_supabase_stock_authority_at','')::timestamptz into v_cutover
  from public.bling_hub_runtime_v2 where id=1;
  select count(*) filter(where status='consumed' and coalesce(consumed_at,updated_at,created_at)>=v_cutover)
    into v_consumed from public.vitrine_stock_reservations where order_id=p_order_id;
  for r in
    select product_id,quantity from public.vitrine_stock_reservations
    where order_id=p_order_id and status='consumed'
      and coalesce(consumed_at,updated_at,created_at)>=v_cutover
    order by product_id for update
  loop
    update public.products set stock=coalesce(stock,0)+r.quantity,updated_at=now() where id=r.product_id;
  end loop;
  update public.vitrine_stock_reservations
     set status='released',released_at=now(),updated_at=now()
   where order_id=p_order_id and status in ('reserved','allocated','consumed');
  return jsonb_build_object('ok',true,'status','released','stock_source','supabase_products_stock',
    'restored_physical_stock',coalesce(v_consumed,0)>0,'physical_stock_changed',coalesce(v_consumed,0)>0);
end;
$function$;

create or replace function public.sync_vitrine_order_stock_reservation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_error text;
begin
  if new.source='vitrine' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if new.status='ready' and exists (
      select 1 from public.order_separation_completions_v1 c
      where c.order_id=new.id and coalesce((c.metadata->>'stock_applied')::boolean,false)=true
    ) then
      return new;
    end if;
    if new.status in ('processing','ready','out_for_delivery','delivered') then
      v_result:=public.consume_vitrine_order_stock_v1(new.id);
      if coalesce((v_result->>'ok')::boolean,false) is not true then
        v_error:=coalesce(nullif(v_result->>'error',''),'unknown');
        raise exception 'order_stock_consume_failed:%',v_error using errcode='P0001';
      end if;
    elsif new.status in ('cancelled','returned') then
      perform public.release_vitrine_order_stock_v1(new.id);
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.ops2_apply_order_separation_stock_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $function$
declare
  v_completion public.order_separation_completions_v1%rowtype;
  v_missing_components jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_order_status text;
  v_cutover timestamptz;
  r record;
  v_delta numeric;
  v_stock numeric;
  v_deliverable_qty numeric;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','invalid_order_id'); end if;
  select status into v_order_status from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  select * into v_completion from public.order_separation_completions_v1 where order_id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','separation_completion_not_prepared'); end if;
  if coalesce((v_completion.metadata->>'stock_applied')::boolean,false) then
    if v_order_status in ('confirmed','processing') then
      update public.orders set status='ready',updated_at=v_now where id=p_order_id;
      v_order_status:='ready';
    end if;
    return jsonb_build_object('ok',true,'status','already_applied','physical_stock_changed',false,
      'stock_source','supabase_products_stock','phase',v_completion.phase,'local_order_status',v_order_status,'metadata',v_completion.metadata);
  end if;
  if v_order_status not in ('confirmed','processing','ready') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order_status);
  end if;
  select nullif(metadata->>'ops2_supabase_stock_authority_at','')::timestamptz into v_cutover
  from public.bling_hub_runtime_v2 where id=1;

  for r in
    select vr.id,vr.product_id,vr.quantity,vr.status,vr.consumed_at,
      coalesce(d.deliverable_qty,0)::numeric as deliverable_qty
    from public.vitrine_stock_reservations vr
    left join (
      select s.product_id,
        sum(case when coalesce(oi.metadata->>'history_kind','')='basket_component'
          then greatest(0,s.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0))
          else s.quantity end)::numeric as deliverable_qty
      from public.order_separation_items_v1 s
      join public.order_items oi on oi.id=s.order_item_id
      where s.order_id=p_order_id and s.state='separated' and s.product_id is not null
      group by s.product_id
    ) d on d.product_id=vr.product_id
    where vr.order_id=p_order_id
    order by vr.product_id
    for update of vr
  loop
    if r.status='consumed' and coalesce(r.consumed_at,v_now)>=v_cutover then
      v_delta:=r.quantity-r.deliverable_qty;
    else
      v_delta:=-r.deliverable_qty;
    end if;
    if v_delta<>0 then
      select coalesce(stock,0) into v_stock from public.products where id=r.product_id for update;
      if not found then raise exception 'separation_stock_product_missing:%',r.product_id using errcode='P0001'; end if;
      if v_stock+v_delta<0 then
        raise exception 'separation_stock_below_zero:%:%',r.product_id,v_stock+v_delta using errcode='P0001';
      end if;
      update public.products set stock=v_stock+v_delta,updated_at=v_now where id=r.product_id;
    end if;
    if r.deliverable_qty<=0 then
      update public.vitrine_stock_reservations set status='released',released_at=v_now,consumed_at=null,updated_at=v_now where id=r.id;
    else
      update public.vitrine_stock_reservations set quantity=r.deliverable_qty,status='consumed',consumed_at=v_now,released_at=null,updated_at=v_now where id=r.id;
    end if;
  end loop;

  -- Older orders can reach separation without a reservation row. Apply only
  -- quantities actually marked as separated; preassembled basket components
  -- were already consumed when the basket lot was assembled.
  for r in
    select s.product_id,
      sum(case when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(0,s.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0))
        else s.quantity end)::numeric as quantity
    from public.order_separation_items_v1 s
    join public.order_items oi on oi.id=s.order_item_id
    where s.order_id=p_order_id and s.state='separated' and s.product_id is not null
      and not exists(select 1 from public.vitrine_stock_reservations vr where vr.order_id=p_order_id and vr.product_id=s.product_id)
    group by s.product_id
  loop
    if r.quantity>0 then
      select coalesce(stock,0) into v_stock from public.products where id=r.product_id for update;
      if not found then raise exception 'separation_stock_product_missing:%',r.product_id using errcode='P0001'; end if;
      if v_stock<r.quantity then raise exception 'separation_stock_below_zero:%:%',r.product_id,v_stock-r.quantity using errcode='P0001'; end if;
      update public.products set stock=v_stock-r.quantity,updated_at=v_now where id=r.product_id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'order_item_id',s.order_item_id,'product_id',s.product_id,'quantity',s.quantity,
    'basket_id',nullif(oi.metadata->>'basket_id',''),'basket_name',nullif(oi.metadata->>'basket_name','')))),'[]'::jsonb)
    into v_missing_components
  from public.order_separation_items_v1 s join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id and s.state='missing';
  update public.basket_stock_allocations
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('separation_v2_missing_components',v_missing_components,'separation_v2_applied_at',v_now)
    where order_id=p_order_id;
  update public.order_separation_completions_v1
    set phase='stock_applied',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'stock_applied',true,'stock_authority','supabase','stock_source','products.stock',
      'physical_stock_changed',true,'missing_components',v_missing_components,'stock_applied_at',v_now),updated_at=v_now
    where order_id=p_order_id;
  if v_order_status in ('confirmed','processing') then
    update public.orders set status='ready',updated_at=v_now where id=p_order_id;
    v_order_status:='ready';
  end if;
  return jsonb_build_object('ok',true,'status','stock_applied','stock_authority','supabase',
    'stock_source','products.stock','physical_stock_changed',true,'local_order_status',v_order_status,
    'missing_components',v_missing_components);
end;
$function$;

create or replace function public.vitrine_stock_allocate_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_res public.vitrine_stock_reservations%rowtype;
  v_lot record;
  v_alloc record;
  v_need numeric(18,6);
  v_take numeric(18,6);
  v_available numeric(18,6);
  v_reconcile_id uuid;
  v_allocated numeric(18,6):=0;
  v_reconciled numeric(18,6):=0;
begin
  select * into v_res from public.vitrine_stock_reservations where id=p_reservation_id for update;
  if not found then return jsonb_build_object('ok',false,'error','reservation_not_found'); end if;
  if v_res.status not in ('reserved','consumed') then return jsonb_build_object('ok',true,'skipped',true,'status',v_res.status); end if;
  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity from public.vitrine_stock_reservation_lots a
    where a.reservation_id=p_reservation_id and a.status='reserved' for update
  loop
    update public.product_inventory_lots set quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),updated_at=now() where id=v_alloc.lot_id;
    update public.vitrine_stock_reservation_lots set status='released',released_at=now(),updated_at=now() where id=v_alloc.id;
  end loop;
  v_need:=v_res.quantity;
  for v_lot in
    select l.id,l.quantity_on_hand,l.quantity_reserved
    from public.product_inventory_lots l
    where l.product_id=v_res.product_id and l.status='active' and l.source<>'bling'
      and coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0)>0
    order by coalesce(l.received_at,l.created_at),l.created_at,l.id for update
  loop
    exit when v_need<=0;
    v_available:=greatest(coalesce(v_lot.quantity_on_hand,0)-coalesce(v_lot.quantity_reserved,0),0);
    v_take:=least(v_need,v_available);
    if v_take<=0 then continue; end if;
    insert into public.vitrine_stock_reservation_lots(reservation_id,lot_id,product_id,allocated_quantity,status,metadata,updated_at)
    values(v_res.id,v_lot.id,v_res.product_id,v_take,'reserved',jsonb_build_object('allocation','fifo_local'),now())
    on conflict(reservation_id,lot_id) do update set allocated_quantity=excluded.allocated_quantity,status='reserved',consumed_at=null,released_at=null,
      metadata=public.vitrine_stock_reservation_lots.metadata||excluded.metadata,updated_at=now();
    update public.product_inventory_lots set quantity_reserved=quantity_reserved+v_take,updated_at=now() where id=v_lot.id;
    v_need:=v_need-v_take; v_allocated:=v_allocated+v_take;
  end loop;
  if v_need>0 then
    insert into public.product_inventory_lots(product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,metadata)
    values(v_res.product_id,null,null,v_need,0,'active','legacy','local-stock-reservation:'||v_res.id::text||':'||gen_random_uuid()::text,now(),
      jsonb_build_object('reason','products_stock_authoritative_fifo_ledger_fallback','reservation_id',v_res.id,'catalog_stock_already_reserved',true))
    returning id into v_reconcile_id;
    insert into public.vitrine_stock_reservation_lots(reservation_id,lot_id,product_id,allocated_quantity,status,metadata)
    values(v_res.id,v_reconcile_id,v_res.product_id,v_need,'reserved',jsonb_build_object('allocation','supabase_stock_ledger_fallback'));
    update public.product_inventory_lots set quantity_reserved=quantity_reserved+v_need,updated_at=now() where id=v_reconcile_id;
    v_reconciled:=v_need; v_allocated:=v_allocated+v_need; v_need:=0;
  end if;
  return jsonb_build_object('ok',true,'reservation_id',v_res.id,'allocated_quantity',v_allocated,'reconciled_quantity',v_reconciled,'remaining_quantity',v_need);
end;
$function$;

create or replace function public.vitrine_stock_release_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_alloc record;
  v_released numeric(18,6):=0;
begin
  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity,a.status,l.source
    from public.vitrine_stock_reservation_lots a
    join public.product_inventory_lots l on l.id=a.lot_id
    where a.reservation_id=p_reservation_id and a.status in ('reserved','consumed') for update of a,l
  loop
    if v_alloc.status='reserved' then
      update public.product_inventory_lots set quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),updated_at=now() where id=v_alloc.lot_id;
    elsif v_alloc.status='consumed' and v_alloc.source<>'bling' then
      update public.product_inventory_lots set quantity_on_hand=coalesce(quantity_on_hand,0)+v_alloc.allocated_quantity,status='active',updated_at=now() where id=v_alloc.lot_id;
    end if;
    update public.vitrine_stock_reservation_lots set status='released',released_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('restored_quantity',v_alloc.status='consumed' and v_alloc.source<>'bling','legacy_bling_lot_restore_skipped',v_alloc.status='consumed' and v_alloc.source='bling'),
      updated_at=now() where id=v_alloc.id;
    v_released:=v_released+v_alloc.allocated_quantity;
  end loop;
  return jsonb_build_object('ok',true,'reservation_id',p_reservation_id,'released_quantity',v_released,'stock_authority','supabase');
end;
$function$;

create or replace function public.ops2_activate_bling_stock_authority_v1()
returns jsonb
language sql security definer set search_path=public
as $function$ select jsonb_build_object('ok',false,'error','supabase_stock_authority_fixed','authority','supabase'); $function$;

create or replace function public.ops2_rollback_bling_stock_authority_v1(p_reason text)
returns jsonb
language sql security definer set search_path=public
as $function$ select jsonb_build_object('ok',false,'error','supabase_stock_authority_fixed','authority','supabase'); $function$;

