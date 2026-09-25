-- Dona Antonia Operations 2.0
-- Actual payment capture at delivery.
-- This records what was really received; Bling sync stays explicitly pending
-- until fiscal/financial homologation is green.

create table if not exists public.order_payment_settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz not null default now(),
  status text not null default 'captured'
    check (status in ('captured','synced','needs_review','void')),
  expected_total_cents bigint not null check (expected_total_cents>=0),
  captured_total_cents bigint not null check (captured_total_cents>=0),
  planned_method text,
  operator_label text,
  source text not null default 'delivery',
  bling_sync_state text not null default 'blocked_homologation'
    check (bling_sync_state in ('blocked_homologation','pending','synced','failed','not_required')),
  bling_sync_ref text,
  bling_sync_error text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists order_payment_settlements_sync_idx
  on public.order_payment_settlements(bling_sync_state,captured_at)
  where status in ('captured','needs_review');

alter table public.order_payment_settlements enable row level security;

create table if not exists public.order_payment_parts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.order_payment_settlements(id) on delete cascade,
  sequence integer not null check (sequence between 1 and 8),
  method text not null
    check (method in ('pix','cash','credit_card','food_card','meal_card','other')),
  amount_cents bigint not null check (amount_cents>0),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(settlement_id,sequence)
);

create index if not exists order_payment_parts_settlement_idx
  on public.order_payment_parts(settlement_id,sequence);

alter table public.order_payment_parts enable row level security;

create or replace function public.ops_record_delivery_payment_v1(
  p_order_id uuid,
  p_parts jsonb,
  p_operator_label text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_payment_settlements%rowtype;
  v_existing_parts jsonb;
  v_normalized jsonb:='[]'::jsonb;
  v_item jsonb;
  v_method text;
  v_amount bigint;
  v_total bigint:=0;
  v_expected bigint;
  v_seq integer:=0;
  v_settlement_id uuid;
  v_key text;
begin
  if p_order_id is null then raise exception 'invalid_order'; end if;
  if jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts)<1 or jsonb_array_length(p_parts)>8 then
    raise exception 'invalid_payment_parts';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('out_for_delivery','delivered') then
    raise exception 'order_not_in_delivery';
  end if;

  v_expected:=round(coalesce(v_order.total,0)*100)::bigint;
  if v_expected<=0 then raise exception 'invalid_order_total'; end if;

  for v_item in select value from jsonb_array_elements(p_parts) loop
    v_seq:=v_seq+1;
    v_method:=lower(trim(coalesce(v_item->>'method','')));
    begin
      v_amount:=(v_item->>'amount_cents')::bigint;
    exception when others then
      raise exception 'invalid_payment_amount';
    end;

    if v_method not in ('pix','cash','credit_card','food_card','meal_card','other') then
      raise exception 'invalid_payment_method';
    end if;
    if v_amount is null or v_amount<=0 then raise exception 'invalid_payment_amount'; end if;

    v_total:=v_total+v_amount;
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object(
      'sequence',v_seq,
      'method',v_method,
      'amount_cents',v_amount
    ));
  end loop;

  if v_total<>v_expected then
    raise exception 'payment_total_mismatch';
  end if;

  select * into v_existing
  from public.order_payment_settlements
  where order_id=p_order_id;

  if found then
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'sequence',sequence,
        'method',method,
        'amount_cents',amount_cents
      ) order by sequence),
      '[]'::jsonb
    )
    into v_existing_parts
    from public.order_payment_parts
    where settlement_id=v_existing.id;

    if v_existing.status in ('captured','synced','needs_review')
       and v_existing.captured_total_cents=v_total
       and v_existing_parts=v_normalized then
      return jsonb_build_object(
        'settlement_id',v_existing.id,
        'order_id',p_order_id,
        'expected_total_cents',v_expected,
        'captured_total_cents',v_total,
        'parts',v_existing_parts,
        'status',v_existing.status,
        'bling_sync_state',v_existing.bling_sync_state,
        'already_captured',true
      );
    end if;

    raise exception 'payment_already_captured';
  end if;

  v_key:=coalesce(
    nullif(trim(coalesce(p_idempotency_key,'')),''),
    'delivery-payment:'||p_order_id::text
  );

  insert into public.order_payment_settlements(
    order_id,status,expected_total_cents,captured_total_cents,planned_method,
    operator_label,source,bling_sync_state,idempotency_key,metadata
  ) values (
    p_order_id,'captured',v_expected,v_total,v_order.payment_method,
    left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'delivery','blocked_homologation',v_key,
    jsonb_build_object(
      'captured_order_status',v_order.status,
      'fiscal_runtime_dependency','pending_homologation'
    )
  )
  returning id into v_settlement_id;

  for v_item in select value from jsonb_array_elements(v_normalized) loop
    insert into public.order_payment_parts(
      settlement_id,sequence,method,amount_cents,detail
    ) values (
      v_settlement_id,
      (v_item->>'sequence')::integer,
      v_item->>'method',
      (v_item->>'amount_cents')::bigint,
      '{}'::jsonb
    );
  end loop;

  perform public.ops_record_event_v1(
    'finance','payment.delivery_captured',
    'Pagamento efetivo da entrega registrado.',
    'human','order',p_order_id::text,p_order_id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia','info',
    jsonb_build_object(
      'settlement_id',v_settlement_id,
      'planned_method',v_order.payment_method,
      'expected_total_cents',v_expected,
      'captured_total_cents',v_total,
      'parts',v_normalized,
      'bling_sync_state','blocked_homologation'
    ),
    null,'payment-delivery:'||v_settlement_id::text,now()
  );

  return jsonb_build_object(
    'settlement_id',v_settlement_id,
    'order_id',p_order_id,
    'expected_total_cents',v_expected,
    'captured_total_cents',v_total,
    'parts',v_normalized,
    'status','captured',
    'bling_sync_state','blocked_homologation',
    'already_captured',false
  );
end;
$$;

revoke all on function public.ops_record_delivery_payment_v1(uuid,jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.ops_record_delivery_payment_v1(uuid,jsonb,text,text)
  to service_role;

create or replace function public.get_ops_control_tower_summary_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'awaiting', (select count(*) from public.orders where status='storefront_received'),
      'confirmed', (select count(*) from public.orders where status='confirmed'),
      'ready', (select count(*) from public.orders where status='ready'),
      'delivered', (select count(*) from public.orders where status='delivered'),
      'cancelled', (select count(*) from public.orders where status='cancelled')
    ),
    'whatsapp', jsonb_build_object(
      'human_required', (select count(*) from public.conversations where channel='whatsapp' and human_required=true),
      'human_mode', (select count(*) from public.conversations where channel='whatsapp' and mode='human')
    ),
    'inventory', jsonb_build_object(
      'active_products', (select count(*) from public.products where is_active=true),
      'zero_or_negative', (select count(*) from public.products where is_active=true and coalesce(stock,0)<=0),
      'expires_90d', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date between current_date and current_date+90),
      'expired', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date<current_date),
      'count_differences_pending', (select count(*) from public.ops_inventory_counts where reconciliation_state='pending_erp_reconciliation'),
      'incidents_open', (select count(*) from public.ops_inventory_incidents where status in ('open','review'))
    ),
    'payments', jsonb_build_object(
      'captured_unsynced', (select count(*) from public.order_payment_settlements where status in ('captured','needs_review') and bling_sync_state in ('blocked_homologation','pending','failed')),
      'sync_failed', (select count(*) from public.order_payment_settlements where status in ('captured','needs_review') and bling_sync_state='failed')
    ),
    'attention', jsonb_build_object(
      'open', (select count(*) from public.ops_attention where status in ('open','acknowledged')),
      'critical', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='critical'),
      'high', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='high')
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from public.ops_approvals where status='pending')
    ),
    'printing', jsonb_build_object(
      'pending', (select count(*) from public.ops_print_jobs where status='pending'),
      'failed', (select count(*) from public.ops_print_jobs where status='failed'),
      'claimed', (select count(*) from public.ops_print_jobs where status='claimed'),
      'presented', (select count(*) from public.ops_print_jobs where status='presented'),
      'printed', (select count(*) from public.ops_print_jobs where status='printed')
    )
  );
$$;
