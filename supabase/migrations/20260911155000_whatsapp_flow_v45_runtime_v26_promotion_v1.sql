update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'commercial_handler','handle_whatsapp_flow_commercial_exchange_v26',
  'handler_version','v26',
  'edge_version',49,
  'next_commercial_handler',null,
  'next_handler_version',null,
  'runtime_promotion_required',false,
  'ai_intent_data_exchange','v45-owner-only-active-runtime',
  'ai_intent_trigger','ai_intent_open_v1',
  'ai_intent_max_products',20,
  'ai_intent_catalog_authority','backend_deterministic'
),
config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'handler_version','v26',
  'runtime_edge_version',49
),
updated_at=now()
where slug='flow-cestas-comercial-v8-stable';

create or replace function public.get_whatsapp_flow_v45_runtime_v26_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v26 text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  checks jsonb;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  checks:=jsonb_build_array(
    jsonb_build_object('name','rollout_locked','ok',coalesce(cfg.whatsapp_live_canary_percent,0)=1 and not cfg.experience_orchestrator_enabled and not cfg.whatsapp_flow_data_exchange_enabled and not cfg.whatsapp_flow_send_enabled and not cfg.whatsapp_flow_commercial_write_enabled and not cfg.bling_order_sync_enabled),
    jsonb_build_object('name','stable_handler_v26','ok',coalesce(d.metadata->>'commercial_handler','')='handle_whatsapp_flow_commercial_exchange_v26' and coalesce(d.metadata->>'handler_version','')='v26'),
    jsonb_build_object('name','edge49_recorded','ok',coalesce((d.metadata->>'edge_version')::int,0)=49 and coalesce((d.config->>'runtime_edge_version')::int,0)=49),
    jsonb_build_object('name','candidate_still_isolated','ok',d.status='ready' and coalesce((d.metadata->>'customer_exposure')::boolean,true)=false and coalesce((d.metadata->>'candidate_not_live')::boolean,false)=true and coalesce((d.metadata->>'default_for_new_sessions')::boolean,true)=false),
    jsonb_build_object('name','v26_owner_only','ok',position('whatsapp_test_allowlist' in v26)>0 and position('controlled_live_homologation' in v26)>0),
    jsonb_build_object('name','v26_bounded','ok',position('v_count>20' in replace(v26,' ',''))>0),
    jsonb_build_object('name','v25_fallback_preserved','ok',position('handle_whatsapp_flow_commercial_exchange_v25' in v26)>0)
  );
  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'checks',checks,
    'handler',d.metadata->>'commercial_handler',
    'handler_version',d.metadata->>'handler_version',
    'edge_version',d.metadata->>'edge_version',
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled
    )
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_v45_runtime_v26_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v45_runtime_v26_readiness_v1() to service_role;