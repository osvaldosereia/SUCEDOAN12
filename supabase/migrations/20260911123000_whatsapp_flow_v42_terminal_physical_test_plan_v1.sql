-- WhatsApp Flow V42: terminal owner-only physical-test plan/readiness.
-- Read-only. It does not write cart/customer/order and does not change rollout gates.

create or replace function public.get_whatsapp_flow_v42_terminal_physical_test_plan_v1(
  p_session_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v41 jsonb;
  v39 jsonb;
  v25 text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  v24 text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v24(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  v23 text:=lower(coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)'::regprocedure),''));
  preview2 text:=lower(coalesce(pg_get_functiondef('public.format_whatsapp_flow_session_preview_v2(uuid)'::regprocedure),''));
  finalize_order text:=lower(coalesce(pg_get_functiondef('public.finalize_whatsapp_flow_commercial_order_v1(uuid,integer,text,text,text)'::regprocedure),''));
  nfm_legacy text:=lower(coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)'::regprocedure),''));
  queue_offer text:=lower(coalesce(pg_get_functiondef('public.queue_whatsapp_flow_offer_v1(uuid,uuid,text,uuid,text,jsonb)'::regprocedure),''));
  v_checks jsonb;
  v_ok boolean;
  v_gates_safe boolean;
  v_next text;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  v41:=public.get_whatsapp_flow_v41_physical_homologation_evidence_v1(p_session_id);
  v39:=public.get_whatsapp_flow_v39_terminal_checkout_readiness_v1(p_session_id);

  v_gates_safe:=cfg.whatsapp_live_canary_percent=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false);

  select jsonb_agg(jsonb_build_object('name',x.name,'ok',x.ok,'detail',x.detail) order by x.ord),bool_and(x.ok)
    into v_checks,v_ok
  from (values
    (1,'owner_only_candidate',coalesce((d.metadata->>'candidate_not_live')::boolean,false) and coalesce((d.metadata->>'customer_exposure')::boolean,false)=false and coalesce((d.metadata->>'default_for_new_sessions')::boolean,false)=false,'candidate remains isolated from customers'),
    (2,'stable_runtime_v25',coalesce(d.config->>'handler_version','')='v25' and coalesce(d.config->>'runtime_edge_version','')='48','stable uses V25 on Edge 48'),
    (3,'catalog_subset_only',coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false) and coalesce((d.config->>'max_products_per_query')::int,0)<=20,'full catalog forbidden and hard cap <=20'),
    (4,'upsell_optional',coalesce((d.config->>'upsell_optional')::boolean,false) and position('upsell' in v25)>0,'upsell is optional and handled by deterministic runtime'),
    (5,'review_screen_contract',position('revisao' in v24)>0 and position('total_numeric' in preview2)>0,'review uses V24 terminal branch and backend preview/total'),
    (6,'customer_branch_contract',position('cliente_existente' in v23)>0 and position('cliente_novo' in v23)>0 and position('get_whatsapp_checkout_contact_v1' in v23)>0,'known customer/address branch is canonical'),
    (7,'known_customer_not_reasked',position('v_known and v_complete' in v23)>0,'complete known customer is confirmation-only'),
    (8,'payment_allowlist',position('cartao_alimentacao' in finalize_order)>0 and position('cartao_entrega' in finalize_order)>0 and position('dinheiro' in finalize_order)>0 and position('pix' in finalize_order)>0,'current delivery payment allowlist enforced'),
    (9,'finalization_fail_closed',position('whatsapp_flow_commercial_write_disabled' in finalize_order)>0 and position('experience_orchestrator_disabled' in finalize_order)>0 and position('whatsapp_flow_data_exchange_disabled' in finalize_order)>0 and position('whatsapp_flow_send_disabled' in finalize_order)>0,'order finalization remains impossible while gates are off'),
    (10,'location_after_confirmed_order',position('location_required' in nfm_legacy)>0 and position('status=''confirmed''' in nfm_legacy)>0,'location request only follows confirmed order'),
    (11,'native_flow_outbound',position('''type'',''flow''' in queue_offer)>0 and position('flow_token' in queue_offer)>0 and position('flow_id' in queue_offer)>0,'outbound payload remains interactive.type=flow'),
    (12,'structural_terminal_ready',coalesce((v39->>'ok')::boolean,false),'terminal checkout structural readiness V39 is green'),
    (13,'gates_safe',v_gates_safe,'canary=1 and all activation/write/Bling gates remain off')
  ) as x(ord,name,ok,detail);

  v_next:=coalesce(v41->>'next_required_evidence','upsell');

  return jsonb_build_object(
    'ok',coalesce(v_ok,false) and coalesce((v41->>'ok')::boolean,false),
    'readiness_version','v42-terminal-physical-test-plan-v1',
    'evidence_session_id',v41->>'evidence_session_id',
    'physical_flow_path_complete',coalesce((v41->>'physical_flow_path_complete')::boolean,false),
    'next_required_evidence',v_next,
    'missing_flow_evidence',coalesce(v41->'missing_flow_evidence','[]'::jsonb),
    'manual_test_required',not coalesce((v41->>'physical_flow_path_complete')::boolean,false),
    'test_plan',jsonb_build_array(
      jsonb_build_object('step',1,'screen','UPSELL','goal','confirm optional session-aware recommendation; skip must remain possible'),
      jsonb_build_object('step',2,'screen','REVISAO','goal','confirm basket + extras + optional upsell and deterministic backend total'),
      jsonb_build_object('step',3,'screen','CLIENTE_EXISTENTE|CLIENTE_NOVO','goal','confirm known data without re-asking; collect only genuinely missing fields'),
      jsonb_build_object('step',4,'screen','FINALIZAR','goal','confirm current payment method and terminal payload while commercial writes stay blocked'),
      jsonb_build_object('step',5,'event','nfm_reply','goal','observe terminal return to WhatsApp; no duplicate processing'),
      jsonb_build_object('step',6,'event','location_request','goal','observe location request only after confirmed order when write gates are intentionally enabled in a future authorized release')
    ),
    'checks',coalesce(v_checks,'[]'::jsonb),
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled
    ),
    'writes_executed',false,
    'orders_created',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v42_terminal_physical_test_plan_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v42_terminal_physical_test_plan_v1(uuid) to service_role;
