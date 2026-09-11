begin;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v5(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  c public.conversations%rowtype;
  d public.experience_definitions%rowtype;
  checks jsonb := '[]'::jsonb;
  gates_ok boolean := false;
  definition_ok boolean := false;
  runtime_ok boolean := false;
  edge_ok boolean := false;
  conversation_ok boolean := false;
  allowlist_ok boolean := false;
  handoff_ok boolean := false;
  all_ok boolean := false;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  select * into c from public.conversations where id=p_conversation_id;

  gates_ok := found
    and coalesce(cfg.whatsapp_live_canary_percent,0)=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false);

  definition_ok := d.id is not null
    and d.status='ready'
    and nullif(d.provider_id,'') is not null
    and upper(coalesce(d.metadata->>'meta_status',''))='DRAFT'
    and coalesce((d.metadata->>'candidate_not_live')::boolean,false)
    and not coalesce((d.metadata->>'customer_exposure')::boolean,true)
    and not coalesce((d.metadata->>'default_for_new_sessions')::boolean,true)
    and not coalesce((d.config->>'production_enabled')::boolean,true)
    and coalesce((d.config->>'never_load_full_catalog')::boolean,false)
    and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)
    and coalesce((d.config->>'max_products_per_query')::int,0) between 1 and 20
    and not coalesce((d.config->>'ai_catalog_authoritative')::boolean,true)
    and not coalesce((d.config->>'component_prices_visible')::boolean,true);

  runtime_ok := to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)') is not null
    and coalesce(d.metadata->>'handler_version','')='v26'
    and coalesce(d.metadata->>'commercial_handler','')='handle_whatsapp_flow_commercial_exchange_v26'
    and coalesce(d.config->>'handler_version','')='v26';

  edge_ok := coalesce((d.metadata->>'edge_version')::int,0)=49
    and coalesce((d.config->>'runtime_edge_version')::int,0)=49;

  conversation_ok := c.id is not null
    and c.mode='ai'
    and c.service_window_expires_at>now()
    and nullif(c.wa_contact_e164,'') is not null;

  if c.id is not null then
    select exists(
      select 1 from public.whatsapp_test_allowlist w
      where w.phone_e164=c.wa_contact_e164
        and w.enabled
        and w.purpose='controlled_live_homologation'
        and (w.expires_at is null or w.expires_at>now())
    ) into allowlist_ok;

    select not exists(
      select 1 from public.human_handoffs h
      where h.conversation_id=c.id and h.status in ('open','claimed')
    ) into handoff_ok;
  end if;

  checks := jsonb_build_array(
    jsonb_build_object('name','rollout_gates_locked','ok',gates_ok),
    jsonb_build_object('name','stable_candidate_isolated','ok',definition_ok),
    jsonb_build_object('name','runtime_v26_aligned','ok',runtime_ok),
    jsonb_build_object('name','edge_49_aligned','ok',edge_ok),
    jsonb_build_object('name','owner_conversation_service_window','ok',conversation_ok),
    jsonb_build_object('name','owner_recipient_allowlisted','ok',allowlist_ok),
    jsonb_build_object('name','no_human_handoff_active','ok',handoff_ok)
  );

  all_ok := gates_ok and definition_ok and runtime_ok and edge_ok and conversation_ok and allowlist_ok and handoff_ok;

  return jsonb_build_object(
    'ok',all_ok,
    'checks',checks,
    'definition_slug',coalesce(d.slug,''),
    'provider_id_present',nullif(coalesce(d.provider_id,''),'') is not null,
    'handler_version',coalesce(d.metadata->>'handler_version',''),
    'edge_version',coalesce((d.metadata->>'edge_version')::int,0),
    'conversation_id',p_conversation_id,
    'owner_only',true,
    'writes_performed',false,
    'preflight_version','v5-runtime-v26-edge49'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v5(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v5(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_preflight jsonb;
  v_lease jsonb;
  v_result jsonb;
  v_session_id uuid;
  v_session public.experience_sessions%rowtype;
begin
  v_preflight := public.get_whatsapp_flow_owner_homologation_preflight_v5(p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'reason','owner_conversation_preflight_v5_failed',
      'preflight',v_preflight,
      'dispatch_version','v8-runtime-v26-edge49'
    );
  end if;

  v_lease := public.renew_whatsapp_flow_owner_homologation_lease_v1(p_conversation_id);
  if not coalesce((v_lease->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'reason','homologation_lease_failed',
      'preflight',v_preflight,
      'lease',v_lease,
      'dispatch_version','v8-runtime-v26-edge49'
    );
  end if;

  v_result := public.queue_and_dispatch_whatsapp_flow_owner_homologation_v2(
    p_conversation_id,p_idempotency_key,p_body_text
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result || jsonb_build_object(
      'preflight_v5',v_preflight,
      'lease',v_lease,
      'dispatch_version','v8-runtime-v26-edge49'
    );
  end if;

  v_session_id := (v_result->>'session_id')::uuid;
  select * into v_session from public.experience_sessions where id=v_session_id;
  if not found
     or v_session.conversation_id<>p_conversation_id
     or v_session.status not in ('offered','open')
     or v_session.expires_at<=now()
     or coalesce((v_session.context->>'homologation_test')::boolean,false) is not true
     or coalesce((v_session.context->>'requested_by_owner')::boolean,false) is not true then
    raise exception 'v8_post_dispatch_session_guard_failed';
  end if;

  return v_result || jsonb_build_object(
    'preflight_v5',v_preflight,
    'lease',v_lease,
    'runtime_handler','v26',
    'edge_version',49,
    'dispatch_version','v8-runtime-v26-edge49'
  );
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text) to service_role;

create or replace function public.get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v50 jsonb;
  checks jsonb;
  v8_present boolean;
  preflight_present boolean;
  runtime_ok boolean;
  edge_ok boolean;
  gates_ok boolean;
  all_ok boolean;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  v50 := public.get_whatsapp_flow_v50_owner_launch_dry_run_v1();

  v8_present := to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text)') is not null;
  preflight_present := to_regprocedure('public.get_whatsapp_flow_owner_homologation_preflight_v5(uuid)') is not null;
  runtime_ok := to_regprocedure('public.handle_whatsapp_flow_commercial_exchange_v26(uuid,uuid,text,text,jsonb)') is not null
    and coalesce(d.metadata->>'handler_version','')='v26'
    and coalesce(d.config->>'handler_version','')='v26';
  edge_ok := coalesce((d.metadata->>'edge_version')::int,0)=49
    and coalesce((d.config->>'runtime_edge_version')::int,0)=49;
  gates_ok := coalesce(cfg.whatsapp_live_canary_percent,0)=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false);

  checks := jsonb_build_array(
    jsonb_build_object('name','v50_dry_run_green','ok',coalesce((v50->>'ok')::boolean,false)),
    jsonb_build_object('name','owner_preflight_v5_present','ok',preflight_present),
    jsonb_build_object('name','owner_dispatch_v8_present','ok',v8_present),
    jsonb_build_object('name','runtime_v26_aligned','ok',runtime_ok),
    jsonb_build_object('name','edge_49_aligned','ok',edge_ok),
    jsonb_build_object('name','rollout_gates_locked','ok',gates_ok)
  );
  all_ok := coalesce((v50->>'ok')::boolean,false) and preflight_present and v8_present and runtime_ok and edge_ok and gates_ok;

  return jsonb_build_object(
    'ok',all_ok,
    'checks',checks,
    'dispatch_version','v8-runtime-v26-edge49',
    'preflight_version','v5-runtime-v26-edge49',
    'runtime_handler','v26',
    'edge_version',49,
    'writes_performed',false,
    'physical_send_performed',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1() to service_role;

commit;
