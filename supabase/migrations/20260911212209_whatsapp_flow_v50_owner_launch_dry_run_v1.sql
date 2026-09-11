create or replace function public.get_whatsapp_flow_v50_owner_launch_dry_run_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v49 jsonb;
  checks jsonb;
  interactive_payload jsonb;
  v_slug text := 'flow-cestas-comercial-v8-stable';
begin
  select * into cfg from public.automation_config where id=1;
  v49 := public.get_whatsapp_flow_v49_physical_terminal_evidence_v1();

  select * into d
  from public.experience_definitions
  where slug=v_slug and experience_type='whatsapp_flow'
  limit 1;

  interactive_payload := jsonb_build_object(
    'type','flow',
    'body',jsonb_build_object('text','Escolha sua cesta e monte seu pedido aqui pelo WhatsApp.'),
    'action',jsonb_build_object(
      'name','flow',
      'parameters',jsonb_build_object(
        'flow_message_version','3',
        'flow_token','__ISSUED_ONLY_AT_OWNER_HOMOLOGATION_SEND__',
        'flow_id',coalesce(d.provider_id,''),
        'flow_cta',coalesce(nullif(d.config->>'flow_cta',''),'Montar pedido'),
        'flow_action',coalesce(nullif(d.config->>'flow_action',''),'data_exchange')
      )
    )
  );

  checks := jsonb_build_array(
    jsonb_build_object('name','v49_preflight_still_green','ok',coalesce((v49->>'preflight_ok')::boolean,false)),
    jsonb_build_object('name','stable_definition_ready','ok',d.id is not null and d.status='ready' and coalesce(d.provider_id,'')<>''),
    jsonb_build_object('name','candidate_not_production','ok',not coalesce((d.config->>'production_enabled')::boolean,false)),
    jsonb_build_object('name','catalog_never_full','ok',coalesce((d.config->>'never_load_full_catalog')::boolean,false) and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)),
    jsonb_build_object('name','product_query_hard_cap_20','ok',coalesce((d.config->>'max_products_per_query')::int,999)<=20),
    jsonb_build_object('name','ai_not_catalog_authority','ok',not coalesce((d.config->>'ai_catalog_authoritative')::boolean,true)),
    jsonb_build_object('name','component_prices_hidden','ok',not coalesce((d.config->>'component_prices_visible')::boolean,true)),
    jsonb_build_object('name','data_exchange_action','ok',coalesce(d.config->>'flow_action','')='data_exchange'),
    jsonb_build_object('name','rollout_gates_locked','ok',
      coalesce(cfg.whatsapp_live_canary_percent,0)=1
      and not cfg.experience_orchestrator_enabled
      and not cfg.whatsapp_flow_data_exchange_enabled
      and not cfg.whatsapp_flow_send_enabled
      and not cfg.whatsapp_flow_commercial_write_enabled
      and not cfg.bling_order_sync_enabled),
    jsonb_build_object('name','new_physical_session_required','ok',coalesce(v49#>>'{session,status}','') in ('abandoned','completed','expired')),
    jsonb_build_object('name','physical_terminal_evidence_not_faked','ok',not coalesce((v49->>'ok')::boolean,false))
  );

  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'checks',checks,
    'definition',jsonb_build_object(
      'slug',d.slug,
      'provider_id',d.provider_id,
      'status',d.status,
      'handler_version',d.config->>'handler_version',
      'runtime_edge_version',d.config->>'runtime_edge_version',
      'flow_json_version',d.config->>'flow_json_version'
    ),
    'dry_run_interactive',interactive_payload,
    'safety',jsonb_build_object(
      'writes_performed',false,
      'session_created',false,
      'token_issued',false,
      'outbound_created',false,
      'message_created',false,
      'order_created',false,
      'send_gate_enabled',cfg.whatsapp_flow_send_enabled,
      'data_exchange_gate_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_enabled',cfg.bling_order_sync_enabled,
      'canary_percent',cfg.whatsapp_live_canary_percent
    ),
    'physical_evidence',jsonb_build_object(
      'current_ok',coalesce((v49->>'ok')::boolean,false),
      'next_required',v49->>'next_required',
      'observed_screens',v49->'observed_screens',
      'new_session_required',true
    )
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v50_owner_launch_dry_run_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v50_owner_launch_dry_run_v1() to service_role;
