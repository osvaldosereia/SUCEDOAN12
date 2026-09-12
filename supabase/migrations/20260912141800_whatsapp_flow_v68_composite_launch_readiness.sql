begin;

create or replace function public.get_whatsapp_flow_v68_launch_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  v60 jsonb;
  v65 jsonb;
  v67 jsonb;
  v_ok boolean;
begin
  v60 := public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1();
  v65 := public.get_whatsapp_flow_v65_payment_rules_readiness_v1();
  v67 := public.get_whatsapp_flow_v67_terminal_handoff_readiness_v1();
  v_ok := coalesce((v60->>'ok')::boolean,false)
    and coalesce((v65->>'ok')::boolean,false)
    and coalesce((v67->>'ok')::boolean,false);

  return jsonb_build_object(
    'ok', v_ok,
    'readiness_version', 'v68-launch-readiness-v1',
    'terminal_commercial_ready', coalesce((v60->>'ok')::boolean,false),
    'payment_rules_ready', coalesce((v65->>'ok')::boolean,false),
    'atomic_terminal_handoff_ready', coalesce((v67->>'ok')::boolean,false),
    'max_products_per_query', coalesce((v60->>'max_products_per_query')::integer,20),
    'full_catalog_loaded', coalesce((v60->>'full_catalog_loaded')::boolean,false),
    'ai_authoritative_for_catalog', coalesce((v60->>'ai_authoritative_for_catalog')::boolean,false),
    'component_prices_visible', coalesce((v60->>'component_prices_visible')::boolean,false),
    'payment_on_delivery_only', coalesce((v60->>'payment_on_delivery_only')::boolean,false),
    'physical_next_required', v67->>'physical_next_required',
    'eligible_owner_conversations', v67->'eligible_owner_conversations',
    'writes_performed', false,
    'gates', v67->'gates'
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v68_launch_readiness_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v68_launch_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v9(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v8 jsonb;
  v68 jsonb;
  v_ok boolean;
begin
  v8 := public.get_whatsapp_flow_owner_homologation_preflight_v8(p_conversation_id);
  v68 := public.get_whatsapp_flow_v68_launch_readiness_v1();
  v_ok := coalesce((v8->>'ok')::boolean,false)
    and coalesce((v68->>'ok')::boolean,false);

  return v8 || jsonb_build_object(
    'ok', v_ok,
    'preflight_version', 'v9-v68-composite-launch-readiness',
    'terminal_commercial_ready', coalesce((v68->>'terminal_commercial_ready')::boolean,false),
    'payment_rules_ready', coalesce((v68->>'payment_rules_ready')::boolean,false),
    'atomic_terminal_handoff_ready', coalesce((v68->>'atomic_terminal_handoff_ready')::boolean,false),
    'launch_readiness_version', v68->>'readiness_version',
    'writes_performed', false
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v9(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v9(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v12'));
  preflight := public.get_whatsapp_flow_owner_homologation_preflight_v9(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'owner_conversation_preflight_v9_failed',
      'preflight', preflight,
      'dispatch_version', 'v12-v68-composite-readiness-runtime-v26-edge49'
    );
  end if;
  result := public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(
    p_conversation_id, p_idempotency_key, p_body_text
  );
  return result || jsonb_build_object(
    'preflight_v9', preflight,
    'serialized_launch', true,
    'runtime_handler', 'v26',
    'edge_version', 49,
    'dispatch_version', 'v12-v68-composite-readiness-runtime-v26-edge49'
  );
end;
$function$;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text) to service_role;
revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v68_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  launch jsonb;
  eligible_count integer := 0;
  active_count integer := 0;
  evidence_ok boolean := false;
  contamination boolean := false;
  v11_service_role_disabled boolean := false;
  v12_exists boolean := false;
  safe_v12 boolean := false;
  next_action text;
begin
  base := public.get_whatsapp_flow_v64_homologation_control_plane_v1();
  launch := public.get_whatsapp_flow_v68_launch_readiness_v1();
  eligible_count := coalesce((base->>'eligible_owner_conversations')::integer,0);
  active_count := coalesce((base->>'active_owner_homologation_sessions')::integer,0);
  evidence_ok := coalesce((base->>'physical_evidence_ok')::boolean,false);
  contamination := coalesce((base->>'order_contamination_detected')::boolean,false);
  v12_exists := to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text)') is not null;
  v11_service_role_disabled := not pg_catalog.has_function_privilege('service_role','public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text)','EXECUTE');

  safe_v12 := coalesce((base->>'runtime_readiness_ok')::boolean,false)
    and coalesce((launch->>'ok')::boolean,false)
    and not evidence_ok
    and not contamination
    and eligible_count = 1
    and active_count = 0
    and v12_exists
    and v11_service_role_disabled;

  if contamination then
    next_action := 'investigate_physical_order_contamination';
  elsif evidence_ok then
    next_action := 'physical_terminal_no_order_evidence_complete';
  elsif not coalesce((launch->>'ok')::boolean,false) then
    next_action := 'fix_composite_launch_readiness';
  elsif not v11_service_role_disabled then
    next_action := 'disable_legacy_owner_launcher_v11';
  elsif active_count > 0 then
    next_action := 'continue_existing_owner_homologation_session';
  elsif eligible_count = 0 then
    next_action := 'wait_for_owner_service_window';
  elsif eligible_count = 1 then
    next_action := 'owner_conversation_ready_for_v12';
  else
    next_action := 'select_one_owner_conversation_explicitly';
  end if;

  return base || jsonb_build_object(
    'launch_readiness_ok', coalesce((launch->>'ok')::boolean,false),
    'launch_readiness_version', launch->>'readiness_version',
    'terminal_commercial_ready', coalesce((launch->>'terminal_commercial_ready')::boolean,false),
    'payment_rules_ready', coalesce((launch->>'payment_rules_ready')::boolean,false),
    'atomic_terminal_handoff_ready', coalesce((launch->>'atomic_terminal_handoff_ready')::boolean,false),
    'safe_to_launch_owner_v11', false,
    'safe_to_launch_owner_v12', safe_v12,
    'direct_v11_service_role_disabled', v11_service_role_disabled,
    'launcher_preflight_version', 'v9-v68-composite-launch-readiness',
    'dispatch_version', 'v12-v68-composite-readiness-runtime-v26-edge49',
    'next_action', next_action,
    'writes_performed', false,
    'control_plane_version', 'v68-composite-launch-readiness'
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v68_homologation_control_plane_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v68_homologation_control_plane_v1() to service_role;

commit;
