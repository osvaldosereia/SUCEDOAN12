-- ANA V3 R11: support order-level operation lookup and FK cleanup.
-- Additive, idempotent, no data mutation. Apply only after CI and review.
create index if not exists idx_order_addon_operations_v1_order_id
  on private.order_addon_operations_v1 (order_id);
