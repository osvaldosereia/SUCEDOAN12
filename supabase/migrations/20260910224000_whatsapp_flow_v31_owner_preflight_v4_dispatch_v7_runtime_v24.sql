-- V31 owner-only homologation: runtime V24 / Edge 45.
-- Mantém gates globais fechados e usa apenas a fundação owner-only já protegida.

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'edge_version',45,
  'handler_version','v24',
  'commercial_handler','handle_whatsapp_flow_commercial_exchange_v24',
  'implementation_stage','v31_v24_preview_integrity_ready'
),updated_at=now()
where slug='flow-cestas-comercial-v8-stable';

create or replace function public.get_whatsapp_flow_v31_homologation_preflight_v4(
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
  base jsonb:=public.get_whatsapp_flow_v31_homologation_preflight_v3(p_session_id,p_conversation_id);
  d public.experience_definitions%rowtype;
  extra jsonb;
  checks jsonb;
  runtime_ok boolean:=false;
  metadata_ok boolean:=false;
  edge_ok boolean:=false;
  all_ok boolean:=false;
begin
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  runtime_ok:=to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v24(uuid,uuid,text,text,jsonb)') is not null;
  metadata_ok:=coalesce(d.metadata->>'handler_version','')='v24'
               and coalesce(d.metadata->>'commercial_handler','')='handle_whatsapp_flow_commercial_exchange_v24';
  edge_ok:=coalesce((d.metadata->>'edge_version')::int,0)=45;
  extra:=jsonb_build_array(
    jsonb_build_object('name','runtime_v24_present','ok',runtime_ok,'detail','handle_whatsapp_flow_commercial_exchange_v24'),
    jsonb_build_object('name','candidate_metadata_v24','ok',metadata_ok,'detail',coalesce(d.metadata->>'handler_version','missing')),
    jsonb_build_object('name','data_exchange_edge_v45','ok',edge_ok,'detail','edge_version='||coalesce(d.metadata->>'edge_version','missing'))
  );
  checks:=coalesce(base->'checks','[]'::jsonb)||extra;
  all_ok:=coalesce((base->>'ok')::boolean,false) and runtime_ok and metadata_ok and edge_ok;
  return base||jsonb_build_object(
    'ok',all_ok,
    'checks',checks,
    'runtime_handler','v24',
    'edge_version',45,
    'conversation_preflight_version','v4-runtime-v24'
  );
end
$function$;

revoke all on function public.get_whatsapp_flow_v31_homologation_preflight_v4(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_homologation_preflight_v4(uuid,uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v7(
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
  v_lease jsonb;
  v_preflight jsonb;
  v_result jsonb;
  v_session_id uuid;
begin
  v_lease:=public.renew_whatsapp_flow_owner_homologation_lease_v1(p_conversation_id);
  if not coalesce((v_lease->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','homologation_lease_failed','lease',v_lease,'dispatch_version','v7-runtime-v24');
  end if;

  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v4(null,p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','owner_conversation_preflight_failed','lease',v_lease,'preflight',v_preflight,'dispatch_version','v7-runtime-v24');
  end if;

  -- V2 já contém emissão owner-only, allowlist, interactive.type=flow e dispatcher fail-closed.
  -- V7 evita apenas os wrappers V3/V5, cujos diagnósticos históricos congelam nomes de handlers antigos.
  v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v2(
    p_conversation_id,p_idempotency_key,p_body_text
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result||jsonb_build_object('lease',v_lease,'preflight_v4',v_preflight,'dispatch_version','v7-runtime-v24');
  end if;

  v_session_id:=(v_result->>'session_id')::uuid;
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v4(v_session_id,p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    raise exception 'v7_post_dispatch_runtime_v24_preflight_failed';
  end if;

  return v_result||jsonb_build_object(
    'lease',v_lease,
    'preflight_v4',v_preflight,
    'dispatch_version','v7-runtime-v24'
  );
end
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v7(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v7(uuid,text,text) to service_role;
