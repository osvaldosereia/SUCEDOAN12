-- R10: transactional order separation commands for the isolated V2 admin.
-- Fiscal, Meta and Bling integrations remain out of band: a fiscal error
-- never prevents the operational state from becoming PRONTO.

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
      o.version,
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


create or replace function public.admin_apply_order_command(
  p_order_id uuid,
  p_command_id text,
  p_command jsonb,
  p_expected_version integer
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
  v_item da_next.order_items;
  v_command_type text;
  v_result text;
  v_item_id uuid;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_subtotal numeric(12, 0);
  v_event_type text;
  v_result_version integer;
begin
  if not da_next.has_permission('orders.separate') then
    raise exception using errcode = '42501', message = 'Permissão de separação necessária.';
  end if;
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Sessão autenticada necessária.';
  end if;
  if p_order_id is null or p_command_id is null or length(btrim(p_command_id)) = 0 then
    raise exception using errcode = '22023', message = 'Comando sem identificação.';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception using errcode = '22023', message = 'Comando inválido.';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'Versão esperada inválida.';
  end if;

  v_command_type := p_command->>'type';
  if v_command_type not in ('START', 'MARK', 'FINISH', 'DELIVER') then
    raise exception using errcode = '22023', message = 'Tipo de comando inválido.';
  end if;
  if v_command_type = 'MARK' then
    if p_command->>'itemId' is null or p_command->>'result' not in ('SEPARADO', 'FALTOU') then
      raise exception using errcode = '22023', message = 'Conferência de item inválida.';
    end if;
    v_item_id := (p_command->>'itemId')::uuid;
    v_result := p_command->>'result';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'orderId', p_order_id,
    'operatorId', v_actor,
    'command', p_command
  )::text);

  select request_fingerprint
    into v_existing_fingerprint
  from da_next.order_commands
  where order_id = p_order_id and command_id = p_command_id;
  if found then
    if v_existing_fingerprint <> v_fingerprint then
      raise exception using errcode = '40001', message = 'Chave de idempotência reutilizada.';
    end if;
    return public.admin_get_order(p_order_id);
  end if;

  select * into v_order
  from da_next.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido não encontrado.';
  end if;
  if v_order.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Pedido atualizado por outro operador.';
  end if;

  case v_command_type
    when 'START' then
      if v_order.status <> 'NOVO' then
        raise exception using errcode = '22023', message = 'Pedido não está em NOVO.';
      end if;
      update da_next.orders
      set status = 'EM_SEPARACAO', assigned_to = v_actor, version = version + 1
      where id = p_order_id;
      v_event_type := 'OrderStarted';
    when 'MARK' then
      if v_order.status <> 'EM_SEPARACAO' then
        raise exception using errcode = '22023', message = 'Pedido não está em separação.';
      end if;
      if v_order.assigned_to is distinct from v_actor then
        raise exception using errcode = '42501', message = 'Pedido pertence a outro operador.';
      end if;
      select * into v_item
      from da_next.order_items
      where id = v_item_id and order_id = p_order_id
      for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'Item do pedido não encontrado.';
      end if;
      if v_item.separation_status <> 'PENDENTE' then
        raise exception using errcode = '22023', message = 'Item já conferido.';
      end if;
      update da_next.order_items
      set separation_status = v_result,
          fulfilled_quantity = case when v_result = 'SEPARADO' then quantity else 0 end
      where id = v_item_id;

      select coalesce(sum(basket_total), 0) + coalesce((
        select sum(oi.unit_price_cents * oi.fulfilled_quantity)
        from da_next.order_items as oi
        where oi.order_id = p_order_id and oi.item_kind = 'EXTRA'
      ), 0)
      into v_subtotal
      from (
        select obs.id,
          round(obs.line_total_cents * coalesce(sum(oi.fulfilled_quantity)::numeric / nullif(sum(oi.quantity), 0), 0)) as basket_total
        from da_next.order_basket_snapshots as obs
        left join da_next.order_items as oi
          on oi.order_basket_snapshot_id = obs.id
         and oi.order_id = p_order_id
        where obs.order_id = p_order_id
        group by obs.id, obs.line_total_cents
      ) as baskets;
      v_subtotal := greatest(0, coalesce(v_subtotal, 0));
      update da_next.orders
      set subtotal_cents = v_subtotal,
          total_cents = greatest(0, v_subtotal + delivery_cents),
          version = version + 1
      where id = p_order_id;
      v_event_type := 'OrderItemMarked';
    when 'FINISH' then
      if v_order.status <> 'EM_SEPARACAO' then
        raise exception using errcode = '22023', message = 'Pedido não está em separação.';
      end if;
      if v_order.assigned_to is distinct from v_actor then
        raise exception using errcode = '42501', message = 'Pedido pertence a outro operador.';
      end if;
      if exists (select 1 from da_next.order_items where order_id = p_order_id and separation_status = 'PENDENTE') then
        raise exception using errcode = '22023', message = 'Ainda há itens a conferir.';
      end if;
      if not exists (select 1 from da_next.order_items where order_id = p_order_id and fulfilled_quantity > 0) then
        raise exception using errcode = '22023', message = 'O pedido não possui itens separados.';
      end if;
      update da_next.orders
      set status = 'PRONTO', version = version + 1
      where id = p_order_id;
      v_event_type := 'OrderReady';
    when 'DELIVER' then
      if v_order.status <> 'PRONTO' then
        raise exception using errcode = '22023', message = 'Pedido ainda não está pronto.';
      end if;
      if v_order.assigned_to is distinct from v_actor then
        raise exception using errcode = '42501', message = 'Pedido pertence a outro operador.';
      end if;
      update da_next.orders
      set status = 'ENTREGUE', version = version + 1
      where id = p_order_id;
      v_event_type := 'OrderDelivered';
  end case;

  select version into v_result_version from da_next.orders where id = p_order_id;
  insert into da_next.order_commands (
    order_id, command_id, request_fingerprint, command_type, actor_id, expected_version, result_version
  ) values (
    p_order_id, p_command_id, v_fingerprint, v_command_type, v_actor, p_expected_version, v_result_version
  );
  insert into da_next.order_events (order_id, version, event_type, actor_id, event_data)
  values (
    p_order_id,
    v_result_version,
    v_event_type,
    v_actor,
    jsonb_build_object('commandId', p_command_id, 'command', p_command)
  );
  insert into da_next.integration_outbox (
    aggregate_type, aggregate_id, aggregate_version, event_type, idempotency_key, payload
  ) values (
    'ORDER', p_order_id, v_result_version, 'OrderCommandApplied',
    'order-command:' || p_order_id || ':' || p_command_id,
    jsonb_build_object('orderId', p_order_id, 'commandId', p_command_id, 'status', v_event_type)
  );
  insert into da_next.audit_log (actor_id, action, entity_type, entity_id, changed_fields)
  values (
    v_actor,
    'ORDER_COMMAND_' || v_command_type,
    'ORDER',
    p_order_id::text,
    jsonb_build_object('commandId', p_command_id, 'expectedVersion', p_expected_version, 'resultVersion', v_result_version)
  );

  return public.admin_get_order(p_order_id);
end;
$function$;

revoke all on function public.admin_list_orders(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_order(uuid) from public, anon, authenticated;
revoke all on function public.admin_apply_order_command(uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.admin_list_orders(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_order(uuid) to authenticated;
grant execute on function public.admin_apply_order_command(uuid, text, jsonb, integer) to authenticated;
comment on function public.admin_apply_order_command(uuid, text, jsonb, integer) is
  'V2 staging transactional separation command; lock, version, idempotency, total adjustment and audit are atomic.';

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
    'version', v_order.version,
    'item_count', jsonb_array_length(v_items),
    'address', v_order.address_snapshot,
    'assigned_to', v_order.assigned_to,
    'items', v_items
  );
end;
$function$;
