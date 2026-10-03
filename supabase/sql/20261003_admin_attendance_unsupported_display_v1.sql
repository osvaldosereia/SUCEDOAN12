-- Hotfix de apresentação: preserva whatsapp_messages_v1 e neutraliza somente a resposta da Central.
create or replace function public.ops2_admin_attendance_conversation_v1(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 30
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer := least(50,greatest(1,coalesce(p_limit,30)));
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_messages jsonb;
  v_oldest timestamptz;
begin
  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id=v_conversation.whatsapp_account_id and wa.is_active=true;

  if not found then
    return jsonb_build_object('ok',false,'error','whatsapp_account_not_found');
  end if;

  with selected as (
    select
      m.id,
      m.conversation_id,
      m.whatsapp_account_id,
      m.customer_id,
      m.direction,
      m.message_type,
      m.provider,
      m.provider_message_id,
      m.reply_to_message_id,
      m.text_body,
      m.status_current,
      m.sender_kind,
      m.sender_ref,
      m.metadata,
      coalesce(m.received_at,m.sent_at,m.created_at) as message_at,
      m.created_at
    from public.whatsapp_messages_v1 m
    where m.conversation_id=p_conversation_id
      and m.whatsapp_account_id=v_conversation.whatsapp_account_id
      and (p_before is null or coalesce(m.received_at,m.sent_at,m.created_at)<p_before)
    order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc,m.id desc
    limit v_limit
  ), chronological as (
    select * from selected
    order by message_at asc,created_at asc,id asc
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,
      'conversation_id',m.conversation_id,
      'whatsapp_account_id',m.whatsapp_account_id,
      'customer_id',m.customer_id,
      'direction',m.direction,
      'message_type',m.message_type,
      'provider',m.provider,
      'provider_message_id',m.provider_message_id,
      'reply_to_message_id',m.reply_to_message_id,
      'text_body',case
        when lower(coalesce(m.metadata->>'raw_type',''))='unsupported'
          then 'Mensagem recebida, mas o provedor não disponibilizou o conteúdo. Abra o WhatsApp no celular para visualizar.'
        else m.text_body
      end,
      'status_current',m.status_current,
      'sender_kind',m.sender_kind,
      'sender_ref',m.sender_ref,
      'message_at',m.message_at,
      'metadata',m.metadata
    ) order by m.message_at asc,m.created_at asc,m.id asc),'[]'::jsonb),
    min(m.message_at)
  into v_messages,v_oldest
  from chronological m;

  return jsonb_build_object(
    'ok',true,
    'conversation',jsonb_build_object(
      'id',v_conversation.id,
      'whatsapp_account_id',v_conversation.whatsapp_account_id,
      'customer_id',v_conversation.customer_id,
      'phone_e164',public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164),
      'status',v_conversation.status,
      'stage',v_conversation.stage,
      'mode',v_conversation.mode,
      'human_required',coalesce(v_conversation.human_required,false),
      'last_inbound_at',v_conversation.last_inbound_at,
      'last_outbound_at',v_conversation.last_outbound_at,
      'service_window_expires_at',v_conversation.service_window_expires_at,
      'opened_at',v_conversation.opened_at
    ),
    'account',jsonb_build_object(
      'id',v_account.id,
      'slug',v_account.slug,
      'display_name',v_account.display_name,
      'phone_e164',v_account.phone_e164
    ),
    'limit',v_limit,
    'before',p_before,
    'next_before',v_oldest,
    'messages',v_messages
  );
end;
$$;
