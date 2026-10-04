begin;

alter table public.basket_stock_lots
  add column if not exists business_type text,
  add column if not exists linked_lot_id uuid,
  add column if not exists own_sale_price_override numeric,
  add column if not exists own_component_sum_snapshot numeric,
  add column if not exists own_hidden_adjustment_snapshot numeric,
  add column if not exists own_cost_sum_snapshot numeric,
  add column if not exists cost_sum_snapshot numeric;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='basket_stock_lots_business_type_check') then
    alter table public.basket_stock_lots add constraint basket_stock_lots_business_type_check
      check (business_type is null or business_type in ('basic_complete','basic_food','cleaning_hygiene','cleaning','hygiene'));
  end if;
  if not exists(select 1 from pg_constraint where conname='basket_stock_lots_linked_lot_id_fkey') then
    alter table public.basket_stock_lots add constraint basket_stock_lots_linked_lot_id_fkey
      foreign key (linked_lot_id) references public.basket_stock_lots(id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='basket_stock_lots_no_self_link_check') then
    alter table public.basket_stock_lots add constraint basket_stock_lots_no_self_link_check
      check (linked_lot_id is null or linked_lot_id<>id);
  end if;
end $$;

-- Preserve all existing effective prices. There are no active legacy links at migration time,
-- but the backfill also handles any historical link without double-counting its commercial value.
update public.basket_stock_lots l
set linked_lot_id=coalesce(l.linked_lot_id,l.linked_hygiene_lot_id),
    business_type=coalesce(l.business_type,case when l.lot_kind='food' then 'basic_food' else 'cleaning_hygiene' end)
where l.linked_lot_id is null or l.business_type is null;

with own as (
  select l.id,
         round(coalesce(sum(li.quantity_per_basket*coalesce(p.price,0)),0),2) own_component,
         round(coalesce(sum(li.quantity_per_basket*coalesce(p.cost,0)),0),2) own_cost
  from public.basket_stock_lots l
  left join public.basket_stock_lot_items li on li.lot_id=l.id
  left join public.products p on p.id=li.product_id
  group by l.id
), linked as (
  select l.id,
         coalesce(t.sale_price_override,0)::numeric linked_sale,
         coalesce(t.component_sum_snapshot,0)::numeric linked_component,
         coalesce(t.hidden_adjustment_snapshot,0)::numeric linked_hidden,
         coalesce(t.cost_sum_snapshot,0)::numeric linked_cost
  from public.basket_stock_lots l
  left join public.basket_stock_lots t on t.id=l.linked_lot_id
)
update public.basket_stock_lots l
set own_component_sum_snapshot=o.own_component,
    own_cost_sum_snapshot=o.own_cost,
    own_sale_price_override=round(coalesce(l.sale_price_override,0)-case when l.linked_lot_id is not null then x.linked_sale else 0 end,2),
    own_hidden_adjustment_snapshot=round((coalesce(l.sale_price_override,0)-case when l.linked_lot_id is not null then x.linked_sale else 0 end)-o.own_component,2),
    cost_sum_snapshot=round(o.own_cost+case when l.linked_lot_id is not null then x.linked_cost else 0 end,2)
from own o join linked x on x.id=o.id
where l.id=o.id;

create or replace function public.apply_basket_kit_lot_commercial_v3(
  p_lot_id uuid,
  p_public_name text,
  p_sale_price numeric,
  p_business_type text default null,
  p_linked_lot_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_default_name text;
  v_business_type text;
  v_name text;
  v_own_sale numeric;
  v_own_component numeric:=0;
  v_own_cost numeric:=0;
  v_own_hidden numeric:=0;
  v_linked_sale numeric:=0;
  v_linked_component numeric:=0;
  v_linked_cost numeric:=0;
  v_linked_hidden numeric:=0;
  v_linked_kind text;
  v_compat_hygiene uuid;
  v_effective_sale numeric:=0;
  v_effective_component numeric:=0;
  v_effective_cost numeric:=0;
  v_effective_hidden numeric:=0;
begin
  if p_lot_id is null then raise exception 'invalid_lot'; end if;
  if p_sale_price is null or p_sale_price<0 or p_sale_price>9999999 then raise exception 'invalid_sale_price'; end if;

  select coalesce(b.name,k.name),coalesce(l.business_type,case when l.lot_kind='food' then 'basic_food' else 'cleaning_hygiene' end)
    into v_default_name,v_business_type
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  left join public.basket_templates b on b.id=k.basket_id
  where l.id=p_lot_id;
  if not found then raise exception 'kit_lot_not_found'; end if;

  v_business_type:=coalesce(nullif(btrim(coalesce(p_business_type,'')),''),v_business_type);
  if v_business_type not in ('basic_complete','basic_food','cleaning_hygiene','cleaning','hygiene') then
    raise exception 'invalid_business_type';
  end if;

  v_name:=coalesce(nullif(btrim(coalesce(p_public_name,'')),''),v_default_name);
  if v_name is null or char_length(v_name)>120 then raise exception 'invalid_public_name'; end if;
  v_own_sale:=round(p_sale_price,2);

  select round(coalesce(sum(li.quantity_per_basket*coalesce(p.price,0)),0),2),
         round(coalesce(sum(li.quantity_per_basket*coalesce(p.cost,0)),0),2)
    into v_own_component,v_own_cost
  from public.basket_stock_lot_items li
  join public.products p on p.id=li.product_id
  where li.lot_id=p_lot_id;
  v_own_hidden:=round(v_own_sale-v_own_component,2);

  if p_linked_lot_id is not null then
    if p_linked_lot_id=p_lot_id then raise exception 'invalid_linked_lot_cycle'; end if;
    if exists(
      with recursive chain as (
        select id,linked_lot_id from public.basket_stock_lots where id=p_linked_lot_id
        union all
        select l.id,l.linked_lot_id from public.basket_stock_lots l join chain c on l.id=c.linked_lot_id
      ) select 1 from chain where id=p_lot_id
    ) then raise exception 'invalid_linked_lot_cycle'; end if;

    select l.lot_kind,
           coalesce(l.sale_price_override,0),
           coalesce(l.component_sum_snapshot,0),
           coalesce(l.cost_sum_snapshot,0),
           coalesce(l.hidden_adjustment_snapshot,coalesce(l.sale_price_override,0)-coalesce(l.component_sum_snapshot,0))
      into v_linked_kind,v_linked_sale,v_linked_component,v_linked_cost,v_linked_hidden
    from public.basket_stock_lots l
    where l.id=p_linked_lot_id and l.status='ready' and coalesce(l.quantity_available,0)>0;
    if not found then raise exception 'invalid_linked_lot'; end if;
    if exists(select 1 from public.basket_stock_lots l where l.id=p_linked_lot_id and l.linked_lot_id is not null) then
      raise exception 'linked_lot_already_composite';
    end if;

    -- Fallback for pre-migration linked lots whose snapshots were not populated.
    if v_linked_component=0 then
      select round(coalesce(sum(li.quantity_per_basket*coalesce(p.price,0)),0),2),
             round(coalesce(sum(li.quantity_per_basket*coalesce(p.cost,0)),0),2)
        into v_linked_component,v_linked_cost
      from public.basket_stock_lot_items li join public.products p on p.id=li.product_id
      where li.lot_id=p_linked_lot_id;
      v_linked_hidden:=round(v_linked_sale-v_linked_component,2);
    end if;
    if v_linked_kind='hygiene' then v_compat_hygiene:=p_linked_lot_id; end if;
  end if;

  v_effective_sale:=round(v_own_sale+v_linked_sale,2);
  v_effective_component:=round(v_own_component+v_linked_component,2);
  v_effective_cost:=round(v_own_cost+v_linked_cost,2);
  v_effective_hidden:=round(v_own_hidden+v_linked_hidden,2);

  update public.basket_stock_lots
     set public_name=v_name,
         business_type=v_business_type,
         linked_lot_id=p_linked_lot_id,
         linked_hygiene_lot_id=v_compat_hygiene,
         own_sale_price_override=v_own_sale,
         own_component_sum_snapshot=v_own_component,
         own_cost_sum_snapshot=v_own_cost,
         own_hidden_adjustment_snapshot=v_own_hidden,
         sale_price_override=v_effective_sale,
         component_sum_snapshot=v_effective_component,
         cost_sum_snapshot=v_effective_cost,
         hidden_adjustment_snapshot=round(v_own_hidden + v_linked_hidden,2),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'public_name',v_name,'business_type',v_business_type,
           'linked_lot_id',p_linked_lot_id,'linked_hygiene_lot_id',v_compat_hygiene,
           'own_sale_price_override',v_own_sale,'own_component_sum_snapshot',v_own_component,
           'own_cost_sum_snapshot',v_own_cost,'own_hidden_adjustment_snapshot',v_own_hidden,
           'sale_price_override',v_effective_sale,'component_sum_snapshot',v_effective_component,
           'cost_sum_snapshot',v_effective_cost,'hidden_adjustment_snapshot',v_effective_hidden,
           'commercial_snapshot_kind','generic_linked_lot','commercial_snapshot_at',now()
         ),
         updated_at=now()
   where id=p_lot_id;

  return jsonb_build_object(
    'ok',true,'lot_id',p_lot_id,'public_name',v_name,'business_type',v_business_type,
    'linked_lot_id',p_linked_lot_id,'linked_hygiene_lot_id',v_compat_hygiene,
    'own_sale_price_override',v_own_sale,'own_component_sum_snapshot',v_own_component,
    'own_cost_sum_snapshot',v_own_cost,'own_hidden_adjustment_snapshot',v_own_hidden,
    'sale_price_override',v_effective_sale,'component_sum_snapshot',v_effective_component,
    'cost_sum_snapshot',v_effective_cost,'hidden_adjustment_snapshot',v_effective_hidden
  );
end;
$$;

create or replace function public.create_basket_kit_lot_v4(
  p_kit_template_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_duplicated_from_lot_id uuid default null,
  p_public_name text default null,
  p_sale_price numeric default null,
  p_business_type text default null,
  p_linked_lot_id uuid default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare v_result jsonb; v_lot_id uuid; v_commercial jsonb;
begin
  v_result:=public.create_basket_kit_lot_v3(
    p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,
    p_duplicated_from_lot_id,p_public_name,p_sale_price,null
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  v_commercial:=public.apply_basket_kit_lot_commercial_v3(v_lot_id,p_public_name,p_sale_price,p_business_type,p_linked_lot_id);
  return v_result||jsonb_build_object('commercial',v_commercial);
end;
$$;

create or replace function public.save_basket_kit_lot_draft_v4(
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
  p_business_type text default null,
  p_linked_lot_id uuid default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare v_result jsonb; v_lot_id uuid; v_commercial jsonb;
begin
  v_result:=public.save_basket_kit_lot_draft_v3(
    p_lot_id,p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,
    p_duplicated_from_lot_id,p_public_name,p_sale_price,null
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  v_commercial:=public.apply_basket_kit_lot_commercial_v3(v_lot_id,p_public_name,p_sale_price,p_business_type,p_linked_lot_id);
  return v_result||jsonb_build_object('commercial',v_commercial);
end;
$$;

create or replace function public.activate_basket_kit_lot_draft_v2(p_lot_id uuid,p_operator text default null)
returns jsonb language plpgsql set search_path='' as $$
declare v_linked uuid;
begin
  select linked_lot_id into v_linked from public.basket_stock_lots where id=p_lot_id;
  if not found then raise exception 'draft_lot_not_found'; end if;
  if v_linked is not null and not exists(
    select 1 from public.basket_stock_lots l where l.id=v_linked and l.status='ready' and coalesce(l.quantity_available,0)>0
  ) then raise exception 'linked_lot_unavailable'; end if;
  return public.activate_basket_kit_lot_draft_v1(p_lot_id,p_operator);
end;
$$;

create or replace function public.set_basket_lot_sale_enabled_v1(p_lot_id uuid,p_enabled boolean,p_operator text default null)
returns jsonb language plpgsql set search_path='' as $$
declare v_lot public.basket_stock_lots%rowtype;
begin
  if p_lot_id is null then raise exception 'lot_not_found'; end if;
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  if p_enabled then
    if v_lot.status<>'ready' or coalesce(v_lot.quantity_available,0)<=0 then raise exception 'lot_not_available_for_sale'; end if;
    if v_lot.linked_lot_id is not null and not exists(
      select 1 from public.basket_stock_lots l where l.id=v_lot.linked_lot_id and l.status='ready' and coalesce(l.quantity_available,0)>0
    ) then raise exception 'linked_lot_unavailable'; end if;
  end if;
  update public.basket_stock_lots set sale_enabled=p_enabled,updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('sale_enabled_changed_at',now(),'sale_enabled_changed_by',nullif(trim(coalesce(p_operator,'')),''),'sale_enabled',p_enabled)
  where id=p_lot_id;
  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'sale_enabled',p_enabled,'lot_kind',v_lot.lot_kind,'business_type',v_lot.business_type,'short_code',v_lot.short_code,'lot_code',v_lot.lot_code,'linked_lot_id',v_lot.linked_lot_id);
end;
$$;

create or replace view public.basket_current_kit_lot_v2 as
select distinct on (kit_template_id)
  kit_template_id,id lot_id,basket_id,lot_kind,short_code,lot_code,
  quantity_built,quantity_available,composition_hash,built_at,built_by,
  duplicated_from_lot_id,source,metadata,sale_price_override,
  component_sum_snapshot,hidden_adjustment_snapshot,public_name,
  linked_hygiene_lot_id,business_type,linked_lot_id,
  own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,
  own_cost_sum_snapshot,cost_sum_snapshot
from public.basket_stock_lots l
where kit_template_id is not null and status='ready' and quantity_available>0 and sale_enabled=true
order by kit_template_id,built_at,created_at,id;

create or replace view public.basket_split_availability_v1 as
with food as (
  select k.basket_id,k.id kit_template_id,l.lot_id,l.short_code,l.quantity_available,
         l.sale_price_override,l.component_sum_snapshot,l.hidden_adjustment_snapshot,l.public_name,
         l.linked_hygiene_lot_id,l.linked_lot_id,l.business_type
  from public.basket_kit_templates k
  left join public.basket_current_kit_lot_v2 l on l.kit_template_id=k.id
  where k.kind='food' and k.is_active=true
), linked as (
  select l.id lot_id,l.kit_template_id,l.short_code,l.quantity_available,l.sale_enabled,l.status,l.business_type
  from public.basket_stock_lots l
  where l.status='ready'
)
select bt.id basket_id,bt.name,
       (f.linked_lot_id is not null) uses_hygiene_kit,
       bt.split_kits_enabled,
       f.kit_template_id food_kit_template_id,f.lot_id food_lot_id,f.short_code food_short_code,
       coalesce(f.quantity_available,0) food_available,
       case when f.linked_lot_id is not null then x.kit_template_id else null end hygiene_kit_template_id,
       case when f.linked_lot_id is not null then x.lot_id else null end hygiene_lot_id,
       case when f.linked_lot_id is not null then x.short_code else null end hygiene_short_code,
       case when f.linked_lot_id is not null and x.status='ready' then coalesce(x.quantity_available,0)
            when f.linked_lot_id is not null then 0 else 2147483647 end hygiene_available,
       case when f.lot_id is null then 0
            when f.linked_lot_id is not null and (x.lot_id is null or x.status<>'ready' or x.quantity_available<=0) then 0
            else least(coalesce(f.quantity_available,0),case when f.linked_lot_id is not null then coalesce(x.quantity_available,0) else coalesce(f.quantity_available,0) end)
       end split_available,
       f.public_name food_public_name,f.sale_price_override food_sale_price_override,
       f.component_sum_snapshot food_component_sum_snapshot,f.hidden_adjustment_snapshot food_hidden_adjustment_snapshot,
       f.linked_hygiene_lot_id,
       (f.linked_lot_id is not null) has_linked_lot,
       f.linked_lot_id,
       case when f.linked_lot_id is not null then x.short_code else null end linked_lot_code,
       case when f.linked_lot_id is not null then coalesce(x.quantity_available,0) else 2147483647 end linked_available,
       x.business_type linked_business_type,
       f.business_type food_business_type
from public.basket_templates bt
left join food f on f.basket_id=bt.id
left join linked x on x.lot_id=f.linked_lot_id;

-- Generalize the existing second preassembled group. It remains named "hygiene" internally
-- for backward compatibility with cart payloads, but the physical lot can now be any classified lot.
do $patch$
declare v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure) into v_def;
  v_old:=$old$where fl.id=v_food_lot_id and fl.linked_hygiene_lot_id is not null$old$;
  v_new:=$new$where fl.id=v_food_lot_id and coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) is not null$new$;
  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_presence_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$select fl.linked_hygiene_lot_id into v_hygiene_lot_id$old$;
  v_new:=$new$select coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) into v_hygiene_lot_id$new$;
  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_select_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$where l.id=v_hygiene_lot_id and k.kind='hygiene'
        and l.status='ready' and l.quantity_available>0$old$;
  v_new:=$new$where l.id=v_hygiene_lot_id
        and l.status='ready' and l.quantity_available>0$new$;
  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_validation_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$where id=v_group_lot_id and status='ready' and quantity_available>0 and sale_enabled=true$old$;
  v_new:=$new$where id=v_group_lot_id and status='ready' and quantity_available>0 and (v_group='hygiene' or sale_enabled=true)$new$;
  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_sale_enabled_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end
$patch$;

revoke all on function public.create_basket_kit_lot_v4(uuid,integer,jsonb,text,text,text,uuid,text,numeric,text,uuid) from public,anon,authenticated;
revoke all on function public.save_basket_kit_lot_draft_v4(uuid,uuid,integer,jsonb,text,text,text,uuid,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.create_basket_kit_lot_v4(uuid,integer,jsonb,text,text,text,uuid,text,numeric,text,uuid) to service_role;
grant execute on function public.save_basket_kit_lot_draft_v4(uuid,uuid,integer,jsonb,text,text,text,uuid,text,numeric,text,uuid) to service_role;

commit;
