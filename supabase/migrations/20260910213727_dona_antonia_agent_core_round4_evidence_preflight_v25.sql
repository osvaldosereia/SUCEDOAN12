begin;

create or replace function public.get_agent_core_round4_homologation_evidence_preflight_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  runtime_surface jsonb:=public.get_agent_core_round4_runtime_surface_readiness_v1();
  parity jsonb:=public.get_agent_core_round4_action_tool_parity_v1(168);
  evidence jsonb:=public.get_agent_core_round4_stateful_evidence_report_v1(168);
  v_homologation_total integer:=0;
  v_ai_clear integer:=0;
  v_ai_clear_open_window integer:=0;
  v_human_blocked integer:=0;
  v_snapshot_rows integer:=0;
  v_snapshot_trigger boolean:=false;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;

  with h as (
    select conversation_id, bool_or(status in ('open','claimed')) as open_handoff
    from public.human_handoffs
    group by conversation_id
  )
  select
    count(*) filter(where c.channel='whatsapp' and coalesce(c.automation_cohort,'')='homologation')::integer,
    count(*) filter(where c.channel='whatsapp' and coalesce(c.automation_cohort,'')='homologation'
      and c.mode='ai' and not coalesce(c.human_required,false) and not coalesce(h.open_handoff,false))::integer,
    count(*) filter(where c.channel='whatsapp' and coalesce(c.automation_cohort,'')='homologation'
      and c.mode='ai' and not coalesce(c.human_required,false) and not coalesce(h.open_handoff,false)
      and c.service_window_expires_at>now())::integer,
    count(*) filter(where c.channel='whatsapp' and coalesce(c.automation_cohort,'')='homologation'
      and (c.mode='human' or coalesce(c.human_required,false) or coalesce(h.open_handoff,false)))::integer
  into v_homologation_total,v_ai_clear,v_ai_clear_open_window,v_human_blocked
  from public.conversations c
  left join h on h.conversation_id=c.id;

  select count(*)::integer into v_snapshot_rows
  from public.agent_core_pre_router_snapshots;

  select exists(
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='ai_jobs'
      and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ilike '%observe_agent_core_pre_router_state_v1%'
  ) into v_snapshot_trigger;

  return jsonb_build_object(
    'version',1,
    'round','4/6',
    'agent_core_enabled',coalesce(cfg.enabled,false),
    'execution_mode',coalesce(cfg.execution_mode,''),
    'shadow_openai_enabled',coalesce(cfg.shadow_openai_enabled,false),
    'legacy_router_policy',coalesce(cfg.legacy_router_policy,''),
    'runtime_surface_ready',coalesce((runtime_surface->>'ready')::boolean,false),
    'runtime_pending_count',coalesce((runtime_surface->>'runtime_pending_count')::integer,-1),
    'snapshot_trigger_present',v_snapshot_trigger,
    'snapshot_rows',v_snapshot_rows,
    'homologation_conversations',v_homologation_total,
    'homologation_ai_clear',v_ai_clear,
    'homologation_ai_clear_open_window',v_ai_clear_open_window,
    'homologation_human_blocked',v_human_blocked,
    'action_contract_count',coalesce((parity->>'contract_count')::integer,0),
    'action_contract_runtime_complete_count',coalesce((parity->>'runtime_complete_count')::integer,0),
    'action_contract_evidence_ready_count',coalesce((parity->>'evidence_ready_count')::integer,0),
    'stateful_evidence_ready',coalesce((evidence->>'evidence_ready')::boolean,false),
    'missing_core_action_samples',coalesce(evidence->'missing_core_action_samples','[]'::jsonb),
    'minimum_samples_per_core_action',coalesce((evidence->>'minimum_stateful_samples_per_core_action')::integer,3),
    'passive_collection_ready',
      coalesce(cfg.enabled,false)
      and coalesce(cfg.execution_mode,'')='observe'
      and coalesce(cfg.shadow_openai_enabled,false)
      and coalesce(cfg.legacy_router_policy,'')='shadow'
      and coalesce((runtime_surface->>'ready')::boolean,false)
      and v_snapshot_trigger
      and v_ai_clear_open_window>0,
    'requires_real_homologation_turns',true,
    'synthetic_backfill_allowed',false,
    'writes_permitted',false,
    'router_retirement_permitted',false,
    'pii_returned',false,
    'reason',case
      when not coalesce(cfg.enabled,false) then 'agent_core_disabled'
      when coalesce(cfg.execution_mode,'')<>'observe' then 'execution_mode_not_observe'
      when not coalesce(cfg.shadow_openai_enabled,false) then 'shadow_openai_disabled'
      when coalesce(cfg.legacy_router_policy,'')<>'shadow' then 'legacy_router_policy_not_shadow'
      when not coalesce((runtime_surface->>'ready')::boolean,false) then runtime_surface->>'reason'
      when not v_snapshot_trigger then 'pre_router_snapshot_trigger_missing'
      when v_ai_clear_open_window=0 then 'awaiting_clear_homologation_service_window'
      when coalesce((evidence->>'evidence_ready')::boolean,false) then 'stateful_evidence_threshold_met'
      else 'ready_for_passive_homologation_evidence_collection' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_homologation_evidence_preflight_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_homologation_evidence_preflight_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v16()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v15();
  preflight jsonb:=public.get_agent_core_round4_homologation_evidence_preflight_v1();
begin
  return base || jsonb_build_object(
    'version',16,
    'homologation_evidence_preflight',preflight,
    'passive_collection_ready',coalesce((preflight->>'passive_collection_ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((base->>'runtime_surface_ready')::boolean,false) then base->>'reason'
      when not coalesce((preflight->>'passive_collection_ready')::boolean,false) then preflight->>'reason'
      when not coalesce((base->>'action_tool_evidence_ready')::boolean,false) then 'collect_real_homologation_stateful_evidence'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v16() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v16() to service_role;

commit;
