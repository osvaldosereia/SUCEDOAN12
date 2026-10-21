-- Sets the future repurchase cadence to D+28; existing customer rows are not backfilled here.
begin;

alter table public.marketing_repurchase_state_v1 alter column send_channel_e164 drop not null;

-- Replenishment uses the fixed 28-day interval requested for this journey.
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
  v_interval_days integer := 28;
  v_channel public.whatsapp_accounts%rowtype;
  v_product_categories jsonb := '[]'::jsonb;
  v_template_name text := 'recompradonaantonia28dias';
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

  select o.id,o.order_number,o.confirmed_at,o.whatsapp_account_id,o.basket_id,o.basket_name_snapshot
    into v_order
  from public.orders o
  where o.customer_id = p_customer_id
    and o.confirmed_at is not null
    and coalesce(o.status,'') <> 'cancelled'
    and coalesce(o.status,'') <> 'returned'
    and o.cancelled_at is null
    and o.returned_at is null
  order by o.confirmed_at desc, o.updated_at desc, o.id desc
  limit 1;

  if v_order.id is not null and v_order.whatsapp_account_id is not null then
    select a.id,a.slug,a.phone_e164,a.is_active
      into v_channel
    from public.whatsapp_accounts a
    where a.id=v_order.whatsapp_account_id;
  end if;

  if v_order.id is not null then
    select coalesce(jsonb_agg(category order by category),'[]'::jsonb)
      into v_product_categories
    from (
      select distinct nullif(btrim(coalesce(p.category,oi.metadata->>'category','')),'') as category
      from public.order_items oi
      left join public.products p on p.id=oi.product_id
      where oi.order_id=v_order.id
    ) categories
    where category is not null;
  end if;

  if v_channel.is_active is true
    and v_channel.slug in ('dona-antonia-0975','dona-antonia-1018')
    and v_channel.phone_e164 is not null
    and right(regexp_replace(v_channel.phone_e164,'\D','','g'),4)=right(v_channel.slug,4) then
    v_template_name := 'recompradonaantonia28dias'||right(v_channel.slug,4)||'v1';
  end if;

  if v_order.id is not null then
    v_due := v_order.confirmed_at + interval '28 days';
  end if;

  if v_order.id is null then
    v_status := 'no_purchase';
    v_reason := 'no_confirmed_purchase';
    v_due := null;
  elsif coalesce(v_customer.marketing_opt_in,false) is not true then
    v_status := 'blocked_opt_out';
    v_reason := 'marketing_opt_out';
    v_due := v_order.confirmed_at + interval '28 days';
  elsif nullif(btrim(coalesce(v_customer.primary_whatsapp_e164,'')),'') is null then
    v_status := 'not_eligible';
    v_reason := 'phone_missing';
    v_due := v_order.confirmed_at + interval '28 days';
  elsif v_channel.is_active is distinct from true
    or v_channel.slug not in ('dona-antonia-0975','dona-antonia-1018')
    or v_channel.phone_e164 is null
    or right(regexp_replace(coalesce(v_channel.phone_e164,''),'\D','','g'),4)<>right(v_channel.slug,4) then
    v_status := 'not_eligible';
    v_reason := 'send_channel_missing';
    v_due := v_order.confirmed_at + make_interval(days=>v_interval_days);
  elsif v_existing.last_sent_order_id is not null and v_existing.last_sent_order_id = v_order.id then
    v_status := 'sent';
    v_reason := null;
    v_due := v_order.confirmed_at + interval '28 days';
  else
    if v_due <= now() - interval '24 hours' then
      v_status := 'not_eligible';
      v_reason := 'due_window_expired';
    else
      v_status := case when v_due <= now() then 'ready' else 'scheduled' end;
      v_reason := null;
    end if;
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
    v_channel.phone_e164,v_template_name,v_existing.last_sent_at,v_existing.last_sent_order_id,
    v_reason,
    jsonb_build_object(
      'purchase_source','canonical_orders',
      'purchase_channels',jsonb_build_array('0975','1018'),
      'delay_days',v_interval_days,
      'last_basket_id',v_order.basket_id,
      'last_basket_name',v_order.basket_name_snapshot,
      'last_product_categories',v_product_categories,
      'send_account_slug',v_channel.slug,
      'cadence_source','fixed_28_days'
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
    'send_channel_e164',v_channel.phone_e164,
    'template_name',v_template_name
  );
end
$$;

revoke all on function public.marketing_repurchase_recalc_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_repurchase_recalc_v1(uuid) to service_role;

-- Recompute only the customer attached to a future order event. This deliberately
-- does not scan or rewrite the existing customer queue during migration.
create or replace function public.marketing_repurchase_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='UPDATE' and old.customer_id is distinct from new.customer_id
     and old.customer_id is not null then
    perform public.marketing_repurchase_recalc_v1(old.customer_id);
  end if;
  if new.customer_id is not null then
    perform public.marketing_repurchase_recalc_v1(new.customer_id);
  end if;
  return new;
exception when others then
  raise warning 'marketing_repurchase_order_recalc_failed (sqlstate=%)', sqlstate;
  return new;
end
$$;

revoke all on function public.marketing_repurchase_order_trigger_v1()
  from public, anon, authenticated;
grant execute on function public.marketing_repurchase_order_trigger_v1() to service_role;

drop trigger if exists marketing_repurchase_order_after_write_v1 on public.orders;
create trigger marketing_repurchase_order_after_write_v1
after insert or update of customer_id, confirmed_at, cancelled_at, returned_at, status
on public.orders
for each row execute function public.marketing_repurchase_order_trigger_v1();

commit;
