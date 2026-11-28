-- foreign_key: channel_flow_bindings.channel_flow_bindings_whatsapp_account_id_fkey
alter table whatsapp_atendimento.channel_flow_bindings add constraint channel_flow_bindings_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: channel_flow_uploads.channel_flow_uploads_whatsapp_account_id_fkey
alter table whatsapp_atendimento.channel_flow_uploads add constraint channel_flow_uploads_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;

-- foreign_key: integration_jobs.integration_jobs_order_id_fkey
alter table whatsapp_atendimento.integration_jobs add constraint integration_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES whatsapp_atendimento.orders(id) ON DELETE CASCADE;

-- foreign_key: order_drafts.order_drafts_confirmed_order_fk
alter table whatsapp_atendimento.order_drafts add constraint order_drafts_confirmed_order_fk FOREIGN KEY (confirmed_order_id) REFERENCES whatsapp_atendimento.orders(id);

-- foreign_key: order_drafts.order_drafts_session_id_fkey
alter table whatsapp_atendimento.order_drafts add constraint order_drafts_session_id_fkey FOREIGN KEY (session_id) REFERENCES whatsapp_flow_sessions(id);

-- foreign_key: order_events.order_events_order_id_fkey
alter table whatsapp_atendimento.order_events add constraint order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES whatsapp_atendimento.orders(id) ON DELETE CASCADE;

-- foreign_key: order_items.order_items_order_id_fkey
alter table whatsapp_atendimento.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES whatsapp_atendimento.orders(id) ON DELETE CASCADE;

-- foreign_key: orders.orders_draft_id_fkey
alter table whatsapp_atendimento.orders add constraint orders_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES whatsapp_atendimento.order_drafts(id);
