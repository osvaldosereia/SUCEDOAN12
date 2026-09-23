-- Consolidate on the pre-existing canonical Bling Hub V2.
-- The short-lived bling_integration_* foundation contained no operational jobs/state.
-- Restore canonical readiness and remove only duplicate objects using RESTRICT.

create or replace function public.bling_hub_readiness_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_runtime public.bling_hub_runtime_v2%rowtype;
  v_creds jsonb;
begin
  select * into v_runtime from public.bling_hub_runtime_v2 where id=1;
  select public.get_bling_api_credentials_v1() into v_creds;
  return jsonb_build_object(
    'mode',v_runtime.mode,'hub_enabled',v_runtime.hub_enabled,'legacy_queues_frozen',v_runtime.legacy_queues_frozen,
    'domains',jsonb_build_object(
      'products',v_runtime.products_enabled,'stock',v_runtime.stock_enabled,'customers',v_runtime.customers_enabled,
      'orders',v_runtime.orders_enabled,'webhooks',v_runtime.webhooks_enabled,'fiscal',v_runtime.fiscal_enabled
    ),
    'credentials',jsonb_build_object(
      'client_id',nullif(v_creds->>'client_id','') is not null,
      'client_secret',nullif(v_creds->>'client_secret','') is not null,
      'refresh_token',nullif(v_creds->>'refresh_token','') is not null,
      'ready',nullif(v_creds->>'client_id','') is not null
        and nullif(v_creds->>'client_secret','') is not null
        and nullif(v_creds->>'refresh_token','') is not null
    ),
    'legacy',jsonb_build_object(
      'bling_commands_pending',(select count(*) from public.bling_commands where status='pending'),
      'bling_commands_processing',(select count(*) from public.bling_commands where status='processing'),
      'order_sync_pending_or_error',(select count(*) from public.order_sync_jobs where status in ('pending','error')),
      'order_sync_processing',(select count(*) from public.order_sync_jobs where status='processing')
    ),
    'hub_queue',jsonb_build_object(
      'pending',(select count(*) from public.bling_hub_jobs_v2 where status='pending'),
      'processing',(select count(*) from public.bling_hub_jobs_v2 where status='processing'),
      'review_required',(select count(*) from public.bling_hub_jobs_v2 where status='review_required'),
      'failed',(select count(*) from public.bling_hub_jobs_v2 where status='failed')
    ),
    'last_oauth_check_at',v_runtime.last_oauth_check_at,'last_oauth_ok_at',v_runtime.last_oauth_ok_at,
    'last_readonly_check_at',v_runtime.last_readonly_check_at,'last_readonly_ok_at',v_runtime.last_readonly_ok_at
  );
end
$$;

revoke all on function public.bling_hub_readiness_v2() from public,anon,authenticated;
grant execute on function public.bling_hub_readiness_v2() to service_role;

drop function if exists public.claim_bling_integration_jobs_v2(text,integer,integer) restrict;
drop function if exists public.acquire_bling_refresh_lock_v2(text,integer) restrict;
drop function if exists public.release_bling_refresh_lock_v2(text,text,text,timestamptz) restrict;
drop function if exists public.get_bling_vault_secret_v2(text) restrict;

drop table if exists public.bling_integration_jobs_v2 restrict;
drop table if exists public.bling_integration_state_v2 restrict;
drop table if exists public.bling_integration_runtime_v2 restrict;
drop table if exists public.bling_rate_limit_v2 restrict;
drop table if exists public.bling_oauth_runtime_v2 restrict;
drop table if exists public.bling_legacy_queue_snapshot_v2 restrict;
