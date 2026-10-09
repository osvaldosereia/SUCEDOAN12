-- A single checkout attempt must persist at most one order, even when
-- storefront-v2 retries after a timeout. Old orders and order_number are untouched.
create table if not exists public.order_checkout_attempts_v1 (
  request_id uuid primary key,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.order_checkout_attempts_v1 enable row level security;
revoke all on public.order_checkout_attempts_v1 from public, anon, authenticated;
grant select, insert on public.order_checkout_attempts_v1 to service_role;

-- A read-only, service-only probe runs before stock reconciliation: a lost
-- response must not turn a valid replay into "out of stock".
create or replace function public.ops2_lookup_vitrine_checkout_attempt_v1(
  p_request_id uuid, p_request_context jsonb
) returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp as $$
declare
  v_saved public.order_checkout_attempts_v1%rowtype;
  v_hash text := encode(sha256(convert_to(coalesce(p_request_context,'{}'::jsonb)::text,'UTF8')),'hex');
begin
  if p_request_id is null then
    raise exception 'checkout_request_id_required' using errcode='22023';
  end if;
  select * into v_saved
  from public.order_checkout_attempts_v1
  where request_id=p_request_id;
  if not found then return jsonb_build_object('found',false); end if;
  if v_saved.request_hash <> v_hash then
    return jsonb_build_object('found',true,'error','checkout_request_changed');
  end if;
  return jsonb_build_object('found',true,'result',v_saved.result || jsonb_build_object('replayed',true));
end $$;
revoke all on function public.ops2_lookup_vitrine_checkout_attempt_v1(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.ops2_lookup_vitrine_checkout_attempt_v1(uuid,jsonb)
  to service_role;

-- Both the allocation of the order and registration of its attempt happen
-- in ONE database transaction. A duplicate request waits for this transaction
-- and then returns the original result (without reserving stock a second time).
create or replace function public.ops2_create_vitrine_checkout_once_v1(
  p_request_id uuid, p_request_context jsonb,
  p_phone text, p_payment_method text, p_items jsonb,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security invoker
set search_path = public, pg_temp as $$
declare
  v_saved public.order_checkout_attempts_v1%rowtype;
  v_hash text := encode(sha256(convert_to(coalesce(p_request_context,'{}'::jsonb)::text,'UTF8')),'hex');
  v_result jsonb;
  v_order_id uuid;
begin
  if p_request_id is null then
    raise exception 'checkout_request_id_required' using errcode='22023';
  end if;
  -- Unrelated checkouts do not block each other.
  perform pg_advisory_xact_lock(hashtextextended('vitrine-checkout:'||p_request_id::text,0));
  select * into v_saved
  from public.order_checkout_attempts_v1
  where request_id=p_request_id;
  if found then
    if v_saved.request_hash <> v_hash then
      raise exception 'checkout_request_changed' using errcode='22023';
    end if;
    return v_saved.result || jsonb_build_object('replayed',true);
  end if;

  -- v3 includes stock reservation. An error rolls back both writes.
  v_result := public.create_vitrine_cart_order_v3(
    p_phone,p_payment_method,p_items,
    coalesce(p_customer_snapshot,'{}'::jsonb),
    coalesce(p_delivery,'{}'::jsonb)
  );
  v_order_id := nullif(v_result->>'order_id','')::uuid;
  if v_order_id is null then
    raise exception 'checkout_order_id_missing' using errcode='P0001';
  end if;
  -- Persist the already-calculated stock changes for lost-response replays.
  v_result := v_result || jsonb_build_object(
    'stock_adjustment',coalesce((p_customer_snapshot->>'stock_adjusted_retry')::boolean,false),
    'adjusted_items',coalesce(p_customer_snapshot->'stock_adjustments','[]'::jsonb)
  );
  insert into public.order_checkout_attempts_v1(request_id,request_hash,order_id,result)
  values(p_request_id,v_hash,v_order_id,v_result);
  return v_result || jsonb_build_object('replayed',false);
end $$;
revoke all on function public.ops2_create_vitrine_checkout_once_v1(uuid,jsonb,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.ops2_create_vitrine_checkout_once_v1(uuid,jsonb,text,text,jsonb,jsonb,jsonb)
  to service_role;

-- A racing retry can reach the stock pre-check while the original transaction
-- still holds its inventory reservation and before its receipt is visible.
-- Wait for the original attempt's advisory lock to be released, then look up
-- the definitive receipt. This is called only as the fallback for a stock miss.
create or replace function public.ops2_wait_vitrine_checkout_attempt_v1(
  p_request_id uuid, p_request_context jsonb
) returns jsonb language plpgsql volatile security invoker
set search_path = public, pg_temp as $checkout_wait$
begin
  if p_request_id is null then
    raise exception 'checkout_request_id_required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vitrine-checkout:'||p_request_id::text,0));
  return public.ops2_lookup_vitrine_checkout_attempt_v1(p_request_id,p_request_context);
end;
$checkout_wait$;
revoke all on function public.ops2_wait_vitrine_checkout_attempt_v1(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.ops2_wait_vitrine_checkout_attempt_v1(uuid,jsonb)
  to service_role;
