-- index: admin_audit_logs_admin_idx
CREATE INDEX admin_audit_logs_admin_idx ON public.admin_audit_logs USING btree (admin_user_id, created_at DESC) WHERE (admin_user_id IS NOT NULL);

-- index: admin_audit_logs_created_idx
CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs USING btree (created_at DESC);

-- index: admin_audit_logs_entity_idx
CREATE INDEX admin_audit_logs_entity_idx ON public.admin_audit_logs USING btree (entity_type, entity_id, created_at DESC);

-- index: admin_saved_card_uses_v1_card_used_at_idx
CREATE INDEX admin_saved_card_uses_v1_card_used_at_idx ON public.admin_saved_card_uses_v1 USING btree (card_id, used_at DESC);

-- index: admin_saved_cards_v1_created_at_idx
CREATE INDEX admin_saved_cards_v1_created_at_idx ON public.admin_saved_cards_v1 USING btree (created_at DESC);

-- index: assembly_kit_items_product_idx
CREATE INDEX assembly_kit_items_product_idx ON public.assembly_kit_items USING btree (product_id, kit_id);

-- index: assembly_kits_active_type_name_idx
CREATE INDEX assembly_kits_active_type_name_idx ON public.assembly_kits USING btree (is_active, type, name);

-- index: assembly_search_chips_active_sort_idx
CREATE INDEX assembly_search_chips_active_sort_idx ON public.assembly_search_chips USING btree (is_active, sort_order, label);

-- index: assembly_search_chips_label_lower_uidx
CREATE UNIQUE INDEX assembly_search_chips_label_lower_uidx ON public.assembly_search_chips USING btree (lower(btrim(label))) WHERE (is_active = true);

-- index: attendance_conversation_auto_labels_v1_conversation_idx
CREATE INDEX attendance_conversation_auto_labels_v1_conversation_idx ON public.attendance_conversation_auto_labels_v1 USING btree (conversation_id, label_id);

-- index: attendance_conversation_labels_v1_label_idx
CREATE INDEX attendance_conversation_labels_v1_label_idx ON public.attendance_conversation_labels_v1 USING btree (label_id, conversation_id);

-- index: attendance_conversation_state_v1_follow_up_idx
CREATE INDEX attendance_conversation_state_v1_follow_up_idx ON public.attendance_conversation_state_v1 USING btree (follow_up_at) WHERE (follow_up_at IS NOT NULL);

-- index: attendance_human_ai_audit_v1_conversation_created_idx
CREATE INDEX attendance_human_ai_audit_v1_conversation_created_idx ON public.attendance_human_ai_audit_v1 USING btree (conversation_id, created_at DESC);

-- index: attendance_labels_v1_active_name_uidx
CREATE UNIQUE INDEX attendance_labels_v1_active_name_uidx ON public.attendance_labels_v1 USING btree (lower(btrim(name))) WHERE (is_active = true);

-- index: attendance_library_audit_v1_conversation_created_idx
CREATE INDEX attendance_library_audit_v1_conversation_created_idx ON public.attendance_library_audit_v1 USING btree (conversation_id, created_at DESC);

-- index: attendance_library_audit_v1_item_created_idx
CREATE INDEX attendance_library_audit_v1_item_created_idx ON public.attendance_library_audit_v1 USING btree (item_id, created_at DESC);

-- index: attendance_library_items_v1_active_created_idx
CREATE INDEX attendance_library_items_v1_active_created_idx ON public.attendance_library_items_v1 USING btree (is_active, created_at DESC);

-- index: attendance_library_items_v1_category_active_created_idx
CREATE INDEX attendance_library_items_v1_category_active_created_idx ON public.attendance_library_items_v1 USING btree (category, is_active, created_at DESC);

-- index: attendance_library_items_v1_kind_active_created_idx
CREATE INDEX attendance_library_items_v1_kind_active_created_idx ON public.attendance_library_items_v1 USING btree (media_kind, is_active, created_at DESC);

-- index: attendance_library_items_v1_upload_status_idx
CREATE INDEX attendance_library_items_v1_upload_status_idx ON public.attendance_library_items_v1 USING btree (upload_status, upload_expires_at);

-- index: attendance_media_cache_v1_expires_idx
CREATE INDEX attendance_media_cache_v1_expires_idx ON public.attendance_media_cache_v1 USING btree (expires_at);

-- index: attendance_msg_account_conversation_created_idx
CREATE INDEX attendance_msg_account_conversation_created_idx ON public.whatsapp_messages_v1 USING btree (whatsapp_account_id, conversation_id, created_at DESC);

-- index: attendance_pending_orders_idx
CREATE INDEX attendance_pending_orders_idx ON public.orders USING btree (created_at DESC, conversation_id, whatsapp_account_id) WHERE ((status = 'storefront_received'::text) AND (confirmed_at IS NULL) AND (cancelled_at IS NULL));

-- index: attendance_quick_replies_v1_active_title_uidx
CREATE UNIQUE INDEX attendance_quick_replies_v1_active_title_uidx ON public.attendance_quick_replies_v1 USING btree (lower(btrim(title))) WHERE (is_active = true);

-- index: basket_admin_basket_types_linked_uidx
CREATE UNIQUE INDEX basket_admin_basket_types_linked_uidx ON public.basket_admin_basket_types USING btree (linked_basket_id) WHERE (linked_basket_id IS NOT NULL);

-- index: basket_admin_basket_types_name_lower_uidx
CREATE UNIQUE INDEX basket_admin_basket_types_name_lower_uidx ON public.basket_admin_basket_types USING btree (lower(name));

-- index: basket_admin_product_options_order_idx
CREATE INDEX basket_admin_product_options_order_idx ON public.basket_admin_product_options USING btree (product_type_id, sort_order, product_id);

-- index: basket_admin_product_types_name_category_lower_uidx
CREATE UNIQUE INDEX basket_admin_product_types_name_category_lower_uidx ON public.basket_admin_product_types USING btree (category, lower(name));

-- index: basket_alternatives_item_idx
CREATE INDEX basket_alternatives_item_idx ON public.basket_template_item_alternatives USING btree (template_item_id, priority);

-- index: basket_alternatives_product_idx
CREATE INDEX basket_alternatives_product_idx ON public.basket_template_item_alternatives USING btree (product_id);

-- index: basket_categories_name_lower_uq
CREATE UNIQUE INDEX basket_categories_name_lower_uq ON public.basket_categories USING btree (lower(TRIM(BOTH FROM name)));

-- index: basket_categories_slug_uq
CREATE UNIQUE INDEX basket_categories_slug_uq ON public.basket_categories USING btree (slug);

-- index: basket_extra_theme_products_product_idx
CREATE INDEX basket_extra_theme_products_product_idx ON public.basket_extra_theme_products USING btree (product_id);

-- index: basket_mold_position_options_position_order_idx
CREATE INDEX basket_mold_position_options_position_order_idx ON public.basket_mold_position_options USING btree (position_id, sort_order, id);

-- index: basket_mold_position_options_product_idx
CREATE INDEX basket_mold_position_options_product_idx ON public.basket_mold_position_options USING btree (product_id);

-- index: basket_mold_positions_mold_order_idx
CREATE INDEX basket_mold_positions_mold_order_idx ON public.basket_mold_positions USING btree (mold_id, sort_order, id);

-- index: basket_mold_shared_options_item_order_idx
CREATE INDEX basket_mold_shared_options_item_order_idx ON public.basket_mold_shared_item_options USING btree (shared_item_id, sort_order);

-- index: basket_molds_conditional_hidden_product_idx
CREATE INDEX basket_molds_conditional_hidden_product_idx ON public.basket_molds USING btree (conditional_hidden_product_id) WHERE (conditional_hidden_product_id IS NOT NULL);

-- index: basket_subcategories_order_idx
CREATE INDEX basket_subcategories_order_idx ON public.basket_subcategories USING btree (category_id, sort_order, name);

-- index: basket_template_items_product_idx
CREATE INDEX basket_template_items_product_idx ON public.basket_template_items USING btree (product_id);

-- index: basket_templates_active_sort_idx
CREATE INDEX basket_templates_active_sort_idx ON public.basket_templates USING btree (is_active, is_whatsapp_active, sort_order, name);

-- index: basket_templates_category_idx
CREATE INDEX basket_templates_category_idx ON public.basket_templates USING btree (category_id);

-- index: basket_templates_updated_by_idx
CREATE INDEX basket_templates_updated_by_idx ON public.basket_templates USING btree (updated_by) WHERE (updated_by IS NOT NULL);

-- index: bling_hub_audit_v2_created_idx
CREATE INDEX bling_hub_audit_v2_created_idx ON public.bling_hub_audit_v2 USING btree (created_at DESC);

-- index: bling_hub_audit_v2_job_idx
CREATE INDEX bling_hub_audit_v2_job_idx ON public.bling_hub_audit_v2 USING btree (job_id) WHERE (job_id IS NOT NULL);

-- index: bling_hub_canary_allowlist_v2_active_idx
CREATE INDEX bling_hub_canary_allowlist_v2_active_idx ON public.bling_hub_canary_allowlist_v2 USING btree (domain, source_system, source_id) WHERE (enabled = true);

-- index: bling_hub_entity_links_v2_bling_idx
CREATE INDEX bling_hub_entity_links_v2_bling_idx ON public.bling_hub_entity_links_v2 USING btree (entity_type, bling_id) WHERE (bling_id IS NOT NULL);

-- index: bling_hub_entity_links_v2_identity_idx
CREATE INDEX bling_hub_entity_links_v2_identity_idx ON public.bling_hub_entity_links_v2 USING btree (entity_type, identity_kind, identity_value) WHERE (identity_value IS NOT NULL);

-- index: bling_hub_jobs_v2_claim_idx
CREATE INDEX bling_hub_jobs_v2_claim_idx ON public.bling_hub_jobs_v2 USING btree (status, next_attempt_at, created_at);

-- index: bling_hub_jobs_v2_correlation_idx
CREATE INDEX bling_hub_jobs_v2_correlation_idx ON public.bling_hub_jobs_v2 USING btree (correlation_id);

-- index: bling_hub_jobs_v2_source_idx
CREATE INDEX bling_hub_jobs_v2_source_idx ON public.bling_hub_jobs_v2 USING btree (source_system, domain, source_id, created_at DESC);

-- index: bling_order_stock_controls_state_idx
CREATE INDEX bling_order_stock_controls_state_idx ON public.bling_order_stock_controls_v2 USING btree (state, updated_at DESC);

-- index: bling_product_binding_events_product_idx
CREATE INDEX bling_product_binding_events_product_idx ON public.bling_product_binding_events USING btree (product_id, created_at DESC);

-- index: bling_stock_mirror_observed_idx
CREATE INDEX bling_stock_mirror_observed_idx ON public.bling_stock_mirror_v2 USING btree (observed_at DESC);

-- index: bling_webhook_inbox_v2_claim_idx
CREATE INDEX bling_webhook_inbox_v2_claim_idx ON public.bling_webhook_inbox_v2 USING btree (status, next_attempt_at, received_at);

-- index: bling_webhook_inbox_v2_event_at_idx
CREATE INDEX bling_webhook_inbox_v2_event_at_idx ON public.bling_webhook_inbox_v2 USING btree (event_at DESC);

-- index: bling_webhook_inbox_v2_resource_idx
CREATE INDEX bling_webhook_inbox_v2_resource_idx ON public.bling_webhook_inbox_v2 USING btree (resource, provider_entity_id, received_at DESC);

-- index: caneca_studio_jobs_guest_created_idx
CREATE INDEX caneca_studio_jobs_guest_created_idx ON public.caneca_studio_jobs USING btree (guest_session_id, created_at DESC) WHERE (guest_session_id IS NOT NULL);

-- index: caneca_studio_jobs_owner_created_idx
CREATE INDEX caneca_studio_jobs_owner_created_idx ON public.caneca_studio_jobs USING btree (created_by, created_at DESC);

-- index: capineca_b2b_jobs_expiration_idx
CREATE INDEX capineca_b2b_jobs_expiration_idx ON public.capineca_b2b_jobs USING btree (expires_at);

-- index: carts_basket_idx
CREATE INDEX carts_basket_idx ON public.carts USING btree (basket_id);

-- index: carts_conversation_status_idx
CREATE INDEX carts_conversation_status_idx ON public.carts USING btree (conversation_id, status);

-- index: carts_customer_idx
CREATE INDEX carts_customer_idx ON public.carts USING btree (customer_id);

-- index: carts_customer_status_idx
CREATE INDEX carts_customer_status_idx ON public.carts USING btree (customer_id, status, updated_at DESC) WHERE (customer_id IS NOT NULL);

-- index: carts_one_draft_per_conversation_uidx
CREATE UNIQUE INDEX carts_one_draft_per_conversation_uidx ON public.carts USING btree (conversation_id) WHERE (status = 'draft'::text);

-- index: catalog_sessions_cart_id_idx
CREATE INDEX catalog_sessions_cart_id_idx ON public.catalog_sessions USING btree (cart_id);

-- index: catalog_sessions_conversation_open_idx
CREATE INDEX catalog_sessions_conversation_open_idx ON public.catalog_sessions USING btree (conversation_id, status, expires_at DESC);

-- index: conversations_assigned_admin_idx
CREATE INDEX conversations_assigned_admin_idx ON public.conversations USING btree (assigned_admin_user_id, updated_at DESC) WHERE (assigned_admin_user_id IS NOT NULL);

-- index: conversations_automation_cohort_idx
CREATE INDEX conversations_automation_cohort_idx ON public.conversations USING btree (automation_cohort, created_at DESC);

-- index: conversations_channel_identity_idx
CREATE INDEX conversations_channel_identity_idx ON public.conversations USING btree (channel, channel_account_id, external_user_id) WHERE (external_user_id IS NOT NULL);

-- index: conversations_customer_idx
CREATE INDEX conversations_customer_idx ON public.conversations USING btree (customer_id, created_at DESC);

-- index: conversations_instagram_open_identity_uidx
CREATE UNIQUE INDEX conversations_instagram_open_identity_uidx ON public.conversations USING btree (channel_account_id, external_user_id) WHERE ((channel = 'instagram'::text) AND (status <> 'closed'::text) AND (channel_account_id IS NOT NULL) AND (external_user_id IS NOT NULL));

-- index: conversations_last_inbound_idx
CREATE INDEX conversations_last_inbound_idx ON public.conversations USING btree (last_inbound_at DESC) WHERE (last_inbound_at IS NOT NULL);

-- index: conversations_lookup_idx
CREATE INDEX conversations_lookup_idx ON public.conversations USING btree (whatsapp_account_id, wa_contact_e164, status);

-- index: conversations_mode_status_idx
CREATE INDEX conversations_mode_status_idx ON public.conversations USING btree (mode, status, updated_at DESC);

-- index: conversations_open_lookup_idx
CREATE INDEX conversations_open_lookup_idx ON public.conversations USING btree (whatsapp_account_id, wa_contact_e164, updated_at DESC) WHERE (status <> 'closed'::text);

-- index: cosmos_ean_capture_research_attempted_at_idx
CREATE INDEX cosmos_ean_capture_research_attempted_at_idx ON public.cosmos_ean_capture_research_v1 USING btree (attempted_at);

-- index: cosmos_family_members_by_family_idx
CREATE INDEX cosmos_family_members_by_family_idx ON public.cosmos_catalog_family_members USING btree (family_id);

-- index: cosmos_product_research_status_idx
CREATE INDEX cosmos_product_research_status_idx ON public.cosmos_product_research USING btree (status, retry_after, created_at);

-- index: cosmos_research_requests_product_idx
CREATE INDEX cosmos_research_requests_product_idx ON public.cosmos_research_requests USING btree (product_id, created_at DESC);

-- index: customer_address_reference_photos_v1_latest_idx
CREATE INDEX customer_address_reference_photos_v1_latest_idx ON public.customer_address_reference_photos_v1 USING btree (customer_address_id, captured_at DESC, id DESC);

-- index: customer_emails_customer_idx
CREATE INDEX customer_emails_customer_idx ON public.customer_emails USING btree (customer_id, verification_status, created_at DESC);

-- index: customer_emails_primary_uidx
CREATE UNIQUE INDEX customer_emails_primary_uidx ON public.customer_emails USING btree (customer_id) WHERE ((is_primary = true) AND (verification_status = 'verified'::text));

-- index: customer_emails_verified_uidx
CREATE UNIQUE INDEX customer_emails_verified_uidx ON public.customer_emails USING btree (email_normalized) WHERE (verification_status = 'verified'::text);

-- index: customer_identity_profiles_phone_idx
CREATE INDEX customer_identity_profiles_phone_idx ON public.customer_identity_profiles_v1 USING btree (canonical_phone_e164) WHERE (canonical_phone_e164 IS NOT NULL);

-- index: customer_location_evidence_address_idx
CREATE INDEX customer_location_evidence_address_idx ON public.customer_location_evidence_v1 USING btree (customer_address_id, captured_at DESC);

-- index: customer_location_evidence_customer_idx
CREATE INDEX customer_location_evidence_customer_idx ON public.customer_location_evidence_v1 USING btree (customer_id, captured_at DESC);

-- index: customer_location_evidence_message_uq
CREATE UNIQUE INDEX customer_location_evidence_message_uq ON public.customer_location_evidence_v1 USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

-- index: customer_location_evidence_order_idx
CREATE INDEX customer_location_evidence_order_idx ON public.customer_location_evidence_v1 USING btree (order_id, captured_at DESC);

-- index: customer_phones_digits_idx
CREATE INDEX customer_phones_digits_idx ON public.customer_phones USING btree (normalize_phone_digits(phone_e164));

-- index: customer_profile_confirmation_inbound_message_unique_v1
CREATE UNIQUE INDEX customer_profile_confirmation_inbound_message_unique_v1 ON public.customer_profile_confirmation_requests_v1 USING btree (confirmation_inbound_message_id) WHERE (confirmation_inbound_message_id IS NOT NULL);

-- index: customer_profile_confirmation_one_pending_per_conversation_v1
CREATE UNIQUE INDEX customer_profile_confirmation_one_pending_per_conversation_v1 ON public.customer_profile_confirmation_requests_v1 USING btree (conversation_id) WHERE (status = 'pending'::text);

-- index: customer_profile_confirmation_recent_v1
CREATE INDEX customer_profile_confirmation_recent_v1 ON public.customer_profile_confirmation_requests_v1 USING btree (conversation_id, requested_at DESC);

-- index: customer_profile_runs_conversation_created_idx
CREATE INDEX customer_profile_runs_conversation_created_idx ON public.customer_profile_extraction_runs_v1 USING btree (conversation_id, created_at DESC);

-- index: customer_profile_suggestions_conversation_status_idx
CREATE INDEX customer_profile_suggestions_conversation_status_idx ON public.customer_profile_suggestions_v1 USING btree (conversation_id, status, created_at DESC);

-- index: customers_cpf_cnpj_unique
CREATE UNIQUE INDEX customers_cpf_cnpj_unique ON public.customers USING btree (cpf_cnpj) WHERE (cpf_cnpj IS NOT NULL);

-- index: customers_document_digits_uidx
CREATE UNIQUE INDEX customers_document_digits_uidx ON public.customers USING btree (regexp_replace(cpf_cnpj, '[^0-9]'::text, ''::text, 'g'::text)) WHERE (NULLIF(regexp_replace(cpf_cnpj, '[^0-9]'::text, ''::text, 'g'::text), ''::text) IS NOT NULL);

-- index: customers_last_sync_idx
CREATE INDEX customers_last_sync_idx ON public.customers USING btree (last_bling_sync_at DESC) WHERE (last_bling_sync_at IS NOT NULL);

-- index: customers_name_idx
CREATE INDEX customers_name_idx ON public.customers USING btree (lower(name)) WHERE (name IS NOT NULL);

-- index: customers_phone_digits_idx
CREATE INDEX customers_phone_digits_idx ON public.customers USING btree (normalize_phone_digits(primary_whatsapp_e164)) WHERE (primary_whatsapp_e164 IS NOT NULL);

-- index: customers_unique_document_normalized_site_admin
CREATE UNIQUE INDEX customers_unique_document_normalized_site_admin ON public.customers USING btree (regexp_replace(COALESCE(cpf_cnpj, ''::text), '[^0-9]'::text, ''::text, 'g'::text)) WHERE (NULLIF(regexp_replace(COALESCE(cpf_cnpj, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) IS NOT NULL);

-- index: da_instagram_automations_v1_status_idx
CREATE INDEX da_instagram_automations_v1_status_idx ON public.da_instagram_automations_v1 USING btree (status, updated_at DESC);

-- index: da_instagram_job_events_v1_job_idx
CREATE INDEX da_instagram_job_events_v1_job_idx ON public.da_instagram_job_events_v1 USING btree (job_id, created_at DESC);

-- index: da_instagram_job_items_v1_job_idx
CREATE INDEX da_instagram_job_items_v1_job_idx ON public.da_instagram_job_items_v1 USING btree (job_id, item_number);

-- index: da_instagram_jobs_v1_automation_date_idx
CREATE INDEX da_instagram_jobs_v1_automation_date_idx ON public.da_instagram_jobs_v1 USING btree (automation_id, scheduled_for DESC);

-- index: da_instagram_jobs_v1_status_date_idx
CREATE INDEX da_instagram_jobs_v1_status_date_idx ON public.da_instagram_jobs_v1 USING btree (status, scheduled_for DESC);

-- index: da_instagram_story_creatives_v1_created_idx
CREATE INDEX da_instagram_story_creatives_v1_created_idx ON public.da_instagram_story_creatives_v1 USING btree (created_at DESC);

-- index: da_instagram_story_creatives_v1_status_idx
CREATE INDEX da_instagram_story_creatives_v1_status_idx ON public.da_instagram_story_creatives_v1 USING btree (status, updated_at DESC);

-- index: da_offer_story_publications_v1_date_status_idx
CREATE INDEX da_offer_story_publications_v1_date_status_idx ON public.da_offer_story_publications_v1 USING btree (offer_date, status);

-- index: delivery_driver_access_v1_active_idx
CREATE INDEX delivery_driver_access_v1_active_idx ON public.delivery_driver_access_v1 USING btree (driver_id, expires_at DESC) WHERE (revoked_at IS NULL);

-- index: dispatch_fiscal_jobs_auto_due_v1_idx
CREATE INDEX dispatch_fiscal_jobs_auto_due_v1_idx ON public.dispatch_fiscal_jobs USING btree (next_attempt_at, created_at) WHERE (status = ANY (ARRAY['held'::text, 'generated'::text, 'generating'::text, 'authorizing'::text]));

-- index: dispatch_fiscal_jobs_source_order_idx
CREATE INDEX dispatch_fiscal_jobs_source_order_idx ON public.dispatch_fiscal_jobs USING btree (source_order_id);

-- index: dispatch_fiscal_jobs_status_created_idx
CREATE INDEX dispatch_fiscal_jobs_status_created_idx ON public.dispatch_fiscal_jobs USING btree (status, created_at);

-- index: ean_capture_records_v1_created_idx
CREATE INDEX ean_capture_records_v1_created_idx ON public.ean_capture_records_v1 USING btree (created_at DESC, id DESC);

-- index: ean_capture_records_v1_ean_idx
CREATE INDEX ean_capture_records_v1_ean_idx ON public.ean_capture_records_v1 USING btree (ean);

-- index: ean_capture_records_v1_status_idx
CREATE INDEX ean_capture_records_v1_status_idx ON public.ean_capture_records_v1 USING btree (sync_status, created_at DESC);

-- index: fiscal_ai_family_jobs_status_priority_idx
CREATE INDEX fiscal_ai_family_jobs_status_priority_idx ON public.fiscal_ai_family_jobs USING btree (status, priority, product_count DESC);

-- index: fiscal_nfe_recovery_events_order_idx
CREATE INDEX fiscal_nfe_recovery_events_order_idx ON public.fiscal_nfe_recovery_events_v1 USING btree (order_id, created_at DESC);

-- index: fiscal_source_documents_source_issued_idx
CREATE INDEX fiscal_source_documents_source_issued_idx ON public.fiscal_source_documents USING btree (source, issued_at DESC);

-- index: fiscal_source_documents_status_idx
CREATE INDEX fiscal_source_documents_status_idx ON public.fiscal_source_documents USING btree (source, status, updated_at DESC);

-- index: fiscal_st_rules_mt_identity_uidx
CREATE UNIQUE INDEX fiscal_st_rules_mt_identity_uidx ON public.fiscal_st_rules_mt USING btree (rule_set_id, COALESCE(segment_code, ''::text), cest, COALESCE(ncm_prefix, ''::text), md5(legal_description));

-- index: fiscal_st_rules_mt_lookup_idx
CREATE INDEX fiscal_st_rules_mt_lookup_idx ON public.fiscal_st_rules_mt USING btree (ncm_prefix, cest, status);

-- index: idx_catalog_sessions_customer
CREATE INDEX idx_catalog_sessions_customer ON public.catalog_sessions USING btree (customer_id, created_at DESC);

-- index: idx_catalog_sessions_token_active
CREATE INDEX idx_catalog_sessions_token_active ON public.catalog_sessions USING btree (public_token, status, expires_at);

-- index: idx_conversations_account_phone
CREATE INDEX idx_conversations_account_phone ON public.conversations USING btree (whatsapp_account_id, wa_contact_e164, created_at DESC);

-- index: idx_conversations_status
CREATE INDEX idx_conversations_status ON public.conversations USING btree (status, updated_at DESC);

-- index: idx_customer_addresses_customer
CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses USING btree (customer_id, is_active);

-- index: idx_customer_phones_customer
CREATE INDEX idx_customer_phones_customer ON public.customer_phones USING btree (customer_id);

-- index: idx_customers_cpf_cnpj
CREATE INDEX idx_customers_cpf_cnpj ON public.customers USING btree (cpf_cnpj) WHERE (cpf_cnpj IS NOT NULL);

-- index: idx_orders_customer_history_v1
CREATE INDEX idx_orders_customer_history_v1 ON public.orders USING btree (customer_id, created_at DESC) WHERE (customer_id IS NOT NULL);

-- index: idx_products_customer_taxonomy_v2_catalog
CREATE INDEX idx_products_customer_taxonomy_v2_catalog ON public.products USING btree (customer_category, customer_subcategory, customer_subsubcategory, name) WHERE ((is_active = true) AND (physically_verified = true) AND (stock > (0)::numeric));

-- index: idx_products_image_ai_manual_review_v1
CREATE INDEX idx_products_image_ai_manual_review_v1 ON public.products USING btree (image_ai_manual_review_required, is_active, updated_at DESC) WHERE (image_ai_manual_review_required = true);

-- index: idx_products_image_ai_triage_v2
CREATE INDEX idx_products_image_ai_triage_v2 ON public.products USING btree (image_ai_ignored, image_ai_status, updated_at DESC);

-- index: idx_products_offer
CREATE INDEX idx_products_offer ON public.products USING btree (is_offer) WHERE (is_offer = true);

-- index: idx_products_room_catalog
CREATE INDEX idx_products_room_catalog ON public.products USING btree (sales_category, sort_order, name) WHERE ((physically_verified = true) AND (is_active = true));

-- index: idx_products_whatsapp_active_category
CREATE INDEX idx_products_whatsapp_active_category ON public.products USING btree (is_whatsapp_active, whatsapp_category);

-- index: inventory_label_counts_batch_idx
CREATE INDEX inventory_label_counts_batch_idx ON public.inventory_label_counts USING btree (batch_id, created_at DESC);

-- index: inventory_label_counts_product_idx
CREATE INDEX inventory_label_counts_product_idx ON public.inventory_label_counts USING btree (product_id, created_at DESC);

-- index: inventory_label_photos_batch_idx
CREATE INDEX inventory_label_photos_batch_idx ON public.inventory_label_photos USING btree (batch_id, created_at);

-- index: inventory_label_photos_hash_unique
CREATE UNIQUE INDEX inventory_label_photos_hash_unique ON public.inventory_label_photos USING btree (sha256) WHERE (sha256 IS NOT NULL);

-- index: inventory_label_photos_operator_sha256_uidx
CREATE UNIQUE INDEX inventory_label_photos_operator_sha256_uidx ON public.inventory_label_photos USING btree (created_by, sha256) WHERE (sha256 IS NOT NULL);

-- index: inventory_label_photos_queue_idx
CREATE INDEX inventory_label_photos_queue_idx ON public.inventory_label_photos USING btree (next_attempt_at, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'retry'::text, 'processing'::text]));

-- index: inventory_label_photos_queue_v1_idx
CREATE INDEX inventory_label_photos_queue_v1_idx ON public.inventory_label_photos USING btree (status, next_attempt_at, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'retry'::text, 'processing'::text]));

-- index: inventory_sheet_item_results_scan_idx
CREATE INDEX inventory_sheet_item_results_scan_idx ON public.inventory_sheet_item_results USING btree (scan_id, review_state);

-- index: inventory_sheet_item_results_sheet_item_idx
CREATE INDEX inventory_sheet_item_results_sheet_item_idx ON public.inventory_sheet_item_results USING btree (sheet_item_id);

-- index: inventory_sheet_items_page_idx
CREATE INDEX inventory_sheet_items_page_idx ON public.inventory_sheet_items USING btree (batch_id, page_number, slot_number);

-- index: inventory_sheet_items_product_idx
CREATE INDEX inventory_sheet_items_product_idx ON public.inventory_sheet_items USING btree (product_id);

-- index: inventory_sheet_page_scans_batch_page_idx
CREATE INDEX inventory_sheet_page_scans_batch_page_idx ON public.inventory_sheet_page_scans USING btree (batch_id, page_number, created_at DESC);

-- index: inventory_unknown_eans_linked_product_idx
CREATE INDEX inventory_unknown_eans_linked_product_idx ON public.inventory_unknown_eans USING btree (linked_product_id) WHERE (linked_product_id IS NOT NULL);

-- index: inventory_unknown_eans_status_last_seen_idx
CREATE INDEX inventory_unknown_eans_status_last_seen_idx ON public.inventory_unknown_eans USING btree (status, last_seen_at DESC);

-- index: li_bridge_probe_jobs_created_idx
CREATE INDEX li_bridge_probe_jobs_created_idx ON public.li_bridge_probe_jobs USING btree (created_at DESC);

-- index: marketing_attribution_events_v1_campaign_idx
CREATE INDEX marketing_attribution_events_v1_campaign_idx ON public.marketing_attribution_events_v1 USING btree (campaign_id, occurred_at DESC);

-- index: marketing_attribution_events_v1_customer_idx
CREATE INDEX marketing_attribution_events_v1_customer_idx ON public.marketing_attribution_events_v1 USING btree (customer_id, occurred_at DESC);

-- index: marketing_attribution_events_v1_order_idx
CREATE INDEX marketing_attribution_events_v1_order_idx ON public.marketing_attribution_events_v1 USING btree (order_id) WHERE (order_id IS NOT NULL);

-- index: marketing_attribution_events_v1_strategy_idx
CREATE INDEX marketing_attribution_events_v1_strategy_idx ON public.marketing_attribution_events_v1 USING btree (strategy_id, occurred_at DESC);

-- index: marketing_campaign_dispatches_manual_batch_idx
CREATE INDEX marketing_campaign_dispatches_manual_batch_idx ON public.marketing_campaign_dispatches_v1 USING btree (manual_batch_id, status) WHERE (manual_batch_id IS NOT NULL);

-- index: marketing_campaign_dispatches_v1_campaign_idx
CREATE INDEX marketing_campaign_dispatches_v1_campaign_idx ON public.marketing_campaign_dispatches_v1 USING btree (campaign_id, status, created_at);

-- index: marketing_campaign_dispatches_v1_claim_idx
CREATE INDEX marketing_campaign_dispatches_v1_claim_idx ON public.marketing_campaign_dispatches_v1 USING btree (whatsapp_account_id, status, available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));

-- index: marketing_campaign_events_v1_campaign_idx
CREATE INDEX marketing_campaign_events_v1_campaign_idx ON public.marketing_campaign_events_v1 USING btree (campaign_id, created_at, id);

-- index: marketing_campaign_manual_batches_active_idx
CREATE UNIQUE INDEX marketing_campaign_manual_batches_active_idx ON public.marketing_campaign_manual_batches_v1 USING btree (campaign_id) WHERE (status = 'processing'::text);

-- index: marketing_campaign_snapshot_recipients_v1_phone_idx
CREATE INDEX marketing_campaign_snapshot_recipients_v1_phone_idx ON public.marketing_campaign_snapshot_recipients_v1 USING btree (snapshot_id, phone_e164);

-- index: marketing_campaign_snapshot_recipients_v1_snapshot_idx
CREATE INDEX marketing_campaign_snapshot_recipients_v1_snapshot_idx ON public.marketing_campaign_snapshot_recipients_v1 USING btree (snapshot_id, eligible_at_snapshot, customer_id);

-- index: marketing_campaigns_v1_account_idx
CREATE INDEX marketing_campaigns_v1_account_idx ON public.marketing_campaigns_v1 USING btree (whatsapp_account_id, updated_at DESC);

-- index: marketing_campaigns_v1_idempotency_uidx
CREATE UNIQUE INDEX marketing_campaigns_v1_idempotency_uidx ON public.marketing_campaigns_v1 USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

-- index: marketing_campaigns_v1_status_idx
CREATE INDEX marketing_campaigns_v1_status_idx ON public.marketing_campaigns_v1 USING btree (status, updated_at DESC);

-- index: marketing_campaigns_v1_strategy_idx
CREATE INDEX marketing_campaigns_v1_strategy_idx ON public.marketing_campaigns_v1 USING btree (strategy_id) WHERE (strategy_id IS NOT NULL);

-- index: marketing_campaigns_v1_strategy_uidx
CREATE UNIQUE INDEX marketing_campaigns_v1_strategy_uidx ON public.marketing_campaigns_v1 USING btree (strategy_id) WHERE (strategy_id IS NOT NULL);

-- index: marketing_consent_events_v1_customer_occurred_idx
CREATE INDEX marketing_consent_events_v1_customer_occurred_idx ON public.marketing_consent_events_v1 USING btree (customer_id, occurred_at DESC, created_at DESC);

-- index: marketing_consent_events_v1_phone_occurred_idx
CREATE INDEX marketing_consent_events_v1_phone_occurred_idx ON public.marketing_consent_events_v1 USING btree (phone_e164, occurred_at DESC) WHERE (phone_e164 IS NOT NULL);

-- index: marketing_optout_events_v2_customer_idx
CREATE INDEX marketing_optout_events_v2_customer_idx ON public.marketing_optout_events_v2 USING btree (customer_id, occurred_at DESC) WHERE (customer_id IS NOT NULL);

-- index: marketing_optout_events_v2_message_idx
CREATE INDEX marketing_optout_events_v2_message_idx ON public.marketing_optout_events_v2 USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

-- index: marketing_repurchase_state_v1_due_idx
CREATE INDEX marketing_repurchase_state_v1_due_idx ON public.marketing_repurchase_state_v1 USING btree (due_at) WHERE (status = ANY (ARRAY['scheduled'::text, 'ready'::text]));

-- index: marketing_seasonality_rules_v1_active_idx
CREATE INDEX marketing_seasonality_rules_v1_active_idx ON public.marketing_seasonality_rules_v1 USING btree (is_active, priority DESC, starts_on, ends_on);

-- index: marketing_strategy_events_v1_strategy_idx
CREATE INDEX marketing_strategy_events_v1_strategy_idx ON public.marketing_strategy_events_v1 USING btree (strategy_id, created_at, id);

-- index: marketing_strategy_offers_v1_commercial_idx
CREATE INDEX marketing_strategy_offers_v1_commercial_idx ON public.marketing_strategy_offers_v1 USING btree (commercial_id, created_at DESC);

-- index: marketing_strategy_offers_v1_strategy_idx
CREATE INDEX marketing_strategy_offers_v1_strategy_idx ON public.marketing_strategy_offers_v1 USING btree (strategy_id, "position");

-- index: marketing_strategy_runs_v1_account_idx
CREATE INDEX marketing_strategy_runs_v1_account_idx ON public.marketing_strategy_runs_v1 USING btree (whatsapp_account_id, created_at DESC);

-- index: marketing_strategy_runs_v1_campaign_idx
CREATE INDEX marketing_strategy_runs_v1_campaign_idx ON public.marketing_strategy_runs_v1 USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);

-- index: marketing_strategy_runs_v1_status_period_idx
CREATE INDEX marketing_strategy_runs_v1_status_period_idx ON public.marketing_strategy_runs_v1 USING btree (status, period_start DESC, created_at DESC);

-- index: marketing_strategy_weight_sets_v1_one_active_uidx
CREATE UNIQUE INDEX marketing_strategy_weight_sets_v1_one_active_uidx ON public.marketing_strategy_weight_sets_v1 USING btree (is_active) WHERE (is_active IS TRUE);

-- index: marketing_template_lifecycle_v1_cleanup_idx
CREATE INDEX marketing_template_lifecycle_v1_cleanup_idx ON public.marketing_template_lifecycle_v1 USING btree (protected, lifecycle_status, candidate_after, last_used_at);

-- index: marketing_tracking_links_v1_campaign_idx
CREATE INDEX marketing_tracking_links_v1_campaign_idx ON public.marketing_tracking_links_v1 USING btree (campaign_id, created_at DESC);

-- index: marketing_tracking_links_v1_customer_idx
CREATE INDEX marketing_tracking_links_v1_customer_idx ON public.marketing_tracking_links_v1 USING btree (customer_id, first_opened_at DESC) WHERE (first_opened_at IS NOT NULL);

-- index: marketing_tracking_links_v1_order_idx
CREATE INDEX marketing_tracking_links_v1_order_idx ON public.marketing_tracking_links_v1 USING btree (attributed_order_id) WHERE (attributed_order_id IS NOT NULL);

-- index: marketing_tracking_links_v1_strategy_idx
CREATE INDEX marketing_tracking_links_v1_strategy_idx ON public.marketing_tracking_links_v1 USING btree (strategy_id, created_at DESC);

-- index: marketing_weekly_consent_requests_conversation_idx
CREATE INDEX marketing_weekly_consent_requests_conversation_idx ON public.marketing_weekly_consent_requests_v1 USING btree (conversation_id, created_at DESC);

-- index: ops2_bling_orphan_product_class_idx
CREATE INDEX ops2_bling_orphan_product_class_idx ON public.ops2_bling_orphan_product_reviews USING btree (classification, safe_action, updated_at DESC);

-- index: ops2_catalog_baseline_items_product_idx
CREATE INDEX ops2_catalog_baseline_items_product_idx ON public.ops2_catalog_baseline_items USING btree (product_id);

-- index: ops2_catalog_product_parity_bling_idx
CREATE INDEX ops2_catalog_product_parity_bling_idx ON public.ops2_catalog_product_parity_reviews USING btree (bling_product_id);

-- index: ops2_catalog_product_parity_status_idx
CREATE INDEX ops2_catalog_product_parity_status_idx ON public.ops2_catalog_product_parity_reviews USING btree (review_status, local_active, updated_at DESC);

-- index: ops2_catalog_stock_highrisk_reviews_product_idx
CREATE INDEX ops2_catalog_stock_highrisk_reviews_product_idx ON public.ops2_catalog_stock_highrisk_reviews USING btree (product_id);

-- index: ops2_catalog_stock_highrisk_reviews_status_idx
CREATE INDEX ops2_catalog_stock_highrisk_reviews_status_idx ON public.ops2_catalog_stock_highrisk_reviews USING btree (status, risk_bucket, updated_at DESC);

-- index: ops2_catalog_sync_canaries_run_idx
CREATE INDEX ops2_catalog_sync_canaries_run_idx ON public.ops2_catalog_sync_canaries USING btree (run_id);

-- index: ops2_catalog_sync_canary_items_product_idx
CREATE INDEX ops2_catalog_sync_canary_items_product_idx ON public.ops2_catalog_sync_canary_items USING btree (product_id);

-- index: ops2_catalog_sync_canary_items_run_idx
CREATE INDEX ops2_catalog_sync_canary_items_run_idx ON public.ops2_catalog_sync_canary_items USING btree (run_id);

-- index: ops2_catalog_sync_plan_items_product_idx
CREATE INDEX ops2_catalog_sync_plan_items_product_idx ON public.ops2_catalog_sync_plan_items USING btree (product_id);

-- index: ops2_customer_registration_journeys_customer_idx
CREATE INDEX ops2_customer_registration_journeys_customer_idx ON public.ops2_customer_registration_journeys_v1 USING btree (customer_id, last_evaluated_at DESC) WHERE (customer_id IS NOT NULL);

-- index: ops2_customer_registration_journeys_state_idx
CREATE INDEX ops2_customer_registration_journeys_state_idx ON public.ops2_customer_registration_journeys_v1 USING btree (registration_state, workflow_open, last_evaluated_at DESC);

-- index: ops2_order_registration_links_v1_active_idx
CREATE INDEX ops2_order_registration_links_v1_active_idx ON public.ops2_order_registration_links_v1 USING btree (order_id, expires_at DESC) WHERE ((consumed_at IS NULL) AND (revoked_at IS NULL));

-- index: ops2_order_registration_links_v1_order_idx
CREATE INDEX ops2_order_registration_links_v1_order_idx ON public.ops2_order_registration_links_v1 USING btree (order_id, created_at DESC);

-- index: ops2_papoai_order_signal_outbox_dispatch_idx
CREATE INDEX ops2_papoai_order_signal_outbox_dispatch_idx ON public.ops2_papoai_order_signal_outbox_v1 USING btree (status, available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));

-- index: ops2_papoai_outbound_intents_idempotency_uidx
CREATE UNIQUE INDEX ops2_papoai_outbound_intents_idempotency_uidx ON public.ops2_papoai_outbound_intents_v1 USING btree (idempotency_key);

-- index: ops2_papoai_outbound_intents_order_idx
CREATE INDEX ops2_papoai_outbound_intents_order_idx ON public.ops2_papoai_outbound_intents_v1 USING btree (order_id, created_at DESC);

-- index: ops2_papoai_outbound_intents_status_idx
CREATE INDEX ops2_papoai_outbound_intents_status_idx ON public.ops2_papoai_outbound_intents_v1 USING btree (status, created_at);

-- index: ops2_whatsapp_outbox_v1_dispatch_idx
CREATE INDEX ops2_whatsapp_outbox_v1_dispatch_idx ON public.ops2_whatsapp_outbox_v1 USING btree (status, channel_origin, available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));

-- index: ops_approvals_entity_idx
CREATE INDEX ops_approvals_entity_idx ON public.ops_approvals USING btree (entity_type, entity_id, requested_at DESC);

-- index: ops_approvals_idempotency_uidx
CREATE UNIQUE INDEX ops_approvals_idempotency_uidx ON public.ops_approvals USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

-- index: ops_approvals_pending_idx
CREATE INDEX ops_approvals_pending_idx ON public.ops_approvals USING btree (status, risk, requested_at) WHERE (status = 'pending'::text);

-- index: ops_attention_entity_idx
CREATE INDEX ops_attention_entity_idx ON public.ops_attention USING btree (entity_type, entity_id, opened_at DESC);

-- index: ops_attention_idempotency_uidx
CREATE UNIQUE INDEX ops_attention_idempotency_uidx ON public.ops_attention USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

-- index: ops_attention_open_idx
CREATE INDEX ops_attention_open_idx ON public.ops_attention USING btree (status, priority, opened_at) WHERE (status = ANY (ARRAY['open'::text, 'acknowledged'::text]));

-- index: ops_delivery_runs_driver_idx
CREATE INDEX ops_delivery_runs_driver_idx ON public.ops_delivery_runs USING btree (driver_id, service_date);

-- index: ops_delivery_runs_one_active_vehicle_day_uidx
CREATE UNIQUE INDEX ops_delivery_runs_one_active_vehicle_day_uidx ON public.ops_delivery_runs USING btree (service_date, vehicle_key) WHERE (status = ANY (ARRAY['planned'::text, 'dispatched'::text]));

-- index: ops_delivery_runs_service_region_idx
CREATE INDEX ops_delivery_runs_service_region_idx ON public.ops_delivery_runs USING btree (service_date, region_id);

-- index: ops_delivery_runs_today_idx
CREATE INDEX ops_delivery_runs_today_idx ON public.ops_delivery_runs USING btree (service_date, status, vehicle_key, created_at DESC);

-- index: ops_delivery_stops_customer_address_idx
CREATE INDEX ops_delivery_stops_customer_address_idx ON public.ops_delivery_stops USING btree (customer_address_id) WHERE (customer_address_id IS NOT NULL);

-- index: ops_delivery_stops_location_evidence_idx
CREATE INDEX ops_delivery_stops_location_evidence_idx ON public.ops_delivery_stops USING btree (location_evidence_id);

-- index: ops_delivery_stops_order_idx
CREATE INDEX ops_delivery_stops_order_idx ON public.ops_delivery_stops USING btree (order_id, created_at DESC);

-- index: ops_delivery_stops_region_idx
CREATE INDEX ops_delivery_stops_region_idx ON public.ops_delivery_stops USING btree (region_id);

-- index: ops_delivery_stops_run_idx
CREATE INDEX ops_delivery_stops_run_idx ON public.ops_delivery_stops USING btree (run_id, sequence);

-- index: ops_events_correlation_idx
CREATE INDEX ops_events_correlation_idx ON public.ops_events USING btree (correlation_id, occurred_at DESC) WHERE (correlation_id IS NOT NULL);

-- index: ops_events_domain_idx
CREATE INDEX ops_events_domain_idx ON public.ops_events USING btree (domain, occurred_at DESC);

-- index: ops_events_entity_idx
CREATE INDEX ops_events_entity_idx ON public.ops_events USING btree (entity_type, entity_id, occurred_at DESC);

-- index: ops_events_idempotency_uidx
CREATE UNIQUE INDEX ops_events_idempotency_uidx ON public.ops_events USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

-- index: ops_events_occurred_at_idx
CREATE INDEX ops_events_occurred_at_idx ON public.ops_events USING btree (occurred_at DESC);

-- index: ops_inventory_counts_pending_idx
CREATE INDEX ops_inventory_counts_pending_idx ON public.ops_inventory_counts USING btree (reconciliation_state, created_at) WHERE (reconciliation_state = 'pending_erp_reconciliation'::text);

-- index: ops_inventory_counts_product_idx
CREATE INDEX ops_inventory_counts_product_idx ON public.ops_inventory_counts USING btree (product_id, created_at DESC);

-- index: ops_inventory_incidents_open_idx
CREATE INDEX ops_inventory_incidents_open_idx ON public.ops_inventory_incidents USING btree (status, created_at) WHERE (status = ANY (ARRAY['open'::text, 'review'::text]));

-- index: ops_inventory_incidents_product_idx
CREATE INDEX ops_inventory_incidents_product_idx ON public.ops_inventory_incidents USING btree (product_id, created_at DESC);

-- index: ops_inventory_incidents_source_order_idx
CREATE INDEX ops_inventory_incidents_source_order_idx ON public.ops_inventory_incidents USING btree (source_order_id) WHERE (source_order_id IS NOT NULL);

-- index: ops_order_check_items_product_idx
CREATE INDEX ops_order_check_items_product_idx ON public.ops_order_check_items USING btree (product_id);

-- index: ops_payment_bling_shadow_plans_order_idx
CREATE INDEX ops_payment_bling_shadow_plans_order_idx ON public.ops_payment_bling_shadow_plans_v1 USING btree (order_id, created_at DESC);

-- index: ops_print_jobs_entity_idx
CREATE INDEX ops_print_jobs_entity_idx ON public.ops_print_jobs USING btree (entity_type, entity_id, created_at DESC);

-- index: ops_print_jobs_idempotency_uidx
CREATE UNIQUE INDEX ops_print_jobs_idempotency_uidx ON public.ops_print_jobs USING btree (idempotency_key);

-- index: ops_print_jobs_pending_idx
CREATE INDEX ops_print_jobs_pending_idx ON public.ops_print_jobs USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

-- index: ops_stock_reconciliation_reviews_count_idx
CREATE INDEX ops_stock_reconciliation_reviews_count_idx ON public.ops_stock_reconciliation_reviews USING btree (count_id);

-- index: ops_stock_reconciliation_reviews_product_idx
CREATE INDEX ops_stock_reconciliation_reviews_product_idx ON public.ops_stock_reconciliation_reviews USING btree (product_id);

-- index: order_delivery_return_cases_one_active_uidx
CREATE UNIQUE INDEX order_delivery_return_cases_one_active_uidx ON public.order_delivery_return_cases USING btree (order_id) WHERE (status = ANY (ARRAY['returning'::text, 'returned_review'::text]));

-- index: order_delivery_return_cases_order_idx
CREATE INDEX order_delivery_return_cases_order_idx ON public.order_delivery_return_cases USING btree (order_id, failed_at DESC);

-- index: order_items_order_idx
CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id);

-- index: order_items_product_idx
CREATE INDEX order_items_product_idx ON public.order_items USING btree (product_id);

-- index: order_payment_parts_settlement_idx
CREATE INDEX order_payment_parts_settlement_idx ON public.order_payment_parts USING btree (settlement_id, sequence);

-- index: order_payment_settlements_sync_idx
CREATE INDEX order_payment_settlements_sync_idx ON public.order_payment_settlements USING btree (bling_sync_state, captured_at) WHERE (status = ANY (ARRAY['captured'::text, 'needs_review'::text]));

-- index: order_public_snapshots_v1_public_code_uidx
CREATE UNIQUE INDEX order_public_snapshots_v1_public_code_uidx ON public.order_public_snapshots_v1 USING btree (public_code);

-- index: order_public_snapshots_v1_public_token_uidx
CREATE UNIQUE INDEX order_public_snapshots_v1_public_token_uidx ON public.order_public_snapshots_v1 USING btree (public_token);

-- index: order_separation_customer_notifications_v1_status_idx
CREATE INDEX order_separation_customer_notifications_v1_status_idx ON public.order_separation_customer_notifications_v1 USING btree (status, updated_at);

-- index: order_separation_items_order_item_idx
CREATE INDEX order_separation_items_order_item_idx ON public.order_separation_items_v1 USING btree (order_item_id);

-- index: order_separation_items_order_state_idx
CREATE INDEX order_separation_items_order_state_idx ON public.order_separation_items_v1 USING btree (order_id, state);

-- index: order_separation_items_product_idx
CREATE INDEX order_separation_items_product_idx ON public.order_separation_items_v1 USING btree (product_id) WHERE (product_id IS NOT NULL);

-- index: orders_account_idx
CREATE INDEX orders_account_idx ON public.orders USING btree (whatsapp_account_id);

-- index: orders_basket_idx
CREATE INDEX orders_basket_idx ON public.orders USING btree (basket_id) WHERE (basket_id IS NOT NULL);

-- index: orders_bling_status_idx
CREATE INDEX orders_bling_status_idx ON public.orders USING btree (status, bling_synced_at, created_at DESC);

-- index: orders_cart_id_uq
CREATE UNIQUE INDEX orders_cart_id_uq ON public.orders USING btree (cart_id) WHERE (cart_id IS NOT NULL);

-- index: orders_cart_idx
CREATE INDEX orders_cart_idx ON public.orders USING btree (cart_id) WHERE (cart_id IS NOT NULL);

-- index: orders_catalog_session_idx
CREATE INDEX orders_catalog_session_idx ON public.orders USING btree (catalog_session_id) WHERE (catalog_session_id IS NOT NULL);

-- index: orders_conversation_created_idx
CREATE INDEX orders_conversation_created_idx ON public.orders USING btree (conversation_id, created_at DESC) WHERE (conversation_id IS NOT NULL);

-- index: orders_conversation_idx
CREATE INDEX orders_conversation_idx ON public.orders USING btree (conversation_id);

-- index: orders_customer_created_idx
CREATE INDEX orders_customer_created_idx ON public.orders USING btree (customer_id, created_at DESC);

-- index: orders_delivery_customer_address_idx
CREATE INDEX orders_delivery_customer_address_idx ON public.orders USING btree (delivery_customer_address_id);

-- index: orders_delivery_region_idx
CREATE INDEX orders_delivery_region_idx ON public.orders USING btree (delivery_region_id);

-- index: orders_idempotency_key_uq
CREATE UNIQUE INDEX orders_idempotency_key_uq ON public.orders USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

-- index: orders_order_number_uq
CREATE UNIQUE INDEX orders_order_number_uq ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL);

-- index: orders_status_created_idx
CREATE INDEX orders_status_created_idx ON public.orders USING btree (status, created_at DESC);

-- index: orders_unlinked_phone_idx
CREATE INDEX orders_unlinked_phone_idx ON public.orders USING btree (phone_e164, created_at DESC) WHERE ((customer_id IS NULL) AND (phone_e164 IS NOT NULL));

-- index: oscb_gtin_research_attempts_time_idx
CREATE INDEX oscb_gtin_research_attempts_time_idx ON public.oscb_gtin_research_attempts_v1 USING btree (attempted_at DESC);

-- index: oscb_gtin_research_cache_status_idx
CREATE INDEX oscb_gtin_research_cache_status_idx ON public.oscb_gtin_research_cache_v1 USING btree (status, attempted_at DESC);

-- index: oscb_product_research_review_queue_v1
CREATE INDEX oscb_product_research_review_queue_v1 ON public.oscb_product_research_v1 USING btree (review_state, updated_at DESC);

-- index: papoai_draft_events_v2_draft_idx
CREATE INDEX papoai_draft_events_v2_draft_idx ON public.papoai_draft_events_v2 USING btree (draft_id);

-- index: papoai_order_drafts_v2_canonical_order_idx
CREATE INDEX papoai_order_drafts_v2_canonical_order_idx ON public.papoai_order_drafts_v2 USING btree (canonical_order_id) WHERE (canonical_order_id IS NOT NULL);

-- index: papoai_order_drafts_v2_customer_idx
CREATE INDEX papoai_order_drafts_v2_customer_idx ON public.papoai_order_drafts_v2 USING btree (customer_id) WHERE (customer_id IS NOT NULL);

-- index: papoai_order_drafts_v2_one_active_conversation_uidx
CREATE UNIQUE INDEX papoai_order_drafts_v2_one_active_conversation_uidx ON public.papoai_order_drafts_v2 USING btree (conversation_ref) WHERE (status = ANY (ARRAY['draft'::text, 'awaiting_confirmation'::text, 'review_required'::text]));

-- index: papoai_order_drafts_v2_phone_idx
CREATE INDEX papoai_order_drafts_v2_phone_idx ON public.papoai_order_drafts_v2 USING btree (phone_e164, updated_at DESC);

-- index: papoai_order_drafts_v2_status_idx
CREATE INDEX papoai_order_drafts_v2_status_idx ON public.papoai_order_drafts_v2 USING btree (status, updated_at DESC);

-- index: papoai_webhook_inbox_v2_event_key_uidx
CREATE UNIQUE INDEX papoai_webhook_inbox_v2_event_key_uidx ON public.papoai_webhook_inbox_v2 USING btree (event_key);

-- index: papoai_webhook_inbox_v2_received_idx
CREATE INDEX papoai_webhook_inbox_v2_received_idx ON public.papoai_webhook_inbox_v2 USING btree (received_at DESC);

-- index: papoai_webhook_inbox_v2_status_idx
CREATE INDEX papoai_webhook_inbox_v2_status_idx ON public.papoai_webhook_inbox_v2 USING btree (status, received_at) WHERE (status = ANY (ARRAY['captured'::text, 'review_required'::text]));

-- index: product_catalog_enrichment_jobs_pending_v1_idx
CREATE INDEX product_catalog_enrichment_jobs_pending_v1_idx ON public.product_catalog_enrichment_jobs_v1 USING btree (status, available_at, created_at);

-- index: product_fiscal_evidence_document_idx
CREATE INDEX product_fiscal_evidence_document_idx ON public.product_fiscal_evidence USING btree (document_key) WHERE (document_key IS NOT NULL);

-- index: product_fiscal_evidence_gtin_idx
CREATE INDEX product_fiscal_evidence_gtin_idx ON public.product_fiscal_evidence USING btree (gtin) WHERE (gtin IS NOT NULL);

-- index: product_fiscal_evidence_key_uidx
CREATE UNIQUE INDEX product_fiscal_evidence_key_uidx ON public.product_fiscal_evidence USING btree (evidence_key);

-- index: product_fiscal_evidence_product_idx
CREATE INDEX product_fiscal_evidence_product_idx ON public.product_fiscal_evidence USING btree (product_id, observed_at DESC NULLS LAST, created_at DESC);

-- index: product_fiscal_profiles_cest_idx
CREATE INDEX product_fiscal_profiles_cest_idx ON public.product_fiscal_profiles USING btree (cest) WHERE (cest IS NOT NULL);

-- index: product_fiscal_profiles_matched_rule_idx
CREATE INDEX product_fiscal_profiles_matched_rule_idx ON public.product_fiscal_profiles USING btree (matched_st_rule_id) WHERE (matched_st_rule_id IS NOT NULL);

-- index: product_fiscal_profiles_ncm_idx
CREATE INDEX product_fiscal_profiles_ncm_idx ON public.product_fiscal_profiles USING btree (ncm);

-- index: product_fiscal_profiles_review_idx
CREATE INDEX product_fiscal_profiles_review_idx ON public.product_fiscal_profiles USING btree (review_status, st_status);

-- index: product_fiscal_review_items_open_uidx
CREATE UNIQUE INDEX product_fiscal_review_items_open_uidx ON public.product_fiscal_review_items USING btree (product_id, issue_code) WHERE (status = ANY (ARRAY['open'::text, 'in_review'::text]));

-- index: product_fiscal_review_items_queue_idx
CREATE INDEX product_fiscal_review_items_queue_idx ON public.product_fiscal_review_items USING btree (status, severity, detected_at DESC);

-- index: product_identifiers_confirmed_global_uidx
CREATE UNIQUE INDEX product_identifiers_confirmed_global_uidx ON public.product_identifiers USING btree (identifier_kind, identifier_value) WHERE ((status = 'confirmed'::text) AND (identifier_kind = ANY (ARRAY['base_gtin'::text, 'package_gtin'::text, 'sku_alias'::text])));

-- index: product_identifiers_confirmed_supplier_uidx
CREATE UNIQUE INDEX product_identifiers_confirmed_supplier_uidx ON public.product_identifiers USING btree (identifier_kind, supplier_document, identifier_value) WHERE ((status = 'confirmed'::text) AND (identifier_kind = 'supplier_code'::text));

-- index: product_identifiers_product_id_idx
CREATE INDEX product_identifiers_product_id_idx ON public.product_identifiers USING btree (product_id);

-- index: product_identifiers_supplier_idx
CREATE INDEX product_identifiers_supplier_idx ON public.product_identifiers USING btree (supplier_document, identifier_value);

-- index: product_identifiers_value_idx
CREATE INDEX product_identifiers_value_idx ON public.product_identifiers USING btree (identifier_value);

-- index: product_inventory_lots_expiry_active_idx
CREATE INDEX product_inventory_lots_expiry_active_idx ON public.product_inventory_lots USING btree (expiration_date, product_id) WHERE (status = 'active'::text);

-- index: product_inventory_lots_fifo_idx
CREATE INDEX product_inventory_lots_fifo_idx ON public.product_inventory_lots USING btree (product_id, status, received_at, created_at, id);

-- index: product_inventory_lots_product_expiry_idx
CREATE INDEX product_inventory_lots_product_expiry_idx ON public.product_inventory_lots USING btree (product_id, expiration_date, status);

-- index: product_inventory_lots_source_ref_uidx
CREATE UNIQUE INDEX product_inventory_lots_source_ref_uidx ON public.product_inventory_lots USING btree (source, source_ref) WHERE (source_ref IS NOT NULL);

-- index: product_lifecycle_audit_product_created_idx
CREATE INDEX product_lifecycle_audit_product_created_idx ON public.product_lifecycle_audit USING btree (product_id, created_at DESC);

-- index: product_purchase_history_document_idx
CREATE INDEX product_purchase_history_document_idx ON public.product_purchase_history USING btree (document_id);

-- index: product_purchase_history_product_idx
CREATE INDEX product_purchase_history_product_idx ON public.product_purchase_history USING btree (product_id, issued_at DESC);

-- index: product_supplier_packaging_product_idx
CREATE INDEX product_supplier_packaging_product_idx ON public.product_supplier_packaging USING btree (product_id, status);

-- index: product_taxonomy_terms_parent_idx
CREATE INDEX product_taxonomy_terms_parent_idx ON public.product_taxonomy_terms USING btree (parent_id);

-- index: product_taxonomy_terms_unique_name
CREATE UNIQUE INDEX product_taxonomy_terms_unique_name ON public.product_taxonomy_terms USING btree (kind, lower(name), COALESCE((parent_id)::text, ''::text));

-- index: products_admin_edit_by_idx
CREATE INDEX products_admin_edit_by_idx ON public.products USING btree (last_admin_edit_by) WHERE (last_admin_edit_by IS NOT NULL);

-- index: products_firebase_key_uidx
CREATE UNIQUE INDEX products_firebase_key_uidx ON public.products USING btree (firebase_key) WHERE ((firebase_key IS NOT NULL) AND (firebase_key <> ''::text));

-- index: products_gtin_idx
CREATE INDEX products_gtin_idx ON public.products USING btree (gtin) WHERE ((gtin IS NOT NULL) AND (gtin <> ''::text));

-- index: products_gtin_verified_uidx
CREATE UNIQUE INDEX products_gtin_verified_uidx ON public.products USING btree (gtin) WHERE ((gtin IS NOT NULL) AND (gtin <> ''::text));

-- index: products_operational_search_idx
CREATE INDEX products_operational_search_idx ON public.products USING btree (physically_verified, is_active, updated_at DESC);

-- index: products_physically_verified_by_idx
CREATE INDEX products_physically_verified_by_idx ON public.products USING btree (physically_verified_by) WHERE (physically_verified_by IS NOT NULL);

-- index: products_storefront_category_idx
CREATE INDEX products_storefront_category_idx ON public.products USING btree (storefront_category, category, sort_order, name) WHERE (is_active = true);

-- index: products_storefront_featured_idx
CREATE INDEX products_storefront_featured_idx ON public.products USING btree (sort_order, name) WHERE ((storefront_featured = true) AND (is_active = true) AND (physically_verified = true));

-- index: products_verified_category_idx
CREATE INDEX products_verified_category_idx ON public.products USING btree (category, id) WHERE (physically_verified = true);

-- index: products_verified_idx
CREATE INDEX products_verified_idx ON public.products USING btree (physically_verified, last_counted_at DESC);

-- index: products_verified_validity_idx
CREATE INDEX products_verified_validity_idx ON public.products USING btree (validity_date, id) WHERE (physically_verified = true);

-- index: purchase_xml_catalog_identity_actions_product_idx
CREATE INDEX purchase_xml_catalog_identity_actions_product_idx ON public.purchase_xml_catalog_identity_actions_v1 USING btree (product_id, created_at DESC);

-- index: purchase_xml_catalog_observations_gtin_idx
CREATE INDEX purchase_xml_catalog_observations_gtin_idx ON public.purchase_xml_catalog_observations_v1 USING btree (commercial_gtin);

-- index: purchase_xml_catalog_observations_source_idx
CREATE INDEX purchase_xml_catalog_observations_source_idx ON public.purchase_xml_catalog_observations_v1 USING btree (source_state, extracted_at);

-- index: purchase_xml_catalog_observations_tax_gtin_idx
CREATE INDEX purchase_xml_catalog_observations_tax_gtin_idx ON public.purchase_xml_catalog_observations_v1 USING btree (tax_gtin);

-- index: purchase_xml_documents_finance_pending_idx
CREATE INDEX purchase_xml_documents_finance_pending_idx ON public.purchase_xml_documents USING btree (finance_status, issued_at DESC) WHERE ((financial_eligible = true) AND (finance_status <> 'posted'::text));

-- index: purchase_xml_documents_import_run_idx
CREATE INDEX purchase_xml_documents_import_run_idx ON public.purchase_xml_documents USING btree (import_run_id) WHERE (import_run_id IS NOT NULL);

-- index: purchase_xml_documents_issued_idx
CREATE INDEX purchase_xml_documents_issued_idx ON public.purchase_xml_documents USING btree (issued_at DESC);

-- index: purchase_xml_documents_status_idx
CREATE INDEX purchase_xml_documents_status_idx ON public.purchase_xml_documents USING btree (processing_status, created_at DESC);

-- index: purchase_xml_documents_supplier_idx
CREATE INDEX purchase_xml_documents_supplier_idx ON public.purchase_xml_documents USING btree (supplier_document, issued_at DESC);

-- index: purchase_xml_item_lot_evidence_item_idx
CREATE INDEX purchase_xml_item_lot_evidence_item_idx ON public.purchase_xml_item_lot_evidence USING btree (purchase_item_id, status, expiration_date);

-- index: purchase_xml_items_document_product_idx
CREATE INDEX purchase_xml_items_document_product_idx ON public.purchase_xml_items USING btree (document_id, product_id) WHERE (product_id IS NOT NULL);

-- index: purchase_xml_items_inventory_lot_idx
CREATE INDEX purchase_xml_items_inventory_lot_idx ON public.purchase_xml_items USING btree (inventory_lot_id) WHERE (inventory_lot_id IS NOT NULL);

-- index: purchase_xml_items_product_idx
CREATE INDEX purchase_xml_items_product_idx ON public.purchase_xml_items USING btree (product_id, created_at DESC);

-- index: purchase_xml_items_review_idx
CREATE INDEX purchase_xml_items_review_idx ON public.purchase_xml_items USING btree (conversion_status, processing_status);

-- index: sales_quote_bling_orders_status_idx
CREATE INDEX sales_quote_bling_orders_status_idx ON public.sales_quote_bling_orders USING btree (status, updated_at DESC);

-- index: sales_quotes_client_name_lower_idx
CREATE INDEX sales_quotes_client_name_lower_idx ON public.sales_quotes USING btree (lower(client_name));

-- index: sales_quotes_customer_id_idx
CREATE INDEX sales_quotes_customer_id_idx ON public.sales_quotes USING btree (customer_id);

-- index: sales_quotes_quote_number_idx
CREATE INDEX sales_quotes_quote_number_idx ON public.sales_quotes USING btree (quote_number);

-- index: sales_quotes_status_updated_idx
CREATE INDEX sales_quotes_status_updated_idx ON public.sales_quotes USING btree (status, updated_at DESC);

-- index: sales_quotes_updated_at_idx
CREATE INDEX sales_quotes_updated_at_idx ON public.sales_quotes USING btree (updated_at DESC);

-- index: si5_product_research_status_idx
CREATE INDEX si5_product_research_status_idx ON public.si5_product_research USING btree (status, retry_after, created_at);

-- index: si5_research_requests_product_idx
CREATE INDEX si5_research_requests_product_idx ON public.si5_research_requests USING btree (product_id, created_at DESC);

-- index: simples_homologation_checks_period_idx
CREATE INDEX simples_homologation_checks_period_idx ON public.simples_homologation_checks USING btree (period_id, created_at DESC);

-- index: simples_monthly_revenue_history_status_idx
CREATE INDEX simples_monthly_revenue_history_status_idx ON public.simples_monthly_revenue_history USING btree (competence_month DESC, collection_status);

-- index: simples_periods_competence_status_idx
CREATE INDEX simples_periods_competence_status_idx ON public.simples_periods USING btree (competence_month DESC, status, version DESC);

-- index: simples_reconciliation_issues_period_status_idx
CREATE INDEX simples_reconciliation_issues_period_status_idx ON public.simples_reconciliation_issues USING btree (period_id, status, severity);

-- index: simples_revenue_lines_access_key_idx
CREATE INDEX simples_revenue_lines_access_key_idx ON public.simples_revenue_lines USING btree (access_key) WHERE (access_key IS NOT NULL);

-- index: simples_revenue_lines_period_product_idx
CREATE INDEX simples_revenue_lines_period_product_idx ON public.simples_revenue_lines USING btree (period_id, product_id);

-- index: simples_rule_sets_effective_idx
CREATE INDEX simples_rule_sets_effective_idx ON public.simples_rule_sets USING btree (status, effective_from, effective_to);

-- index: simples_tax_rules_effective_idx
CREATE INDEX simples_tax_rules_effective_idx ON public.simples_tax_classification_rules USING btree (rule_set_id, status, effective_from, effective_to, tax_bucket);

-- index: simples_validation_runs_period_idx
CREATE INDEX simples_validation_runs_period_idx ON public.simples_validation_runs USING btree (period_id, created_at DESC);

-- index: site_basket_product_type_option_quantities_basket_idx
CREATE INDEX site_basket_product_type_option_quantities_basket_idx ON public.site_basket_product_type_option_quantities USING btree (basket_id, product_type_id, product_id);

-- index: site_basket_product_types_session_slot_uidx
CREATE UNIQUE INDEX site_basket_product_types_session_slot_uidx ON public.site_basket_product_types USING btree (session_id, slot_order);

-- index: storefront_identity_resolve_attempts_ip_time_idx
CREATE INDEX storefront_identity_resolve_attempts_ip_time_idx ON public.storefront_identity_resolve_attempts USING btree (ip_hash, attempted_at DESC);

-- index: storefront_identity_tokens_conversation_idx
CREATE INDEX storefront_identity_tokens_conversation_idx ON public.storefront_identity_tokens USING btree (conversation_id, created_at DESC) WHERE (conversation_id IS NOT NULL);

-- index: storefront_identity_tokens_expires_at_idx
CREATE INDEX storefront_identity_tokens_expires_at_idx ON public.storefront_identity_tokens USING btree (expires_at);

-- index: storefront_identity_tokens_phone_created_idx
CREATE INDEX storefront_identity_tokens_phone_created_idx ON public.storefront_identity_tokens USING btree (phone_e164, created_at DESC);

-- index: storefront_identity_tokens_redeem_idx
CREATE INDEX storefront_identity_tokens_redeem_idx ON public.storefront_identity_tokens USING btree (token_hash, expires_at, redeemed_at);

-- index: storefront_identity_tokens_redeemed_phone_idx
CREATE INDEX storefront_identity_tokens_redeemed_phone_idx ON public.storefront_identity_tokens USING btree (phone_e164, redeemed_at DESC) WHERE (redeemed_at IS NOT NULL);

-- index: storefront_identity_tokens_short_code_idx
CREATE INDEX storefront_identity_tokens_short_code_idx ON public.storefront_identity_tokens USING btree (short_code) WHERE (short_code IS NOT NULL);

-- index: ux_customer_addresses_one_active_default_v1
CREATE UNIQUE INDEX ux_customer_addresses_one_active_default_v1 ON public.customer_addresses USING btree (customer_id) WHERE ((is_active = true) AND (is_default = true));

-- index: vitrine_stock_reservation_lots_lot_idx
CREATE INDEX vitrine_stock_reservation_lots_lot_idx ON public.vitrine_stock_reservation_lots USING btree (lot_id, status);

-- index: vitrine_stock_reservation_lots_product_idx
CREATE INDEX vitrine_stock_reservation_lots_product_idx ON public.vitrine_stock_reservation_lots USING btree (product_id, status);

-- index: vitrine_stock_reservation_lots_reservation_idx
CREATE INDEX vitrine_stock_reservation_lots_reservation_idx ON public.vitrine_stock_reservation_lots USING btree (reservation_id, status);

-- index: vitrine_stock_reservations_order_status_idx
CREATE INDEX vitrine_stock_reservations_order_status_idx ON public.vitrine_stock_reservations USING btree (order_id, status);

-- index: vitrine_stock_reservations_product_status_idx
CREATE INDEX vitrine_stock_reservations_product_status_idx ON public.vitrine_stock_reservations USING btree (product_id, status, expires_at);

-- index: whatsapp_1018_canary_created_idx
CREATE INDEX whatsapp_1018_canary_created_idx ON public.whatsapp_1018_interactive_canary_v1 USING btree (created_at DESC);

-- index: whatsapp_1018_checkout_attempts_created_idx
CREATE INDEX whatsapp_1018_checkout_attempts_created_idx ON public.whatsapp_1018_checkout_attempts_v1 USING btree (created_at DESC);

-- index: whatsapp_ana_jobs_v1_conversation_created_idx
CREATE INDEX whatsapp_ana_jobs_v1_conversation_created_idx ON public.whatsapp_ana_jobs_v1 USING btree (conversation_id, created_at DESC);

-- index: whatsapp_ana_jobs_v1_status_available_idx
CREATE INDEX whatsapp_ana_jobs_v1_status_available_idx ON public.whatsapp_ana_jobs_v1 USING btree (status, available_at, created_at);

-- index: whatsapp_ana_reviews_v1_created_idx
CREATE INDEX whatsapp_ana_reviews_v1_created_idx ON public.whatsapp_ana_reviews_v1 USING btree (created_at DESC);

-- index: whatsapp_ana_reviews_v1_job_created_idx
CREATE INDEX whatsapp_ana_reviews_v1_job_created_idx ON public.whatsapp_ana_reviews_v1 USING btree (job_id, created_at DESC);

-- index: whatsapp_conversation_favorites_v1_admin_created_idx
CREATE INDEX whatsapp_conversation_favorites_v1_admin_created_idx ON public.whatsapp_conversation_favorites_v1 USING btree (admin_user_id, created_at DESC);

-- index: whatsapp_conversation_order_overrides_v1_admin_updated_idx
CREATE INDEX whatsapp_conversation_order_overrides_v1_admin_updated_idx ON public.whatsapp_conversation_order_overrides_v1 USING btree (admin_user_id, updated_at DESC, conversation_id);

-- index: whatsapp_flow_sessions_expiry_idx
CREATE INDEX whatsapp_flow_sessions_expiry_idx ON public.whatsapp_flow_sessions USING btree (expires_at) WHERE (revoked_at IS NULL);

-- index: whatsapp_message_status_events_dedupe_uidx
CREATE UNIQUE INDEX whatsapp_message_status_events_dedupe_uidx ON public.whatsapp_message_status_events_v1 USING btree (message_id, status, occurred_at, COALESCE(error_code, ''::text));

-- index: whatsapp_message_status_events_message_idx
CREATE INDEX whatsapp_message_status_events_message_idx ON public.whatsapp_message_status_events_v1 USING btree (message_id, occurred_at, received_at);

-- index: whatsapp_messages_conversation_time_idx
CREATE INDEX whatsapp_messages_conversation_time_idx ON public.whatsapp_messages_v1 USING btree (conversation_id, COALESCE(received_at, sent_at, created_at), id);

-- index: whatsapp_messages_customer_time_idx
CREATE INDEX whatsapp_messages_customer_time_idx ON public.whatsapp_messages_v1 USING btree (customer_id, created_at DESC) WHERE (customer_id IS NOT NULL);

-- index: whatsapp_messages_outbound_status_idx
CREATE INDEX whatsapp_messages_outbound_status_idx ON public.whatsapp_messages_v1 USING btree (status_current, created_at) WHERE (direction = 'outbound'::text);

-- index: whatsapp_messages_reply_to_idx
CREATE INDEX whatsapp_messages_reply_to_idx ON public.whatsapp_messages_v1 USING btree (reply_to_message_id) WHERE (reply_to_message_id IS NOT NULL);

-- index: whatsapp_messages_v1_inbound_created_conversation_idx
CREATE INDEX whatsapp_messages_v1_inbound_created_conversation_idx ON public.whatsapp_messages_v1 USING btree (created_at DESC, conversation_id) WHERE (direction = 'inbound'::text);

-- index: whatsapp_messages_wamid_account_uidx
CREATE UNIQUE INDEX whatsapp_messages_wamid_account_uidx ON public.whatsapp_messages_v1 USING btree (whatsapp_account_id, provider_message_id) WHERE (provider_message_id ~~ 'wamid.%'::text);

-- index: whatsapp_outbox_account_idx
CREATE INDEX whatsapp_outbox_account_idx ON public.whatsapp_outbox_v1 USING btree (whatsapp_account_id);

-- index: whatsapp_outbox_conversation_idx
CREATE INDEX whatsapp_outbox_conversation_idx ON public.whatsapp_outbox_v1 USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);

-- index: whatsapp_outbox_customer_idx
CREATE INDEX whatsapp_outbox_customer_idx ON public.whatsapp_outbox_v1 USING btree (customer_id) WHERE (customer_id IS NOT NULL);

-- index: whatsapp_outbox_message_idx
CREATE INDEX whatsapp_outbox_message_idx ON public.whatsapp_outbox_v1 USING btree (message_id) WHERE (message_id IS NOT NULL);

-- index: whatsapp_outbox_ready_idx
CREATE INDEX whatsapp_outbox_ready_idx ON public.whatsapp_outbox_v1 USING btree (status, available_at, created_at) WHERE (status = 'queued'::text);

-- index: whatsapp_outbox_template_idx
CREATE INDEX whatsapp_outbox_template_idx ON public.whatsapp_outbox_v1 USING btree (template_id) WHERE (template_id IS NOT NULL);

-- index: whatsapp_papoai_status_queue_pending_idx
CREATE INDEX whatsapp_papoai_status_queue_pending_idx ON public.whatsapp_papoai_status_queue_v1 USING btree (next_attempt_at, id) WHERE ((processed_at IS NULL) AND (needs_review = false));

-- index: whatsapp_template_events_v1_account_received_idx
CREATE INDEX whatsapp_template_events_v1_account_received_idx ON public.whatsapp_template_events_v1 USING btree (whatsapp_account_id, received_at DESC);

-- index: whatsapp_template_events_v1_remote_template_idx
CREATE INDEX whatsapp_template_events_v1_remote_template_idx ON public.whatsapp_template_events_v1 USING btree (waba_id, meta_template_id, received_at DESC);

-- index: whatsapp_templates_account_idx
CREATE INDEX whatsapp_templates_account_idx ON public.whatsapp_templates_v1 USING btree (whatsapp_account_id) WHERE (whatsapp_account_id IS NOT NULL);

-- index: whatsapp_templates_meta_id_uidx
CREATE UNIQUE INDEX whatsapp_templates_meta_id_uidx ON public.whatsapp_templates_v1 USING btree (waba_id, meta_template_id) WHERE (meta_template_id IS NOT NULL);

-- index: whatsapp_webhook_events_account_received_idx
CREATE INDEX whatsapp_webhook_events_account_received_idx ON public.whatsapp_webhook_events_v1 USING btree (whatsapp_account_id, received_at DESC);

-- index: whatsapp_webhook_events_message_idx
CREATE INDEX whatsapp_webhook_events_message_idx ON public.whatsapp_webhook_events_v1 USING btree (whatsapp_account_id, provider, provider_message_id) WHERE (provider_message_id IS NOT NULL);

-- index: whatsapp_webhook_events_opaque_sender_review_idx
CREATE INDEX whatsapp_webhook_events_opaque_sender_review_idx ON public.whatsapp_webhook_events_v1 USING btree (received_at DESC, id DESC) WHERE ((provider = 'meta'::text) AND (event_type = 'message.received'::text) AND (status = 'review_required'::text) AND (phone_e164 IS NULL) AND ((payload ->> 'review_kind'::text) = 'opaque_sender'::text));

-- index: whatsapp_webhook_events_payload_fallback_uidx
CREATE UNIQUE INDEX whatsapp_webhook_events_payload_fallback_uidx ON public.whatsapp_webhook_events_v1 USING btree (provider, whatsapp_account_id, payload_hash) WHERE (provider_event_id IS NULL);

-- index: xml_catalog_ingest_errors_unresolved_v1
CREATE INDEX xml_catalog_ingest_errors_unresolved_v1 ON public.purchase_xml_catalog_ingest_errors_v1 USING btree (last_failed_at DESC) WHERE (resolved_at IS NULL);
