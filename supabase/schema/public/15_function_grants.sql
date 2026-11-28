-- function_grant: activate_purchase_xml_inventory_lots_v1(p_document_id uuid, p_user_id uuid)
-- acl public.activate_purchase_xml_inventory_lots_v1(p_document_id uuid, p_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_basket_configuration_product_type_save_v1(p_product_type jsonb)
-- acl public.admin_basket_configuration_product_type_save_v1(p_product_type jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_configuration_quantities_save_v1(p_quantities jsonb)
-- acl public.admin_basket_configuration_quantities_save_v1(p_quantities jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_configuration_types_save_v1(p_types jsonb)
-- acl public.admin_basket_configuration_types_save_v1(p_types jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_configuration_v1()
-- acl public.admin_basket_configuration_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_extra_themes_editor_v1()
-- acl public.admin_basket_extra_themes_editor_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_flow_configuration_save_v1(p_config jsonb)
-- acl public.admin_basket_flow_configuration_save_v1(p_config jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_flow_configuration_v1()
-- acl public.admin_basket_flow_configuration_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_mold_editor_v1(p_basket_id uuid)
-- acl public.admin_basket_mold_editor_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_mold_list_v1()
-- acl public.admin_basket_mold_list_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_mold_optional_items_editor_v1(p_basket_id uuid)
-- acl public.admin_basket_mold_optional_items_editor_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_mold_products_v1(p_query text, p_limit integer)
-- acl public.admin_basket_mold_products_v1(p_query text, p_limit integer): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_basket_mold_shared_items_v1()
-- acl public.admin_basket_mold_shared_items_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_extra_themes_v1(p_themes jsonb)
-- acl public.admin_save_basket_extra_themes_v1(p_themes jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_mold_optional_items_v1(p_basket_id uuid, p_items jsonb)
-- acl public.admin_save_basket_mold_optional_items_v1(p_basket_id uuid, p_items jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_mold_shared_items_v1(p_items jsonb)
-- acl public.admin_save_basket_mold_shared_items_v1(p_items jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_mold_v1(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_operator text)
-- acl public.admin_save_basket_mold_v1(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_operator text): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_mold_v1(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_operator text, p_subcategory_id uuid)
-- acl public.admin_save_basket_mold_v1(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_operator text, p_subcategory_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_mold_v1(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text)
-- acl public.admin_save_basket_mold_v1(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_save_basket_mold_v2(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_operator text, p_subcategory_id uuid)
-- acl public.admin_save_basket_mold_v2(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_operator text, p_subcategory_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_save_basket_mold_v3(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_subcategory_id uuid, p_conditional_hidden_enabled boolean, p_conditional_hidden_product_id uuid, p_conditional_hidden_adjustment numeric, p_operator text)
-- acl public.admin_save_basket_mold_v3(p_basket_id uuid, p_name text, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_category_id uuid, p_subcategory_id uuid, p_conditional_hidden_enabled boolean, p_conditional_hidden_product_id uuid, p_conditional_hidden_adjustment numeric, p_operator text): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_upsert_basket_mold_shared_item_v2(p_item jsonb)
-- acl public.admin_upsert_basket_mold_shared_item_v2(p_item jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: admin_whatsapp_flow_binding_disable_v1(p_account_id uuid, p_binding_id uuid)
-- acl public.admin_whatsapp_flow_binding_disable_v1(p_account_id uuid, p_binding_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_whatsapp_flow_binding_enable_v1(p_account_id uuid, p_binding_id uuid)
-- acl public.admin_whatsapp_flow_binding_enable_v1(p_account_id uuid, p_binding_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_whatsapp_flow_binding_upsert_v1(p_account_id uuid, p_actor_id uuid, p_meta_flow_id text, p_flow_json_version text, p_data_api_version text, p_flow_message_version text, p_flow_status text, p_flow_cta text, p_body_text text)
-- acl public.admin_whatsapp_flow_binding_upsert_v1(p_account_id uuid, p_actor_id uuid, p_meta_flow_id text, p_flow_json_version text, p_data_api_version text, p_flow_message_version text, p_flow_status text, p_flow_cta text, p_body_text text): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_whatsapp_flow_key_candidate_resolve_v1(p_account_id uuid)
-- acl public.admin_whatsapp_flow_key_candidate_resolve_v1(p_account_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_whatsapp_flow_key_mark_ready_v1(p_account_id uuid, p_private_key_sha256 text, p_meta_public_key_fingerprint text)
-- acl public.admin_whatsapp_flow_key_mark_ready_v1(p_account_id uuid, p_private_key_sha256 text, p_meta_public_key_fingerprint text): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_whatsapp_flow_key_store_v1(p_account_id uuid, p_private_key_pkcs8 text, p_private_key_sha256 text)
-- acl public.admin_whatsapp_flow_key_store_v1(p_account_id uuid, p_private_key_pkcs8 text, p_private_key_sha256 text): postgres=X/postgres service_role=X/postgres

-- function_grant: admin_whatsapp_flow_setup_snapshot_v1(p_account_id uuid)
-- acl public.admin_whatsapp_flow_setup_snapshot_v1(p_account_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: apply_basket_cart_selection_v2(p_cart_id uuid, p_basket_id uuid, p_selection jsonb)
-- acl public.apply_basket_cart_selection_v2(p_cart_id uuid, p_basket_id uuid, p_selection jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: apply_bling_stock_mirror_event_v2(p_product_id uuid, p_bling_product_id bigint, p_physical_total numeric, p_virtual_total numeric, p_deposit_balances jsonb, p_observed_at timestamp with time zone, p_source_event_id text, p_source_resource text, p_replace_deposits boolean)
-- acl public.apply_bling_stock_mirror_event_v2(p_product_id uuid, p_bling_product_id bigint, p_physical_total numeric, p_virtual_total numeric, p_deposit_balances jsonb, p_observed_at timestamp with time zone, p_source_event_id text, p_source_resource text, p_replace_deposits boolean): postgres=X/postgres service_role=X/postgres

-- function_grant: apply_product_fiscal_strict_validation_v1()
-- acl public.apply_product_fiscal_strict_validation_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: apply_purchase_stock_receipt_v1(p_document_id uuid, p_user_id uuid)
-- acl public.apply_purchase_stock_receipt_v1(p_document_id uuid, p_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_auto_norm_text_v1(p_value text)
-- acl public.basket_auto_norm_text_v1(p_value text): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_component_fresh_sellable_stock_v1(p_product_id uuid)
-- acl public.basket_component_fresh_sellable_stock_v1(p_product_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_mold_cutover_ready_v1(p_basket_id uuid)
-- acl public.basket_mold_cutover_ready_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_mold_editor_v1(p_basket_id uuid)
-- acl public.basket_mold_editor_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_mold_manual_replacement_review_v1(p_basket_ids uuid[])
-- acl public.basket_mold_manual_replacement_review_v1(p_basket_ids uuid[]): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_mold_public_compositions_batch_v1(p_basket_ids uuid[])
-- acl public.basket_mold_public_compositions_batch_v1(p_basket_ids uuid[]): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_mold_public_compositions_v1(p_basket_id uuid)
-- acl public.basket_mold_public_compositions_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_mold_public_compositions_v2(p_basket_id uuid)
-- acl public.basket_mold_public_compositions_v2(p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_package_compatible_v1(p_original_packaging text, p_original_name text, p_candidate_packaging text, p_candidate_name text)
-- acl public.basket_package_compatible_v1(p_original_packaging text, p_original_name text, p_candidate_packaging text, p_candidate_name text): postgres=X/postgres service_role=X/postgres

-- function_grant: basket_substitution_family_v1(p_name text, p_subcategory text)
-- acl public.basket_substitution_family_v1(p_name text, p_subcategory text): postgres=X/postgres service_role=X/postgres

-- function_grant: bind_bling_contact_id(p_customer_id uuid, p_bling_contact_id bigint)
-- acl public.bind_bling_contact_id(p_customer_id uuid, p_bling_contact_id bigint): postgres=X/postgres service_role=X/postgres

-- function_grant: bind_bling_product_id(p_product_id uuid, p_bling_product_id bigint)
-- acl public.bind_bling_product_id(p_product_id uuid, p_bling_product_id bigint): postgres=X/postgres service_role=X/postgres

-- function_grant: bind_bling_product_id_v1(p_product_id uuid, p_bling_product_id bigint, p_source text, p_external_key text)
-- acl public.bind_bling_product_id_v1(p_product_id uuid, p_bling_product_id bigint, p_source text, p_external_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: bling_hub_customer_creation_guard_v1()
-- acl public.bling_hub_customer_creation_guard_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: bling_hub_readiness_v2()
-- acl public.bling_hub_readiness_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: build_bling_order_draft(p_order_id uuid)
-- acl public.build_bling_order_draft(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: calculate_basket_hidden_adjustment_v1(p_basket_id uuid)
-- acl public.calculate_basket_hidden_adjustment_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: canonical_whatsapp_e164_br_v2(p_phone text)
-- acl public.canonical_whatsapp_e164_br_v2(p_phone text): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: capineca_b2b_consume_rate_limit(p_ip_hash text, p_limit integer)
-- acl public.capineca_b2b_consume_rate_limit(p_ip_hash text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: capture_inventory_unknown_ean_v1(p_ean text, p_operator_label text, p_source text, p_observed_quantity numeric, p_observed_gondola_number integer)
-- acl public.capture_inventory_unknown_ean_v1(p_ean text, p_operator_label text, p_source text, p_observed_quantity numeric, p_observed_gondola_number integer): postgres=X/postgres service_role=X/postgres

-- function_grant: capture_whatsapp_location_evidence_v1()
-- acl public.capture_whatsapp_location_evidence_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: check_order_dispatch_fiscal_gate_v1(p_order_id uuid)
-- acl public.check_order_dispatch_fiscal_gate_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: claim_bling_hub_jobs_v2(p_worker text, p_domains text[], p_limit integer, p_lease_seconds integer)
-- acl public.claim_bling_hub_jobs_v2(p_worker text, p_domains text[], p_limit integer, p_lease_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: claim_bling_hub_oauth_lock_v2(p_owner uuid, p_ttl_seconds integer)
-- acl public.claim_bling_hub_oauth_lock_v2(p_owner uuid, p_ttl_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: claim_bling_official_ncm_catalog_refresh_v1(p_lease_seconds integer)
-- acl public.claim_bling_official_ncm_catalog_refresh_v1(p_lease_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: claim_bling_order_stock_action_v2(p_source_order_id uuid, p_bling_order_id bigint, p_deposit_id bigint, p_action text, p_snapshot jsonb)
-- acl public.claim_bling_order_stock_action_v2(p_source_order_id uuid, p_bling_order_id bigint, p_deposit_id bigint, p_action text, p_snapshot jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: claim_bling_webhook_inbox_v2(p_worker text, p_limit integer, p_lease_seconds integer)
-- acl public.claim_bling_webhook_inbox_v2(p_worker text, p_limit integer, p_lease_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: claim_product_catalog_enrichment_jobs_v1(p_limit integer)
-- acl public.claim_product_catalog_enrichment_jobs_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: confirm_cart_order(p_cart_id uuid, p_delivery_address jsonb)
-- acl public.confirm_cart_order(p_cart_id uuid, p_delivery_address jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: confirm_cart_order_v2(p_cart_id uuid, p_delivery_address jsonb, p_idempotency_key text)
-- acl public.confirm_cart_order_v2(p_cart_id uuid, p_delivery_address jsonb, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: confirm_order_payment_v1(p_order_id uuid, p_payment_method text, p_payment_source text, p_settled_amount numeric, p_confirmed_at timestamp with time zone)
-- acl public.confirm_order_payment_v1(p_order_id uuid, p_payment_method text, p_payment_source text, p_settled_amount numeric, p_confirmed_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: consume_caneca_studio_public_limit_v1(p_client_ip_hash text, p_limit integer)
-- acl public.consume_caneca_studio_public_limit_v1(p_client_ip_hash text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: consume_public_rate_limit(p_rate_key text, p_bucket text, p_limit integer, p_window_seconds integer)
-- acl public.consume_public_rate_limit(p_rate_key text, p_bucket text, p_limit integer, p_window_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: consume_vitrine_order_stock_v1(p_order_id uuid)
-- acl public.consume_vitrine_order_stock_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: cosmos_gtin_valid(p_gtin text)
-- acl public.cosmos_gtin_valid(p_gtin text): postgres=X/postgres service_role=X/postgres

-- function_grant: cosmos_research_reserve_next()
-- acl public.cosmos_research_reserve_next(): postgres=X/postgres service_role=X/postgres

-- function_grant: create_admin_saved_card_v1(p_name text, p_brand text, p_initial_value numeric, p_credit_added_on date, p_card_password text, p_idempotency_key uuid)
-- acl public.create_admin_saved_card_v1(p_name text, p_brand text, p_initial_value numeric, p_credit_added_on date, p_card_password text, p_idempotency_key uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: create_canonical_cart_order_v2(p_source text, p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb)
-- acl public.create_canonical_cart_order_v2(p_source text, p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: create_storefront_order_v2(p_phone text, p_items jsonb, p_basket jsonb)
-- acl public.create_storefront_order_v2(p_phone text, p_items jsonb, p_basket jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: create_vitrine_cart_order_v3(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb)
-- acl public.create_vitrine_cart_order_v3(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: create_vitrine_cart_order_v3_base(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb)
-- acl public.create_vitrine_cart_order_v3_base(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: customer_ids_by_phone_variants_v1(p_phone text)
-- acl public.customer_ids_by_phone_variants_v1(p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: customer_person_first_name_v1(p_name text, p_cpf_cnpj text)
-- acl public.customer_person_first_name_v1(p_name text, p_cpf_cnpj text): postgres=X/postgres service_role=X/postgres

-- function_grant: customer_phone_primary_guard()
-- acl public.customer_phone_primary_guard(): postgres=X/postgres service_role=X/postgres

-- function_grant: customers_link_unclaimed_orders_v2()
-- acl public.customers_link_unclaimed_orders_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: da6_worker_dispatch_tick_v1()
-- acl public.da6_worker_dispatch_tick_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: da6_worker_key_v1()
-- acl public.da6_worker_key_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: da_instagram_automation_cron_authorized_v1(p_token text)
-- acl public.da_instagram_automation_cron_authorized_v1(p_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: da_instagram_materialize_due_v1(p_now timestamp with time zone)
-- acl public.da_instagram_materialize_due_v1(p_now timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_rotation_admin_v1(p_action text, p_payload jsonb)
-- acl public.da_offer_rotation_admin_v1(p_action text, p_payload jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_status_images_cron_authorized_v1(p_token text)
-- acl public.da_offer_status_images_cron_authorized_v1(p_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_begin_publish_v1(p_offer_date date, p_image_number integer)
-- acl public.da_offer_story_begin_publish_v1(p_offer_date date, p_image_number integer): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_claim_v1(p_offer_date date, p_image_number integer, p_source_path text)
-- acl public.da_offer_story_claim_v1(p_offer_date date, p_image_number integer, p_source_path text): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_container_created_v1(p_offer_date date, p_image_number integer, p_creation_id text)
-- acl public.da_offer_story_container_created_v1(p_offer_date date, p_image_number integer, p_creation_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_instagram_token_v1()
-- acl public.da_offer_story_instagram_token_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_mark_failed_v1(p_offer_date date, p_image_number integer, p_error text)
-- acl public.da_offer_story_mark_failed_v1(p_offer_date date, p_image_number integer, p_error text): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_mark_published_v1(p_offer_date date, p_image_number integer, p_story_id text)
-- acl public.da_offer_story_mark_published_v1(p_offer_date date, p_image_number integer, p_story_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: da_offer_story_mark_review_v1(p_offer_date date, p_image_number integer, p_error text)
-- acl public.da_offer_story_mark_review_v1(p_offer_date date, p_image_number integer, p_error text): postgres=X/postgres service_role=X/postgres

-- function_grant: delete_admin_saved_card_v1(p_card_id uuid)
-- acl public.delete_admin_saved_card_v1(p_card_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: dispatch_bling_hub_cycle_v2()
-- acl public.dispatch_bling_hub_cycle_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: dispatch_fiscal_bling_nfe_backfill_v1(p_steps integer)
-- acl public.dispatch_fiscal_bling_nfe_backfill_v1(p_steps integer): postgres=X/postgres service_role=X/postgres

-- function_grant: dispatch_fiscal_nfe_autorecovery_v1()
-- acl public.dispatch_fiscal_nfe_autorecovery_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: dispatch_purchase_xml_daily_v1()
-- acl public.dispatch_purchase_xml_daily_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ean_capture_resolve_v1(p_capture_id uuid, p_mode text, p_product_id uuid, p_name text, p_ncm text)
-- acl public.ean_capture_resolve_v1(p_capture_id uuid, p_mode text, p_product_id uuid, p_name text, p_ncm text): postgres=X/postgres service_role=X/postgres

-- function_grant: ean_capture_resolve_v2(p_capture_id uuid, p_mode text, p_product_id uuid, p_name text, p_ncm text, p_attributes jsonb)
-- acl public.ean_capture_resolve_v2(p_capture_id uuid, p_mode text, p_product_id uuid, p_name text, p_ncm text, p_attributes jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ean_capture_stats_v1()
-- acl public.ean_capture_stats_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ean_capture_sync_one_v1(p_capture_id uuid)
-- acl public.ean_capture_sync_one_v1(p_capture_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ean_capture_sync_v1()
-- acl public.ean_capture_sync_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: enforce_basket_mold_position_option_limit_v1()
-- acl public.enforce_basket_mold_position_option_limit_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: enforce_order_dispatch_fiscal_gate_trigger_v1()
-- acl public.enforce_order_dispatch_fiscal_gate_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: enforce_storefront_checkout_basics_v1()
-- acl public.enforce_storefront_checkout_basics_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: enforce_zero_stock_inactive()
-- acl public.enforce_zero_stock_inactive(): postgres=X/postgres service_role=X/postgres

-- function_grant: enqueue_bling_hub_job_v2(p_domain text, p_operation text, p_source_system text, p_source_id text, p_idempotency_key text, p_payload jsonb, p_payload_version integer)
-- acl public.enqueue_bling_hub_job_v2(p_domain text, p_operation text, p_source_system text, p_source_id text, p_idempotency_key text, p_payload jsonb, p_payload_version integer): postgres=X/postgres service_role=X/postgres

-- function_grant: enqueue_bling_hub_product_outbox_v1()
-- acl public.enqueue_bling_hub_product_outbox_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: enqueue_bling_hub_stock_outbox_v1()
-- acl public.enqueue_bling_hub_stock_outbox_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: enqueue_bling_stock_after_product_link_v1()
-- acl public.enqueue_bling_stock_after_product_link_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: enqueue_new_xml_product_catalog_enrichment_v1()
-- acl public.enqueue_new_xml_product_catalog_enrichment_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ensure_storefront_customer_v2(p_phone text, p_name text, p_source_key text)
-- acl public.ensure_storefront_customer_v2(p_phone text, p_name text, p_source_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: finish_bling_hub_job_v2(p_job_id uuid, p_status text, p_result jsonb, p_error_code text, p_error_message text, p_http_status integer, p_retry_seconds integer, p_provider_id text)
-- acl public.finish_bling_hub_job_v2(p_job_id uuid, p_status text, p_result jsonb, p_error_code text, p_error_message text, p_http_status integer, p_retry_seconds integer, p_provider_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: finish_bling_order_stock_action_v2(p_source_order_id uuid, p_action text, p_success boolean, p_snapshot jsonb, p_error text, p_metadata jsonb)
-- acl public.finish_bling_order_stock_action_v2(p_source_order_id uuid, p_action text, p_success boolean, p_snapshot jsonb, p_error text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: finish_bling_webhook_inbox_v2(p_event_id text, p_status text, p_result jsonb, p_error text, p_retry_seconds integer, p_self_generated boolean)
-- acl public.finish_bling_webhook_inbox_v2(p_event_id text, p_status text, p_result jsonb, p_error text, p_retry_seconds integer, p_self_generated boolean): postgres=X/postgres service_role=X/postgres

-- function_grant: fiscal_normalize_text_v1(p_text text)
-- acl public.fiscal_normalize_text_v1(p_text text): postgres=X/postgres service_role=X/postgres

-- function_grant: fiscal_rule_description_matches_v1(p_description text, p_qualifiers jsonb)
-- acl public.fiscal_rule_description_matches_v1(p_description text, p_qualifiers jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: fiscal_valid_gtin_v1(p_gtin text)
-- acl public.fiscal_valid_gtin_v1(p_gtin text): postgres=X/postgres service_role=X/postgres

-- function_grant: force_supabase_stock_authority_v1()
-- acl public.force_supabase_stock_authority_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: format_phone_br_v1(p_phone text)
-- acl public.format_phone_br_v1(p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: get_bling_api_credentials_v1()
-- acl public.get_bling_api_credentials_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_bling_hub_key_v2()
-- acl public.get_bling_hub_key_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_bling_stock_mirror_status_v2()
-- acl public.get_bling_stock_mirror_status_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_cart_aware_recommendations(p_conversation_id uuid, p_limit integer, p_kind text)
-- acl public.get_cart_aware_recommendations(p_conversation_id uuid, p_limit integer, p_kind text): postgres=X/postgres service_role=X/postgres

-- function_grant: get_conversation_worker_provider_secret_v1()
-- acl public.get_conversation_worker_provider_secret_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_fiscal_dispatch_health_v1()
-- acl public.get_ops2_fiscal_dispatch_health_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_order_shadow_readiness_v1()
-- acl public.get_ops2_order_shadow_readiness_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_papoai_bridge_health_v1()
-- acl public.get_ops2_papoai_bridge_health_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_purchase_xml_health_v1()
-- acl public.get_ops2_purchase_xml_health_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_sellable_stock_status_v1()
-- acl public.get_ops2_sellable_stock_status_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_sellable_stock_v1(p_product_id uuid)
-- acl public.get_ops2_sellable_stock_v1(p_product_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops2_stock_cutover_preflight_v1()
-- acl public.get_ops2_stock_cutover_preflight_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_control_tower_summary_v1()
-- acl public.get_ops_control_tower_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_delivery_returns_summary_v1(p_limit integer)
-- acl public.get_ops_delivery_returns_summary_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_delivery_runs_today_v1()
-- acl public.get_ops_delivery_runs_today_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_delivery_runs_today_v2()
-- acl public.get_ops_delivery_runs_today_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_inventory_incidents_v1(p_limit integer)
-- acl public.get_ops_inventory_incidents_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_print_queue_v1(p_limit integer)
-- acl public.get_ops_print_queue_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: get_ops_stock_recount_queue_v1()
-- acl public.get_ops_stock_recount_queue_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_papoai_webhook_capture_status_v2()
-- acl public.get_papoai_webhook_capture_status_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_papoai_webhook_health_v3()
-- acl public.get_papoai_webhook_health_v3(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_product_catalog_enrichment_openai_key_v1()
-- acl public.get_product_catalog_enrichment_openai_key_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_product_fiscal_bling_diff_summary_v1()
-- acl public.get_product_fiscal_bling_diff_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_product_fiscal_bling_sync_summary_v1()
-- acl public.get_product_fiscal_bling_sync_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_product_fiscal_catalog_scan_summary_v1()
-- acl public.get_product_fiscal_catalog_scan_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_purchase_history_integrity_v1()
-- acl public.get_purchase_history_integrity_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: get_purchase_xml_receipt_preflight_v1(p_document_id uuid)
-- acl public.get_purchase_xml_receipt_preflight_v1(p_document_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: get_simples_period_gate_v1(p_period_id uuid)
-- acl public.get_simples_period_gate_v1(p_period_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: get_whatsapp_checkout_contact_v1(p_conversation_id uuid)
-- acl public.get_whatsapp_checkout_contact_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: get_whatsapp_sellable_product_v1(p_product_id uuid)
-- acl public.get_whatsapp_sellable_product_v1(p_product_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: get_whatsapp_simple_baskets_v1()
-- acl public.get_whatsapp_simple_baskets_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: guard_simples_locked_snapshot_v1()
-- acl public.guard_simples_locked_snapshot_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: guard_web_existing_customer_binding_v1()
-- acl public.guard_web_existing_customer_binding_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: handle_basket_product_unavailable_v1(p_product_id uuid)
-- acl public.handle_basket_product_unavailable_v1(p_product_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: install_bling_api_credentials_v1(p_client_id text, p_client_secret text, p_refresh_token text)
-- acl public.install_bling_api_credentials_v1(p_client_id text, p_client_secret text, p_refresh_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: inventory_label_claim_next()
-- acl public.inventory_label_claim_next(): postgres=X/postgres service_role=X/postgres

-- function_grant: inventory_label_fail_photo(p_photo_id uuid, p_claim_token uuid, p_error_code text, p_error_detail text)
-- acl public.inventory_label_fail_photo(p_photo_id uuid, p_claim_token uuid, p_error_code text, p_error_detail text): postgres=X/postgres service_role=X/postgres

-- function_grant: inventory_label_finish_photo(p_photo_id uuid, p_claim_token uuid, p_product_id uuid, p_label_serial text, p_readings jsonb, p_errors jsonb)
-- acl public.inventory_label_finish_photo(p_photo_id uuid, p_claim_token uuid, p_product_id uuid, p_label_serial text, p_readings jsonb, p_errors jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: is_customer_purchase_valid_v1(p_status text, p_cancelled_at timestamp with time zone, p_returned_at timestamp with time zone)
-- acl public.is_customer_purchase_valid_v1(p_status text, p_cancelled_at timestamp with time zone, p_returned_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: link_unclaimed_orders_to_customer_v2(p_customer_id uuid)
-- acl public.link_unclaimed_orders_to_customer_v2(p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: lookup_customer_by_phone(p_phone text)
-- acl public.lookup_customer_by_phone(p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: manual_pick_queue_action_v1(p_action text, p_order_id uuid)
-- acl public.manual_pick_queue_action_v1(p_action text, p_order_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: manual_pick_queue_feed_v1()
-- acl public.manual_pick_queue_feed_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: mark_new_xml_product_for_catalog_enrichment_v1()
-- acl public.mark_new_xml_product_for_catalog_enrichment_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: mark_order_dispatch_fiscal_authorized_v1(p_order_id uuid, p_source text, p_bling_invoice_id bigint, p_bling_invoice_number text, p_sefaz_status text, p_authorized_at timestamp with time zone)
-- acl public.mark_order_dispatch_fiscal_authorized_v1(p_order_id uuid, p_source text, p_bling_invoice_id bigint, p_bling_invoice_number text, p_sefaz_status text, p_authorized_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_accept_meta_dispatch_v1(p_dispatch_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone)
-- acl public.marketing_accept_meta_dispatch_v1(p_dispatch_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_acquire_manual_campaign_batch_v1(p_batch_id uuid)
-- acl public.marketing_acquire_manual_campaign_batch_v1(p_batch_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_attribute_order_trigger_v1()
-- acl public.marketing_attribute_order_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_attribute_order_v1(p_order_id uuid, p_token text)
-- acl public.marketing_attribute_order_v1(p_order_id uuid, p_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_audience_candidates_v2(p_filters jsonb)
-- acl public.marketing_audience_candidates_v2(p_filters jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_begin_manual_campaign_batch_v1(p_campaign_id uuid, p_expected_revision integer, p_idempotency_key text, p_limit integer)
-- acl public.marketing_begin_manual_campaign_batch_v1(p_campaign_id uuid, p_expected_revision integer, p_idempotency_key text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_append_only_guard_v1()
-- acl public.marketing_campaign_append_only_guard_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_detail_v1(p_campaign_id uuid)
-- acl public.marketing_campaign_detail_v1(p_campaign_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_dispatch_identity_guard_v1()
-- acl public.marketing_campaign_dispatch_identity_guard_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_execution_gate_v1(p_whatsapp_account_id uuid)
-- acl public.marketing_campaign_execution_gate_v1(p_whatsapp_account_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_execution_status_v1(p_campaign_id uuid)
-- acl public.marketing_campaign_execution_status_v1(p_campaign_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_template_snapshot_v1(p_whatsapp_account_id uuid, p_template_id uuid)
-- acl public.marketing_campaign_template_snapshot_v1(p_whatsapp_account_id uuid, p_template_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_campaign_worker_internal_key_v1()
-- acl public.marketing_campaign_worker_internal_key_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_cancel_campaign_execution_v1(p_campaign_id uuid, p_reason text)
-- acl public.marketing_cancel_campaign_execution_v1(p_campaign_id uuid, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_capture_direct_customer_consent_change_v1()
-- acl public.marketing_capture_direct_customer_consent_change_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_capture_optout_v1()
-- acl public.marketing_capture_optout_v1(): postgres=X/postgres

-- function_grant: marketing_capture_weekly_consent_message_v1()
-- acl public.marketing_capture_weekly_consent_message_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_claim_dispatch_batch_v1(p_whatsapp_account_id uuid, p_limit integer)
-- acl public.marketing_claim_dispatch_batch_v1(p_whatsapp_account_id uuid, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_consent_events_append_only_guard_v1()
-- acl public.marketing_consent_events_append_only_guard_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_create_campaign_snapshot_v1(p_campaign_id uuid, p_expected_revision integer, p_idempotency_key text)
-- acl public.marketing_create_campaign_snapshot_v1(p_campaign_id uuid, p_expected_revision integer, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_create_campaign_v1(p_name text, p_whatsapp_account_id uuid, p_template_id uuid, p_filters jsonb, p_variable_values jsonb, p_deep_link jsonb, p_idempotency_key text)
-- acl public.marketing_create_campaign_v1(p_name text, p_whatsapp_account_id uuid, p_template_id uuid, p_filters jsonb, p_variable_values jsonb, p_deep_link jsonb, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_finish_dispatch_v1(p_dispatch_id uuid, p_status text, p_provider_message_id text, p_last_error text, p_retry_after_seconds integer)
-- acl public.marketing_finish_dispatch_v1(p_dispatch_id uuid, p_status text, p_provider_message_id text, p_last_error text, p_retry_after_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_finish_manual_campaign_batch_v1(p_batch_id uuid)
-- acl public.marketing_finish_manual_campaign_batch_v1(p_batch_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_has_verified_campaign_consent_v1(p_customer_id uuid)
-- acl public.marketing_has_verified_campaign_consent_v1(p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_issue_tracking_links_v1(p_dispatch_id uuid)
-- acl public.marketing_issue_tracking_links_v1(p_dispatch_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_materialize_dispatches_v1(p_campaign_id uuid)
-- acl public.marketing_materialize_dispatches_v1(p_campaign_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_pause_campaign_v1(p_campaign_id uuid, p_reason text)
-- acl public.marketing_pause_campaign_v1(p_campaign_id uuid, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_preview_audience_v1(p_filters jsonb, p_limit integer, p_offset integer)
-- acl public.marketing_preview_audience_v1(p_filters jsonb, p_limit integer, p_offset integer): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_record_consent_v1(p_customer_id uuid, p_decision text, p_source text, p_source_ref text, p_source_event_key text, p_consent_text_version text, p_consent_text_snapshot text, p_occurred_at timestamp with time zone, p_recorded_by text, p_metadata jsonb)
-- acl public.marketing_record_consent_v1(p_customer_id uuid, p_decision text, p_source text, p_source_ref text, p_source_event_key text, p_consent_text_version text, p_consent_text_snapshot text, p_occurred_at timestamp with time zone, p_recorded_by text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_repurchase_customer_trigger_v1()
-- acl public.marketing_repurchase_customer_trigger_v1(): postgres=X/postgres

-- function_grant: marketing_repurchase_mark_sent_v1(p_customer_id uuid, p_order_id uuid, p_sent_at timestamp with time zone)
-- acl public.marketing_repurchase_mark_sent_v1(p_customer_id uuid, p_order_id uuid, p_sent_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_repurchase_order_trigger_v1()
-- acl public.marketing_repurchase_order_trigger_v1(): postgres=X/postgres

-- function_grant: marketing_repurchase_recalc_v1(p_customer_id uuid)
-- acl public.marketing_repurchase_recalc_v1(p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_resolve_tracking_token_v1(p_token text)
-- acl public.marketing_resolve_tracking_token_v1(p_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_resume_campaign_v1(p_campaign_id uuid, p_scheduled_for timestamp with time zone)
-- acl public.marketing_resume_campaign_v1(p_campaign_id uuid, p_scheduled_for timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_revalidate_dispatch_v1(p_dispatch_id uuid)
-- acl public.marketing_revalidate_dispatch_v1(p_dispatch_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_schedule_campaign_v1(p_campaign_id uuid, p_expected_revision integer, p_scheduled_for timestamp with time zone)
-- acl public.marketing_schedule_campaign_v1(p_campaign_id uuid, p_expected_revision integer, p_scheduled_for timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_append_event_v1(p_strategy_id uuid, p_event_type text, p_actor_user_id uuid, p_metadata jsonb)
-- acl public.marketing_strategy_append_event_v1(p_strategy_id uuid, p_event_type text, p_actor_user_id uuid, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_approve_send_v1(p_strategy_id uuid, p_expected_revision integer, p_actor_user_id uuid)
-- acl public.marketing_strategy_approve_send_v1(p_strategy_id uuid, p_expected_revision integer, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_detail_v1(p_strategy_id uuid)
-- acl public.marketing_strategy_detail_v1(p_strategy_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_events_immutable_v1()
-- acl public.marketing_strategy_events_immutable_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_funnel_v1(p_strategy_id uuid)
-- acl public.marketing_strategy_funnel_v1(p_strategy_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_learnings_v1()
-- acl public.marketing_strategy_learnings_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_materialize_campaign_v1(p_strategy_id uuid, p_expected_revision integer, p_actor_user_id uuid)
-- acl public.marketing_strategy_materialize_campaign_v1(p_strategy_id uuid, p_expected_revision integer, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_offer_performance_v1()
-- acl public.marketing_strategy_offer_performance_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_revalidate_commercial_v1(p_strategy_id uuid)
-- acl public.marketing_strategy_revalidate_commercial_v1(p_strategy_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_schedule_send_v1(p_strategy_id uuid, p_expected_revision integer, p_scheduled_for timestamp with time zone, p_actor_user_id uuid)
-- acl public.marketing_strategy_schedule_send_v1(p_strategy_id uuid, p_expected_revision integer, p_scheduled_for timestamp with time zone, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_strategy_transition_v1(p_strategy_id uuid, p_expected_revision integer, p_to_status text, p_actor_user_id uuid, p_reason text)
-- acl public.marketing_strategy_transition_v1(p_strategy_id uuid, p_expected_revision integer, p_to_status text, p_actor_user_id uuid, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_template_lifecycle_approve_delete_v1(p_template_id uuid, p_actor_user_id uuid)
-- acl public.marketing_template_lifecycle_approve_delete_v1(p_template_id uuid, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_template_lifecycle_list_v1(p_whatsapp_account_id uuid)
-- acl public.marketing_template_lifecycle_list_v1(p_whatsapp_account_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_template_lifecycle_mark_deleted_v1(p_template_id uuid, p_actor_user_id uuid, p_provider_payload jsonb)
-- acl public.marketing_template_lifecycle_mark_deleted_v1(p_template_id uuid, p_actor_user_id uuid, p_provider_payload jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_template_lifecycle_refresh_v1()
-- acl public.marketing_template_lifecycle_refresh_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_template_lifecycle_set_protected_v1(p_template_id uuid, p_protected boolean, p_actor_user_id uuid)
-- acl public.marketing_template_lifecycle_set_protected_v1(p_template_id uuid, p_protected boolean, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_track_checkout_v1(p_token text)
-- acl public.marketing_track_checkout_v1(p_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_transition_campaign_v1(p_campaign_id uuid, p_expected_revision integer, p_to_status text, p_reason text)
-- acl public.marketing_transition_campaign_v1(p_campaign_id uuid, p_expected_revision integer, p_to_status text, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: marketing_update_campaign_draft_v1(p_campaign_id uuid, p_expected_revision integer, p_patch jsonb)
-- acl public.marketing_update_campaign_draft_v1(p_campaign_id uuid, p_expected_revision integer, p_patch jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: merge_bling_hub_runtime_metadata_v2(p_patch jsonb)
-- acl public.merge_bling_hub_runtime_metadata_v2(p_patch jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: meta_catalog_product_link_admin_save_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_product_retailer_id text, p_product_id uuid, p_link_id uuid)
-- acl public.meta_catalog_product_link_admin_save_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_product_retailer_id text, p_product_id uuid, p_link_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: meta_catalog_product_links_activate_batch_v1(p_whatsapp_account_id uuid, p_waba_id text, p_catalog_id text, p_verified_links jsonb)
-- acl public.meta_catalog_product_links_activate_batch_v1(p_whatsapp_account_id uuid, p_waba_id text, p_catalog_id text, p_verified_links jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: meta_catalog_product_links_admin_list_v1(p_limit integer, p_query text, p_link_id uuid)
-- acl public.meta_catalog_product_links_admin_list_v1(p_limit integer, p_query text, p_link_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: meta_catalog_product_links_verification_candidates_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_after_updated_at timestamp with time zone, p_after_id uuid)
-- acl public.meta_catalog_product_links_verification_candidates_v1(p_whatsapp_account_id uuid, p_catalog_id text, p_after_updated_at timestamp with time zone, p_after_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: normalize_local_delivery_city_v1(p_city text)
-- acl public.normalize_local_delivery_city_v1(p_city text): postgres=X/postgres service_role=X/postgres

-- function_grant: normalize_phone_digits(p_phone text)
-- acl public.normalize_phone_digits(p_phone text): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: normalize_storefront_phone_v2(p_phone text)
-- acl public.normalize_storefront_phone_v2(p_phone text): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_accept_order_whatsapp_meta_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone)
-- acl public.ops2_accept_order_whatsapp_meta_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_activate_bling_stock_authority_v1()
-- acl public.ops2_activate_bling_stock_authority_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_ana_customer_profile_context_v1(p_conversation_id uuid)
-- acl public.ops2_admin_ana_customer_profile_context_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_customer_profile_extract_access_v1()
-- acl public.ops2_admin_ana_customer_profile_extract_access_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_customer_profile_metrics_v1()
-- acl public.ops2_admin_ana_customer_profile_metrics_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_customer_profile_review_v1(p_suggestion_id uuid, p_outcome text)
-- acl public.ops2_admin_ana_customer_profile_review_v1(p_suggestion_id uuid, p_outcome text): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_customer_profile_suggestions_v1(p_conversation_id uuid)
-- acl public.ops2_admin_ana_customer_profile_suggestions_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_preview_finish_v1(p_job_id uuid, p_status text, p_decision text, p_suggestion_text text, p_confidence numeric, p_reason text, p_model text, p_provider_response_id text, p_last_error text, p_missing_context jsonb)
-- acl public.ops2_admin_ana_preview_finish_v1(p_job_id uuid, p_status text, p_decision text, p_suggestion_text text, p_confidence numeric, p_reason text, p_model text, p_provider_response_id text, p_last_error text, p_missing_context jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_preview_metrics_v1()
-- acl public.ops2_admin_ana_preview_metrics_v1(): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_preview_observe_v1(p_job_id uuid, p_latency_ms integer, p_cached boolean)
-- acl public.ops2_admin_ana_preview_observe_v1(p_job_id uuid, p_latency_ms integer, p_cached boolean): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_preview_review_v1(p_job_id uuid, p_outcome text, p_note text)
-- acl public.ops2_admin_ana_preview_review_v1(p_job_id uuid, p_outcome text, p_note text): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_ana_preview_start_v1(p_conversation_id uuid)
-- acl public.ops2_admin_ana_preview_start_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_accept_meta_interactive_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone)
-- acl public.ops2_admin_attendance_accept_meta_interactive_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_accept_meta_media_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_provider_media_id text, p_accepted_at timestamp with time zone)
-- acl public.ops2_admin_attendance_accept_meta_media_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_provider_media_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_accept_meta_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone)
-- acl public.ops2_admin_attendance_accept_meta_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_accept_meta_template_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone)
-- acl public.ops2_admin_attendance_accept_meta_template_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_claim_interactive_outbox_v1(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_claim_interactive_outbox_v1(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_claim_media_outbox_v1(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_claim_media_outbox_v1(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_claim_outbox_v1(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_claim_outbox_v1(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_claim_outbox_v2(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_claim_outbox_v2(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_claim_outbox_v3(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_claim_outbox_v3(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_claim_template_outbox_v1(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_claim_template_outbox_v1(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_context_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_context_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_conversation_v1(p_conversation_id uuid, p_before timestamp with time zone, p_limit integer)
-- acl public.ops2_admin_attendance_conversation_v1(p_conversation_id uuid, p_before timestamp with time zone, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_customer_access_v1(p_write boolean)
-- acl public.ops2_admin_attendance_customer_access_v1(p_write boolean): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_customer_create_browser_v1(p_conversation_id uuid, p_customer jsonb)
-- acl public.ops2_admin_attendance_customer_create_browser_v1(p_conversation_id uuid, p_customer jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_editor_browser_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_customer_editor_browser_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_editor_safe_browser_v1(p_conversation_id uuid, p_address_id uuid)
-- acl public.ops2_admin_attendance_customer_editor_safe_browser_v1(p_conversation_id uuid, p_address_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_link_browser_v1(p_conversation_id uuid, p_customer_id uuid)
-- acl public.ops2_admin_attendance_customer_link_browser_v1(p_conversation_id uuid, p_customer_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_reconcile_browser_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_customer_reconcile_browser_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_save_browser_v1(p_conversation_id uuid, p_customer jsonb)
-- acl public.ops2_admin_attendance_customer_save_browser_v1(p_conversation_id uuid, p_customer jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_search_browser_v1(p_query text, p_limit integer)
-- acl public.ops2_admin_attendance_customer_search_browser_v1(p_query text, p_limit integer): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_customer_search_v1(p_query text, p_limit integer)
-- acl public.ops2_admin_attendance_customer_search_v1(p_query text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_customer_update_browser_v1(p_conversation_id uuid, p_expected_customer_updated_at timestamp with time zone, p_customer_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb)
-- acl public.ops2_admin_attendance_customer_update_browser_v1(p_conversation_id uuid, p_expected_customer_updated_at timestamp with time zone, p_customer_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_enqueue_interactive_v1(p_conversation_id uuid, p_interactive jsonb, p_idempotency_key text, p_admin_user_id uuid)
-- acl public.ops2_admin_attendance_enqueue_interactive_v1(p_conversation_id uuid, p_interactive jsonb, p_idempotency_key text, p_admin_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_enqueue_media_v1(p_conversation_id uuid, p_media_type text, p_mime_type text, p_filename text, p_size_bytes bigint, p_sha256 text, p_caption text, p_idempotency_key text)
-- acl public.ops2_admin_attendance_enqueue_media_v1(p_conversation_id uuid, p_media_type text, p_mime_type text, p_filename text, p_size_bytes bigint, p_sha256 text, p_caption text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_enqueue_template_v1(p_conversation_id uuid, p_template_id uuid, p_parameters jsonb, p_idempotency_key text)
-- acl public.ops2_admin_attendance_enqueue_template_v1(p_conversation_id uuid, p_template_id uuid, p_parameters jsonb, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_enqueue_text_v1(p_conversation_id uuid, p_text text, p_idempotency_key text)
-- acl public.ops2_admin_attendance_enqueue_text_v1(p_conversation_id uuid, p_text text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_enqueue_text_v2(p_conversation_id uuid, p_text text, p_idempotency_key text)
-- acl public.ops2_admin_attendance_enqueue_text_v2(p_conversation_id uuid, p_text text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_enqueue_text_v3(p_conversation_id uuid, p_text text, p_idempotency_key text)
-- acl public.ops2_admin_attendance_enqueue_text_v3(p_conversation_id uuid, p_text text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_follow_up_v1(p_conversation_id uuid, p_follow_up_at timestamp with time zone)
-- acl public.ops2_admin_attendance_follow_up_v1(p_conversation_id uuid, p_follow_up_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_library_audit_v1(p_admin_user_id uuid, p_item_id uuid, p_conversation_id uuid, p_whatsapp_account_id uuid, p_action text, p_result text, p_error_code text, p_outbox_id uuid, p_message_id uuid, p_provider_message_id text, p_metadata jsonb)
-- acl public.ops2_admin_attendance_library_audit_v1(p_admin_user_id uuid, p_item_id uuid, p_conversation_id uuid, p_whatsapp_account_id uuid, p_action text, p_result text, p_error_code text, p_outbox_id uuid, p_message_id uuid, p_provider_message_id text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_library_deactivate_v1(p_item_id uuid, p_admin_user_id uuid)
-- acl public.ops2_admin_attendance_library_deactivate_v1(p_item_id uuid, p_admin_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_library_finalize_v1(p_item_id uuid, p_stored_size_bytes bigint, p_width integer, p_height integer, p_duration_seconds numeric, p_admin_user_id uuid)
-- acl public.ops2_admin_attendance_library_finalize_v1(p_item_id uuid, p_stored_size_bytes bigint, p_width integer, p_height integer, p_duration_seconds numeric, p_admin_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_library_reserve_v1(p_title text, p_media_kind text, p_mime_type text, p_original_filename text, p_original_size_bytes bigint, p_category text, p_tags text[], p_admin_user_id uuid)
-- acl public.ops2_admin_attendance_library_reserve_v1(p_title text, p_media_kind text, p_mime_type text, p_original_filename text, p_original_size_bytes bigint, p_category text, p_tags text[], p_admin_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_library_update_v1(p_item_id uuid, p_title text, p_category text, p_tags text[], p_sort_order integer, p_admin_user_id uuid)
-- acl public.ops2_admin_attendance_library_update_v1(p_item_id uuid, p_title text, p_category text, p_tags text[], p_sort_order integer, p_admin_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_link_customer_v1(p_conversation_id uuid, p_customer_id uuid)
-- acl public.ops2_admin_attendance_link_customer_v1(p_conversation_id uuid, p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_mark_read_v1(p_conversation_id uuid, p_message_id uuid)
-- acl public.ops2_admin_attendance_mark_read_v1(p_conversation_id uuid, p_message_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_marketing_optout_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_marketing_optout_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_media_canary_guard_v1()
-- acl public.ops2_admin_attendance_media_canary_guard_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_queue_v1(p_whatsapp_account_id uuid, p_limit integer, p_search text, p_filter text)
-- acl public.ops2_admin_attendance_queue_v1(p_whatsapp_account_id uuid, p_limit integer, p_search text, p_filter text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_queue_v2(p_whatsapp_account_id uuid, p_limit integer, p_search text)
-- acl public.ops2_admin_attendance_queue_v2(p_whatsapp_account_id uuid, p_limit integer, p_search text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_queue_v3(p_whatsapp_account_id uuid, p_limit integer, p_search text, p_label_id uuid)
-- acl public.ops2_admin_attendance_queue_v3(p_whatsapp_account_id uuid, p_limit integer, p_search text, p_label_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_queue_v4(p_whatsapp_account_id uuid, p_limit integer, p_search text, p_label_id uuid)
-- acl public.ops2_admin_attendance_queue_v4(p_whatsapp_account_id uuid, p_limit integer, p_search text, p_label_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_reconcile_customer_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_reconcile_customer_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_requeue_failed_media_v1(p_outbox_id uuid)
-- acl public.ops2_admin_attendance_requeue_failed_media_v1(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_resume_ai_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_resume_ai_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_set_labels_v1(p_conversation_id uuid, p_label_ids uuid[])
-- acl public.ops2_admin_attendance_set_labels_v1(p_conversation_id uuid, p_label_ids uuid[]): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_takeover_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_takeover_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_mark_failed_v1(p_request_id uuid)
-- acl public.ops2_admin_attendance_weekly_consent_mark_failed_v1(p_request_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_mark_sent_browser_v1(p_request_id uuid, p_outbox_id uuid)
-- acl public.ops2_admin_attendance_weekly_consent_mark_sent_browser_v1(p_request_id uuid, p_outbox_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_mark_sent_v1(p_request_id uuid, p_outbox_id uuid, p_provider_message_id text)
-- acl public.ops2_admin_attendance_weekly_consent_mark_sent_v1(p_request_id uuid, p_outbox_id uuid, p_provider_message_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_prepare_browser_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_weekly_consent_prepare_browser_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_prepare_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_weekly_consent_prepare_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_state_browser_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_weekly_consent_state_browser_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_admin_attendance_weekly_consent_state_v1(p_conversation_id uuid)
-- acl public.ops2_admin_attendance_weekly_consent_state_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_cancel_site_order_v1(p_order_id uuid)
-- acl public.ops2_admin_cancel_site_order_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_customer_delete_v1(p_customer_id uuid)
-- acl public.ops2_admin_customer_delete_v1(p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_customer_save_v2(p_payload jsonb)
-- acl public.ops2_admin_customer_save_v2(p_payload jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_admin_set_order_separation_item_v1(p_order_id uuid, p_order_item_id uuid, p_state text, p_expected_order_updated_at timestamp with time zone, p_separator_key text, p_replacement_product_id uuid)
-- acl public.ops2_admin_set_order_separation_item_v1(p_order_id uuid, p_order_item_id uuid, p_state text, p_expected_order_updated_at timestamp with time zone, p_separator_key text, p_replacement_product_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_accept_live_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone)
-- acl public.ops2_ana_accept_live_outbound_v1(p_outbox_id uuid, p_provider_message_id text, p_accepted_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_active_config_v1()
-- acl public.ops2_ana_active_config_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_admin_load_v1()
-- acl public.ops2_ana_admin_load_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_admin_publish_v1(p_test_run_id uuid, p_note text, p_actor_id uuid)
-- acl public.ops2_ana_admin_publish_v1(p_test_run_id uuid, p_note text, p_actor_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_admin_record_test_run_v1(p_draft_revision bigint, p_scenario_keys text[], p_passed_count integer, p_failed_count integer, p_safe_reasons jsonb, p_latency_ms integer, p_actor_id uuid)
-- acl public.ops2_ana_admin_record_test_run_v1(p_draft_revision bigint, p_scenario_keys text[], p_passed_count integer, p_failed_count integer, p_safe_reasons jsonb, p_latency_ms integer, p_actor_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_admin_rollback_v1(p_version_id bigint, p_note text, p_actor_id uuid)
-- acl public.ops2_ana_admin_rollback_v1(p_version_id bigint, p_note text, p_actor_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_admin_save_draft_v1(p_configuration jsonb, p_expected_revision bigint, p_note text, p_actor_id uuid)
-- acl public.ops2_ana_admin_save_draft_v1(p_configuration jsonb, p_expected_revision bigint, p_note text, p_actor_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_admin_set_channel_v1(p_whatsapp_account_id uuid, p_enabled boolean, p_actor_id uuid)
-- acl public.ops2_ana_admin_set_channel_v1(p_whatsapp_account_id uuid, p_enabled boolean, p_actor_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_apply_trigger_label_v1(p_conversation_id uuid, p_label_id uuid, p_trigger_key text)
-- acl public.ops2_ana_apply_trigger_label_v1(p_conversation_id uuid, p_label_id uuid, p_trigger_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_begin_live_send_v1(p_job_id uuid, p_text text)
-- acl public.ops2_ana_begin_live_send_v1(p_job_id uuid, p_text text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_claim_dry_run_job_v1(p_job_id uuid)
-- acl public.ops2_ana_claim_dry_run_job_v1(p_job_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_claim_dry_run_v1(p_limit integer)
-- acl public.ops2_ana_claim_dry_run_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_claim_live_v1(p_limit integer)
-- acl public.ops2_ana_claim_live_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_customer_confirmation_apply_signal_v1(p_request_id uuid, p_message_id uuid, p_decision text)
-- acl public.ops2_ana_customer_confirmation_apply_signal_v1(p_request_id uuid, p_message_id uuid, p_decision text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_customer_confirmation_bind_outbound_v1(p_request_id uuid, p_message_id uuid)
-- acl public.ops2_ana_customer_confirmation_bind_outbound_v1(p_request_id uuid, p_message_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_ana_customer_confirmation_create_v1(p_conversation_id uuid, p_suggestion_ids uuid[])
-- acl public.ops2_ana_customer_confirmation_create_v1(p_conversation_id uuid, p_suggestion_ids uuid[]): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_ana_customer_confirmation_pending_v1(p_conversation_id uuid)
-- acl public.ops2_ana_customer_confirmation_pending_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: ops2_ana_customer_profile_persist_v1(p_conversation_id uuid, p_customer_id uuid, p_conversation_phone_e164 text, p_snapshot_key text, p_model text, p_provider_response_id text, p_metadata jsonb, p_created_by_admin_user_id uuid, p_candidates jsonb)
-- acl public.ops2_ana_customer_profile_persist_v1(p_conversation_id uuid, p_customer_id uuid, p_conversation_phone_e164 text, p_snapshot_key text, p_model text, p_provider_response_id text, p_metadata jsonb, p_created_by_admin_user_id uuid, p_candidates jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_enqueue_dry_run_v1(p_inbound_message_id uuid)
-- acl public.ops2_ana_enqueue_dry_run_v1(p_inbound_message_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_enqueue_live_job_v1(p_inbound_message_id uuid)
-- acl public.ops2_ana_enqueue_live_job_v1(p_inbound_message_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_fail_live_send_v1(p_outbox_id uuid, p_reason text)
-- acl public.ops2_ana_fail_live_send_v1(p_outbox_id uuid, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_finish_dry_run_v1(p_job_id uuid, p_status text, p_decision text, p_suggestion_text text, p_confidence numeric, p_reason text, p_model text, p_provider_response_id text, p_last_error text, p_metadata jsonb)
-- acl public.ops2_ana_finish_dry_run_v1(p_job_id uuid, p_status text, p_decision text, p_suggestion_text text, p_confidence numeric, p_reason text, p_model text, p_provider_response_id text, p_last_error text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_finish_live_job_v1(p_job_id uuid, p_status text, p_decision text, p_text text, p_confidence numeric, p_reason text, p_model text, p_provider_response_id text, p_error text, p_metadata jsonb)
-- acl public.ops2_ana_finish_live_job_v1(p_job_id uuid, p_status text, p_decision text, p_text text, p_confidence numeric, p_reason text, p_model text, p_provider_response_id text, p_error text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_ana_remove_trigger_label_v1(p_conversation_id uuid, p_label_id uuid, p_trigger_key text)
-- acl public.ops2_ana_remove_trigger_label_v1(p_conversation_id uuid, p_label_id uuid, p_trigger_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_apply_order_separation_stock_v2(p_order_id uuid)
-- acl public.ops2_apply_order_separation_stock_v2(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_apply_papoai_customer_flow_v1(p_event_key text, p_phone text, p_name text, p_conversation_ref text)
-- acl public.ops2_apply_papoai_customer_flow_v1(p_event_key text, p_phone text, p_name text, p_conversation_ref text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_apply_papoai_customer_flow_v2(p_event_key text, p_phone text, p_name text, p_document text, p_address text, p_district text, p_city text, p_state text, p_conversation_ref text, p_capture_id uuid, p_flow_token text)
-- acl public.ops2_apply_papoai_customer_flow_v2(p_event_key text, p_phone text, p_name text, p_document text, p_address text, p_district text, p_city text, p_state text, p_conversation_ref text, p_capture_id uuid, p_flow_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_apply_virtual_stock_webhook_shadow_v1()
-- acl public.ops2_apply_virtual_stock_webhook_shadow_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_arm_catalog_stock_canary_band_v1(p_canary uuid, p_band integer, p_confirmation text)
-- acl public.ops2_arm_catalog_stock_canary_band_v1(p_canary uuid, p_band integer, p_confirmation text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_arm_catalog_stock_canary_delta2_v1(p_canary uuid, p_confirmation text)
-- acl public.ops2_arm_catalog_stock_canary_delta2_v1(p_canary uuid, p_confirmation text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_arm_catalog_stock_canary_highrisk_v1(p_canary uuid, p_band integer, p_confirmation text)
-- acl public.ops2_arm_catalog_stock_canary_highrisk_v1(p_canary uuid, p_band integer, p_confirmation text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_arm_catalog_stock_canary_v1(p_canary uuid, p_confirmation text)
-- acl public.ops2_arm_catalog_stock_canary_v1(p_canary uuid, p_confirmation text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_ai_gate_v1(p_conversation_id uuid)
-- acl public.ops2_attendance_ai_gate_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_delivery_date_v1(p_value text)
-- acl public.ops2_attendance_delivery_date_v1(p_value text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_media_live_readiness_v1(p_whatsapp_account_id uuid)
-- acl public.ops2_attendance_media_live_readiness_v1(p_whatsapp_account_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_orders_refresh_delivery_labels_trigger_v1()
-- acl public.ops2_attendance_orders_refresh_delivery_labels_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_outbox_human_ai_guard_v1()
-- acl public.ops2_attendance_outbox_human_ai_guard_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_product_interest_item_trigger_v1()
-- acl public.ops2_attendance_product_interest_item_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_product_interest_order_trigger_v1()
-- acl public.ops2_attendance_product_interest_order_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_refresh_delivery_day_labels_v1(p_conversation_id uuid)
-- acl public.ops2_attendance_refresh_delivery_day_labels_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_attendance_refresh_product_interest_labels_v1(p_order_id uuid)
-- acl public.ops2_attendance_refresh_product_interest_labels_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_auto_process_papoai_flow_v2()
-- acl public.ops2_auto_process_papoai_flow_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_bling_stock_worker_health_summary_v1()
-- acl public.ops2_bling_stock_worker_health_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_build_catalog_sync_plan_v1(p_run uuid)
-- acl public.ops2_build_catalog_sync_plan_v1(p_run uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_capture_catalog_baseline_v1(p_notes text)
-- acl public.ops2_capture_catalog_baseline_v1(p_notes text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_check_stock_cutover_canary_v1(p_run_id uuid)
-- acl public.ops2_check_stock_cutover_canary_v1(p_run_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_claim_checkout_order_whatsapp_v1(p_order_id uuid)
-- acl public.ops2_claim_checkout_order_whatsapp_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_claim_order_whatsapp_outbox_v1(p_order_id uuid)
-- acl public.ops2_claim_order_whatsapp_outbox_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_claim_papoai_order_signal_v1()
-- acl public.ops2_claim_papoai_order_signal_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_claim_whatsapp_outbox_v1(p_channel_origin text)
-- acl public.ops2_claim_whatsapp_outbox_v1(p_channel_origin text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_consume_order_registration_link_v1(p_token text, p_customer_id uuid, p_phone text)
-- acl public.ops2_consume_order_registration_link_v1(p_token text, p_customer_id uuid, p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_address_number_fill_v1()
-- acl public.ops2_customer_address_number_fill_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_address_registration_journey_trigger_v1()
-- acl public.ops2_customer_address_registration_journey_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_identity_summary_v1()
-- acl public.ops2_customer_identity_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_identity_summary_v2()
-- acl public.ops2_customer_identity_summary_v2(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_registration_journey_trigger_v1()
-- acl public.ops2_customer_registration_journey_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_registration_state_v1(p_customer_id uuid)
-- acl public.ops2_customer_registration_state_v1(p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_customer_registration_summary_v1(p_days integer)
-- acl public.ops2_customer_registration_summary_v1(p_days integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_enqueue_admin_order_whatsapp_v1(p_order_id uuid)
-- acl public.ops2_enqueue_admin_order_whatsapp_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_enqueue_order_whatsapp_v1(p_order_id uuid, p_message_kind text)
-- acl public.ops2_enqueue_order_whatsapp_v1(p_order_id uuid, p_message_kind text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_enqueue_order_whatsapp_v1_base(p_order_id uuid, p_message_kind text)
-- acl public.ops2_enqueue_order_whatsapp_v1_base(p_order_id uuid, p_message_kind text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_enqueue_papoai_order_signals_v1(p_order_id uuid, p_channel_origin text, p_phone_e164 text, p_signal_keys text[])
-- acl public.ops2_enqueue_papoai_order_signals_v1(p_order_id uuid, p_channel_origin text, p_phone_e164 text, p_signal_keys text[]): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_enqueue_storefront_order_whatsapp_v1()
-- acl public.ops2_enqueue_storefront_order_whatsapp_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_enrich_storefront_order_result_v1(p_result jsonb)
-- acl public.ops2_enrich_storefront_order_result_v1(p_result jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_extract_address_number_v1(p_street text)
-- acl public.ops2_extract_address_number_v1(p_street text): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_fefo_preview_v1(p_product_id uuid, p_quantity numeric)
-- acl public.ops2_fefo_preview_v1(p_product_id uuid, p_quantity numeric): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_finish_papoai_order_signal_v1(p_outbox_id uuid, p_status text, p_external_ref text, p_last_error text, p_retry_after_seconds integer)
-- acl public.ops2_finish_papoai_order_signal_v1(p_outbox_id uuid, p_status text, p_external_ref text, p_last_error text, p_retry_after_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_finish_whatsapp_outbox_v1(p_outbox_id uuid, p_status text, p_external_message_id text, p_last_error text, p_retry_after_seconds integer)
-- acl public.ops2_finish_whatsapp_outbox_v1(p_outbox_id uuid, p_status text, p_external_message_id text, p_last_error text, p_retry_after_seconds integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_fiscal_dispatch_preflight_v1(p_order_id uuid)
-- acl public.ops2_fiscal_dispatch_preflight_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_format_order_public_code_v1(p_value bigint)
-- acl public.ops2_format_order_public_code_v1(p_value bigint): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_get_order_separation_v2(p_order_id uuid)
-- acl public.ops2_get_order_separation_v2(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_guard_dispatch_fiscal_job_v1()
-- acl public.ops2_guard_dispatch_fiscal_job_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_guard_fiscal_runtime_arm_v1()
-- acl public.ops2_guard_fiscal_runtime_arm_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_init_order_separation_v2(p_order_id uuid)
-- acl public.ops2_init_order_separation_v2(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_integrated_readiness_summary_v1()
-- acl public.ops2_integrated_readiness_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_issue_order_registration_link_v1(p_order_id uuid)
-- acl public.ops2_issue_order_registration_link_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_issue_papoai_catalog_link_v1(p_phone text, p_conversation_id uuid, p_source_event_key text)
-- acl public.ops2_issue_papoai_catalog_link_v1(p_phone text, p_conversation_id uuid, p_source_event_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_issue_registration_catalog_return_v1(p_customer_id uuid, p_registration_job_id uuid)
-- acl public.ops2_issue_registration_catalog_return_v1(p_customer_id uuid, p_registration_job_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_issue_storefront_catalog_link_v1(p_phone text, p_conversation_id uuid, p_source_event_key text, p_source text, p_ttl_minutes integer)
-- acl public.ops2_issue_storefront_catalog_link_v1(p_phone text, p_conversation_id uuid, p_source_event_key text, p_source text, p_ttl_minutes integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_link_papoai_capture_order_v1(p_capture_id uuid)
-- acl public.ops2_link_papoai_capture_order_v1(p_capture_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_link_storefront_order_from_identity_v1(p_order_id uuid)
-- acl public.ops2_link_storefront_order_from_identity_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_mark_order_separation_completion_v2(p_order_id uuid, p_phase text, p_metadata jsonb)
-- acl public.ops2_mark_order_separation_completion_v2(p_order_id uuid, p_phase text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_materialize_catalog_bindings_v1(p_run uuid)
-- acl public.ops2_materialize_catalog_bindings_v1(p_run uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_maybe_enqueue_customer_bling_v1(p_customer_id uuid, p_reason text)
-- acl public.ops2_maybe_enqueue_customer_bling_v1(p_customer_id uuid, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_meta_dispatch_readiness_v1(p_intent_id uuid)
-- acl public.ops2_meta_dispatch_readiness_v1(p_intent_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_operational_ux_state_v1()
-- acl public.ops2_operational_ux_state_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_order_delivery_number_fill_v1()
-- acl public.ops2_order_delivery_number_fill_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_order_item_public_snapshot_trigger_v1()
-- acl public.ops2_order_item_public_snapshot_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_order_public_link_v1(p_order_id uuid)
-- acl public.ops2_order_public_link_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_order_registration_journey_trigger_v1()
-- acl public.ops2_order_registration_journey_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_orders_ensure_site_customer_v1()
-- acl public.ops2_orders_ensure_site_customer_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_attendance_provider_store_v1(p_channel text, p_url text)
-- acl public.ops2_papoai_attendance_provider_store_v1(p_channel text, p_url text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_attendance_provider_url_v1(p_channel text)
-- acl public.ops2_papoai_attendance_provider_url_v1(p_channel text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_capture_order_link_trigger_v1()
-- acl public.ops2_papoai_capture_order_link_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_dispatch_guard_v1(p_intent_id uuid)
-- acl public.ops2_papoai_dispatch_guard_v1(p_intent_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_flow_text_field_v1(p_text text, p_key text)
-- acl public.ops2_papoai_flow_text_field_v1(p_text text, p_key text): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_operational_summary_v1()
-- acl public.ops2_papoai_operational_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_order_provider_store_v1(p_channel text, p_url text)
-- acl public.ops2_papoai_order_provider_store_v1(p_channel text, p_url text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_order_provider_url_v1(p_channel text)
-- acl public.ops2_papoai_order_provider_url_v1(p_channel text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_outbound_summary_v1()
-- acl public.ops2_papoai_outbound_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_route_context_v1(p_order_id uuid)
-- acl public.ops2_papoai_route_context_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_signal_allowed_v1(p_signal text)
-- acl public.ops2_papoai_signal_allowed_v1(p_signal text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_signal_provider_store_v1(p_channel text, p_signal text, p_url text)
-- acl public.ops2_papoai_signal_provider_store_v1(p_channel text, p_signal text, p_url text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_papoai_signal_provider_url_v1(p_channel text, p_signal text)
-- acl public.ops2_papoai_signal_provider_url_v1(p_channel text, p_signal text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_plan_registration_flow_intent_v1(p_order_id uuid)
-- acl public.ops2_plan_registration_flow_intent_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_pre_human_catalog_readiness_summary_v1()
-- acl public.ops2_pre_human_catalog_readiness_summary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_prepare_catalog_stock_canary_band_v1(p_run uuid, p_abs_delta integer, p_limit integer)
-- acl public.ops2_prepare_catalog_stock_canary_band_v1(p_run uuid, p_abs_delta integer, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_prepare_catalog_stock_canary_highrisk_v1(p_run uuid, p_abs_delta integer)
-- acl public.ops2_prepare_catalog_stock_canary_highrisk_v1(p_run uuid, p_abs_delta integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_prepare_catalog_stock_canary_v1(p_run uuid, p_limit integer)
-- acl public.ops2_prepare_catalog_stock_canary_v1(p_run uuid, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_prepare_order_separation_completion_v2(p_order_id uuid, p_expected_order_updated_at timestamp with time zone)
-- acl public.ops2_prepare_order_separation_completion_v2(p_order_id uuid, p_expected_order_updated_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_prepare_stock_cutover_canary_v1()
-- acl public.ops2_prepare_stock_cutover_canary_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_process_papoai_flow_capture_v2(p_capture_id uuid)
-- acl public.ops2_process_papoai_flow_capture_v2(p_capture_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_purchase_xml_receipt_gate_v1(p_document_id uuid)
-- acl public.ops2_purchase_xml_receipt_gate_v1(p_document_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_reconcile_lot_expiry_status_v1()
-- acl public.ops2_reconcile_lot_expiry_status_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_reconcile_order_whatsapp_sent_v1()
-- acl public.ops2_reconcile_order_whatsapp_sent_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_reconcile_papoai_inbound_v1(p_since timestamp with time zone, p_limit integer)
-- acl public.ops2_reconcile_papoai_inbound_v1(p_since timestamp with time zone, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_reconcile_unlinked_site_orders_v2(p_days integer)
-- acl public.ops2_reconcile_unlinked_site_orders_v2(p_days integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_refresh_customer_registration_journeys_v1(p_customer_id uuid, p_emit_event boolean)
-- acl public.ops2_refresh_customer_registration_journeys_v1(p_customer_id uuid, p_emit_event boolean): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
-- acl public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_refresh_order_registration_journey_v1(p_order_id uuid, p_emit_event boolean)
-- acl public.ops2_refresh_order_registration_journey_v1(p_order_id uuid, p_emit_event boolean): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_refresh_storefront_order_whatsapp_v1()
-- acl public.ops2_refresh_storefront_order_whatsapp_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_registration_journey_outbound_intent_trigger_v1()
-- acl public.ops2_registration_journey_outbound_intent_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_render_whatsapp_template_body_v1(p_whatsapp_account_id uuid, p_template_name text, p_components jsonb, p_variable_values jsonb)
-- acl public.ops2_render_whatsapp_template_body_v1(p_whatsapp_account_id uuid, p_template_name text, p_components jsonb, p_variable_values jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_require_separator_completion_v4()
-- acl public.ops2_require_separator_completion_v4(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_resolve_order_registration_link_v1(p_token text)
-- acl public.ops2_resolve_order_registration_link_v1(p_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_rollback_bling_stock_authority_v1(p_reason text)
-- acl public.ops2_rollback_bling_stock_authority_v1(p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_set_lot_tracking_complete_v1(p_product_id uuid, p_complete boolean, p_operator text)
-- acl public.ops2_set_lot_tracking_complete_v1(p_product_id uuid, p_complete boolean, p_operator text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_set_order_separation_item_v2(p_order_id uuid, p_order_item_id uuid, p_state text, p_expected_order_updated_at timestamp with time zone, p_separator_key text)
-- acl public.ops2_set_order_separation_item_v2(p_order_id uuid, p_order_item_id uuid, p_state text, p_expected_order_updated_at timestamp with time zone, p_separator_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_set_order_separator_v2(p_order_id uuid, p_separator_key text)
-- acl public.ops2_set_order_separator_v2(p_order_id uuid, p_separator_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_site_admin_customer_by_document_v1(p_document text)
-- acl public.ops2_site_admin_customer_by_document_v1(p_document text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_site_admin_customer_delete_v1(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone)
-- acl public.ops2_site_admin_customer_delete_v1(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_site_admin_customer_update_v1(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb)
-- acl public.ops2_site_admin_customer_update_v1(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_site_admin_customer_update_v2(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb, p_document text)
-- acl public.ops2_site_admin_customer_update_v2(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb, p_document text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_site_admin_customer_update_v3(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb, p_document text, p_phone text)
-- acl public.ops2_site_admin_customer_update_v3(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb, p_document text, p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_upsert_product_lot_v1(p_product_id uuid, p_lot_code text, p_expiration_date date, p_quantity_on_hand numeric, p_source text, p_source_ref text, p_received_at timestamp with time zone, p_metadata jsonb)
-- acl public.ops2_upsert_product_lot_v1(p_product_id uuid, p_lot_code text, p_expiration_date date, p_quantity_on_hand numeric, p_source text, p_source_ref text, p_received_at timestamp with time zone, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_upsert_storefront_registration_v1(p_phone text, p_name text, p_document text, p_street text, p_number text, p_neighborhood text, p_city text, p_complement text, p_reference text, p_postal_code text, p_marketing_opt_in boolean, p_source_key text)
-- acl public.ops2_upsert_storefront_registration_v1(p_phone text, p_name text, p_document text, p_street text, p_number text, p_neighborhood text, p_city text, p_complement text, p_reference text, p_postal_code text, p_marketing_opt_in boolean, p_source_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_valid_cpf_cnpj_v1(p_document text)
-- acl public.ops2_valid_cpf_cnpj_v1(p_document text): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_verify_catalog_stock_canary_v1(p_canary uuid)
-- acl public.ops2_verify_catalog_stock_canary_v1(p_canary uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_verify_catalog_stock_canary_v2(p_canary uuid)
-- acl public.ops2_verify_catalog_stock_canary_v2(p_canary uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_whatsapp_canonical_template_body_v1(p_message_id uuid, p_whatsapp_account_id uuid, p_metadata jsonb)
-- acl public.ops2_whatsapp_canonical_template_body_v1(p_message_id uuid, p_whatsapp_account_id uuid, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops2_whatsapp_capture_template_text_v1()
-- acl public.ops2_whatsapp_capture_template_text_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_add_items_to_existing_order_v1(p_token_hash text, p_request_key text, p_items jsonb)
-- acl public.ops3_add_items_to_existing_order_v1(p_token_hash text, p_request_key text, p_items jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_complete_delivery_v1(p_order_id uuid, p_method text, p_amount_cents bigint, p_operator_label text, p_idempotency_key text)
-- acl public.ops3_complete_delivery_v1(p_order_id uuid, p_method text, p_amount_cents bigint, p_operator_label text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_confirm_customer_order_v1(p_token_hash text, p_expected_total numeric, p_expected_updated_at timestamp with time zone)
-- acl public.ops3_confirm_customer_order_v1(p_token_hash text, p_expected_total numeric, p_expected_updated_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_create_order_addon_session_v1(p_order_id uuid, p_token_hash text, p_source text, p_metadata jsonb)
-- acl public.ops3_create_order_addon_session_v1(p_order_id uuid, p_token_hash text, p_source text, p_metadata jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_enqueue_confirmed_storefront_v1()
-- acl public.ops3_enqueue_confirmed_storefront_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_get_customer_order_action_v1(p_token_hash text)
-- acl public.ops3_get_customer_order_action_v1(p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_get_order_addon_session_v1(p_token_hash text)
-- acl public.ops3_get_order_addon_session_v1(p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_issue_customer_order_action_v1(p_order_id uuid, p_token_hash text)
-- acl public.ops3_issue_customer_order_action_v1(p_order_id uuid, p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_mark_delivery_prepaid_v1(p_order_id uuid, p_method text, p_reference text, p_operator_label text)
-- acl public.ops3_mark_delivery_prepaid_v1(p_order_id uuid, p_method text, p_reference text, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_order_addon_eligibility_v1(p_order_id uuid)
-- acl public.ops3_order_addon_eligibility_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_reopen_order_v1(p_order_id uuid, p_operator_label text)
-- acl public.ops3_reopen_order_v1(p_order_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_site_admin_customer_address_manage_v1(p_action text, p_customer_id uuid, p_address_id uuid, p_expected_updated_at timestamp with time zone, p_label text, p_address jsonb)
-- acl public.ops3_site_admin_customer_address_manage_v1(p_action text, p_customer_id uuid, p_address_id uuid, p_expected_updated_at timestamp with time zone, p_label text, p_address jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_storefront_customer_address_add_v1(p_customer_id uuid, p_phone text, p_document_last4 text, p_label text, p_address jsonb)
-- acl public.ops3_storefront_customer_address_add_v1(p_customer_id uuid, p_phone text, p_document_last4 text, p_label text, p_address jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_storefront_customer_document_bind_v1(p_customer_id uuid, p_phone text, p_document text)
-- acl public.ops3_storefront_customer_document_bind_v1(p_customer_id uuid, p_phone text, p_document text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops3_storefront_customer_register_v1(p_phone text, p_name text, p_document text, p_street text, p_number text, p_neighborhood text, p_city text, p_complement text, p_reference text, p_postal_code text, p_marketing_opt_in boolean, p_source_key text, p_address_label text)
-- acl public.ops3_storefront_customer_register_v1(p_phone text, p_name text, p_document text, p_street text, p_number text, p_neighborhood text, p_city text, p_complement text, p_reference text, p_postal_code text, p_marketing_opt_in boolean, p_source_key text, p_address_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_apply_postorder_quickreply_v1(p_order_id uuid, p_account_id uuid, p_phone_e164 text, p_action text, p_nonce_hash text, p_provider_message_id text)
-- acl public.ops4_apply_postorder_quickreply_v1(p_order_id uuid, p_account_id uuid, p_phone_e164 text, p_action text, p_nonce_hash text, p_provider_message_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_claim_due_postorder_followups_v1(p_limit integer)
-- acl public.ops4_claim_due_postorder_followups_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_claim_meta_postorder_command_v1(p_token_hash text)
-- acl public.ops4_claim_meta_postorder_command_v1(p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_claim_postorder_dispatch_command_v1(p_token_hash text)
-- acl public.ops4_claim_postorder_dispatch_command_v1(p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_complete_postorder_confirm_send_v1(p_order_id uuid, p_status text, p_nonce_hash text, p_expected_total numeric, p_expected_updated_at timestamp with time zone, p_provider_message_id text, p_error text)
-- acl public.ops4_complete_postorder_confirm_send_v1(p_order_id uuid, p_status text, p_nonce_hash text, p_expected_total numeric, p_expected_updated_at timestamp with time zone, p_provider_message_id text, p_error text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_dispatch_due_postorder_confirmation_v1()
-- acl public.ops4_dispatch_due_postorder_confirmation_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_dispatch_meta_postorder_v1()
-- acl public.ops4_dispatch_meta_postorder_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_meta_postorder_approval_tick_v1()
-- acl public.ops4_meta_postorder_approval_tick_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_offer_send_result_v1(p_order_id uuid, p_status text, p_provider_message_id text)
-- acl public.ops4_offer_send_result_v1(p_order_id uuid, p_status text, p_provider_message_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_register_postorder_followup_v1(p_order_id uuid, p_whatsapp_account_id uuid, p_phone_e164 text, p_channel text)
-- acl public.ops4_register_postorder_followup_v1(p_order_id uuid, p_whatsapp_account_id uuid, p_phone_e164 text, p_channel text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops4_start_dispatch_v1(p_order_id uuid, p_operator_label text, p_idempotency_key text)
-- acl public.ops4_start_dispatch_v1(p_order_id uuid, p_operator_label text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_apply_stock_recount_result_v1(p_product_id uuid, p_count_id uuid, p_counted_quantity numeric, p_operator_label text)
-- acl public.ops_apply_stock_recount_result_v1(p_product_id uuid, p_count_id uuid, p_counted_quantity numeric, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_cancel_print_jobs_for_entity_v1(p_entity_type text, p_entity_id text, p_reason text)
-- acl public.ops_cancel_print_jobs_for_entity_v1(p_entity_type text, p_entity_id text, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_claim_print_jobs_v1(p_worker text, p_limit integer)
-- acl public.ops_claim_print_jobs_v1(p_worker text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_classify_stock_reconciliation_v1(p_attention_id uuid, p_cause_code text, p_cause_note text, p_evidence_ref text, p_operator_label text)
-- acl public.ops_classify_stock_reconciliation_v1(p_attention_id uuid, p_cause_code text, p_cause_note text, p_evidence_ref text, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_confirm_delivery_return_v1(p_case_id uuid, p_disposition text, p_operator_label text)
-- acl public.ops_confirm_delivery_return_v1(p_case_id uuid, p_disposition text, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_enforce_delivery_payment_before_delivered_v1()
-- acl public.ops_enforce_delivery_payment_before_delivered_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_enforce_fiscal_before_dispatch_v1()
-- acl public.ops_enforce_fiscal_before_dispatch_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_enforce_order_check_before_ready_v1()
-- acl public.ops_enforce_order_check_before_ready_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_enqueue_print_job_v1(p_job_type text, p_entity_type text, p_entity_id text, p_version_key text, p_printer_profile text, p_copies integer, p_payload jsonb, p_source_system text, p_idempotency_key text)
-- acl public.ops_enqueue_print_job_v1(p_job_type text, p_entity_type text, p_entity_id text, p_version_key text, p_printer_profile text, p_copies integer, p_payload jsonb, p_source_system text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_finish_order_check_v1(p_order_id uuid, p_operator_label text)
-- acl public.ops_finish_order_check_v1(p_order_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_finish_print_job_v1(p_job_id uuid, p_status text, p_error text)
-- acl public.ops_finish_print_job_v1(p_job_id uuid, p_status text, p_error text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_get_order_check_v1(p_order_id uuid)
-- acl public.ops_get_order_check_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_mark_delivery_stop_failed_v1(p_order_id uuid, p_reason text)
-- acl public.ops_mark_delivery_stop_failed_v1(p_order_id uuid, p_reason text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_open_attention_v1(p_type text, p_summary text, p_entity_type text, p_entity_id text, p_correlation_id text, p_priority text, p_owner_role text, p_recommended_action text, p_evidence jsonb, p_source_system text, p_idempotency_key text, p_due_at timestamp with time zone)
-- acl public.ops_open_attention_v1(p_type text, p_summary text, p_entity_type text, p_entity_id text, p_correlation_id text, p_priority text, p_owner_role text, p_recommended_action text, p_evidence jsonb, p_source_system text, p_idempotency_key text, p_due_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_payment_bling_shadow_status_v1()
-- acl public.ops_payment_bling_shadow_status_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_plan_delivery_run_v1(p_vehicle_key text, p_order_ids uuid[], p_operator_label text)
-- acl public.ops_plan_delivery_run_v1(p_vehicle_key text, p_order_ids uuid[], p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_prepare_delivery_payment_bling_shadow_v1(p_settlement_id uuid)
-- acl public.ops_prepare_delivery_payment_bling_shadow_v1(p_settlement_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_present_print_job_v1(p_entity_type text, p_entity_id text, p_job_type text)
-- acl public.ops_present_print_job_v1(p_entity_type text, p_entity_id text, p_job_type text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_quick_balance_save_v1(p_product_id uuid, p_scanned_ean text, p_counted_quantity numeric, p_validity_date date, p_gondola text, p_expected_stock numeric, p_expected_validity_date date, p_expected_gondola text, p_operator_label text)
-- acl public.ops_quick_balance_save_v1(p_product_id uuid, p_scanned_ean text, p_counted_quantity numeric, p_validity_date date, p_gondola text, p_expected_stock numeric, p_expected_validity_date date, p_expected_gondola text, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_record_delivery_payment_v1(p_order_id uuid, p_parts jsonb, p_operator_label text, p_idempotency_key text)
-- acl public.ops_record_delivery_payment_v1(p_order_id uuid, p_parts jsonb, p_operator_label text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_record_event_v1(p_domain text, p_event_type text, p_summary text, p_actor_type text, p_entity_type text, p_entity_id text, p_correlation_id text, p_actor_id text, p_actor_label text, p_source_system text, p_severity text, p_payload jsonb, p_external_ref text, p_idempotency_key text, p_occurred_at timestamp with time zone)
-- acl public.ops_record_event_v1(p_domain text, p_event_type text, p_summary text, p_actor_type text, p_entity_type text, p_entity_id text, p_correlation_id text, p_actor_id text, p_actor_label text, p_source_system text, p_severity text, p_payload jsonb, p_external_ref text, p_idempotency_key text, p_occurred_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_record_inventory_count_v1(p_product_id uuid, p_counted_quantity numeric, p_operator_label text)
-- acl public.ops_record_inventory_count_v1(p_product_id uuid, p_counted_quantity numeric, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_record_inventory_incident_v1(p_product_id uuid, p_incident_type text, p_quantity numeric, p_operator_label text, p_note text, p_source_order_id uuid)
-- acl public.ops_record_inventory_incident_v1(p_product_id uuid, p_incident_type text, p_quantity numeric, p_operator_label text, p_note text, p_source_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_register_failed_delivery_v1(p_order_id uuid, p_reason_code text, p_note text, p_operator_label text)
-- acl public.ops_register_failed_delivery_v1(p_order_id uuid, p_reason_code text, p_note text, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_request_approval_v1(p_action_type text, p_summary text, p_risk text, p_entity_type text, p_entity_id text, p_correlation_id text, p_requested_by_type text, p_requested_by_id text, p_requested_by_label text, p_proposed_action jsonb, p_evidence jsonb, p_idempotency_key text, p_expires_at timestamp with time zone)
-- acl public.ops_request_approval_v1(p_action_type text, p_summary text, p_risk text, p_entity_type text, p_entity_id text, p_correlation_id text, p_requested_by_type text, p_requested_by_id text, p_requested_by_label text, p_proposed_action jsonb, p_evidence jsonb, p_idempotency_key text, p_expires_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_resolve_attention_v1(p_attention_id uuid, p_resolution text, p_resolution_ref text)
-- acl public.ops_resolve_attention_v1(p_attention_id uuid, p_resolution text, p_resolution_ref text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_resolve_delivery_return_review_v1(p_case_id uuid, p_action text, p_operator_label text)
-- acl public.ops_resolve_delivery_return_review_v1(p_case_id uuid, p_action text, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_scan_order_check_v1(p_session_id uuid, p_gtin text, p_quantity numeric)
-- acl public.ops_scan_order_check_v1(p_session_id uuid, p_gtin text, p_quantity numeric): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_start_order_check_v1(p_order_id uuid, p_operator_label text)
-- acl public.ops_start_order_check_v1(p_order_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_sync_delivery_payment_fiscal_trigger_v1()
-- acl public.ops_sync_delivery_payment_fiscal_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_sync_delivery_payment_fiscal_v1(p_settlement_id uuid)
-- acl public.ops_sync_delivery_payment_fiscal_v1(p_settlement_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_sync_delivery_stop_from_order_trigger_v1()
-- acl public.ops_sync_delivery_stop_from_order_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: ops_sync_delivery_stop_v1(p_order_id uuid, p_order_status text)
-- acl public.ops_sync_delivery_stop_v1(p_order_id uuid, p_order_status text): postgres=X/postgres service_role=X/postgres

-- function_grant: oscb_catalog_worker_authorized_v1(p_secret text)
-- acl public.oscb_catalog_worker_authorized_v1(p_secret text): postgres=X/postgres service_role=X/postgres

-- function_grant: oscb_reserve_gtin_lookup_v1(p_gtin text, p_capture_id uuid, p_actor_id uuid, p_daily_limit integer)
-- acl public.oscb_reserve_gtin_lookup_v1(p_gtin text, p_capture_id uuid, p_actor_id uuid, p_daily_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_cancel_draft_v2(p_draft_id uuid, p_revision integer)
-- acl public.papoai_cancel_draft_v2(p_draft_id uuid, p_revision integer): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_confirm_draft_v2(p_draft_id uuid, p_revision integer, p_summary_hash text, p_confirmed_message_id text)
-- acl public.papoai_confirm_draft_v2(p_draft_id uuid, p_revision integer, p_summary_hash text, p_confirmed_message_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_ensure_conversation_v2(p_capture_id uuid)
-- acl public.papoai_ensure_conversation_v2(p_capture_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_mark_draft_summary_v2(p_draft_id uuid, p_revision integer, p_summary_hash text, p_sent_message_id text, p_quoted_total_cents bigint)
-- acl public.papoai_mark_draft_summary_v2(p_draft_id uuid, p_revision integer, p_summary_hash text, p_sent_message_id text, p_quoted_total_cents bigint): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_normalize_capture_v2(p_capture_id uuid)
-- acl public.papoai_normalize_capture_v2(p_capture_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_normalize_pending_v2(p_limit integer)
-- acl public.papoai_normalize_pending_v2(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_prepare_product_draft_v1(p_conversation_ref text, p_phone text, p_message text, p_customer_id uuid, p_source_event_key text)
-- acl public.papoai_prepare_product_draft_v1(p_conversation_ref text, p_phone text, p_message text, p_customer_id uuid, p_source_event_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_resolve_product_intent_v1(p_query text, p_limit integer)
-- acl public.papoai_resolve_product_intent_v1(p_query text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: papoai_upsert_order_draft_v2(p_conversation_ref text, p_phone text, p_cart jsonb, p_payment_method text, p_customer_snapshot jsonb, p_delivery jsonb, p_customer_id uuid, p_source_event_key text)
-- acl public.papoai_upsert_order_draft_v2(p_conversation_ref text, p_phone text, p_cart jsonb, p_payment_method text, p_customer_snapshot jsonb, p_delivery jsonb, p_customer_id uuid, p_source_event_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: phone_variants_br(p_phone text)
-- acl public.phone_variants_br(p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: prepare_bling_invoice_issue_job_v1(p_order_id uuid, p_idempotency_key text)
-- acl public.prepare_bling_invoice_issue_job_v1(p_order_id uuid, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: prepare_purchase_stock_receipt_plan_v1(p_document_id uuid)
-- acl public.prepare_purchase_stock_receipt_plan_v1(p_document_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: preview_bling_invoice_eligibility_v1(p_order_id uuid)
-- acl public.preview_bling_invoice_eligibility_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: product_catalog_enrichment_worker_authorized_v1(p_secret text)
-- acl public.product_catalog_enrichment_worker_authorized_v1(p_secret text): postgres=X/postgres service_role=X/postgres

-- function_grant: project_bling_hub_product_sync_status_v1()
-- acl public.project_bling_hub_product_sync_status_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: purchase_xml_activate_inventory_lots_trigger_v1()
-- acl public.purchase_xml_activate_inventory_lots_trigger_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: purchase_xml_catalog_identity_immutable_v1()
-- acl public.purchase_xml_catalog_identity_immutable_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: purchase_xml_lot_evidence_expiration_v1()
-- acl public.purchase_xml_lot_evidence_expiration_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: purchase_xml_resolve_catalog_identity_v1(p_item_id uuid, p_product_id uuid, p_create_new boolean, p_proposed_name text, p_gtin_source text, p_gtin_role text, p_conversion_factor integer, p_actor_id uuid, p_confirmation text)
-- acl public.purchase_xml_resolve_catalog_identity_v1(p_item_id uuid, p_product_id uuid, p_create_new boolean, p_proposed_name text, p_gtin_source text, p_gtin_role text, p_conversion_factor integer, p_actor_id uuid, p_confirmation text): postgres=X/postgres service_role=X/postgres

-- function_grant: purchase_xml_resolve_catalog_identity_v2(p_item_id uuid, p_product_id uuid, p_create_new boolean, p_proposed_name text, p_gtin_source text, p_gtin_role text, p_conversion_factor integer, p_actor_id uuid, p_confirmation text, p_purchase_pack_units_for_review integer)
-- acl public.purchase_xml_resolve_catalog_identity_v2(p_item_id uuid, p_product_id uuid, p_create_new boolean, p_proposed_name text, p_gtin_source text, p_gtin_role text, p_conversion_factor integer, p_actor_id uuid, p_confirmation text, p_purchase_pack_units_for_review integer): postgres=X/postgres service_role=X/postgres

-- function_grant: purchase_xml_sync_inventory_lot_v1()
-- acl public.purchase_xml_sync_inventory_lot_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: recalculate_cart(p_cart_id uuid)
-- acl public.recalculate_cart(p_cart_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: reconcile_product_fiscal_strict_validation_v1()
-- acl public.reconcile_product_fiscal_strict_validation_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: reconcile_vitrine_order_customer_v1(p_customer_id uuid, p_order_suffix text, p_phone text, p_address jsonb)
-- acl public.reconcile_vitrine_order_customer_v1(p_customer_id uuid, p_order_suffix text, p_phone text, p_address jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_basket_hidden_adjustment_v1(p_basket_id uuid)
-- acl public.refresh_basket_hidden_adjustment_v1(p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_customer_purchase_profile(p_customer_id uuid)
-- acl public.refresh_customer_purchase_profile(p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_order_fiscal_readiness_v1(p_order_id uuid)
-- acl public.refresh_order_fiscal_readiness_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_candidates_r0_3()
-- acl public.refresh_product_fiscal_candidates_r0_3(): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_complex_bundle_guard_v1()
-- acl public.refresh_product_fiscal_complex_bundle_guard_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_evidence_quality_v1()
-- acl public.refresh_product_fiscal_evidence_quality_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_observed_conflicts_v1()
-- acl public.refresh_product_fiscal_observed_conflicts_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_origin_consensus_v1()
-- acl public.refresh_product_fiscal_origin_consensus_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_review_state_v1()
-- acl public.refresh_product_fiscal_review_state_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: refresh_product_fiscal_rule_integrity_v1()
-- acl public.refresh_product_fiscal_rule_integrity_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: register_admin_saved_card_transaction_v1(p_card_id uuid, p_transaction_type text, p_amount numeric, p_location text, p_idempotency_key uuid)
-- acl public.register_admin_saved_card_transaction_v1(p_card_id uuid, p_transaction_type text, p_amount numeric, p_location text, p_idempotency_key uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: register_admin_saved_card_use_v1(p_card_id uuid, p_amount numeric, p_idempotency_key uuid)
-- acl public.register_admin_saved_card_use_v1(p_card_id uuid, p_amount numeric, p_idempotency_key uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: release_bling_hub_oauth_lock_v2(p_owner uuid)
-- acl public.release_bling_hub_oauth_lock_v2(p_owner uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: release_vitrine_order_stock_v1(p_order_id uuid)
-- acl public.release_vitrine_order_stock_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: rename_storefront_v3_category(p_old text, p_new text)
-- acl public.rename_storefront_v3_category(p_old text, p_new text): postgres=X/postgres service_role=X/postgres

-- function_grant: reserve_bling_hub_rate_slot_v2(p_min_interval_ms integer)
-- acl public.reserve_bling_hub_rate_slot_v2(p_min_interval_ms integer): postgres=X/postgres service_role=X/postgres

-- function_grant: reserve_vitrine_order_stock_v1(p_order_id uuid)
-- acl public.reserve_vitrine_order_stock_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: resolve_customer_by_phone_v1(p_phone text)
-- acl public.resolve_customer_by_phone_v1(p_phone text): postgres=X/postgres service_role=X/postgres

-- function_grant: run_fiscal_ai_worker_tick_v1()
-- acl public.run_fiscal_ai_worker_tick_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: run_marketing_campaign_worker_tick_v1()
-- acl public.run_marketing_campaign_worker_tick_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: sales_quote_bling_claim_v1(p_quote_id uuid)
-- acl public.sales_quote_bling_claim_v1(p_quote_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: save_assembly_kit_v1(p_kit_id uuid, p_name text, p_type text, p_notes text, p_source_kit_id uuid, p_items jsonb, p_operator text)
-- acl public.save_assembly_kit_v1(p_kit_id uuid, p_name text, p_type text, p_notes text, p_source_kit_id uuid, p_items jsonb, p_operator text): postgres=X/postgres service_role=X/postgres

-- function_grant: save_basket_mold_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text)
-- acl public.save_basket_mold_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text): postgres=X/postgres service_role=X/postgres

-- function_grant: search_whatsapp_sellable_products_v1(p_query text, p_limit integer)
-- acl public.search_whatsapp_sellable_products_v1(p_query text, p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: set_bling_api_refresh_token_v1(p_refresh_token text)
-- acl public.set_bling_api_refresh_token_v1(p_refresh_token text): postgres=X/postgres service_role=X/postgres

-- function_grant: set_bling_hub_order_rollout_v2(p_state text, p_details jsonb, p_disable_orders boolean)
-- acl public.set_bling_hub_order_rollout_v2(p_state text, p_details jsonb, p_disable_orders boolean): postgres=X/postgres service_role=X/postgres

-- function_grant: set_cart_addon_quantity(p_cart_id uuid, p_product_id uuid, p_quantity numeric)
-- acl public.set_cart_addon_quantity(p_cart_id uuid, p_product_id uuid, p_quantity numeric): postgres=X/postgres service_role=X/postgres

-- function_grant: set_updated_at()
-- acl public.set_updated_at(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: si5_research_reserve_next()
-- acl public.si5_research_reserve_next(): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_marketing_campaign_report_summary_v1(p_campaign_id uuid)
-- acl public.site_admin_marketing_campaign_report_summary_v1(p_campaign_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_marketing_campaign_status_summary_v1(p_campaign_ids uuid[])
-- acl public.site_admin_marketing_campaign_status_summary_v1(p_campaign_ids uuid[]): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_save_basket_default_prices_v1(p_basket_prices jsonb)
-- acl public.site_admin_save_basket_default_prices_v1(p_basket_prices jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_save_basket_grid_v1(p_rows jsonb, p_operator text)
-- acl public.site_admin_save_basket_grid_v1(p_rows jsonb, p_operator text): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_save_basket_grid_with_prices_v1(p_rows jsonb, p_basket_prices jsonb, p_operator text)
-- acl public.site_admin_save_basket_grid_with_prices_v1(p_rows jsonb, p_basket_prices jsonb, p_operator text): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_save_basket_grid_with_prices_v2(p_rows jsonb, p_basket_prices jsonb, p_operator text)
-- acl public.site_admin_save_basket_grid_with_prices_v2(p_rows jsonb, p_basket_prices jsonb, p_operator text): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_save_basket_mold_shared_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text, p_share_changes jsonb)
-- acl public.site_admin_save_basket_mold_shared_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text, p_share_changes jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_save_basket_mold_shared_with_fixed_price_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text, p_share_changes jsonb, p_default_price_cents integer)
-- acl public.site_admin_save_basket_mold_shared_with_fixed_price_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text, p_share_changes jsonb, p_default_price_cents integer): postgres=X/postgres service_role=X/postgres

-- function_grant: site_admin_sync_basket_grid_public_projection_v1()
-- acl public.site_admin_sync_basket_grid_public_projection_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: site_order_number_short_v1()
-- acl public.site_order_number_short_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: site_order_whatsapp_notice_status_v1(p_order_ids uuid[])
-- acl public.site_order_whatsapp_notice_status_v1(p_order_ids uuid[]): postgres=X/postgres service_role=X/postgres

-- function_grant: site_product_taxonomy_manage_v1(p_action text, p_id uuid, p_kind text, p_name text, p_parent_id uuid)
-- acl public.site_product_taxonomy_manage_v1(p_action text, p_id uuid, p_kind text, p_name text, p_parent_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: site_product_taxonomy_sync_v1()
-- acl public.site_product_taxonomy_sync_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_admin_assign_order_v1(p_order_id uuid, p_driver_id uuid, p_operator_label text)
-- acl public.smart_delivery_admin_assign_order_v1(p_order_id uuid, p_driver_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_admin_dispatch_run_v1(p_run_id uuid, p_operator_label text)
-- acl public.smart_delivery_admin_dispatch_run_v1(p_run_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_admin_fail_stop_v1(p_stop_id uuid, p_operator_label text)
-- acl public.smart_delivery_admin_fail_stop_v1(p_stop_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_admin_reassign_stop_v1(p_stop_id uuid, p_new_driver_id uuid, p_operator_label text)
-- acl public.smart_delivery_admin_reassign_stop_v1(p_stop_id uuid, p_new_driver_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_admin_release_stop_v1(p_stop_id uuid, p_service_date date, p_operator_label text)
-- acl public.smart_delivery_admin_release_stop_v1(p_stop_id uuid, p_service_date date, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_apply_optimization_v1(p_run_id uuid, p_result jsonb)
-- acl public.smart_delivery_apply_optimization_v1(p_run_id uuid, p_result jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_assign_run_v1(p_run_id uuid, p_region_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_operator_label text, p_actor_user_id uuid)
-- acl public.smart_delivery_assign_run_v1(p_run_id uuid, p_region_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_operator_label text, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_catalog_v1()
-- acl public.smart_delivery_catalog_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_complete_stop_v1(p_stop_id uuid, p_method text, p_amount_cents bigint, p_operator_label text, p_idempotency_key text)
-- acl public.smart_delivery_complete_stop_v1(p_stop_id uuid, p_method text, p_amount_cents bigint, p_operator_label text, p_idempotency_key text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_confirm_loading_v1(p_run_id uuid, p_stop_id uuid, p_actor_user_id uuid)
-- acl public.smart_delivery_confirm_loading_v1(p_run_id uuid, p_stop_id uuid, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_confirm_location_v1(p_order_id uuid, p_customer_address_id uuid, p_location_evidence_id uuid, p_region_id uuid, p_confirmation_source text, p_actor_user_id uuid)
-- acl public.smart_delivery_confirm_location_v1(p_order_id uuid, p_customer_address_id uuid, p_location_evidence_id uuid, p_region_id uuid, p_confirmation_source text, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_confirm_order_location_v1(p_order_id uuid, p_location_evidence_id uuid, p_region_id uuid, p_confirmation_source text, p_actor_user_id uuid)
-- acl public.smart_delivery_confirm_order_location_v1(p_order_id uuid, p_location_evidence_id uuid, p_region_id uuid, p_confirmation_source text, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_dispatch_run_v1(p_run_id uuid, p_operator_label text)
-- acl public.smart_delivery_dispatch_run_v1(p_run_id uuid, p_operator_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_driver_save_location_v1(p_stop_id uuid, p_driver_id uuid, p_latitude numeric, p_longitude numeric, p_accuracy_m numeric, p_mode text, p_label text)
-- acl public.smart_delivery_driver_save_location_v1(p_stop_id uuid, p_driver_id uuid, p_latitude numeric, p_longitude numeric, p_accuracy_m numeric, p_mode text, p_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_driver_save_v1(p_id uuid, p_name text, p_phone_e164 text, p_home_region_id uuid, p_is_active boolean, p_metadata jsonb, p_actor_user_id uuid)
-- acl public.smart_delivery_driver_save_v1(p_id uuid, p_name text, p_phone_e164 text, p_home_region_id uuid, p_is_active boolean, p_metadata jsonb, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_driver_select_location_v1(p_stop_id uuid, p_driver_id uuid, p_location_evidence_id uuid)
-- acl public.smart_delivery_driver_select_location_v1(p_stop_id uuid, p_driver_id uuid, p_location_evidence_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_guard_route_resequence_v1()
-- acl public.smart_delivery_guard_route_resequence_v1(): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_move_stop_v1(p_stop_id uuid, p_target_run_id uuid, p_actor_user_id uuid)
-- acl public.smart_delivery_move_stop_v1(p_stop_id uuid, p_target_run_id uuid, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_plan_run_v1(p_vehicle_key text, p_order_ids uuid[], p_operator_label text, p_region_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_actor_user_id uuid)
-- acl public.smart_delivery_plan_run_v1(p_vehicle_key text, p_order_ids uuid[], p_operator_label text, p_region_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_prepare_optimization_v1(p_run_id uuid)
-- acl public.smart_delivery_prepare_optimization_v1(p_run_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_region_save_v1(p_id uuid, p_code text, p_name text, p_city text, p_state text, p_priority integer, p_is_active boolean, p_notes text, p_polygon_geojson jsonb, p_actor_user_id uuid)
-- acl public.smart_delivery_region_save_v1(p_id uuid, p_code text, p_name text, p_city text, p_state text, p_priority integer, p_is_active boolean, p_notes text, p_polygon_geojson jsonb, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_reorder_stops_v1(p_run_id uuid, p_stop_ids uuid[], p_actor_label text)
-- acl public.smart_delivery_reorder_stops_v1(p_run_id uuid, p_stop_ids uuid[], p_actor_label text): postgres=X/postgres service_role=X/postgres

-- function_grant: smart_delivery_vehicle_save_v1(p_id uuid, p_label text, p_plate text, p_vehicle_type text, p_capacity_units integer, p_is_active boolean, p_metadata jsonb, p_actor_user_id uuid)
-- acl public.smart_delivery_vehicle_save_v1(p_id uuid, p_label text, p_plate text, p_vehicle_type text, p_capacity_units integer, p_is_active boolean, p_metadata jsonb, p_actor_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: start_basket_cart(p_conversation_id uuid, p_basket_id uuid)
-- acl public.start_basket_cart(p_conversation_id uuid, p_basket_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: storefront_order_unit_price_v1(p_price numeric, p_offer_price numeric, p_is_offer boolean, p_metadata jsonb, p_at timestamp with time zone)
-- acl public.storefront_order_unit_price_v1(p_price numeric, p_offer_price numeric, p_is_offer boolean, p_metadata jsonb, p_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: supabase_stock_pending_reservations_v1(p_product_id uuid, p_exclude_order_id uuid)
-- acl public.supabase_stock_pending_reservations_v1(p_product_id uuid, p_exclude_order_id uuid): =X/postgres postgres=X/postgres service_role=X/postgres

-- function_grant: sync_site_basket_type_after_product_unavailable_v1()
-- acl public.sync_site_basket_type_after_product_unavailable_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: sync_vitrine_order_fiscal_delivery_v1(p_order_id uuid)
-- acl public.sync_vitrine_order_fiscal_delivery_v1(p_order_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: sync_vitrine_order_stock_reservation_v1()
-- acl public.sync_vitrine_order_stock_reservation_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: trg_refresh_basket_hidden_adjustment_on_price_v1()
-- acl public.trg_refresh_basket_hidden_adjustment_on_price_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: trg_refresh_basket_hidden_adjustment_v1()
-- acl public.trg_refresh_basket_hidden_adjustment_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: trg_snapshot_cart_hidden_adjustment_v1()
-- acl public.trg_snapshot_cart_hidden_adjustment_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: trg_snapshot_order_hidden_adjustment_v1()
-- acl public.trg_snapshot_order_hidden_adjustment_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: update_admin_saved_card_v1(p_card_id uuid, p_name text, p_brand text, p_initial_value numeric, p_credit_added_on date, p_card_password text)
-- acl public.update_admin_saved_card_v1(p_card_id uuid, p_name text, p_brand text, p_initial_value numeric, p_credit_added_on date, p_card_password text): postgres=X/postgres service_role=X/postgres

-- function_grant: validate_basket_flow_selection_v1(p_basket_id uuid, p_selection jsonb)
-- acl public.validate_basket_flow_selection_v1(p_basket_id uuid, p_selection jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: verify_admin_pin_access_v1(p_pin text, p_fingerprint text)
-- acl public.verify_admin_pin_access_v1(p_pin text, p_fingerprint text): postgres=X/postgres service_role=X/postgres

-- function_grant: verify_purchase_stock_receipt_plan_v1(p_document_id uuid, p_user_id uuid)
-- acl public.verify_purchase_stock_receipt_plan_v1(p_document_id uuid, p_user_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: vitrine_stock_allocate_fifo_v1(p_reservation_id uuid)
-- acl public.vitrine_stock_allocate_fifo_v1(p_reservation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: vitrine_stock_consume_fifo_v1(p_reservation_id uuid)
-- acl public.vitrine_stock_consume_fifo_v1(p_reservation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: vitrine_stock_release_fifo_v1(p_reservation_id uuid)
-- acl public.vitrine_stock_release_fifo_v1(p_reservation_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: vitrine_stock_reservation_lot_delete_v1()
-- acl public.vitrine_stock_reservation_lot_delete_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: vitrine_stock_reservation_lot_sync_v1()
-- acl public.vitrine_stock_reservation_lot_sync_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_address_line_v1(p_address jsonb)
-- acl public.whatsapp_address_line_v1(p_address jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_apply_template_event_v1(p_waba_id text, p_meta_template_id text, p_template_name text, p_language text, p_event_type text, p_status text, p_quality_rating text, p_reason text, p_provider_event_key text, p_payload jsonb, p_occurred_at timestamp with time zone)
-- acl public.whatsapp_apply_template_event_v1(p_waba_id text, p_meta_template_id text, p_template_name text, p_language text, p_event_type text, p_status text, p_quality_rating text, p_reason text, p_provider_event_key text, p_payload jsonb, p_occurred_at timestamp with time zone): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_enqueue_outbound_v1(p_idempotency_key text, p_whatsapp_account_id uuid, p_conversation_id uuid, p_customer_id uuid, p_to_phone_e164 text, p_purpose text, p_message_type text, p_payload jsonb, p_sender_kind text, p_template_id uuid)
-- acl public.whatsapp_enqueue_outbound_v1(p_idempotency_key text, p_whatsapp_account_id uuid, p_conversation_id uuid, p_customer_id uuid, p_to_phone_e164 text, p_purpose text, p_message_type text, p_payload jsonb, p_sender_kind text, p_template_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_flow_private_key_resolve_v1(p_account_slug text)
-- acl public.whatsapp_flow_private_key_resolve_v1(p_account_slug text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_flow_session_open_v1(p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_meta_flow_id text, p_flow_schema_version text, p_basket_template_id uuid, p_basket_mold_id uuid, p_sender_phone_e164 text, p_token_hash text, p_snapshot jsonb, p_conversation_id uuid, p_customer_id uuid)
-- acl public.whatsapp_flow_session_open_v1(p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_meta_flow_id text, p_flow_schema_version text, p_basket_template_id uuid, p_basket_mold_id uuid, p_sender_phone_e164 text, p_token_hash text, p_snapshot jsonb, p_conversation_id uuid, p_customer_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_flow_session_resolve_v1(p_token_hash text)
-- acl public.whatsapp_flow_session_resolve_v1(p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_flow_session_revoke_v1(p_session_id uuid)
-- acl public.whatsapp_flow_session_revoke_v1(p_session_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_identity_review_ack_v1(p_event_id uuid)
-- acl public.whatsapp_identity_review_ack_v1(p_event_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_identity_reviews_admin_list_v1(p_state text, p_limit integer)
-- acl public.whatsapp_identity_reviews_admin_list_v1(p_state text, p_limit integer): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_ingest_event_v1(p_whatsapp_account_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_provider_message_id text, p_phone_e164 text, p_received_at timestamp with time zone, p_payload_hash text, p_payload jsonb, p_message jsonb)
-- acl public.whatsapp_ingest_event_v1(p_whatsapp_account_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_provider_message_id text, p_phone_e164 text, p_received_at timestamp with time zone, p_payload_hash text, p_payload jsonb, p_message jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_confirmation_claim_v1(p_outbox_id uuid)
-- acl public.whatsapp_order_confirmation_claim_v1(p_outbox_id uuid): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_confirmation_finish_v1(p_outbox_id uuid, p_outcome text, p_provider_message_id text, p_error_code text)
-- acl public.whatsapp_order_confirmation_finish_v1(p_outbox_id uuid, p_outcome text, p_provider_message_id text, p_error_code text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_flow_send_admin_list_v1(p_conversation_id uuid)
-- acl public.whatsapp_order_flow_send_admin_list_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_order_flow_send_finish_v1(p_attempt_id uuid, p_status text, p_provider_message_id text, p_error_code text)
-- acl public.whatsapp_order_flow_send_finish_v1(p_attempt_id uuid, p_status text, p_provider_message_id text, p_error_code text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_flow_send_mark_sending_v1(p_attempt_id uuid, p_session_id uuid, p_token_hash text)
-- acl public.whatsapp_order_flow_send_mark_sending_v1(p_attempt_id uuid, p_session_id uuid, p_token_hash text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_flow_send_prepare_admin_v1(p_idempotency_key uuid, p_conversation_id uuid, p_basket_template_id uuid)
-- acl public.whatsapp_order_flow_send_prepare_admin_v1(p_idempotency_key uuid, p_conversation_id uuid, p_basket_template_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_order_intent_catalog_confirmation_prepare_admin_v1(p_intent_id uuid)
-- acl public.whatsapp_order_intent_catalog_confirmation_prepare_admin_v1(p_intent_id uuid): postgres=X/postgres authenticated=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_intent_catalog_prepare_admin_v1(p_intent_id uuid, p_payment_method text, p_customer_name text, p_address_id uuid, p_new_address jsonb)
-- acl public.whatsapp_order_intent_catalog_prepare_admin_v1(p_intent_id uuid, p_payment_method text, p_customer_name text, p_address_id uuid, p_new_address jsonb): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_order_intent_confirm_v1(p_intent_id uuid, p_confirmation_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_conversation_id uuid, p_inbound_message_id text, p_reply_to_message_id text, p_confirmation_token_hash text, p_sender_phone_e164 text, p_sender_provider_id text)
-- acl public.whatsapp_order_intent_confirm_v1(p_intent_id uuid, p_confirmation_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_conversation_id uuid, p_inbound_message_id text, p_reply_to_message_id text, p_confirmation_token_hash text, p_sender_phone_e164 text, p_sender_provider_id text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_intent_ingest_v1(p_source_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_meta_message_id text, p_source_kind text, p_sender_provider_id text, p_sender_phone_e164 text, p_catalog_id text, p_flow_name text, p_flow_session_id uuid, p_flow_reply_to_message_id text, p_flow_schema_version text, p_intake_snapshot jsonb, p_conversation_id uuid, p_customer_id uuid, p_ingress_issue_code text)
-- acl public.whatsapp_order_intent_ingest_v1(p_source_event_id uuid, p_whatsapp_account_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_meta_message_id text, p_source_kind text, p_sender_provider_id text, p_sender_phone_e164 text, p_catalog_id text, p_flow_name text, p_flow_session_id uuid, p_flow_reply_to_message_id text, p_flow_schema_version text, p_intake_snapshot jsonb, p_conversation_id uuid, p_customer_id uuid, p_ingress_issue_code text): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_intent_origins_admin_v1(p_order_ids uuid[])
-- acl public.whatsapp_order_intent_origins_admin_v1(p_order_ids uuid[]): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_order_intent_prepare_confirmation_v1(p_intent_id uuid, p_confirmation_token_hash text, p_summary_hash text, p_confirmation_payload jsonb)
-- acl public.whatsapp_order_intent_prepare_confirmation_v1(p_intent_id uuid, p_confirmation_token_hash text, p_summary_hash text, p_confirmation_payload jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_order_intents_admin_list_v1(p_conversation_id uuid)
-- acl public.whatsapp_order_intents_admin_list_v1(p_conversation_id uuid): postgres=X/postgres service_role=X/postgres authenticated=X/postgres

-- function_grant: whatsapp_papoai_guard_buffer_v1(p_payload jsonb)
-- acl public.whatsapp_papoai_guard_buffer_v1(p_payload jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_papoai_guard_drain_v1(p_limit integer)
-- acl public.whatsapp_papoai_guard_drain_v1(p_limit integer): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_papoai_guard_set_v1(p_active boolean, p_minutes integer)
-- acl public.whatsapp_papoai_guard_set_v1(p_active boolean, p_minutes integer): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_papoai_guard_status_v1()
-- acl public.whatsapp_papoai_guard_status_v1(): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_record_status_v1(p_whatsapp_account_id uuid, p_provider text, p_provider_message_id text, p_status text, p_occurred_at timestamp with time zone, p_received_at timestamp with time zone, p_error_code text, p_error_title text, p_error_detail text, p_payload jsonb)
-- acl public.whatsapp_record_status_v1(p_whatsapp_account_id uuid, p_provider text, p_provider_message_id text, p_status text, p_occurred_at timestamp with time zone, p_received_at timestamp with time zone, p_error_code text, p_error_title text, p_error_detail text, p_payload jsonb): postgres=X/postgres service_role=X/postgres

-- function_grant: whatsapp_resolve_conversation_v1(p_whatsapp_account_id uuid, p_phone_e164 text, p_customer_id uuid, p_source text)
-- acl public.whatsapp_resolve_conversation_v1(p_whatsapp_account_id uuid, p_phone_e164 text, p_customer_id uuid, p_source text): postgres=X/postgres service_role=X/postgres
