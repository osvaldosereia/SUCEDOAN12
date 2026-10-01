-- Dona Antônia — Central de Atendimento: claim seguro do transporte PapoAI
-- O transporte HTTP permanece na Edge Function e só recebe linhas já homologadas.

create or replace function public.ops2_admin_attendance_claim_outbox_v1(
  p_outbox_id uuid
)
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
    return jsonb_build_object('ok',true,'already_sent',true,'outbox_id',v_outbox.id,'message_id',v_outbox.message_id,'status','sent');
  end if;

  if v_outbox.status<>'queued' then
    return jsonb_build_object('ok',false,'error','outbox_not_queued','status',v_outbox.status);
  end if;

  if v_outbox.purpose<>'human_attendance'
     or v_outbox.provider<>'papoai'
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
    and r.outbound_provider='papoai'
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null;

  if not found then
    return jsonb_build_object('ok',false,'error','human_send_not_homologated');
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

  update public.whatsapp_messages_v1
     set status_current='sending'
   where id=v_outbox.message_id
     and conversation_id=v_outbox.conversation_id
     and status_current='queued';

  return jsonb_build_object(
    'ok',true,
    'already_sent',false,
    'outbox_id',v_outbox.id,
    'message_id',v_outbox.message_id,
    'conversation_id',v_outbox.conversation_id,
    'whatsapp_account_id',v_outbox.whatsapp_account_id,
    'account_phone_e164',v_account.phone_e164,
    'to_phone_e164',v_phone,
    'text',v_text,
    'idempotency_key',v_outbox.idempotency_key,
    'status','claimed'
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_claim_outbox_v1(uuid) from public;
revoke all on function public.ops2_admin_attendance_claim_outbox_v1(uuid) from anon;
revoke all on function public.ops2_admin_attendance_claim_outbox_v1(uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_claim_outbox_v1(uuid) to service_role;
