begin;

create or replace function public.is_whatsapp_agent_core_shadow_eligible_v1(p_job_id uuid,p_replay boolean default false)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.is_whatsapp_agent_core_shadow_eligible_v2(p_job_id,p_replay);
$$;

revoke all on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) to service_role;

create or replace function public.get_agent_core_round4_shadow_bridge_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',1,
  'legacy_eligibility_entrypoint_bridged_to_v2',position('is_whatsapp_agent_core_shadow_eligible_v2' in pg_get_functiondef(p.oid))>0,
  'packet_v2_available',to_regprocedure('public.build_whatsapp_agent_core_packet_v2(uuid,uuid)') is not null,
  'edge_packet_switch_required',true,
  'execution_authorized',false,
  'retirement_authorized',false
)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_whatsapp_agent_core_shadow_eligible_v1'
limit 1;
$$;

revoke all on function public.get_agent_core_round4_shadow_bridge_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_shadow_bridge_readiness_v1() to service_role;

commit;