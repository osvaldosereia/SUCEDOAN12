-- function: catalog_customer_admin_context_v1(p_phone_e164 text)
CREATE OR REPLACE FUNCTION whatsapp_ordering_private.catalog_customer_admin_context_v1(p_phone_e164 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_customer public.customers%rowtype;
  v_address_count integer := 0;
  v_default_count integer := 0;
  v_suggested_address_id uuid;
  v_addresses jsonb := '[]'::jsonb;
  v_address_state text;
begin
  v_phone := public.canonical_whatsapp_e164_br_v2(p_phone_e164);
  if v_phone is null then
    return jsonb_build_object(
      'state', 'phone_missing',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_missing'
    );
  end if;

  select c.id into v_primary_customer_id
  from public.customers c
  where c.primary_whatsapp_e164 = v_phone;

  select cp.customer_id into v_linked_customer_id
  from public.customer_phones cp
  where cp.phone_e164 = v_phone;

  if v_primary_customer_id is not null
    and v_linked_customer_id is not null
    and v_primary_customer_id is distinct from v_linked_customer_id then
    return jsonb_build_object(
      'state', 'phone_conflict',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_review'
    );
  end if;

  if coalesce(v_primary_customer_id, v_linked_customer_id) is null then
    return jsonb_build_object(
      'state', 'not_found',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_missing'
    );
  end if;

  select * into v_customer
  from public.customers c
  where c.id = coalesce(v_primary_customer_id, v_linked_customer_id);

  if not found or v_customer.is_active is not true then
    return jsonb_build_object(
      'state', 'inactive',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_review'
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (where a.is_default is true)::integer
  into v_address_count, v_default_count
  from public.customer_addresses a
  where a.customer_id = v_customer.id
    and a.is_active is true;

  if v_default_count = 1 then
    select a.id into v_suggested_address_id
    from public.customer_addresses a
    where a.customer_id = v_customer.id
      and a.is_active is true
      and a.is_default is true
    limit 1;
  elsif v_default_count = 0 and v_address_count = 1 then
    select a.id into v_suggested_address_id
    from public.customer_addresses a
    where a.customer_id = v_customer.id
      and a.is_active is true
    limit 1;
  end if;

  v_address_state := case
    when v_default_count > 1 then 'address_review'
    when v_suggested_address_id is not null then 'address_suggested'
    when v_address_count > 1 then 'address_choice_required'
    else 'address_missing'
  end;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', address_row.id,
      'label', address_row.label,
      'street', address_row.street,
      'number', address_row.number,
      'complement', address_row.complement,
      'neighborhood', address_row.neighborhood,
      'city', address_row.city,
      'state', address_row.state,
      'postal_code', address_row.postal_code,
      'reference', address_row.reference,
      'is_default', address_row.is_default
    ) order by address_row.is_default desc, address_row.id
  ), '[]'::jsonb)
  into v_addresses
  from (
    select a.*
    from public.customer_addresses a
    where a.customer_id = v_customer.id
      and a.is_active is true
    order by a.is_default desc, a.id
    limit 20
  ) address_row;

  return jsonb_build_object(
    'state', 'matched',
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name
    ),
    'addresses', v_addresses,
    'suggested_address_id', v_suggested_address_id,
    'address_state', v_address_state
  );
end;
$function$
;

-- function: catalog_order_intent_confirm_v1(p_intent_id uuid, p_confirmation_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_conversation_id uuid, p_inbound_message_id text, p_reply_to_message_id text, p_confirmation_token_hash text, p_sender_phone_e164 text, p_sender_provider_id text)
CREATE OR REPLACE FUNCTION whatsapp_ordering_private.catalog_order_intent_confirm_v1(p_intent_id uuid, p_confirmation_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_conversation_id uuid, p_inbound_message_id text, p_reply_to_message_id text, p_confirmation_token_hash text, p_sender_phone_e164 text, p_sender_provider_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_event public.whatsapp_webhook_events_v1%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_conversation public.conversations%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_customer_id uuid;
  v_address_id uuid;
  v_phone text;
  v_customer_name text;
  v_address_snapshot jsonb;
  v_delivery_snapshot jsonb;
  v_delivery_address jsonb;
  v_customer_snapshot jsonb;
  v_new_address jsonb;
  v_quote_result jsonb;
  v_quote jsonb;
  v_quote_total_cents bigint;
  v_quote_revision integer;
  v_total_cents bigint := 0;
  v_order_items jsonb := '[]'::jsonb;
  v_cart jsonb;
  v_line jsonb;
  v_item record;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cents bigint;
  v_line_cents bigint;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_order_number text;
  v_now timestamptz := clock_timestamp();
  v_reservation jsonb;
  v_stock_failure boolean := false;
  v_exception_message text;
  v_issue_code text;
  v_summary text;
  v_idempotency_key text;
begin
  if p_intent_id is null or p_confirmation_event_id is null
    or p_whatsapp_account_id is null or p_conversation_id is null
    or nullif(btrim(p_meta_waba_id), '') is null
    or nullif(btrim(p_meta_phone_number_id), '') is null
    or nullif(btrim(p_inbound_message_id), '') is null
    or char_length(p_inbound_message_id) > 256
    or nullif(btrim(p_reply_to_message_id), '') is null
    or char_length(p_reply_to_message_id) > 256
    or coalesce(p_confirmation_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_sender_phone_e164, '') !~ '^[+][1-9][0-9]{7,14}$'
    or char_length(coalesce(p_sender_provider_id, '')) > 256 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_request_invalid');
  end if;

  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = p_intent_id
  for update;
  if not found or v_intent.source_kind <> 'catalog' then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_not_found');
  end if;

  select * into v_event
  from public.whatsapp_webhook_events_v1 e
  where e.id = p_confirmation_event_id
  for share;
  if not found or v_event.provider <> 'meta'
    or v_event.event_type <> 'message.received'
    or v_event.whatsapp_account_id is distinct from p_whatsapp_account_id
    or v_event.provider_event_id is distinct from 'message:' || p_inbound_message_id
    or v_event.provider_message_id is distinct from p_inbound_message_id
    or public.canonical_whatsapp_e164_br_v2(v_event.phone_e164) is distinct from p_sender_phone_e164 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_event_mismatch');
  end if;

  if v_intent.whatsapp_account_id is distinct from p_whatsapp_account_id
    or v_intent.meta_waba_id is distinct from btrim(p_meta_waba_id)
    or v_intent.meta_phone_number_id is distinct from btrim(p_meta_phone_number_id)
    or v_intent.conversation_id is distinct from p_conversation_id
    or public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164) is distinct from p_sender_phone_e164
    or (v_intent.sender_provider_id is not null
      and v_intent.sender_provider_id is distinct from nullif(btrim(p_sender_provider_id), '')) then
    return jsonb_build_object('ok', false, 'error', 'confirmation_sender_scope_mismatch');
  end if;

  select * into v_account
  from public.whatsapp_accounts a
  where a.id = p_whatsapp_account_id and a.is_active
    and a.waba_id = btrim(p_meta_waba_id)
    and a.phone_number_id = btrim(p_meta_phone_number_id)
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'confirmation_account_mismatch');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for share;
  if not found
    or (v_conversation.whatsapp_account_id is distinct from p_whatsapp_account_id
      and v_conversation.channel_account_id is distinct from p_whatsapp_account_id)
    or public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164) is distinct from p_sender_phone_e164 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_conversation_mismatch');
  end if;

  if v_intent.status = 'converted' and v_intent.confirmed_order_id is not null then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, quote_revision, order_id
    ) values (
      p_confirmation_event_id, v_intent.id, 'already_converted', v_intent.quote_revision,
      v_intent.confirmed_order_id
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'already_converted', 'order_id', v_intent.confirmed_order_id,
      'duplicate', true
    );
  end if;

  if v_intent.status <> 'awaiting_confirmation'
    or v_intent.confirmation_token_hash is distinct from p_confirmation_token_hash then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'ignored',
      'stale_or_unavailable_confirmation', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'ignored', 'issue_code', 'stale_or_unavailable_confirmation'
    );
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164);
  if v_phone is null or v_phone is distinct from p_sender_phone_e164 then
    v_issue_code := 'confirmation_phone_unresolved';
  end if;

  v_idempotency_key := 'catalog-order-confirmation-intent:' || v_intent.id::text
    || ':quote:' || v_intent.quote_revision::text;
  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_idempotency_key
  for share;
  if found and v_outbox.status in ('queued', 'claimed') then
    return jsonb_build_object(
      'ok', false, 'retryable', true, 'error', 'confirmation_send_receipt_pending'
    );
  end if;
  v_summary := v_intent.intake_snapshot ->> 'confirmation_summary_text';
  if v_issue_code is null and (
    not found
    or v_outbox.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or v_outbox.conversation_id is distinct from v_intent.conversation_id
    or public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) is distinct from v_phone
    or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.provider <> 'meta'
    or v_outbox.message_type <> 'interactive'
    or v_outbox.status <> 'sent'
    or v_outbox.provider_message_id is distinct from p_reply_to_message_id
    or v_intent.confirmation_message_id is distinct from p_reply_to_message_id
    or v_outbox.metadata ->> 'order_intent_id' is distinct from v_intent.id::text
    or v_outbox.metadata ->> 'source_kind' is distinct from 'catalog'
    or v_outbox.metadata ->> 'quote_revision' is distinct from v_intent.quote_revision::text
    or v_outbox.metadata ->> 'summary_hash' is distinct from v_intent.summary_hash
    or v_outbox.payload #>> '{interactive,body,text}' is distinct from v_summary
    or encode(sha256(convert_to(coalesce(v_summary, ''), 'UTF8')), 'hex') is distinct from v_intent.summary_hash
  ) then
    v_issue_code := 'confirmation_message_not_currently_sent';
  end if;

  if v_issue_code is null then
    v_quote_result := whatsapp_ordering_private.catalog_quote_v1(
      v_intent.whatsapp_account_id, v_intent.catalog_id,
      v_intent.intake_snapshot -> 'items'
    );
    if coalesce((v_quote_result ->> 'ok')::boolean, false) is distinct from true
      or jsonb_typeof(v_quote_result -> 'quote') is distinct from 'object'
      or coalesce(v_quote_result #>> '{quote,total_cents}', '') !~ '^[0-9]{1,12}$'
      or jsonb_typeof(v_quote_result #> '{quote,items}') is distinct from 'array' then
      v_issue_code := case v_quote_result ->> 'issue_code'
        when 'catalog_product_mapping_unresolved' then 'catalog_product_mapping_unresolved'
        when 'catalog_product_price_unavailable' then 'catalog_product_price_unavailable'
        else 'catalog_quote_unavailable'
      end;
    else
      v_quote := v_quote_result -> 'quote';
      v_quote_total_cents := (v_quote ->> 'total_cents')::bigint;
      if v_intent.quote_total_cents is distinct from v_quote_total_cents
        or v_intent.quote_snapshot -> 'items' is distinct from v_quote -> 'items' then
        if v_intent.quote_revision >= 2147483647 then
          v_issue_code := 'confirmation_quote_revision_exhausted';
        else
          v_quote_revision := v_intent.quote_revision + 1;
          update whatsapp_ordering_private.whatsapp_order_intents_v1
          set status = 'reprice_required',
              quote_snapshot = v_quote,
              quote_total_cents = v_quote_total_cents,
              currency = 'BRL',
              quote_revision = v_quote_revision,
              quoted_at = v_now,
              confirmation_token_hash = null,
              summary_hash = null,
              confirmation_message_id = null,
              intake_snapshot = intake_snapshot - 'confirmation_summary_text',
              last_error_code = 'quote_changed_after_customer_confirmation',
              updated_at = v_now
          where id = v_intent.id;
          insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
            webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
          ) values (
            p_confirmation_event_id, v_intent.id, 'reprice_required',
            'quote_changed_after_customer_confirmation', v_quote_revision
          );
          return jsonb_build_object(
            'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
            'status', 'reprice_required', 'quote_revision', v_quote_revision,
            'issue_code', 'quote_changed_after_customer_confirmation'
          );
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null and coalesce(v_intent.payment_method, '')
    not in ('pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card') then
    v_issue_code := 'catalog_confirmation_payment_missing';
  end if;
  v_customer_name := nullif(btrim(v_intent.customer_snapshot ->> 'name'), '');
  if v_issue_code is null and (v_customer_name is null or char_length(v_customer_name) > 180) then
    v_issue_code := 'catalog_confirmation_customer_name_missing';
  end if;

  v_delivery_snapshot := v_intent.delivery_snapshot;
  if v_issue_code is null and nullif(btrim(coalesce(v_delivery_snapshot ->> 'address_id', '')), '') is not null then
    if v_intent.customer_id is null
      or coalesce(v_delivery_snapshot ->> 'address_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_delivery_snapshot -> 'new_address') = 'object' then
      v_issue_code := 'catalog_confirmation_address_invalid';
    else
      v_address_id := (v_delivery_snapshot ->> 'address_id')::uuid;
    end if;
  elsif v_issue_code is null then
    v_new_address := v_delivery_snapshot -> 'new_address';
    if jsonb_typeof(v_new_address) is distinct from 'object'
      or exists (
        select 1 from jsonb_object_keys(v_new_address) as address_key(key_name)
        where key_name not in ('street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal_code', 'reference')
      )
      or jsonb_typeof(v_new_address -> 'street') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'street'), '') is null
      or char_length(v_new_address ->> 'street') > 180
      or jsonb_typeof(v_new_address -> 'number') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'number'), '') is null
      or char_length(v_new_address ->> 'number') > 40
      or (v_new_address ? 'complement' and jsonb_typeof(v_new_address -> 'complement') is distinct from 'string')
      or char_length(coalesce(v_new_address ->> 'complement', '')) > 120
      or jsonb_typeof(v_new_address -> 'neighborhood') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'neighborhood'), '') is null
      or char_length(v_new_address ->> 'neighborhood') > 120
      or jsonb_typeof(v_new_address -> 'city') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'city'), '') is null
      or char_length(v_new_address ->> 'city') > 120
      or jsonb_typeof(v_new_address -> 'state') is distinct from 'string'
      or coalesce(v_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
      or jsonb_typeof(v_new_address -> 'postal_code') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'postal_code'), '') is null
      or char_length(v_new_address ->> 'postal_code') > 16
      or (v_new_address ? 'reference' and jsonb_typeof(v_new_address -> 'reference') is distinct from 'string')
      or char_length(coalesce(v_new_address ->> 'reference', '')) > 180 then
      v_issue_code := 'catalog_confirmation_address_invalid';
    else
      v_new_address := jsonb_strip_nulls(jsonb_build_object(
        'street', btrim(v_new_address ->> 'street'),
        'number', btrim(v_new_address ->> 'number'),
        'complement', nullif(btrim(v_new_address ->> 'complement'), ''),
        'neighborhood', btrim(v_new_address ->> 'neighborhood'),
        'city', btrim(v_new_address ->> 'city'),
        'state', v_new_address ->> 'state',
        'postal_code', btrim(v_new_address ->> 'postal_code'),
        'reference', nullif(btrim(v_new_address ->> 'reference'), '')
      ));
    end if;
  end if;

  if v_issue_code is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('whatsapp-customer:' || v_phone, 0)
    );
    select c.id into v_primary_customer_id
    from public.customers c where c.primary_whatsapp_e164 = v_phone for update;
    select cp.customer_id into v_linked_customer_id
    from public.customer_phones cp where cp.phone_e164 = v_phone for update;
    if v_primary_customer_id is not null and v_linked_customer_id is not null
      and v_primary_customer_id is distinct from v_linked_customer_id then
      v_issue_code := 'catalog_confirmation_customer_conflict';
    else
      v_customer_id := coalesce(v_primary_customer_id, v_linked_customer_id);
      if (v_intent.customer_id is not null and v_intent.customer_id is distinct from v_customer_id)
        or (v_intent.customer_id is not null and v_customer_id is null) then
        v_issue_code := 'catalog_confirmation_customer_conflict';
      elsif v_customer_id is not null then
        select * into v_customer from public.customers c where c.id = v_customer_id for update;
        if not found or v_customer.is_active is not true then
          v_issue_code := 'catalog_confirmation_customer_conflict';
        else
          v_customer_name := coalesce(nullif(btrim(v_customer.name), ''), v_customer_name);
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null and v_address_id is not null then
    if v_customer_id is null then
      v_issue_code := 'catalog_confirmation_customer_conflict';
    else
      select * into v_address
      from public.customer_addresses a
      where a.id = v_address_id and a.customer_id = v_customer_id and a.is_active
      for update;
      if not found then
        v_issue_code := 'catalog_confirmation_address_unavailable';
      else
        v_address_snapshot := jsonb_strip_nulls(jsonb_build_object(
          'address_id', v_address.id,
          'label', v_address.label,
          'street', v_address.street,
          'number', v_address.number,
          'complement', v_address.complement,
          'neighborhood', v_address.neighborhood,
          'city', v_address.city,
          'state', v_address.state,
          'postal_code', v_address.postal_code,
          'reference', v_address.reference
        ));
        if v_address_snapshot is distinct from v_delivery_snapshot -> 'address_snapshot' then
          v_issue_code := 'catalog_confirmation_address_changed';
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null then
    if jsonb_typeof(v_quote -> 'items') is distinct from 'array'
      or jsonb_array_length(v_quote -> 'items') not between 1 and 100 then
      v_issue_code := 'catalog_confirmation_items_invalid';
    else
      for v_item in
        select line.value, line.ordinality
        from jsonb_array_elements(v_quote -> 'items') with ordinality as line(value, ordinality)
        order by line.ordinality
      loop
        v_line := v_item.value;
        if coalesce(v_line ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(v_line ->> 'quantity', '') !~ '^[1-9][0-9]{0,15}$'
          or coalesce(v_line ->> 'unit_price_cents', '') !~ '^[0-9]{1,12}$'
          or coalesce(v_line ->> 'line_total_cents', '') !~ '^[0-9]{1,12}$'
          or nullif(btrim(v_line ->> 'name'), '') is null
          or char_length(v_line ->> 'name') > 180 then
          v_issue_code := 'catalog_confirmation_items_invalid';
          exit;
        end if;
        v_product_id := (v_line ->> 'product_id')::uuid;
        v_quantity := (v_line ->> 'quantity')::numeric;
        v_unit_cents := (v_line ->> 'unit_price_cents')::bigint;
        v_line_cents := (v_line ->> 'line_total_cents')::bigint;
        if v_unit_cents * v_quantity is distinct from v_line_cents
          or v_total_cents + v_line_cents > 999999999999 then
          v_issue_code := 'catalog_confirmation_items_invalid';
          exit;
        end if;
        v_total_cents := v_total_cents + v_line_cents;
        v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
          'product_id', v_product_id,
          'sku', nullif(v_line ->> 'sku', ''),
          'name', regexp_replace(btrim(v_line ->> 'name'), '[[:space:]]+', ' ', 'g'),
          'quantity', v_quantity,
          'unit_price_cents', v_unit_cents,
          'line_total_cents', v_line_cents,
          'retailer_id', v_line ->> 'retailer_id',
          'image_url', coalesce(v_line ->> 'image_url', '')
        ));
      end loop;
      if v_issue_code is null and v_total_cents is distinct from v_quote_total_cents then
        v_issue_code := 'catalog_confirmation_items_invalid';
      end if;
    end if;
  end if;

  if v_issue_code is not null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = v_issue_code,
        confirmation_token_hash = null, summary_hash = null,
        confirmation_message_id = null, updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', v_issue_code, v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'needs_review', 'issue_code', v_issue_code
    );
  end if;

  v_order_number := 'DA-' || to_char(v_now at time zone 'America/Cuiaba', 'YYMMDD')
    || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));
  v_cart := jsonb_build_object(
    'type', 'catalog_cart',
    'catalog_id', v_intent.catalog_id,
    'items', v_order_items
  );

  begin
    if v_customer_id is null then
      insert into public.customers (name, primary_whatsapp_e164, is_active)
      values (v_customer_name, v_phone, true)
      returning * into v_customer;
      v_customer_id := v_customer.id;
      insert into public.customer_phones (
        customer_id, phone_e164, source, is_primary, verified_at
      ) values (v_customer_id, v_phone, 'whatsapp', true, v_now);
    elsif nullif(btrim(v_customer.name), '') is null then
      update public.customers
      set name = v_customer_name, updated_at = v_now
      where id = v_customer_id
      returning * into v_customer;
    end if;

    if v_address_id is not null then
      update public.customer_addresses
      set last_confirmed_at = v_now, updated_at = v_now
      where id = v_address_id and customer_id = v_customer_id
      returning * into v_address;
    else
      insert into public.customer_addresses (
        customer_id, label, street, number, complement, neighborhood,
        city, state, postal_code, reference, is_default, is_active, last_confirmed_at
      ) values (
        v_customer_id, 'WhatsApp', v_new_address ->> 'street', v_new_address ->> 'number',
        v_new_address ->> 'complement', v_new_address ->> 'neighborhood',
        v_new_address ->> 'city', v_new_address ->> 'state',
        v_new_address ->> 'postal_code', v_new_address ->> 'reference',
        not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer_id and a.is_active),
        true, v_now
      ) returning * into v_address;
      v_address_id := v_address.id;
    end if;

    v_delivery_address := jsonb_strip_nulls(jsonb_build_object(
      'customer_name', coalesce(nullif(btrim(v_customer.name), ''), v_customer_name),
      'source_customer_id', v_customer.id,
      'phone', v_phone,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'district', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference,
      'customer_address_id', v_address.id,
      'google_maps_url', v_address.google_maps_url
    ));
    v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'customer_id', v_customer.id,
      'name', coalesce(nullif(btrim(v_customer.name), ''), v_customer_name),
      'phone_e164', v_phone,
      'status', 'registered'
    ));

    insert into public.orders (
      id, customer_id, conversation_id, whatsapp_account_id, status, total, currency,
      delivery_address, customer_snapshot, confirmed_at, created_at, updated_at,
      fiscal_subtotal, other_expenses, discount, sync_status, idempotency_key,
      payment_method, phone_e164, source, subtotal, order_number,
      checkout_snapshot, delivery_customer_address_id
    ) values (
      v_order_id, v_customer.id, v_intent.conversation_id, v_intent.whatsapp_account_id,
      'confirmed', v_quote_total_cents / 100.0, 'BRL', v_delivery_address,
      v_customer_snapshot, v_now, v_now, v_now, v_quote_total_cents / 100.0,
      0, 0, 'local', 'whatsapp-order-intent:' || v_intent.id::text,
      v_intent.payment_method, v_phone, 'manual_whatsapp', v_quote_total_cents / 100.0,
      v_order_number,
      jsonb_build_object(
        'schema_version', 'sucedoan.whatsapp_checkout.v1',
        'source', 'whatsapp_order_intent',
        'origin', 'catalog',
        'order_intent_id', v_intent.id,
        'catalog_id', v_intent.catalog_id,
        'catalog_message_id', v_intent.meta_message_id,
        'confirmation_message_id', v_intent.confirmation_message_id,
        'confirmation_event_id', p_confirmation_event_id,
        'quote_revision', v_intent.quote_revision,
        'currency', 'BRL',
        'payment_method', v_intent.payment_method,
        'customer_confirmed', true,
        'customer', v_customer_snapshot,
        'delivery', v_delivery_address,
        'cart', v_cart
      ),
      v_address.id
    );

    for v_item in select value from jsonb_array_elements(v_order_items)
    loop
      v_line := v_item.value;
      insert into public.order_items (
        order_id, product_id, sku_snapshot, name_snapshot, quantity,
        unit_price, line_total, metadata
      ) values (
        v_order_id, (v_line ->> 'product_id')::uuid, nullif(v_line ->> 'sku', ''),
        v_line ->> 'name', (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit_price_cents')::numeric / 100,
        (v_line ->> 'line_total_cents')::numeric / 100,
        jsonb_build_object(
          'source', 'whatsapp_catalog',
          'order_intent_id', v_intent.id,
          'catalog_id', v_intent.catalog_id,
          'retailer_id', v_line ->> 'retailer_id',
          'image_url', coalesce(v_line ->> 'image_url', '')
        )
      );
    end loop;

    v_reservation := public.reserve_vitrine_order_stock_v1(v_order_id);
    if coalesce((v_reservation ->> 'ok')::boolean, false) is not true then
      raise exception 'whatsapp_order_stock_reservation_failed' using errcode = 'P0001';
    end if;

    insert into public.order_manual_separation_queue_v1 (order_id, selected_by, selected_source)
    values (v_order_id, null, 'customer_confirmed');

    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set customer_id = v_customer.id,
        customer_snapshot = v_customer_snapshot,
        delivery_snapshot = jsonb_build_object(
          'address_id', v_address.id,
          'address_snapshot', jsonb_strip_nulls(jsonb_build_object(
            'address_id', v_address.id,
            'label', v_address.label,
            'street', v_address.street,
            'number', v_address.number,
            'complement', v_address.complement,
            'neighborhood', v_address.neighborhood,
            'city', v_address.city,
            'state', v_address.state,
            'postal_code', v_address.postal_code,
            'reference', v_address.reference
          ))
        ),
        status = 'converted', confirmed_order_id = v_order_id,
        confirmation_event_id = p_confirmation_event_id,
        confirmed_at = v_now, converted_at = v_now,
        last_error_code = null, updated_at = v_now
    where id = v_intent.id;

    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, quote_revision, order_id
    ) values (
      p_confirmation_event_id, v_intent.id, 'converted', v_intent.quote_revision, v_order_id
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_exception_message = message_text;
    if v_exception_message <> 'whatsapp_order_stock_reservation_failed' then
      raise;
    end if;
    v_stock_failure := true;
  end;

  if v_stock_failure then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'stock_reservation_failed', updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', 'stock_reservation_failed', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'needs_review', 'issue_code', 'stock_reservation_failed'
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
    'status', 'converted', 'order_id', v_order_id,
    'order_number', v_order_number, 'quote_revision', v_intent.quote_revision,
    'duplicate', false
  );
end;
$function$
;

-- function: catalog_quote_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_items jsonb)
CREATE OR REPLACE FUNCTION whatsapp_ordering_private.catalog_quote_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_item record;
  v_product record;
  v_quantity numeric;
  v_unit_price numeric;
  v_unit_price_cents numeric;
  v_line_total_cents numeric;
  v_total_cents numeric := 0;
  v_quote_items jsonb := '[]'::jsonb;
  v_quote jsonb;
begin
  if p_whatsapp_account_id is null
    or nullif(btrim(p_catalog_id), '') is null
    or length(btrim(p_catalog_id)) > 256 then
    return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_scope_invalid');
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(case
      when jsonb_typeof(p_items) = 'array' then p_items
      else '[]'::jsonb
    end) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_items_invalid');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    group by item.value ->> 'retailer_id'
    having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_duplicate_retailer_id');
  end if;

  for v_item in
    select item.value, item.ordinality
    from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    if jsonb_typeof(v_item.value) is distinct from 'object'
      or nullif(btrim(v_item.value ->> 'retailer_id'), '') is null
      or length(btrim(v_item.value ->> 'retailer_id')) > 256
      or coalesce(v_item.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,15}$' then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_item_invalid');
    end if;

    v_quantity := (v_item.value ->> 'quantity')::numeric;
    if v_quantity > 9007199254740991 then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_quantity_out_of_range');
    end if;

    select
      link.id as mapping_id,
      product.id as product_id,
      product.sku,
      product.name,
      product.image_url,
      case
        when product.is_offer is true and product.offer_price is not null then product.offer_price
        else product.price
      end as current_unit_price
    into v_product
    from whatsapp_ordering_private.meta_catalog_product_links_v1 link
    join public.products product on product.id = link.product_id
    where link.whatsapp_account_id = p_whatsapp_account_id
      and link.catalog_id = btrim(p_catalog_id)
      and link.product_retailer_id = btrim(v_item.value ->> 'retailer_id')
      and link.status = 'active'
      and product.is_active is true
    for share of link, product;

    if not found then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_product_mapping_unresolved');
    end if;

    v_unit_price := v_product.current_unit_price;
    if v_unit_price is null or v_unit_price < 0 then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_product_price_unavailable');
    end if;

    v_unit_price_cents := round(v_unit_price * 100);
    v_line_total_cents := v_unit_price_cents * v_quantity;
    if v_unit_price_cents < 0
      or v_line_total_cents < 0
      or v_line_total_cents > 999999999999
      or v_total_cents + v_line_total_cents > 999999999999 then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_total_out_of_range');
    end if;

    v_total_cents := v_total_cents + v_line_total_cents;
    v_quote_items := v_quote_items || jsonb_build_array(jsonb_build_object(
      'retailer_id', btrim(v_item.value ->> 'retailer_id'),
      'mapping_id', v_product.mapping_id,
      'product_id', v_product.product_id,
      'sku', v_product.sku,
      'name', v_product.name,
      'image_url', coalesce(v_product.image_url, ''),
      'quantity', v_quantity,
      'unit_price_cents', v_unit_price_cents,
      'line_total_cents', v_line_total_cents
    ));
  end loop;

  v_quote := jsonb_build_object(
    'schema_version', 'sucedoan.whatsapp_catalog_quote.v1',
    'whatsapp_account_id', p_whatsapp_account_id,
    'catalog_id', btrim(p_catalog_id),
    'currency', 'BRL',
    'calculated_at', clock_timestamp(),
    'items', v_quote_items,
    'items_total_cents', v_total_cents,
    'total_cents', v_total_cents
  );

  return jsonb_build_object('ok', true, 'quote', v_quote);
end;
$function$
;

-- function: flow_confirmation_summary_v1(p_quote jsonb)
CREATE OR REPLACE FUNCTION whatsapp_ordering_private.flow_confirmation_summary_v1(p_quote jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_name text;
  v_quantity integer;
  v_lines text := '';
  v_cents bigint;
  v_whole text;
  v_grouped text := '';
  v_fraction text;
  v_summary text;
begin
  if jsonb_typeof(p_quote) is distinct from 'object'
    or coalesce(p_quote ->> 'total_cents', '') !~ '^[0-9]{1,12}$' then
    return null;
  end if;
  if jsonb_typeof(p_quote -> 'items') is distinct from 'array'
    or jsonb_array_length(p_quote -> 'items') not between 1 and 100 then
    return null;
  end if;

  v_cents := (p_quote ->> 'total_cents')::bigint;
  for v_item in
    select item.value
    from jsonb_array_elements(p_quote -> 'items') with ordinality as item(value, ordinal)
    order by item.ordinal
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item ->> 'quantity', '') !~ '^(0|[1-6])$' then
      return null;
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity = 0 then
      continue;
    end if;
    v_name := regexp_replace(btrim(coalesce(v_item ->> 'name', '')), '[[:space:]]+', ' ', 'g');
    if v_name = '' or char_length(v_name) > 180 then
      return null;
    end if;
    v_lines := v_lines || case when v_lines = '' then '' else E'\n' end
      || v_quantity::text || ' × ' || v_name;
  end loop;

  if v_lines = '' then
    return null;
  end if;
  v_whole := (v_cents / 100)::text;
  v_fraction := lpad((v_cents % 100)::text, 2, '0');
  while char_length(v_whole) > 3 loop
    v_grouped := '.' || right(v_whole, 3) || v_grouped;
    v_whole := left(v_whole, char_length(v_whole) - 3);
  end loop;
  v_grouped := v_whole || v_grouped;
  v_summary := 'Resumo do seu pedido:' || E'\n' || v_lines || E'\n\n'
    || 'Total do pedido: R$ ' || v_grouped || ',' || v_fraction || E'\n'
    || 'Confira os itens e toque em “Confirmar pedido” para enviar à separação.';
  if char_length(v_summary) > 900 then
    return null;
  end if;
  return v_summary;
end;
$function$
;
