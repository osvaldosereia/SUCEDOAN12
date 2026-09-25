-- Supabase-only R3: conservative security and duplicate-index cleanup.
-- Keeps all data and all constraint-backed indexes.

alter function public.prevent_identity_review_audit_mutation_v1()
  set search_path = pg_catalog, public;

revoke execute on function public.audit_identity_review_transition_v1() from public, anon, authenticated;
grant execute on function public.audit_identity_review_transition_v1() to service_role;

revoke execute on function public.get_agent_workflow_admin_v1() from public, anon, authenticated;
grant execute on function public.get_agent_workflow_admin_v1() to service_role;

revoke execute on function public.save_agent_workflow_stage_v1(
  text,text,text,text[],text[],boolean,boolean,integer,boolean
) from public, anon, authenticated;
grant execute on function public.save_agent_workflow_stage_v1(
  text,text,text,text[],text[],boolean,boolean,integer,boolean
) to service_role;

revoke execute on function public.set_agent_workflow_enabled_v1(boolean) from public, anon, authenticated;
grant execute on function public.set_agent_workflow_enabled_v1(boolean) to service_role;

drop index if exists public.idx_ame_mais_runs_created_at;
drop index if exists public.idx_creative_studio_jobs_expired_lease;
drop index if exists public.idx_customer_behavior_events_customer;
drop index if exists public.idx_order_items_order_history_v1;
drop index if exists public.quick_replies_key_uidx;
drop index if exists public.system_secrets_key_name_uidx;
