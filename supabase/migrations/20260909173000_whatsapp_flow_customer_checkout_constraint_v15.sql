begin;

alter table public.whatsapp_flow_write_operations
  drop constraint if exists whatsapp_flow_write_operation_type_check;

alter table public.whatsapp_flow_write_operations
  add constraint whatsapp_flow_write_operation_type_check
  check (operation_type = any (array[
    'start_basket'::text,
    'apply_basket_selection'::text,
    'set_addon'::text,
    'set_upsell'::text,
    'set_customer_checkout'::text
  ]));

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'customer_checkout_constraint_fixed',true,
      'customer_checkout_constraint_fixed_at',now(),
      'implementation_stage','customer_checkout_constraint_v15'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

-- Mantém produção protegida até o smoke de cliente novo passar.
update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
