-- function_grant: catalog_customer_admin_context_v1(p_phone_e164 text)
-- acl whatsapp_ordering_private.catalog_customer_admin_context_v1(p_phone_e164 text): postgres=X/postgres

-- function_grant: catalog_order_intent_confirm_v1(p_intent_id uuid, p_confirmation_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_conversation_id uuid, p_inbound_message_id text, p_reply_to_message_id text, p_confirmation_token_hash text, p_sender_phone_e164 text, p_sender_provider_id text)
-- acl whatsapp_ordering_private.catalog_order_intent_confirm_v1(p_intent_id uuid, p_confirmation_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_conversation_id uuid, p_inbound_message_id text, p_reply_to_message_id text, p_confirmation_token_hash text, p_sender_phone_e164 text, p_sender_provider_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: catalog_quote_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_items jsonb)
-- acl whatsapp_ordering_private.catalog_quote_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_items jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: flow_confirmation_summary_v1(p_quote jsonb)
-- acl whatsapp_ordering_private.flow_confirmation_summary_v1(p_quote jsonb): postgres=X/postgres service_role=X/postgres
