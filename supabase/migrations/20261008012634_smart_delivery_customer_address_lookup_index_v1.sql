-- Reconstructed from canonical pg_indexes on 2026-10-08.
-- Supports destination lookup without changing customer address semantics.
CREATE INDEX IF NOT EXISTS orders_delivery_customer_address_idx
  ON public.orders (delivery_customer_address_id);
