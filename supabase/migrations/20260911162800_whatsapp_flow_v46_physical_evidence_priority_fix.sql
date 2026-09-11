create or replace function public.get_whatsapp_flow_v46_terminal_regression_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  s public.experience_sessions%rowtype;
  v45 jsonb;
  checks jsonb;
  physical_complete boolean:=false;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  select * into s
  from public.experience_sessions es
  where es.definition_id=d.id
    and coalesce((es.context->>'requested_by_owner')::boolean,false)=true
    and coalesce((es.context->>'homologation_test')::boolean,false)=true
  order by coalesce(es.flow_exchange_count,0) desc, es.flow_state_version desc, es.updated_at desc
  limit 1;

  v45:=public.get_whatsapp_flow_v45_runtime_v26_readiness_v1();
  physical_complete:=coalesce(s.flow_current_screen,'') in ('FINALIZAR','SUCCESS','COMPLETE')
    or s.completed_at is not null;

  checks:=jsonb_build_array(
    jsonb_build_object('name','v45_runtime_current','ok',coalesce((v45->>'ok')::boolean,false),'detail',v45),
    jsonb_build_object('name','runtime_v26_edge49','ok',
      coalesce(d.config->>'handler_version','')='v26'
      and coalesce(d.metadata->>'commercial_handler','')='handle_whatsapp_flow_commercial_exchange_v26'
      and coalesce((d.config->>'runtime_edge_version')::int,0)=49
      and coalesce((d.metadata->>'edge_version')::int,0)=49
      and coalesce(d.metadata->>'candidate_not_live','false')::boolean=true
      and coalesce(d.metadata->>'customer_exposure','true')::boolean=false),
    jsonb_build_object('name','catalog_subset_bounded','ok',
      coalesce((d.config->>'max_products_per_query')::int,999)<=20
      and coalesce((d.config->>'default_products_per_query')::int,999)<=20
      and coalesce((d.config->>'never_load_full_catalog')::boolean,false)=true
      and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)=true
      and coalesce((d.config->>'ai_catalog_authoritative')::boolean,true)=false),
    jsonb_build_object('name','basket_component_prices_hidden','ok',
      coalesce((d.config->>'component_prices_visible')::boolean,true)=false
      and coalesce(d.metadata->>'component_price_visibility','')='hidden'),
    jsonb_build_object('name','checkout_contract_present','ok',
      to_regprocedure('public.get_whatsapp_checkout_contact_v1(uuid)') is not null
      and to_regprocedure('public.save_whatsapp_flow_customer_checkout_v1(uuid,integer,text,jsonb)') is not null
      and to_regprocedure('public.finalize_whatsapp_flow_commercial_order_v1(uuid,integer,text,text,text)') is not null
      and coalesce((d.config->>'customer_checkout_split')::boolean,false)=true
      and coalesce((d.config->>'payment_on_delivery_only')::boolean,false)=true),
    jsonb_build_object('name','nfm_and_location_followup_present','ok',
      to_regprocedure('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)') is not null
      and to_regprocedure('public.whatsapp_checkout_locator_followup_outbound_v1()') is not null),
    jsonb_build_object('name','native_outbound_flow_present','ok',
      to_regprocedure('public.dispatch_whatsapp_flow_outbound_job_v1(uuid)') is not null
      and to_regprocedure('public.dispatch_whatsapp_flow_owner_homologation_job_v1(uuid)') is not null),
    jsonb_build_object('name','rollout_gates_locked','ok',
      coalesce(cfg.whatsapp_live_canary_percent,0)=1
      and not cfg.experience_orchestrator_enabled
      and not cfg.whatsapp_flow_data_exchange_enabled
      and not cfg.whatsapp_flow_send_enabled
      and not cfg.whatsapp_flow_commercial_write_enabled
      and not cfg.bling_order_sync_enabled),
    jsonb_build_object('name','owner_homologation_session_observed','ok',s.id is not null,
      'session_id',s.id,'screen',s.flow_current_screen,'exchange_count',s.flow_exchange_count,'state_version',s.flow_state_version)
  );

  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'checks',checks,
    'physical_complete',physical_complete,
    'physical_next','UPSELL -> REVISAO -> CLIENTE/ENDERECO -> FINALIZAR -> nfm_reply -> localizacao',
    'runtime',jsonb_build_object('handler','handle_whatsapp_flow_commercial_exchange_v26','runtime','data-exchange-v26','edge',49),
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

revoke all on function public.get_whatsapp_flow_v46_terminal_regression_readiness_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v46_terminal_regression_readiness_v1() to service_role;
