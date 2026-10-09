-- Execute ONLY against a disposable PostgreSQL test container.
\set ON_ERROR_STOP on
-- Production uses Bling stock authority; CI must exercise this branch
-- of the real reservation function rather than the legacy-shadow fallback.
do $check$
begin
 if (select metadata->>'ops2_stock_authority'
     from public.bling_hub_runtime_v2 where id=1)<>'bling'
 then raise exception 'stock_authority_not_bling'; end if;
end $check$;

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
     and public_code ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$' and public_code=(select order_number from public.orders where id='00000000-0000-4000-8000-000000000002') and snapshot='{}'::jsonb)
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
 if v_row.public_code !~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
 then raise exception 'weekly_identity_lost'; end if;
end $check$;

-- An UPSERT refresh cannot change identity or consume a sequence number.
do $check$
declare v_before bigint;v_after bigint;v_code text;
begin
  select last_seq into v_before from public.order_public_weekly_counters_v1 where week_start=((now() at time zone 'America/Cuiaba')::date-(extract(isodow from (now() at time zone 'America/Cuiaba')::date)::int-1));
  select public_code into v_code from public.order_public_snapshots_v1
    where order_id='00000000-0000-4000-8000-000000000002';
  insert into public.order_public_snapshots_v1(order_id,snapshot)
  values('00000000-0000-4000-8000-000000000002','{"version":4}'::jsonb)
  on conflict(order_id) do update set snapshot=excluded.snapshot;
  select last_seq into v_after from public.order_public_weekly_counters_v1 where week_start=((now() at time zone 'America/Cuiaba')::date-(extract(isodow from (now() at time zone 'America/Cuiaba')::date)::int-1));
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

-- The date label changes daily while its sequence continues through Sunday.
do $weekly$
declare sunday text; monday text; tuesday text;
begin
  sunday:=public.ops2_next_order_public_code_weekly_v1('2026-10-11 23:59:00-04'::timestamptz);
  monday:=public.ops2_next_order_public_code_weekly_v1('2026-10-12 00:01:00-04'::timestamptz);
  tuesday:=public.ops2_next_order_public_code_weekly_v1('2026-10-13 12:00:00-04'::timestamptz);
  if sunday<>'11|10|2026 - 001' or monday<>'12|10|2026 - 001' or tuesday<>'13|10|2026 - 002'
  then raise exception 'weekly_rollover_failed % % %',sunday,monday,tuesday; end if;
  if public.ops2_next_order_public_code_weekly_v1('2026-10-14 03:00:00+00'::timestamptz)<>'13|10|2026 - 003'
  then raise exception 'cuiaba_midnight_boundary_failed'; end if;
end $weekly$;

do $immutable$
begin
  begin
    update public.orders set order_number='15|10|2026 - 999'
    where id='00000000-0000-4000-8000-000000000002';
    raise exception 'order_number_was_mutated';
  exception when others then
    if SQLERRM<>'order_public_identity_immutable' then raise; end if;
  end;
end $immutable$;

do $import$
declare v_id uuid:='00000000-0000-4000-8000-000000000009';
begin
  insert into public.orders(id,source) values(v_id,'bling_import');
  if (select order_number from public.orders where id=v_id) is not null
    or exists(select 1 from public.order_public_snapshots_v1 where order_id=v_id)
  then raise exception 'import_wrongly_allocated_customer_number'; end if;
end $import$;

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
 if coalesce((select (receipt->>'stock_reserved')::boolean from checkout_first),false) is not true
 then raise exception 'production_wrapper_did_not_reserve_stock'; end if;
 if coalesce((select (receipt->>'registration_complete')::boolean from checkout_retry),false) is not true
 then raise exception 'replay_lost_registration_complete'; end if;

 if (select receipt->>'order_id' from checkout_first) <>
    (select receipt->>'order_id' from checkout_retry)
 then raise exception 'retry_created_another_order'; end if;
 if (select coalesce((receipt->>'replayed')::boolean,false) from checkout_retry) <> true
 then raise exception 'retry_not_marked'; end if;
 if (select count(*) from public.order_checkout_attempts_v1
     where request_id='00000000-0000-4000-8000-000000000003')<>1
 then raise exception 'checkout_attempt_not_unique'; end if;
 if not exists(select 1 from public.order_public_snapshots_v1
     where order_id=v_order and public_code ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
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
-- The REAL reservation function creates one reservation row, not an
-- immediate physical-stock decrement. A checkout replay must not reserve twice.
do $check$
declare v_reserved numeric; v_physical numeric;
begin
  select coalesce(sum(quantity),0) into v_reserved
    from public.vitrine_stock_reservations where status='reserved';
  if v_reserved<>1 then
    raise exception 'replay_reserved_stock_twice: %',v_reserved; end if;
  select stock into v_physical from public.products
    where id='00000000-0000-4000-8000-0000000000aa';
  if v_physical<>10 then raise exception 'reserved_order_changed_physical_stock'; end if;
end $check$;

-- Failure after the real reserve function inserts its row must roll back the
-- order, reservation, public identity and idempotency mapping atomically.
do $check$
declare v_before_orders bigint;
        v_before_snapshots bigint;
        v_before_reserved numeric;
        v_after_reserved numeric;
begin
  select count(*) into v_before_orders from public.orders;
  select count(*) into v_before_snapshots from public.order_public_snapshots_v1;
  select coalesce(sum(quantity),0) into v_before_reserved
    from public.vitrine_stock_reservations where status='reserved';
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
  select coalesce(sum(quantity),0) into v_after_reserved
    from public.vitrine_stock_reservations where status='reserved';
  if v_after_reserved<>v_before_reserved then
    raise exception 'rollback_left_stock_reservation'; end if;
  if (select count(*) from public.orders)<>v_before_orders
  then raise exception 'rollback_left_orphan_order'; end if;
  if (select count(*) from public.order_public_snapshots_v1)<>v_before_snapshots
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
 if (select coalesce(sum(quantity),0) from public.vitrine_stock_reservations
      where status='reserved')<>1
 then raise exception 'insufficient_stock_left_reservation'; end if;
end $check$;

-- Wait RPC observes the persisted result and respects payload mismatch.
do $check$
declare v_wait jsonb;
begin
  v_wait:=public.ops2_wait_vitrine_checkout_attempt_v1(
    '00000000-0000-4000-8000-000000000003',
    '{"items":[{"sku":"X","qty":1}]}'::jsonb
  );
  if v_wait->>'found'<>'true' or
     v_wait->'result'->>'order_id' is null or
     v_wait->'result'->>'replayed'<>'true'
  then raise exception 'wait_lookup_failed'; end if;
  v_wait:=public.ops2_wait_vitrine_checkout_attempt_v1(
    '00000000-0000-4000-8000-000000000003',
    '{"items":[{"sku":"Y","qty":1}]}'::jsonb
  );
  if v_wait->>'error'<>'checkout_request_changed'
  then raise exception 'wait_lookup_mismatch_not_blocked'; end if;
end $check$;

-- Verify actual role permissions, not only grants in migration source.
do $check$
begin
 if has_function_privilege('anon',
   'public.ops2_create_vitrine_checkout_once_v1(uuid,jsonb,text,text,jsonb,jsonb,jsonb)','EXECUTE')
 then raise exception 'anonymous_checkout_rpc_access'; end if;
 if has_function_privilege('anon',
   'public.ops2_wait_vitrine_checkout_attempt_v1(uuid,jsonb)','EXECUTE')
 then raise exception 'anonymous_wait_rpc_access'; end if;
 if has_function_privilege('authenticated',
   'public.ops2_lookup_vitrine_checkout_attempt_v1(uuid,jsonb)','EXECUTE')
 then raise exception 'authenticated_checkout_lookup_access'; end if;
 if not has_function_privilege('service_role',
   'public.ops2_create_vitrine_checkout_once_v1(uuid,jsonb,text,text,jsonb,jsonb,jsonb)','EXECUTE')
 then raise exception 'service_role_checkout_execute_missing'; end if;
end $check$;

-- No external message is sent: this uses the actual claim function and
-- synthetic outbox rows to prove a checkout replay cannot claim an already
-- accepted/sent utility template again.
insert into public.ops2_whatsapp_outbox_v1(order_id,recipient_kind,status,delivery_mode)
select (receipt->>'order_id')::uuid,'customer','pending','utility_template'
from checkout_first;

create temporary table outbox_claim_first as
select public.ops2_claim_checkout_order_whatsapp_v1(
 (select (receipt->>'order_id')::uuid from checkout_first)
) as claim;
do $outbox$
begin
 if (select claim->>'found' from outbox_claim_first)<>'true' then
   raise exception 'outbox_first_claim_missing';
 end if;
 if not exists(select 1 from public.ops2_whatsapp_outbox_v1
  where order_id=(select (receipt->>'order_id')::uuid from checkout_first)
  and status='sending' and attempt_count=1) then
   raise exception 'outbox_first_claim_state_invalid';
 end if;
end $outbox$;

create temporary table outbox_claim_while_sending as
select public.ops2_claim_checkout_order_whatsapp_v1(
 (select (receipt->>'order_id')::uuid from checkout_first)
) as claim;
do $outbox$
begin
 if (select claim->>'found' from outbox_claim_while_sending)<>'false'
 then raise exception 'outbox_claimed_while_sending_twice'; end if;
end $outbox$;

update public.ops2_whatsapp_outbox_v1 set status='sent',locked_at=null
where order_id=(select (receipt->>'order_id')::uuid from checkout_first);
create temporary table outbox_claim_after_sent as
select public.ops2_claim_checkout_order_whatsapp_v1(
 (select (receipt->>'order_id')::uuid from checkout_first)
) as claim;
do $outbox$
begin
 if (select claim->>'found' from outbox_claim_after_sent)<>'false'
 then raise exception 'outbox_resent_successful_message'; end if;
 if exists(select 1 from public.ops2_whatsapp_outbox_v1
  where order_id=(select (receipt->>'order_id')::uuid from checkout_first)
  and attempt_count<>1) then
   raise exception 'outbox_incremented_sent_message_attempt_count';
 end if;
end $outbox$;

-- The runtime-off mode must not claim any message.
insert into public.ops2_whatsapp_outbox_v1(order_id,recipient_kind,status,delivery_mode)
select (receipt->>'order_id')::uuid,'customer','pending','utility_template'
from checkout_first;
update public.ops2_whatsapp_order_runtime_v1 set mode='off' where id=1;
do $outbox$
declare v_claim jsonb;
begin
 v_claim:=public.ops2_claim_checkout_order_whatsapp_v1(
   (select (receipt->>'order_id')::uuid from checkout_first));
 if v_claim->>'reason'<>'runtime_off' then
   raise exception 'outbox_runtime_off_did_not_suppress';
 end if;
end $outbox$;
update public.ops2_whatsapp_order_runtime_v1 set mode='live' where id=1;
do $outbox$
declare v_claim jsonb;
begin
 v_claim:=public.ops2_claim_checkout_order_whatsapp_v1(
   (select (receipt->>'order_id')::uuid from checkout_first));
 if v_claim->>'found'<>'true' then
   raise exception 'outbox_runtime_resume_not_claimed';
 end if;
end $outbox$;

do $roles$
begin
  if has_function_privilege('anon','public.ops2_next_order_public_code_weekly_v1(timestamptz)','EXECUTE')
  then raise exception 'anonymous_weekly_allocator_exposed'; end if;
  if has_function_privilege('authenticated','public.ops2_next_order_public_code_weekly_v1(timestamptz)','EXECUTE')
  then raise exception 'authenticated_weekly_allocator_exposed'; end if;
  if not has_function_privilege('service_role','public.ops2_next_order_public_code_weekly_v1(timestamptz)','EXECUTE')
  then raise exception 'service_role_weekly_allocator_missing'; end if;
end $roles$;

select 'PASS postgres identity, stock rollback, immutability, idempotency and outbox claim' as result;
