-- Save basket quantities without writing invalid zero quantities to legacy mold positions.
-- Consolidate positions mapped to one product type while retaining their product alternatives.
begin;

create or replace function public.admin_basket_configuration_quantities_save_v1(p_quantities jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_row jsonb;
  v_basket_type_id uuid;
  v_product_id uuid;
  v_quantity numeric;
  v_template_id uuid;
  v_mold_id uuid;
  v_position_id uuid;
  v_labels text[];
  v_name text;
  v_order integer;
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;
  if jsonb_typeof(p_quantities)<>'array' then
    raise exception 'basket_admin_quantities_invalid';
  end if;

  for v_row in select value from jsonb_array_elements(p_quantities) loop
    v_basket_type_id:=nullif(v_row->>'basket_type_id','')::uuid;
    v_product_id:=nullif(v_row->>'product_type_id','')::uuid;
    v_quantity:=nullif(v_row->>'quantity','')::numeric;
    if v_basket_type_id is null or v_product_id is null or v_quantity is null or v_quantity<0
      or not exists(select 1 from public.basket_admin_basket_types where id=v_basket_type_id)
      or not exists(select 1 from public.basket_admin_product_types where id=v_product_id) then
      raise exception 'basket_admin_quantity_invalid';
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_quantities) loop
    v_basket_type_id:=(v_row->>'basket_type_id')::uuid;
    v_product_id:=(v_row->>'product_type_id')::uuid;
    v_quantity:=(v_row->>'quantity')::numeric;

    insert into public.basket_admin_quantities(basket_type_id,product_type_id,quantity,metadata,updated_at)
    values(v_basket_type_id,v_product_id,v_quantity,jsonb_build_object('updated_by',v_uid),now())
    on conflict(basket_type_id,product_type_id) do update
      set quantity=excluded.quantity,metadata=excluded.metadata,updated_at=now();

    select linked_basket_id into v_template_id
    from public.basket_admin_basket_types where id=v_basket_type_id;
    if v_template_id is null then continue; end if;

    select id into v_mold_id from public.basket_molds where basket_id=v_template_id;
    if v_mold_id is null then continue; end if;

    select name,legacy_labels into v_name,v_labels
    from public.basket_admin_product_types where id=v_product_id;

    if v_quantity=0 then
      delete from public.basket_mold_positions
      where mold_id=v_mold_id
        and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name));
      continue;
    end if;

    select id into v_position_id from public.basket_mold_positions
    where mold_id=v_mold_id
      and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name))
    order by sort_order,id limit 1;

    if v_position_id is null then
      select coalesce(max(sort_order)+1,0) into v_order
      from public.basket_mold_positions where mold_id=v_mold_id;
      insert into public.basket_mold_positions(mold_id,label,quantity,sort_order)
      values(v_mold_id,v_name,v_quantity,v_order);
      continue;
    end if;

    -- Merge alternatives from duplicate legacy rows before removing those rows.
    select coalesce(max(sort_order)+1,0) into v_order
    from public.basket_mold_position_options where position_id=v_position_id;
    insert into public.basket_mold_position_options(position_id,product_id,sort_order)
    select v_position_id,o.product_id,
      v_order+(row_number() over(order by extra.sort_order,extra.id,o.sort_order,o.product_id))::integer-1
    from public.basket_mold_positions extra
    join public.basket_mold_position_options o on o.position_id=extra.id
    where extra.mold_id=v_mold_id and extra.id<>v_position_id
      and (lower(extra.label)=any(select lower(x) from unnest(v_labels) x) or lower(extra.label)=lower(v_name))
    on conflict(position_id,product_id) do nothing;

    update public.basket_mold_positions
    set label=v_name,quantity=v_quantity,updated_at=now()
    where id=v_position_id;

    delete from public.basket_mold_positions
    where mold_id=v_mold_id and id<>v_position_id
      and (lower(label)=any(select lower(x) from unnest(v_labels) x) or lower(label)=lower(v_name));
  end loop;

  return public.admin_basket_configuration_v1();
end;
$function$;

revoke all on function public.admin_basket_configuration_quantities_save_v1(jsonb) from public,anon,authenticated;
grant execute on function public.admin_basket_configuration_quantities_save_v1(jsonb) to authenticated,service_role;

commit;
