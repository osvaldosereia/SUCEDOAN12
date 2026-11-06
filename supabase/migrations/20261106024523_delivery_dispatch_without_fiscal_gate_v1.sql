-- Keep invoice sending paused while allowing a prepared and physically valid delivery route to leave.
update public.fiscal_runtime_config
   set bling_invoice_send_enabled = false,
       require_fiscal_authorization_before_dispatch = false,
       updated_at = now()
 where id = 1;

create or replace function public.ops4_start_dispatch_v1(
  p_order_id uuid,
  p_operator_label text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  o public.orders%rowtype;
  s public.order_separation_completions_v1%rowtype;
  c public.order_fiscal_controls%rowtype;
  gate jsonb;
  v_now timestamptz := now();
  v_key text;
begin
  if p_order_id is null then raise exception 'invalid_order'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  insert into public.order_fiscal_controls(order_id) values (o.id)
  on conflict (order_id) do nothing;
  select * into c from public.order_fiscal_controls where order_id = o.id for update;

  if o.status = 'out_for_delivery' then
    return jsonb_build_object(
      'ok', true, 'order_id', o.id, 'status', o.status,
      'dispatch_started_at', c.dispatch_started_at, 'already_started', true
    );
  end if;
  if o.status <> 'ready' then raise exception 'order_not_ready_for_dispatch'; end if;

  select * into s from public.order_separation_completions_v1 where order_id = o.id;
  if s.id is null or s.completed_at is null then raise exception 'separation_not_completed'; end if;
  if coalesce((s.metadata->>'stock_applied')::boolean, false) is not true then
    raise exception 'separation_stock_not_applied';
  end if;
  if exists (
    select 1 from public.order_separation_items_v1
     where order_id = o.id and state = 'pending'
  ) then raise exception 'separation_has_pending_items'; end if;

  -- The fiscal authorization requirement is temporarily disabled. The shared gate
  -- still blocks dispatch when the external physical-stock launch is required.
  gate := public.check_order_dispatch_fiscal_gate_v1(o.id);
  if coalesce((gate->>'allowed')::boolean, false) is not true then
    raise exception '%', coalesce(gate->>'reason', 'dispatch_not_allowed');
  end if;

  v_key := coalesce(
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    'dispatch-v4:' || o.id::text
  );
  update public.order_fiscal_controls
     set dispatch_started_at = coalesce(dispatch_started_at, v_now),
         dispatch_started_by = coalesce(
           dispatch_started_by,
           left(nullif(trim(coalesce(p_operator_label, '')), ''), 80)
         ),
         dispatch_idempotency_key = coalesce(dispatch_idempotency_key, v_key),
         delivery_status = 'out_for_delivery',
         updated_at = v_now
   where order_id = o.id;

  update public.orders set status = 'out_for_delivery', updated_at = v_now where id = o.id;

  begin
    perform public.ops_record_event_v1(
      'order', 'order.out_for_delivery', 'Pedido saiu para entrega.', 'human',
      'order', o.id::text, o.id::text, null,
      left(nullif(trim(coalesce(p_operator_label, '')), ''), 80),
      'dona_antonia', 'info',
      jsonb_build_object(
        'flow', 'orders_v4',
        'dispatch_fiscal_status', gate->>'dispatch_fiscal_status',
        'bling_invoice_id', gate->>'bling_invoice_id',
        'fiscal_invoice_sending', 'not_attempted'
      ),
      null, 'order-dispatch-v4:' || o.id::text, now()
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true, 'order_id', o.id, 'status', 'out_for_delivery',
    'dispatch_started_at', v_now, 'already_started', false, 'gate', gate,
    'fiscal_invoice_sending', 'not_attempted'
  );
end;
$function$;
