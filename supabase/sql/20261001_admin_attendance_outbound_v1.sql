-- Dona Antônia — Central de Atendimento: fila outbound humana, ainda sem transporte
-- 2026-10-01
-- Esta migration apenas permite criar estado queued quando todos os gates canônicos
-- estiverem homologados. Não realiza chamada HTTP e não envia mensagem ao WhatsApp.

create or replace function public.ops2_admin_attendance_enqueue_text_v1(
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
  v_text text := btrim(coalesce(p_text,''));
  v_client_key text := btrim(coalesce(p_idempotency_key,''));
  v_key text;
  v_phone text;
  v_message_id uuid;
  v_outbox_id uuid;
  v_recent_count integer := 0;
  v_purpose text := 'human_attendance';
  v_sender_kind text := 'human';
  v_status_current text := 'queued';
  v_outbox_status text := 'queued';
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

  if length(v_client_key)<8
     or length(v_client_key)>120
     or v_client_key !~ '^[A-Za-z0-9._:-]+$' then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key');
  end if;

  v_key:='attendance:'||p_conversation_id::text||':'||v_client_key;
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
      'message_id',v_existing.message_id,
      'outbox_id',v_existing.id,
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
    and r.outbound_provider='papoai'
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null;

  if not found then
    return jsonb_build_object('ok',false,'error','human_send_not_homologated');
  end if;

  select count(*)::integer into v_recent_count
  from public.whatsapp_outbox_v1 o
  where o.conversation_id=p_conversation_id
    and o.purpose='human_attendance'
    and o.created_at > now() - interval '60 seconds'
    and o.status<>'cancelled';

  if v_recent_count>=20 then
    return jsonb_build_object('ok',false,'error','rate_limited');
  end if;

  insert into public.whatsapp_messages_v1(
    conversation_id,
    whatsapp_account_id,
    customer_id,
    direction,
    message_type,
    provider,
    text_body,
    status_current,
    sender_kind,
    sender_ref,
    metadata
  ) values (
    p_conversation_id,
    v_conversation.whatsapp_account_id,
    v_conversation.customer_id,
    'outbound',
    'text',
    'papoai',
    v_text,
    v_status_current,
    v_sender_kind,
    'vitrine_admin_attendance',
    jsonb_build_object(
      'source','attendance',
      'idempotency_key',v_key,
      'queued_by','admin'
    )
  ) returning id into v_message_id;

  insert into public.whatsapp_outbox_v1(
    idempotency_key,
    whatsapp_account_id,
    conversation_id,
    customer_id,
    to_phone_e164,
    message_id,
    purpose,
    message_type,
    payload,
    provider,
    status,
    metadata
  ) values (
    v_key,
    v_conversation.whatsapp_account_id,
    p_conversation_id,
    v_conversation.customer_id,
    v_phone,
    v_message_id,
    v_purpose,
    'text',
    jsonb_build_object('text',v_text,'message_id',v_message_id),
    'papoai',
    v_outbox_status,
    jsonb_build_object('source','attendance','transport_pending',true)
  ) returning id into v_outbox_id;

  return jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'conversation_id',p_conversation_id,
    'message_id',v_message_id,
    'outbox_id',v_outbox_id,
    'status','queued'
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_enqueue_text_v1(uuid,text,text) from public;
revoke all on function public.ops2_admin_attendance_enqueue_text_v1(uuid,text,text) from anon;
revoke all on function public.ops2_admin_attendance_enqueue_text_v1(uuid,text,text) from authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_text_v1(uuid,text,text) to service_role;
