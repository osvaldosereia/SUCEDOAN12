-- Keep WhatsApp Flow homologation isolated until explicit owner authorization.
update public.automation_config
set whatsapp_live_canary_percent = 1,
    experience_orchestrator_enabled = false,
    whatsapp_flow_data_exchange_enabled = false,
    whatsapp_flow_send_enabled = false,
    whatsapp_flow_commercial_write_enabled = false,
    bling_order_sync_enabled = false,
    updated_at = now()
where id = 1;
