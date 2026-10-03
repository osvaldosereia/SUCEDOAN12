-- Dona Antônia · Order Separation V2 FK index
-- Mirrors the canonical Supabase migration applied during controlled rollout.
create index if not exists order_separation_items_order_item_idx
  on public.order_separation_items_v1(order_item_id);
