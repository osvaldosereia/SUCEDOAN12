-- index: integration_jobs_queue_idx
CREATE INDEX integration_jobs_queue_idx ON whatsapp_atendimento.integration_jobs USING btree (created_at) WHERE (status = ANY (ARRAY['pending'::text, 'unknown'::text]));

-- index: order_drafts_expiry_idx
CREATE INDEX order_drafts_expiry_idx ON whatsapp_atendimento.order_drafts USING btree (expires_at) WHERE (status = 'awaiting_customer_confirmation'::text);

-- index: orders_bling_sale_reference_key
CREATE UNIQUE INDEX orders_bling_sale_reference_key ON whatsapp_atendimento.orders USING btree (bling_sale_reference) WHERE (bling_sale_reference IS NOT NULL);

-- index: outbox_pending_status_events_expiry_idx
CREATE INDEX outbox_pending_status_events_expiry_idx ON whatsapp_atendimento.outbox_pending_status_events USING btree (expires_at);

-- index: outbox_pending_status_events_provider_idx
CREATE INDEX outbox_pending_status_events_provider_idx ON whatsapp_atendimento.outbox_pending_status_events USING btree (channel, provider_message_id, provider_status_at);
