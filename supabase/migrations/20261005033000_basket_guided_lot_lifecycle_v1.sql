-- Dona Antônia · Cestas/Kits: ciclo de vida do lote reservado v1
begin;

create or replace function public.update_basket_reserved_lot_v1(
  p_lot_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_public_name text,
  p_sale_price numeric,
  p_operator text default null,
  p_notes text default null,
  p_linked_lot_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_kit public.basket_kit_templates%rowtype;
  v_template public.basket_kit_template_items%rowtype;
  v_item jsonb;
  v_req record;
  v_product_id uuid;
  v_item_id uuid;
  v_source_id uuid;
  v_qty numeric;
  v_family text;
  v_seen_items uuid[]:=array[]::uuid[];
  v_old_reserved numeric;
  v_new_required numeric;
  v_loose_sellable_stock numeric;
  v_available_with_old_reserved numeric;
  v_linked_sale numeric:=0;
  v_final_sale numeric;
  v_own_sale numeric;
  v_name text;
  v_commercial jsonb;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  if coalesce(v_lot.metadata->>'guided_reserved_lot_v1','false')<>'true' then raise exception 'guided_reserved_lot_required'; end if;
  if not (v_lot.status='draft' and v_lot.assembly_status='assembling') then raise exception 'reserved_lot_not_editable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'lot_sale_must_be_disabled'; end if;
  if exists(select 1 from public.basket_stock_allocations a where a.lot_id=p_lot_id) then raise exception 'lot_has_order_history'; end if;
  if exists(select 1 from public.basket_stock_lots d where d.id<>p_lot_id and d.status in ('draft','ready') and (d.linked_lot_id=p_lot_id or d.linked_hygiene_lot_id=p_lot_id)) then raise exception 'lot_is_dependency'; end if;
  if coalesce(p_quantity,0)<1 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>120 then raise exception 'empty_lot_composition'; end if;

  select * into v_kit from public.basket_kit_templates where id=v_lot.kit_template_id and is_active=true;
  if not found then raise exception 'basket_kit_template_not_found'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin v_product_id:=(v_item->>'product_id')::uuid; exception when others then raise exception 'invalid_lot_product'; end;
    begin v_item_id:=(v_item->>'kit_template_item_id')::uuid; exception when others then raise exception 'invalid_kit_template_item'; end;
    begin v_qty:=(v_item->>'quantity_per_basket')::numeric; exception when others then raise exception 'invalid_lot_component_quantity'; end;
    if v_qty<=0 or v_qty>100 then raise exception 'invalid_lot_component_quantity'; end if;
    if v_item_id=any(v_seen_items) then raise exception 'duplicate_kit_template_item'; end if;
    v_seen_items:=array_append(v_seen_items,v_item_id);
    select * into v_template from public.basket_kit_template_items where id=v_item_id and kit_template_id=v_kit.id;
    if not found then raise exception 'invalid_kit_template_item'; end if;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then raise exception 'lot_product_unavailable'; end if;
    if not v_template.quantity_editable and v_qty<>v_template.quantity then raise exception 'fixed_position_quantity_changed'; end if;
    if v_qty<coalesce(v_template.min_quantity,0) or (v_template.max_quantity is not null and v_qty>v_template.max_quantity) then raise exception 'position_quantity_out_of_bounds'; end if;
    select m.family_key into v_family from public.basket_lot_substitution_products m where m.product_id=v_template.product_id;
    if v_family is not null and v_product_id<>v_template.product_id and not exists(select 1 from public.basket_lot_substitution_products m where m.product_id=v_product_id and m.family_key=v_family) then raise exception 'position_product_not_in_family'; end if;
  end loop;

  if exists(select 1 from public.basket_kit_template_items t where t.kit_template_id=v_kit.id and t.removable=false and not (t.id=any(v_seen_items))) then raise exception 'required_position_missing'; end if;

  for v_req in
    with new_need as (
      select (value->>'product_id')::uuid product_id,
             sum((value->>'quantity_per_basket')::numeric)*p_quantity new_required
      from jsonb_array_elements(p_items)
      group by (value->>'product_id')::uuid
    ), old_need as (
      select r.product_id,r.quantity_reserved old_reserved
      from public.basket_lot_component_reservations r
      where r.lot_id=p_lot_id and r.status='active'
    )
    select coalesce(n.product_id,o.product_id) product_id,
           coalesce(n.new_required,0)::numeric new_required,
           coalesce(o.old_reserved,0)::numeric old_reserved
    from new_need n full join old_need o on o.product_id=n.product_id
    order by coalesce(n.product_id,o.product_id)
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_req.product_id::text,0));
    perform 1 from public.products where id=v_req.product_id for update;
    v_old_reserved:=v_req.old_reserved;
    v_new_required:=v_req.new_required;
    v_loose_sellable_stock:=0;
    select coalesce(s.loose_sellable_stock,0) into v_loose_sellable_stock from public.ops2_loose_sellable_stock_v1 s where s.product_id=v_req.product_id;
    v_available_with_old_reserved:=coalesce(v_loose_sellable_stock,0)+coalesce(v_old_reserved,0);
    if v_available_with_old_reserved<v_new_required then raise exception 'insufficient_loose_stock:%',v_req.product_id; end if;
  end loop;

  delete from public.basket_stock_lot_items where lot_id=p_lot_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id:=(v_item->>'product_id')::uuid;
    v_item_id:=(v_item->>'kit_template_item_id')::uuid;
    begin v_source_id:=nullif(v_item->>'source_template_item_id','')::uuid; exception when others then v_source_id:=null; end;
    v_qty:=(v_item->>'quantity_per_basket')::numeric;
    insert into public.basket_stock_lot_items(lot_id,source_template_item_id,kit_template_item_id,product_id,quantity_per_basket,position_order,substitution_reason,metadata)
    values(p_lot_id,v_source_id,v_item_id,v_product_id,v_qty,coalesce(nullif(v_item->>'position_order','')::integer,0),nullif(btrim(coalesce(v_item->>'substitution_reason','')),''),jsonb_build_object('position_label',nullif(v_item->>'position_label',''),'guided_position',true));
  end loop;

  with new_need as (
    select (value->>'product_id')::uuid product_id,
           sum((value->>'quantity_per_basket')::numeric)*p_quantity quantity_reserved
    from jsonb_array_elements(p_items)
    group by (value->>'product_id')::uuid
  )
  update public.basket_lot_component_reservations r
  set status='released',updated_at=now(),metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object('released_by_edit_at',now())
  where r.lot_id=p_lot_id and r.status='active' and not exists(select 1 from new_need n where n.product_id=r.product_id);

  insert into public.basket_lot_component_reservations(lot_id,product_id,quantity_reserved,status,metadata)
  with new_need as (
    select (value->>'product_id')::uuid product_id,
           sum((value->>'quantity_per_basket')::numeric)*p_quantity quantity_reserved
    from jsonb_array_elements(p_items)
    group by (value->>'product_id')::uuid
  )
  select p_lot_id,n.product_id,n.quantity_reserved,'active',jsonb_build_object('source','guided_reserved_lot_edit_v1','updated_at',now())
  from new_need n
  on conflict(lot_id,product_id) do update
    set quantity_reserved=excluded.quantity_reserved,status='active',updated_at=now(),metadata=coalesce(public.basket_lot_component_reservations.metadata,'{}'::jsonb)||excluded.metadata;

  update public.basket_stock_lots
  set quantity_built=p_quantity,quantity_available=0,composition_hash=md5(p_items::text),notes=nullif(btrim(coalesce(p_notes,'')),''),sale_enabled=false,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reservation_edited_at',now(),'reservation_edited_by',nullif(btrim(coalesce(p_operator,'')),''))
  where id=p_lot_id;

  v_final_sale:=round(coalesce(p_sale_price,v_lot.sale_price_override,0),2);
  v_name:=coalesce(nullif(btrim(coalesce(p_public_name,'')),''),v_lot.public_name);
  if p_linked_lot_id is not null then
    select coalesce(l.sale_price_override,l.own_sale_price_override,0) into v_linked_sale from public.basket_stock_lots l where l.id=p_linked_lot_id and l.status in ('draft','ready') and l.linked_lot_id is null;
    if not found then raise exception 'invalid_linked_lot'; end if;
  end if;
  v_own_sale:=round(v_final_sale-coalesce(v_linked_sale,0),2);
  if v_own_sale<0 then raise exception 'linked_price_exceeds_total'; end if;
  v_commercial:=public.apply_basket_kit_lot_commercial_v3(p_lot_id,v_name,v_own_sale,v_lot.business_type,p_linked_lot_id);
  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'status','draft','assembly_status','assembling','quantity_built',p_quantity,'commercial',v_commercial);
end;
$function$;

create or replace function public.mark_basket_reserved_lot_mounted_v1(p_lot_id uuid,p_operator text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_mismatch boolean;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  if coalesce(v_lot.metadata->>'guided_reserved_lot_v1','false')<>'true' then raise exception 'guided_reserved_lot_required'; end if;
  if not (v_lot.status='draft' and v_lot.assembly_status='assembling') then raise exception 'reserved_lot_not_mountable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'lot_sale_must_be_disabled'; end if;
  if exists(select 1 from public.basket_stock_allocations a where a.lot_id=p_lot_id) then raise exception 'lot_has_order_history'; end if;
  if v_lot.linked_lot_id is not null and not exists(select 1 from public.basket_stock_lots x where x.id=v_lot.linked_lot_id and x.status='ready' and x.assembly_status in ('legacy','mounted') and coalesce(x.quantity_available,0)>0 and x.linked_lot_id is null) then raise exception 'linked_lot_unavailable'; end if;

  select exists(
    with need as (
      select li.product_id,sum(li.quantity_per_basket*v_lot.quantity_built)::numeric qty
      from public.basket_stock_lot_items li where li.lot_id=p_lot_id group by li.product_id
    ), reserved as (
      select r.product_id,sum(r.quantity_reserved)::numeric qty
      from public.basket_lot_component_reservations r where r.lot_id=p_lot_id and r.status='active' group by r.product_id
    )
    select 1 from need n full join reserved r using(product_id) where coalesce(n.qty,0)<>coalesce(r.qty,0)
  ) into v_mismatch;
  if v_mismatch then raise exception 'lot_reservation_mismatch'; end if;

  update public.basket_lot_component_reservations
  set status='converted',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('mounted_at',now(),'mounted_by',nullif(btrim(coalesce(p_operator,'')),''))
  where lot_id=p_lot_id and status='active';

  update public.basket_stock_lots
  set status='ready',assembly_status='mounted',quantity_available=quantity_built,sale_enabled=false,
      built_at=now(),built_by=nullif(btrim(coalesce(p_operator,'')),''),updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('mounted_at',now(),'mounted_by',nullif(btrim(coalesce(p_operator,'')),''))
  where id=p_lot_id;

  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'status','ready','assembly_status','mounted','quantity_available',v_lot.quantity_built,'sale_enabled',false);
end;
$function$;

create or replace function public.cancel_basket_reserved_lot_v1(p_lot_id uuid,p_operator text default null,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  if coalesce(v_lot.metadata->>'guided_reserved_lot_v1','false')<>'true' then raise exception 'guided_reserved_lot_required'; end if;
  if v_lot.status='cancelled' then return jsonb_build_object('ok',true,'lot_id',p_lot_id,'status','cancelled','already_cancelled',true); end if;
  if v_lot.status not in ('draft','ready') then raise exception 'lot_not_cancellable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'lot_sale_must_be_disabled'; end if;
  if exists(select 1 from public.basket_stock_allocations a where a.lot_id=p_lot_id) then raise exception 'lot_has_order_history'; end if;
  if exists(select 1 from public.basket_stock_lots d where d.id<>p_lot_id and d.status in ('draft','ready') and (d.linked_lot_id=p_lot_id or d.linked_hygiene_lot_id=p_lot_id)) then raise exception 'lot_is_dependency'; end if;

  update public.basket_lot_component_reservations
  set status='released',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cancelled_at',now(),'cancelled_by',nullif(btrim(coalesce(p_operator,'')),''))
  where lot_id=p_lot_id and status='active';

  update public.basket_stock_lots
  set status='cancelled',assembly_status='legacy',quantity_available=0,
      quantity_dismantled=case when v_lot.status='ready' then quantity_built else quantity_dismantled end,
      sale_enabled=false,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cancelled_at',now(),'cancelled_by',nullif(btrim(coalesce(p_operator,'')),''),'cancel_reason',nullif(btrim(coalesce(p_reason,'')),''))
  where id=p_lot_id;

  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'status','cancelled','released_reservation',v_lot.assembly_status='assembling');
end;
$function$;

create or replace function public.reopen_basket_kit_lot_for_edit_v1(p_lot_id uuid,p_operator text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_history_count integer:=0;
  v_guided boolean:=false;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  if v_lot.kit_template_id is null then raise exception 'kit_lot_required'; end if;
  v_guided:=coalesce(v_lot.metadata->>'guided_reserved_lot_v1','false')='true';

  if v_lot.status='draft' then
    return jsonb_build_object('lot_id',v_lot.id,'short_code',v_lot.short_code,'status','draft','assembly_status',v_lot.assembly_status,'already_editing',true);
  end if;
  if v_lot.status<>'ready' then raise exception 'lot_not_editable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'lot_sale_must_be_disabled'; end if;
  if coalesce(v_lot.quantity_available,0)<>coalesce(v_lot.quantity_built,0) or coalesce(v_lot.quantity_dismantled,0)>0 then raise exception 'lot_already_changed'; end if;
  select count(*) into v_history_count from public.basket_stock_allocations a where a.lot_id=p_lot_id;
  if v_history_count>0 then raise exception 'lot_has_order_history'; end if;
  if exists(select 1 from public.basket_stock_lots d where d.id<>p_lot_id and d.status in ('draft','ready') and (d.linked_lot_id=p_lot_id or d.linked_hygiene_lot_id=p_lot_id)) then raise exception 'lot_is_dependency'; end if;

  if v_guided and v_lot.assembly_status='mounted' then
    insert into public.basket_lot_component_reservations(lot_id,product_id,quantity_reserved,status,metadata)
    select p_lot_id,li.product_id,sum(li.quantity_per_basket*v_lot.quantity_built),'active',jsonb_build_object('source','guided_reopen_v1','reopened_at',now())
    from public.basket_stock_lot_items li where li.lot_id=p_lot_id group by li.product_id
    on conflict(lot_id,product_id) do update
      set quantity_reserved=excluded.quantity_reserved,status='active',updated_at=now(),metadata=coalesce(public.basket_lot_component_reservations.metadata,'{}'::jsonb)||excluded.metadata;

    update public.basket_stock_lots
    set status='draft',assembly_status='assembling',quantity_available=0,sale_enabled=false,updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reopened_for_edit_at',now(),'reopened_for_edit_by',nullif(btrim(coalesce(p_operator,'')),''))
    where id=p_lot_id;

    return jsonb_build_object('lot_id',v_lot.id,'short_code',v_lot.short_code,'status','draft','assembly_status','assembling','already_editing',false,'reservation_restored',true);
  end if;

  update public.basket_stock_lots
  set status='draft',quantity_available=0,sale_enabled=false,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reopened_for_edit_at',now(),'reopened_for_edit_by',nullif(btrim(coalesce(p_operator,'')),''))
  where id=p_lot_id;

  return jsonb_build_object('lot_id',v_lot.id,'short_code',v_lot.short_code,'status','draft','assembly_status',v_lot.assembly_status,'already_editing',false);
end;
$function$;

revoke all on function public.update_basket_reserved_lot_v1(uuid,integer,jsonb,text,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function public.update_basket_reserved_lot_v1(uuid,integer,jsonb,text,numeric,text,text,uuid) to service_role;
revoke all on function public.mark_basket_reserved_lot_mounted_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_basket_reserved_lot_mounted_v1(uuid,text) to service_role;
revoke all on function public.cancel_basket_reserved_lot_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.cancel_basket_reserved_lot_v1(uuid,text,text) to service_role;
revoke all on function public.reopen_basket_kit_lot_for_edit_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.reopen_basket_kit_lot_for_edit_v1(uuid,text) to service_role;

commit;
