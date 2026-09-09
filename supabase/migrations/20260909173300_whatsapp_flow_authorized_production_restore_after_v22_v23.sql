begin;

update public.automation_config
set whatsapp_live_canary_percent=100,
    experience_orchestrator_enabled=true,
    whatsapp_flow_data_exchange_enabled=true,
    whatsapp_flow_send_enabled=true,
    whatsapp_flow_commercial_write_enabled=true,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

update public.experience_feature_flags
set enabled=true,
    rollout_percent=100,
    updated_at=now()
where key in ('flow_basket_commercial','flow_personalize_basket');

update public.experience_definitions
set status='active',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'production_enabled',true,
      'live_percent',100,
      'owner_authorized_100_percent',true,
      'v22_safety_reset_superseded',true,
      'implementation_stage','authorized_production_restore_after_v22_v23'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
