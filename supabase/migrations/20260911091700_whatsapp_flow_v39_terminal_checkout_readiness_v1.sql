-- WhatsApp Flow V39: readiness unificado do checkout terminal owner-only.
-- Não cria pedido, não escreve cliente/carrinho e não altera qualquer gate de rollout.

create or replace function public.get_whatsapp_flow_v39_terminal_checkout_readiness_v1(p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  s public.experience_sessions%rowtype;
  v25 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v23 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  preview2 text:=coalesce(pg_get_functiondef('public.format_whatsapp_flow_session_preview_v2(uuid)'::regprocedure),'');
  save_checkout text:=coalesce(pg_get_functiondef('public.save_whatsapp_flow_customer_checkout_v1(uuid,integer,text,jsonb)'::regprocedure),'');
  finalize_order text:=coalesce(pg_get_functiondef('public.finalize_whatsapp_flow_commercial_order_v1(uuid,integer,text,text,text)'::regprocedure),'');
  nfm_wrapper text:=coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)'::regprocedure),'');
  nfm_legacy text:=coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)'::regprocedure),'');
  queue_offer text:=coalesce(pg_get_functiondef('public.queue_whatsapp_flow_offer_v1(uuid,uuid,text,uuid,text,jsonb)'::regprocedure),'');
  v_checks jsonb;
  v_ok boolean;
  v_session jsonb:=null;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;

  if p_session_id is not null then
    select * into s from public.experience_sessions where id=p_session_id and definition_id=d.id;
    if found then
      v_session:=jsonb_build_object(
        'present',true,'status',s.status,'screen',s.flow_current_screen,
        'exchange_count',s.flow_exchange_count,'state_version',s.flow_state_version,
        'test_mode',coalesce((s.context->>'test_mode')::boolean,false),
        'homologation_test',coalesce((s.context->>'homologation_test')::boolean,false)
      );
    else
      v_session:=jsonb_build_object('present',false);
    end if;
  end if;

  select jsonb_agg(jsonb_build_object('name',x.name,'ok',x.ok,'detail',x.detail) order by x.ord),bool_and(x.ok)
    into v_checks,v_ok
  from (values
    (1,'stable_v25',coalesce(d.config->>'handler_version','')='v25' and coalesce(d.metadata->>'commercial_handler','')='handle_whatsapp_flow_commercial_exchange_v25','V25/Edge stable'),
    (2,'v25_keeps_v24_checkout',position('handle_whatsapp_flow_commercial_exchange_v24' in v25)>0,'V25 chains V24'),
    (3,'canonical_customer_checkout',position('get_whatsapp_checkout_contact_v1' in v23)>0 and position('CLIENTE_EXISTENTE' in v23)>0 and position('CLIENTE_NOVO' in v23)>0,'known customer/address source is canonical'),
    (4,'known_customer_not_reasked',position('v_known and v_complete' in v23)>0,'complete known customer uses confirmation screen'),
    (5,'payment_methods_current',position('cartao_alimentacao' in v23)>0 and position('cartao_entrega' in v23)>0 and position('dinheiro' in v23)>0 and position('pix' in v23)>0,'delivery payment options present'),
    (6,'review_backend_total',position('validate_basket_flow_selection_v1' in preview2)>0 and position('normalized_pending_addons' in preview2)>0 and position('total_numeric' in preview2)>0,'review/total deterministic'),
    (7,'component_prices_hidden',position('componentes da cesta não exibem preço individual' in preview2)>0,'basket component unit prices hidden'),
    (8,'checkout_write_fail_closed',position('whatsapp_flow_commercial_write_disabled' in save_checkout)>0 and position('flow_write_idempotency_conflict' in save_checkout)>0 and position('conversation_requires_human' in save_checkout)>0,'checkout write gated/idempotent/human-safe'),
    (9,'finalize_write_fail_closed',position('whatsapp_flow_commercial_write_disabled' in finalize_order)>0 and position('experience_orchestrator_disabled' in finalize_order)>0 and position('whatsapp_flow_data_exchange_disabled' in finalize_order)>0 and position('whatsapp_flow_send_disabled' in finalize_order)>0,'finalize requires all commercial gates'),
    (10,'finalize_payment_allowlist',position('cartao_alimentacao' in finalize_order)>0 and position('cartao_entrega' in finalize_order)>0 and position('dinheiro' in finalize_order)>0 and position('pix' in finalize_order)>0,'finalize payment allowlist'),
    (11,'finalize_requires_registered_customer',position('customer_registration_incomplete' in finalize_order)>0,'customer must be complete before order'),
    (12,'finalize_records_order_and_completes_session',position('flow_order_id' in finalize_order)>0 and position('status=''completed''' in finalize_order)>0 and position('send_location_in_chat' in finalize_order)>0,'order/session terminal state'),
    (13,'nfm_wrapper_delegates_commercial',position('process_whatsapp_flow_nfm_reply_legacy_v1' in nfm_wrapper)>0,'commercial reply bridge preserved'),
    (14,'nfm_requires_confirmed_order_for_location',position('status=''confirmed''' in nfm_legacy)>0 and position('confirmed_at is not null' in lower(nfm_legacy))>0 and position('location_required' in nfm_legacy)>0,'location only after confirmed order'),
    (15,'nfm_idempotent',position('flow_nfm_reply' in nfm_legacy)>0 and position('v_duplicate' in nfm_legacy)>0,'duplicate nfm_reply suppressed'),
    (16,'native_flow_outbound',position('''type'',''flow''' in queue_offer)>0 and position('flow_message_version' in queue_offer)>0 and position('flow_token' in queue_offer)>0 and position('flow_id' in queue_offer)>0 and position('flow_cta' in queue_offer)>0 and position('flow_action' in queue_offer)>0,'interactive.type=flow native payload'),
    (17,'catalog_never_full',coalesce((d.config->>'never_load_full_catalog')::boolean,false) and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false) and coalesce((d.config->>'max_products_per_query')::int,0)<=20,'catalog subset hard cap <=20'),
    (18,'canary_preserved',cfg.whatsapp_live_canary_percent=1,'canary=1'),
    (19,'orchestrator_off',not coalesce(cfg.experience_orchestrator_enabled,false),'off'),
    (20,'data_exchange_off',not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false),'off'),
    (21,'flow_send_off',not coalesce(cfg.whatsapp_flow_send_enabled,false),'off'),
    (22,'commercial_write_off',not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false),'off'),
    (23,'bling_off',not coalesce(cfg.bling_order_sync_enabled,false),'off')
  ) as x(ord,name,ok,detail);

  return jsonb_build_object(
    'ok',coalesce(v_ok,false),'readiness_version','v39-terminal-checkout-v1',
    'candidate_slug',d.slug,'runtime_handler',d.config->>'handler_version',
    'runtime_edge_version',d.config->>'runtime_edge_version','session',v_session,
    'checks',coalesce(v_checks,'[]'::jsonb),
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled),
    'writes_executed',false,'orders_created',false,'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v39_terminal_checkout_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v39_terminal_checkout_readiness_v1(uuid) to service_role;
