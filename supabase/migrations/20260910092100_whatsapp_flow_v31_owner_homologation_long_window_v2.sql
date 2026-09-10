create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v2(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_session_id uuid;
  v_expires_at timestamptz;
  v_definition_id uuid;
begin
  v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v1(
    p_conversation_id,p_idempotency_key,p_body_text
  );

  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  v_session_id:=(v_result->>'session_id')::uuid;
  select id into v_definition_id
    from public.experience_definitions
   where slug='flow-cestas-comercial-v8-stable'
   limit 1;

  if v_definition_id is null then
    raise exception 'v31_candidate_definition_missing';
  end if;

  update public.experience_sessions s
     set expires_at=greatest(s.expires_at,now()+interval '12 hours'),
         context=coalesce(s.context,'{}'::jsonb)||jsonb_build_object(
           'homologation_window','12h',
           'homologation_dispatch_version','v2'
         ),
         updated_at=now()
   where s.id=v_session_id
     and s.definition_id=v_definition_id
     and s.conversation_id=p_conversation_id
     and s.status in ('offered','open')
     and coalesce((s.context->>'homologation_test')::boolean,false)
     and coalesce((s.context->>'requested_by_owner')::boolean,false);

  if not found then
    raise exception 'homologation_v2_session_guard_failed';
  end if;

  select expires_at into v_expires_at
    from public.experience_sessions
   where id=v_session_id;

  return v_result||jsonb_build_object(
    'expires_at',v_expires_at,
    'homologation_window','12h',
    'dispatch_version','v2'
  );
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v2(uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v2(uuid,text,text) to service_role;
