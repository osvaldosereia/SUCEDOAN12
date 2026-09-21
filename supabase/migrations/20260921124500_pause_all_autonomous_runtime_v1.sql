-- Owner-requested global pause of autonomous Supabase runtimes on 2026-09-21.
-- Manual Admin operations and integrity/audit triggers remain available.

update public.automation_config
set automation_enabled=false,
    ai_enabled=false,
    outbound_enabled=false,
    conversation_worker_enabled=false,
    whatsapp_inbound_enabled=false,
    whatsapp_auto_reply_enabled=false,
    whatsapp_release_mode='off',
    conversation_worker_dispatch_enabled=false,
    whatsapp_live_canary_percent=0,
    whatsapp_live_started_at=null,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    bling_order_sync_enabled=false,
    whatsapp_sales_mvp_enabled=false,
    whatsapp_sales_images_enabled=false,
    whatsapp_sales_interactive_enabled=false,
    whatsapp_sales_order_submit_enabled=false,
    whatsapp_sales_bling_submit_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    emergency_stop_reason='Owner-requested architecture/cost review 2026-09-21',
    updated_at=now()
where id=1;

update public.agent_core_runtime_config
set enabled=false,
    execution_mode='off',
    learning_write_enabled=false,
    shadow_openai_enabled=false,
    escalation_enabled=false,
    global_candidate_autopublish_enabled=false,
    updated_at=now()
where id=1;

update public.service_simple_runtime_config
set enabled=false,
    classifier_ai_enabled=false,
    generative_ai_enabled=false,
    humanize_all_replies=false,
    updated_at=now()
where id=1;

update public.product_image_automation_settings
set is_enabled=false,
    updated_at=now();

update public.automation_workflows
set enabled=false,
    execution_mode='off',
    canary_percent=0,
    kill_switch=true,
    updated_at=now()
where enabled is distinct from false
   or execution_mode is distinct from 'off'
   or canary_percent is distinct from 0
   or kill_switch is distinct from true;
