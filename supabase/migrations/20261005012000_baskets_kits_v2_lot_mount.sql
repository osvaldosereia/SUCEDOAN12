-- Dona Antônia · Cestas e Kits V2 lot drafts, mounting and FIFO snapshots

create or replace function public.basket_v2_lot_draft_save_v1(
  p_item_id uuid,
  p_lot_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_mode text;
  v_lot public.basket_v2_lots%rowtype;
  v_count integer;
begin
  if p_quantity is null or p_quantity < 1 then raise exception 'basket_v2_invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then raise exception 'basket_v2_invalid_lot_items'; end if;
  select composition_mode into v_mode from public.basket_v2_items where id=p_item_id and is_active=true;
  if v_mode is null then raise exception 'basket_v2_item_not_found'; end if;
  if v_mode <> 'products' then raise exception 'basket_v2_lot_only_products_mode'; end if;

  if p_lot_id is null then
    insert into public.basket_v2_lots(item_id,code,status,quantity_built,quantity_available)
    values(p_item_id,'V2-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'draft',p_quantity,0)
    returning * into v_lot;
  else
    select * into v_lot from public.basket_v2_lots where id=p_lot_id and item_id=p_item_id for update;
    if v_lot.id is null then raise exception 'basket_v2_lot_not_found'; end if;
    if v_lot.status <> 'draft' then raise exception 'basket_v2_lot_not_draft'; end if;
    update public.basket_v2_lots set quantity_built=p_quantity,quantity_available=0 where id=v_lot.id returning * into v_lot;
  end if;

  delete from public.basket_v2_lot_items where lot_id=v_lot.id;
  with parsed as (
    select product_id,quantity_per_kit,coalesce(position_order,0) position_order
    from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id uuid,quantity_per_kit numeric,position_order integer)
    where product_id is not null and quantity_per_kit > 0
  ), grouped as (
    select product_id,sum(quantity_per_kit)::numeric(12,3) quantity_per_kit,min(position_order) position_order
    from parsed group by product_id
  )
  insert into public.basket_v2_lot_items(lot_id,product_id,quantity_per_kit,unit_cost_snapshot,unit_price_snapshot,position_order)
  select v_lot.id,product_id,quantity_per_kit,null,null,position_order from grouped;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'basket_v2_lot_items_required'; end if;

  return jsonb_build_object('lot_id',v_lot.id,'code',v_lot.code,'status','draft','quantity',p_quantity,'item_count',v_count);
end $$;

create or replace function public.basket_v2_lot_mount_v1(p_lot_id uuid,p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_lot public.basket_v2_lots%rowtype;
  v_quantity integer;
  v_missing jsonb;
  v_insufficient jsonb;
  v_cost numeric(14,2);
  v_retail numeric(14,2);
begin
  select * into v_lot from public.basket_v2_lots where id=p_lot_id for update;
  if v_lot.id is null then raise exception 'basket_v2_lot_not_found'; end if;
  if v_lot.status <> 'draft' then raise exception 'basket_v2_lot_not_draft'; end if;
  if not exists(select 1 from public.basket_v2_items i where i.id=v_lot.item_id and i.composition_mode='products' and i.is_active=true) then
    raise exception 'basket_v2_lot_item_invalid';
  end if;
  v_quantity:=v_lot.quantity_built;
  if v_quantity is null or v_quantity<1 then raise exception 'basket_v2_invalid_lot_quantity'; end if;
  if not exists(select 1 from public.basket_v2_lot_items where lot_id=v_lot.id) then raise exception 'basket_v2_lot_items_required'; end if;

  select jsonb_agg(jsonb_build_object('product_id',li.product_id,'name',p.name) order by p.name)
  into v_missing
  from public.basket_v2_lot_items li
  join public.products p on p.id=li.product_id
  where li.lot_id=v_lot.id and (p.cost is null or p.cost<=0);
  if v_missing is not null then
    return jsonb_build_object('ok',false,'error','missing_cost_products','products',v_missing);
  end if;

  select jsonb_agg(jsonb_build_object(
    'product_id',li.product_id,'name',p.name,'required',li.quantity_per_kit*v_quantity,
    'available',coalesce(s.loose_sellable_stock,0)
  ) order by p.name)
  into v_insufficient
  from public.basket_v2_lot_items li
  join public.products p on p.id=li.product_id
  left join public.ops2_loose_sellable_stock_v1 s on s.product_id=li.product_id
  where li.lot_id=v_lot.id
    and coalesce(s.loose_sellable_stock,0) < li.quantity_per_kit*v_quantity;
  if v_insufficient is not null then
    return jsonb_build_object('ok',false,'error','insufficient_stock','products',v_insufficient);
  end if;

  update public.basket_v2_lot_items li
  set unit_cost_snapshot=round(p.cost::numeric,4),
      unit_price_snapshot=case when p.price is null then null else round(p.price::numeric,4) end
  from public.products p
  where li.lot_id=v_lot.id and p.id=li.product_id;

  select
    round(sum(li.quantity_per_kit*li.unit_cost_snapshot)::numeric,2),
    case when count(*) filter(where li.unit_price_snapshot is null)=0
         then round(sum(li.quantity_per_kit*li.unit_price_snapshot)::numeric,2)
         else null end
  into v_cost,v_retail
  from public.basket_v2_lot_items li where li.lot_id=v_lot.id;

  update public.basket_v2_lots
  set status='mounted',quantity_available=v_quantity,cost_total_snapshot=v_cost,
      retail_total_snapshot=v_retail,mounted_at=now()
  where id=v_lot.id;

  return jsonb_build_object('ok',true,'lot_id',v_lot.id,'status','mounted','quantity',v_quantity,
    'cost_total',v_cost,'retail_total',v_retail);
end $$;

create or replace function public.basket_v2_lot_draft_delete_v1(p_lot_id uuid,p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_status text;
begin
  select status into v_status from public.basket_v2_lots where id=p_lot_id for update;
  if v_status is null then raise exception 'basket_v2_lot_not_found'; end if;
  if v_status<>'draft' then raise exception 'basket_v2_only_draft_can_delete'; end if;
  delete from public.basket_v2_lots where id=p_lot_id;
  return jsonb_build_object('ok',true,'deleted',p_lot_id);
end $$;

create or replace function public.basket_v2_next_fifo_lot_v1(p_item_id uuid)
returns uuid
language sql
stable
set search_path=public
as $$
  select l.id from public.basket_v2_lots l
  where l.item_id=p_item_id and l.status='mounted' and l.quantity_available>0
  order by l.mounted_at,l.created_at,l.id
  limit 1
$$;

revoke all on function public.basket_v2_lot_draft_save_v1(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
revoke all on function public.basket_v2_lot_mount_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.basket_v2_lot_draft_delete_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.basket_v2_next_fifo_lot_v1(uuid) from public,anon,authenticated;
grant execute on function public.basket_v2_lot_draft_save_v1(uuid,uuid,integer,jsonb,text) to service_role;
grant execute on function public.basket_v2_lot_mount_v1(uuid,text) to service_role;
grant execute on function public.basket_v2_lot_draft_delete_v1(uuid,text) to service_role;
grant execute on function public.basket_v2_next_fifo_lot_v1(uuid) to service_role;
