begin;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'external_customer_e2e_verified',false,
  'external_customer_e2e_pending_reason','no_external_test_number_available',
  'papoai_lab_key_rotation_required',true,
  'papoai_channel_link_current_verified',false,
  'production_activation_authorized',false
),
updated_at=now()
where id=1;

create or replace function public.get_papoai_commerce_activation_readiness_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_agent public.agent_core_runtime_config%rowtype;
  v_auto public.automation_config%rowtype;
  v_adapter public.channel_provider_adapters%rowtype;
  v_catalog jsonb;
  v_request_state text;
  v_text_state text;
  v_session_state text;
  v_media_state text;
  v_key_present boolean:=false;
  v_bearer_present boolean:=false;
  v_transport_ready boolean:=false;
  v_data_ready boolean:=false;
  v_safety_ready boolean:=false;
  v_ready_external_test boolean:=false;
  v_ready_production boolean:=false;
  v_external_verified boolean:=false;
  v_rotation_required boolean:=true;
  v_channel_link_verified boolean:=false;
  v_prod_authorized boolean:=false;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  select * into v_agent from public.agent_core_runtime_config where id=1;
  select * into v_auto from public.automation_config where id=1;

  select * into v_adapter
  from public.channel_provider_adapters
  where provider_key='papoai' and channel='whatsapp'
  order by updated_at desc
  limit 1;

  v_catalog:=public.get_papoai_commerce_readiness_v1();
  v_data_ready:=coalesce((v_catalog->>'ok')::boolean,false);

  if v_adapter.id is not null then
    select state into v_request_state
    from public.channel_provider_capability_evidence
    where adapter_id=v_adapter.id and capability_key='agent_external.request';

    select state into v_text_state
    from public.channel_provider_capability_evidence
    where adapter_id=v_adapter.id and capability_key='agent_external.text_reply';

    select state into v_session_state
    from public.channel_provider_capability_evidence
    where adapter_id=v_adapter.id and capability_key='agent_external.session';

    select state into v_media_state
    from public.channel_provider_capability_evidence
    where adapter_id=v_adapter.id and capability_key='agent_external.media_reply';
  end if;

  begin
    v_key_present:=nullif(public.get_papoai_agent_external_lab_key_v1(),'') is not null;
  exception when others then
    v_key_present:=false;
  end;

  begin
    v_bearer_present:=nullif(public.get_papoai_agent_external_response_bearer_v1(),'') is not null;
  exception when others then
    v_bearer_present:=false;
  end;

  v_transport_ready:=
    v_adapter.id is not null
    and v_adapter.status in ('temporary_active','active')
    and v_adapter.inbound_mode='active'
    and v_request_state='verified_lab'
    and v_text_state='verified_lab'
    and v_session_state='verified_lab'
    and v_key_present
    and v_bearer_present;

  v_external_verified:=coalesce((v_cfg.metadata->>'external_customer_e2e_verified')::boolean,false);
  v_rotation_required:=coalesce((v_cfg.metadata->>'papoai_lab_key_rotation_required')::boolean,true);
  v_channel_link_verified:=coalesce((v_cfg.metadata->>'papoai_channel_link_current_verified')::boolean,false);
  v_prod_authorized:=coalesce((v_cfg.metadata->>'production_activation_authorized')::boolean,false);

  v_safety_ready:=
    coalesce(v_cfg.bling_queue_enabled,false)=false
    and coalesce(v_cfg.learning_enqueue_enabled,false)=false
    and coalesce(v_agent.learning_write_enabled,false)=false
    and coalesce(v_auto.bling_order_sync_enabled,false)=false
    and coalesce(v_auto.whatsapp_sales_bling_submit_enabled,false)=false
    and coalesce(v_auto.bling_order_homologation_only,true)=true
    and to_regprocedure('public.get_papoai_commerce_human_precedence_v1(uuid)') is not null
    and to_regprocedure('public.persist_papoai_commerce_message_v1(uuid,text,text,text,text,jsonb)') is not null;

  v_ready_external_test:=v_data_ready and v_transport_ready and v_safety_ready;

  v_ready_production:=
    v_ready_external_test
    and v_external_verified
    and not v_rotation_required
    and v_channel_link_verified
    and v_prod_authorized
    and v_media_state in ('verified_lab','verified_real');

  if not v_data_ready then
    v_blockers:=v_blockers||jsonb_build_array('catalog_or_basket_readiness_failed');
  end if;
  if not v_transport_ready then
    v_blockers:=v_blockers||jsonb_build_array('papoai_transport_not_fully_verified');
  end if;
  if not v_safety_ready then
    v_blockers:=v_blockers||jsonb_build_array('safety_gates_not_in_safe_homologation_state');
  end if;
  if not v_external_verified then
    v_blockers:=v_blockers||jsonb_build_array('external_customer_e2e_test_pending');
  end if;
  if v_rotation_required then
    v_blockers:=v_blockers||jsonb_build_array('rotate_exposed_homologation_api_key');
  end if;
  if not v_channel_link_verified then
    v_blockers:=v_blockers||jsonb_build_array('confirm_current_papoai_channel_agent_link');
  end if;
  if not v_prod_authorized then
    v_blockers:=v_blockers||jsonb_build_array('production_activation_not_authorized');
  end if;

  if v_media_state='observed_ui' then
    v_warnings:=v_warnings||jsonb_build_array('media_reply_observed_in_ui_but_not_physically_verified');
  elsif coalesce(v_media_state,'unknown') not in ('verified_lab','verified_real') then
    v_warnings:=v_warnings||jsonb_build_array('media_reply_not_verified');
  end if;

  return jsonb_build_object(
    'ready_for_external_homologation_test',v_ready_external_test,
    'ready_for_production',v_ready_production,
    'data_ready',v_data_ready,
    'transport_ready',v_transport_ready,
    'safety_ready',v_safety_ready,
    'external_customer_e2e_verified',v_external_verified,
    'papoai_channel_link_current_verified',v_channel_link_verified,
    'api_key_rotation_required',v_rotation_required,
    'production_activation_authorized',v_prod_authorized,
    'capabilities',jsonb_build_object(
      'request',coalesce(v_request_state,'unknown'),
      'text_reply',coalesce(v_text_state,'unknown'),
      'session',coalesce(v_session_state,'unknown'),
      'media_reply',coalesce(v_media_state,'unknown')
    ),
    'adapter',jsonb_build_object(
      'present',v_adapter.id is not null,
      'status',v_adapter.status,
      'inbound_mode',v_adapter.inbound_mode,
      'outbound_mode',v_adapter.outbound_mode
    ),
    'gates',jsonb_build_object(
      'commerce_enabled',coalesce(v_cfg.enabled,false),
      'write_enabled',coalesce(v_cfg.write_enabled,false),
      'ai_enabled',coalesce(v_cfg.ai_enabled,false),
      'governor_enabled',coalesce((v_cfg.metadata->>'conversation_governor_enabled')::boolean,false),
      'bling_queue_enabled',coalesce(v_cfg.bling_queue_enabled,false),
      'learning_enqueue_enabled',coalesce(v_cfg.learning_enqueue_enabled,false),
      'agent_learning_write_enabled',coalesce(v_agent.learning_write_enabled,false)
    ),
    'catalog',v_catalog,
    'blockers',v_blockers,
    'warnings',v_warnings
  );
end;
$$;

revoke all on function public.get_papoai_commerce_activation_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_activation_readiness_v1() to service_role;

commit;
