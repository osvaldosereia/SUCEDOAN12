begin;

-- Replenishment is a monthly journey. Use the customer's purchase cadence when
-- there is enough clean history, with a conservative 30-day default.
create or replace function public.marketing_repurchase_recalc_v1(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer record;
  v_order record;
  v_existing public.marketing_repurchase_state_v1%rowtype;
  v_due timestamptz;
  v_status text;
  v_reason text;
  v_interval_days integer := 30;
  v_interval_count integer := 0;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_required');
  end if;

  select id, primary_whatsapp_e164, coalesce(marketing_opt_in,false) as marketing_opt_in
    into v_customer
  from public.customers
  where id = p_customer_id;

  if not found then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  select * into v_existing
  from public.marketing_repurchase_state_v1
  where customer_id = p_customer_id;

  select o.id,o.order_number,o.confirmed_at
    into v_order
  from public.orders o
  where o.customer_id = p_customer_id
    and o.confirmed_at is not null
    and coalesce(o.status,'') <> 'cancelled'
    and o.cancelled_at is null
  order by o.confirmed_at desc, o.updated_at desc, o.id desc
  limit 1;

  -- Estimate the median gap across up to the last four confirmed orders.
  -- Ignore implausibly short/long gaps; clamp learned cadence to 21–45 days.
  select
    coalesce(greatest(21,least(45,round(percentile_cont(0.5) within group(order by interval_days))::integer)),30),
    count(*)::integer
    into v_interval_days,v_interval_count
  from (
    select extract(epoch from (previous_at-confirmed_at))/86400.0 as interval_days
    from (
      select confirmed_at,lag(confirmed_at) over(order by confirmed_at desc) as previous_at
      from (
        select o.confirmed_at
        from public.orders o
        where o.customer_id=p_customer_id
          and o.confirmed_at is not null
          and coalesce(o.status,'') <> 'cancelled'
          and o.cancelled_at is null
        order by o.confirmed_at desc,o.updated_at desc,o.id desc
        limit 4
      ) recent
    ) ordered
    where previous_at is not null
  ) intervals
  where interval_days between 14 and 60;

  if not found then
    v_interval_days := 30;
    v_interval_count := 0;
  end if;

  if v_order.id is null then
    v_status := 'no_purchase';
    v_reason := 'no_confirmed_purchase';
    v_due := null;
  elsif coalesce(v_customer.marketing_opt_in,false) is not true then
    v_status := 'blocked_opt_out';
    v_reason := 'marketing_opt_out';
    v_due := v_order.confirmed_at + make_interval(days=>v_interval_days);
  elsif nullif(btrim(coalesce(v_customer.primary_whatsapp_e164,'')),'') is null then
    v_status := 'not_eligible';
    v_reason := 'phone_missing';
    v_due := v_order.confirmed_at + make_interval(days=>v_interval_days);
  elsif v_existing.last_sent_order_id is not null and v_existing.last_sent_order_id = v_order.id then
    v_status := 'sent';
    v_reason := null;
    v_due := v_order.confirmed_at + make_interval(days=>v_interval_days);
  else
    v_due := v_order.confirmed_at + make_interval(days=>v_interval_days);
    v_status := case when v_due <= now() then 'ready' else 'scheduled' end;
    v_reason := null;
  end if;

  insert into public.marketing_repurchase_state_v1(
    customer_id,last_purchase_order_id,last_purchase_order_number,last_purchase_at,due_at,status,
    marketing_opt_in,phone_e164,send_channel_e164,template_name,last_sent_at,last_sent_order_id,
    blocked_reason,metadata,updated_at
  ) values (
    p_customer_id,
    case when v_order.id is null then null else v_order.id end,
    case when v_order.order_number is null then null else v_order.order_number end,
    case when v_order.confirmed_at is null then null else v_order.confirmed_at end,
    v_due,v_status,coalesce(v_customer.marketing_opt_in,false),v_customer.primary_whatsapp_e164,
    '+5565998150975','recompradonaantonia30dias',v_existing.last_sent_at,v_existing.last_sent_order_id,
    v_reason,
    jsonb_build_object(
      'purchase_source','canonical_orders',
      'purchase_channels',jsonb_build_array('0975','1018'),
      'delay_days',v_interval_days,
      'cadence_source',case when v_interval_count=0 then 'monthly_default' else 'purchase_history' end,
      'observed_intervals',v_interval_count
    ),
    now()
  )
  on conflict (customer_id) do update set
    last_purchase_order_id=excluded.last_purchase_order_id,
    last_purchase_order_number=excluded.last_purchase_order_number,
    last_purchase_at=excluded.last_purchase_at,
    due_at=excluded.due_at,
    status=excluded.status,
    marketing_opt_in=excluded.marketing_opt_in,
    phone_e164=excluded.phone_e164,
    send_channel_e164=excluded.send_channel_e164,
    template_name=excluded.template_name,
    blocked_reason=excluded.blocked_reason,
    metadata=excluded.metadata,
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'status',v_status,
    'last_purchase_order_id',case when v_order.id is null then null else v_order.id end,
    'last_purchase_at',case when v_order.confirmed_at is null then null else v_order.confirmed_at end,
    'due_at',v_due,
    'delay_days',v_interval_days,
    'send_channel_e164','+5565998150975',
    'template_name','recompradonaantonia30dias'
  );
end
$$;

revoke all on function public.marketing_repurchase_recalc_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_repurchase_recalc_v1(uuid) to service_role;

-- Refresh only the internal queue metadata and due dates; this does not send.
do $$
declare
  v_customer_id uuid;
begin
  for v_customer_id in
    select customer_id from public.marketing_repurchase_state_v1
  loop
    perform public.marketing_repurchase_recalc_v1(v_customer_id);
  end loop;
end
$$;

commit;
