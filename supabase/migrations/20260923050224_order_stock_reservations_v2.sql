create table if not exists public.order_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  unique(order_id, product_id)
);

create index if not exists order_stock_reservations_org_product_status_idx
  on public.order_stock_reservations(organization_id, product_id, status);

create index if not exists order_stock_reservations_order_status_idx
  on public.order_stock_reservations(order_id, status);

alter table public.order_stock_reservations enable row level security;
revoke all on table public.order_stock_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.order_stock_reservations to service_role;

drop policy if exists "service_role_order_stock_reservations" on public.order_stock_reservations;
create policy "service_role_order_stock_reservations"
  on public.order_stock_reservations
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.reserve_storefront_order_stock_v2(
  p_organization_id uuid,
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_physical numeric;
  v_reserved numeric;
  v_available numeric;
  v_existing_status text;
begin
  if p_organization_id is null or p_order_id is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok',false,'error','invalid_stock_request');
  end if;

  if not exists (select 1 from public.orders where id=p_order_id and organization_id=p_organization_id) then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  for v_row in select value from jsonb_array_elements(p_items) order by value->>'product_id'
  loop
    begin
      v_product_id := (v_row->>'product_id')::uuid;
      v_quantity := (v_row->>'quantity')::numeric;
    exception when others then
      return jsonb_build_object('ok',false,'error','invalid_stock_request');
    end;

    if v_quantity is null or v_quantity <= 0 then
      return jsonb_build_object('ok',false,'error','invalid_stock_request');
    end if;

    select status into v_existing_status
    from public.order_stock_reservations
    where order_id=p_order_id and product_id=v_product_id
    for update;

    if v_existing_status='consumed' then
      return jsonb_build_object('ok',false,'error','stock_already_consumed','product_id',v_product_id);
    end if;

    select p.stock_quantity into v_physical
    from public.products p
    where p.organization_id=p_organization_id and p.id=v_product_id and p.active=true
    for update;

    if not found then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',v_product_id);
    end if;

    select coalesce(sum(r.quantity),0) into v_reserved
    from public.order_stock_reservations r
    where r.organization_id=p_organization_id and r.product_id=v_product_id
      and r.status='reserved' and r.order_id<>p_order_id;

    v_available := coalesce(v_physical,0)-coalesce(v_reserved,0);

    if v_available < v_quantity then
      return jsonb_build_object('ok',false,'error','insufficient_stock','product_id',v_product_id,'available',greatest(v_available,0),'requested',v_quantity);
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_items) order by value->>'product_id'
  loop
    v_product_id := (v_row->>'product_id')::uuid;
    v_quantity := (v_row->>'quantity')::numeric;
    insert into public.order_stock_reservations(
      organization_id,order_id,product_id,quantity,status,updated_at,consumed_at,released_at
    ) values (
      p_organization_id,p_order_id,v_product_id,v_quantity,'reserved',now(),null,null
    )
    on conflict(order_id,product_id) do update
      set quantity=excluded.quantity,status='reserved',updated_at=now(),consumed_at=null,released_at=null;
  end loop;

  return jsonb_build_object('ok',true,'status','reserved');
end;
$$;

revoke all on function public.reserve_storefront_order_stock_v2(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_storefront_order_stock_v2(uuid,uuid,jsonb) to service_role;

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
begin
  select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
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
    where r.organization_id=p_organization_id and r.order_id=p_order_id and r.status='reserved'
    order by r.product_id
  loop
    perform 1 from public.products p
    where p.organization_id=p_organization_id and p.id=v_row.product_id
    for update;

    if not found then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',v_row.product_id);
    end if;

    if (select coalesce(stock_quantity,0) from public.products where id=v_row.product_id) < v_row.quantity then
      return jsonb_build_object('ok',false,'error','insufficient_physical_stock','product_id',v_row.product_id,'available',(select coalesce(stock_quantity,0) from public.products where id=v_row.product_id),'requested',v_row.quantity);
    end if;
  end loop;

  for v_row in
    select r.product_id,r.quantity
    from public.order_stock_reservations r
    where r.organization_id=p_organization_id and r.order_id=p_order_id and r.status='reserved'
    order by r.product_id
  loop
    update public.products
      set stock_quantity=stock_quantity-v_row.quantity,updated_at=now()
    where organization_id=p_organization_id and id=v_row.product_id;
  end loop;

  update public.order_stock_reservations
    set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
  where organization_id=p_organization_id and order_id=p_order_id and status='reserved';

  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false);
end;
$$;

revoke all on function public.consume_storefront_order_stock_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.consume_storefront_order_stock_v2(uuid,uuid) to service_role;

create or replace function public.release_storefront_order_stock_v2(
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
begin
  select count(*),count(*) filter(where status='consumed')
    into v_count,v_consumed
  from public.order_stock_reservations
  where organization_id=p_organization_id and order_id=p_order_id;

  if v_count=0 then
    return jsonb_build_object('ok',true,'status','released','nothing_to_release',true);
  end if;

  if not exists (
    select 1 from public.order_stock_reservations
    where organization_id=p_organization_id and order_id=p_order_id and status in ('reserved','consumed')
  ) then
    return jsonb_build_object('ok',true,'status','released','already_released',true);
  end if;

  if v_consumed>0 then
    for v_row in
      select r.product_id,r.quantity
      from public.order_stock_reservations r
      where r.organization_id=p_organization_id and r.order_id=p_order_id and r.status='consumed'
      order by r.product_id
    loop
      perform 1 from public.products p
      where p.organization_id=p_organization_id and p.id=v_row.product_id
      for update;

      update public.products
        set stock_quantity=stock_quantity+v_row.quantity,updated_at=now()
      where organization_id=p_organization_id and id=v_row.product_id;
    end loop;
  end if;

  update public.order_stock_reservations
    set status='released',released_at=now(),updated_at=now()
  where organization_id=p_organization_id and order_id=p_order_id and status in ('reserved','consumed');

  return jsonb_build_object('ok',true,'status','released','restored_physical_stock',(v_consumed>0));
end;
$$;

revoke all on function public.release_storefront_order_stock_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_storefront_order_stock_v2(uuid,uuid) to service_role;
