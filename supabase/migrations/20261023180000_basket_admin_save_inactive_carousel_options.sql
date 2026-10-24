-- Keep existing basket carousel choices editable when their catalog product is inactive.
-- Basket composition rules can intentionally preserve inactive catalog products; only missing,
-- duplicate, malformed product IDs remain invalid.
begin;
create or replace function public.admin_basket_configuration_product_type_save_v1(p_product_type jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid(); v_id uuid; v_name text; v_category text; v_order integer; v_active boolean;
  v_row jsonb; v_product uuid; v_seen uuid[]:='{}'::uuid[]; v_pos uuid; v_mold uuid;
  v_template uuid; v_qty numeric; v_labels text[];
begin
  if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then
    raise exception 'admin_not_authorized';
  end if;
  if p_product_type is null or jsonb_typeof(p_product_type)<>'object' then raise exception 'basket_admin_product_type_invalid'; end if;
  v_id:=nullif(p_product_type->>'id','')::uuid; v_name:=btrim(coalesce(p_product_type->>'name',''));
  v_category:=btrim(coalesce(p_product_type->>'category','')); v_order:=coalesce(nullif(p_product_type->>'sort_order','')::integer,0);
  v_active:=coalesce((p_product_type->>'is_active')::boolean,true);
  if v_name='' or char_length(v_name)>100 or v_category not in ('Alimentos','Limpeza','Higiene') or v_order<0 then
    raise exception 'basket_admin_product_type_invalid';
  end if;
  if jsonb_typeof(p_product_type->'options')<>'array' then raise exception 'basket_admin_product_options_invalid'; end if;
  for v_row in select value from jsonb_array_elements(p_product_type->'options') loop
    v_product:=nullif(v_row->>'product_id','')::uuid;
    -- Do not reject a product solely because it was deactivated after being added to a basket.
    if v_product is null or v_product=any(v_seen) or not exists(select 1 from public.products p where p.id=v_product) then
      raise exception 'basket_admin_product_option_invalid';
    end if;
    v_seen:=array_append(v_seen,v_product);
  end loop;
  if v_id is null then
    insert into public.basket_admin_product_types(name,category,sort_order,is_active,metadata)
    values(v_name,v_category,v_order,v_active,jsonb_build_object('updated_by',v_uid)) returning id into v_id;
  else
    update public.basket_admin_product_types set name=v_name,category=v_category,sort_order=v_order,is_active=v_active,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_uid),updated_at=now()
    where id=v_id;
    if not found then raise exception 'basket_admin_product_type_not_found'; end if;
  end if;
  delete from public.basket_admin_product_options where product_type_id=v_id;
  for v_row in select value from jsonb_array_elements(p_product_type->'options') with ordinality as x(value,ord) order by ord loop
    insert into public.basket_admin_product_options(product_type_id,product_id,sort_order)
    values(v_id,(v_row->>'product_id')::uuid,(v_row->>'sort_order')::integer);
  end loop;
  select legacy_labels into v_labels from public.basket_admin_product_types where id=v_id;
  for v_template in select linked_basket_id from public.basket_admin_basket_types where linked_basket_id is not null loop
    select id into v_mold from public.basket_molds where basket_id=v_template;
    if v_mold is null then continue; end if;
    select id into v_pos from public.basket_mold_positions where mold_id=v_mold
      and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name))
      order by sort_order,id limit 1;
    if v_pos is null then
      select coalesce(quantity,0) into v_qty from public.basket_admin_quantities
       where basket_type_id=(select id from public.basket_admin_basket_types where linked_basket_id=v_template)
       and product_type_id=v_id;
      if coalesce(v_qty,0)<=0 then continue; end if;
      insert into public.basket_mold_positions(mold_id,label,quantity,sort_order)
      select v_mold,v_name,v_qty,coalesce(max(sort_order)+1,0) from public.basket_mold_positions where mold_id=v_mold
      returning id into v_pos;
    end if;
    delete from public.basket_mold_position_options where position_id=v_pos;
    insert into public.basket_mold_position_options(position_id,product_id,sort_order)
      select v_pos,o.product_id,o.sort_order from public.basket_admin_product_options o
      where o.product_type_id=v_id order by o.sort_order,o.product_id;
  end loop;
  return public.admin_basket_configuration_v1();
end;
$function$;
commit;
