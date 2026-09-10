-- V31 release gate: exige explicitamente runtime V24 + Edge 45 no preflight owner-only.

create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v6(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb:=public.get_whatsapp_flow_v31_full_release_readiness_v5(p_session_id);
  v_conversation_id uuid;
  pre jsonb;
  pre_ok boolean:=false;
  checks jsonb:=coalesce(base->'checks','[]'::jsonb);
  passed integer:=coalesce((base->>'passed')::integer,0);
  total integer:=coalesce((base->>'total')::integer,0)+1;
  healthy boolean;
begin
  select conversation_id into v_conversation_id from public.experience_sessions where id=p_session_id;
  pre:=public.get_whatsapp_flow_v31_homologation_preflight_v4(p_session_id,v_conversation_id);
  pre_ok:=coalesce((pre->>'ok')::boolean,false);
  if pre_ok then passed:=passed+1; end if;
  healthy:=coalesce((base->>'healthy')::boolean,false) and pre_ok;
  checks:=checks||jsonb_build_array(jsonb_build_object('name','owner_runtime_v24_preflight','ok',pre_ok));
  return base||jsonb_build_object(
    'version','v6-runtime-v24-edge45',
    'checks',checks,
    'passed',passed,
    'total',total,
    'healthy',healthy,
    'homologation_ready',healthy and coalesce((base->>'homologation_ready')::boolean,false),
    'ok',healthy and coalesce((base->>'homologation_ready')::boolean,false),
    'runtime_preflight',pre,
    'runtime_handler','v24',
    'edge_version',45,
    'writes_executed',false,
    'orders_created',false
  );
end
$function$;

revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v6(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v6(uuid) to service_role;
