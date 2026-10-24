-- ANA própria — confirmações/correções ligadas ao inbound canônico da Meta.
-- A RPC só muda o estado do pedido e nunca grava o cadastro do cliente.

create unique index if not exists customer_profile_confirmation_inbound_message_unique_v1
  on public.customer_profile_confirmation_requests_v1(confirmation_inbound_message_id)
  where confirmation_inbound_message_id is not null;

create or replace function public.ops2_ana_customer_confirmation_apply_signal_v1(
  p_request_id uuid,
  p_message_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request public.customer_profile_confirmation_requests_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_outbound public.whatsapp_messages_v1%rowtype;
  v_decision text:=lower(btrim(coalesce(p_decision,'')));
  v_target_status text;
begin
  if coalesce(auth.role(),'')<>'service_role' then return jsonb_build_object('ok',false,'error','service_role_required'); end if;
  if p_request_id is null or p_message_id is null then return jsonb_build_object('ok',false,'error','confirmation_signal_required'); end if;
  if v_decision not in ('confirm','correct') then return jsonb_build_object('ok',false,'error','confirmation_decision_invalid'); end if;

  select * into v_request from public.customer_profile_confirmation_requests_v1 where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'error','confirmation_request_not_found'); end if;
  v_target_status:=case when v_decision='confirm' then 'confirmed' else 'corrected' end;
  if v_request.status=v_target_status and v_request.confirmation_inbound_message_id=p_message_id then
    return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_request.status,'idempotent',true);
  end if;
  if v_request.status<>'pending' then return jsonb_build_object('ok',false,'error','confirmation_request_not_pending'); end if;

  select * into v_message from public.whatsapp_messages_v1 where id=p_message_id;
  if not found or v_message.direction<>'inbound' or v_message.conversation_id<>v_request.conversation_id then
    return jsonb_build_object('ok',false,'error','confirmation_message_mismatch');
  end if;
  if v_request.expires_at<=now() or v_message.received_at is null or v_message.received_at>v_request.expires_at then
    return jsonb_build_object('ok',false,'error','confirmation_request_expired');
  end if;
  if v_request.outbound_message_id is null then return jsonb_build_object('ok',false,'error','confirmation_request_not_sent'); end if;
  select * into v_outbound from public.whatsapp_messages_v1 where id=v_request.outbound_message_id;
  if not found or v_outbound.direction<>'outbound' or v_outbound.conversation_id<>v_request.conversation_id then
    return jsonb_build_object('ok',false,'error','confirmation_outbound_message_mismatch');
  end if;
  if v_message.received_at<=coalesce(v_outbound.sent_at,v_outbound.created_at) then
    return jsonb_build_object('ok',false,'error','confirmation_message_before_request');
  end if;

  update public.customer_profile_confirmation_requests_v1
  set status=v_target_status,confirmation_inbound_message_id=p_message_id,completed_at=now(),updated_at=now()
  where id=p_request_id and status='pending';

  if v_decision='correct' then
    update public.customer_profile_suggestions_v1
    set status='expired',updated_at=now()
    where id=any(v_request.suggestion_ids) and conversation_id=v_request.conversation_id and status='pending';
  end if;

  return jsonb_build_object('ok',true,'request_id',p_request_id,'message_id',p_message_id,'status',v_target_status,'idempotent',false);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','confirmation_message_already_used');
end;
$function$;

revoke all on function public.ops2_ana_customer_confirmation_apply_signal_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_ana_customer_confirmation_apply_signal_v1(uuid,uuid,text) to service_role;

