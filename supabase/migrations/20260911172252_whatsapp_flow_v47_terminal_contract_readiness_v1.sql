create or replace function public.get_whatsapp_flow_v47_terminal_contract_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  v46 jsonb;
  checks jsonb;
  def_router text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)')),''));
  def_legacy text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)')),''));
  def_finalize text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.finalize_whatsapp_flow_commercial_order_v1(uuid,integer,text,text,text)')),''));
  def_v23 text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)')),''));
  def_v25 text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb)')),''));
  def_v26 text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)')),''));
  def_core text:=lower(coalesce(pg_get_functiondef(to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v1_legacy_storefront_bridge(uuid,uuid,text,text,jsonb)')),''));
begin
  select * into cfg from public.automation_config where id=1;
  v46:=public.get_whatsapp_flow_v46_terminal_regression_readiness_v1();

  checks:=jsonb_build_array(
    jsonb_build_object('name','v46_current_runtime_green','ok',coalesce((v46->>'ok')::boolean,false)),
    jsonb_build_object('name','runtime_chain_v26_to_v25','ok',
      def_v26 like '%handle_whatsapp_flow_commercial_exchange_v25%'
      and def_v25 like '%get_whatsapp_flow_session_recommendations_v1%'),
    jsonb_build_object('name','terminal_transition_contract','ok',
      def_core like '%v_current=''upsell''%'
      and def_core like '%v_trigger=''upsell_continue''%'
      and def_core like '%v_current=''revisao''%'
      and def_core like '%v_trigger=''review_confirm''%'
      and def_core like '%v_current=''cliente''%'
      and def_core like '%v_trigger=''checkout_confirm''%'
      and def_core like '%flow_current_screen=''finalizar''%'
      and def_core like '%envie sua localização para confirmar o ponto da entrega%'),
    jsonb_build_object('name','upsell_backend_optional','ok',
      def_v25 like '%get_whatsapp_flow_session_recommendations_v1%'
      and def_v25 like '%p_conversation_id,6%'
      and def_v25 like '%sugestões opcionais%'
      and def_v25 like '%continuar sem adicionar nada%'),
    jsonb_build_object('name','known_customer_address_reuse','ok',
      def_v23 like '%get_whatsapp_checkout_contact_v1%'
      and def_v23 like '%v_known and v_complete%'
      and def_v23 like '%cliente_existente%'
      and def_v23 like '%cliente_novo%'),
    jsonb_build_object('name','payment_contract_current','ok',
      def_v23 like '%''pix''%'
      and def_v23 like '%''dinheiro''%'
      and def_v23 like '%''cartao_entrega''%'
      and def_v23 like '%''cartao_alimentacao''%'),
    jsonb_build_object('name','finalization_fail_closed','ok',
      def_finalize like '%whatsapp_flow_commercial_write_disabled%'
      and def_finalize like '%experience_orchestrator_disabled%'
      and def_finalize like '%whatsapp_flow_data_exchange_disabled%'
      and def_finalize like '%whatsapp_flow_send_disabled%'
      and def_finalize like '%next_step'',''send_location_in_chat%'
      and def_finalize like '%bling_queued'',false%'),
    jsonb_build_object('name','nfm_router_commercial_fallback','ok',
      def_router like '%process_whatsapp_flow_nfm_reply_legacy_v1%'),
    jsonb_build_object('name','nfm_stable_candidate_supported','ok',
      def_legacy like '%flow-cestas-comercial-v8-stable%'
      and def_legacy like '%''offered'',''open'',''completed''%'
      and def_legacy like '%location_required%'
      and def_legacy like '%envie sua localização pelo whatsapp%'),
    jsonb_build_object('name','rollout_gates_locked','ok',
      coalesce(cfg.whatsapp_live_canary_percent,0)=1
      and not cfg.experience_orchestrator_enabled
      and not cfg.whatsapp_flow_data_exchange_enabled
      and not cfg.whatsapp_flow_send_enabled
      and not cfg.whatsapp_flow_commercial_write_enabled
      and not cfg.bling_order_sync_enabled)
  );

  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'checks',checks,
    'runtime',jsonb_build_object('handler','handle_whatsapp_flow_commercial_exchange_v26','edge',49),
    'terminal_sequence',jsonb_build_array('UPSELL','REVISAO','CLIENTE_EXISTENTE|CLIENTE_NOVO','FINALIZAR','nfm_reply','localizacao'),
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

revoke all on function public.get_whatsapp_flow_v47_terminal_contract_readiness_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v47_terminal_contract_readiness_v1() to service_role;
comment on function public.get_whatsapp_flow_v47_terminal_contract_readiness_v1() is 'V47 read-only terminal contract gate: protects UPSELL through nfm_reply/location compatibility and fail-closed rollout gates for the stable commercial WhatsApp Flow.';
