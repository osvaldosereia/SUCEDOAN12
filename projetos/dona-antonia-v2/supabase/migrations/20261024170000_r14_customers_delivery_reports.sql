-- R14: protected customer history, delivery outcome and operational reports.
-- This migration is isolated to the V2 staging project; no route/driver worker is created.

create table da_next.delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  request_id uuid not null unique,
  actor_id uuid not null,
  status text not null check (status in ('CONCLUIDA', 'PROBLEMA')),
  note text check (note is null or length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index delivery_events_order_created
  on da_next.delivery_events (order_id, created_at desc);
create index delivery_events_status_created
  on da_next.delivery_events (status, created_at desc);

alter table da_next.delivery_events enable row level security;
create policy delivery_events_operational_read on da_next.delivery_events
  for select to authenticated using (da_next.has_permission('orders.read'));
grant select on da_next.delivery_events to authenticated;

create or replace function public.admin_list_customers(
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
  if not da_next.has_permission('customers.read') then
    raise exception using errcode = '42501', message = 'Permissão de clientes necessária.';
  end if;
  select count(*)::integer into v_total
  from da_next.customers as customer
  where v_search is null
    or lower(customer.display_name) like '%' || v_search || '%'
    or customer.phone_digits like '%' || v_search || '%';

  select coalesce(jsonb_agg(to_jsonb(result) order by result.last_order_at desc nulls last, result.id), '[]'::jsonb)
    into v_items
  from (
    select customer.id, customer.display_name, customer.phone_digits,
      count(order_row.id)::integer as order_count,
      max(order_row.created_at) as last_order_at,
      (select jsonb_build_object(
        'street', address.street, 'streetNumber', address.street_number,
        'neighborhood', address.neighborhood, 'city', address.city,
        'stateCode', address.state_code, 'postalCode', address.postal_code
      ) from da_next.customer_addresses address
       where address.customer_id = customer.id and address.is_default
       order by address.created_at desc limit 1) as default_address
    from da_next.customers customer
    left join da_next.orders order_row on order_row.customer_id = customer.id
    where v_search is null
      or lower(customer.display_name) like '%' || v_search || '%'
      or customer.phone_digits like '%' || v_search || '%'
    group by customer.id
    order by last_order_at desc nulls last, customer.id
    limit v_limit offset v_offset
  ) result;
  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$function$;

create or replace function public.admin_get_customer(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_customer da_next.customers;
  v_addresses jsonb;
  v_orders jsonb;
begin
  if not da_next.has_permission('customers.read') then
    raise exception using errcode = '42501', message = 'Permissão de clientes necessária.';
  end if;
  select * into v_customer from da_next.customers where id = p_customer_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Cliente não encontrado.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', address.id, 'label', address.label, 'recipientName', address.recipient_name,
    'postalCode', address.postal_code, 'street', address.street,
    'streetNumber', address.street_number, 'complement', address.complement,
    'neighborhood', address.neighborhood, 'city', address.city,
    'stateCode', address.state_code, 'referenceNote', address.reference_note,
    'isDefault', address.is_default
  ) order by address.is_default desc, address.created_at desc), '[]'::jsonb)
    into v_addresses
  from da_next.customer_addresses address where address.customer_id = v_customer.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', order_row.id, 'number', order_row.order_number, 'createdAt', order_row.created_at,
    'status', order_row.status, 'deliveryStatus', order_row.delivery_status,
    'totalCents', order_row.total_cents, 'address', order_row.address_snapshot
  ) order by order_row.created_at desc), '[]'::jsonb)
    into v_orders
  from da_next.orders order_row where order_row.customer_id = v_customer.id;
  return jsonb_build_object(
    'id', v_customer.id, 'displayName', v_customer.display_name,
    'phoneDigits', v_customer.phone_digits, 'createdAt', v_customer.created_at,
    'addresses', v_addresses, 'orders', v_orders
  );
end;
$function$;

create or replace function public.admin_record_delivery_outcome(
  p_order_id uuid,
  p_request_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor uuid := auth.uid();
  v_order da_next.orders;
  v_existing da_next.delivery_events;
  v_note text := nullif(btrim(p_note), '');
begin
  if v_actor is null or not da_next.has_permission('orders.separate') then
    raise exception using errcode = '42501', message = 'Permissão de entrega necessária.';
  end if;
  if p_order_id is null or p_request_id is null or p_status not in ('CONCLUIDA', 'PROBLEMA') then
    raise exception using errcode = '22023', message = 'Resultado de entrega inválido.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'Observação de entrega muito longa.';
  end if;
  select * into v_existing from da_next.delivery_events where request_id = p_request_id;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.status <> p_status then
      raise exception using errcode = '40001', message = 'Chave de entrega reutilizada.';
    end if;
    return public.admin_get_order(p_order_id) || jsonb_build_object('replayed', true);
  end if;
  select * into v_order from da_next.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Pedido não encontrado.'; end if;
  if v_order.status <> 'ENTREGUE' then
    raise exception using errcode = '22023', message = 'O resultado só pode ser registrado após marcar o pedido como entregue.';
  end if;
  insert into da_next.delivery_events (order_id, request_id, actor_id, status, note)
    values (p_order_id, p_request_id, v_actor, p_status, v_note);
  update da_next.orders set delivery_status = p_status where id = p_order_id;
  insert into da_next.audit_log (actor_id, action, entity_type, entity_id, request_id, changed_fields)
    values (v_actor, 'DELIVERY_' || p_status, 'ORDER', p_order_id::text, p_request_id,
      jsonb_build_object('status', p_status, 'hasNote', v_note is not null));
  return public.admin_get_order(p_order_id) || jsonb_build_object('replayed', false);
end;
$function$;

create or replace function public.admin_get_operational_report(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_from timestamptz := coalesce(p_from, current_date - 6)::timestamptz;
  v_to timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
  v_total integer;
  v_sales numeric(12, 0);
  v_status jsonb;
  v_delivery jsonb;
  v_fiscal jsonb;
begin
  if not da_next.has_permission('orders.read') then
    raise exception using errcode = '42501', message = 'Permissão de pedidos necessária.';
  end if;
  if v_to <= v_from or v_to - v_from > interval '366 days' then
    raise exception using errcode = '22023', message = 'Período do relatório inválido.';
  end if;
  select count(*)::integer, coalesce(sum(total_cents), 0)
    into v_total, v_sales
  from da_next.orders where created_at >= v_from and created_at < v_to;
  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) into v_status from (
    select status, count(*)::integer as total from da_next.orders
    where created_at >= v_from and created_at < v_to group by status
  ) grouped;
  select coalesce(jsonb_object_agg(delivery_status, total), '{}'::jsonb) into v_delivery from (
    select delivery_status, count(*)::integer as total from da_next.orders
    where created_at >= v_from and created_at < v_to group by delivery_status
  ) grouped;
  select coalesce(jsonb_object_agg(fiscal_status, total), '{}'::jsonb) into v_fiscal from (
    select fiscal_status, count(*)::integer as total from da_next.orders
    where created_at >= v_from and created_at < v_to group by fiscal_status
  ) grouped;
  return jsonb_build_object(
    'from', v_from::date, 'to', (v_to - interval '1 day')::date,
    'ordersTotal', v_total, 'salesTotalCents', v_sales,
    'byStatus', v_status, 'byDeliveryStatus', v_delivery, 'byFiscalStatus', v_fiscal
  );
end;
$function$;

revoke all on function public.admin_list_customers(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_customer(uuid) from public, anon, authenticated;
revoke all on function public.admin_record_delivery_outcome(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_get_operational_report(date, date) from public, anon, authenticated;
grant execute on function public.admin_list_customers(text, integer, integer) to authenticated;
grant execute on function public.admin_get_customer(uuid) to authenticated;
grant execute on function public.admin_record_delivery_outcome(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_get_operational_report(date, date) to authenticated;

comment on table da_next.delivery_events is
  'Resultado de entrega append-only; não cria roteirização nem envia comunicação externa.';
