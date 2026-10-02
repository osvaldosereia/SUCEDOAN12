-- Dona Antônia — Central de Atendimento: outbox provider-neutral v3
-- Task 1 only: prepara PapoAI/Meta atrás do mesmo contrato sem mudar runtime/gates.
-- Não envia mensagens e não cria whatsapp_messages_v1 otimista.

create or replace function public.ops2_admin_attendance_enqueue_text_v3(
  p_conversation_id uuid,
  p_text text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_existing public.whatsapp_outbox_v1%rowtype;
  v_text text:=btrim(coalesce(p_text,''));
  v_client_key text:=btrim(coalesce(p_idempotency_key,''));
  v_key text;
  v_phone text;
  v_provider text;
  v_outbox_id uuid;
  v_recent_count integer:=0;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','conversation_required');
  end if;
  if v_text='' then
    return jsonb_build_object('ok',false,'error','message_empty');
  end if;
  if char_length(v_text)>4000 then
    return jsonb_build_object('ok',false,'error','message_too_long');
  end if;
  if length(v_client_key)<8 or length(v_client_key)>120 or v_client_key !~ '^[A-Za-z0-9._:-]+$' then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key');
  end if;

  v_key:='attendance-v3:'||p_conversation_id::text||':'||v_client_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));

  select c.* into v_conversation
  from public.conversations c
  join public.whatsapp_accounts wa
    on wa.id=c.whatsapp_account_id
   and wa.is_active=true
  where c.id=p_conversation_id
    and c.whatsapp_account_id is not null;
  if not found then
    return jsonb_build_object('ok',false,'error','conversation_channel_unavailable');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','conversation_phone_invalid');
  end if;

  select o.* into v_existing
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key=v_key;
  if found then
    if v_existing.conversation_id is distinct from p_conversation_id
       or coalesce(v_existing.payload->>'text','')<>v_text then
      return jsonb_build_object('ok',false,'error','idempotency_conflict');
    end if;
    return jsonb_build_object(
      'ok',true,
      'duplicate',true,
      'conversation_id',p_conversation_id,
      'outbox_id',v_existing.id,
      'provider',v_existing.provider,
      'status',v_existing.status
    );
  end if;

  if v_conversation.last_inbound_at is null
     or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_closed');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=v_conversation.whatsapp_account_id
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null;
  if not found then
    return jsonb_build_object('ok',false,'error','human_send_not_homologated');
  end if;

  v_provider:=v_runtime.outbound_provider;
  if v_provider not in ('papoai','meta') then
    return jsonb_build_object('ok',false,'error','outbound_provider_unavailable');
  end if;

  select count(*)::integer into v_recent_count
  from public.whatsapp_outbox_v1 o
  where o.conversation_id=p_conversation_id
    and o.purpose='human_attendance'
    and o.created_at>now()-interval '60 seconds'
    and o.status<>'cancelled';
  if v_recent_count>=20 then
    return jsonb_build_object('ok',false,'error','rate_limited');
  end if;

  insert into public.whatsapp_outbox_v1(
    idempotency_key,
    whatsapp_account_id,
    conversation_id,
    customer_id,
    to_phone_e164,
    purpose,
    message_type,
    payload,
    provider,status,metadata
  ) values (
    v_key,
    v_conversation.whatsapp_account_id,
    p_conversation_id,
    v_conversation.customer_id,
    v_phone,
    'human_attendance',
    'text',
    jsonb_build_object('text',v_text),
    v_provider,'queued',
    jsonb_build_object(
      'source','attendance',
      'contract','provider_neutral_v3',
      'provider',v_provider
    )
  ) returning id into v_outbox_id;

  return jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'conversation_id',p_conversation_id,
    'outbox_id',v_outbox_id,
    'provider',v_provider,
    'status','queued'
  );
end;
$$;

create or replace function public.ops2_admin_attendance_claim_outbox_v3(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_phone text;
  v_text text;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok',false,'error','outbox_required');
  end if;

  select o.* into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id=p_outbox_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','outbox_not_found');
  end if;
  if v_outbox.status='sent' then
    return jsonb_build_object(
      'ok',true,
      'already_sent',true,
      'outbox_id',v_outbox.id,
      'provider',v_outbox.provider,
      'status','sent'
    );
  end if;
  if v_outbox.status<>'queued' then
    return jsonb_build_object('ok',false,'error','outbox_not_queued','status',v_outbox.status);
  end if;
  if v_outbox.purpose<>'human_attendance'
     or v_outbox.provider not in ('papoai','meta')
     or v_outbox.message_type<>'text' then
    return jsonb_build_object('ok',false,'error','outbox_not_dispatchable');
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id=v_outbox.conversation_id;
  if not found
     or v_conversation.whatsapp_account_id is null
     or v_conversation.whatsapp_account_id is distinct from v_outbox.whatsapp_account_id then
    return jsonb_build_object('ok',false,'error','conversation_account_mismatch');
  end if;

  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id=v_conversation.whatsapp_account_id
    and wa.is_active=true;
  if not found then
    return jsonb_build_object('ok',false,'error','account_unavailable');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null
     or v_phone is distinct from public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) then
    return jsonb_build_object('ok',false,'error','destination_mismatch');
  end if;

  if v_conversation.last_inbound_at is null
     or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_closed');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=v_conversation.whatsapp_account_id
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null;
  if not found then
    return jsonb_build_object('ok',false,'error','human_send_not_homologated');
  end if;

  if v_outbox.provider is distinct from v_runtime.outbound_provider then
    return jsonb_build_object('ok',false,'error','provider_runtime_mismatch');
  end if;
  if v_runtime.outbound_provider not in ('papoai','meta') then
    return jsonb_build_object('ok',false,'error','outbound_provider_unavailable');
  end if;

  v_text:=btrim(coalesce(v_outbox.payload->>'text',''));
  if v_text='' or char_length(v_text)>4000 then
    return jsonb_build_object('ok',false,'error','outbox_text_invalid');
  end if;

  update public.whatsapp_outbox_v1
  set status='claimed',
      claimed_at=now(),
      attempt_count=attempt_count+1,
      updated_at=now()
  where id=v_outbox.id
    and status='queued';
  if not found then
    return jsonb_build_object('ok',false,'error','outbox_claim_race');
  end if;

  return jsonb_build_object(
    'ok',true,
    'already_sent',false,
    'outbox_id',v_outbox.id,
    'conversation_id',v_outbox.conversation_id,
    'whatsapp_account_id',v_outbox.whatsapp_account_id,
    'provider',v_outbox.provider,
    'account_phone_e164',v_account.phone_e164,
    'phone_number_id',v_account.phone_number_id,
    'waba_id',v_account.waba_id,
    'to_phone_e164',v_phone,
    'text',v_text,
    'idempotency_key',v_outbox.idempotency_key,
    'status','claimed'
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_enqueue_text_v3(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_text_v3(uuid,text,text) to service_role;
revoke all on function public.ops2_admin_attendance_claim_outbox_v3(uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_claim_outbox_v3(uuid) to service_role;
