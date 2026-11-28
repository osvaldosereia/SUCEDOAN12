-- index: ops4_postorder_followups_due_v1
CREATE INDEX ops4_postorder_followups_due_v1 ON private.ops4_postorder_followups_v1 USING btree (confirm_due_at, created_at) WHERE (confirm_status = 'pending'::text);

-- index: order_addon_sessions_v1_expiry_idx
CREATE INDEX order_addon_sessions_v1_expiry_idx ON private.order_addon_sessions_v1 USING btree (expires_at) WHERE (status = 'open'::text);

-- index: order_addon_sessions_v1_one_open_per_order_idx
CREATE UNIQUE INDEX order_addon_sessions_v1_one_open_per_order_idx ON private.order_addon_sessions_v1 USING btree (order_id) WHERE (status = 'open'::text);

-- index: order_customer_actions_active_v1
CREATE INDEX order_customer_actions_active_v1 ON private.order_customer_actions_v1 USING btree (expires_at) WHERE (confirmed_at IS NULL);
