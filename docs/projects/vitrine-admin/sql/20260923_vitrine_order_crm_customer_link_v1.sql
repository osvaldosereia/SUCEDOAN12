-- Applied to Supabase project qxstkwshuvplmmftrctj (Chat Commerce OS).
-- This is intentionally stored outside the canonical ssbes Supabase migration chain.
alter table public.orders
  add column if not exists crm_customer_id uuid;

create index if not exists orders_crm_customer_id_idx
  on public.orders(crm_customer_id)
  where crm_customer_id is not null;
