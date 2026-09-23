create or replace function public.reserve_storefront_stock_v1(
  p_organization_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_stock numeric;
begin
  if p_organization_id is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok',false,'error','invalid_stock_request');
  end if;
  for v_row in select value from jsonb_array_elements(p_items) order by value->>'product_id'
  loop
    begin
      v_product_id := (v_row->>'product_id')::uuid;
      v_quantity := (v_row->>'quantity')::numeric;
    exception when others then
      return jsonb_build_object('ok',false,'error','invalid_stock_request');
    end;
    if v_quantity is null or v_quantity <= 0 then
      return jsonb_build_object('ok',false,'error','invalid_stock_request');
    end if;
    select stock_quantity into v_stock
    from public.products
    where organization_id=p_organization_id and id=v_product_id and active=true
    for update;
    if not found then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',v_product_id);
    end if;
    if coalesce(v_stock,0) < v_quantity then
      return jsonb_build_object('ok',false,'error','insufficient_stock','product_id',v_product_id,'available',coalesce(v_stock,0),'requested',v_quantity);
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_items) order by value->>'product_id'
  loop
    v_product_id := (v_row->>'product_id')::uuid;
    v_quantity := (v_row->>'quantity')::numeric;
    update public.products set stock_quantity=stock_quantity-v_quantity,updated_at=now()
    where organization_id=p_organization_id and id=v_product_id;
  end loop;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.reserve_storefront_stock_v1(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_storefront_stock_v1(uuid,jsonb) to service_role;

create or replace function public.release_storefront_stock_v1(
  p_organization_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row jsonb;
  v_product_id uuid;
  v_quantity numeric;
begin
  if p_organization_id is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok',false,'error','invalid_stock_request');
  end if;
  for v_row in select value from jsonb_array_elements(p_items) order by value->>'product_id'
  loop
    begin
      v_product_id := (v_row->>'product_id')::uuid;
      v_quantity := (v_row->>'quantity')::numeric;
    exception when others then
      return jsonb_build_object('ok',false,'error','invalid_stock_request');
    end;
    if v_quantity is null or v_quantity <= 0 then
      return jsonb_build_object('ok',false,'error','invalid_stock_request');
    end if;
    update public.products set stock_quantity=stock_quantity+v_quantity,updated_at=now()
    where organization_id=p_organization_id and id=v_product_id;
  end loop;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.release_storefront_stock_v1(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.release_storefront_stock_v1(uuid,jsonb) to service_role;
