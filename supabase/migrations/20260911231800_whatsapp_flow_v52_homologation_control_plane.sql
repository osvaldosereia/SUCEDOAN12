begin;

create or replace function public.get_whatsapp_flow_v52_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v51 jsonb;
  v49 jsonb;
  eligible_count integer := 0;
  active_homologation_sessions integer := 0;
  readiness_ok boolean := false;
  evidence_ok boolean := false;
  safe_to_launch boolean := false;
  next_action text;
begin
  v51 := public.get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1();
  v49 := public.get_whatsapp_flow_v49_physical_terminal_evidence_v1();

  select count(*)::integer
    into eligible_count
  from public.conversations c
  where c.service_window_expires_at > now()
    and c.mode = 'ai'
    and nullif(c.wa_contact_e164,'') is not null
    and exists (
      select 1
      from public.whatsapp_test_allowlist w
      where w.phone_e164 = c.wa_contact_e164
        and w.enabled
        and w.purpose = 'controlled_live_homologation'
        and (w.expires_at is null or w.expires_at > now())
    )
    and not exists (
      select 1
      from public.human_handoffs h
      where h.conversation_id = c.id
        and h.status in ('open','claimed')
    );

  select count(*)::integer
    into active_homologation_sessions
  from public.experience_sessions s
  join public.experience_definitions d on d.id = s.definition_id
  where d.slug = 'flow-cestas-comercial-v8-stable'
    and s.status in ('offered','open')
    and s.expires_at > now()
    and coalesce((s.context->>'homologation_test')::boolean,false)
    and coalesce((s.context->>'requested_by_owner')::boolean,false);

  readiness_ok := coalesce((v51->>'ok')::boolean,false);
  evidence_ok := coalesce((v49->>'ok')::boolean,false);

  safe_to_launch := readiness_ok
    and not evidence_ok
    and eligible_count = 1
    and active_homologation_sessions = 0;

  if evidence_ok then
    next_action := 'physical_terminal_evidence_complete';
  elsif not readiness_ok then
    next_action := 'fix_runtime_readiness';
  elsif active_homologation_sessions > 0 then
    next_action := 'continue_existing_owner_homologation_session';
  elsif eligible_count = 0 then
    next_action := 'wait_for_owner_service_window';
  elsif eligible_count = 1 then
    next_action := 'owner_conversation_ready_for_v8';
  else
    next_action := 'select_one_owner_conversation_explicitly';
  end if;

  return jsonb_build_object(
    'ok', readiness_ok,
    'runtime_readiness_ok', readiness_ok,
    'physical_evidence_ok', evidence_ok,
    'physical_next_required', coalesce(v49->>'next_required',''),
    'eligible_owner_conversations', eligible_count,
    'active_owner_homologation_sessions', active_homologation_sessions,
    'safe_to_launch_owner_v8', safe_to_launch,
    'next_action', next_action,
    'dispatch_version', coalesce(v51->>'dispatch_version',''),
    'runtime_handler', coalesce(v51->>'runtime_handler',''),
    'edge_version', coalesce((v51->>'edge_version')::integer,0),
    'gates', coalesce(v49->'gates','{}'::jsonb),
    'writes_performed', false,
    'physical_send_performed', false,
    'control_plane_version', 'v52-read-only'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v52_homologation_control_plane_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v52_homologation_control_plane_v1() to service_role;

commit;
