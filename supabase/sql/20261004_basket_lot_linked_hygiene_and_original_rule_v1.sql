begin;

alter table public.basket_stock_lots
  add column if not exists linked_hygiene_lot_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='basket_stock_lots_linked_hygiene_lot_id_fkey'
  ) then
    alter table public.basket_stock_lots
      add constraint basket_stock_lots_linked_hygiene_lot_id_fkey
      foreign key (linked_hygiene_lot_id)
      references public.basket_stock_lots(id)
      on delete restrict;
  end if;
end $$;

-- Backfill already-created food lots (including EB1) with the current ready hygiene lot.
with chosen_hygiene as (
  select l.id
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  where k.kind='hygiene' and k.is_active=true
    and l.status='ready' and l.quantity_available>0
  order by l.sale_enabled desc,l.built_at desc,l.created_at desc,l.id
  limit 1
)
update public.basket_stock_lots l
set linked_hygiene_lot_id=h.id,
    metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object('linked_hygiene_lot_id',h.id,'linked_hygiene_backfilled_at',now()),
    updated_at=now()
from public.basket_kit_templates k
join public.basket_templates b on b.id=k.basket_id and b.uses_hygiene_kit=true
cross join chosen_hygiene h
where l.kit_template_id=k.id
  and k.kind='food'
  and l.linked_hygiene_lot_id is null;

create or replace function public.basket_group_preserves_original_lot_v1(
  p_components jsonb,
  p_group text,
  p_lot_id uuid
) returns boolean
language sql
stable
set search_path=''
as $$
  with expected as (
    select li.product_id::text product_id,sum(li.quantity_per_basket)::numeric qty
    from public.basket_stock_lot_items li
    where li.lot_id=p_lot_id
    group by li.product_id
  ),
  supplied as (
    select x.value->>'product_id' product_id,
           sum(coalesce(nullif(x.value->>'quantity','')::numeric,0))::numeric qty
    from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) x(value)
    where coalesce(x.value->>'component_group','')=p_group
      and coalesce(x.value->>'product_id','')<>''
    group by x.value->>'product_id'
  ),
  diff as (
    select e.product_id,e.qty expected_qty,coalesce(s.qty,0) supplied_qty
    from expected e
    left join supplied s using(product_id)
  )
  select not exists(
    select 1 from diff where supplied_qty + 0.0001 < expected_qty
  );
$$;

create or replace function public.apply_basket_kit_lot_commercial_v2(
  p_lot_id uuid,
  p_public_name text,
  p_sale_price numeric,
  p_linked_hygiene_lot_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_kind text;
  v_basket_id uuid;
  v_default_name text;
  v_uses_hygiene boolean:=false;
  v_component numeric:=0;
  v_hygiene_component numeric:=0;
  v_hygiene_lot_id uuid;
  v_sale numeric;
  v_name text;
begin
  if p_lot_id is null then raise exception 'invalid_lot'; end if;
  if p_sale_price is null or p_sale_price<0 or p_sale_price>9999999 then raise exception 'invalid_sale_price'; end if;

  select k.kind,k.basket_id,coalesce(b.name,k.name),coalesce(b.uses_hygiene_kit,false)
    into v_kind,v_basket_id,v_default_name,v_uses_hygiene
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  left join public.basket_templates b on b.id=k.basket_id
  where l.id=p_lot_id;
  if not found then raise exception 'kit_lot_not_found'; end if;

  v_name:=coalesce(nullif(btrim(coalesce(p_public_name,'')),''),v_default_name);
  if v_name is null or char_length(v_name)>120 then raise exception 'invalid_public_name'; end if;
  v_sale:=round(p_sale_price,2);

  select round(coalesce(sum(li.quantity_per_basket*coalesce(p.price,0)),0),2)
    into v_component
  from public.basket_stock_lot_items li
  join public.products p on p.id=li.product_id
  where li.lot_id=p_lot_id;

  if v_kind='food' and v_uses_hygiene then
    v_hygiene_lot_id:=coalesce(
      p_linked_hygiene_lot_id,
      (select linked_hygiene_lot_id from public.basket_stock_lots where id=p_lot_id)
    );
    if v_hygiene_lot_id is not null and not exists(
      select 1
      from public.basket_stock_lots hl
      join public.basket_kit_templates hk on hk.id=hl.kit_template_id
      where hl.id=v_hygiene_lot_id and hk.kind='hygiene'
        and hl.status='ready' and hl.quantity_available>0
    ) then
      raise exception 'invalid_linked_hygiene_lot';
    end if;
    if v_hygiene_lot_id is not null then
      select round(coalesce(sum(li.quantity_per_basket*coalesce(p.price,0)),0),2)
        into v_hygiene_component
      from public.basket_stock_lot_items li
      join public.products p on p.id=li.product_id
      where li.lot_id=v_hygiene_lot_id;
      v_component:=round(v_component+coalesce(v_hygiene_component,0),2);
    end if;
  else
    v_hygiene_lot_id:=null;
  end if;

  update public.basket_stock_lots
     set public_name=v_name,
         linked_hygiene_lot_id=v_hygiene_lot_id,
         sale_price_override=v_sale,
         component_sum_snapshot=v_component,
         hidden_adjustment_snapshot=round(v_sale-v_component,2),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'public_name',v_name,
           'linked_hygiene_lot_id',v_hygiene_lot_id,
           'sale_price_override',v_sale,
           'component_sum_snapshot',v_component,
           'hidden_adjustment_snapshot',round(v_sale-v_component,2),
           'commercial_snapshot_kind',case when v_kind='food' then 'full_basket' else 'kit' end,
           'hygiene_lot_snapshot',v_hygiene_lot_id,
           'commercial_snapshot_at',now()
         ),
         updated_at=now()
   where id=p_lot_id;

  return jsonb_build_object(
    'ok',true,'lot_id',p_lot_id,'public_name',v_name,
    'linked_hygiene_lot_id',v_hygiene_lot_id,
    'sale_price_override',v_sale,'component_sum_snapshot',v_component,
    'hidden_adjustment_snapshot',round(v_sale-v_component,2),
    'hygiene_lot_snapshot',v_hygiene_lot_id
  );
end;
$$;

create or replace function public.save_basket_kit_lot_draft_v3(
  p_lot_id uuid,
  p_kit_template_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_duplicated_from_lot_id uuid default null,
  p_public_name text default null,
  p_sale_price numeric default null,
  p_linked_hygiene_lot_id uuid default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_result jsonb;
  v_commercial jsonb;
  v_lot_id uuid;
  v_kind text;
begin
  v_result:=public.save_basket_kit_lot_draft_v2(
    p_lot_id,p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,
    p_duplicated_from_lot_id,p_public_name,p_sale_price
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  select k.kind into v_kind
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  where l.id=v_lot_id;
  if v_kind='food' then
    v_commercial:=public.apply_basket_kit_lot_commercial_v2(
      v_lot_id,p_public_name,p_sale_price,p_linked_hygiene_lot_id
    );
    v_result:=v_result||jsonb_build_object('commercial',v_commercial);
  end if;
  return v_result;
end;
$$;

create or replace function public.create_basket_kit_lot_v3(
  p_kit_template_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_duplicated_from_lot_id uuid default null,
  p_public_name text default null,
  p_sale_price numeric default null,
  p_linked_hygiene_lot_id uuid default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_result jsonb;
  v_commercial jsonb;
  v_lot_id uuid;
  v_kind text;
begin
  v_result:=public.create_basket_kit_lot_v2(
    p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,
    p_duplicated_from_lot_id,p_public_name,p_sale_price
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  select k.kind into v_kind
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  where l.id=v_lot_id;
  if v_kind='food' then
    v_commercial:=public.apply_basket_kit_lot_commercial_v2(
      v_lot_id,p_public_name,p_sale_price,p_linked_hygiene_lot_id
    );
    v_result:=v_result||jsonb_build_object('commercial',v_commercial);
  end if;
  return v_result;
end;
$$;

create or replace function public.activate_basket_kit_lot_draft_v2(
  p_lot_id uuid,
  p_operator text default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_kind text;
  v_uses_hygiene boolean:=false;
  v_linked uuid;
begin
  select k.kind,coalesce(b.uses_hygiene_kit,false),l.linked_hygiene_lot_id
    into v_kind,v_uses_hygiene,v_linked
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  left join public.basket_templates b on b.id=k.basket_id
  where l.id=p_lot_id;
  if not found then raise exception 'draft_lot_not_found'; end if;

  if v_kind='food' and v_uses_hygiene then
    if v_linked is null then raise exception 'linked_hygiene_lot_required'; end if;
    if not exists(
      select 1 from public.basket_stock_lots hl
      join public.basket_kit_templates hk on hk.id=hl.kit_template_id
      where hl.id=v_linked and hk.kind='hygiene'
        and hl.status='ready' and hl.quantity_available>0
    ) then raise exception 'linked_hygiene_lot_unavailable'; end if;
  end if;

  return public.activate_basket_kit_lot_draft_v1(p_lot_id,p_operator);
end;
$$;

create or replace function public.basket_kit_lot_delete_v1(
  p_lot_id uuid,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lot public.basket_stock_lots%rowtype;
begin
  select * into v_lot
  from public.basket_stock_lots
  where id=p_lot_id
  for update;
  if not found then raise exception 'lot_not_found'; end if;

  if exists(select 1 from public.basket_stock_allocations a where a.lot_id=p_lot_id) then
    raise exception 'lot_has_order_history';
  end if;
  if exists(select 1 from public.basket_stock_lots f where f.linked_hygiene_lot_id=p_lot_id) then
    raise exception 'lot_linked_to_food_lot';
  end if;

  -- The generated-image feature is retired from basket-lot management.
  delete from public.basket_lot_images where lot_id=p_lot_id or hygiene_lot_id=p_lot_id;
  delete from public.basket_stock_lots where id=p_lot_id;

  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'deleted',true,'operator',nullif(btrim(coalesce(p_operator,'')),''));
end;
$$;

create or replace view public.basket_current_kit_lot_v2 as
select distinct on (kit_template_id)
  kit_template_id,id lot_id,basket_id,lot_kind,short_code,lot_code,
  quantity_built,quantity_available,composition_hash,built_at,built_by,
  duplicated_from_lot_id,source,metadata,sale_price_override,
  component_sum_snapshot,hidden_adjustment_snapshot,public_name,
  linked_hygiene_lot_id
from public.basket_stock_lots l
where kit_template_id is not null
  and status='ready' and quantity_available>0 and sale_enabled=true
order by kit_template_id,built_at,created_at,id;

create or replace view public.basket_split_availability_v1 as
with food as (
  select k.basket_id,k.id kit_template_id,l.lot_id,l.short_code,l.quantity_available,
         l.sale_price_override,l.component_sum_snapshot,l.hidden_adjustment_snapshot,
         l.public_name,l.linked_hygiene_lot_id
  from public.basket_kit_templates k
  left join public.basket_current_kit_lot_v2 l on l.kit_template_id=k.id
  where k.kind='food' and k.is_active=true
), linked_hygiene as (
  select l.id lot_id,l.kit_template_id,l.short_code,l.quantity_available,l.sale_enabled,l.status
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  where k.kind='hygiene' and k.is_active=true
)
select bt.id basket_id,bt.name,bt.uses_hygiene_kit,bt.split_kits_enabled,
       f.kit_template_id food_kit_template_id,f.lot_id food_lot_id,f.short_code food_short_code,
       coalesce(f.quantity_available,0) food_available,
       case when bt.uses_hygiene_kit then h.kit_template_id else null end hygiene_kit_template_id,
       case when bt.uses_hygiene_kit then h.lot_id else null end hygiene_lot_id,
       case when bt.uses_hygiene_kit then h.short_code else null end hygiene_short_code,
       case when bt.uses_hygiene_kit and h.status='ready' and h.sale_enabled=true then coalesce(h.quantity_available,0)
            when bt.uses_hygiene_kit then 0 else 2147483647 end hygiene_available,
       case when f.lot_id is null then 0
            when bt.uses_hygiene_kit and (h.lot_id is null or h.status<>'ready' or h.sale_enabled<>true or h.quantity_available<=0) then 0
            else least(coalesce(f.quantity_available,0),case when bt.uses_hygiene_kit then coalesce(h.quantity_available,0) else coalesce(f.quantity_available,0) end)
       end split_available,
       f.public_name food_public_name,f.sale_price_override food_sale_price_override,
       f.component_sum_snapshot food_component_sum_snapshot,
       f.hidden_adjustment_snapshot food_hidden_adjustment_snapshot,
       f.linked_hygiene_lot_id
from public.basket_templates bt
left join food f on f.basket_id=bt.id
left join linked_hygiene h on h.lot_id=f.linked_hygiene_lot_id;

-- Patch the live split checkout in place so additions preserve the premounted basket,
-- while any reduction/removal makes the whole basket a loose rebuild.
do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure) into v_def;

  v_old:=$old$
    v_food_changed:=not public.basket_group_matches_lot_v1(v_components,'food',v_food_lot_id);
    v_hygiene_changed:=case when v_basket.uses_hygiene_kit
      then not public.basket_group_matches_lot_v1(v_components,'hygiene',v_hygiene_lot_id)
      else false end;
$old$;
  v_new:=$new$
    if v_basket.uses_hygiene_kit and not exists(
      select 1 from public.basket_stock_lots fl
      where fl.id=v_food_lot_id and fl.linked_hygiene_lot_id=v_hygiene_lot_id
    ) then raise exception 'basket_hygiene_lot_not_linked'; end if;

    v_food_changed:=not public.basket_group_preserves_original_lot_v1(v_components,'food',v_food_lot_id);
    v_hygiene_changed:=case when v_basket.uses_hygiene_kit
      then not public.basket_group_preserves_original_lot_v1(v_components,'hygiene',v_hygiene_lot_id)
      else false end;
    if v_food_changed or v_hygiene_changed then
      v_food_changed:=true;
      if v_basket.uses_hygiene_kit then v_hygiene_changed:=true; end if;
    end if;
$new$;
  if position(v_old in v_def)=0 then raise exception 'checkout_change_rule_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$
          v_preassembled_units:=case when v_group_changed then 0 else v_selected_qty*v_line_qty end;
          v_loose_units:=v_selected_qty*v_line_qty-v_preassembled_units;
$old$;
  v_new:=$new$
          v_preassembled_units:=case when v_group_changed then 0 else v_base_qty*v_line_qty end;
          v_loose_units:=case when v_group_changed then v_selected_qty*v_line_qty else greatest(v_selected_qty-v_base_qty,0)*v_line_qty end;
$new$;
  if position(v_old in v_def)=0 then raise exception 'checkout_allocation_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$'basket_id',v_basket.id,'basket_name',v_basket.name,'quantity',v_line_qty,$old$;
  v_new:=$new$'basket_id',v_basket.id,'basket_name',coalesce((select public_name from public.basket_stock_lots where id=v_food_lot_id),v_basket.name),'quantity',v_line_qty,$new$;
  if position(v_old in v_def)=0 then raise exception 'checkout_separation_name_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  execute v_def;
end
$patch$;

create or replace function public.ops2_init_order_separation_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_order public.orders%rowtype;
  v_inserted integer:=0;
  v_count integer:=0;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','invalid_order_id'); end if;
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;
  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    select count(*) into v_count from public.order_separation_items_v1 where order_id=p_order_id;
    return jsonb_build_object('ok',true,'status','already_completed','item_count',v_count,'order_updated_at',v_order.updated_at);
  end if;

  with src as (
    select oi.*,
      case when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(0,oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0))
        else oi.quantity end as separation_quantity
    from public.order_items oi
    where oi.order_id=p_order_id
  )
  insert into public.order_separation_items_v1(
    order_id,order_item_id,product_id,state,quantity,unit_price,line_total,created_at,updated_at
  )
  select order_id,id,product_id,'pending',separation_quantity,unit_price,
         round(unit_price*separation_quantity,2),now(),now()
  from src
  where separation_quantity>0
  on conflict (order_id,order_item_id) do update
    set product_id=excluded.product_id,quantity=excluded.quantity,unit_price=excluded.unit_price,
        line_total=excluded.line_total,updated_at=now()
    where public.order_separation_items_v1.state='pending'
      and not exists(select 1 from public.order_separation_completions_v1 c where c.order_id=public.order_separation_items_v1.order_id);

  get diagnostics v_inserted=row_count;
  select count(*) into v_count from public.order_separation_items_v1 where order_id=p_order_id;
  if v_count=0 and coalesce(jsonb_array_length(coalesce(v_order.checkout_snapshot->'separation_plan','[]'::jsonb)),0)=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;
  return jsonb_build_object('ok',true,'status','initialized','rows_touched',v_inserted,'item_count',v_count,'order_updated_at',v_order.updated_at);
end;
$$;

revoke all on function public.basket_group_preserves_original_lot_v1(jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.apply_basket_kit_lot_commercial_v2(uuid,text,numeric,uuid) from public,anon,authenticated;
revoke all on function public.save_basket_kit_lot_draft_v3(uuid,uuid,integer,jsonb,text,text,text,uuid,text,numeric,uuid) from public,anon,authenticated;
revoke all on function public.create_basket_kit_lot_v3(uuid,integer,jsonb,text,text,text,uuid,text,numeric,uuid) from public,anon,authenticated;
revoke all on function public.activate_basket_kit_lot_draft_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.basket_kit_lot_delete_v1(uuid,text) from public,anon,authenticated;

grant execute on function public.basket_group_preserves_original_lot_v1(jsonb,text,uuid) to service_role;
grant execute on function public.apply_basket_kit_lot_commercial_v2(uuid,text,numeric,uuid) to service_role;
grant execute on function public.save_basket_kit_lot_draft_v3(uuid,uuid,integer,jsonb,text,text,text,uuid,text,numeric,uuid) to service_role;
grant execute on function public.create_basket_kit_lot_v3(uuid,integer,jsonb,text,text,text,uuid,text,numeric,uuid) to service_role;
grant execute on function public.activate_basket_kit_lot_draft_v2(uuid,text) to service_role;
grant execute on function public.basket_kit_lot_delete_v1(uuid,text) to service_role;

commit;
