begin;

-- Drafts may reference another draft/ready lot so both sides can be prepared in any order.
-- Physical mounting and direct ready creation still require the dependency to be ready with stock.
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
    where l.id=p_linked_lot_id and l.status in ('draft','ready');
    if not found then raise exception 'invalid_linked_lot'; end if;
    if exists(select 1 from public.basket_stock_lots l where l.id=p_linked_lot_id and l.linked_lot_id is not null) then
      raise exception 'linked_lot_already_composite';
    end if;

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
         hidden_adjustment_snapshot=v_effective_hidden,
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
  if p_linked_lot_id is not null and not exists(
    select 1 from public.basket_stock_lots l
    where l.id=p_linked_lot_id and l.status='ready' and coalesce(l.quantity_available,0)>0 and l.linked_lot_id is null
  ) then raise exception 'linked_lot_unavailable'; end if;

  v_result:=public.create_basket_kit_lot_v3(
    p_kit_template_id,p_quantity,p_items,p_operator,p_notes,p_short_code,
    p_duplicated_from_lot_id,p_public_name,p_sale_price,null
  );
  v_lot_id:=nullif(v_result->>'lot_id','')::uuid;
  v_commercial:=public.apply_basket_kit_lot_commercial_v3(v_lot_id,p_public_name,p_sale_price,p_business_type,p_linked_lot_id);
  return v_result||jsonb_build_object('commercial',v_commercial);
end;
$$;

create or replace function public.activate_basket_kit_lot_draft_v2(p_lot_id uuid,p_operator text default null)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_lot public.basket_stock_lots%rowtype;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id;
  if not found then raise exception 'draft_lot_not_found'; end if;

  if v_lot.linked_lot_id is not null and not exists(
    select 1 from public.basket_stock_lots l
    where l.id=v_lot.linked_lot_id and l.status='ready' and coalesce(l.quantity_available,0)>0 and l.linked_lot_id is null
  ) then raise exception 'linked_lot_unavailable'; end if;

  if v_lot.linked_lot_id is not null then
    perform public.apply_basket_kit_lot_commercial_v3(
      p_lot_id,
      v_lot.public_name,
      coalesce(v_lot.own_sale_price_override,0),
      v_lot.business_type,
      v_lot.linked_lot_id
    );
  end if;

  return public.activate_basket_kit_lot_draft_v1(p_lot_id,p_operator);
end;
$$;

commit;
