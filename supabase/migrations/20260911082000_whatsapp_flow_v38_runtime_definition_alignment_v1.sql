-- WhatsApp Flow V38: alinhar definição persistida com o runtime stable V25/Edge 48 e expor readiness owner-only.
update public.experience_definitions
set config = coalesce(config,'{}'::jsonb) || jsonb_build_object(
      'handler_version','v25',
      'runtime_edge_version',48,
      'upsell_recommendation_version','v35-session-aware-v1'
    ),
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'commercial_handler','handle_whatsapp_flow_commercial_exchange_v25',
      'handler_version','v25',
      'edge_version',48,
      'implementation_stage','v38_v25_runtime_definition_aligned',
      'updated_by_checkpoint','run20'
    ),
    updated_at = now()
where slug='flow-cestas-comercial-v8-stable';

create or replace function public.get_whatsapp_flow_v38_runtime_alignment_readiness_v1(p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  d public.experience_definitions%rowtype;
  cfg public.automation_config%rowtype;
  s public.experience_sessions%rowtype;
  v_handler text;
  v_v25_def text;
  v_session_audit jsonb := null;
  v_session_ok boolean := true;
begin
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  if not found then return jsonb_build_object('ok',false,'reason','stable_definition_not_found','pii_returned',false,'writes_executed',false); end if;
  select * into cfg from public.automation_config where id=1;

  v_handler := coalesce(d.metadata->>'commercial_handler','');
  v_v25_def := coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb)'::regprocedure),'');

  if p_session_id is not null then
    select * into s from public.experience_sessions where id=p_session_id;
    if not found then
      v_session_ok:=false;
      v_session_audit:=jsonb_build_object('ok',false,'reason','session_not_found');
    else
      begin
        v_session_audit:=public.get_whatsapp_flow_v31_live_session_audit_v1(p_session_id);
        v_session_ok:=coalesce((v_session_audit->>'ok')::boolean,false);
      exception when others then
        v_session_ok:=false;
        v_session_audit:=jsonb_build_object('ok',false,'reason','session_audit_failed');
      end;
    end if;
  end if;

  return jsonb_build_object(
    'ok',
      d.status='ready'
      and d.provider='meta_whatsapp_flow'
      and coalesce((d.config->>'never_load_full_catalog')::boolean,false)
      and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)
      and coalesce((d.config->>'max_products_per_query')::int,0)<=20
      and coalesce(d.config->>'handler_version','')='v25'
      and coalesce((d.config->>'runtime_edge_version')::int,0)=48
      and v_handler='handle_whatsapp_flow_commercial_exchange_v25'
      and coalesce((d.metadata->>'edge_version')::int,0)=48
      and position('handle_whatsapp_flow_commercial_exchange_v24' in v_v25_def)>0
      and position('get_whatsapp_flow_session_recommendations_v1' in v_v25_def)>0
      and cfg.whatsapp_live_canary_percent=1
      and not coalesce(cfg.experience_orchestrator_enabled,false)
      and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
      and not coalesce(cfg.whatsapp_flow_send_enabled,false)
      and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
      and not coalesce(cfg.bling_order_sync_enabled,false)
      and v_session_ok,
    'readiness_version','v38-runtime-alignment-v1',
    'definition_status',d.status,
    'provider',d.provider,
    'provider_id_present',nullif(d.provider_id,'') is not null,
    'config_handler_version',d.config->>'handler_version',
    'metadata_handler_version',d.metadata->>'handler_version',
    'commercial_handler',v_handler,
    'runtime_edge_version',d.config->>'runtime_edge_version',
    'metadata_edge_version',d.metadata->>'edge_version',
    'max_products_per_query',d.config->>'max_products_per_query',
    'never_load_full_catalog',d.config->>'never_load_full_catalog',
    'full_catalog_load_forbidden',d.config->>'full_catalog_load_forbidden',
    'session_audit',v_session_audit,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled),
    'pii_returned',false,
    'writes_executed',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v38_runtime_alignment_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v38_runtime_alignment_readiness_v1(uuid) to service_role;
