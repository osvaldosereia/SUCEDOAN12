-- foreign_key: ops4_postorder_followups_v1.ops4_postorder_followups_v1_order_id_fkey
alter table private.ops4_postorder_followups_v1 add constraint ops4_postorder_followups_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: ops4_postorder_followups_v1.ops4_postorder_followups_v1_whatsapp_account_id_fkey
alter table private.ops4_postorder_followups_v1 add constraint ops4_postorder_followups_v1_whatsapp_account_id_fkey FOREIGN KEY (whatsapp_account_id) REFERENCES whatsapp_accounts(id);

-- foreign_key: order_addon_operations_v1.order_addon_operations_v1_order_id_fkey
alter table private.order_addon_operations_v1 add constraint order_addon_operations_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_addon_operations_v1.order_addon_operations_v1_session_id_fkey
alter table private.order_addon_operations_v1 add constraint order_addon_operations_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES private.order_addon_sessions_v1(id) ON DELETE CASCADE;

-- foreign_key: order_addon_sessions_v1.order_addon_sessions_v1_order_id_fkey
alter table private.order_addon_sessions_v1 add constraint order_addon_sessions_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: order_customer_actions_v1.order_customer_actions_v1_order_id_fkey
alter table private.order_customer_actions_v1 add constraint order_customer_actions_v1_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- foreign_key: whatsapp_ana_admin_runtime_v1.whatsapp_ana_admin_runtime_v1_active_version_id_fkey
alter table private.whatsapp_ana_admin_runtime_v1 add constraint whatsapp_ana_admin_runtime_v1_active_version_id_fkey FOREIGN KEY (active_version_id) REFERENCES private.whatsapp_ana_admin_versions_v1(id);
