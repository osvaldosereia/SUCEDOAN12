-- Execute ONLY against a disposable PostgreSQL test container.
\set ON_ERROR_STOP on
-- Existing historical code survives the migrations.
do $check$
begin
  if (select public_code from public.order_public_snapshots_v1
      where order_id='00000000-0000-4000-8000-000000000001') <> 'AA001'
  then raise exception 'legacy_identity_changed'; end if;
  if (select count(*) from public.order_public_snapshots_v1 where public_code='AA001') <> 1
  then raise exception 'legacy_identity_missing'; end if;
end $check$;

-- Creation gives the immutable identity before products are inserted.
begin;
insert into public.orders(id) values('00000000-0000-4000-8000-000000000002');
do $check$
begin
  if not exists(select 1 from public.order_public_snapshots_v1
   where order_id='00000000-0000-4000-8000-000000000002'
     and public_code ~ '^[0-9]{4}$' and snapshot='{}'::jsonb)
  then raise exception 'identity_not_assigned_at_creation'; end if;
end $check$;
insert into public.order_items(order_id)
values('00000000-0000-4000-8000-000000000002');
commit;
-- Deferred product trigger must populate the early empty snapshot.
do $check$
declare v_row public.order_public_snapshots_v1%rowtype;
begin
 select * into v_row from public.order_public_snapshots_v1
 where order_id='00000000-0000-4000-8000-000000000002';
 if (v_row.snapshot->>'item_count')::int <> 1
 then raise exception 'deferred_items_snapshot_was_not_filled'; end if;
 if v_row.public_code !~ '^[0-9]{4}$'
 then raise exception 'numeric_identity_lost'; end if;
end $check$;

-- An UPSERT refresh cannot change identity or consume a sequence number.
do $check$
declare v_before bigint;v_after bigint;v_code text;
begin
  select last_value into v_before from public.order_public_code_4d_seq_v1;
  select public_code into v_code from public.order_public_snapshots_v1
    where order_id='00000000-0000-4000-8000-000000000002';
  insert into public.order_public_snapshots_v1(order_id,snapshot)
  values('00000000-0000-4000-8000-000000000002','{"version":4}'::jsonb)
  on conflict(order_id) do update set snapshot=excluded.snapshot;
  select last_value into v_after from public.order_public_code_4d_seq_v1;
  if v_before<>v_after then raise exception 'upsert_consumed_sequence'; end if;
  if (select public_code from public.order_public_snapshots_v1
      where order_id='00000000-0000-4000-8000-000000000002')<>v_code
  then raise exception 'upsert_changed_order_code'; end if;
end $check$;
do $check$
begin
 begin
  update public.order_public_snapshots_v1 set public_code='9000'
  where order_id='00000000-0000-4000-8000-000000000002';
  raise exception 'immutability_guard_missing';
 exception when others then
  if sqlerrm <> 'order_public_identity_immutable' then raise; end if;
 end;
end $check$;

-- A successful checkout is one order and the retry returns the same order.
create temporary table checkout_first as select public.ops2_create_vitrine_checkout_once_v1(
  '00000000-0000-4000-8000-000000000003',
  '{"items":[{"sku":"X","qty":1}]}'::jsonb,
  '+5565999999999','PIX','[]'::jsonb,'{}'::jsonb,'{}'::jsonb
) as receipt;
create temporary table checkout_retry as select public.ops2_create_vitrine_checkout_once_v1(
  '00000000-0000-4000-8000-000000000003',
  '{"items":[{"sku":"X","qty":1}]}'::jsonb,
  '+5565999999999','PIX','[]'::jsonb,'{}'::jsonb,'{}'::jsonb
) as receipt;

do $check$
declare v_order uuid;
begin
 select nullif(receipt->>'order_id','')::uuid into v_order from checkout_first;
 if v_order is null then raise exception 'checkout_id_missing'; end if;
 if (select receipt->>'order_id' from checkout_first) <>
    (select receipt->>'order_id' from checkout_retry)
 then raise exception 'retry_created_another_order'; end if;
 if (select coalesce((receipt->>'replayed')::boolean,false) from checkout_retry) <> true
 then raise exception 'retry_not_marked'; end if;
 if (select count(*) from public.order_checkout_attempts_v1
     where request_id='00000000-0000-4000-8000-000000000003')<>1
 then raise exception 'checkout_attempt_not_unique'; end if;
 if not exists(select 1 from public.order_public_snapshots_v1
     where order_id=v_order and public_code ~ '^[0-9]{4}$'
       and (snapshot->>'item_count')::integer = 1)
 then raise exception 'checkout_snapshot_incomplete'; end if;
end $check$;

-- Same UUID with different payload is rejected, not reused.
do $check$
begin
 begin
   perform public.ops2_create_vitrine_checkout_once_v1(
    '00000000-0000-4000-8000-000000000003',
    '{"items":[{"sku":"Y","qty":1}]}'::jsonb,
    '+5565999999999','PIX','[]'::jsonb,'{}'::jsonb,'{}'::jsonb);
   raise exception 'changed_request_accepted';
 exception when sqlstate '22023' then
   if sqlerrm <> 'checkout_request_changed' then raise; end if;
 end;
end $check$;

do $check$
declare v_lookup jsonb;
begin
 v_lookup:=public.ops2_lookup_vitrine_checkout_attempt_v1(
  '00000000-0000-4000-8000-000000000003',
  '{"items":[{"sku":"X","qty":1}]}'::jsonb);
 if (v_lookup->>'found')::boolean<>true or
    (v_lookup->'result'->>'replayed')::boolean<>true
 then raise exception 'lookup_did_not_replay'; end if;
 if has_table_privilege('anon','public.order_checkout_attempts_v1','SELECT')
 then raise exception 'anonymous_checkout_attempt_access'; end if;
end $check$;
-- The first checkout reserved ONE unit; a replay must not take another.
do $check$
declare v_available integer;
begin
  select available into v_available from public._test_stock_reservation_v1 where sku='X';
  if v_available<>9 then raise exception 'replay_reserved_stock_twice: %',v_available; end if;
end $check$;

-- A hard failure after decrementing stock and inserting the order must roll
-- back the order, stock update, new public snapshot and idempotency mapping.
do $check$
declare
 v_order_count bigint;
 v_snap_count bigint;
 v_available integer;
begin
  select count(*) into v_order_count from public.orders;
  select count(*) into v_snap_count from public.order_public_snapshots_v1;
  begin
    perform public.ops2_create_vitrine_checkout_once_v1(
      '00000000-0000-4000-8000-000000000005',
      '{"items":[{"sku":"X","qty":2}]}'::jsonb,
      '+5565999999999','TEST_ERROR',
      '[{"sku":"X","qty":2}]'::jsonb,'{}'::jsonb,'{}'::jsonb);
    raise exception 'forced_failure_not_raised';
  exception when others then
    if sqlerrm <> 'simulated_reservation_or_order_failure' then raise; end if;
  end;
  select available into v_available from public._test_stock_reservation_v1 where sku='X';
  if v_available<>9 then raise exception 'rollback_failed_stock_retained'; end if;
  if (select count(*) from public.orders)<>v_order_count
  then raise exception 'rollback_left_orphan_order'; end if;
  if (select count(*) from public.order_public_snapshots_v1)<>v_snap_count
  then raise exception 'rollback_left_orphan_snapshot'; end if;
  if exists(select 1 from public.order_checkout_attempts_v1
            where request_id='00000000-0000-4000-8000-000000000005')
  then raise exception 'rollback_left_checkout_attempt'; end if;
end $check$;

-- Stock insufficient must not leave an order or attempt.
do $check$
declare v_order_count bigint;
begin
 select count(*) into v_order_count from public.orders;
 begin
   perform public.ops2_create_vitrine_checkout_once_v1(
      '00000000-0000-4000-8000-000000000006',
      '{"items":[{"sku":"X","qty":50}]}'::jsonb,
      '+5565999999999','PIX',
      '[{"sku":"X","qty":50}]'::jsonb,'{}'::jsonb,'{}'::jsonb);
   raise exception 'out_of_stock_accepted';
 exception when others then
   if sqlerrm <> 'insufficient_stock' then raise; end if;
 end;
 if (select count(*) from public.orders)<>v_order_count
 then raise exception 'failed_checkout_created_order'; end if;
 if exists(select 1 from public.order_checkout_attempts_v1
           where request_id='00000000-0000-4000-8000-000000000006')
 then raise exception 'failed_checkout_created_attempt'; end if;
end $check$;

-- Verify actual role permissions, not only grants in migration source.
do $check$
begin
 if has_function_privilege('anon',
   'public.ops2_create_vitrine_checkout_once_v1(uuid,jsonb,text,text,jsonb,jsonb,jsonb)','EXECUTE')
 then raise exception 'anonymous_checkout_rpc_access'; end if;
 if has_function_privilege('authenticated',
   'public.ops2_lookup_vitrine_checkout_attempt_v1(uuid,jsonb)','EXECUTE')
 then raise exception 'authenticated_checkout_lookup_access'; end if;
 if not has_function_privilege('service_role',
   'public.ops2_create_vitrine_checkout_once_v1(uuid,jsonb,text,text,jsonb,jsonb,jsonb)','EXECUTE')
 then raise exception 'service_role_checkout_execute_missing'; end if;
end $check$;

select 'PASS postgres identity, stock rollback, immutability, replay and access checks' as result;
