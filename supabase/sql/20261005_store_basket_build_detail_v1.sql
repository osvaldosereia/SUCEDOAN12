-- Dona Antônia · detalhe operacional de lote para impressão A4
begin;
create or replace function public.store_basket_build_detail_v1(p_lot_id uuid)
returns jsonb language sql security definer set search_path='' as $function$
  select jsonb_build_object(
    'lot_id',l.id,'basket_id',l.basket_id,'lot_code',l.lot_code,'public_name',l.public_name,
    'status',l.status,'assembly_status',l.assembly_status,'quantity_built',l.quantity_built,
    'quantity_available',l.quantity_available,'sale_enabled',l.sale_enabled,'sale_price',l.sale_price_override,
    'built_at',l.built_at,'built_by',l.built_by,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,'name',p.name,'image_url',p.url_imagem,
        'quantity_per_basket',i.quantity_per_basket,'quantity_for_lot',i.quantity_per_basket*l.quantity_built
      ) order by i.position_order,p.name)
      from public.basket_stock_lot_items i join public.products p on p.id=i.product_id
      where i.lot_id=l.id
    ),'[]'::jsonb)
  )
  from public.basket_stock_lots l
  where l.id=p_lot_id and coalesce(l.metadata->>'store_basket_reserved_v1','false')='true';
$function$;
revoke all on function public.store_basket_build_detail_v1(uuid) from public,anon,authenticated;
grant execute on function public.store_basket_build_detail_v1(uuid) to service_role;
commit;
