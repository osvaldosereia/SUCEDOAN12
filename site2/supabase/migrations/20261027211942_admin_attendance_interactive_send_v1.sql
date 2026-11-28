-- Candidate only. Apply to an isolated, schema-complete staging project first.
-- This adds native reply-button/list messages without widening text RPC contracts.

create or replace function public.ops2_admin_attendance_enqueue_interactive_v1(
  p_conversation_id uuid,
  p_interactive jsonb,
  p_idempotency_key text,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_existing public.whatsapp_outbox_v1%rowtype;
  v_kind text;
  v_body text;
  v_phone text;
  v_key text;
  v_client_key text := btrim(coalesce(p_idempotency_key, ''));
  v_provider text;
  v_outbox_id uuid;
  v_rows integer;
  v_unique_count integer;
  v_recent_count integer := 0;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if p_admin_user_id is null or not exists (
    select 1 from public.admin_users u
    where u.user_id = p_admin_user_id and u.is_active = true
      and u.role in ('owner', 'admin', 'operator')
  ) then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_interactive is null or jsonb_typeof(p_interactive) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'interactive_invalid');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_interactive) as keys(key)
    where keys.key not in ('type', 'header', 'body', 'footer', 'action')
  ) then
    return jsonb_build_object('ok', false, 'error', 'interactive_invalid');
  end if;
  if jsonb_typeof(p_interactive->'body') is distinct from 'object'
     or jsonb_typeof(p_interactive->'action') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'interactive_invalid');
  end if;
  if octet_length(p_interactive::text) > 12000 then
    return jsonb_build_object('ok', false, 'error', 'interactive_too_large');
  end if;
  if length(v_client_key) < 8 or length(v_client_key) > 120
     or v_client_key !~ '^[A-Za-z0-9._:-]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_idempotency_key');
  end if;

  v_kind := lower(btrim(coalesce(p_interactive->>'type', '')));
  v_body := btrim(coalesce(p_interactive#>>'{body,text}', ''));
  if v_body = '' or char_length(v_body) > 1024 then
    return jsonb_build_object('ok', false, 'error', 'interactive_body_invalid');
  end if;

  if v_kind = 'button' then
    if jsonb_typeof(p_interactive#>'{action,buttons}') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'error', 'interactive_buttons_invalid');
    end if;
    if jsonb_array_length(p_interactive#>'{action,buttons}') not between 1 and 3 then
      return jsonb_build_object('ok', false, 'error', 'interactive_buttons_invalid');
    end if;
    select count(*)::integer, count(distinct b.value#>>'{reply,id}')::integer
    into v_rows, v_unique_count
    from jsonb_array_elements(p_interactive#>'{action,buttons}') b(value);
    if v_rows <> v_unique_count then
      return jsonb_build_object('ok', false, 'error', 'interactive_buttons_invalid');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_interactive#>'{action,buttons}') b(value)
      where b.value->>'type' <> 'reply'
        or coalesce(b.value#>>'{reply,id}', '') = ''
        or char_length(b.value#>>'{reply,id}') > 256
        or coalesce(b.value#>>'{reply,title}', '') = ''
        or char_length(b.value#>>'{reply,title}') > 20
    ) then
      return jsonb_build_object('ok', false, 'error', 'interactive_buttons_invalid');
    end if;
  elsif v_kind = 'list' then
    if coalesce(btrim(p_interactive#>>'{action,button}'), '') = ''
       or char_length(p_interactive#>>'{action,button}') > 20 then
      return jsonb_build_object('ok', false, 'error', 'interactive_list_invalid');
    end if;
    if jsonb_typeof(p_interactive#>'{action,sections}') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'error', 'interactive_list_invalid');
    end if;
    if jsonb_array_length(p_interactive#>'{action,sections}') <> 1 then
      return jsonb_build_object('ok', false, 'error', 'interactive_list_invalid');
    end if;
    if jsonb_typeof(p_interactive#>'{action,sections,0,rows}') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'error', 'interactive_list_invalid');
    end if;
    select coalesce(jsonb_array_length(s.value->'rows'), 0)
    into v_rows
    from jsonb_array_elements(p_interactive#>'{action,sections}') s(value)
    limit 1;
    if v_rows is null or v_rows < 1 or v_rows > 10 then
      return jsonb_build_object('ok', false, 'error', 'interactive_list_invalid');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_interactive#>'{action,sections}') s(value)
      cross join lateral jsonb_array_elements(s.value->'rows') r(value)
      where coalesce(r.value->>'id', '') = ''
        or char_length(r.value->>'id') > 200
        or coalesce(r.value->>'title', '') = ''
        or char_length(r.value->>'title') > 24
        or char_length(coalesce(r.value->>'description', '')) > 72
    ) then
      return jsonb_build_object('ok', false, 'error', 'interactive_list_invalid');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'interactive_type_unsupported');
  end if;

  if p_interactive ? 'header' and (
    jsonb_typeof(p_interactive->'header') <> 'object'
    or p_interactive#>>'{header,type}' <> 'text'
    or coalesce(btrim(p_interactive#>>'{header,text}'), '') = ''
    or char_length(p_interactive#>>'{header,text}') > 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'interactive_header_invalid');
  end if;
  if p_interactive ? 'footer' and (
    jsonb_typeof(p_interactive->'footer') <> 'object'
    or coalesce(btrim(p_interactive#>>'{footer,text}'), '') = ''
    or char_length(p_interactive#>>'{footer,text}') > 60
  ) then
    return jsonb_build_object('ok', false, 'error', 'interactive_footer_invalid');
  end if;

  v_key := 'attendance-interactive-v1:' || p_conversation_id::text || ':' || v_client_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.* into v_conversation
  from public.conversations c
  join public.whatsapp_accounts wa
    on wa.id = c.whatsapp_account_id
   and wa.is_active = true
  where c.id = p_conversation_id
    and c.whatsapp_account_id is not null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'conversation_channel_unavailable');
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_phone_invalid');
  end if;

  select o.* into v_existing
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_key;
  if found then
    if v_existing.conversation_id is distinct from p_conversation_id
       or v_existing.message_type <> 'interactive'
       or v_existing.metadata->>'admin_user_id' is distinct from p_admin_user_id::text
       or v_existing.payload->'interactive' is distinct from p_interactive then
      return jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'conversation_id', p_conversation_id,
      'outbox_id', v_existing.id, 'provider', v_existing.provider, 'status', v_existing.status
    );
  end if;

  if v_conversation.last_inbound_at is null
     or now() >= v_conversation.last_inbound_at + interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'service_window_closed');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id = v_conversation.whatsapp_account_id
    and r.send_enabled = true
    and r.human_send_enabled = true
    and r.homologated_at is not null
    and r.outbound_provider = 'meta';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'human_send_not_homologated');
  end if;
  v_provider := v_runtime.outbound_provider;

  if lower(coalesce(v_runtime.metadata->>'meta_canary_enabled', 'false')) = 'true'
     and not exists (
       select 1
       from jsonb_array_elements_text(
         case when jsonb_typeof(v_runtime.metadata->'meta_canary_to_e164') = 'array'
           then v_runtime.metadata->'meta_canary_to_e164' else '[]'::jsonb end
       ) allowed(value)
       where public.canonical_whatsapp_e164_br_v2(allowed.value) = v_phone
     ) then
    return jsonb_build_object('ok', false, 'error', 'meta_canary_destination_blocked');
  end if;

  if exists (
    select 1 from public.whatsapp_outbox_v1 o
    where o.conversation_id = p_conversation_id
      and o.provider = 'meta'
      and o.status = 'claimed'
      and o.purpose = 'human_attendance'
      and o.message_type = 'interactive'
  ) then
    return jsonb_build_object('ok', false, 'error', 'meta_send_uncertain');
  end if;

  select count(*)::integer into v_recent_count
  from public.whatsapp_outbox_v1 o
  where o.conversation_id = p_conversation_id
    and o.purpose = 'human_attendance'
    and o.created_at > now() - interval '60 seconds'
    and o.status <> 'cancelled';
  if v_recent_count >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.whatsapp_outbox_v1(
    idempotency_key, whatsapp_account_id, conversation_id, customer_id,
    to_phone_e164, purpose, message_type, payload, provider, status, metadata
  ) values (
    v_key, v_conversation.whatsapp_account_id, p_conversation_id, v_conversation.customer_id,
    v_phone, 'human_attendance', 'interactive',
    jsonb_build_object('type', 'interactive', 'interactive', p_interactive),
    v_provider, 'queued',
    jsonb_build_object(
      'source', 'attendance', 'contract', 'native_interactive_v1', 'provider', v_provider,
      'meta_canary', lower(coalesce(v_runtime.metadata->>'meta_canary_enabled', 'false')) = 'true',
      'admin_user_id', p_admin_user_id
    )
  ) returning id into v_outbox_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'conversation_id', p_conversation_id,
    'outbox_id', v_outbox_id, 'provider', v_provider, 'status', 'queued'
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_claim_interactive_outbox_v1(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_phone text;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok', false, 'error', 'outbox_required');
  end if;

  select o.* into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id = p_outbox_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'outbox_not_found'); end if;
  if v_outbox.status = 'sent' then
    return jsonb_build_object('ok', true, 'already_sent', true, 'outbox_id', v_outbox.id, 'status', 'sent');
  end if;
  if v_outbox.status <> 'queued' then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_queued', 'status', v_outbox.status);
  end if;
  if v_outbox.purpose <> 'human_attendance'
     or v_outbox.provider <> 'meta'
     or v_outbox.message_type <> 'interactive'
     or v_outbox.payload->>'type' <> 'interactive'
     or v_outbox.payload#>>'{interactive,type}' not in ('button', 'list') then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_dispatchable');
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id = v_outbox.conversation_id;
  if not found or v_conversation.whatsapp_account_id is null
     or v_conversation.whatsapp_account_id is distinct from v_outbox.whatsapp_account_id then
    return jsonb_build_object('ok', false, 'error', 'conversation_account_mismatch');
  end if;
  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id = v_conversation.whatsapp_account_id and wa.is_active = true;
  if not found then return jsonb_build_object('ok', false, 'error', 'account_unavailable'); end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null or v_phone is distinct from public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) then
    return jsonb_build_object('ok', false, 'error', 'destination_mismatch');
  end if;
  if v_conversation.last_inbound_at is null
     or now() >= v_conversation.last_inbound_at + interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'service_window_closed');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id = v_conversation.whatsapp_account_id
    and r.send_enabled = true and r.human_send_enabled = true
    and r.homologated_at is not null and r.outbound_provider = 'meta';
  if not found then return jsonb_build_object('ok', false, 'error', 'human_send_not_homologated'); end if;
  if lower(coalesce(v_runtime.metadata->>'meta_canary_enabled', 'false')) = 'true'
     and not exists (
       select 1 from jsonb_array_elements_text(
         case when jsonb_typeof(v_runtime.metadata->'meta_canary_to_e164') = 'array'
           then v_runtime.metadata->'meta_canary_to_e164' else '[]'::jsonb end
       ) allowed(value)
       where public.canonical_whatsapp_e164_br_v2(allowed.value) = v_phone
     ) then
    return jsonb_build_object('ok', false, 'error', 'meta_canary_destination_blocked');
  end if;

  update public.whatsapp_outbox_v1
  set status = 'claimed', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now()
  where id = v_outbox.id and status = 'queued';
  if not found then return jsonb_build_object('ok', false, 'error', 'outbox_claim_race'); end if;

  return jsonb_build_object(
    'ok', true, 'already_sent', false, 'outbox_id', v_outbox.id,
    'conversation_id', v_outbox.conversation_id, 'whatsapp_account_id', v_outbox.whatsapp_account_id,
    'customer_id', v_outbox.customer_id, 'provider', v_outbox.provider,
    'account_slug', v_account.slug, 'account_phone_e164', v_account.phone_e164,
    'phone_number_id', v_account.phone_number_id,
    'waba_id', v_account.waba_id, 'to_phone_e164', v_phone,
    'interactive_payload', v_outbox.payload, 'idempotency_key', v_outbox.idempotency_key,
    'admin_user_id', v_outbox.metadata->>'admin_user_id', 'status', 'claimed'
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_accept_meta_interactive_v1(
  p_outbox_id uuid,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_provider_message_id text := btrim(coalesce(p_provider_message_id, ''));
  v_accepted_at timestamptz := coalesce(p_accepted_at, now());
  v_message_id uuid;
  v_status_result jsonb;
  v_status text;
  v_occurred_at timestamptz;
  v_replayed integer := 0;
  v_body text;
  r public.whatsapp_webhook_events_v1%rowtype;
begin
  if p_outbox_id is null then return jsonb_build_object('ok', false, 'error', 'outbox_required'); end if;
  if v_provider_message_id not like 'wamid.%'
     or char_length(v_provider_message_id) > 500
     or v_provider_message_id ~ '[[:cntrl:][:space:]]' then
    return jsonb_build_object('ok', false, 'error', 'provider_message_id_invalid');
  end if;
  select o.* into v_outbox from public.whatsapp_outbox_v1 o where o.id = p_outbox_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'outbox_not_found'); end if;
  if v_outbox.provider <> 'meta' or v_outbox.purpose <> 'human_attendance'
     or v_outbox.message_type <> 'interactive' or v_outbox.conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_meta_interactive_attendance');
  end if;
  if v_outbox.status = 'sent' then
    if v_outbox.provider_message_id is distinct from v_provider_message_id or v_outbox.message_id is null then
      return jsonb_build_object('ok', false, 'error', 'already_sent_mismatch');
    end if;
    return jsonb_build_object('ok', true, 'already_accepted', true, 'idempotent', true,
      'outbox_id', v_outbox.id, 'message_id', v_outbox.message_id,
      'provider_message_id', v_outbox.provider_message_id, 'status', 'sent');
  end if;
  if v_outbox.status <> 'claimed' then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_claimed', 'status', v_outbox.status);
  end if;

  v_body := nullif(btrim(v_outbox.payload#>>'{interactive,body,text}'), '');
  if v_body is null then return jsonb_build_object('ok', false, 'error', 'outbox_payload_invalid'); end if;

  select m.* into v_message
  from public.whatsapp_messages_v1 m
  where m.whatsapp_account_id = v_outbox.whatsapp_account_id
    and m.provider_message_id = v_provider_message_id
  order by case when m.provider = 'meta' then 0 else 1 end, m.created_at, m.id
  limit 1 for update;
  if found then
    if v_message.conversation_id is distinct from v_outbox.conversation_id or v_message.direction <> 'outbound' then
      return jsonb_build_object('ok', false, 'error', 'wamid_conversation_conflict');
    end if;
    update public.whatsapp_messages_v1 m
    set provider = 'meta', customer_id = coalesce(m.customer_id, v_outbox.customer_id),
        message_type = 'interactive', text_body = coalesce(m.text_body, v_body),
        status_current = case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
        sender_kind = 'human', sender_ref = coalesce(nullif(v_outbox.metadata->>'admin_user_id',''), m.sender_ref),
        sent_at = coalesce(m.sent_at, v_accepted_at),
        metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
          'source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
          'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted',
          'meta_accepted_at',v_accepted_at,'interactive_type',v_outbox.payload#>>'{interactive,type}')
    where m.id = v_message.id returning * into v_message;
  else
    begin
      insert into public.whatsapp_messages_v1(
        conversation_id, whatsapp_account_id, customer_id, direction, message_type, provider,
        provider_message_id, provider_conversation_id, text_body, status_current,
        sender_kind, sender_ref, sent_at, metadata
      ) values (
        v_outbox.conversation_id, v_outbox.whatsapp_account_id, v_outbox.customer_id,
        'outbound','interactive','meta',v_provider_message_id,null,v_body,'accepted','human',
        nullif(v_outbox.metadata->>'admin_user_id',''),v_accepted_at,
        jsonb_build_object('source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
          'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted',
          'meta_accepted_at',v_accepted_at,'interactive_type',v_outbox.payload#>>'{interactive,type}')
      ) returning * into v_message;
    exception when unique_violation then
      select m.* into v_message
      from public.whatsapp_messages_v1 m
      where m.whatsapp_account_id = v_outbox.whatsapp_account_id
        and m.provider_message_id = v_provider_message_id
      order by case when m.provider = 'meta' then 0 else 1 end, m.created_at, m.id
      limit 1 for update;
      if not found or v_message.conversation_id is distinct from v_outbox.conversation_id
         or v_message.direction <> 'outbound' then
        return jsonb_build_object('ok', false, 'error', 'wamid_race_conflict');
      end if;
      update public.whatsapp_messages_v1 m
      set provider='meta', message_type='interactive', text_body=coalesce(m.text_body,v_body),
          sender_kind='human', sender_ref=coalesce(nullif(v_outbox.metadata->>'admin_user_id',''),m.sender_ref),
          status_current=case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
          sent_at=coalesce(m.sent_at,v_accepted_at),
          metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
            'source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
            'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted',
            'meta_accepted_at',v_accepted_at,'interactive_type',v_outbox.payload#>>'{interactive,type}',
            'race_reconciled',true)
      where m.id=v_message.id returning * into v_message;
    end;
  end if;

  v_message_id := v_message.id;
  update public.whatsapp_outbox_v1
  set message_id=v_message_id, provider_message_id=v_provider_message_id, status='sent',
      sent_at=v_accepted_at, last_error=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,'canonical_message_id',v_message_id),
      updated_at=now()
  where id=v_outbox.id;

  update public.conversations
  set last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),v_accepted_at),
      last_human_message_at=greatest(coalesce(last_human_message_at,'-infinity'::timestamptz),v_accepted_at),
      updated_at=greatest(updated_at,v_accepted_at)
  where id=v_outbox.conversation_id;

  v_status_result := public.whatsapp_record_status_v1(
    v_outbox.whatsapp_account_id,'meta',v_provider_message_id,'accepted',v_accepted_at,now(),
    null,null,null,jsonb_build_object('source','graph_send_response','outbox_id',v_outbox.id));
  if coalesce((v_status_result->>'ok')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','accepted_status_record_failed');
  end if;

  for r in
    select e.* from public.whatsapp_webhook_events_v1 e
    where e.whatsapp_account_id=v_outbox.whatsapp_account_id
      and e.provider='meta' and e.provider_message_id=v_provider_message_id
      and e.event_type like 'message.status.%' and e.status='received'
    order by e.received_at,e.id for update
  loop
    v_status := split_part(r.event_type,'.',3);
    if v_status not in ('sent','delivered','read','failed','cancelled') then
      update public.whatsapp_webhook_events_v1
      set status='ignored',processed_at=now(),last_error='status_not_supported_for_replay'
      where id=r.id;
      continue;
    end if;
    v_occurred_at := case when coalesce(r.payload->>'timestamp','') ~ '^\d+(\.\d+)?$'
      then to_timestamp((r.payload->>'timestamp')::double precision) else r.received_at end;
    v_status_result := public.whatsapp_record_status_v1(
      v_outbox.whatsapp_account_id,'meta',v_provider_message_id,v_status,
      v_occurred_at,r.received_at,nullif(r.payload->'errors'->0->>'code',''),
      nullif(r.payload->'errors'->0->>'title',''),
      nullif(coalesce(r.payload->'errors'->0->>'message',r.payload->'errors'->0->'error_data'->>'details'),''),r.payload);
    if coalesce((v_status_result->>'ok')::boolean,false) is true then
      update public.whatsapp_webhook_events_v1 set status='normalized',processed_at=now(),last_error=null where id=r.id;
      v_replayed := v_replayed + 1;
    else
      update public.whatsapp_webhook_events_v1
      set status='review_required',processed_at=now(),last_error=left(coalesce(v_status_result->>'error','status_replay_failed'),500)
      where id=r.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'already_accepted',false,'idempotent',false,'outbox_id',v_outbox.id,
    'message_id',v_message_id,'provider_message_id',v_provider_message_id,
    'status_current',(select m.status_current from public.whatsapp_messages_v1 m where m.id=v_message_id),
    'pending_statuses_replayed',v_replayed,'status','sent');
end;
$function$;

revoke all on function public.ops2_admin_attendance_enqueue_interactive_v1(uuid,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_interactive_v1(uuid,jsonb,text,uuid) to service_role;
revoke all on function public.ops2_admin_attendance_claim_interactive_outbox_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_claim_interactive_outbox_v1(uuid) to service_role;
revoke all on function public.ops2_admin_attendance_accept_meta_interactive_v1(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_accept_meta_interactive_v1(uuid,text,timestamptz) to service_role;
