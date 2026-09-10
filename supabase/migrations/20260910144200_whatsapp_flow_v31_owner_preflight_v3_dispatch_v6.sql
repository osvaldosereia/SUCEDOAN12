begin;

create or replace function public.get_whatsapp_flow_v31_homologation_preflight_v3(
  p_session_id uuid default null,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_conversation_id uuid:=p_conversation_id;
  v_mode text;
  v_service_open boolean:=false;
  v_handoff boolean:=false;
  v_extra jsonb;
  v_checks jsonb;
  v_ok boolean;
begin
  if v_conversation_id is null and p_session_id is not null then
    select s.conversation_id into v_conversation_id
    from public.experience_sessions s
    where s.id=p_session_id;
  end if;

  v_base:=public.get_whatsapp_flow_v31_homologation_preflight_v2(p_session_id,v_conversation_id);

  if v_conversation_id is not null then
    select c.mode,(c.service_window_expires_at>now())
      into v_mode,v_service_open
    from public.conversations c
    where c.id=v_conversation_id;

    select exists(
      select 1 from public.human_handoffs h
      where h.conversation_id=v_conversation_id
        and h.status in ('open','claimed')
    ) into v_handoff;
  end if;

  v_extra:=jsonb_build_array(
    jsonb_build_object('name','owner_conversation_ai','ok',v_conversation_id is not null and coalesce(v_mode,'')='ai','detail','mode='||coalesce(v_mode,'missing')),
    jsonb_build_object('name','owner_service_window_open','ok',v_conversation_id is not null and coalesce(v_service_open,false),'detail','service_open='||coalesce(v_service_open,false)::text),
    jsonb_build_object('name','owner_handoff_clear','ok',v_conversation_id is not null and not coalesce(v_handoff,false),'detail','active_handoff='||coalesce(v_handoff,false)::text)
  );

  v_checks:=coalesce(v_base->'checks','[]'::jsonb)||v_extra;
  v_ok:=coalesce((v_base->>'ok')::boolean,false)
        and v_conversation_id is not null
        and coalesce(v_mode,'')='ai'
        and coalesce(v_service_open,false)
        and not coalesce(v_handoff,false);

  return v_base||jsonb_build_object(
    'ok',v_ok,
    'checks',v_checks,
    'conversation_preflight_version','v3'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_homologation_preflight_v3(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_homologation_preflight_v3(uuid,uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v6(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_preflight jsonb;
  v_result jsonb;
  v_session_id uuid;
begin
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v3(null,p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'reason','owner_conversation_preflight_failed',
      'preflight',v_preflight,
      'dispatch_version','v6-conversation-guard'
    );
  end if;

  v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v5(
    p_conversation_id,p_idempotency_key,p_body_text
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result||jsonb_build_object('dispatch_version','v6-conversation-guard');
  end if;

  v_session_id:=(v_result->>'session_id')::uuid;
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v3(v_session_id,p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    raise exception 'v6_post_dispatch_conversation_preflight_failed';
  end if;

  return v_result||jsonb_build_object(
    'preflight_v3',v_preflight,
    'dispatch_version','v6-conversation-guard'
  );
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v6(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v6(uuid,text,text) to service_role;

commit;
