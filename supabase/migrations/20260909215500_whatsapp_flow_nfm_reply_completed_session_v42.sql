-- The generic Data Exchange token resolver intentionally rejects completed sessions.
-- nfm_reply is the terminal return after the Flow has completed, so it validates the
-- token hash directly and allows only the final completion bridge for completed sessions.

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
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_duplicate boolean:=false;
begin
  if length(v_token)<32 or length(v_token)>200 then
    return jsonb_build_object('ok',false,'reason','invalid_flow_token');
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into s
  from public.experience_sessions
  where flow_token_hash=v_hash;

  if not found then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch');
  end if;
  if s.status not in ('offered','open','completed') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id);
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if not found then return jsonb_build_object('ok',false,'reason','flow_definition_not_found'); end if;
  v_definition:=coalesce(d.slug,'');

  if v_definition not in (
    'flow-cestas-comercial-v1',
    'flow-cestas-comercial-v2',
    'flow-cestas-comercial-v3',
    'flow-cestas-comercial-v4'
  ) then
    return jsonb_build_object('ok',false,'reason','unsupported_flow_definition');
  end if;

  if p_message_id is not null then
    select exists(
      select 1
      from public.experience_events e
      where e.session_id=s.id
        and e.event_type='flow_nfm_reply'
        and e.event_data->>'message_id'=p_message_id::text
    ) into v_duplicate;
  end if;

  begin
    v_order_id:=nullif(trim(coalesce(s.context->>'flow_order_id','')),'')::uuid;
  exception when others then
    v_order_id:=null;
  end;

  if v_order_id is not null then
    select * into v_order
    from public.orders
    where id=v_order_id
      and conversation_id=p_conversation_id
      and status='confirmed'
      and confirmed_at is not null
      and coalesce(total,0)>0;
    if not found then v_order_id:=null; end if;
  end if;

  if not v_duplicate then
    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,event_data
    ) values (
      p_conversation_id,s.id,s.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
        'message_id',p_message_id,
        'action',v_action,
        'definition_slug',v_definition,
        'session_status',s.status,
        'has_confirmed_order',v_order_id is not null,
        'order_id',v_order_id,
        'return_to_chat',true
      )
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'definition_slug',v_definition,
    'action',v_action,
    'order_id',v_order_id,
    'return_to_chat',true,
    'duplicate',v_duplicate,
    'location_required',(v_order_id is not null and not v_duplicate),
    'reply_text',case
      when v_duplicate then null
      when v_order_id is not null then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍'
      else 'Recebi suas escolhas. Vamos continuar por aqui.'
    end
  );
end;
$$;

revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;
