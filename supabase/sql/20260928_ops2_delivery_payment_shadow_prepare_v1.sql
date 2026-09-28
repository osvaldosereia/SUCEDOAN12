create or replace function public.ops_record_delivery_payment_v1(
  p_order_id uuid,
  p_parts jsonb,
  p_operator_label text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
