begin;

create or replace function public.validate_driver_collection_bundle_v1(
  p_collection jsonb,
  p_expected_due_cents bigint
) returns jsonb
language plpgsql
immutable
security invoker
set search_path=public,pg_temp
as $$
declare
  payments jsonb;
  item jsonb;
  normalized jsonb:='[]'::jsonb;
  raw_method text;
  ledger_method text;
  payment_kind text;
  amount_text text;
  tender_text text;
  amount_cents bigint;
  tender_cents bigint;
  change_cents bigint;
  total_cents bigint:=0;
  total_change_cents bigint:=0;
  idx integer:=0;
  cash_count integer:=0;
  observed_count integer:=0;
  operational_count integer:=0;
  reference_text text;
  brand_text text;
  notes_text text;
begin
  if p_expected_due_cents is null or p_expected_due_cents<=0 then
    return jsonb_build_object('ok',false,'error','invalid_expected_due');
  end if;
  if p_collection is null or jsonb_typeof(p_collection)<>'object' then
    return jsonb_build_object('ok',false,'error','invalid_collection_payload');
  end if;

  if p_collection ? 'payments' then
    if jsonb_typeof(p_collection->'payments')<>'array' then
      return jsonb_build_object('ok',false,'error','payments_must_be_array');
    end if;
    payments:=p_collection->'payments';
  elsif p_collection ? 'payment_method' then
    payments:=jsonb_build_array(p_collection);
  else
    return jsonb_build_object('ok',false,'error','payments_required');
  end if;

  if jsonb_array_length(payments)<1 or jsonb_array_length(payments)>8 then
    return jsonb_build_object('ok',false,'error','invalid_payment_count','max_payments',8);
  end if;

  for item in select value from jsonb_array_elements(payments)
  loop
    idx:=idx+1;
    if jsonb_typeof(item)<>'object' then
      return jsonb_build_object('ok',false,'error','invalid_payment_item','payment_index',idx);
    end if;
    if item ?| array['pan','card_number','cardNumber','full_card_number','cvv','cvc','security_code'] then
      return jsonb_build_object('ok',false,'error','sensitive_card_data_forbidden','payment_index',idx);
    end if;

    raw_method:=lower(trim(coalesce(item->>'payment_method',item->>'method','')));
    ledger_method:=null;
    payment_kind:=null;

    case raw_method
      when 'cash' then ledger_method:='cash'; payment_kind:='cash';
      when 'pix' then ledger_method:='pix'; payment_kind:='pix';
      when 'card' then ledger_method:='card'; payment_kind:='credit_card';
      when 'credit_card' then ledger_method:='card'; payment_kind:='credit_card';
      when 'food_card' then ledger_method:='card'; payment_kind:='food_meal_card';
      when 'meal_card' then ledger_method:='card'; payment_kind:='food_meal_card';
      when 'food_meal_card' then ledger_method:='card'; payment_kind:='food_meal_card';
      when 'payment_link' then ledger_method:='payment_link'; payment_kind:='payment_link';
      when 'other' then ledger_method:='other'; payment_kind:='other';
      else
        return jsonb_build_object('ok',false,'error','invalid_driver_collection_method','payment_index',idx,'received_method',raw_method);
    end case;

    amount_text:=trim(coalesce(item->>'amount_cents',''));
    if amount_text !~ '^[0-9]{1,18}$' then
      return jsonb_build_object('ok',false,'error','invalid_collection_amount','payment_index',idx);
    end if;
    begin
      amount_cents:=amount_text::bigint;
    exception when numeric_value_out_of_range then
      return jsonb_build_object('ok',false,'error','invalid_collection_amount','payment_index',idx);
    end;
    if amount_cents<=0 then
      return jsonb_build_object('ok',false,'error','invalid_collection_amount','payment_index',idx);
    end if;

    tender_text:=trim(coalesce(item->>'tender_amount_cents',''));
    tender_cents:=null;
    change_cents:=0;

    if ledger_method='cash' then
      cash_count:=cash_count+1;
      if tender_text='' then
        tender_cents:=amount_cents;
      elsif tender_text ~ '^[0-9]{1,18}$' then
        begin
          tender_cents:=tender_text::bigint;
        exception when numeric_value_out_of_range then
          return jsonb_build_object('ok',false,'error','invalid_cash_tender_amount','payment_index',idx);
        end;
      else
        return jsonb_build_object('ok',false,'error','invalid_cash_tender_amount','payment_index',idx);
      end if;
      if tender_cents<amount_cents then
        return jsonb_build_object('ok',false,'error','cash_tender_below_component','payment_index',idx,'amount_cents',amount_cents,'tender_amount_cents',tender_cents);
      end if;
      change_cents:=tender_cents-amount_cents;
      operational_count:=operational_count+1;
    else
      if tender_text<>'' then
        return jsonb_build_object('ok',false,'error','tender_amount_only_for_cash','payment_index',idx);
      end if;
      observed_count:=observed_count+1;
    end if;

    reference_text:=left(regexp_replace(trim(coalesce(item->>'reference','')),'[[:cntrl:]]','','g'),120);
    brand_text:=left(regexp_replace(trim(coalesce(item->>'brand','')),'[[:cntrl:]]','','g'),60);
    notes_text:=left(regexp_replace(trim(coalesce(item->>'notes','')),'[[:cntrl:]]','','g'),240);

    total_cents:=total_cents+amount_cents;
    total_change_cents:=total_change_cents+change_cents;

    normalized:=normalized || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'payment_index',idx,
        'input_method',raw_method,
        'payment_method',ledger_method,
        'payment_kind',payment_kind,
        'amount_cents',amount_cents,
        'tender_amount_cents',case when ledger_method='cash' then tender_cents else null end,
        'change_cents',change_cents,
        'recognition_status',case when ledger_method='cash' then 'operational_confirmed' else 'observed' end,
        'reference',nullif(reference_text,''),
        'brand',nullif(brand_text,''),
        'notes',nullif(notes_text,'')
      ))
    );
  end loop;

  if total_cents<>p_expected_due_cents then
    return jsonb_build_object(
      'ok',false,
      'error','collection_bundle_amount_mismatch',
      'expected_cents',p_expected_due_cents,
      'received_cents',total_cents,
      'difference_cents',p_expected_due_cents-total_cents
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'payments',normalized,
    'payment_count',jsonb_array_length(normalized),
    'split_payment',jsonb_array_length(normalized)>1,
    'total_cents',total_cents,
    'cash_payment_count',cash_count,
    'total_change_cents',total_change_cents,
    'observed_payment_count',observed_count,
    'operational_payment_count',operational_count,
    'requires_reconciliation',true,
    'fiscal_mutated',false,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.validate_driver_collection_bundle_v1(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.validate_driver_collection_bundle_v1(jsonb,bigint) to service_role;

create or replace function public.driver_deliver_stop_v4(
  p_auth_user_id uuid,
  p_stop_id uuid,
  p_client_event_id text,
  p_proof jsonb default '{}'::jsonb,
  p_collection jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  lcfg public.logistics_runtime_config%rowtype;
  fcfg public.financial_runtime_config%rowtype;
  d public.drivers%rowtype;
  s public.delivery_stops%rowtype;
  r public.delivery_routes%rowtype;
  j public.delivery_jobs%rowtype;
  existing uuid;
  existing_stop uuid;
  remaining integer;
  fiscal_result jsonb;
  financial jsonb:=jsonb_build_object('enabled',false);
  bundle jsonb:='{}'::jsonb;
  payment_item jsonb;
  receipt jsonb;
  receipts jsonb:='[]'::jsonb;
  ledger_entry_ids jsonb:='[]'::jsonb;
  collection_present boolean:=false;
  expected_due bigint:=0;
  expected_method text:=null;
  receipt_error text:=null;
  payment_index integer:=0;
  bundle_methods text[]:=array[]::text[];
  method_changed boolean:=false;
  any_observed boolean:=false;
begin
  select * into lcfg from public.logistics_runtime_config where id=1;
  if not found or not lcfg.enabled or not lcfg.driver_app_enabled or lcfg.execution_mode not in ('homologation','canary','live') then
    return jsonb_build_object('ok',false,'error','driver_runtime_disabled','side_effect_performed',false,'external_side_effect',false);
  end if;

  if p_collection is not null and jsonb_typeof(p_collection)<>'object' then
    return jsonb_build_object('ok',false,'error','invalid_collection_payload','side_effect_performed',false,'external_side_effect',false);
  end if;
  collection_present:=p_collection is not null and p_collection<>'{}'::jsonb;

  select id,stop_id into existing,existing_stop
  from public.delivery_events
  where client_event_id=p_client_event_id;
  if found then
    if existing_stop is distinct from p_stop_id then
      return jsonb_build_object('ok',false,'error','client_event_id_conflict','event_id',existing,'side_effect_performed',false,'external_side_effect',false);
    end if;
    return jsonb_build_object('ok',true,'replay',true,'event_id',existing,'stop_id',existing_stop,'side_effect_performed',false,'external_side_effect',false);
  end if;

  select * into d from public.drivers where auth_user_id=p_auth_user_id and status='on_route';
  if not found then return jsonb_build_object('ok',false,'error','driver_not_on_route','side_effect_performed',false,'external_side_effect',false); end if;

  select * into s from public.delivery_stops where id=p_stop_id for update;
  if not found then return jsonb_build_object('ok',false,'error','stop_not_found','side_effect_performed',false,'external_side_effect',false); end if;

  select * into r from public.delivery_routes where id=s.route_id for update;
  if r.status<>'active' or r.driver_id is distinct from d.id then
    return jsonb_build_object('ok',false,'error','stop_not_owned_by_driver','side_effect_performed',false,'external_side_effect',false);
  end if;
  if s.status='delivered' then
    return jsonb_build_object('ok',true,'replay',true,'stop_id',s.id,'side_effect_performed',false,'external_side_effect',false);
  end if;
  if s.status<>'arrived' then
    return jsonb_build_object('ok',false,'error','arrival_confirmation_required','stop_status',s.status,'side_effect_performed',false,'external_side_effect',false);
  end if;

  select * into j from public.delivery_jobs where id=s.delivery_job_id for update;
  select * into fcfg from public.financial_runtime_config where id=1;

  if fcfg.driver_delivery_financial_guard_enabled then
    if not fcfg.enabled or not fcfg.driver_financial_context_enabled or fcfg.execution_mode not in ('homologation','canary','live') then
      return jsonb_build_object('ok',false,'error','driver_financial_guard_misconfigured','side_effect_performed',false,'external_side_effect',false);
    end if;

    financial:=public.preview_driver_order_collection_v1(j.order_id,r.id);
    if not coalesce((financial->>'ok')::boolean,false) then return financial; end if;
    if financial->>'decision'='review_required' then
      return jsonb_build_object('ok',false,'error','financial_review_required','financial',financial,'side_effect_performed',false,'external_side_effect',false);
    end if;

    if financial->>'decision'='covered' then
      if collection_present then
        return jsonb_build_object('ok',false,'error','collection_not_expected_for_covered_order','financial',financial,'side_effect_performed',false,'external_side_effect',false);
      end if;
    elsif financial->>'decision'='collect' then
      if not collection_present then
        return jsonb_build_object('ok',false,'error','collection_required_before_delivery','financial',financial,'side_effect_performed',false,'external_side_effect',false);
      end if;
      if not fcfg.driver_collection_recording_enabled or not fcfg.receipt_recording_enabled then
        return jsonb_build_object('ok',false,'error','driver_collection_recording_disabled','financial',financial,'side_effect_performed',false,'external_side_effect',false);
      end if;

      expected_due:=coalesce(nullif(financial->>'remaining_due_cents','')::bigint,0);
      expected_method:=nullif(financial->>'expected_method','');
      bundle:=public.validate_driver_collection_bundle_v1(p_collection,expected_due);
      if not coalesce((bundle->>'ok')::boolean,false) then
        return bundle || jsonb_build_object('side_effect_performed',false,'external_side_effect',false);
      end if;

      select coalesce(array_agg(distinct value->>'payment_method'),'{}'::text[])
      into bundle_methods
      from jsonb_array_elements(bundle->'payments');

      method_changed:=
        coalesce((bundle->>'payment_count')::integer,0)<>1
        or expected_method is null
        or not (expected_method=any(bundle_methods));

      -- All receipt writes live inside one PL/pgSQL subtransaction.
      -- If any component fails, RAISE triggers rollback of every prior component.
      begin
        for payment_item in select value from jsonb_array_elements(bundle->'payments')
        loop
          payment_index:=coalesce((payment_item->>'payment_index')::integer,0);
          receipt:=public.record_payment_receipt_v1(
            j.order_id,
            payment_item->>'payment_method',
            (payment_item->>'amount_cents')::bigint,
            'driver_app',
            'driver-collection:'||p_stop_id::text||':'||p_client_event_id||':'||payment_index::text,
            payment_item->>'recognition_status',
            r.id,
            d.id,
            nullif(payment_item->>'reference',''),
            now(),
            jsonb_strip_nulls(jsonb_build_object(
              'stop_id',s.id,
              'delivery_job_id',j.id,
              'payment_index',payment_index,
              'payment_count',(bundle->>'payment_count')::integer,
              'split_payment',(bundle->>'split_payment')::boolean,
              'payment_kind',payment_item->>'payment_kind',
              'input_method',payment_item->>'input_method',
              'brand',nullif(payment_item->>'brand',''),
              'notes',nullif(payment_item->>'notes',''),
              'tender_amount_cents',nullif(payment_item->>'tender_amount_cents','')::bigint,
              'change_given_cents',coalesce(nullif(payment_item->>'change_cents','')::bigint,0),
              'expected_method',expected_method,
              'method_changed',method_changed,
              'driver_collection',true,
              'sensitive_card_data_stored',false
            ))
          );
          if not coalesce((receipt->>'ok')::boolean,false) then
            raise exception using message='receipt_component_failed:'||coalesce(receipt->>'error','unknown');
          end if;
          receipts:=receipts || jsonb_build_array(
            payment_item || jsonb_build_object(
              'entry_id',nullif(receipt->>'entry_id',''),
              'replay',coalesce((receipt->>'replay')::boolean,false)
            )
          );
          ledger_entry_ids:=ledger_entry_ids || jsonb_build_array(nullif(receipt->>'entry_id',''));
          any_observed:=any_observed or payment_item->>'recognition_status'='observed';
        end loop;
      exception when others then
        receipt_error:=sqlerrm;
        return jsonb_build_object(
          'ok',false,
          'error','collection_bundle_recording_failed',
          'detail',receipt_error,
          'financial',financial,
          'bundle',bundle,
          'side_effect_performed',false,
          'external_side_effect',false
        );
      end;
    end if;
  elsif collection_present then
    return jsonb_build_object('ok',false,'error','financial_guard_required_for_collection','side_effect_performed',false,'external_side_effect',false);
  end if;

  update public.delivery_stops
    set status='delivered',locked=false,delivered_at=coalesce(delivered_at,now()),updated_at=now()
    where id=s.id;
  update public.delivery_jobs
    set status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
    where id=j.id;
  update public.orders
    set status='delivered',delivered_at=coalesce(delivered_at,now()),external_status_updated_at=now(),updated_at=now()
    where id=j.order_id and status in ('ready','out_for_delivery');

  insert into public.delivery_events(
    delivery_job_id,route_id,stop_id,event_type,actor_type,actor_id,client_event_id,payload
  )
  values(
    j.id,s.route_id,s.id,'STOP_DELIVERED','driver',d.id,p_client_event_id,
    jsonb_build_object(
      'proof',coalesce(p_proof,'{}'::jsonb),
      'financial_guard_enabled',fcfg.driver_delivery_financial_guard_enabled,
      'collection_recorded',jsonb_array_length(receipts)>0,
      'collection_payment_count',jsonb_array_length(receipts),
      'collection_split_payment',jsonb_array_length(receipts)>1,
      'collection_total_cents',coalesce(nullif(bundle->>'total_cents','')::bigint,0),
      'collection_change_cents',coalesce(nullif(bundle->>'total_change_cents','')::bigint,0),
      'ledger_entry_ids',ledger_entry_ids,
      'collection_has_observed_payment',any_observed,
      'fiscal_payment_confirmed_by_driver',false
    )
  ) returning id into existing;

  insert into public.order_fiscal_controls(order_id,delivery_status,delivery_confirmed_at,delivery_event_id)
  values(j.order_id,'delivered',now(),existing)
  on conflict(order_id) do update
    set delivery_status='delivered',
        delivery_confirmed_at=coalesce(public.order_fiscal_controls.delivery_confirmed_at,excluded.delivery_confirmed_at),
        delivery_event_id=excluded.delivery_event_id,
        updated_at=now();

  fiscal_result:=public.refresh_order_fiscal_readiness_v1(j.order_id);

  select count(*) into remaining
  from public.delivery_stops
  where route_id=r.id and status not in ('delivered','skipped','rescheduled');

  if remaining=0 then
    update public.delivery_routes
      set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
      where id=r.id;
    update public.drivers set status='available',updated_at=now() where id=d.id;
    insert into public.delivery_events(route_id,event_type,actor_type,actor_id,payload)
    values(
      r.id,'ROUTE_FINISHED','driver',d.id,
      jsonb_build_object('financial_reconciliation_pending',true)
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'replay',false,
    'stop_id',s.id,
    'delivery_job_id',j.id,
    'order_id',j.order_id,
    'route_completed',remaining=0,
    'event_id',existing,
    'financial',financial,
    'collection_bundle',bundle,
    'receipts',receipts,
    'fiscal',fiscal_result,
    'fiscal_payment_confirmed_by_driver',false,
    'reconciliation_required',jsonb_array_length(receipts)>0,
    'side_effect_performed',true,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.driver_deliver_stop_v4(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.driver_deliver_stop_v4(uuid,uuid,text,jsonb,jsonb) to service_role;

comment on function public.validate_driver_collection_bundle_v1(jsonb,bigint) is
'Validates up to 8 delivery payment components, exact sum, cash change, and forbids sensitive card fields. Read-only.';
comment on function public.driver_deliver_stop_v4(uuid,uuid,text,jsonb,jsonb) is
'Atomic split-tender driver delivery. Writes append-only ledger receipts only; never confirms fiscal payment and never calls an external provider.';

commit;
