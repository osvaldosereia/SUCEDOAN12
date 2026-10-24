-- R09: authenticated operational read model for the four order tabs.
-- Public checkout and private price tables stay outside this projection.
create or replace function public.admin_list_orders(
  p_status text,
  p_search text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 20)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  if not da_next.has_permission('orders.read') then
    raise exception using errcode = '42501', message = 'Permissão de pedidos necessária.';
  end if;
  if p_status is null or p_status not in ('NOVO', 'EM_SEPARACAO', 'PRONTO', 'ENTREGUE') then
    raise exception using errcode = '22023', message = 'Aba de pedidos inválida.';
  end if;

  select count(*)::integer into v_total
  from da_next.orders as o
  where o.status = p_status
    and (v_search is null or lower(concat_ws(' ', o.order_number, o.customer_name_snapshot, o.customer_phone_snapshot)) like '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(result) order by result.created_at desc, result.id), '[]'::jsonb)
    into v_items
  from (
    select
      o.id,
      o.order_number,
      o.created_at,
      o.customer_name_snapshot as customer_name,
      o.customer_phone_snapshot as customer_phone,
      o.total_cents,
      o.payment_method,
      o.payment_status,
      o.delivery_status,
      o.fiscal_status,
      o.status,
      count(oi.id)::integer as item_count
    from da_next.orders as o
    left join da_next.order_items as oi on oi.order_id = o.id
    where o.status = p_status
      and (v_search is null or lower(concat_ws(' ', o.order_number, o.customer_name_snapshot, o.customer_phone_snapshot)) like '%' || v_search || '%')
    group by o.id
    order by o.created_at desc, o.id
    limit v_limit offset v_offset
  ) as result;

  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$function$;

create or replace function public.admin_get_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_order da_next.orders;
  v_items jsonb;
begin
  if not da_next.has_permission('orders.read') then
    raise exception using errcode = '42501', message = 'Permissão de pedidos necessária.';
  end if;
  select * into v_order from da_next.orders where id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido não encontrado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'line_number', oi.line_number,
    'kind', oi.item_kind,
    'sku', oi.sku_snapshot,
    'name', oi.product_name_snapshot,
    'product_type_name', oi.product_type_name_snapshot,
    'quantity', oi.quantity,
    'fulfilled_quantity', oi.fulfilled_quantity,
    'separation', oi.separation_status,
    'unit_price_cents', case when oi.item_kind = 'EXTRA' then oi.unit_price_cents else null end,
    'line_total_cents', case when oi.item_kind = 'EXTRA' then oi.line_total_cents else null end
  ) order by oi.line_number), '[]'::jsonb)
    into v_items
  from da_next.order_items as oi
  where oi.order_id = p_order_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'customer_name', v_order.customer_name_snapshot,
    'customer_phone', v_order.customer_phone_snapshot,
    'total_cents', v_order.total_cents,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'delivery_status', v_order.delivery_status,
    'fiscal_status', v_order.fiscal_status,
    'status', v_order.status,
    'item_count', jsonb_array_length(v_items),
    'address', v_order.address_snapshot,
    'assigned_to', v_order.assigned_to,
    'items', v_items
  );
end;
$function$;

revoke all on function public.admin_list_orders(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_order(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_orders(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_order(uuid) to authenticated;
comment on function public.admin_list_orders(text, text, integer, integer) is 'V2 staging operational order list: four statuses, pagination and server-side search.';
comment on function public.admin_get_order(uuid) is 'V2 staging operational order detail; basket component private prices are never projected.';
