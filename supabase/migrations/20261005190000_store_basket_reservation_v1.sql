-- Dona Antônia · Cestas do Site: reserva física e montagem v1
-- A receita comercial não reserva estoque. Somente esta etapa física bloqueia componentes.
begin;

create or replace function public.store_basket_builds_v1(p_basket_id uuid)
returns jsonb language sql security definer set search_path='' as $function$
  select jsonb_build_object('builds',coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb))
  from (
    select l.created_at,jsonb_build_object(
      'lot_id',l.id,'basket_id',l.basket_id,'lot_code',l.lot_code,'status',l.status,
      'assembly_status',l.assembly_status,'quantity_built',l.quantity_built,
      'quantity_available',l.quantity_available,'sale_enabled',l.sale_enabled,
      'public_name',l.public_name,'sale_price',l.sale_price_override,
      'component_sum',l.component_sum_snapshot,'cost_sum',l.cost_sum_snapshot,
      'hidden_adjustment',l.hidden_adjustment_snapshot,'built_at',l.built_at,
      'built_by',l.built_by,'created_at',l.created_at,
      'active_reserved_quantity',coalesce(r.active_reserved_quantity,0)
    ) row_data
    from public.basket_stock_lots l
    left join lateral (
      select coalesce(sum(x.quantity_reserved),0)::numeric active_reserved_quantity
      from public.basket_lot_component_reservations x
      where x.lot_id=l.id and x.status='active'
    ) r on true
    where l.basket_id=p_basket_id
      and coalesce(l.metadata->>'store_basket_reserved_v1','false')='true'
    order by l.created_at desc limit 50
  ) x;
$function$;

create or replace function public.reserve_store_basket_recipe_v1(
  p_basket_id uuid,p_quantity integer,p_operator text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_basket_name text;
  v_basket_price numeric;
  v_category_slug text;
  v_business_type text;
  v_lot_id uuid:=gen_random_uuid();
  v_lot_code text;
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_req record;
  v_available numeric;
  v_component_sum numeric:=0;
  v_cost_sum numeric:=0;
  v_hidden numeric:=0;
  v_preview jsonb;
  v_hash text;
begin
  if p_basket_id is null then raise exception 'store_basket_required'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>500 then raise exception 'store_basket_quantity_invalid'; end if;

  select b.name,b.base_price,c.slug into v_basket_name,v_basket_price,v_category_slug
  from public.basket_templates b
  left join public.basket_categories c on c.id=b.category_id
  where b.id=p_basket_id and b.is_active=true;
  if not found then raise exception 'store_basket_not_found'; end if;
  if not exists(select 1 from public.store_basket_recipe_kits r where r.basket_id=p_basket_id) then
    raise exception 'store_basket_recipe_empty';
  end if;
  if exists(
    select 1 from public.store_basket_recipe_kits r
    join public.assembly_kits k on k.id=r.kit_id
    join public.assembly_kit_items i on i.kit_id=k.id
    join public.products p on p.id=i.product_id
    where r.basket_id=p_basket_id and (not k.is_active or not p.is_active)
  ) then raise exception 'store_basket_product_unavailable'; end if;

  v_preview:=public.preview_store_basket_recipe_v1(p_basket_id,p_quantity);
  if coalesce((v_preview->>'ok')::boolean,false)=false then raise exception 'insufficient_loose_stock'; end if;

  for v_req in
    with composition as (
      select i.product_id,sum(i.quantity*r.quantity)::numeric quantity_per_basket
      from public.store_basket_recipe_kits r
      join public.assembly_kits k on k.id=r.kit_id and k.is_active=true
      join public.assembly_kit_items i on i.kit_id=k.id
      where r.basket_id=p_basket_id group by i.product_id
    )
    select product_id,quantity_per_basket*p_quantity required from composition order by product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_req.product_id::text,0));
    perform 1 from public.products p where p.id=v_req.product_id and p.is_active=true for update;
    if not found then raise exception 'store_basket_product_unavailable:%',v_req.product_id; end if;
    v_available:=0;
    select coalesce(s.loose_sellable_stock,0) into v_available
    from public.ops2_loose_sellable_stock_v1 s where s.product_id=v_req.product_id;
    if coalesce(v_available,0)<v_req.required then raise exception 'insufficient_loose_stock:%',v_req.product_id; end if;
  end loop;

  select round(coalesce(sum(coalesce(p.price,0)*i.quantity*r.quantity),0),2),
         round(coalesce(sum(coalesce(p.cost,0)*i.quantity*r.quantity),0),2)
  into v_component_sum,v_cost_sum
  from public.store_basket_recipe_kits r
  join public.assembly_kits k on k.id=r.kit_id and k.is_active=true
  join public.assembly_kit_items i on i.kit_id=k.id
  join public.products p on p.id=i.product_id
  where r.basket_id=p_basket_id;
  v_hidden:=round(coalesce(v_basket_price,0)-v_component_sum,2);

  v_business_type:=case v_category_slug
    when 'cestas-completas' then 'basic_complete'
    when 'cestas-so-alimento' then 'basic_food'
    when 'kits-limpeza-e-higiene' then 'cleaning_hygiene'
    when 'kits-limpeza' then 'cleaning'
    when 'kits-higiene' then 'hygiene'
    else 'basic_complete' end;
  v_lot_code:='SB-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_lot_id::text,'-',''),1,8));

  select md5(coalesce(jsonb_agg(jsonb_build_object('product_id',q.product_id,'quantity',q.quantity_per_basket) order by q.product_id),'[]'::jsonb)::text)
  into v_hash
  from (
    select i.product_id,sum(i.quantity*r.quantity)::numeric quantity_per_basket
    from public.store_basket_recipe_kits r
    join public.assembly_kits k on k.id=r.kit_id and k.is_active=true
    join public.assembly_kit_items i on i.kit_id=k.id
    where r.basket_id=p_basket_id group by i.product_id
  ) q;

  insert into public.basket_stock_lots(
    id,basket_id,lot_code,status,quantity_built,quantity_available,composition_hash,
    built_at,built_by,notes,source,metadata,kit_template_id,lot_kind,short_code,
    sale_enabled,public_name,business_type,assembly_status,sale_price_override,
    own_sale_price_override,component_sum_snapshot,own_component_sum_snapshot,
    hidden_adjustment_snapshot,own_hidden_adjustment_snapshot,cost_sum_snapshot,own_cost_sum_snapshot
  ) values (
    v_lot_id,p_basket_id,v_lot_code,'draft',p_quantity,0,v_hash,now(),v_operator,
    nullif(btrim(coalesce(p_notes,'')),''),'admin',
    jsonb_build_object('store_basket_reserved_v1',true,'reserved_at',now(),'reserved_by',v_operator,'recipe_source','store_basket_recipe_kits'),
    null,'legacy_full',null,false,v_basket_name,v_business_type,'assembling',
    round(coalesce(v_basket_price,0),2),round(coalesce(v_basket_price,0),2),
    v_component_sum,v_component_sum,v_hidden,v_hidden,v_cost_sum,v_cost_sum
  );

  insert into public.basket_stock_lot_items(
    lot_id,source_template_item_id,product_id,quantity_per_basket,position_order,substitution_reason,metadata
  )
  select v_lot_id,null,q.product_id,q.quantity_per_basket,
         row_number() over(order by coalesce(p.name,''),q.product_id)::integer-1,null,
         jsonb_build_object('store_basket_recipe_v1',true,'source_kit_ids',coalesce(q.source_kit_ids,'[]'::jsonb))
  from (
    select i.product_id,sum(i.quantity*r.quantity)::numeric quantity_per_basket,
           jsonb_agg(distinct r.kit_id) source_kit_ids
    from public.store_basket_recipe_kits r
    join public.assembly_kits k on k.id=r.kit_id and k.is_active=true
    join public.assembly_kit_items i on i.kit_id=k.id
    where r.basket_id=p_basket_id group by i.product_id
  ) q join public.products p on p.id=q.product_id;

  insert into public.basket_lot_component_reservations(lot_id,product_id,quantity_reserved,status,metadata)
  select v_lot_id,li.product_id,li.quantity_per_basket*p_quantity,'active',
         jsonb_build_object('source','store_basket_reserved_v1','quantity_built',p_quantity)
  from public.basket_stock_lot_items li where li.lot_id=v_lot_id;

  return jsonb_build_object(
    'ok',true,'lot_id',v_lot_id,'lot_code',v_lot_code,'basket_id',p_basket_id,
    'status','draft','assembly_status','assembling','quantity_built',p_quantity,
    'quantity_available',0,'sale_enabled',false,'public_name',v_basket_name,
    'sale_price',round(coalesce(v_basket_price,0),2),'component_sum',v_component_sum,
    'cost_sum',v_cost_sum,'hidden_adjustment',v_hidden,'preview',v_preview
  );
end;
$function$;

create or replace function public.mount_store_basket_reservation_v1(p_lot_id uuid,p_operator text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_mismatch boolean:=false;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'store_basket_build_not_found'; end if;
  if coalesce(v_lot.metadata->>'store_basket_reserved_v1','false')<>'true' then raise exception 'store_basket_reservation_required'; end if;
  if not (v_lot.status='draft' and v_lot.assembly_status='assembling') then raise exception 'store_basket_reservation_not_mountable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'store_basket_reservation_already_sellable'; end if;
  if exists(select 1 from public.basket_stock_allocations a where a.lot_id=p_lot_id) then raise exception 'lot_has_order_history'; end if;
  if not exists(
    select 1 from public.basket_templates b
    join public.basket_categories c on c.id=b.category_id and c.is_active=true
    where b.id=v_lot.basket_id and b.is_active=true
  ) then raise exception 'store_basket_not_available'; end if;

  select exists(
    with need as (
      select li.product_id,sum(li.quantity_per_basket*v_lot.quantity_built)::numeric qty
      from public.basket_stock_lot_items li where li.lot_id=p_lot_id group by li.product_id
    ), reserved as (
      select r.product_id,sum(r.quantity_reserved)::numeric qty
      from public.basket_lot_component_reservations r
      where r.lot_id=p_lot_id and r.status='active' group by r.product_id
    )
    select 1 from need n full join reserved r using(product_id)
    where coalesce(n.qty,0)<>coalesce(r.qty,0)
  ) into v_mismatch;
  if v_mismatch then raise exception 'lot_reservation_mismatch'; end if;

  update public.basket_lot_component_reservations
  set status='converted',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('mounted_at',now(),'mounted_by',v_operator)
  where lot_id=p_lot_id and status='active';

  update public.basket_stock_lots
  set status='ready',assembly_status='mounted',quantity_available=quantity_built,
      sale_enabled=true,built_at=now(),built_by=v_operator,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('mounted_at',now(),'mounted_by',v_operator,'auto_sale_enabled',true)
  where id=p_lot_id;

  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'basket_id',v_lot.basket_id,
    'status','ready','assembly_status','mounted','quantity_built',v_lot.quantity_built,
    'quantity_available',v_lot.quantity_built,'sale_enabled',true);
end;
$function$;

create or replace function public.cancel_store_basket_reservation_v1(
  p_lot_id uuid,p_operator text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'store_basket_build_not_found'; end if;
  if coalesce(v_lot.metadata->>'store_basket_reserved_v1','false')<>'true' then raise exception 'store_basket_reservation_required'; end if;
  if v_lot.status='cancelled' then return jsonb_build_object('ok',true,'lot_id',p_lot_id,'status','cancelled','already_cancelled',true); end if;
  if not (v_lot.status='draft' and v_lot.assembly_status='assembling') then raise exception 'store_basket_reservation_not_cancellable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'store_basket_reservation_already_sellable'; end if;
  if exists(select 1 from public.basket_stock_allocations a where a.lot_id=p_lot_id) then raise exception 'lot_has_order_history'; end if;

  update public.basket_lot_component_reservations
  set status='released',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cancelled_at',now(),'cancelled_by',v_operator)
  where lot_id=p_lot_id and status='active';

  update public.basket_stock_lots
  set status='cancelled',assembly_status='legacy',quantity_available=0,sale_enabled=false,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cancelled_at',now(),'cancelled_by',v_operator,'cancel_reason',nullif(btrim(coalesce(p_reason,'')),''))
  where id=p_lot_id;

  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'basket_id',v_lot.basket_id,
    'status','cancelled','assembly_status','legacy','quantity_available',0,'sale_enabled',false,'released_reservation',true);
end;
$function$;

revoke all on function public.store_basket_builds_v1(uuid) from public,anon,authenticated;
grant execute on function public.store_basket_builds_v1(uuid) to service_role;
revoke all on function public.reserve_store_basket_recipe_v1(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_store_basket_recipe_v1(uuid,integer,text,text) to service_role;
revoke all on function public.mount_store_basket_reservation_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.mount_store_basket_reservation_v1(uuid,text) to service_role;
revoke all on function public.cancel_store_basket_reservation_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.cancel_store_basket_reservation_v1(uuid,text,text) to service_role;

commit;
