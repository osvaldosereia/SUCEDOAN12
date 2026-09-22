begin;

create or replace function public.preview_papoai_commerce_basket_personalization_v1(
  p_basket_query text,
  p_changes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_detail jsonb;
  v_basket_id uuid;
  v_base_price numeric;
  v_delta numeric:=0;
  v_change jsonb;
  v_item public.basket_template_items%rowtype;
  v_product public.products%rowtype;
  v_qty numeric;
  v_diff numeric;
  v_unit_delta numeric;
  v_items jsonb;
begin
  if p_changes is null or jsonb_typeof(p_changes)<>'array' then
    raise exception 'changes_must_be_array';
  end if;

  v_detail:=public.get_papoai_commerce_basket_detail_v1(p_basket_query);
  if not coalesce((v_detail->>'found')::boolean,false) then return v_detail; end if;

  v_basket_id:=(v_detail#>>'{basket,id}')::uuid;
  v_base_price:=(v_detail#>>'{basket,commercial_price}')::numeric;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    if coalesce(v_change->>'product_id','')='' then raise exception 'product_id_required'; end if;
    if coalesce(v_change->>'quantity','')='' then raise exception 'quantity_required'; end if;
    v_qty:=(v_change->>'quantity')::numeric;
    if v_qty<0 or trunc(v_qty)<>v_qty then raise exception 'invalid_quantity'; end if;

    select * into v_item
    from public.basket_template_items
    where basket_id=v_basket_id and product_id=(v_change->>'product_id')::uuid;
    if not found then raise exception 'basket_item_not_found'; end if;

    if v_qty=0 and not v_item.removable then raise exception 'item_not_removable'; end if;
    if v_qty<>v_item.quantity and not v_item.quantity_editable then raise exception 'quantity_not_editable'; end if;
    if v_qty<coalesce(v_item.min_quantity,case when v_item.removable then 0 else v_item.quantity end) then raise exception 'below_min_quantity'; end if;
    if v_qty>coalesce(v_item.max_quantity,greatest(v_item.quantity,20)) then raise exception 'above_max_quantity'; end if;

    select * into v_product from public.products where id=v_item.product_id;
    if not found then raise exception 'product_missing'; end if;

    v_diff:=v_qty-v_item.quantity;
    if v_diff<0 then
      v_unit_delta:=case
        when v_item.remove_unit_delta is null then -coalesce(v_product.price,0)
        when v_item.remove_unit_delta>0 then -v_item.remove_unit_delta
        else v_item.remove_unit_delta
      end;
      if v_unit_delta=0 and coalesce(v_product.price,0)<=0 then raise exception 'remove_pricing_not_configured'; end if;
      v_delta:=v_delta+(abs(v_diff)*v_unit_delta);
    elsif v_diff>0 then
      v_unit_delta:=coalesce(v_item.add_unit_delta,v_product.price);
      if v_unit_delta is null or v_unit_delta<=0 then raise exception 'add_pricing_not_configured'; end if;
      v_delta:=v_delta+(v_diff*v_unit_delta);
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',p.id,
    'name',p.name,
    'quantity',coalesce((
      select (x->>'quantity')::numeric
      from jsonb_array_elements(p_changes) x
      where x->>'product_id'=p.id::text
      order by 1 desc
      limit 1
    ),bi.quantity),
    'category',p.category,
    'image_url',coalesce(p.image_url,p.image_ai_url,p.image_source_url)
  ) order by bi.sort_order,p.name),'[]'::jsonb)
  into v_items
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=v_basket_id
    and coalesce((
      select (x->>'quantity')::numeric
      from jsonb_array_elements(p_changes) x
      where x->>'product_id'=p.id::text
      limit 1
    ),bi.quantity)>0;

  return jsonb_build_object(
    'ok',true,
    'basket_id',v_basket_id,
    'basket_name',v_detail#>>'{basket,display_name}',
    'base_commercial_price',v_base_price,
    'commercial_delta',round(v_delta,2),
    'total',round(greatest(0,v_base_price+v_delta),2),
    'items',v_items,
    'component_prices_visible',false,
    'hidden_adjustment_visible',false,
    'calculation_authority','supabase',
    'writes_performed',false
  );
end;
$$;

revoke all on function public.preview_papoai_commerce_basket_personalization_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_papoai_commerce_basket_personalization_v1(text,jsonb) to service_role;

commit;
