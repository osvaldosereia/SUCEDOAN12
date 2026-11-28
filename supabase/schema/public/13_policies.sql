-- policy: admin_saved_card_uses_v1.service role manages saved card usage
create policy "service role manages saved card usage" on public.admin_saved_card_uses_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: admin_saved_cards_v1.service role manages saved cards
create policy "service role manages saved cards" on public.admin_saved_cards_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_hub_audit_v2.service_role_bling_hub_audit_v2
create policy service_role_bling_hub_audit_v2 on public.bling_hub_audit_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_hub_canary_allowlist_v2.service_role_bling_hub_canary_allowlist_v2
create policy service_role_bling_hub_canary_allowlist_v2 on public.bling_hub_canary_allowlist_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_hub_entity_links_v2.service_role_bling_hub_entity_links_v2
create policy service_role_bling_hub_entity_links_v2 on public.bling_hub_entity_links_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_hub_jobs_v2.service_role_bling_hub_jobs_v2
create policy service_role_bling_hub_jobs_v2 on public.bling_hub_jobs_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_hub_rate_limit_v2.service_role_bling_hub_rate_limit_v2
create policy service_role_bling_hub_rate_limit_v2 on public.bling_hub_rate_limit_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_hub_runtime_v2.service_role_bling_hub_runtime_v2
create policy service_role_bling_hub_runtime_v2 on public.bling_hub_runtime_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: bling_webhook_inbox_v2.service_role_bling_webhook_inbox_v2
create policy service_role_bling_webhook_inbox_v2 on public.bling_webhook_inbox_v2 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: caneca_studio_generation_limits.caneca_studio_generation_limits_service_role_only
create policy caneca_studio_generation_limits_service_role_only on public.caneca_studio_generation_limits as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: caneca_studio_jobs.caneca_studio_jobs_service_role_only
create policy caneca_studio_jobs_service_role_only on public.caneca_studio_jobs as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: customer_address_reference_photos_v1.customer_address_reference_photos_v1_service_role_all
create policy customer_address_reference_photos_v1_service_role_all on public.customer_address_reference_photos_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: da_offer_status_images_v1.service role manages daily offer status images
create policy "service role manages daily offer status images" on public.da_offer_status_images_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: delivery_customer_notifications_v1.delivery_customer_notifications_v1_service_role_all
create policy delivery_customer_notifications_v1_service_role_all on public.delivery_customer_notifications_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: delivery_driver_access_v1.delivery_driver_access_v1_service_role_all
create policy delivery_driver_access_v1_service_role_all on public.delivery_driver_access_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: fiscal_source_documents.service_role_fiscal_source_documents
create policy service_role_fiscal_source_documents on public.fiscal_source_documents as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: fiscal_source_scan_state.service_role_fiscal_source_scan_state
create policy service_role_fiscal_source_scan_state on public.fiscal_source_scan_state as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_customer_registration_journeys_v1.ops2_customer_registration_journeys_service_only_v1
create policy ops2_customer_registration_journeys_service_only_v1 on public.ops2_customer_registration_journeys_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_meta_whatsapp_flow_bindings_v1.ops2_meta_whatsapp_flow_bindings_service_only_v1
create policy ops2_meta_whatsapp_flow_bindings_service_only_v1 on public.ops2_meta_whatsapp_flow_bindings_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_meta_whatsapp_senders_v1.ops2_meta_whatsapp_senders_service_only_v1
create policy ops2_meta_whatsapp_senders_service_only_v1 on public.ops2_meta_whatsapp_senders_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_papoai_channel_bindings_v1.ops2_papoai_channel_bindings_service_only_v1
create policy ops2_papoai_channel_bindings_service_only_v1 on public.ops2_papoai_channel_bindings_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_papoai_homologation_targets_v1.ops2_papoai_homologation_targets_service_only_v1
create policy ops2_papoai_homologation_targets_service_only_v1 on public.ops2_papoai_homologation_targets_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_papoai_outbound_intents_v1.ops2_papoai_outbound_intents_service_only_v1
create policy ops2_papoai_outbound_intents_service_only_v1 on public.ops2_papoai_outbound_intents_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: ops2_papoai_outbound_runtime_v1.ops2_papoai_outbound_runtime_service_only_v1
create policy ops2_papoai_outbound_runtime_service_only_v1 on public.ops2_papoai_outbound_runtime_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: order_separation_whatsapp_settings_v1.order_separation_whatsapp_settings_service_role_all
create policy order_separation_whatsapp_settings_service_role_all on public.order_separation_whatsapp_settings_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);

-- policy: site_order_whatsapp_settings_v1.site_order_whatsapp_settings_service_role_all
create policy site_order_whatsapp_settings_service_role_all on public.site_order_whatsapp_settings_v1 as PERMISSIVE for ALL to service_role using (true) with check (true);
