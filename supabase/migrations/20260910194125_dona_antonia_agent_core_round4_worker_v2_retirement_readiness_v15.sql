begin;

create or replace function public.get_agent_core_round4_worker_v2_retirement_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_v3_trigger boolean:=false;
  v_v2_trigger_absent boolean:=false;
  v_v3_cron boolean:=false;
  v_v2_cron_absent boolean:=false;
  v_dispatch_wrapper boolean:=false;
  v_recovery_wrapper boolean:=false;
  v_v2_endpoint_refs integer:=0;
  v_ready boolean:=false;
begin
  select exists(
    select 1
    from pg_trigger tg
    join pg_class c on c.oid=tg.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='ai_jobs'
      and tg.tgname='ai_job_event_dispatch_v3' and not tg.tgisinternal
  ) into v_v3_trigger;

  select not exists(
    select 1
    from pg_trigger tg
    join pg_class c on c.oid=tg.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='ai_jobs'
      and tg.tgname='ai_job_event_dispatch_v2' and not tg.tgisinternal
  ) into v_v2_trigger_absent;

  select exists(select 1 from cron.job where jobname='dona-antonia-conversation-worker-recovery-v3') into v_v3_cron;
  select not exists(select 1 from cron.job where jobname='dona-antonia-conversation-worker-recovery-v2') into v_v2_cron_absent;

  select coalesce(bool_or(position('select public.dispatch_conversation_worker_job_v3(p_job_id)' in lower(pg_get_functiondef(p.oid)))>0),false)
  into v_dispatch_wrapper
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dispatch_conversation_worker_job_v2' and p.prokind='f';

  select coalesce(bool_or(position('select public.recover_conversation_worker_dispatch_v3()' in lower(pg_get_functiondef(p.oid)))>0),false)
  into v_recovery_wrapper
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='recover_conversation_worker_dispatch_v2' and p.prokind='f';

  select count(*)::integer into v_v2_endpoint_refs
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and position('functions/v1/conversation-worker-v2' in lower(pg_get_functiondef(p.oid)))>0;

  v_ready:=v_v3_trigger and v_v2_trigger_absent and v_v3_cron and v_v2_cron_absent
           and v_dispatch_wrapper and v_recovery_wrapper and v_v2_endpoint_refs=0;

  return jsonb_build_object(
    'version',1,
    'database_runtime_ready',v_ready,
    'canonical_dispatch_trigger_present',v_v3_trigger,
    'legacy_dispatch_trigger_absent',v_v2_trigger_absent,
    'canonical_recovery_cron_present',v_v3_cron,
    'legacy_recovery_cron_absent',v_v2_cron_absent,
    'dispatch_v2_wrapper_forwards_to_v3',v_dispatch_wrapper,
    'recovery_v2_wrapper_forwards_to_v3',v_recovery_wrapper,
    'current_db_functions_calling_v2_endpoint',v_v2_endpoint_refs,
    'historical_repository_evidence_preserved',true,
    'external_dependency_review_required',true,
    'edge_v2_removal_authorized',false,
    'automatic_removal_allowed',false,
    'reason',case when v_ready then 'database_runtime_canonical_v3' else 'database_runtime_still_has_v2_dependency' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_worker_v2_retirement_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_worker_v2_retirement_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v11()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v10();
  wr jsonb:=public.get_agent_core_round4_worker_v2_retirement_readiness_v1();
begin
  return base || jsonb_build_object(
    'version',11,
    'worker_v2_retirement',wr,
    'worker_v2_database_runtime_ready',coalesce((wr->>'database_runtime_ready')::boolean,false),
    'worker_v2_edge_removal_authorized',false,
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((wr->>'database_runtime_ready')::boolean,false) then wr->>'reason'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v11() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v11() to service_role;

commit;
