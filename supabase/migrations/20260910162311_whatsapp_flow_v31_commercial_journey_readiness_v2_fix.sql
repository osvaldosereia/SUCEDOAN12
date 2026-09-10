create or replace function public.get_whatsapp_flow_v31_commercial_journey_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v23 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v5 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v5(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v22 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v22(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v1 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v1(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  checks jsonb:='[]'::jsonb;
  ok_count int:=0;
  total_count int:=0;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable';

  checks:=jsonb_build_array(
    jsonb_build_object('name','candidate_ready','ok',d.id is not null and d.status='ready'),
    jsonb_build_object('name','candidate_isolated','ok',coalesce((d.metadata->>'candidate_not_live')::boolean,false) and not coalesce((d.metadata->>'customer_exposure')::boolean,false) and not coalesce((d.metadata->>'default_for_new_sessions')::boolean,false)),
    jsonb_build_object('name','global_canary_1','ok',coalesce(cfg.whatsapp_live_canary_percent,0)=1),
    jsonb_build_object('name','orchestrator_off','ok',not coalesce(cfg.experience_orchestrator_enabled,false)),
    jsonb_build_object('name','data_exchange_global_off','ok',not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)),
    jsonb_build_object('name','flow_send_global_off','ok',not coalesce(cfg.whatsapp_flow_send_enabled,false)),
    jsonb_build_object('name','commercial_write_off','ok',not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)),
    jsonb_build_object('name','bling_off','ok',not coalesce(cfg.bling_order_sync_enabled,false)),
    jsonb_build_object('name','catalog_subset_default_12','ok',strpos(v5,'get_whatsapp_flow_product_results_v1(v_query,12)')>0),
    jsonb_build_object('name','catalog_subset_hard_cap_20','ok',strpos(lower(v22),'limit 20')>0),
    jsonb_build_object('name','macro_sections_capped_3','ok',strpos(v5,'array_length(v_section_keys,1)>3')>0),
    jsonb_build_object('name','direct_search_bounded_80','ok',strpos(v5,$needle$left(trim(coalesce(p_data->>'direct_query','')),80)$needle$)>0),
    jsonb_build_object('name','term_lookup_deterministic','ok',strpos(v5,'whatsapp_flow_search_terms')>0 and strpos(v5,'search_query')>0),
    jsonb_build_object('name','upsell_optional_capped_6','ok',strpos(v5,$needle$get_cart_aware_recommendations(p_conversation_id,6,'upsell')$needle$)>0 and strpos(v5,'Você pode seguir sem adicionar nada')>0),
    jsonb_build_object('name','basket_component_prices_hidden','ok',strpos(lower(v1),'componentes da cesta não exibem preço individual')>0),
    jsonb_build_object('name','stock_runtime_guard','ok',strpos(v22,'coalesce(pr.stock,0)>0')>0),
    jsonb_build_object('name','checkout_contact_canonical','ok',strpos(v23,'get_whatsapp_checkout_contact_v1')>0),
    jsonb_build_object('name','known_complete_no_reentry','ok',strpos(v23,$needle$v_known and v_complete then 'CLIENTE_EXISTENTE'$needle$)>0),
    jsonb_build_object('name','known_incomplete_prefill','ok',strpos(v23,$needle$else 'CLIENTE_NOVO'$needle$)>0 and strpos(v23,$needle$'street_value'$needle$)>0),
    jsonb_build_object('name','payment_options_current','ok',strpos(v23,$needle$'cartao_alimentacao'$needle$)>0)
  );

  select count(*),count(*) filter(where coalesce((e->>'ok')::boolean,false)) into total_count,ok_count
  from jsonb_array_elements(checks) e;

  return jsonb_build_object(
    'ok',ok_count=total_count,
    'passed',ok_count,
    'total',total_count,
    'checks',checks,
    'handler','v23',
    'catalog_strategy','macro_section -> dynamic_term -> bounded_backend_search; direct_search when intent is clear',
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_commercial_journey_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_commercial_journey_readiness_v1() to service_role;
