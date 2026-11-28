-- trigger: basket_mold_position_options.basket_mold_position_options_limit_v1
CREATE TRIGGER basket_mold_position_options_limit_v1 BEFORE INSERT ON basket_mold_position_options FOR EACH ROW EXECUTE FUNCTION enforce_basket_mold_position_option_limit_v1();

-- trigger: basket_template_items.basket_items_hidden_adjustment_v1
CREATE TRIGGER basket_items_hidden_adjustment_v1 AFTER INSERT OR DELETE OR UPDATE OF quantity, product_id ON basket_template_items FOR EACH ROW EXECUTE FUNCTION trg_refresh_basket_hidden_adjustment_v1();

-- trigger: basket_template_items.trg_basket_template_items_updated_at
CREATE TRIGGER trg_basket_template_items_updated_at BEFORE UPDATE ON basket_template_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- trigger: basket_templates.basket_price_hidden_adjustment_v1
CREATE TRIGGER basket_price_hidden_adjustment_v1 AFTER UPDATE OF base_price ON basket_templates FOR EACH ROW WHEN (old.base_price IS DISTINCT FROM new.base_price) EXECUTE FUNCTION trg_refresh_basket_hidden_adjustment_on_price_v1();

-- trigger: basket_templates.set_basket_templates_updated_at
CREATE TRIGGER set_basket_templates_updated_at BEFORE UPDATE ON basket_templates FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: bling_hub_entity_links_v2.bling_product_link_stock_outbox_v1
CREATE TRIGGER bling_product_link_stock_outbox_v1 AFTER INSERT OR UPDATE OF bling_id, status ON bling_hub_entity_links_v2 FOR EACH ROW EXECUTE FUNCTION enqueue_bling_stock_after_product_link_v1();

-- trigger: bling_hub_jobs_v2.bling_product_job_sync_status_v1
CREATE TRIGGER bling_product_job_sync_status_v1 AFTER UPDATE OF status ON bling_hub_jobs_v2 FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION project_bling_hub_product_sync_status_v1();

-- trigger: bling_hub_jobs_v2.trg_bling_hub_customer_creation_guard_v1
CREATE TRIGGER trg_bling_hub_customer_creation_guard_v1 BEFORE INSERT OR UPDATE OF payload, domain, operation, source_id ON bling_hub_jobs_v2 FOR EACH ROW EXECUTE FUNCTION bling_hub_customer_creation_guard_v1();

-- trigger: bling_hub_runtime_v2.force_supabase_stock_authority_v1
CREATE TRIGGER force_supabase_stock_authority_v1 BEFORE INSERT OR UPDATE OF metadata ON bling_hub_runtime_v2 FOR EACH ROW EXECUTE FUNCTION force_supabase_stock_authority_v1();

-- trigger: bling_webhook_inbox_v2.trg_ops2_virtual_stock_shadow_v1
CREATE TRIGGER trg_ops2_virtual_stock_shadow_v1 AFTER INSERT ON bling_webhook_inbox_v2 FOR EACH ROW EXECUTE FUNCTION ops2_apply_virtual_stock_webhook_shadow_v1();

-- trigger: carts.carts_snapshot_hidden_adjustment_v1
CREATE TRIGGER carts_snapshot_hidden_adjustment_v1 BEFORE INSERT OR UPDATE OF basket_id ON carts FOR EACH ROW EXECUTE FUNCTION trg_snapshot_cart_hidden_adjustment_v1();

-- trigger: carts.set_carts_updated_at
CREATE TRIGGER set_carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: catalog_sessions.guard_web_existing_customer_binding_v1
CREATE TRIGGER guard_web_existing_customer_binding_v1 BEFORE UPDATE OF customer_id ON catalog_sessions FOR EACH ROW EXECUTE FUNCTION guard_web_existing_customer_binding_v1();

-- trigger: conversations.set_conversations_updated_at
CREATE TRIGGER set_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: customer_addresses.trg_customer_addresses_updated_at
CREATE TRIGGER trg_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- trigger: customer_addresses.trg_ops2_customer_address_number_fill_v1
CREATE TRIGGER trg_ops2_customer_address_number_fill_v1 BEFORE INSERT OR UPDATE OF street, number ON customer_addresses FOR EACH ROW EXECUTE FUNCTION ops2_customer_address_number_fill_v1();

-- trigger: customer_addresses.trg_ops2_customer_address_registration_journey_v1
CREATE TRIGGER trg_ops2_customer_address_registration_journey_v1 AFTER INSERT OR DELETE OR UPDATE OF customer_id, street, city, is_active ON customer_addresses FOR EACH ROW EXECUTE FUNCTION ops2_customer_address_registration_journey_trigger_v1();

-- trigger: customer_phones.customer_phone_primary_guard
CREATE TRIGGER customer_phone_primary_guard BEFORE INSERT OR UPDATE OF customer_id, phone_e164, is_primary ON customer_phones FOR EACH ROW EXECUTE FUNCTION customer_phone_primary_guard();

-- trigger: customers.customers_link_unclaimed_orders_v2
CREATE TRIGGER customers_link_unclaimed_orders_v2 AFTER INSERT OR UPDATE OF primary_whatsapp_e164 ON customers FOR EACH ROW EXECUTE FUNCTION customers_link_unclaimed_orders_v2();

-- trigger: customers.marketing_capture_direct_customer_consent_change_v1
CREATE TRIGGER marketing_capture_direct_customer_consent_change_v1 AFTER UPDATE OF marketing_opt_in ON customers FOR EACH ROW WHEN (old.marketing_opt_in IS DISTINCT FROM new.marketing_opt_in) EXECUTE FUNCTION marketing_capture_direct_customer_consent_change_v1();

-- trigger: customers.set_customers_updated_at
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: customers.trg_marketing_repurchase_customer_v1
CREATE TRIGGER trg_marketing_repurchase_customer_v1 AFTER UPDATE OF marketing_opt_in, primary_whatsapp_e164 ON customers FOR EACH ROW EXECUTE FUNCTION marketing_repurchase_customer_trigger_v1();

-- trigger: customers.trg_ops2_customer_registration_journey_v1
CREATE TRIGGER trg_ops2_customer_registration_journey_v1 AFTER UPDATE OF name, cpf_cnpj, primary_whatsapp_e164 ON customers FOR EACH ROW EXECUTE FUNCTION ops2_customer_registration_journey_trigger_v1();

-- trigger: dispatch_fiscal_jobs.trg_ops2_guard_dispatch_fiscal_job_v1
CREATE TRIGGER trg_ops2_guard_dispatch_fiscal_job_v1 BEFORE INSERT OR UPDATE ON dispatch_fiscal_jobs FOR EACH ROW EXECUTE FUNCTION ops2_guard_dispatch_fiscal_job_v1();

-- trigger: fiscal_runtime_config.trg_ops2_guard_fiscal_runtime_arm_v1
CREATE TRIGGER trg_ops2_guard_fiscal_runtime_arm_v1 BEFORE INSERT OR UPDATE OF dispatch_fiscal_canary_enabled, dispatch_invoice_generate_enabled, dispatch_invoice_authorize_enabled, dispatch_invoice_canary_source_order_id ON fiscal_runtime_config FOR EACH ROW EXECUTE FUNCTION ops2_guard_fiscal_runtime_arm_v1();

-- trigger: marketing_campaign_dispatches_v1.marketing_campaign_dispatch_identity_guard_v1
CREATE TRIGGER marketing_campaign_dispatch_identity_guard_v1 BEFORE UPDATE ON marketing_campaign_dispatches_v1 FOR EACH ROW EXECUTE FUNCTION marketing_campaign_dispatch_identity_guard_v1();

-- trigger: marketing_campaign_events_v1.marketing_campaign_events_v1_append_only
CREATE TRIGGER marketing_campaign_events_v1_append_only BEFORE DELETE OR UPDATE ON marketing_campaign_events_v1 FOR EACH ROW EXECUTE FUNCTION marketing_campaign_append_only_guard_v1();

-- trigger: marketing_campaign_snapshot_recipients_v1.marketing_campaign_snapshot_recipients_v1_append_only
CREATE TRIGGER marketing_campaign_snapshot_recipients_v1_append_only BEFORE DELETE OR UPDATE ON marketing_campaign_snapshot_recipients_v1 FOR EACH ROW EXECUTE FUNCTION marketing_campaign_append_only_guard_v1();

-- trigger: marketing_campaign_snapshots_v1.marketing_campaign_snapshots_v1_append_only
CREATE TRIGGER marketing_campaign_snapshots_v1_append_only BEFORE DELETE OR UPDATE ON marketing_campaign_snapshots_v1 FOR EACH ROW EXECUTE FUNCTION marketing_campaign_append_only_guard_v1();

-- trigger: marketing_consent_events_v1.marketing_consent_events_append_only_guard_v1
CREATE TRIGGER marketing_consent_events_append_only_guard_v1 BEFORE DELETE OR UPDATE ON marketing_consent_events_v1 FOR EACH ROW EXECUTE FUNCTION marketing_consent_events_append_only_guard_v1();

-- trigger: marketing_strategy_events_v1.marketing_strategy_events_v1_immutable
CREATE TRIGGER marketing_strategy_events_v1_immutable BEFORE DELETE OR UPDATE ON marketing_strategy_events_v1 FOR EACH ROW EXECUTE FUNCTION marketing_strategy_events_immutable_v1();

-- trigger: ops2_customer_registration_journeys_v1.trg_ops2_registration_journey_outbound_intent_v1
CREATE TRIGGER trg_ops2_registration_journey_outbound_intent_v1 AFTER INSERT OR UPDATE OF registration_state, workflow_open, transition_seq ON ops2_customer_registration_journeys_v1 FOR EACH ROW EXECUTE FUNCTION ops2_registration_journey_outbound_intent_trigger_v1();

-- trigger: ops_delivery_stops.smart_delivery_guard_route_resequence_v1
CREATE TRIGGER smart_delivery_guard_route_resequence_v1 BEFORE UPDATE OF run_id, sequence ON ops_delivery_stops FOR EACH ROW EXECUTE FUNCTION smart_delivery_guard_route_resequence_v1();

-- trigger: order_items.trg_attendance_product_interest_items_v1
CREATE TRIGGER trg_attendance_product_interest_items_v1 AFTER INSERT OR DELETE OR UPDATE OF order_id, product_id ON order_items FOR EACH ROW EXECUTE FUNCTION ops2_attendance_product_interest_item_trigger_v1();

-- trigger: order_items.trg_order_item_public_snapshot_v1
CREATE CONSTRAINT TRIGGER trg_order_item_public_snapshot_v1 AFTER INSERT ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ops2_order_item_public_snapshot_trigger_v1();

-- trigger: order_items.trg_order_items_updated_at
CREATE TRIGGER trg_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- trigger: order_payment_settlements.trg_ops_sync_delivery_payment_fiscal_v1
CREATE TRIGGER trg_ops_sync_delivery_payment_fiscal_v1 AFTER INSERT OR UPDATE OF status, captured_total_cents ON order_payment_settlements FOR EACH ROW EXECUTE FUNCTION ops_sync_delivery_payment_fiscal_trigger_v1();

-- trigger: order_separation_completions_v1.trg_ops2_require_separator_completion_v4
CREATE TRIGGER trg_ops2_require_separator_completion_v4 BEFORE INSERT OR UPDATE OF separator_key ON order_separation_completions_v1 FOR EACH ROW EXECUTE FUNCTION ops2_require_separator_completion_v4();

-- trigger: order_separation_completions_v1.trg_order_addon_close_on_separation_completion_v1
CREATE TRIGGER trg_order_addon_close_on_separation_completion_v1 AFTER INSERT ON order_separation_completions_v1 FOR EACH ROW EXECUTE FUNCTION private.order_addon_separation_close_trigger_v1();

-- trigger: order_separation_items_v1.trg_order_addon_close_on_separation_item_v1
CREATE TRIGGER trg_order_addon_close_on_separation_item_v1 AFTER INSERT ON order_separation_items_v1 FOR EACH ROW EXECUTE FUNCTION private.order_addon_separation_close_trigger_v1();

-- trigger: orders.marketing_attribute_order_after_write_v1
CREATE TRIGGER marketing_attribute_order_after_write_v1 AFTER INSERT OR UPDATE OF customer_id, confirmed_at ON orders FOR EACH ROW EXECUTE FUNCTION marketing_attribute_order_trigger_v1();

-- trigger: orders.orders_snapshot_hidden_adjustment_v1
CREATE TRIGGER orders_snapshot_hidden_adjustment_v1 BEFORE INSERT OR UPDATE OF cart_id ON orders FOR EACH ROW EXECUTE FUNCTION trg_snapshot_order_hidden_adjustment_v1();

-- trigger: orders.set_orders_updated_at
CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: orders.trg_attendance_delivery_day_labels_v1
CREATE TRIGGER trg_attendance_delivery_day_labels_v1 AFTER INSERT OR DELETE OR UPDATE OF conversation_id, status, delivery_address, checkout_snapshot ON orders FOR EACH ROW EXECUTE FUNCTION ops2_attendance_orders_refresh_delivery_labels_trigger_v1();

-- trigger: orders.trg_attendance_product_interest_order_v1
CREATE TRIGGER trg_attendance_product_interest_order_v1 AFTER INSERT OR DELETE OR UPDATE OF status, customer_id, cancelled_at, returned_at ON orders FOR EACH ROW EXECUTE FUNCTION ops2_attendance_product_interest_order_trigger_v1();

-- trigger: orders.trg_enforce_storefront_checkout_basics_v1
CREATE TRIGGER trg_enforce_storefront_checkout_basics_v1 BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION enforce_storefront_checkout_basics_v1();

-- trigger: orders.trg_marketing_repurchase_order_v1
CREATE TRIGGER trg_marketing_repurchase_order_v1 AFTER INSERT OR UPDATE OF customer_id, confirmed_at, cancelled_at, status ON orders FOR EACH ROW EXECUTE FUNCTION marketing_repurchase_order_trigger_v1();

-- trigger: orders.trg_ops2_enqueue_storefront_order_whatsapp_v1
CREATE TRIGGER trg_ops2_enqueue_storefront_order_whatsapp_v1 AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION ops2_enqueue_storefront_order_whatsapp_v1();

-- trigger: orders.trg_ops2_order_delivery_number_fill_v1
CREATE TRIGGER trg_ops2_order_delivery_number_fill_v1 BEFORE INSERT OR UPDATE OF delivery_address ON orders FOR EACH ROW EXECUTE FUNCTION ops2_order_delivery_number_fill_v1();

-- trigger: orders.trg_ops2_order_registration_journey_v1
CREATE TRIGGER trg_ops2_order_registration_journey_v1 AFTER INSERT OR UPDATE OF customer_id, status, source ON orders FOR EACH ROW EXECUTE FUNCTION ops2_order_registration_journey_trigger_v1();

-- trigger: orders.trg_ops2_orders_ensure_site_customer_v1
CREATE TRIGGER trg_ops2_orders_ensure_site_customer_v1 BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION ops2_orders_ensure_site_customer_v1();

-- trigger: orders.trg_ops2_refresh_storefront_order_whatsapp_v1
CREATE TRIGGER trg_ops2_refresh_storefront_order_whatsapp_v1 AFTER UPDATE OF conversation_id, whatsapp_account_id, customer_id, phone_e164 ON orders FOR EACH ROW EXECUTE FUNCTION ops2_refresh_storefront_order_whatsapp_v1();

-- trigger: orders.trg_ops3_enqueue_confirmed_storefront_v1
CREATE TRIGGER trg_ops3_enqueue_confirmed_storefront_v1 AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (new.status = 'confirmed'::text AND old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION ops3_enqueue_confirmed_storefront_v1();

-- trigger: orders.trg_ops_enforce_delivery_payment_before_delivered_v1
CREATE TRIGGER trg_ops_enforce_delivery_payment_before_delivered_v1 BEFORE UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION ops_enforce_delivery_payment_before_delivered_v1();

-- trigger: orders.trg_ops_enforce_order_check_before_ready_v1
CREATE TRIGGER trg_ops_enforce_order_check_before_ready_v1 BEFORE UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION ops_enforce_order_check_before_ready_v1();

-- trigger: orders.trg_ops_sync_delivery_stop_from_order_v1
CREATE TRIGGER trg_ops_sync_delivery_stop_from_order_v1 AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION ops_sync_delivery_stop_from_order_trigger_v1();

-- trigger: orders.trg_order_addon_close_on_order_advance_v1
CREATE TRIGGER trg_order_addon_close_on_order_advance_v1 AFTER UPDATE OF status, confirmed_at, bling_order_id, bling_synced_at, sync_status ON orders FOR EACH ROW EXECUTE FUNCTION private.order_addon_orders_close_trigger_v1();

-- trigger: orders.trg_orders_fiscal_dispatch_gate_v1
CREATE TRIGGER trg_orders_fiscal_dispatch_gate_v1 BEFORE UPDATE OF status ON orders FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION enforce_order_dispatch_fiscal_gate_trigger_v1();

-- trigger: orders.trg_site_order_number_short_v1
CREATE TRIGGER trg_site_order_number_short_v1 BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION site_order_number_short_v1();

-- trigger: orders.trg_sync_vitrine_order_stock_reservation_v1
CREATE TRIGGER trg_sync_vitrine_order_stock_reservation_v1 AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION sync_vitrine_order_stock_reservation_v1();

-- trigger: papoai_webhook_inbox_v2.trg_marketing_capture_optout_v1
CREATE TRIGGER trg_marketing_capture_optout_v1 AFTER INSERT OR UPDATE OF status, event_name, phone_candidate, payload ON papoai_webhook_inbox_v2 FOR EACH ROW EXECUTE FUNCTION marketing_capture_optout_v1();

-- trigger: papoai_webhook_inbox_v2.trg_ops2_auto_process_papoai_flow_v2
CREATE TRIGGER trg_ops2_auto_process_papoai_flow_v2 AFTER UPDATE OF status, event_name ON papoai_webhook_inbox_v2 FOR EACH ROW EXECUTE FUNCTION ops2_auto_process_papoai_flow_v2();

-- trigger: papoai_webhook_inbox_v2.trg_ops2_papoai_capture_order_link_v1
CREATE TRIGGER trg_ops2_papoai_capture_order_link_v1 AFTER UPDATE OF metadata ON papoai_webhook_inbox_v2 FOR EACH ROW EXECUTE FUNCTION ops2_papoai_capture_order_link_trigger_v1();

-- trigger: products.products_bling_catalog_outbox_v1
CREATE TRIGGER products_bling_catalog_outbox_v1 AFTER INSERT OR UPDATE OF name, sku, gtin, ncm, price, brand, unit, description_short, description_long, is_active, metadata ON products FOR EACH ROW EXECUTE FUNCTION enqueue_bling_hub_product_outbox_v1();

-- trigger: products.products_bling_stock_outbox_v1
CREATE TRIGGER products_bling_stock_outbox_v1 AFTER INSERT OR UPDATE OF stock ON products FOR EACH ROW EXECUTE FUNCTION enqueue_bling_hub_stock_outbox_v1();

-- trigger: products.products_enqueue_xml_catalog_enrichment_v1
CREATE TRIGGER products_enqueue_xml_catalog_enrichment_v1 AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION enqueue_new_xml_product_catalog_enrichment_v1();

-- trigger: products.products_mark_xml_catalog_enrichment_v1
CREATE TRIGGER products_mark_xml_catalog_enrichment_v1 BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION mark_new_xml_product_for_catalog_enrichment_v1();

-- trigger: products.set_products_updated_at
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: products.trg_products_zero_stock_inactive
CREATE TRIGGER trg_products_zero_stock_inactive BEFORE INSERT OR UPDATE OF stock, is_active ON products FOR EACH ROW EXECUTE FUNCTION enforce_zero_stock_inactive();

-- trigger: products.trg_site_basket_type_after_product_unavailable
CREATE TRIGGER trg_site_basket_type_after_product_unavailable AFTER UPDATE OF stock, is_active ON products FOR EACH ROW EXECUTE FUNCTION sync_site_basket_type_after_product_unavailable_v1();

-- trigger: purchase_stock_receipt_plans_v1.purchase_receipt_plan_activate_inventory_lots_v1
CREATE TRIGGER purchase_receipt_plan_activate_inventory_lots_v1 AFTER INSERT OR UPDATE ON purchase_stock_receipt_plans_v1 FOR EACH ROW EXECUTE FUNCTION purchase_xml_activate_inventory_lots_trigger_v1();

-- trigger: purchase_stock_receipts.purchase_receipt_activate_inventory_lots_v1
CREATE TRIGGER purchase_receipt_activate_inventory_lots_v1 AFTER INSERT OR UPDATE ON purchase_stock_receipts FOR EACH ROW EXECUTE FUNCTION purchase_xml_activate_inventory_lots_trigger_v1();

-- trigger: purchase_xml_catalog_identity_actions_v1.purchase_xml_catalog_identity_immutable_v1
CREATE TRIGGER purchase_xml_catalog_identity_immutable_v1 BEFORE DELETE OR UPDATE ON purchase_xml_catalog_identity_actions_v1 FOR EACH ROW EXECUTE FUNCTION purchase_xml_catalog_identity_immutable_v1();

-- trigger: purchase_xml_item_lot_evidence.purchase_xml_lot_evidence_expiration_v1
CREATE TRIGGER purchase_xml_lot_evidence_expiration_v1 AFTER INSERT ON purchase_xml_item_lot_evidence FOR EACH ROW EXECUTE FUNCTION purchase_xml_lot_evidence_expiration_v1();

-- trigger: purchase_xml_items.purchase_xml_sync_inventory_lot_v1
CREATE TRIGGER purchase_xml_sync_inventory_lot_v1 AFTER INSERT OR UPDATE OF product_id, converted_quantity, lot_expiration_date, processing_status, inventory_lot_id ON purchase_xml_items FOR EACH ROW EXECUTE FUNCTION purchase_xml_sync_inventory_lot_v1();

-- trigger: simples_periods.trg_guard_simples_locked_snapshot_v1
CREATE TRIGGER trg_guard_simples_locked_snapshot_v1 BEFORE DELETE OR UPDATE ON simples_periods FOR EACH ROW EXECUTE FUNCTION guard_simples_locked_snapshot_v1();

-- trigger: vitrine_stock_reservations.vitrine_stock_reservation_lot_delete_v1
CREATE TRIGGER vitrine_stock_reservation_lot_delete_v1 BEFORE DELETE ON vitrine_stock_reservations FOR EACH ROW EXECUTE FUNCTION vitrine_stock_reservation_lot_delete_v1();

-- trigger: vitrine_stock_reservations.vitrine_stock_reservation_lot_sync_v1
CREATE TRIGGER vitrine_stock_reservation_lot_sync_v1 AFTER INSERT OR UPDATE OF status, quantity, product_id ON vitrine_stock_reservations FOR EACH ROW EXECUTE FUNCTION vitrine_stock_reservation_lot_sync_v1();

-- trigger: whatsapp_accounts.set_whatsapp_accounts_updated_at
CREATE TRIGGER set_whatsapp_accounts_updated_at BEFORE UPDATE ON whatsapp_accounts FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- trigger: whatsapp_messages_v1.marketing_capture_weekly_consent_message_v1
CREATE TRIGGER marketing_capture_weekly_consent_message_v1 AFTER INSERT ON whatsapp_messages_v1 FOR EACH ROW EXECUTE FUNCTION marketing_capture_weekly_consent_message_v1();

-- trigger: whatsapp_messages_v1.ops2_reconcile_order_whatsapp_sent_v1
CREATE TRIGGER ops2_reconcile_order_whatsapp_sent_v1 AFTER INSERT OR UPDATE OF provider_message_id, text_body, status_current ON whatsapp_messages_v1 FOR EACH ROW EXECUTE FUNCTION ops2_reconcile_order_whatsapp_sent_v1();

-- trigger: whatsapp_messages_v1.ops2_whatsapp_capture_template_text_v1
CREATE TRIGGER ops2_whatsapp_capture_template_text_v1 BEFORE INSERT OR UPDATE OF provider_message_id, metadata, message_type, text_body ON whatsapp_messages_v1 FOR EACH ROW EXECUTE FUNCTION ops2_whatsapp_capture_template_text_v1();

-- trigger: whatsapp_messages_v1.whatsapp_location_evidence_v1
CREATE TRIGGER whatsapp_location_evidence_v1 AFTER INSERT OR UPDATE OF customer_id, metadata, message_type ON whatsapp_messages_v1 FOR EACH ROW EXECUTE FUNCTION capture_whatsapp_location_evidence_v1();

-- trigger: whatsapp_outbox_v1.attendance_outbox_human_ai_guard_v1
CREATE TRIGGER attendance_outbox_human_ai_guard_v1 BEFORE INSERT OR UPDATE OF status ON whatsapp_outbox_v1 FOR EACH ROW EXECUTE FUNCTION ops2_attendance_outbox_human_ai_guard_v1();

-- trigger: whatsapp_outbox_v1.whatsapp_outbox_media_canary_guard_v1
CREATE TRIGGER whatsapp_outbox_media_canary_guard_v1 BEFORE INSERT OR UPDATE OF status ON whatsapp_outbox_v1 FOR EACH ROW EXECUTE FUNCTION ops2_admin_attendance_media_canary_guard_v1();
