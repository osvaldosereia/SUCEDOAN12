-- Dona Antônia · montagem canônica de Cestas/Kits
create or replace function public.activate_basket_kit_lot_draft_v1(
  p_lot_id uuid,
  p_operator text default null
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_req record;
  v_available numeric;
  v_item_count integer;
  v_linked uuid;
begin
  select * into v_lot
  from public.basket_stock_lots
  where id=p_lot_id
  for update;
  if not found then raise exception 'draft_lot_not_found'; end if;
  if v_lot.status<>'draft' or v_lot.kit_template_id is null then raise exception 'draft_lot_required'; end if;

  select count(*) into v_item_count
  from public.basket_stock_lot_items
  where lot_id=p_lot_id;
  if v_item_count=0 then raise exception 'empty_lot_composition'; end if;

  perform p.id
  from public.products p
  where p.id in (select li.product_id from public.basket_stock_lot_items li where li.lot_id=p_lot_id)
  order by p.id
  for update;

  for v_req in
    select li.product_id,
           sum(li.quantity_per_basket*v_lot.quantity_built)::numeric as required
    from public.basket_stock_lot_items li
    where li.lot_id=p_lot_id
    group by li.product_id
  loop
    if not exists(select 1 from public.products where id=v_req.product_id and is_active=true) then
      raise exception 'lot_product_unavailable:%',v_req.product_id;
    end if;
    select loose_sellable_stock into v_available
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_req.product_id;
    if coalesce(v_available,0)<v_req.required then
      raise exception 'insufficient_loose_stock:%:%:%',v_req.product_id,coalesce(v_available,0),v_req.required;
    end if;
  end loop;

  v_linked:=coalesce(v_lot.linked_lot_id,v_lot.linked_hygiene_lot_id);
  if v_linked is not null then
    perform 1
    from public.basket_lot_public_availability_v1 a
    where a.lot_id=v_linked
      and a.availability_reason='available'
      and a.public_available>0
      and a.linked_lot_id is null;
    if not found then raise exception 'linked_lot_unavailable'; end if;
  end if;

  update public.basket_stock_lots
  set status='ready',
      quantity_available=quantity_built,
      built_at=now(),
      built_by=coalesce(nullif(trim(coalesce(p_operator,'')),''),built_by),
      sale_enabled=true,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'draft_activated_at',now(),
        'draft_activated_by',nullif(trim(coalesce(p_operator,'')),''),
        'auto_sale_enabled',true
      ),
      updated_at=now()
  where id=p_lot_id;

  return jsonb_build_object(
    'ok',true,
    'lot_id',p_lot_id,
    'status','ready',
    'short_code',v_lot.short_code,
    'quantity_built',v_lot.quantity_built,
    'sale_enabled',true
  );
end;
$function$;

revoke all on function public.activate_basket_kit_lot_draft_v1(uuid,text) from public,anon;
grant execute on function public.activate_basket_kit_lot_draft_v1(uuid,text) to authenticated,service_role;
