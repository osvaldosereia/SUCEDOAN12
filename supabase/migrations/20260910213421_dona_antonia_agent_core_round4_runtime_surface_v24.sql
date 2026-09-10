begin;

do $$
begin
  if not exists (
    select 1
    from public.ai_action_registry
    where action_key='wa_start_order_checkout'
      and enabled=true
      and execution_mode='observe'
      and risk_class='reversible_write'
  ) then
    raise exception 'wa_start_order_checkout contract not ready for runtime surface';
  end if;
end
$$;

update public.ai_action_registry
set metadata = coalesce(metadata,'{}'::jsonb)
  || jsonb_build_object(
    'edge_allowlist_pending',false,
    'executor_mapping_pending',false,
    'edge_surface_verified_version',8,
    'observe_simulation_only',true,
    'runtime_surface_verified_at',now()
  ),
  updated_at=now()
where action_key='wa_start_order_checkout';

create or replace function public.get_agent_core_round4_runtime_surface_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  a public.ai_action_registry%rowtype;
  parity jsonb;
begin
  select * into a
  from public.ai_action_registry
  where action_key='wa_start_order_checkout';

  parity:=public.get_agent_core_round4_action_tool_parity_v1(168);

  return jsonb_build_object(
    'version',1,
    'tool','wa_start_order_checkout',
    'tool_present',a.action_key is not null,
    'enabled',coalesce(a.enabled,false),
    'execution_mode',coalesce(a.execution_mode,''),
    'risk_class',coalesce(a.risk_class,''),
    'edge_allowlist_pending',coalesce((a.metadata->>'edge_allowlist_pending')::boolean,true),
    'executor_mapping_pending',coalesce((a.metadata->>'executor_mapping_pending')::boolean,true),
    'edge_surface_verified_version',coalesce((a.metadata->>'edge_surface_verified_version')::integer,0),
    'observe_simulation_only',coalesce((a.metadata->>'observe_simulation_only')::boolean,false),
    'all_runtime_contracts_complete',coalesce((parity->>'all_runtime_contracts_complete')::boolean,false),
    'runtime_pending_count',coalesce((parity->>'runtime_pending_count')::integer,-1),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'ready',
      a.action_key is not null
      and coalesce(a.enabled,false)
      and coalesce(a.execution_mode,'')='observe'
      and coalesce(a.risk_class,'')='reversible_write'
      and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,true)=false
      and coalesce((a.metadata->>'executor_mapping_pending')::boolean,true)=false
      and coalesce((a.metadata->>'edge_surface_verified_version')::integer,0)>=8
      and coalesce((a.metadata->>'observe_simulation_only')::boolean,false)=true
      and coalesce((parity->>'all_runtime_contracts_complete')::boolean,false)=true,
    'reason',case
      when a.action_key is null then 'tool_missing'
      when coalesce(a.execution_mode,'')<>'observe' then 'tool_not_observe_only'
      when coalesce((a.metadata->>'edge_allowlist_pending')::boolean,true) then 'edge_allowlist_pending'
      when coalesce((a.metadata->>'executor_mapping_pending')::boolean,true) then 'executor_mapping_pending'
      when coalesce((a.metadata->>'edge_surface_verified_version')::integer,0)<8 then 'edge_surface_version_unverified'
      when not coalesce((parity->>'all_runtime_contracts_complete')::boolean,false) then 'runtime_contracts_incomplete'
      else 'runtime_surface_ready' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_runtime_surface_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_runtime_surface_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v15()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v14();
  runtime_surface jsonb:=public.get_agent_core_round4_runtime_surface_readiness_v1();
begin
  return base || jsonb_build_object(
    'version',15,
    'runtime_surface',runtime_surface,
    'runtime_surface_ready',coalesce((runtime_surface->>'ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((runtime_surface->>'ready')::boolean,false) then runtime_surface->>'reason'
      when not coalesce((base->>'action_tool_evidence_ready')::boolean,false) then 'awaiting_pre_router_shadow_alignment_samples'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v15() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v15() to service_role;

commit;
