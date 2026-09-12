begin;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v6(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  evidence jsonb;
  eligible_count integer := 0;
  active_count integer := 0;
  selected_is_unique boolean := false;
  evidence_incomplete boolean := false;
  all_ok boolean := false;
begin
  base := public.get_whatsapp_flow_owner_homologation_preflight_v5(p_conversation_id);
  evidence := public.get_whatsapp_flow_v49_physical_terminal_evidence_v1();

  select count(*)::integer
    into eligible_count
  from public.conversations c
  where c.service_window_expires_at > now()
    and c.mode = 'ai'
    and nullif(c.wa_contact_e164,'') is not null
    and exists (
      select 1 from public.whatsapp_test_allowlist w
      where w.phone_e164 = c.wa_contact_e164
        and w.enabled
        and w.purpose = 'controlled_live_homologation'
        and (w.expires_at is null or w.expires_at > now())
    )
    and not exists (
      select 1 from public.human_handoffs h
      where h.conversation_id = c.id
        and h.status in ('open','claimed')
    );

  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.service_window_expires_at > now()
      and c.mode = 'ai'
      and nullif(c.wa_contact_e164,'') is not null
      and exists (
        select 1 from public.whatsapp_test_allowlist w
        where w.phone_e164 = c.wa_contact_e164
          and w.enabled
          and w.purpose = 'controlled_live_homologation'
          and (w.expires_at is null or w.expires_at > now())
      )
      and not exists (
        select 1 from public.human_handoffs h
        where h.conversation_id = c.id
          and h.status in ('open','claimed')
      )
  ) and eligible_count = 1
  into selected_is_unique;

  select count(*)::integer
    into active_count
  from public.experience_sessions s
  join public.experience_definitions d on d.id = s.definition_id
  where d.slug = 'flow-cestas-comercial-v8-stable'
    and s.status in ('offered','open')
    and s.expires_at > now()
    and coalesce((s.context->>'homologation_test')::boolean,false)
    and coalesce((s.context->>'requested_by_owner')::boolean,false);

  evidence_incomplete := not coalesce((evidence->>'ok')::boolean,false);
  all_ok := coalesce((base->>'ok')::boolean,false)
    and selected_is_unique
    and active_count = 0
    and evidence_incomplete;

  return jsonb_build_object(
    'ok', all_ok,
    'base_preflight_ok', coalesce((base->>'ok')::boolean,false),
    'exactly_one_eligible_owner_conversation', eligible_count = 1,
    'selected_conversation_is_unique_eligible', selected_is_unique,
    'active_owner_homologation_sessions', active_count,
    'no_active_owner_homologation_session', active_count = 0,
    'physical_evidence_incomplete', evidence_incomplete,
    'physical_next_required', coalesce(evidence->>'next_required',''),
    'owner_only', true,
    'writes_performed', false,
    'preflight_version', 'v6-serialized-launch-guard'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v6(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v6(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  preflight jsonb;
  result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v9'));

  preflight := public.get_whatsapp_flow_owner_homologation_preflight_v6(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'owner_conversation_preflight_v6_failed',
      'preflight', preflight,
      'dispatch_version', 'v9-serialized-runtime-v26-edge49'
    );
  end if;

  result := public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(
    p_conversation_id, p_idempotency_key, p_body_text
  );

  return result || jsonb_build_object(
    'preflight_v6', preflight,
    'serialized_launch', true,
    'runtime_handler', 'v26',
    'edge_version', 49,
    'dispatch_version', 'v9-serialized-runtime-v26-edge49'
  );
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text) to service_role;

revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v53_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v52 jsonb;
  eligible_count integer := 0;
  active_count integer := 0;
  safe_v9 boolean := false;
  next_action text;
begin
  v52 := public.get_whatsapp_flow_v52_homologation_control_plane_v1();
  eligible_count := coalesce((v52->>'eligible_owner_conversations')::integer,0);
  active_count := coalesce((v52->>'active_owner_homologation_sessions')::integer,0);

  safe_v9 := coalesce((v52->>'runtime_readiness_ok')::boolean,false)
    and not coalesce((v52->>'physical_evidence_ok')::boolean,false)
    and eligible_count = 1
    and active_count = 0
    and to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text)') is not null;

  if coalesce((v52->>'physical_evidence_ok')::boolean,false) then
    next_action := 'physical_terminal_evidence_complete';
  elsif not coalesce((v52->>'runtime_readiness_ok')::boolean,false) then
    next_action := 'fix_runtime_readiness';
  elsif active_count > 0 then
    next_action := 'continue_existing_owner_homologation_session';
  elsif eligible_count = 0 then
    next_action := 'wait_for_owner_service_window';
  elsif eligible_count = 1 then
    next_action := 'owner_conversation_ready_for_v9';
  else
    next_action := 'select_one_owner_conversation_explicitly';
  end if;

  return v52 || jsonb_build_object(
    'safe_to_launch_owner_v8', false,
    'safe_to_launch_owner_v9', safe_v9,
    'next_action', next_action,
    'dispatch_version', 'v9-serialized-runtime-v26-edge49',
    'direct_v8_service_role_disabled', true,
    'control_plane_version', 'v53-serialized-launch'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v53_homologation_control_plane_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v53_homologation_control_plane_v1() to service_role;

commit;
