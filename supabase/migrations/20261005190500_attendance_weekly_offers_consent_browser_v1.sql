begin;

create or replace function public.ops2_admin_attendance_weekly_consent_state_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_request public.marketing_weekly_consent_requests_v1%rowtype;
  v_event public.marketing_consent_events_v1%rowtype;
  v_window_open boolean:=false;
  v_state text:='never_asked';
begin
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  select * into v_conversation from public.conversations where id=p_conversation_id limit 1;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  v_window_open:=v_conversation.last_inbound_at is not null and now()<v_conversation.last_inbound_at+interval '24 hours';
  if v_conversation.customer_id is null then
    return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'customer_linked',false,'consent_state','unlinked','can_ask',false,'service_window_open',v_window_open);
  end if;

  select e.* into v_event
  from public.marketing_consent_events_v1 e
  where e.customer_id=v_conversation.customer_id
    and coalesce(e.metadata->>'scope','')='weekly_offers_coupons'
  order by e.occurred_at desc,e.created_at desc,e.id desc
  limit 1;

  select r.* into v_request
  from public.marketing_weekly_consent_requests_v1 r
  where r.customer_id=v_conversation.customer_id and r.consent_scope='weekly_offers_coupons'
  order by r.created_at desc
  limit 1;

  if v_event.id is not null then v_state:=v_event.decision;
  elsif v_request.id is not null and v_request.status='sent' then v_state:='pending';
  elsif v_request.id is not null then v_state:=v_request.status;
  end if;

  return jsonb_build_object(
    'ok',true,'conversation_id',p_conversation_id,'customer_linked',true,
    'customer_id',v_conversation.customer_id,'consent_state',v_state,
    'service_window_open',v_window_open,
    'can_ask',v_window_open and v_event.id is null and (v_request.id is null or v_request.status in ('prepared','send_failed')),
    'request_id',v_request.id,'asked_at',v_request.asked_at,'responded_at',coalesce(v_event.occurred_at,v_request.responded_at),
    'consent_text_version',coalesce(v_event.consent_text_version,v_request.consent_text_version),
    'latest_event_id',v_event.id,'latest_source',v_event.source
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_weekly_consent_prepare_browser_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  return public.ops2_admin_attendance_weekly_consent_prepare_v1(p_conversation_id);
end;
$function$;

create or replace function public.ops2_admin_attendance_weekly_consent_mark_sent_browser_v1(p_request_id uuid,p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
  v_request public.marketing_weekly_consent_requests_v1%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_request_id is null or p_outbox_id is null then return jsonb_build_object('ok',false,'error','invalid_consent_send_reference'); end if;

  select * into v_request from public.marketing_weekly_consent_requests_v1 where id=p_request_id limit 1;
  if not found then return jsonb_build_object('ok',false,'error','weekly_consent_request_not_found'); end if;

  select * into v_outbox from public.whatsapp_outbox_v1 where id=p_outbox_id limit 1;
  if not found then return jsonb_build_object('ok',false,'error','weekly_consent_outbox_not_found'); end if;
  if v_outbox.conversation_id is distinct from v_request.conversation_id then return jsonb_build_object('ok',false,'error','weekly_consent_outbox_mismatch'); end if;
  if v_outbox.status<>'sent' then return jsonb_build_object('ok',false,'error','weekly_consent_outbox_not_sent'); end if;
  if coalesce(v_outbox.payload->>'text','') is distinct from v_request.consent_text_snapshot then
    return jsonb_build_object('ok',false,'error','weekly_consent_text_mismatch');
  end if;

  return public.ops2_admin_attendance_weekly_consent_mark_sent_v1(p_request_id,p_outbox_id,v_outbox.provider_message_id);
end;
$function$;

revoke all on function public.ops2_admin_attendance_weekly_consent_prepare_browser_v1(uuid) from public,anon;
revoke all on function public.ops2_admin_attendance_weekly_consent_mark_sent_browser_v1(uuid,uuid) from public,anon;
grant execute on function public.ops2_admin_attendance_weekly_consent_prepare_browser_v1(uuid) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_weekly_consent_mark_sent_browser_v1(uuid,uuid) to authenticated,service_role;

commit;
