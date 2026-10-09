-- R12: source of REAL current Supabase RPCs, extracted with read-only pg_get_functiondef.
-- OFFLINE TEST ONLY. Never deploy this file or execute on production.
-- ops3_complete_delivery_v1, canonical MD5 d20eb30841dae4ea7b3820e51a6ca7f9
CREATE OR REPLACE FUNCTION public.ops3_complete_delivery_v1(p_order_id uuid, p_method text, p_amount_cents bigint, p_operator_label text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_completion public.order_separation_completions_v1%rowtype;
  v_control public.order_fiscal_controls%rowtype;
  v_existing public.order_payment_settlements%rowtype;
  v_existing_method text;
  v_existing_amount bigint;
  v_expected bigint;
  v_method text:=lower(trim(coalesce(p_method,'')));
  v_key text;
  v_settlement_id uuid;
  v_now timestamptz:=now();
begin
  if p_order_id is null then raise exception 'invalid_order'; end if;
  if v_method not in ('pix','cash','credit_card','food_card','meal_card','other') then raise exception 'invalid_payment_method'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  v_expected:=round(coalesce(v_order.total,0)*100)::bigint;
  if v_expected<=0 then raise exception 'invalid_order_total'; end if;
  if p_amount_cents is null or p_amount_cents<>v_expected then raise exception 'payment_total_mismatch'; end if;

  select * into v_completion from public.order_separation_completions_v1 where order_id=p_order_id;
  select * into v_control from public.order_fiscal_controls where order_id=p_order_id;

  if v_order.status<>'delivered' then
    if v_order.status<>'out_for_delivery' then raise exception 'order_not_out_for_delivery'; end if;
    if v_completion.id is null or v_completion.completed_at is null then raise exception 'separation_not_completed'; end if;
    if v_control.order_id is null or v_control.dispatch_fiscal_status not in ('authorized','not_required') then raise exception 'fiscal_authorization_required_before_delivery'; end if;
    if v_control.dispatch_started_at is null then raise exception 'dispatch_not_started'; end if;
  end if;

  select * into v_existing from public.order_payment_settlements where order_id=p_order_id;
  if found then
    select method,amount_cents into v_existing_method,v_existing_amount
      from public.order_payment_parts where settlement_id=v_existing.id order by sequence limit 1;
    if v_existing.status not in ('captured','synced','needs_review')
       or v_existing.expected_total_cents<>v_expected
       or v_existing.captured_total_cents<>v_expected
       or v_existing_method is distinct from v_method
       or v_existing_amount is distinct from v_expected
       or (select count(*) from public.order_payment_parts where settlement_id=v_existing.id)<>1 then
      raise exception 'payment_already_captured';
    end if;
    v_settlement_id:=v_existing.id;
  else
    if v_order.status='delivered' then raise exception 'delivered_order_without_settlement'; end if;
    v_key:=coalesce(nullif(trim(coalesce(p_idempotency_key,'')),''),'delivery-v4:'||p_order_id::text);
    insert into public.order_payment_settlements(
      order_id,status,expected_total_cents,captured_total_cents,planned_method,
      operator_label,source,bling_sync_state,idempotency_key,metadata,captured_at
    ) values(
      p_order_id,'captured',v_expected,v_expected,v_order.payment_method,
      left(nullif(trim(coalesce(p_operator_label,'')),''),80),'delivery','blocked_homologation',v_key,
      jsonb_build_object('captured_order_status',v_order.status,'flow','orders_v4'),v_now
    ) returning id into v_settlement_id;
    insert into public.order_payment_parts(settlement_id,sequence,method,amount_cents,detail)
    values(v_settlement_id,1,v_method,v_expected,'{}'::jsonb);
  end if;

  if v_order.status<>'delivered' then
    update public.orders set status='delivered',delivered_at=coalesce(delivered_at,v_now),updated_at=v_now where id=p_order_id;
    update public.order_fiscal_controls
       set delivery_status='delivered',delivery_confirmed_at=coalesce(delivery_confirmed_at,v_now),updated_at=v_now
     where order_id=p_order_id;
  end if;

  perform public.ops2_refresh_order_public_snapshot_v1(p_order_id);
  begin
    perform public.ops_record_event_v1(
      'order','order.delivered','Entrega e pagamento confirmados.','human','order',p_order_id::text,p_order_id::text,
      null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),'dona_antonia','info',
      jsonb_build_object('settlement_id',v_settlement_id,'payment_method',v_method,'amount_cents',v_expected,'flow','orders_v4'),
      null,'order-delivered-v4:'||p_order_id::text,now()
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok',true,'order_id',p_order_id,'status','delivered','delivered_at',coalesce(v_order.delivered_at,v_now),
    'settlement_id',v_settlement_id,'payment_method',v_method,'amount_cents',v_expected,
    'already_delivered',v_order.status='delivered'
  );
end;
$function$
;

-- ops_enforce_delivery_payment_before_delivered_v1, canonical MD5 3ba3d64d21fea4c947fbea0a14b054e5
CREATE OR REPLACE FUNCTION public.ops_enforce_delivery_payment_before_delivered_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_expected bigint;
  v_valid integer:=0;
  v_return_open integer:=0;
begin
  if new.status='delivered' and old.status is distinct from 'delivered' then
    v_expected:=round(coalesce(new.total,0)*100)::bigint;
    select count(*) into v_return_open from public.order_delivery_return_cases where order_id=new.id and status in ('returning','returned_review');
    if v_return_open>0 then raise exception 'delivery_return_open'; end if;
    select count(*) into v_valid
    from public.order_payment_settlements s
    where s.order_id=new.id
      and s.source='delivery'
      and s.status in ('captured','synced','needs_review')
      and s.expected_total_cents=v_expected
      and s.captured_total_cents=v_expected
      and exists(
        select 1 from public.order_payment_parts p
        where p.settlement_id=s.id
        group by p.settlement_id
        having sum(p.amount_cents)=v_expected
      );
    if v_valid<>1 then raise exception 'delivery_payment_required_before_delivered'; end if;
  end if;
  return new;
end;
$function$
;

-- ops_record_delivery_payment_v1, canonical MD5 52fe4b49e3f2b9ee1045c31f517c02bb
CREATE OR REPLACE FUNCTION public.ops_record_delivery_payment_v1(p_order_id uuid, p_parts jsonb, p_operator_label text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_shadow jsonb;
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
      begin
        v_shadow:=public.ops_prepare_delivery_payment_bling_shadow_v1(v_existing.id);
      exception when others then
        v_shadow:=jsonb_build_object('ok',false,'shadow_only',true,'external_write',false,'error','shadow_prepare_failed','detail',sqlerrm);
      end;
      return jsonb_build_object(
        'settlement_id',v_existing.id,
        'order_id',p_order_id,
        'expected_total_cents',v_expected,
        'captured_total_cents',v_total,
        'parts',v_existing_parts,
        'status',v_existing.status,
        'bling_sync_state',v_existing.bling_sync_state,
        'already_captured',true,
        'bling_shadow',v_shadow
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

  begin
    v_shadow:=public.ops_prepare_delivery_payment_bling_shadow_v1(v_settlement_id);
  exception when others then
    v_shadow:=jsonb_build_object('ok',false,'shadow_only',true,'external_write',false,'error','shadow_prepare_failed','detail',sqlerrm);
  end;

  return jsonb_build_object(
    'settlement_id',v_settlement_id,
    'order_id',p_order_id,
    'expected_total_cents',v_expected,
    'captured_total_cents',v_total,
    'parts',v_normalized,
    'status','captured',
    'bling_sync_state','blocked_homologation',
    'already_captured',false,
    'bling_shadow',v_shadow
  );
end;
$function$
;

-- ops_register_failed_delivery_v1, canonical MD5 9c1eecc7262b0efcf131ddb6e2f72b82
CREATE OR REPLACE FUNCTION public.ops_register_failed_delivery_v1(p_order_id uuid, p_reason_code text, p_note text DEFAULT NULL::text, p_operator_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_code text:=lower(trim(coalesce(p_reason_code,'')));
  v_label text;
  v_recommended text;
  v_attempt integer;
  v_case_id uuid;
  v_existing uuid;
  v_payment_count integer;
begin
  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status<>'out_for_delivery' then raise exception 'order_not_in_delivery'; end if;

  select count(*) into v_payment_count
  from public.order_payment_settlements
  where order_id=p_order_id and status in ('captured','synced','needs_review');

  if v_payment_count>0 then
    raise exception 'payment_already_captured';
  end if;

  select id into v_existing
  from public.order_delivery_return_cases
  where order_id=p_order_id
    and status in ('returning','returned_review')
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'case_id',v_existing,
      'order_id',p_order_id,
      'already_open',true
    );
  end if;

  v_label:=case v_code
    when 'customer_absent' then 'Cliente ausente'
    when 'address_not_found' then 'Endereço não encontrado'
    when 'reschedule' then 'Cliente pediu reagendamento'
    when 'payment_failed' then 'Problema no pagamento'
    when 'customer_refused' then 'Cliente recusou/desistiu'
    when 'vehicle_route' then 'Veículo / rota'
    when 'other' then 'Outro'
    else null
  end;

  if v_label is null then raise exception 'invalid_delivery_failure_reason'; end if;

  v_recommended:=case
    when v_code in ('payment_failed','customer_refused','other') then 'review'
    else 'redelivery'
  end;

  select coalesce(max(attempt_number),0)+1 into v_attempt
  from public.order_delivery_return_cases
  where order_id=p_order_id;

  insert into public.order_delivery_return_cases(
    order_id,attempt_number,reason_code,reason_label,note,status,
    recommended_disposition,failed_by,idempotency_key,metadata
  ) values (
    p_order_id,v_attempt,v_code,v_label,
    left(nullif(trim(coalesce(p_note,'')),''),500),
    'returning',v_recommended,
    left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'delivery-return:'||p_order_id::text||':'||v_attempt::text,
    jsonb_build_object(
      'stock_already_consumed',true,
      'return_stock_to_general_automatically',false
    )
  )
  returning id into v_case_id;

  perform public.ops_record_event_v1(
    'delivery','delivery.failed',
    'Entrega não concluída: '||v_label||'.',
    'human','order',p_order_id::text,p_order_id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia','warning',
    jsonb_build_object(
      'case_id',v_case_id,
      'attempt_number',v_attempt,
      'reason_code',v_code,
      'recommended_disposition',v_recommended,
      'stock_stays_consumed',true
    ),
    null,'delivery-failed:'||v_case_id::text,now()
  );

  return jsonb_build_object(
    'case_id',v_case_id,
    'order_id',p_order_id,
    'attempt_number',v_attempt,
    'reason_code',v_code,
    'reason_label',v_label,
    'status','returning',
    'recommended_disposition',v_recommended,
    'already_open',false
  );
end;
$function$
;
