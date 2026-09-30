-- 2026-09-30 · Dona Antônia
-- The existing trg_order_items_updated_at trigger calls public.set_updated_at(),
-- which assigns NEW.updated_at. order_items did not have that column, causing
-- canonical non-vitrine order sources (manual_whatsapp, papoai, reorder) to fail
-- when their metadata was updated after order creation.

alter table public.order_items
  add column if not exists updated_at timestamptz;

update public.order_items
set updated_at=coalesce(updated_at,created_at,now())
where updated_at is null;

alter table public.order_items
  alter column updated_at set default now(),
  alter column updated_at set not null;
