-- Public commercial identity per basket kit lot.
-- The commercial price is frozen on the food lot. Component changes at checkout
-- are applied as deltas on top of this price, preserving the original hidden value.

alter table public.basket_stock_lots
  add column if not exists public_name text;

alter table public.basket_stock_lots
  drop constraint if exists basket_stock_lots_public_name_check;
alter table public.basket_stock_lots
  add constraint basket_stock_lots_public_name_check
  check (public_name is null or char_length(btrim(public_name)) between 1 and 120);

create or replace function public.apply_basket_kit_lot_commercial_v1(
  p_lot_id uuid,
  p_public_name text,
  p_sale_price numeric
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

  select k.kind,k.basket_id,
         coalesce(b.name,k.name),coalesce(b.uses_hygiene_kit,false)
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

  -- Food lots represent the public basket. Include the current hygiene kit in the
  -- snapshot when that basket uses it; if no built hygiene lot exists yet, use
  -- the hygiene template as the deterministic fallback. This value never moves
  -- when the customer personalizes the basket later.
  if v_kind='food' and v_uses_hygiene then
    select l.id into v_hygiene_lot_id
    from public.basket_stock_lots l
    join public.basket_kit_templates k on k.id=l.kit_template_id
    where k.kind='hygiene' and k.is_active=true
      and l.status='ready' and l.quantity_available>0
    order by l.sale_enabled desc,l.built_at desc,l.created_at desc,l.id
    limit 1;

    if v_hygiene_lot_id is not null then
      select round(coalesce(sum(li.quantity_per_basket*coalesce(p.price,0)),0),2)
        into v_hygiene_component
      from public.basket_stock_lot_items li
      join public.products p on p.id=li.product_id
      where li.lot_id=v_hygiene_lot_id;
    else
      select round(coalesce(sum(i.quantity*coalesce(p.price,0)),0),2)
        into v_hygiene_component
      from public.basket_kit_template_items i
      join public.basket_kit_templates k on k.id=i.kit_template_id
      join public.products p on p.id=i.product_id
      where k.kind='hygiene' and k.is_active=true;
    end if;
    v_component:=round(v_component+coalesce(v_hygiene_component,0),2);
  end if;

  update public.basket_stock_lots
     set public_name=v_name,
         sale_price_override=v_sale,
         component_sum_snapshot=v_component,
         hidden_adjustment_snapshot=round(v_sale-v_component,2),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'public_name',v_name,
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
    'sale_price_override',v_sale,'component_sum_snapshot',v_component,
    'hidden_adjustment_snapshot',round(v_sale-v_component,2),
    'hygiene_lot_snapshot',v_hygiene_lot_id
  );
end;
$$;

create or replace function public.save_basket_kit_lot_draft_v2(
  p_lot_id uuid,
  p_kit_template_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_duplicated_from_lot_id uuid default null,
  p_public_name text default null,
  p_sale_price numeric default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_result jsonb;
  v_commercial jsonb;
  v_lot_id uuid;
begin
  v_result:=public.save_basket_kit_lot_draft_v1(
    p_lot_id,p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,p_duplicated_from_lot_id
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  if p_sale_price is not null or nullif(btrim(coalesce(p_public_name,'')),'') is not null then
    v_commercial:=public.apply_basket_kit_lot_commercial_v1(v_lot_id,p_public_name,p_sale_price);
    v_result:=v_result||jsonb_build_object('commercial',v_commercial);
  end if;
  return v_result;
end;
$$;

create or replace function public.create_basket_kit_lot_v2(
  p_kit_template_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_duplicated_from_lot_id uuid default null,
  p_public_name text default null,
  p_sale_price numeric default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_result jsonb;
  v_commercial jsonb;
  v_lot_id uuid;
begin
  v_result:=public.create_basket_kit_lot_v1(
    p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,p_duplicated_from_lot_id
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  if p_sale_price is not null or nullif(btrim(coalesce(p_public_name,'')),'') is not null then
    v_commercial:=public.apply_basket_kit_lot_commercial_v1(v_lot_id,p_public_name,p_sale_price);
    v_result:=v_result||jsonb_build_object('commercial',v_commercial);
  end if;
  return v_result;
end;
$$;

create or replace function public.basket_lot_commercial_price_v1(
  p_basket_id uuid,
  p_food_lot_id uuid
) returns numeric
language sql
stable
set search_path=''
as $$
  select coalesce(
    (select l.sale_price_override
       from public.basket_stock_lots l
       join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=p_food_lot_id and k.kind='food' and k.basket_id=p_basket_id),
    (select b.base_price from public.basket_templates b where b.id=p_basket_id),
    0::numeric
  );
$$;

-- Append fields only, preserving all existing view column positions.
create or replace view public.basket_current_lot_v1 as
select distinct on (basket_id)
  basket_id,
  id as lot_id,
  lot_code,
  quantity_built,
  quantity_available,
  composition_hash,
  built_at,
  built_by,
  source,
  metadata,
  sale_price_override,
  short_code,
  component_sum_snapshot,
  hidden_adjustment_snapshot,
  public_name
from public.basket_stock_lots l
where status='ready' and quantity_available>0 and lot_kind='legacy_full' and sale_enabled=true
order by basket_id,built_at,created_at,id;

create or replace view public.basket_current_kit_lot_v2 as
select distinct on (kit_template_id)
  kit_template_id,
  id as lot_id,
  basket_id,
  lot_kind,
  short_code,
  lot_code,
  quantity_built,
  quantity_available,
  composition_hash,
  built_at,
  built_by,
  duplicated_from_lot_id,
  source,
  metadata,
  sale_price_override,
  component_sum_snapshot,
  hidden_adjustment_snapshot,
  public_name
from public.basket_stock_lots l
where kit_template_id is not null and status='ready' and quantity_available>0 and sale_enabled=true
order by kit_template_id,built_at,created_at,id;

create or replace view public.basket_split_availability_v1 as
with hygiene as (
  select k.id as kit_template_id,l.lot_id,l.short_code,l.quantity_available,
         l.sale_price_override,l.component_sum_snapshot,l.hidden_adjustment_snapshot,l.public_name
  from public.basket_kit_templates k
  left join public.basket_current_kit_lot_v2 l on l.kit_template_id=k.id
  where k.kind='hygiene' and k.is_active=true
  limit 1
), food as (
  select k.basket_id,k.id as kit_template_id,l.lot_id,l.short_code,l.quantity_available,
         l.sale_price_override,l.component_sum_snapshot,l.hidden_adjustment_snapshot,l.public_name
  from public.basket_kit_templates k
  left join public.basket_current_kit_lot_v2 l on l.kit_template_id=k.id
  where k.kind='food' and k.is_active=true
)
select
  bt.id as basket_id,
  bt.name,
  bt.uses_hygiene_kit,
  bt.split_kits_enabled,
  f.kit_template_id as food_kit_template_id,
  f.lot_id as food_lot_id,
  f.short_code as food_short_code,
  coalesce(f.quantity_available,0) as food_available,
  h.kit_template_id as hygiene_kit_template_id,
  case when bt.uses_hygiene_kit then h.lot_id else null::uuid end as hygiene_lot_id,
  case when bt.uses_hygiene_kit then h.short_code else null::text end as hygiene_short_code,
  case when bt.uses_hygiene_kit then coalesce(h.quantity_available,0) else 2147483647 end as hygiene_available,
  case
    when f.lot_id is null then 0
    when bt.uses_hygiene_kit and h.lot_id is null then 0
    else least(coalesce(f.quantity_available,0),case when bt.uses_hygiene_kit then coalesce(h.quantity_available,0) else coalesce(f.quantity_available,0) end)
  end as split_available,
  f.public_name as food_public_name,
  f.sale_price_override as food_sale_price_override,
  f.component_sum_snapshot as food_component_sum_snapshot,
  f.hidden_adjustment_snapshot as food_hidden_adjustment_snapshot
from public.basket_templates bt
left join food f on f.basket_id=bt.id
left join hygiene h on true;

-- Patch only the two commercial-base references inside the existing split checkout.
-- The checkout still applies item deltas exactly as before, so the frozen hidden
-- adjustment remains embedded in the lot price after removals/additions.
do $patch$
declare
  v_def text;
  v_old text:='v_basket_unit:=coalesce(v_basket.base_price,0);';
  v_new text:='v_basket_unit:=public.basket_lot_commercial_price_v1(v_basket.id,v_food_lot_id);';
  v_meta_old text:='''commercial_base_price'',v_basket.base_price,';
  v_meta_new text:='''commercial_base_price'',public.basket_lot_commercial_price_v1(v_basket.id,v_food_lot_id),';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_vitrine_cart_order_v3_base'
  limit 1;
  if v_def is null then raise exception 'create_vitrine_cart_order_v3_base_not_found'; end if;
  if position(v_old in v_def)=0 then raise exception 'commercial_base_patch_anchor_not_found'; end if;
  v_def:=replace(v_def,v_old,v_new);
  if position(v_meta_old in v_def)>0 then v_def:=replace(v_def,v_meta_old,v_meta_new); end if;
  execute v_def;
end;
$patch$;

revoke all on function public.apply_basket_kit_lot_commercial_v1(uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.save_basket_kit_lot_draft_v2(uuid,uuid,integer,jsonb,text,text,text,uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.create_basket_kit_lot_v2(uuid,integer,jsonb,text,text,text,uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.basket_lot_commercial_price_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_basket_kit_lot_commercial_v1(uuid,text,numeric) to service_role;
grant execute on function public.save_basket_kit_lot_draft_v2(uuid,uuid,integer,jsonb,text,text,text,uuid,text,numeric) to service_role;
grant execute on function public.create_basket_kit_lot_v2(uuid,integer,jsonb,text,text,text,uuid,text,numeric) to service_role;
grant execute on function public.basket_lot_commercial_price_v1(uuid,uuid) to service_role;
