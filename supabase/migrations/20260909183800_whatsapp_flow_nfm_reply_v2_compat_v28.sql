create or replace function public.process_whatsapp_flow_nfm_reply_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_response jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_resolved jsonb;
  v_session uuid;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id text;
begin
  if v_token='' then return jsonb_build_object('ok',false,'reason','flow_token_missing'); end if;
  v_resolved:=public.resolve_whatsapp_flow_token_v1(v_token);
  if not coalesce((v_resolved->>'ok')::boolean,false) then return v_resolved; end if;
  if (v_resolved->>'conversation_id')::uuid is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch'); end if;
  v_session:=(v_resolved->>'session_id')::uuid;
  v_definition:=coalesce(v_resolved->>'definition_slug','');
  if v_definition not in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2') then
    return jsonb_build_object('ok',false,'reason','unsupported_flow_definition');
  end if;

  select context->>'flow_order_id' into v_order_id from public.experience_sessions where id=v_session;
  insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data)
  select es.conversation_id,es.id,es.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
    'message_id',p_message_id,
    'action',v_action,
    'definition_slug',v_definition,
    'has_order',v_order_id is not null,
    'return_to_chat',true
  ) from public.experience_sessions es where es.id=v_session;

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session,
    'definition_slug',v_definition,
    'action',v_action,
    'order_id',v_order_id,
    'return_to_chat',true,
    'location_required',v_order_id is not null,
    'reply_text',case when v_order_id is not null then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍' else 'Recebi suas escolhas. Vamos continuar por aqui.' end
  );
end;
$$;

revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;
