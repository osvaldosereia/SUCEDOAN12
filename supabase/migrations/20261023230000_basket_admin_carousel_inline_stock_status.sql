-- Expose physical stock in the basket carousel and allow admins to find inactive products.
-- Writes still go through the existing product admin services, which enforce stock authority and reservations.
begin;

create or replace function public.admin_basket_configuration_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;

  return jsonb_build_object(
    'basket_types',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'name',t.name,'sort_order',t.sort_order,'is_active',t.is_active,
        'linked_template_id',t.linked_basket_id,'template_active',b.is_active,'site_visible',coalesce(b.is_active,false)
      ) order by t.sort_order,t.name)
      from public.basket_admin_basket_types t
      left join public.basket_templates b on b.id=t.linked_basket_id
    ),'[]'::jsonb),
    'product_types',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pt.id,'name',pt.name,'category',pt.category,'sort_order',pt.sort_order,'is_active',pt.is_active,
        'options',coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,'image_url',p.image_url,
            'is_active',p.is_active,'stock',coalesce(p.stock,0),'price',p.price,'offer_price',p.offer_price,
            'is_offer',p.is_offer,'sort_order',o.sort_order
          ) order by o.sort_order,p.id)
          from public.basket_admin_product_options o
          join public.products p on p.id=o.product_id
          where o.product_type_id=pt.id
        ),'[]'::jsonb)
      ) order by case pt.category when 'Alimentos' then 0 when 'Limpeza' then 1 else 2 end,pt.sort_order,pt.name)
      from public.basket_admin_product_types pt
    ),'[]'::jsonb),
    'quantities',coalesce((
      select jsonb_agg(jsonb_build_object('basket_type_id',q.basket_type_id,'product_type_id',q.product_type_id,'quantity',q.quantity))
      from public.basket_admin_quantities q
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_basket_mold_products_v1(
  p_query text default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_query text:=btrim(coalesce(p_query,''));
  v_limit integer:=least(40,greatest(1,coalesce(p_limit,24)));
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active=true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  return jsonb_build_object(
    'products',coalesce((
      select jsonb_agg(row_data order by row_data->>'name',row_data->>'id')
      from (
        select jsonb_build_object(
          'id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,'packaging',p.packaging,
          'image_url',p.image_url,'price',p.price,'cost',p.cost,'stock',coalesce(p.stock,0),
          'is_active',p.is_active,'loose_sellable_stock',coalesce(s.loose_sellable_stock,0),
          'effective_sellable_stock',coalesce(s.effective_sellable_stock,0),
          'basket_locked_quantity',coalesce(s.basket_locked_quantity,0)
        ) as row_data
        from public.products p
        left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
        where v_query='' or p.name ilike '%'||v_query||'%'
          or coalesce(p.sku,'') ilike '%'||v_query||'%'
          or coalesce(p.gtin,'') ilike '%'||v_query||'%'
        order by p.name,p.id
        limit v_limit
      ) q
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.admin_basket_configuration_v1() from public,anon,authenticated;
grant execute on function public.admin_basket_configuration_v1() to authenticated;

revoke all on function public.admin_basket_mold_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.admin_basket_mold_products_v1(text,integer) to authenticated;

commit;
