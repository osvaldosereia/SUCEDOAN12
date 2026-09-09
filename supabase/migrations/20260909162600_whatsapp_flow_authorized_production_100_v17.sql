begin;

-- Autorização explícita do proprietário em 2026-09-09: Flow comercial em produção para 100%.
-- Esta migração é posterior ao restore de homologação legado e passa a ser o estado autoritativo.
update public.automation_config
set whatsapp_live_canary_percent=100,
    experience_orchestrator_enabled=true,
    whatsapp_flow_data_exchange_enabled=true,
    whatsapp_flow_send_enabled=true,
    whatsapp_flow_commercial_write_enabled=true,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

update public.experience_definitions
set status='active',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'production_enabled',true,
      'live_percent',100,
      'owner_authorized_100_percent',true,
      'owner_authorized_100_percent_at',now(),
      'customer_checkout_constraint_fixed',true,
      'legacy_homologation_restore_superseded',true,
      'implementation_stage','authorized_production_100_v17'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
