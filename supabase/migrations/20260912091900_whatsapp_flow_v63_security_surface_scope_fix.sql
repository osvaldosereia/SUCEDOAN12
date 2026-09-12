create or replace function public.get_whatsapp_flow_v62_security_surface_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_exposed_count integer := 0;
  v_exposed jsonb := '[]'::jsonb;
  v_control jsonb;
  v_readiness jsonb;
begin
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'function', q.proname,
    'args', q.args,
    'anon_exec', q.anon_exec,
    'authenticated_exec', q.auth_exec
  ) order by q.proname), '[]'::jsonb)
  into v_exposed_count, v_exposed
  from (
    select p.oid,
           p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
           pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
           pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proname ilike '%whatsapp%'
        or p.proname ilike '%basket%'
        or p.proname ilike '%nfm%'
        or p.proname ilike '%outbound%'
      )
      and (
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) q;

  v_control := public.get_whatsapp_flow_v57_homologation_control_plane_v1();
  v_readiness := public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1();

  return jsonb_build_object(
    'ok',
      v_exposed_count = 0
      and coalesce((v_control->>'ok')::boolean, false)
      and coalesce((v_readiness->>'ok')::boolean, false),
    'readiness_version', 'v63-security-surface-scope-v1',
    'security_definer_client_exposure_count', v_exposed_count,
    'security_definer_client_exposures', v_exposed,
    'control_plane_ok', coalesce((v_control->>'ok')::boolean, false),
    'terminal_readiness_ok', coalesce((v_readiness->>'ok')::boolean, false),
    'physical_next_required', v_control->>'physical_next_required',
    'safe_to_launch_owner_v10', coalesce((v_control->>'safe_to_launch_owner_v10')::boolean, false),
    'eligible_owner_conversations', coalesce((v_control->>'eligible_owner_conversations')::integer, 0),
    'active_owner_homologation_sessions', coalesce((v_control->>'active_owner_homologation_sessions')::integer, 0),
    'gates', v_control->'gates',
    'writes_performed', false
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() from public;
revoke all on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() from anon;
revoke all on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() from authenticated;
grant execute on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() to service_role;
