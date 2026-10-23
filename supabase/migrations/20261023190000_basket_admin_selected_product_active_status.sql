-- Expose the current catalog activation state in the Basket carousel editor.
-- The admin uses this to distinguish selected products that are no longer active on the public site.
begin;
create or replace function public.admin_basket_configuration_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer') then
    raise exception 'admin_not_authorized';
  end if;
  return jsonb_build_object(
    'basket_types',coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'sort_order',t.sort_order,'is_active',t.is_active,
        'linked_template_id',t.linked_basket_id,'template_active',b.is_active,'site_visible',coalesce(b.is_active,false))
        order by t.sort_order,t.name)
      from public.basket_admin_basket_types t left join public.basket_templates b on b.id=t.linked_basket_id
    ),'[]'::jsonb),
    'product_types',coalesce((
      select jsonb_agg(jsonb_build_object('id',pt.id,'name',pt.name,'category',pt.category,'sort_order',pt.sort_order,'is_active',pt.is_active,
        'options',coalesce((select jsonb_agg(jsonb_build_object('product_id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,
          'image_url',p.image_url,'is_active',p.is_active,'price',p.price,'offer_price',p.offer_price,'is_offer',p.is_offer,'sort_order',o.sort_order)
          order by o.sort_order,p.id) from public.basket_admin_product_options o join public.products p on p.id=o.product_id
          where o.product_type_id=pt.id),'[]'::jsonb))
        order by case pt.category when 'Alimentos' then 0 when 'Limpeza' then 1 else 2 end,pt.sort_order,pt.name)
      from public.basket_admin_product_types pt
    ),'[]'::jsonb),
    'quantities',coalesce((select jsonb_agg(jsonb_build_object('basket_type_id',q.basket_type_id,'product_type_id',q.product_type_id,'quantity',q.quantity))
      from public.basket_admin_quantities q),'[]'::jsonb)
  );
end;
$function$;
commit;
