-- Dona Antônia · Cestas e Kits V2 transactional writes

create or replace function public.basket_v2_item_save_v1(p_item jsonb, p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_name text;
  v_category_id uuid;
  v_sale_price numeric(12,2);
  v_mode text;
  v_image text;
  v_description text;
  v_sort integer;
  v_old_mode text;
  v_row public.basket_v2_items%rowtype;
begin
  begin v_id:=nullif(trim(p_item->>'id'),'')::uuid; exception when others then v_id:=null; end;
  v_name:=trim(coalesce(p_item->>'public_name',''));
  begin v_category_id:=nullif(trim(p_item->>'category_id'),'')::uuid; exception when others then v_category_id:=null; end;
  if v_category_id is null then raise exception 'basket_v2_category_required'; end if;
  if not exists(select 1 from public.basket_categories c where c.id=v_category_id and c.is_active=true) then raise exception 'basket_v2_category_invalid'; end if;
  if length(v_name)<1 then raise exception 'basket_v2_name_required'; end if;
  begin v_sale_price:=round(((p_item->>'sale_price_cents')::numeric/100.0),2); exception when others then v_sale_price:=null; end;
  if v_sale_price is null or v_sale_price <= 0 then raise exception 'basket_v2_invalid_sale_price'; end if;
  v_mode:=coalesce(nullif(p_item->>'composition_mode',''),'products');
  if v_mode not in ('products','combined_kits') then raise exception 'basket_v2_invalid_composition_mode'; end if;
  v_image:=nullif(trim(coalesce(p_item->>'image_url','')),'');
  v_description:=nullif(trim(coalesce(p_item->>'description_short','')),'');
  begin v_sort:=coalesce((p_item->>'sort_order')::integer,0); exception when others then v_sort:=0; end;

  if v_id is null then
    insert into public.basket_v2_items(public_name,category_id,image_url,description_short,sale_price,composition_mode,sort_order)
    values(v_name,v_category_id,v_image,v_description,v_sale_price,v_mode,v_sort)
    returning * into v_row;
  else
    select composition_mode into v_old_mode from public.basket_v2_items where id=v_id for update;
    if v_old_mode is null then raise exception 'basket_v2_item_not_found'; end if;
    if v_old_mode<>v_mode and exists(select 1 from public.basket_v2_lots where item_id=v_id) then
      raise exception 'basket_v2_mode_change_with_lots';
    end if;
    update public.basket_v2_items
      set public_name=v_name,category_id=v_category_id,image_url=v_image,description_short=v_description,
          sale_price=v_sale_price,composition_mode=v_mode,sort_order=v_sort
      where id=v_id returning * into v_row;
    if v_old_mode<>v_mode then
      if v_mode='products' then delete from public.basket_v2_kit_components where parent_item_id=v_id;
      else delete from public.basket_v2_product_components where item_id=v_id;
      end if;
    end if;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.basket_v2_product_components_save_v1(p_item_id uuid, p_components jsonb, p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_mode text; v_count integer;
begin
  select composition_mode into v_mode from public.basket_v2_items where id=p_item_id for update;
  if v_mode is null then raise exception 'basket_v2_item_not_found'; end if;
  if v_mode<>'products' then raise exception 'basket_v2_item_not_products'; end if;
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb))<>'array' then raise exception 'basket_v2_invalid_components'; end if;
  delete from public.basket_v2_product_components where item_id=p_item_id;
  with parsed as (
    select product_id,quantity,coalesce(position_order,0) position_order
    from jsonb_to_recordset(coalesce(p_components,'[]'::jsonb)) as x(product_id uuid,quantity numeric,position_order integer)
    where product_id is not null and quantity>0
  ), grouped as (
    select product_id,sum(quantity)::numeric(12,3) quantity,min(position_order) position_order
    from parsed group by product_id
  )
  insert into public.basket_v2_product_components(item_id,product_id,quantity,position_order)
  select p_item_id,product_id,quantity,position_order from grouped;
  get diagnostics v_count=row_count;
  return jsonb_build_object('item_id',p_item_id,'count',v_count);
end $$;

create or replace function public.basket_v2_kit_components_save_v1(p_item_id uuid, p_components jsonb, p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_mode text; v_count integer;
begin
  select composition_mode into v_mode from public.basket_v2_items where id=p_item_id for update;
  if v_mode is null then raise exception 'basket_v2_item_not_found'; end if;
  if v_mode<>'combined_kits' then raise exception 'basket_v2_item_not_combined'; end if;
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb))<>'array' then raise exception 'basket_v2_invalid_components'; end if;
  delete from public.basket_v2_kit_components where parent_item_id=p_item_id;
  with parsed as (
    select component_item_id,quantity,coalesce(position_order,0) position_order
    from jsonb_to_recordset(coalesce(p_components,'[]'::jsonb)) as x(component_item_id uuid,quantity integer,position_order integer)
    where component_item_id is not null and quantity>=1
  ), grouped as (
    select component_item_id,sum(quantity)::integer quantity,min(position_order) position_order
    from parsed group by component_item_id
  )
  insert into public.basket_v2_kit_components(parent_item_id,component_item_id,quantity,position_order)
  select p_item_id,component_item_id,quantity,position_order from grouped;
  get diagnostics v_count=row_count;
  return jsonb_build_object('item_id',p_item_id,'count',v_count);
end $$;

create or replace function public.basket_v2_item_duplicate_v1(p_item_id uuid, p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_src public.basket_v2_items%rowtype; v_new public.basket_v2_items%rowtype;
begin
  select * into v_src from public.basket_v2_items where id=p_item_id;
  if v_src.id is null then raise exception 'basket_v2_item_not_found'; end if;
  insert into public.basket_v2_items(public_name,category_id,image_url,description_short,sale_price,composition_mode,paused,is_active,sort_order)
  values(v_src.public_name||' - Cópia',v_src.category_id,v_src.image_url,v_src.description_short,v_src.sale_price,v_src.composition_mode,true,true,v_src.sort_order)
  returning * into v_new;
  if v_src.composition_mode='products' then
    insert into public.basket_v2_product_components(item_id,product_id,quantity,position_order)
    select v_new.id,product_id,quantity,position_order from public.basket_v2_product_components where item_id=v_src.id;
  else
    insert into public.basket_v2_kit_components(parent_item_id,component_item_id,quantity,position_order)
    select v_new.id,component_item_id,quantity,position_order from public.basket_v2_kit_components where parent_item_id=v_src.id;
  end if;
  return to_jsonb(v_new);
end $$;

create or replace function public.basket_v2_item_pause_v1(p_item_id uuid, p_paused boolean, p_operator text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.basket_v2_items%rowtype;
begin
  update public.basket_v2_items set paused=coalesce(p_paused,false) where id=p_item_id returning * into v_row;
  if v_row.id is null then raise exception 'basket_v2_item_not_found'; end if;
  return to_jsonb(v_row);
end $$;

revoke all on function public.basket_v2_item_save_v1(jsonb,text) from public,anon,authenticated;
revoke all on function public.basket_v2_product_components_save_v1(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.basket_v2_kit_components_save_v1(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.basket_v2_item_duplicate_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.basket_v2_item_pause_v1(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.basket_v2_item_save_v1(jsonb,text) to service_role;
grant execute on function public.basket_v2_product_components_save_v1(uuid,jsonb,text) to service_role;
grant execute on function public.basket_v2_kit_components_save_v1(uuid,jsonb,text) to service_role;
grant execute on function public.basket_v2_item_duplicate_v1(uuid,text) to service_role;
grant execute on function public.basket_v2_item_pause_v1(uuid,boolean,text) to service_role;
