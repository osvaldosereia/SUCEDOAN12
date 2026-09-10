-- WhatsApp Flow V31: session-scoped journey audit.
-- Keeps the existing V1 audit intact and replaces only the outbound projection
-- with jobs cryptographically tied to the exact Flow session token.

create or replace function public.get_whatsapp_flow_v31_journey_audit_v2(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_base jsonb;
  v_outbound jsonb := '[]'::jsonb;
  v_flow_jobs int := 0;
begin
  select * into s from public.experience_sessions where id=p_session_id;
  if not found then
    return jsonb_build_object('ok',false,'reason','session_not_found');
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if d.slug <> 'flow-cestas-comercial-v8-stable' then
    return jsonb_build_object('ok',false,'reason','not_v31_candidate','definition_slug',d.slug);
  end if;

  v_base := public.get_whatsapp_flow_v31_journey_audit_v1(p_session_id);

  select count(*)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'id',j.id,
           'job_type',j.job_type,
           'status',j.status,
           'http_status',j.dispatch_response_status,
           'sent_at',j.sent_at,
           'attempts',j.attempts,
           'dedupe_key',j.dedupe_key,
           'provider_message_id',j.provider_message_id,
           'last_error',left(coalesce(j.last_error,''),160)
         ) order by j.created_at),'[]'::jsonb)
    into v_flow_jobs,v_outbound
    from public.outbound_jobs j
   where j.conversation_id=s.conversation_id
     and j.created_at>=s.offered_at
     and j.payload->>'message_type'='interactive'
     and j.payload->'interactive'->>'type'='flow'
     and j.payload->'interactive'->'action'->'parameters'->>'flow_id'=d.provider_id
     and coalesce(
           encode(
             extensions.digest(
               coalesce(j.payload->'interactive'->'action'->'parameters'->>'flow_token',''),
               'sha256'
             ),
             'hex'
           ),
           ''
         )=coalesce(s.flow_token_hash,'');

  return v_base
    || jsonb_build_object(
         'outbound',v_outbound,
         'outbound_scope',jsonb_build_object(
           'mode','session_flow_token_hash',
           'flow_jobs',v_flow_jobs,
           'definition_slug',d.slug,
           'provider_id',d.provider_id
         ),
         'audit_version','v2'
       );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_journey_audit_v2(uuid) from public;
revoke all on function public.get_whatsapp_flow_v31_journey_audit_v2(uuid) from anon;
revoke all on function public.get_whatsapp_flow_v31_journey_audit_v2(uuid) from authenticated;
grant execute on function public.get_whatsapp_flow_v31_journey_audit_v2(uuid) to service_role;
