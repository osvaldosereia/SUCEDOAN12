begin;

create or replace function public.ops2_admin_attendance_weekly_consent_prepare_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_request public.marketing_weekly_consent_requests_v1%rowtype;
  v_existing_event uuid;
  v_prompt constant text:='Quer receber ofertas e cupons da Dona Antônia pelo WhatsApp? Enviamos no máximo 1 vez por semana. Você pode cancelar quando quiser.';
  v_phone text;
begin
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-consent:'||p_conversation_id::text,0));

  select * into v_conversation
  from public.conversations
  where id=p_conversation_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  if v_conversation.customer_id is null then return jsonb_build_object('ok',false,'error','customer_not_linked'); end if;
  if v_conversation.last_inbound_at is null or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_closed');
  end if;

  select e.id into v_existing_event
  from public.marketing_consent_events_v1 e
  where e.customer_id=v_conversation.customer_id
    and coalesce(e.metadata->>'scope','')='weekly_offers_coupons'
  order by e.occurred_at desc,e.created_at desc
  limit 1;

  if v_existing_event is not null then
    return jsonb_build_object('ok',false,'error','weekly_consent_already_decided');
  end if;

  select * into v_request
  from public.marketing_weekly_consent_requests_v1
  where customer_id=v_conversation.customer_id
    and consent_scope='weekly_offers_coupons'
  for update;

  if found and v_request.status='sent' then
    return jsonb_build_object('ok',false,'error','weekly_consent_already_requested','request_id',v_request.id);
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;

  if found and v_request.status='prepared' then
    update public.marketing_weekly_consent_requests_v1
       set conversation_id=p_conversation_id,
           phone_e164=v_phone,
           consent_text_snapshot=v_prompt,
           updated_at=now()
     where id=v_request.id
     returning * into v_request;
  elsif found and v_request.status='send_failed' then
    update public.marketing_weekly_consent_requests_v1
       set conversation_id=p_conversation_id,
           phone_e164=v_phone,
           consent_text_snapshot=v_prompt,
           status='prepared',
           attempt_count=attempt_count+1,
           outbox_id=null,
           provider_message_id=null,
           updated_at=now()
     where id=v_request.id
     returning * into v_request;
  elsif found then
    return jsonb_build_object('ok',false,'error','weekly_consent_request_state_invalid','request_id',v_request.id,'status',v_request.status);
  else
    insert into public.marketing_weekly_consent_requests_v1(
      customer_id,conversation_id,phone_e164,consent_text_snapshot
    ) values(
      v_conversation.customer_id,p_conversation_id,v_phone,v_prompt
    ) returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok',true,
    'request_id',v_request.id,
    'attempt_count',v_request.attempt_count,
    'prompt',v_prompt,
    'consent_text_version',v_request.consent_text_version,
    'scope',v_request.consent_scope
  );
end;
$function$;

commit;
