-- ANA própria — vincula um pedido ao outbound realmente aceito pela Meta.
-- A mensagem continua sendo revisada e enviada manualmente pelo atendente.

create or replace function public.ops2_ana_customer_confirmation_bind_outbound_v1(
  p_request_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
  v_request public.customer_profile_confirmation_requests_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_request_id is null or p_message_id is null then return jsonb_build_object('ok',false,'error','confirmation_binding_required'); end if;

  select * into v_request from public.customer_profile_confirmation_requests_v1 where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'error','confirmation_request_not_found'); end if;
  if v_request.status<>'pending' or v_request.expires_at<=now() then
    return jsonb_build_object('ok',false,'error','confirmation_request_not_pending');
  end if;
  if v_request.outbound_message_id=p_message_id then
    return jsonb_build_object('ok',true,'request_id',v_request.id,'message_id',p_message_id,'idempotent',true);
  end if;
  if v_request.outbound_message_id is not null then
    return jsonb_build_object('ok',false,'error','confirmation_already_bound');
  end if;

  select * into v_message from public.whatsapp_messages_v1 where id=p_message_id;
  if not found or v_message.direction<>'outbound' or v_message.provider<>'meta'
    or v_message.conversation_id<>v_request.conversation_id or v_message.sent_at is null
    or v_message.sent_at<v_request.requested_at then
    return jsonb_build_object('ok',false,'error','confirmation_outbound_message_mismatch');
  end if;

  update public.customer_profile_confirmation_requests_v1
    set outbound_message_id=p_message_id,updated_at=now()
    where id=v_request.id and status='pending' and outbound_message_id is null;

  return jsonb_build_object('ok',true,'request_id',v_request.id,'message_id',p_message_id,'idempotent',false);
end;
$function$;

revoke all on function public.ops2_ana_customer_confirmation_bind_outbound_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ops2_ana_customer_confirmation_bind_outbound_v1(uuid,uuid) to authenticated,service_role;

