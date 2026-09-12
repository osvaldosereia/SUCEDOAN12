create or replace function public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  d public.experience_definitions%rowtype;
  cfg public.automation_config%rowtype;
  v59 jsonb;
  v35 jsonb := '{}'::jsonb;
  v_session_id uuid;
  v26 text := coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v25 text := coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v_runtime_chain_ok boolean := false;
  v_definition_ok boolean := false;
  v_upsell_ok boolean := false;
  v_gates_ok boolean := false;
begin
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  if not found then return jsonb_build_object('ok',false,'reason','definition_not_found'); end if;
  select * into cfg from public.automation_config where id=1;
  v59 := public.get_whatsapp_flow_v59_dynamic_search_quality_v1();

  select s.id into v_session_id
  from public.experience_sessions s
  where s.definition_id=d.id
    and coalesce(s.context->>'basket_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  order by s.updated_at desc
  limit 1;

  if v_session_id is not null then
    v35 := public.get_whatsapp_flow_v35_session_upsell_readiness_v1(v_session_id);
  end if;

  v_runtime_chain_ok :=
    position('handle_whatsapp_flow_commercial_exchange_v25' in v26)>0
    and position('handle_whatsapp_flow_commercial_exchange_v24' in v25)>0
    and position('get_whatsapp_flow_session_recommendations_v1' in v25)>0
    and position('homologation_terminal_no_order' in v26)>0
    and position('FALHA_FINALIZACAO' in v26)>0;

  v_definition_ok :=
    d.status='ready'
    and d.provider_id is not null
    and coalesce((d.metadata->>'candidate_not_live')::boolean,false)
    and not coalesce((d.metadata->>'customer_exposure')::boolean,true)
    and coalesce(d.config->>'handler_version','')='v26'
    and coalesce(d.config->>'runtime_edge_version','')='49'
    and coalesce((d.config->>'upsell_after_extras')::boolean,false)
    and coalesce((d.config->>'upsell_optional')::boolean,false)
    and coalesce((d.config->>'visual_upsell')::boolean,false)
    and coalesce((d.config->>'customer_prefill')::boolean,false)
    and coalesce((d.config->>'payment_on_delivery_only')::boolean,false)
    and not coalesce((d.config->>'component_prices_visible')::boolean,true)
    and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)
    and coalesce((d.config->>'max_products_per_query')::int,999)=20;

  v_upsell_ok := v_session_id is not null
    and coalesce((v35->>'ok')::boolean,false)
    and coalesce((v35->>'recommendation_count')::int,0) between 1 and 6
    and coalesce((v35->>'invalid_product_count')::int,999)=0
    and coalesce((v35->>'selected_product_overlap_count')::int,999)=0
    and coalesce((v35->>'duplicate_count')::int,999)=0
    and coalesce((v35->>'session_context_aware')::boolean,false)
    and coalesce((v35->>'optional_upsell')::boolean,false)
    and not coalesce((v35->>'ai_authoritative_for_products')::boolean,true);

  v_gates_ok :=
    coalesce(cfg.whatsapp_live_canary_percent,0)=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false);

  return jsonb_build_object(
    'ok',coalesce((v59->>'ok')::boolean,false) and v_runtime_chain_ok and v_definition_ok and v_upsell_ok and v_gates_ok,
    'readiness_version','v60-terminal-commercial-readiness-v1',
    'search_quality_ok',coalesce((v59->>'ok')::boolean,false),
    'runtime_chain_ok',v_runtime_chain_ok,
    'definition_contract_ok',v_definition_ok,
    'upsell_quality_ok',v_upsell_ok,
    'upsell_sample_session_present',v_session_id is not null,
    'upsell_recommendation_count',coalesce((v35->>'recommendation_count')::int,0),
    'upsell_invalid_product_count',coalesce((v35->>'invalid_product_count')::int,0),
    'upsell_selected_overlap_count',coalesce((v35->>'selected_product_overlap_count')::int,0),
    'upsell_duplicate_count',coalesce((v35->>'duplicate_count')::int,0),
    'upsell_optional',true,
    'customer_prefill_enabled',coalesce((d.config->>'customer_prefill')::boolean,false),
    'payment_on_delivery_only',coalesce((d.config->>'payment_on_delivery_only')::boolean,false),
    'component_prices_visible',coalesce((d.config->>'component_prices_visible')::boolean,true),
    'max_products_per_query',coalesce((d.config->>'max_products_per_query')::int,0),
    'full_catalog_loaded',false,
    'ai_authoritative_for_catalog',false,
    'writes_performed',false,
    'gates_ok',v_gates_ok,
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
$function$;

revoke all on function public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v60_terminal_commercial_readiness_v1() to service_role;
