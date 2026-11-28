-- foreign_key: admin_audit_logs.admin_audit_logs_admin_user_id_fkey
alter table public.admin_audit_logs add constraint admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES admin_users(user_id) ON DELETE SET NULL;

-- foreign_key: admin_saved_card_uses_v1.admin_saved_card_uses_v1_card_id_fkey
alter table public.admin_saved_card_uses_v1 add constraint admin_saved_card_uses_v1_card_id_fkey FOREIGN KEY (card_id) REFERENCES admin_saved_cards_v1(id) ON DELETE CASCADE;

-- foreign_key: admin_users.admin_users_user_id_fkey
alter table public.admin_users add constraint admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- foreign_key: assembly_kit_items.assembly_kit_items_kit_id_fkey
alter table public.assembly_kit_items add constraint assembly_kit_items_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES assembly_kits(id) ON DELETE CASCADE;

-- foreign_key: assembly_kit_items.assembly_kit_items_product_id_fkey
alter table public.assembly_kit_items add constraint assembly_kit_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: assembly_kits.assembly_kits_source_kit_id_fkey
alter table public.assembly_kits add constraint assembly_kits_source_kit_id_fkey FOREIGN KEY (source_kit_id) REFERENCES assembly_kits(id) ON DELETE SET NULL;

-- foreign_key: attendance_conversation_auto_labels_v1.attendance_conversation_auto_labels_v1_conversation_fk
alter table public.attendance_conversation_auto_labels_v1 add constraint attendance_conversation_auto_labels_v1_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_auto_labels_v1.attendance_conversation_auto_labels_v1_label_fk
alter table public.attendance_conversation_auto_labels_v1 add constraint attendance_conversation_auto_labels_v1_label_fk FOREIGN KEY (label_id) REFERENCES attendance_labels_v1(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_labels_v1.attendance_conversation_labels_v1_conversation_fk
alter table public.attendance_conversation_labels_v1 add constraint attendance_conversation_labels_v1_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_labels_v1.attendance_conversation_labels_v1_label_fk
alter table public.attendance_conversation_labels_v1 add constraint attendance_conversation_labels_v1_label_fk FOREIGN KEY (label_id) REFERENCES attendance_labels_v1(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_manual_labels_v1.attendance_conversation_manual_labels_v1_conversation_fk
alter table public.attendance_conversation_manual_labels_v1 add constraint attendance_conversation_manual_labels_v1_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_manual_labels_v1.attendance_conversation_manual_labels_v1_label_fk
alter table public.attendance_conversation_manual_labels_v1 add constraint attendance_conversation_manual_labels_v1_label_fk FOREIGN KEY (label_id) REFERENCES attendance_labels_v1(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_state_v1.attendance_conversation_state_v1_conversation_id_fkey
alter table public.attendance_conversation_state_v1 add constraint attendance_conversation_state_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: attendance_conversation_state_v1.attendance_conversation_state_v1_last_read_message_id_fkey
alter table public.attendance_conversation_state_v1 add constraint attendance_conversation_state_v1_last_read_message_id_fkey FOREIGN KEY (last_read_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: attendance_human_ai_audit_v1.attendance_human_ai_audit_v1_conversation_id_fkey
alter table public.attendance_human_ai_audit_v1 add constraint attendance_human_ai_audit_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: attendance_library_audit_v1.attendance_library_audit_v1_conversation_id_fkey
alter table public.attendance_library_audit_v1 add constraint attendance_library_audit_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: attendance_library_audit_v1.attendance_library_audit_v1_item_id_fkey
alter table public.attendance_library_audit_v1 add constraint attendance_library_audit_v1_item_id_fkey FOREIGN KEY (item_id) REFERENCES attendance_library_items_v1(id) ON DELETE SET NULL;

-- foreign_key: attendance_library_audit_v1.attendance_library_audit_v1_message_id_fkey
alter table public.attendance_library_audit_v1 add constraint attendance_library_audit_v1_message_id_fkey FOREIGN KEY (message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: attendance_library_audit_v1.attendance_library_audit_v1_outbox_id_fkey
alter table public.attendance_library_audit_v1 add constraint attendance_library_audit_v1_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES whatsapp_outbox_v1(id) ON DELETE SET NULL;

-- foreign_key: attendance_library_audit_v1.attendance_library_audit_v1_whatsapp_account_id_fkey
alter table public.attendance_library_audit_v1 add constraint attendance_library_audit_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;

-- foreign_key: attendance_media_cache_v1.attendance_media_cache_v1_message_id_fkey
alter table public.attendance_media_cache_v1 add constraint attendance_media_cache_v1_message_id_fkey FOREIGN KEY (message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE CASCADE;

-- foreign_key: basket_admin_basket_types.basket_admin_basket_types_linked_basket_id_fkey
alter table public.basket_admin_basket_types add constraint basket_admin_basket_types_linked_basket_id_fkey FOREIGN KEY (linked_basket_id) REFERENCES basket_templates(id) ON DELETE SET NULL;

-- foreign_key: basket_admin_product_options.basket_admin_product_options_product_id_fkey
alter table public.basket_admin_product_options add constraint basket_admin_product_options_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: basket_admin_product_options.basket_admin_product_options_product_type_id_fkey
alter table public.basket_admin_product_options add constraint basket_admin_product_options_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES basket_admin_product_types(id) ON DELETE CASCADE;

-- foreign_key: basket_admin_quantities.basket_admin_quantities_basket_type_id_fkey
alter table public.basket_admin_quantities add constraint basket_admin_quantities_basket_type_id_fkey FOREIGN KEY (basket_type_id) REFERENCES basket_admin_basket_types(id) ON DELETE CASCADE;

-- foreign_key: basket_admin_quantities.basket_admin_quantities_product_type_id_fkey
alter table public.basket_admin_quantities add constraint basket_admin_quantities_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES basket_admin_product_types(id) ON DELETE CASCADE;

-- foreign_key: basket_extra_theme_products.basket_extra_theme_products_product_id_fkey
alter table public.basket_extra_theme_products add constraint basket_extra_theme_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: basket_extra_theme_products.basket_extra_theme_products_theme_id_fkey
alter table public.basket_extra_theme_products add constraint basket_extra_theme_products_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES basket_extra_themes(id) ON DELETE CASCADE;

-- foreign_key: basket_mold_position_options.basket_mold_position_options_position_id_fkey
alter table public.basket_mold_position_options add constraint basket_mold_position_options_position_id_fkey FOREIGN KEY (position_id) REFERENCES basket_mold_positions(id) ON DELETE CASCADE;

-- foreign_key: basket_mold_position_options.basket_mold_position_options_product_id_fkey
alter table public.basket_mold_position_options add constraint basket_mold_position_options_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: basket_mold_positions.basket_mold_positions_mold_id_fkey
alter table public.basket_mold_positions add constraint basket_mold_positions_mold_id_fkey FOREIGN KEY (mold_id) REFERENCES basket_molds(id) ON DELETE CASCADE;

-- foreign_key: basket_mold_shared_item_options.basket_mold_shared_item_options_product_id_fkey
alter table public.basket_mold_shared_item_options add constraint basket_mold_shared_item_options_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: basket_mold_shared_item_options.basket_mold_shared_item_options_shared_item_id_fkey
alter table public.basket_mold_shared_item_options add constraint basket_mold_shared_item_options_shared_item_id_fkey FOREIGN KEY (shared_item_id) REFERENCES basket_mold_shared_items(id) ON DELETE CASCADE;

-- foreign_key: basket_molds.basket_molds_basket_id_fkey
alter table public.basket_molds add constraint basket_molds_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id) ON DELETE CASCADE;

-- foreign_key: basket_molds.basket_molds_conditional_hidden_product_id_fkey
alter table public.basket_molds add constraint basket_molds_conditional_hidden_product_id_fkey FOREIGN KEY (conditional_hidden_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: basket_subcategories.basket_subcategories_category_id_fkey
alter table public.basket_subcategories add constraint basket_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES basket_categories(id) ON DELETE CASCADE;

-- foreign_key: basket_template_item_alternatives.basket_template_item_alternatives_product_id_fkey
alter table public.basket_template_item_alternatives add constraint basket_template_item_alternatives_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: basket_template_item_alternatives.basket_template_item_alternatives_template_item_id_fkey
alter table public.basket_template_item_alternatives add constraint basket_template_item_alternatives_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES basket_template_items(id) ON DELETE CASCADE;

-- foreign_key: basket_template_items.basket_template_items_basket_id_fkey
alter table public.basket_template_items add constraint basket_template_items_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id) ON DELETE CASCADE;

-- foreign_key: basket_template_items.basket_template_items_product_id_fkey
alter table public.basket_template_items add constraint basket_template_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- foreign_key: basket_templates.basket_templates_category_id_fkey
alter table public.basket_templates add constraint basket_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES basket_categories(id) ON DELETE SET NULL;

-- foreign_key: basket_templates.basket_templates_subcategory_id_fkey
alter table public.basket_templates add constraint basket_templates_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES basket_subcategories(id) ON DELETE SET NULL;

-- foreign_key: basket_templates.basket_templates_updated_by_fkey
alter table public.basket_templates add constraint basket_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- foreign_key: bling_hub_audit_v2.bling_hub_audit_v2_job_id_fkey
alter table public.bling_hub_audit_v2 add constraint bling_hub_audit_v2_job_id_fkey FOREIGN KEY (job_id) REFERENCES bling_hub_jobs_v2(id) ON DELETE SET NULL;

-- foreign_key: bling_order_homologation_allowlist.bling_order_homologation_allowlist_order_id_fkey
alter table public.bling_order_homologation_allowlist add constraint bling_order_homologation_allowlist_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: bling_order_stock_controls_v2.bling_order_stock_controls_v2_source_order_id_fkey
alter table public.bling_order_stock_controls_v2 add constraint bling_order_stock_controls_v2_source_order_id_fkey FOREIGN KEY (source_order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: bling_product_binding_events.bling_product_binding_events_product_id_fkey
alter table public.bling_product_binding_events add constraint bling_product_binding_events_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: bling_stock_mirror_v2.bling_stock_mirror_v2_product_id_fkey
alter table public.bling_stock_mirror_v2 add constraint bling_stock_mirror_v2_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: caneca_studio_jobs.caneca_studio_jobs_created_by_fkey
alter table public.caneca_studio_jobs add constraint caneca_studio_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- foreign_key: carts.carts_basket_id_fkey
alter table public.carts add constraint carts_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id);

-- foreign_key: carts.carts_conversation_id_fkey
alter table public.carts add constraint carts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- foreign_key: carts.carts_customer_id_fkey
alter table public.carts add constraint carts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- foreign_key: catalog_sessions.catalog_sessions_cart_id_fkey
alter table public.catalog_sessions add constraint catalog_sessions_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL;

-- foreign_key: catalog_sessions.catalog_sessions_conversation_id_fkey
alter table public.catalog_sessions add constraint catalog_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: catalog_sessions.catalog_sessions_customer_id_fkey
alter table public.catalog_sessions add constraint catalog_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: conversations.conversations_assigned_admin_user_id_fkey
alter table public.conversations add constraint conversations_assigned_admin_user_id_fkey FOREIGN KEY (assigned_admin_user_id) REFERENCES admin_users(user_id) ON DELETE SET NULL;

-- foreign_key: conversations.conversations_customer_id_fkey
alter table public.conversations add constraint conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- foreign_key: conversations.conversations_whatsapp_account_id_fkey
alter table public.conversations add constraint conversations_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: cosmos_catalog_family_members.cosmos_catalog_family_members_family_id_fkey
alter table public.cosmos_catalog_family_members add constraint cosmos_catalog_family_members_family_id_fkey FOREIGN KEY (family_id) REFERENCES cosmos_catalog_families(id) ON DELETE CASCADE;

-- foreign_key: cosmos_catalog_family_members.cosmos_catalog_family_members_product_id_fkey
alter table public.cosmos_catalog_family_members add constraint cosmos_catalog_family_members_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: cosmos_ean_capture_research_v1.cosmos_ean_capture_research_v1_capture_id_fkey
alter table public.cosmos_ean_capture_research_v1 add constraint cosmos_ean_capture_research_v1_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES ean_capture_records_v1(id) ON DELETE CASCADE;

-- foreign_key: cosmos_product_research.cosmos_product_research_product_id_fkey
alter table public.cosmos_product_research add constraint cosmos_product_research_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: cosmos_research_requests.cosmos_research_requests_product_id_fkey
alter table public.cosmos_research_requests add constraint cosmos_research_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: customer_address_reference_photos_v1.customer_address_reference_photos_v1_customer_address_id_fkey
alter table public.customer_address_reference_photos_v1 add constraint customer_address_reference_photos_v1_customer_address_id_fkey FOREIGN KEY (customer_address_id) REFERENCES customer_addresses(id) ON DELETE CASCADE;

-- foreign_key: customer_address_reference_photos_v1.customer_address_reference_photos_v1_driver_id_fkey
alter table public.customer_address_reference_photos_v1 add constraint customer_address_reference_photos_v1_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_drivers_v1(id) ON DELETE RESTRICT;

-- foreign_key: customer_address_reference_photos_v1.customer_address_reference_photos_v1_order_id_fkey
alter table public.customer_address_reference_photos_v1 add constraint customer_address_reference_photos_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: customer_address_reference_photos_v1.customer_address_reference_photos_v1_stop_id_fkey
alter table public.customer_address_reference_photos_v1 add constraint customer_address_reference_photos_v1_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES ops_delivery_stops(id) ON DELETE RESTRICT;

-- foreign_key: customer_addresses.customer_addresses_customer_id_fkey
alter table public.customer_addresses add constraint customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: customer_emails.customer_emails_customer_id_fkey
alter table public.customer_emails add constraint customer_emails_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: customer_identity_profiles_v1.customer_identity_profiles_v1_customer_id_fkey
alter table public.customer_identity_profiles_v1 add constraint customer_identity_profiles_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: customer_location_evidence_v1.customer_location_evidence_v1_customer_address_id_fkey
alter table public.customer_location_evidence_v1 add constraint customer_location_evidence_v1_customer_address_id_fkey FOREIGN KEY (customer_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

-- foreign_key: customer_location_evidence_v1.customer_location_evidence_v1_customer_id_fkey
alter table public.customer_location_evidence_v1 add constraint customer_location_evidence_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: customer_location_evidence_v1.customer_location_evidence_v1_order_id_fkey
alter table public.customer_location_evidence_v1 add constraint customer_location_evidence_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: customer_location_evidence_v1.customer_location_evidence_v1_whatsapp_message_id_fkey
alter table public.customer_location_evidence_v1 add constraint customer_location_evidence_v1_whatsapp_message_id_fkey FOREIGN KEY (whatsapp_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: customer_phones.customer_phones_customer_id_fkey
alter table public.customer_phones add constraint customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: customer_profile_confirmation_requests_v1.customer_profile_confirmation_confirmation_inbound_message_fkey
alter table public.customer_profile_confirmation_requests_v1 add constraint customer_profile_confirmation_confirmation_inbound_message_fkey FOREIGN KEY (confirmation_inbound_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: customer_profile_confirmation_requests_v1.customer_profile_confirmation_requests_outbound_message_id_fkey
alter table public.customer_profile_confirmation_requests_v1 add constraint customer_profile_confirmation_requests_outbound_message_id_fkey FOREIGN KEY (outbound_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: customer_profile_confirmation_requests_v1.customer_profile_confirmation_requests_v1_conversation_id_fkey
alter table public.customer_profile_confirmation_requests_v1 add constraint customer_profile_confirmation_requests_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: customer_profile_confirmation_requests_v1.customer_profile_confirmation_requests_v1_customer_id_fkey
alter table public.customer_profile_confirmation_requests_v1 add constraint customer_profile_confirmation_requests_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: customer_profile_extraction_runs_v1.customer_profile_extraction_runs_v1_conversation_id_fkey
alter table public.customer_profile_extraction_runs_v1 add constraint customer_profile_extraction_runs_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: customer_profile_extraction_runs_v1.customer_profile_extraction_runs_v1_customer_id_fkey
alter table public.customer_profile_extraction_runs_v1 add constraint customer_profile_extraction_runs_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: customer_profile_suggestions_v1.customer_profile_suggestions_v1_conversation_id_fkey
alter table public.customer_profile_suggestions_v1 add constraint customer_profile_suggestions_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: customer_profile_suggestions_v1.customer_profile_suggestions_v1_customer_id_fkey
alter table public.customer_profile_suggestions_v1 add constraint customer_profile_suggestions_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: customer_profile_suggestions_v1.customer_profile_suggestions_v1_run_id_fkey
alter table public.customer_profile_suggestions_v1 add constraint customer_profile_suggestions_v1_run_id_fkey FOREIGN KEY (run_id) REFERENCES customer_profile_extraction_runs_v1(id) ON DELETE CASCADE;

-- foreign_key: da_instagram_job_events_v1.da_instagram_job_events_v1_job_id_fkey
alter table public.da_instagram_job_events_v1 add constraint da_instagram_job_events_v1_job_id_fkey FOREIGN KEY (job_id) REFERENCES da_instagram_jobs_v1(id) ON DELETE CASCADE;

-- foreign_key: da_instagram_job_items_v1.da_instagram_job_items_v1_job_id_fkey
alter table public.da_instagram_job_items_v1 add constraint da_instagram_job_items_v1_job_id_fkey FOREIGN KEY (job_id) REFERENCES da_instagram_jobs_v1(id) ON DELETE CASCADE;

-- foreign_key: da_instagram_jobs_v1.da_instagram_jobs_v1_automation_id_fkey
alter table public.da_instagram_jobs_v1 add constraint da_instagram_jobs_v1_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES da_instagram_automations_v1(id) ON DELETE RESTRICT;

-- foreign_key: delivery_customer_notifications_v1.delivery_customer_notifications_v1_driver_id_fkey
alter table public.delivery_customer_notifications_v1 add constraint delivery_customer_notifications_v1_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_drivers_v1(id) ON DELETE RESTRICT;

-- foreign_key: delivery_customer_notifications_v1.delivery_customer_notifications_v1_order_id_fkey
alter table public.delivery_customer_notifications_v1 add constraint delivery_customer_notifications_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: delivery_customer_notifications_v1.delivery_customer_notifications_v1_run_id_fkey
alter table public.delivery_customer_notifications_v1 add constraint delivery_customer_notifications_v1_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops_delivery_runs(id) ON DELETE RESTRICT;

-- foreign_key: delivery_customer_notifications_v1.delivery_customer_notifications_v1_stop_id_fkey
alter table public.delivery_customer_notifications_v1 add constraint delivery_customer_notifications_v1_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES ops_delivery_stops(id) ON DELETE RESTRICT;

-- foreign_key: delivery_driver_access_v1.delivery_driver_access_v1_driver_id_fkey
alter table public.delivery_driver_access_v1 add constraint delivery_driver_access_v1_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_drivers_v1(id) ON DELETE CASCADE;

-- foreign_key: delivery_drivers_v1.delivery_drivers_v1_home_region_id_fkey
alter table public.delivery_drivers_v1 add constraint delivery_drivers_v1_home_region_id_fkey FOREIGN KEY (home_region_id) REFERENCES delivery_regions_v1(id) ON DELETE SET NULL;

-- foreign_key: dispatch_fiscal_jobs.dispatch_fiscal_jobs_order_id_fkey
alter table public.dispatch_fiscal_jobs add constraint dispatch_fiscal_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: fiscal_issue_jobs.fiscal_issue_jobs_order_id_fkey
alter table public.fiscal_issue_jobs add constraint fiscal_issue_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: fiscal_nfe_recovery_events_v1.fiscal_nfe_recovery_events_v1_dispatch_job_id_fkey
alter table public.fiscal_nfe_recovery_events_v1 add constraint fiscal_nfe_recovery_events_v1_dispatch_job_id_fkey FOREIGN KEY (dispatch_job_id) REFERENCES dispatch_fiscal_jobs(id) ON DELETE SET NULL;

-- foreign_key: fiscal_nfe_recovery_events_v1.fiscal_nfe_recovery_events_v1_order_id_fkey
alter table public.fiscal_nfe_recovery_events_v1 add constraint fiscal_nfe_recovery_events_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: fiscal_rule_validation_policy.fiscal_rule_validation_policy_rule_id_fkey
alter table public.fiscal_rule_validation_policy add constraint fiscal_rule_validation_policy_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES fiscal_st_rules_mt(id) ON DELETE CASCADE;

-- foreign_key: fiscal_st_rules_mt.fiscal_st_rules_mt_rule_set_id_fkey
alter table public.fiscal_st_rules_mt add constraint fiscal_st_rules_mt_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES fiscal_rule_sets(id) ON DELETE CASCADE;

-- foreign_key: inventory_label_batches.inventory_label_batches_created_by_fkey
alter table public.inventory_label_batches add constraint inventory_label_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- foreign_key: inventory_label_counts.inventory_label_counts_batch_id_fkey
alter table public.inventory_label_counts add constraint inventory_label_counts_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES inventory_label_batches(id);

-- foreign_key: inventory_label_counts.inventory_label_counts_photo_id_fkey
alter table public.inventory_label_counts add constraint inventory_label_counts_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES inventory_label_photos(id);

-- foreign_key: inventory_label_counts.inventory_label_counts_product_id_fkey
alter table public.inventory_label_counts add constraint inventory_label_counts_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- foreign_key: inventory_label_counts.inventory_label_counts_reviewed_by_fkey
alter table public.inventory_label_counts add constraint inventory_label_counts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

-- foreign_key: inventory_label_photos.inventory_label_photos_batch_id_fkey
alter table public.inventory_label_photos add constraint inventory_label_photos_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES inventory_label_batches(id);

-- foreign_key: inventory_label_photos.inventory_label_photos_created_by_fkey
alter table public.inventory_label_photos add constraint inventory_label_photos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- foreign_key: inventory_sheet_item_results.inventory_sheet_item_results_scan_id_fkey
alter table public.inventory_sheet_item_results add constraint inventory_sheet_item_results_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES inventory_sheet_page_scans(id) ON DELETE CASCADE;

-- foreign_key: inventory_sheet_item_results.inventory_sheet_item_results_sheet_item_id_fkey
alter table public.inventory_sheet_item_results add constraint inventory_sheet_item_results_sheet_item_id_fkey FOREIGN KEY (sheet_item_id) REFERENCES inventory_sheet_items(id) ON DELETE CASCADE;

-- foreign_key: inventory_sheet_items.inventory_sheet_items_batch_id_fkey
alter table public.inventory_sheet_items add constraint inventory_sheet_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES inventory_sheet_batches(id) ON DELETE CASCADE;

-- foreign_key: inventory_sheet_items.inventory_sheet_items_product_id_fkey
alter table public.inventory_sheet_items add constraint inventory_sheet_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- foreign_key: inventory_sheet_page_scans.inventory_sheet_page_scans_batch_id_fkey
alter table public.inventory_sheet_page_scans add constraint inventory_sheet_page_scans_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES inventory_sheet_batches(id) ON DELETE CASCADE;

-- foreign_key: inventory_unknown_eans.inventory_unknown_eans_linked_product_id_fkey
alter table public.inventory_unknown_eans add constraint inventory_unknown_eans_linked_product_id_fkey FOREIGN KEY (linked_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: marketing_attribution_events_v1.marketing_attribution_events_v1_campaign_id_fkey
alter table public.marketing_attribution_events_v1 add constraint marketing_attribution_events_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id);

-- foreign_key: marketing_attribution_events_v1.marketing_attribution_events_v1_customer_id_fkey
alter table public.marketing_attribution_events_v1 add constraint marketing_attribution_events_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- foreign_key: marketing_attribution_events_v1.marketing_attribution_events_v1_order_id_fkey
alter table public.marketing_attribution_events_v1 add constraint marketing_attribution_events_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);

-- foreign_key: marketing_attribution_events_v1.marketing_attribution_events_v1_strategy_id_fkey
alter table public.marketing_attribution_events_v1 add constraint marketing_attribution_events_v1_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES marketing_strategy_runs_v1(id);

-- foreign_key: marketing_campaign_dispatches_v1.marketing_campaign_dispatches_manual_batch_fk
alter table public.marketing_campaign_dispatches_v1 add constraint marketing_campaign_dispatches_manual_batch_fk FOREIGN KEY (manual_batch_id) REFERENCES marketing_campaign_manual_batches_v1(id) ON DELETE SET NULL;

-- foreign_key: marketing_campaign_dispatches_v1.marketing_campaign_dispatches_v1_campaign_id_fkey
alter table public.marketing_campaign_dispatches_v1 add constraint marketing_campaign_dispatches_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_campaign_dispatches_v1.marketing_campaign_dispatches_v1_customer_id_fkey
alter table public.marketing_campaign_dispatches_v1 add constraint marketing_campaign_dispatches_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- foreign_key: marketing_campaign_dispatches_v1.marketing_campaign_dispatches_v1_outbox_id_fkey
alter table public.marketing_campaign_dispatches_v1 add constraint marketing_campaign_dispatches_v1_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES whatsapp_outbox_v1(id) ON DELETE SET NULL;

-- foreign_key: marketing_campaign_dispatches_v1.marketing_campaign_dispatches_v1_snapshot_id_fkey
alter table public.marketing_campaign_dispatches_v1 add constraint marketing_campaign_dispatches_v1_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES marketing_campaign_snapshots_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_campaign_dispatches_v1.marketing_campaign_dispatches_v1_whatsapp_account_id_fkey
alter table public.marketing_campaign_dispatches_v1 add constraint marketing_campaign_dispatches_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: marketing_campaign_events_v1.marketing_campaign_events_v1_campaign_id_fkey
alter table public.marketing_campaign_events_v1 add constraint marketing_campaign_events_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id);

-- foreign_key: marketing_campaign_events_v1.marketing_campaign_events_v1_snapshot_id_fkey
alter table public.marketing_campaign_events_v1 add constraint marketing_campaign_events_v1_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES marketing_campaign_snapshots_v1(id);

-- foreign_key: marketing_campaign_execution_runtime_v1.marketing_campaign_execution_runtime_v_whatsapp_account_id_fkey
alter table public.marketing_campaign_execution_runtime_v1 add constraint marketing_campaign_execution_runtime_v_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: marketing_campaign_manual_batches_v1.marketing_campaign_manual_batches_v1_campaign_id_fkey
alter table public.marketing_campaign_manual_batches_v1 add constraint marketing_campaign_manual_batches_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_campaign_snapshot_recipients_v1.marketing_campaign_snapshot_recipients_v1_campaign_id_fkey
alter table public.marketing_campaign_snapshot_recipients_v1 add constraint marketing_campaign_snapshot_recipients_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id);

-- foreign_key: marketing_campaign_snapshot_recipients_v1.marketing_campaign_snapshot_recipients_v1_customer_id_fkey
alter table public.marketing_campaign_snapshot_recipients_v1 add constraint marketing_campaign_snapshot_recipients_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- foreign_key: marketing_campaign_snapshot_recipients_v1.marketing_campaign_snapshot_recipients_v1_snapshot_id_fkey
alter table public.marketing_campaign_snapshot_recipients_v1 add constraint marketing_campaign_snapshot_recipients_v1_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES marketing_campaign_snapshots_v1(id);

-- foreign_key: marketing_campaign_snapshot_recipients_v1.marketing_campaign_snapshot_recipients_whatsapp_account_id_fkey
alter table public.marketing_campaign_snapshot_recipients_v1 add constraint marketing_campaign_snapshot_recipients_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: marketing_campaign_snapshots_v1.marketing_campaign_snapshots_v1_campaign_id_fkey
alter table public.marketing_campaign_snapshots_v1 add constraint marketing_campaign_snapshots_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id);

-- foreign_key: marketing_campaign_snapshots_v1.marketing_campaign_snapshots_v1_template_id_fkey
alter table public.marketing_campaign_snapshots_v1 add constraint marketing_campaign_snapshots_v1_template_id_fkey FOREIGN KEY (template_id) REFERENCES whatsapp_templates_v1(id);

-- foreign_key: marketing_campaign_snapshots_v1.marketing_campaign_snapshots_v1_whatsapp_account_id_fkey
alter table public.marketing_campaign_snapshots_v1 add constraint marketing_campaign_snapshots_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: marketing_campaigns_v1.marketing_campaigns_v1_strategy_id_fkey
alter table public.marketing_campaigns_v1 add constraint marketing_campaigns_v1_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES marketing_strategy_runs_v1(id) ON DELETE SET NULL;

-- foreign_key: marketing_campaigns_v1.marketing_campaigns_v1_template_id_fkey
alter table public.marketing_campaigns_v1 add constraint marketing_campaigns_v1_template_id_fkey FOREIGN KEY (template_id) REFERENCES whatsapp_templates_v1(id);

-- foreign_key: marketing_campaigns_v1.marketing_campaigns_v1_whatsapp_account_id_fkey
alter table public.marketing_campaigns_v1 add constraint marketing_campaigns_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: marketing_optout_events_v1.marketing_optout_events_v1_capture_id_fkey
alter table public.marketing_optout_events_v1 add constraint marketing_optout_events_v1_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES papoai_webhook_inbox_v2(id) ON DELETE CASCADE;

-- foreign_key: marketing_optout_events_v1.marketing_optout_events_v1_customer_id_fkey
alter table public.marketing_optout_events_v1 add constraint marketing_optout_events_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: marketing_optout_events_v2.marketing_optout_events_v2_customer_id_fkey
alter table public.marketing_optout_events_v2 add constraint marketing_optout_events_v2_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: marketing_optout_events_v2.marketing_optout_events_v2_whatsapp_message_id_fkey
alter table public.marketing_optout_events_v2 add constraint marketing_optout_events_v2_whatsapp_message_id_fkey FOREIGN KEY (whatsapp_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: marketing_repurchase_state_v1.marketing_repurchase_state_v1_customer_id_fkey
alter table public.marketing_repurchase_state_v1 add constraint marketing_repurchase_state_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: marketing_repurchase_state_v1.marketing_repurchase_state_v1_last_purchase_order_id_fkey
alter table public.marketing_repurchase_state_v1 add constraint marketing_repurchase_state_v1_last_purchase_order_id_fkey FOREIGN KEY (last_purchase_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: marketing_repurchase_state_v1.marketing_repurchase_state_v1_last_sent_order_id_fkey
alter table public.marketing_repurchase_state_v1 add constraint marketing_repurchase_state_v1_last_sent_order_id_fkey FOREIGN KEY (last_sent_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: marketing_strategy_events_v1.marketing_strategy_events_v1_strategy_id_fkey
alter table public.marketing_strategy_events_v1 add constraint marketing_strategy_events_v1_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES marketing_strategy_runs_v1(id);

-- foreign_key: marketing_strategy_offers_v1.marketing_strategy_offers_v1_strategy_id_fkey
alter table public.marketing_strategy_offers_v1 add constraint marketing_strategy_offers_v1_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES marketing_strategy_runs_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_strategy_runs_v1.marketing_strategy_runs_v1_campaign_id_fkey
alter table public.marketing_strategy_runs_v1 add constraint marketing_strategy_runs_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id);

-- foreign_key: marketing_strategy_runs_v1.marketing_strategy_runs_v1_template_id_fkey
alter table public.marketing_strategy_runs_v1 add constraint marketing_strategy_runs_v1_template_id_fkey FOREIGN KEY (template_id) REFERENCES whatsapp_templates_v1(id);

-- foreign_key: marketing_strategy_runs_v1.marketing_strategy_runs_v1_weight_set_id_fkey
alter table public.marketing_strategy_runs_v1 add constraint marketing_strategy_runs_v1_weight_set_id_fkey FOREIGN KEY (weight_set_id) REFERENCES marketing_strategy_weight_sets_v1(id);

-- foreign_key: marketing_strategy_runs_v1.marketing_strategy_runs_v1_whatsapp_account_id_fkey
alter table public.marketing_strategy_runs_v1 add constraint marketing_strategy_runs_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: marketing_template_lifecycle_v1.marketing_template_lifecycle_v1_template_id_fkey
alter table public.marketing_template_lifecycle_v1 add constraint marketing_template_lifecycle_v1_template_id_fkey FOREIGN KEY (template_id) REFERENCES whatsapp_templates_v1(id);

-- foreign_key: marketing_tracking_links_v1.marketing_tracking_links_v1_attributed_order_id_fkey
alter table public.marketing_tracking_links_v1 add constraint marketing_tracking_links_v1_attributed_order_id_fkey FOREIGN KEY (attributed_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: marketing_tracking_links_v1.marketing_tracking_links_v1_campaign_id_fkey
alter table public.marketing_tracking_links_v1 add constraint marketing_tracking_links_v1_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_tracking_links_v1.marketing_tracking_links_v1_customer_id_fkey
alter table public.marketing_tracking_links_v1 add constraint marketing_tracking_links_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: marketing_tracking_links_v1.marketing_tracking_links_v1_dispatch_id_fkey
alter table public.marketing_tracking_links_v1 add constraint marketing_tracking_links_v1_dispatch_id_fkey FOREIGN KEY (dispatch_id) REFERENCES marketing_campaign_dispatches_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_tracking_links_v1.marketing_tracking_links_v1_strategy_id_fkey
alter table public.marketing_tracking_links_v1 add constraint marketing_tracking_links_v1_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES marketing_strategy_runs_v1(id) ON DELETE CASCADE;

-- foreign_key: marketing_weekly_consent_requests_v1.marketing_weekly_consent_requests_v1_consent_event_id_fkey
alter table public.marketing_weekly_consent_requests_v1 add constraint marketing_weekly_consent_requests_v1_consent_event_id_fkey FOREIGN KEY (consent_event_id) REFERENCES marketing_consent_events_v1(id) ON DELETE SET NULL;

-- foreign_key: marketing_weekly_consent_requests_v1.marketing_weekly_consent_requests_v1_conversation_id_fkey
alter table public.marketing_weekly_consent_requests_v1 add constraint marketing_weekly_consent_requests_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: marketing_weekly_consent_requests_v1.marketing_weekly_consent_requests_v1_customer_id_fkey
alter table public.marketing_weekly_consent_requests_v1 add constraint marketing_weekly_consent_requests_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- foreign_key: marketing_weekly_consent_requests_v1.marketing_weekly_consent_requests_v1_outbox_id_fkey
alter table public.marketing_weekly_consent_requests_v1 add constraint marketing_weekly_consent_requests_v1_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES whatsapp_outbox_v1(id) ON DELETE SET NULL;

-- foreign_key: marketing_weekly_consent_requests_v1.marketing_weekly_consent_requests_v1_response_message_id_fkey
alter table public.marketing_weekly_consent_requests_v1 add constraint marketing_weekly_consent_requests_v1_response_message_id_fkey FOREIGN KEY (response_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: ops2_bling_orphan_product_reviews.ops2_bling_orphan_product_reviews_linked_local_product_id_fkey
alter table public.ops2_bling_orphan_product_reviews add constraint ops2_bling_orphan_product_reviews_linked_local_product_id_fkey FOREIGN KEY (linked_local_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: ops2_catalog_baseline_items.ops2_catalog_baseline_items_product_id_fkey
alter table public.ops2_catalog_baseline_items add constraint ops2_catalog_baseline_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_baseline_items.ops2_catalog_baseline_items_run_id_fkey
alter table public.ops2_catalog_baseline_items add constraint ops2_catalog_baseline_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops2_catalog_baseline_runs(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_product_parity_reviews.ops2_catalog_product_parity_reviews_product_id_fkey
alter table public.ops2_catalog_product_parity_reviews add constraint ops2_catalog_product_parity_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: ops2_catalog_stock_highrisk_reviews.ops2_catalog_stock_highrisk_reviews_product_id_fkey
alter table public.ops2_catalog_stock_highrisk_reviews add constraint ops2_catalog_stock_highrisk_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: ops2_catalog_stock_highrisk_reviews.ops2_catalog_stock_highrisk_reviews_run_id_fkey
alter table public.ops2_catalog_stock_highrisk_reviews add constraint ops2_catalog_stock_highrisk_reviews_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops2_catalog_baseline_runs(id) ON DELETE CASCADE;

-- foreign_key: ops2_catalog_sync_canaries.ops2_catalog_sync_canaries_run_id_fkey
alter table public.ops2_catalog_sync_canaries add constraint ops2_catalog_sync_canaries_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops2_catalog_baseline_runs(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_sync_canary_items.ops2_catalog_sync_canary_items_canary_id_fkey
alter table public.ops2_catalog_sync_canary_items add constraint ops2_catalog_sync_canary_items_canary_id_fkey FOREIGN KEY (canary_id) REFERENCES ops2_catalog_sync_canaries(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_sync_canary_items.ops2_catalog_sync_canary_items_product_id_fkey
alter table public.ops2_catalog_sync_canary_items add constraint ops2_catalog_sync_canary_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_sync_canary_items.ops2_catalog_sync_canary_items_run_id_fkey
alter table public.ops2_catalog_sync_canary_items add constraint ops2_catalog_sync_canary_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops2_catalog_baseline_runs(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_sync_plan_items.ops2_catalog_sync_plan_items_product_id_fkey
alter table public.ops2_catalog_sync_plan_items add constraint ops2_catalog_sync_plan_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: ops2_catalog_sync_plan_items.ops2_catalog_sync_plan_items_run_id_fkey
alter table public.ops2_catalog_sync_plan_items add constraint ops2_catalog_sync_plan_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops2_catalog_baseline_runs(id) ON DELETE RESTRICT;

-- foreign_key: ops2_customer_registration_journeys_v1.ops2_customer_registration_journeys_v1_customer_id_fkey
alter table public.ops2_customer_registration_journeys_v1 add constraint ops2_customer_registration_journeys_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: ops2_customer_registration_journeys_v1.ops2_customer_registration_journeys_v1_order_id_fkey
alter table public.ops2_customer_registration_journeys_v1 add constraint ops2_customer_registration_journeys_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops2_meta_whatsapp_flow_bindings_v1.ops2_meta_whatsapp_flow_bindings_v1_whatsapp_account_id_fkey
alter table public.ops2_meta_whatsapp_flow_bindings_v1 add constraint ops2_meta_whatsapp_flow_bindings_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: ops2_meta_whatsapp_senders_v1.ops2_meta_whatsapp_senders_v1_whatsapp_account_id_fkey
alter table public.ops2_meta_whatsapp_senders_v1 add constraint ops2_meta_whatsapp_senders_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: ops2_order_registration_links_v1.ops2_order_registration_links_v1_consumed_customer_id_fkey
alter table public.ops2_order_registration_links_v1 add constraint ops2_order_registration_links_v1_consumed_customer_id_fkey FOREIGN KEY (consumed_customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: ops2_order_registration_links_v1.ops2_order_registration_links_v1_order_id_fkey
alter table public.ops2_order_registration_links_v1 add constraint ops2_order_registration_links_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops2_papoai_channel_bindings_v1.ops2_papoai_channel_bindings_v1_whatsapp_account_id_fkey
alter table public.ops2_papoai_channel_bindings_v1 add constraint ops2_papoai_channel_bindings_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: ops2_papoai_order_signal_outbox_v1.ops2_papoai_order_signal_outbox_v1_order_id_fkey
alter table public.ops2_papoai_order_signal_outbox_v1 add constraint ops2_papoai_order_signal_outbox_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops2_papoai_order_signal_runtime_v1.ops2_papoai_order_signal_runtime_v1_canary_order_id_fkey
alter table public.ops2_papoai_order_signal_runtime_v1 add constraint ops2_papoai_order_signal_runtime_v1_canary_order_id_fkey FOREIGN KEY (canary_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: ops2_papoai_outbound_intents_v1.ops2_papoai_outbound_intents_v1_conversation_id_fkey
alter table public.ops2_papoai_outbound_intents_v1 add constraint ops2_papoai_outbound_intents_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: ops2_papoai_outbound_intents_v1.ops2_papoai_outbound_intents_v1_customer_id_fkey
alter table public.ops2_papoai_outbound_intents_v1 add constraint ops2_papoai_outbound_intents_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: ops2_papoai_outbound_intents_v1.ops2_papoai_outbound_intents_v1_order_id_fkey
alter table public.ops2_papoai_outbound_intents_v1 add constraint ops2_papoai_outbound_intents_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops2_papoai_outbound_intents_v1.ops2_papoai_outbound_intents_v1_whatsapp_account_id_fkey
alter table public.ops2_papoai_outbound_intents_v1 add constraint ops2_papoai_outbound_intents_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;

-- foreign_key: ops2_whatsapp_outbox_v1.ops2_whatsapp_outbox_v1_conversation_id_fkey
alter table public.ops2_whatsapp_outbox_v1 add constraint ops2_whatsapp_outbox_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: ops2_whatsapp_outbox_v1.ops2_whatsapp_outbox_v1_customer_id_fkey
alter table public.ops2_whatsapp_outbox_v1 add constraint ops2_whatsapp_outbox_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: ops2_whatsapp_outbox_v1.ops2_whatsapp_outbox_v1_order_id_fkey
alter table public.ops2_whatsapp_outbox_v1 add constraint ops2_whatsapp_outbox_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops2_whatsapp_outbox_v1.ops2_whatsapp_outbox_v1_whatsapp_account_id_fkey
alter table public.ops2_whatsapp_outbox_v1 add constraint ops2_whatsapp_outbox_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_runs.ops_delivery_runs_driver_id_fkey
alter table public.ops_delivery_runs add constraint ops_delivery_runs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_drivers_v1(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_runs.ops_delivery_runs_region_id_fkey
alter table public.ops_delivery_runs add constraint ops_delivery_runs_region_id_fkey FOREIGN KEY (region_id) REFERENCES delivery_regions_v1(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_runs.ops_delivery_runs_vehicle_id_fkey
alter table public.ops_delivery_runs add constraint ops_delivery_runs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES delivery_vehicles_v1(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_stops.ops_delivery_stops_customer_address_id_fkey
alter table public.ops_delivery_stops add constraint ops_delivery_stops_customer_address_id_fkey FOREIGN KEY (customer_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_stops.ops_delivery_stops_location_evidence_id_fkey
alter table public.ops_delivery_stops add constraint ops_delivery_stops_location_evidence_id_fkey FOREIGN KEY (location_evidence_id) REFERENCES customer_location_evidence_v1(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_stops.ops_delivery_stops_order_id_fkey
alter table public.ops_delivery_stops add constraint ops_delivery_stops_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: ops_delivery_stops.ops_delivery_stops_region_id_fkey
alter table public.ops_delivery_stops add constraint ops_delivery_stops_region_id_fkey FOREIGN KEY (region_id) REFERENCES delivery_regions_v1(id) ON DELETE SET NULL;

-- foreign_key: ops_delivery_stops.ops_delivery_stops_run_id_fkey
alter table public.ops_delivery_stops add constraint ops_delivery_stops_run_id_fkey FOREIGN KEY (run_id) REFERENCES ops_delivery_runs(id) ON DELETE CASCADE;

-- foreign_key: ops_inventory_counts.ops_inventory_counts_product_id_fkey
alter table public.ops_inventory_counts add constraint ops_inventory_counts_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: ops_inventory_incidents.ops_inventory_incidents_product_id_fkey
alter table public.ops_inventory_incidents add constraint ops_inventory_incidents_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: ops_inventory_incidents.ops_inventory_incidents_source_order_id_fkey
alter table public.ops_inventory_incidents add constraint ops_inventory_incidents_source_order_id_fkey FOREIGN KEY (source_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: ops_order_check_items.ops_order_check_items_product_id_fkey
alter table public.ops_order_check_items add constraint ops_order_check_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- foreign_key: ops_order_check_items.ops_order_check_items_session_id_fkey
alter table public.ops_order_check_items add constraint ops_order_check_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES ops_order_check_sessions(id) ON DELETE CASCADE;

-- foreign_key: ops_order_check_sessions.ops_order_check_sessions_order_id_fkey
alter table public.ops_order_check_sessions add constraint ops_order_check_sessions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops_payment_bling_shadow_plans_v1.ops_payment_bling_shadow_plans_v1_order_id_fkey
alter table public.ops_payment_bling_shadow_plans_v1 add constraint ops_payment_bling_shadow_plans_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: ops_payment_bling_shadow_plans_v1.ops_payment_bling_shadow_plans_v1_settlement_id_fkey
alter table public.ops_payment_bling_shadow_plans_v1 add constraint ops_payment_bling_shadow_plans_v1_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES order_payment_settlements(id) ON DELETE RESTRICT;

-- foreign_key: ops_stock_reconciliation_reviews.ops_stock_reconciliation_reviews_attention_id_fkey
alter table public.ops_stock_reconciliation_reviews add constraint ops_stock_reconciliation_reviews_attention_id_fkey FOREIGN KEY (attention_id) REFERENCES ops_attention(id) ON DELETE RESTRICT;

-- foreign_key: ops_stock_reconciliation_reviews.ops_stock_reconciliation_reviews_count_id_fkey
alter table public.ops_stock_reconciliation_reviews add constraint ops_stock_reconciliation_reviews_count_id_fkey FOREIGN KEY (count_id) REFERENCES ops_inventory_counts(id) ON DELETE RESTRICT;

-- foreign_key: ops_stock_reconciliation_reviews.ops_stock_reconciliation_reviews_product_id_fkey
alter table public.ops_stock_reconciliation_reviews add constraint ops_stock_reconciliation_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: order_delivery_return_cases.order_delivery_return_cases_order_id_fkey
alter table public.order_delivery_return_cases add constraint order_delivery_return_cases_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: order_fiscal_controls.order_fiscal_controls_order_id_fkey
alter table public.order_fiscal_controls add constraint order_fiscal_controls_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_items.order_items_order_id_fkey
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_items.order_items_product_id_fkey
alter table public.order_items add constraint order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- foreign_key: order_manual_separation_queue_v1.order_manual_separation_queue_v1_order_id_fkey
alter table public.order_manual_separation_queue_v1 add constraint order_manual_separation_queue_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_payment_parts.order_payment_parts_settlement_id_fkey
alter table public.order_payment_parts add constraint order_payment_parts_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES order_payment_settlements(id) ON DELETE CASCADE;

-- foreign_key: order_payment_settlements.order_payment_settlements_order_id_fkey
alter table public.order_payment_settlements add constraint order_payment_settlements_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: order_public_snapshots_v1.order_public_snapshots_v1_order_id_fkey
alter table public.order_public_snapshots_v1 add constraint order_public_snapshots_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_separation_assignments_v1.order_separation_assignments_v1_order_id_fkey
alter table public.order_separation_assignments_v1 add constraint order_separation_assignments_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_separation_completions_v1.order_separation_completions_v1_order_id_fkey
alter table public.order_separation_completions_v1 add constraint order_separation_completions_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_separation_customer_notifications_v1.order_separation_customer_notification_whatsapp_account_id_fkey
alter table public.order_separation_customer_notifications_v1 add constraint order_separation_customer_notification_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;

-- foreign_key: order_separation_customer_notifications_v1.order_separation_customer_notifications_v1_conversation_id_fkey
alter table public.order_separation_customer_notifications_v1 add constraint order_separation_customer_notifications_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: order_separation_customer_notifications_v1.order_separation_customer_notifications_v1_customer_id_fkey
alter table public.order_separation_customer_notifications_v1 add constraint order_separation_customer_notifications_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: order_separation_customer_notifications_v1.order_separation_customer_notifications_v1_order_id_fkey
alter table public.order_separation_customer_notifications_v1 add constraint order_separation_customer_notifications_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_separation_items_v1.order_separation_items_v1_order_id_fkey
alter table public.order_separation_items_v1 add constraint order_separation_items_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_separation_items_v1.order_separation_items_v1_order_item_id_fkey
alter table public.order_separation_items_v1 add constraint order_separation_items_v1_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;

-- foreign_key: order_separation_items_v1.order_separation_items_v1_product_id_fkey
alter table public.order_separation_items_v1 add constraint order_separation_items_v1_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_basket_id_fkey
alter table public.orders add constraint orders_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_cart_id_fkey
alter table public.orders add constraint orders_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_catalog_session_id_fkey
alter table public.orders add constraint orders_catalog_session_id_fkey FOREIGN KEY (catalog_session_id) REFERENCES catalog_sessions(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_conversation_id_fkey
alter table public.orders add constraint orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- foreign_key: orders.orders_customer_id_fkey
alter table public.orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- foreign_key: orders.orders_delivery_customer_address_id_fkey
alter table public.orders add constraint orders_delivery_customer_address_id_fkey FOREIGN KEY (delivery_customer_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_delivery_location_evidence_id_fkey
alter table public.orders add constraint orders_delivery_location_evidence_id_fkey FOREIGN KEY (delivery_location_evidence_id) REFERENCES customer_location_evidence_v1(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_delivery_region_id_fkey
alter table public.orders add constraint orders_delivery_region_id_fkey FOREIGN KEY (delivery_region_id) REFERENCES delivery_regions_v1(id) ON DELETE SET NULL;

-- foreign_key: orders.orders_whatsapp_account_id_fkey
alter table public.orders add constraint orders_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: oscb_gtin_research_attempts_v1.oscb_gtin_research_attempts_v1_capture_id_fkey
alter table public.oscb_gtin_research_attempts_v1 add constraint oscb_gtin_research_attempts_v1_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES ean_capture_records_v1(id) ON DELETE SET NULL;

-- foreign_key: oscb_product_research_v1.oscb_product_research_v1_product_id_fkey
alter table public.oscb_product_research_v1 add constraint oscb_product_research_v1_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: oscb_product_research_v1.oscb_product_research_v1_reviewed_by_fkey
alter table public.oscb_product_research_v1 add constraint oscb_product_research_v1_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

-- foreign_key: papoai_customer_flow_events_v1.papoai_customer_flow_events_v1_conversation_id_fkey
alter table public.papoai_customer_flow_events_v1 add constraint papoai_customer_flow_events_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: papoai_customer_flow_events_v1.papoai_customer_flow_events_v1_customer_id_fkey
alter table public.papoai_customer_flow_events_v1 add constraint papoai_customer_flow_events_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: papoai_draft_events_v2.papoai_draft_events_v2_draft_id_fkey
alter table public.papoai_draft_events_v2 add constraint papoai_draft_events_v2_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES papoai_order_drafts_v2(id) ON DELETE CASCADE;

-- foreign_key: papoai_order_drafts_v2.papoai_order_drafts_v2_canonical_order_id_fkey
alter table public.papoai_order_drafts_v2 add constraint papoai_order_drafts_v2_canonical_order_id_fkey FOREIGN KEY (canonical_order_id) REFERENCES orders(id) ON DELETE RESTRICT;

-- foreign_key: papoai_order_drafts_v2.papoai_order_drafts_v2_customer_id_fkey
alter table public.papoai_order_drafts_v2 add constraint papoai_order_drafts_v2_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: product_catalog_enrichment_jobs_v1.product_catalog_enrichment_jobs_v1_product_id_fkey
alter table public.product_catalog_enrichment_jobs_v1 add constraint product_catalog_enrichment_jobs_v1_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_fiscal_evidence.product_fiscal_evidence_product_id_fkey
alter table public.product_fiscal_evidence add constraint product_fiscal_evidence_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_fiscal_profiles.product_fiscal_profiles_matched_st_rule_id_fkey
alter table public.product_fiscal_profiles add constraint product_fiscal_profiles_matched_st_rule_id_fkey FOREIGN KEY (matched_st_rule_id) REFERENCES fiscal_st_rules_mt(id) ON DELETE SET NULL;

-- foreign_key: product_fiscal_profiles.product_fiscal_profiles_product_id_fkey
alter table public.product_fiscal_profiles add constraint product_fiscal_profiles_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_fiscal_review_items.product_fiscal_review_items_product_id_fkey
alter table public.product_fiscal_review_items add constraint product_fiscal_review_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_identifiers.product_identifiers_product_id_fkey
alter table public.product_identifiers add constraint product_identifiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_inventory_lots.product_inventory_lots_product_id_fkey
alter table public.product_inventory_lots add constraint product_inventory_lots_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_lifecycle_audit.product_lifecycle_audit_product_id_fkey
alter table public.product_lifecycle_audit add constraint product_lifecycle_audit_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_purchase_history.product_purchase_history_document_id_fkey
alter table public.product_purchase_history add constraint product_purchase_history_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE CASCADE;

-- foreign_key: product_purchase_history.product_purchase_history_product_id_fkey
alter table public.product_purchase_history add constraint product_purchase_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_purchase_history.product_purchase_history_purchase_item_id_fkey
alter table public.product_purchase_history add constraint product_purchase_history_purchase_item_id_fkey FOREIGN KEY (purchase_item_id) REFERENCES purchase_xml_items(id) ON DELETE CASCADE;

-- foreign_key: product_supplier_packaging.product_supplier_packaging_product_id_fkey
alter table public.product_supplier_packaging add constraint product_supplier_packaging_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: product_taxonomy_terms.product_taxonomy_terms_parent_id_fkey
alter table public.product_taxonomy_terms add constraint product_taxonomy_terms_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES product_taxonomy_terms(id) ON DELETE RESTRICT;

-- foreign_key: products.products_last_admin_edit_by_fkey
alter table public.products add constraint products_last_admin_edit_by_fkey FOREIGN KEY (last_admin_edit_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- foreign_key: products.products_physically_verified_by_fkey
alter table public.products add constraint products_physically_verified_by_fkey FOREIGN KEY (physically_verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- foreign_key: purchase_bling_received_review_v1.purchase_bling_received_review_v1_reviewed_by_fkey
alter table public.purchase_bling_received_review_v1 add constraint purchase_bling_received_review_v1_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- foreign_key: purchase_stock_receipt_plans_v1.purchase_stock_receipt_plans_v1_document_id_fkey
alter table public.purchase_stock_receipt_plans_v1 add constraint purchase_stock_receipt_plans_v1_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE RESTRICT;

-- foreign_key: purchase_stock_receipts.purchase_stock_receipts_document_id_fkey
alter table public.purchase_stock_receipts add constraint purchase_stock_receipts_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE RESTRICT;

-- foreign_key: purchase_xml_catalog_identity_actions_v1.purchase_xml_catalog_identity_actions_v1_document_id_fkey
alter table public.purchase_xml_catalog_identity_actions_v1 add constraint purchase_xml_catalog_identity_actions_v1_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE RESTRICT;

-- foreign_key: purchase_xml_catalog_identity_actions_v1.purchase_xml_catalog_identity_actions_v1_item_id_fkey
alter table public.purchase_xml_catalog_identity_actions_v1 add constraint purchase_xml_catalog_identity_actions_v1_item_id_fkey FOREIGN KEY (item_id) REFERENCES purchase_xml_items(id) ON DELETE RESTRICT;

-- foreign_key: purchase_xml_catalog_identity_actions_v1.purchase_xml_catalog_identity_actions_v1_product_id_fkey
alter table public.purchase_xml_catalog_identity_actions_v1 add constraint purchase_xml_catalog_identity_actions_v1_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: purchase_xml_catalog_ingest_errors_v1.purchase_xml_catalog_ingest_errors_v1_document_id_fkey
alter table public.purchase_xml_catalog_ingest_errors_v1 add constraint purchase_xml_catalog_ingest_errors_v1_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE CASCADE;

-- foreign_key: purchase_xml_catalog_observations_v1.purchase_xml_catalog_observations_v1_document_id_fkey
alter table public.purchase_xml_catalog_observations_v1 add constraint purchase_xml_catalog_observations_v1_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE CASCADE;

-- foreign_key: purchase_xml_documents.purchase_xml_documents_import_run_id_fkey
alter table public.purchase_xml_documents add constraint purchase_xml_documents_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES purchase_xml_import_runs(id) ON DELETE SET NULL;

-- foreign_key: purchase_xml_item_lot_evidence.purchase_xml_item_lot_evidence_purchase_item_id_fkey
alter table public.purchase_xml_item_lot_evidence add constraint purchase_xml_item_lot_evidence_purchase_item_id_fkey FOREIGN KEY (purchase_item_id) REFERENCES purchase_xml_items(id) ON DELETE CASCADE;

-- foreign_key: purchase_xml_items.purchase_xml_items_document_id_fkey
alter table public.purchase_xml_items add constraint purchase_xml_items_document_id_fkey FOREIGN KEY (document_id) REFERENCES purchase_xml_documents(id) ON DELETE CASCADE;

-- foreign_key: purchase_xml_items.purchase_xml_items_inventory_lot_id_fkey
alter table public.purchase_xml_items add constraint purchase_xml_items_inventory_lot_id_fkey FOREIGN KEY (inventory_lot_id) REFERENCES product_inventory_lots(id) ON DELETE SET NULL;

-- foreign_key: purchase_xml_items.purchase_xml_items_product_id_fkey
alter table public.purchase_xml_items add constraint purchase_xml_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: sales_quote_bling_orders.sales_quote_bling_orders_quote_id_fkey
alter table public.sales_quote_bling_orders add constraint sales_quote_bling_orders_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE RESTRICT;

-- foreign_key: sales_quotes.sales_quotes_customer_id_fkey
alter table public.sales_quotes add constraint sales_quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: si5_product_research.si5_product_research_product_id_fkey
alter table public.si5_product_research add constraint si5_product_research_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: si5_research_requests.si5_research_requests_product_id_fkey
alter table public.si5_research_requests add constraint si5_research_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- foreign_key: simples_homologation_checks.simples_homologation_checks_period_id_fkey
alter table public.simples_homologation_checks add constraint simples_homologation_checks_period_id_fkey FOREIGN KEY (period_id) REFERENCES simples_periods(id) ON DELETE CASCADE;

-- foreign_key: simples_periods.simples_periods_rule_set_id_fkey
alter table public.simples_periods add constraint simples_periods_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES simples_rule_sets(id) ON DELETE RESTRICT;

-- foreign_key: simples_periods.simples_periods_supersedes_period_id_fkey
alter table public.simples_periods add constraint simples_periods_supersedes_period_id_fkey FOREIGN KEY (supersedes_period_id) REFERENCES simples_periods(id) ON DELETE RESTRICT;

-- foreign_key: simples_reconciliation_issues.simples_reconciliation_issues_order_id_fkey
alter table public.simples_reconciliation_issues add constraint simples_reconciliation_issues_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: simples_reconciliation_issues.simples_reconciliation_issues_period_id_fkey
alter table public.simples_reconciliation_issues add constraint simples_reconciliation_issues_period_id_fkey FOREIGN KEY (period_id) REFERENCES simples_periods(id) ON DELETE CASCADE;

-- foreign_key: simples_reconciliation_issues.simples_reconciliation_issues_product_id_fkey
alter table public.simples_reconciliation_issues add constraint simples_reconciliation_issues_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: simples_revenue_lines.simples_revenue_lines_classification_rule_id_fkey
alter table public.simples_revenue_lines add constraint simples_revenue_lines_classification_rule_id_fkey FOREIGN KEY (classification_rule_id) REFERENCES simples_tax_classification_rules(id) ON DELETE SET NULL;

-- foreign_key: simples_revenue_lines.simples_revenue_lines_order_id_fkey
alter table public.simples_revenue_lines add constraint simples_revenue_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- foreign_key: simples_revenue_lines.simples_revenue_lines_period_id_fkey
alter table public.simples_revenue_lines add constraint simples_revenue_lines_period_id_fkey FOREIGN KEY (period_id) REFERENCES simples_periods(id) ON DELETE CASCADE;

-- foreign_key: simples_revenue_lines.simples_revenue_lines_product_id_fkey
alter table public.simples_revenue_lines add constraint simples_revenue_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- foreign_key: simples_tax_classification_rules.simples_tax_classification_rules_rule_set_id_fkey
alter table public.simples_tax_classification_rules add constraint simples_tax_classification_rules_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES simples_rule_sets(id) ON DELETE RESTRICT;

-- foreign_key: simples_validation_runs.simples_validation_runs_period_id_fkey
alter table public.simples_validation_runs add constraint simples_validation_runs_period_id_fkey FOREIGN KEY (period_id) REFERENCES simples_periods(id) ON DELETE CASCADE;

-- foreign_key: site_basket_product_type_option_quantities.site_basket_product_type_option_quantities_basket_id_fkey
alter table public.site_basket_product_type_option_quantities add constraint site_basket_product_type_option_quantities_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id) ON DELETE CASCADE;

-- foreign_key: site_basket_product_type_option_quantities.site_basket_product_type_option_quantities_option_fkey
alter table public.site_basket_product_type_option_quantities add constraint site_basket_product_type_option_quantities_option_fkey FOREIGN KEY (product_type_id, product_id) REFERENCES site_basket_product_type_options(product_type_id, product_id) ON DELETE CASCADE;

-- foreign_key: site_basket_product_type_options.site_basket_product_type_options_product_id_fkey
alter table public.site_basket_product_type_options add constraint site_basket_product_type_options_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: site_basket_product_type_options.site_basket_product_type_options_product_type_id_fkey
alter table public.site_basket_product_type_options add constraint site_basket_product_type_options_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES site_basket_product_types(id) ON DELETE CASCADE;

-- foreign_key: site_basket_product_type_quantities.site_basket_product_type_quantities_basket_id_fkey
alter table public.site_basket_product_type_quantities add constraint site_basket_product_type_quantities_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id) ON DELETE CASCADE;

-- foreign_key: site_basket_product_type_quantities.site_basket_product_type_quantities_product_type_id_fkey
alter table public.site_basket_product_type_quantities add constraint site_basket_product_type_quantities_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES site_basket_product_types(id) ON DELETE CASCADE;

-- foreign_key: storefront_identity_tokens.storefront_identity_tokens_conversation_id_fkey
alter table public.storefront_identity_tokens add constraint storefront_identity_tokens_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: storefront_identity_tokens.storefront_identity_tokens_customer_id_fkey
alter table public.storefront_identity_tokens add constraint storefront_identity_tokens_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: vitrine_stock_reservation_lots.vitrine_stock_reservation_lots_lot_id_fkey
alter table public.vitrine_stock_reservation_lots add constraint vitrine_stock_reservation_lots_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES product_inventory_lots(id) ON DELETE RESTRICT;

-- foreign_key: vitrine_stock_reservation_lots.vitrine_stock_reservation_lots_product_id_fkey
alter table public.vitrine_stock_reservation_lots add constraint vitrine_stock_reservation_lots_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- foreign_key: vitrine_stock_reservation_lots.vitrine_stock_reservation_lots_reservation_id_fkey
alter table public.vitrine_stock_reservation_lots add constraint vitrine_stock_reservation_lots_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES vitrine_stock_reservations(id) ON DELETE CASCADE;

-- foreign_key: vitrine_stock_reservations.vitrine_stock_reservations_order_id_fkey
alter table public.vitrine_stock_reservations add constraint vitrine_stock_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: vitrine_stock_reservations.vitrine_stock_reservations_product_id_fkey
alter table public.vitrine_stock_reservations add constraint vitrine_stock_reservations_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- foreign_key: whatsapp_1018_interactive_canary_v1.whatsapp_1018_interactive_canary_v1_conversation_id_fkey
alter table public.whatsapp_1018_interactive_canary_v1 add constraint whatsapp_1018_interactive_canary_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- foreign_key: whatsapp_1018_interactive_canary_v1.whatsapp_1018_interactive_canary_v1_sender_account_id_fkey
alter table public.whatsapp_1018_interactive_canary_v1 add constraint whatsapp_1018_interactive_canary_v1_sender_account_id_fkey FOREIGN KEY (sender_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: whatsapp_ana_jobs_v1.whatsapp_ana_jobs_v1_conversation_id_fkey
alter table public.whatsapp_ana_jobs_v1 add constraint whatsapp_ana_jobs_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_ana_jobs_v1.whatsapp_ana_jobs_v1_inbound_message_id_fkey
alter table public.whatsapp_ana_jobs_v1 add constraint whatsapp_ana_jobs_v1_inbound_message_id_fkey FOREIGN KEY (inbound_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_ana_jobs_v1.whatsapp_ana_jobs_v1_whatsapp_account_id_fkey
alter table public.whatsapp_ana_jobs_v1 add constraint whatsapp_ana_jobs_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_ana_reviews_v1.whatsapp_ana_reviews_v1_conversation_id_fkey
alter table public.whatsapp_ana_reviews_v1 add constraint whatsapp_ana_reviews_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_ana_reviews_v1.whatsapp_ana_reviews_v1_job_id_fkey
alter table public.whatsapp_ana_reviews_v1 add constraint whatsapp_ana_reviews_v1_job_id_fkey FOREIGN KEY (job_id) REFERENCES whatsapp_ana_jobs_v1(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_channel_runtime_v1.whatsapp_channel_runtime_v1_whatsapp_account_id_fkey
alter table public.whatsapp_channel_runtime_v1 add constraint whatsapp_channel_runtime_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_conversation_favorites_v1.whatsapp_conversation_favorites_v1_admin_user_id_fkey
alter table public.whatsapp_conversation_favorites_v1 add constraint whatsapp_conversation_favorites_v1_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES admin_users(user_id) ON DELETE CASCADE;

-- foreign_key: whatsapp_conversation_favorites_v1.whatsapp_conversation_favorites_v1_conversation_id_fkey
alter table public.whatsapp_conversation_favorites_v1 add constraint whatsapp_conversation_favorites_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_conversation_order_overrides_v1.whatsapp_conversation_order_overrides_v1_admin_user_id_fkey
alter table public.whatsapp_conversation_order_overrides_v1 add constraint whatsapp_conversation_order_overrides_v1_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES admin_users(user_id) ON DELETE CASCADE;

-- foreign_key: whatsapp_conversation_order_overrides_v1.whatsapp_conversation_order_overrides_v1_conversation_id_fkey
alter table public.whatsapp_conversation_order_overrides_v1 add constraint whatsapp_conversation_order_overrides_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_media_v1.whatsapp_media_v1_message_id_fkey
alter table public.whatsapp_media_v1 add constraint whatsapp_media_v1_message_id_fkey FOREIGN KEY (message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_message_status_events_v1.whatsapp_message_status_events_v1_message_id_fkey
alter table public.whatsapp_message_status_events_v1 add constraint whatsapp_message_status_events_v1_message_id_fkey FOREIGN KEY (message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_messages_v1.whatsapp_messages_v1_conversation_id_fkey
alter table public.whatsapp_messages_v1 add constraint whatsapp_messages_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_messages_v1.whatsapp_messages_v1_customer_id_fkey
alter table public.whatsapp_messages_v1 add constraint whatsapp_messages_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_messages_v1.whatsapp_messages_v1_reply_to_message_id_fkey
alter table public.whatsapp_messages_v1 add constraint whatsapp_messages_v1_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_messages_v1.whatsapp_messages_v1_whatsapp_account_id_fkey
alter table public.whatsapp_messages_v1 add constraint whatsapp_messages_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_outbox_v1.whatsapp_outbox_v1_conversation_id_fkey
alter table public.whatsapp_outbox_v1 add constraint whatsapp_outbox_v1_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_outbox_v1.whatsapp_outbox_v1_customer_id_fkey
alter table public.whatsapp_outbox_v1 add constraint whatsapp_outbox_v1_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_outbox_v1.whatsapp_outbox_v1_message_id_fkey
alter table public.whatsapp_outbox_v1 add constraint whatsapp_outbox_v1_message_id_fkey FOREIGN KEY (message_id) REFERENCES whatsapp_messages_v1(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_outbox_v1.whatsapp_outbox_v1_template_id_fkey
alter table public.whatsapp_outbox_v1 add constraint whatsapp_outbox_v1_template_id_fkey FOREIGN KEY (template_id) REFERENCES whatsapp_templates_v1(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_outbox_v1.whatsapp_outbox_v1_whatsapp_account_id_fkey
alter table public.whatsapp_outbox_v1 add constraint whatsapp_outbox_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_template_events_v1.whatsapp_template_events_v1_whatsapp_account_id_fkey
alter table public.whatsapp_template_events_v1 add constraint whatsapp_template_events_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;

-- foreign_key: whatsapp_templates_v1.whatsapp_templates_v1_whatsapp_account_id_fkey
alter table public.whatsapp_templates_v1 add constraint whatsapp_templates_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_webhook_events_v1.whatsapp_webhook_events_v1_whatsapp_account_id_fkey
alter table public.whatsapp_webhook_events_v1 add constraint whatsapp_webhook_events_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;
