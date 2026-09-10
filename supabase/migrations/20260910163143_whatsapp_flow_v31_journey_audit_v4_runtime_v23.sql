-- V31 journey audit V4 separates technical health from owner-conversation readiness.
-- Prevents false negatives after runtime V23 while preserving human-control precedence.

create or replace function public.get_whatsapp_flow_v31_journey_audit_v4(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_preflight jsonb;
  v_journey jsonb;
  v_exchange_errors integer:=0;
  v_infra_healthy boolean:=false;
  v_homologation_ready boolean:=false;
begin
  v_base:=public.get_whatsapp_flow_v31_journey_audit_v2(p_session_id);
  if not coalesce((v_base->>'ok')::boolean,false) then
    return v_base||jsonb_build_object('audit_version','v4-runtime-v23');
  end if;

  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v3(p_session_id,null);
  v_journey:=public.get_whatsapp_flow_v31_commercial_journey_readiness_v1();
  v_exchange_errors:=coalesce((v_base#>>'{exchange,errors}')::integer,0);
  v_infra_healthy:=coalesce((v_journey->>'ok')::boolean,false) and v_exchange_errors=0;
  v_homologation_ready:=coalesce((v_preflight->>'ok')::boolean,false) and v_infra_healthy;

  return jsonb_set(
           jsonb_set(
             jsonb_set(v_base,'{preflight}',v_preflight,false),
             '{healthy}',to_jsonb(v_infra_healthy),false
           ),
           '{journey_readiness}',v_journey,true
         ) || jsonb_build_object(
           'homologation_ready',v_homologation_ready,
           'audit_version','v4-runtime-v23'
         );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_journey_audit_v4(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_journey_audit_v4(uuid) to service_role;
