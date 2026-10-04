begin;

-- Snapshot current Bling-authoritative loose stock as the oldest internal FIFO layer.
-- Existing active internal lots are subtracted so this is idempotent and cannot double count.
insert into public.product_inventory_lots(
  product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,
  status,source,source_ref,received_at,metadata
)
select
  s.product_id,null,null,
  greatest(coalesce(s.loose_sellable_stock,0)-coalesce(x.tracked_quantity,0),0),
  0,'active','legacy','fifo-baseline:'||s.product_id::text,
  timestamptz '2000-01-01 00:00:00+00',
  jsonb_build_object(
    'reason','fifo_initial_baseline',
    'stock_authority',s.stock_authority,
    'captured_loose_sellable_stock',s.loose_sellable_stock,
    'existing_tracked_quantity',coalesce(x.tracked_quantity,0),
    'expiration_known',false
  )
from public.ops2_loose_sellable_stock_v1 s
left join lateral (
  select coalesce(sum(coalesce(l.quantity_on_hand,0)),0) tracked_quantity
  from public.product_inventory_lots l
  where l.product_id=s.product_id and l.status='active'
) x on true
where greatest(coalesce(s.loose_sellable_stock,0)-coalesce(x.tracked_quantity,0),0)>0
on conflict (source,source_ref) where source_ref is not null do nothing;

-- Backfill optional expiry from real NF-e trace evidence when available.
update public.purchase_xml_items i
   set lot_expiration_date=e.expiration_date,
       updated_at=now()
  from (
    select purchase_item_id,min(expiration_date) expiration_date
      from public.purchase_xml_item_lot_evidence
     where expiration_date is not null
     group by purchase_item_id
  ) e
 where i.id=e.purchase_item_id and i.lot_expiration_date is null;

-- Replay imported XML items through the already-installed idempotent lot synchronizer.
update public.purchase_xml_items
   set processing_status=processing_status,
       updated_at=updated_at
 where product_id is not null
   and coalesce(converted_quantity,0)>0;

create or replace function public.vitrine_stock_allocate_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res public.vitrine_stock_reservations%rowtype;
  v_lot record;
  v_alloc record;
  v_need numeric(18,6);
  v_take numeric(18,6);
  v_available numeric(18,6);
  v_authority text;
  v_reconcile_id uuid;
  v_allocated numeric(18,6):=0;
  v_reconciled numeric(18,6):=0;
begin
  select * into v_res
    from public.vitrine_stock_reservations
   where id=p_reservation_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'error','reservation_not_found');
  end if;
  if v_res.status not in ('reserved','consumed') then
    return jsonb_build_object('ok',true,'skipped',true,'status',v_res.status);
  end if;

  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity
      from public.vitrine_stock_reservation_lots a
     where a.reservation_id=p_reservation_id and a.status='reserved'
     for update
  loop
    update public.product_inventory_lots
       set quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),
           updated_at=now()
     where id=v_alloc.lot_id;
    update public.vitrine_stock_reservation_lots
       set status='released',released_at=now(),updated_at=now()
     where id=v_alloc.id;
  end loop;

  v_need:=v_res.quantity;

  for v_lot in
    select l.id,l.quantity_on_hand,l.quantity_reserved
      from public.product_inventory_lots l
     where l.product_id=v_res.product_id
       and l.status='active'
       and coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0)>0
     order by coalesce(l.received_at,l.created_at),l.created_at,l.id
     for update
  loop
    exit when v_need<=0;
    v_available:=greatest(coalesce(v_lot.quantity_on_hand,0)-coalesce(v_lot.quantity_reserved,0),0);
    v_take:=least(v_need,v_available);
    if v_take<=0 then continue; end if;

    insert into public.vitrine_stock_reservation_lots(
      reservation_id,lot_id,product_id,allocated_quantity,status,metadata,updated_at
    ) values(
      v_res.id,v_lot.id,v_res.product_id,v_take,'reserved',
      jsonb_build_object('allocation','fifo'),now()
    )
    on conflict(reservation_id,lot_id) do update set
      allocated_quantity=excluded.allocated_quantity,
      status='reserved',consumed_at=null,released_at=null,
      metadata=public.vitrine_stock_reservation_lots.metadata || excluded.metadata,
      updated_at=now();

    update public.product_inventory_lots
       set quantity_reserved=quantity_reserved+v_take,updated_at=now()
     where id=v_lot.id;
    v_need:=v_need-v_take;
    v_allocated:=v_allocated+v_take;
  end loop;

  if v_need>0 then
    select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
      into v_authority
      from public.bling_hub_runtime_v2 where id=1;

    if v_authority<>'bling' then
      raise exception 'insufficient_fifo_lot_stock';
    end if;

    insert into public.product_inventory_lots(
      product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,
      status,source,source_ref,received_at,metadata
    ) values(
      v_res.product_id,null,null,v_need,0,'active','bling',
      'reconcile-vitrine-reservation:'||v_res.id::text||':'||gen_random_uuid()::text,
      now(),
      jsonb_build_object(
        'reason','internal_fifo_shortfall_under_bling_authority',
        'reservation_id',v_res.id,
        'authoritative_reservation_already_accepted',true
      )
    ) returning id into v_reconcile_id;

    insert into public.vitrine_stock_reservation_lots(
      reservation_id,lot_id,product_id,allocated_quantity,status,metadata
    ) values(
      v_res.id,v_reconcile_id,v_res.product_id,v_need,'reserved',
      jsonb_build_object('allocation','bling_reconciliation')
    );
    update public.product_inventory_lots
       set quantity_reserved=quantity_reserved+v_need,updated_at=now()
     where id=v_reconcile_id;
    v_reconciled:=v_need;
    v_allocated:=v_allocated+v_need;
    v_need:=0;
  end if;

  return jsonb_build_object(
    'ok',true,'reservation_id',v_res.id,
    'allocated_quantity',v_allocated,
    'reconciled_quantity',v_reconciled,
    'remaining_quantity',v_need
  );
end;
$$;

revoke all on function public.vitrine_stock_allocate_fifo_v1(uuid) from public, anon, authenticated;

create or replace function public.vitrine_stock_consume_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res public.vitrine_stock_reservations%rowtype;
  v_alloc record;
  v_reserved numeric(18,6):=0;
  v_consumed numeric(18,6):=0;
begin
  select * into v_res from public.vitrine_stock_reservations where id=p_reservation_id for update;
  if not found then return jsonb_build_object('ok',false,'error','reservation_not_found'); end if;

  select coalesce(sum(allocated_quantity),0) into v_reserved
    from public.vitrine_stock_reservation_lots
   where reservation_id=p_reservation_id and status='reserved';

  if v_reserved < v_res.quantity then
    perform public.vitrine_stock_allocate_fifo_v1(p_reservation_id);
  end if;

  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity
      from public.vitrine_stock_reservation_lots a
     where a.reservation_id=p_reservation_id and a.status='reserved'
     order by a.created_at,a.id
     for update
  loop
    update public.product_inventory_lots
       set quantity_on_hand=greatest(coalesce(quantity_on_hand,0)-v_alloc.allocated_quantity,0),
           quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),
           status=case
             when greatest(coalesce(quantity_on_hand,0)-v_alloc.allocated_quantity,0)<=0 then 'depleted'
             else status
           end,
           updated_at=now()
     where id=v_alloc.lot_id;
    update public.vitrine_stock_reservation_lots
       set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
     where id=v_alloc.id;
    v_consumed:=v_consumed+v_alloc.allocated_quantity;
  end loop;

  return jsonb_build_object('ok',true,'reservation_id',p_reservation_id,'consumed_quantity',v_consumed);
end;
$$;

revoke all on function public.vitrine_stock_consume_fifo_v1(uuid) from public, anon, authenticated;

create or replace function public.vitrine_stock_release_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alloc record;
  v_authority text;
  v_released numeric(18,6):=0;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority from public.bling_hub_runtime_v2 where id=1;

  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity,a.status
      from public.vitrine_stock_reservation_lots a
     where a.reservation_id=p_reservation_id and a.status in ('reserved','consumed')
     for update
  loop
    if v_alloc.status='reserved' then
      update public.product_inventory_lots
         set quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),
             updated_at=now()
       where id=v_alloc.lot_id;
    elsif v_alloc.status='consumed' and v_authority<>'bling' then
      update public.product_inventory_lots
         set quantity_on_hand=coalesce(quantity_on_hand,0)+v_alloc.allocated_quantity,
             status='active',updated_at=now()
       where id=v_alloc.lot_id;
    end if;

    update public.vitrine_stock_reservation_lots
       set status='released',released_at=now(),
           metadata=metadata || jsonb_build_object(
             'restored_quantity',v_alloc.status='consumed' and v_authority<>'bling',
             'bling_physical_restore_skipped',v_alloc.status='consumed' and v_authority='bling'
           ),
           updated_at=now()
     where id=v_alloc.id;
    v_released:=v_released+v_alloc.allocated_quantity;
  end loop;

  return jsonb_build_object('ok',true,'reservation_id',p_reservation_id,'released_quantity',v_released,'stock_authority',v_authority);
end;
$$;

revoke all on function public.vitrine_stock_release_fifo_v1(uuid) from public, anon, authenticated;

create or replace function public.vitrine_stock_reservation_lot_sync_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op='INSERT' then
    if new.status='reserved' then perform public.vitrine_stock_allocate_fifo_v1(new.id); end if;
    return new;
  end if;

  if new.status='reserved'
     and (old.status is distinct from new.status or old.quantity is distinct from new.quantity or old.product_id is distinct from new.product_id) then
    perform public.vitrine_stock_allocate_fifo_v1(new.id);
  elsif new.status='consumed' and old.status is distinct from new.status then
    perform public.vitrine_stock_consume_fifo_v1(new.id);
  elsif new.status='released' and old.status is distinct from new.status then
    perform public.vitrine_stock_release_fifo_v1(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.vitrine_stock_reservation_lot_sync_v1() from public, anon, authenticated;

drop trigger if exists vitrine_stock_reservation_lot_sync_v1 on public.vitrine_stock_reservations;
create trigger vitrine_stock_reservation_lot_sync_v1
after insert or update of status,quantity,product_id
on public.vitrine_stock_reservations
for each row execute function public.vitrine_stock_reservation_lot_sync_v1();

create or replace function public.vitrine_stock_reservation_lot_delete_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.status in ('reserved','consumed') then
    perform public.vitrine_stock_release_fifo_v1(old.id);
  end if;
  return old;
end;
$$;

revoke all on function public.vitrine_stock_reservation_lot_delete_v1() from public, anon, authenticated;

drop trigger if exists vitrine_stock_reservation_lot_delete_v1 on public.vitrine_stock_reservations;
create trigger vitrine_stock_reservation_lot_delete_v1
before delete on public.vitrine_stock_reservations
for each row execute function public.vitrine_stock_reservation_lot_delete_v1();

-- Existing open reservations must be represented in the FIFO layer. Historical consumed
-- reservations are not replayed because Bling already reflects those sales.
do $$
declare r record;
begin
  for r in
    select id from public.vitrine_stock_reservations
     where status='reserved' and expires_at>now()
     order by created_at,id
  loop
    perform public.vitrine_stock_allocate_fifo_v1(r.id);
  end loop;
end;
$$;

commit;