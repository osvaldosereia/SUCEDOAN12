create or replace function public.ops_sync_delivery_payment_fiscal_v1(p_settlement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  s public.order_payment_settlements%rowtype;
  v_method text;
  v_method_count integer:=0;
  v_readiness jsonb;
begin
  select * into s
  from public.order_payment_settlements
  where id=p_settlement_id;

  if not found then
    return jsonb_build_object('ok',false,'error','settlement_not_found','external_side_effect',false);
  end if;

  if s.source<>'delivery' or s.status not in ('captured','synced','needs_review') then
    return jsonb_build_object('ok',true,'synced',false,'reason','settlement_not_eligible','external_side_effect',false);
  end if;

  if s.expected_total_cents is null
     or s.captured_total_cents is null
     or s.expected_total_cents<>s.captured_total_cents then
    insert into public.order_fiscal_controls(order_id,payment_status,payment_source,updated_at)
    values(s.order_id,'review_required','delivery_settlement',now())
    on conflict(order_id) do update
      set payment_status='review_required',
          payment_source='delivery_settlement',
          updated_at=now();

    v_readiness:=public.refresh_order_fiscal_readiness_v1(s.order_id);
    return jsonb_build_object(
      'ok',true,'synced',true,'payment_status','review_required',
      'reason','settlement_total_mismatch','readiness',v_readiness,
      'external_side_effect',false
    );
  end if;

  select count(distinct method),
         case when count(distinct method)=1 then max(method) else 'split' end
    into v_method_count,v_method
  from public.order_payment_parts
  where settlement_id=s.id;

  if coalesce(v_method_count,0)=0 then
    insert into public.order_fiscal_controls(order_id,payment_status,payment_source,updated_at)
    values(s.order_id,'review_required','delivery_settlement',now())
    on conflict(order_id) do update
      set payment_status='review_required',
          payment_source='delivery_settlement',
          updated_at=now();

    v_readiness:=public.refresh_order_fiscal_readiness_v1(s.order_id);
    return jsonb_build_object(
      'ok',true,'synced',true,'payment_status','review_required',
      'reason','payment_parts_missing','readiness',v_readiness,
      'external_side_effect',false
    );
  end if;

  insert into public.order_fiscal_controls(
    order_id,payment_status,payment_method,payment_source,
    settled_amount,payment_confirmed_at,updated_at
  )
  values(
    s.order_id,'confirmed',v_method,'delivery_settlement',
    s.captured_total_cents::numeric/100,
    coalesce(s.captured_at,now()),now()
  )
  on conflict(order_id) do update
    set payment_status='confirmed',
        payment_method=excluded.payment_method,
        payment_source='delivery_settlement',
        settled_amount=excluded.settled_amount,
        payment_confirmed_at=coalesce(public.order_fiscal_controls.payment_confirmed_at,excluded.payment_confirmed_at),
        updated_at=now();

  v_readiness:=public.refresh_order_fiscal_readiness_v1(s.order_id);

  return jsonb_build_object(
    'ok',true,'synced',true,'payment_status','confirmed',
    'payment_method',v_method,
    'settled_amount_cents',s.captured_total_cents,
    'readiness',v_readiness,
    'external_side_effect',false
  );
end;
$function$;

create or replace function public.ops_sync_delivery_payment_fiscal_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.source='delivery'
     and new.status in ('captured','synced','needs_review')
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.captured_total_cents is distinct from new.captured_total_cents
     ) then
    perform public.ops_sync_delivery_payment_fiscal_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_ops_sync_delivery_payment_fiscal_v1 on public.order_payment_settlements;
create trigger trg_ops_sync_delivery_payment_fiscal_v1
after insert or update of status,captured_total_cents
on public.order_payment_settlements
for each row
execute function public.ops_sync_delivery_payment_fiscal_trigger_v1();

revoke all on function public.ops_sync_delivery_payment_fiscal_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops_sync_delivery_payment_fiscal_trigger_v1() from public,anon,authenticated;
grant execute on function public.ops_sync_delivery_payment_fiscal_v1(uuid) to service_role;

