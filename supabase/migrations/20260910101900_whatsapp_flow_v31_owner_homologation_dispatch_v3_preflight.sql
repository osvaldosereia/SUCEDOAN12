create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v3(
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
  v_preflight jsonb;
  v_result jsonb;
  v_session_id uuid;
begin
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v1(null);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','homologation_preflight_failed','preflight',v_preflight);
  end if;

  v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v2(
    p_conversation_id,p_idempotency_key,p_body_text
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  v_session_id:=(v_result->>'session_id')::uuid;
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v1(v_session_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    raise exception 'post_dispatch_homologation_preflight_failed';
  end if;

  return v_result||jsonb_build_object('preflight',v_preflight,'dispatch_version','v3-preflight');
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v3(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v3(uuid,text,text) to service_role;
