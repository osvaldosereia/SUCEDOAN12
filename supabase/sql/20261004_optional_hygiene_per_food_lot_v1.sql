begin;

-- Optional hygiene per food lot.
-- A food lot may be sold alone or explicitly linked to one ready Limpeza/Higiene lot.
-- The presence of hygiene is derived from linked_hygiene_lot_id, not imposed globally.

-- Undo the accidental normalization applied to the food-only Econômica Bonini family.
-- Use the stable operational prefix instead of generated UUIDs.
update public.basket_templates b
set uses_hygiene_kit=false
where exists (
  select 1
  from public.basket_kit_templates k
  where k.basket_id=b.id
    and k.kind='food'
    and k.code_prefix='EB'
    and k.is_active=true
);

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
  v_component numeric:=0;
  v_hygiene_component numeric:=0;
  v_hygiene_lot_id uuid;
  v_sale numeric;
  v_name text;
begin
  if p_lot_id is null then raise exception 'invalid_lot'; end if;
  if p_sale_price is null or p_sale_price<0 or p_sale_price>9999999 then raise exception 'invalid_sale_price'; end if;

  select k.kind,k.basket_id,coalesce(b.name,k.name)
    into v_kind,v_basket_id,v_default_name
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

  if v_kind='food' then
    -- NULL explicitly means this food lot has no Limpeza/Higiene kit.
    v_hygiene_lot_id:=p_linked_hygiene_lot_id;
    if v_hygiene_lot_id is not null and not exists(
      select 1
      from public.basket_stock_lots hl
      join public.basket_kit_templates hk on hk.id=hl.kit_template_id
      where hl.id=v_hygiene_lot_id
        and hk.kind='hygiene'
        and hk.is_active=true
        and hl.status='ready'
        and hl.quantity_available>0
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

create or replace function public.activate_basket_kit_lot_draft_v2(
  p_lot_id uuid,
  p_operator text default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_kind text;
  v_linked uuid;
begin
  select k.kind,l.linked_hygiene_lot_id
    into v_kind,v_linked
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  where l.id=p_lot_id;
  if not found then raise exception 'draft_lot_not_found'; end if;

  -- Hygiene is optional. If selected, the selected physical lot must still exist and be ready.
  if v_kind='food' and v_linked is not null then
    if not exists(
      select 1
      from public.basket_stock_lots hl
      join public.basket_kit_templates hk on hk.id=hl.kit_template_id
      where hl.id=v_linked
        and hk.kind='hygiene'
        and hk.is_active=true
        and hl.status='ready'
        and hl.quantity_available>0
    ) then raise exception 'linked_hygiene_lot_unavailable'; end if;
  end if;

  return public.activate_basket_kit_lot_draft_v1(p_lot_id,p_operator);
end;
$$;

create or replace function public.set_basket_lot_sale_enabled_v1(
  p_lot_id uuid,
  p_enabled boolean,
  p_operator text default null
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_linked uuid;
begin
  if p_lot_id is null then raise exception 'lot_not_found'; end if;

  select * into v_lot
  from public.basket_stock_lots
  where id=p_lot_id
  for update;
  if not found then raise exception 'lot_not_found'; end if;

  if p_enabled then
    if v_lot.status<>'ready' or coalesce(v_lot.quantity_available,0)<=0 then
      raise exception 'lot_not_available_for_sale';
    end if;

    if v_lot.lot_kind='food' then
      v_linked:=v_lot.linked_hygiene_lot_id;
      if v_linked is not null and not exists (
        select 1
        from public.basket_stock_lots hl
        join public.basket_kit_templates hk on hk.id=hl.kit_template_id
        where hl.id=v_linked
          and hk.kind='hygiene'
          and hk.is_active=true
          and hl.status='ready'
          and hl.quantity_available>0
      ) then
        raise exception 'linked_hygiene_lot_unavailable';
      end if;
    end if;
  end if;

  update public.basket_stock_lots
  set sale_enabled=p_enabled,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'sale_enabled_changed_at',now(),
        'sale_enabled_changed_by',nullif(trim(coalesce(p_operator,'')),''),
        'sale_enabled',p_enabled
      )
  where id=p_lot_id;

  return jsonb_build_object(
    'ok',true,
    'lot_id',p_lot_id,
    'sale_enabled',p_enabled,
    'lot_kind',v_lot.lot_kind,
    'short_code',v_lot.short_code,
    'lot_code',v_lot.lot_code,
    'linked_hygiene_lot_id',v_lot.linked_hygiene_lot_id
  );
end;
$$;

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
select bt.id basket_id,bt.name,
       (f.linked_hygiene_lot_id is not null) uses_hygiene_kit,
       bt.split_kits_enabled,
       f.kit_template_id food_kit_template_id,f.lot_id food_lot_id,f.short_code food_short_code,
       coalesce(f.quantity_available,0) food_available,
       case when f.linked_hygiene_lot_id is not null then h.kit_template_id else null end hygiene_kit_template_id,
       case when f.linked_hygiene_lot_id is not null then h.lot_id else null end hygiene_lot_id,
       case when f.linked_hygiene_lot_id is not null then h.short_code else null end hygiene_short_code,
       case when f.linked_hygiene_lot_id is not null and h.status='ready' and h.sale_enabled=true then coalesce(h.quantity_available,0)
            when f.linked_hygiene_lot_id is not null then 0 else 2147483647 end hygiene_available,
       case when f.lot_id is null then 0
            when f.linked_hygiene_lot_id is not null and (h.lot_id is null or h.status<>'ready' or h.sale_enabled<>true or h.quantity_available<=0) then 0
            else least(coalesce(f.quantity_available,0),case when f.linked_hygiene_lot_id is not null then coalesce(h.quantity_available,0) else coalesce(f.quantity_available,0) end)
       end split_available,
       f.public_name food_public_name,f.sale_price_override food_sale_price_override,
       f.component_sum_snapshot food_component_sum_snapshot,
       f.hidden_adjustment_snapshot food_hidden_adjustment_snapshot,
       f.linked_hygiene_lot_id
from public.basket_templates bt
left join food f on f.basket_id=bt.id
left join linked_hygiene h on h.lot_id=f.linked_hygiene_lot_id;

-- Make checkout infer hygiene from the selected food lot. This keeps the choice per lot
-- and prevents a global basket flag from forcing a cleaning kit.
do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure) into v_def;

  v_old:=$old$
    if v_food_lot_id is null then raise exception 'basket_food_lot_required'; end if;
    if v_basket.uses_hygiene_kit and v_hygiene_lot_id is null then raise exception 'basket_hygiene_lot_required'; end if;

    if not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_food_lot_id and k.kind='food' and k.basket_id=v_basket.id
    ) then raise exception 'basket_food_lot_invalid'; end if;
    if v_basket.uses_hygiene_kit and not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_hygiene_lot_id and k.kind='hygiene'
    ) then raise exception 'basket_hygiene_lot_invalid'; end if;

    if v_basket.uses_hygiene_kit and not exists(
      select 1 from public.basket_stock_lots fl
      where fl.id=v_food_lot_id and fl.linked_hygiene_lot_id=v_hygiene_lot_id
    ) then raise exception 'basket_hygiene_lot_not_linked'; end if;
$old$;

  v_new:=$new$
    if v_food_lot_id is null then raise exception 'basket_food_lot_required'; end if;

    if not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_food_lot_id and k.kind='food' and k.basket_id=v_basket.id
    ) then raise exception 'basket_food_lot_invalid'; end if;

    v_basket.uses_hygiene_kit:=exists(
      select 1
      from public.basket_stock_lots fl
      where fl.id=v_food_lot_id and fl.linked_hygiene_lot_id is not null
    );
    if v_basket.uses_hygiene_kit then
      select fl.linked_hygiene_lot_id into v_hygiene_lot_id
      from public.basket_stock_lots fl
      where fl.id=v_food_lot_id;
    else
      v_hygiene_lot_id:=null;
    end if;

    if v_basket.uses_hygiene_kit and not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_hygiene_lot_id and k.kind='hygiene'
        and l.status='ready' and l.quantity_available>0
    ) then raise exception 'basket_hygiene_lot_invalid'; end if;
$new$;

  if position(v_old in v_def)=0 then raise exception 'optional_hygiene_checkout_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end
$patch$;

commit;
