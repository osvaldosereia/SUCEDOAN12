-- Applied to canonical Supabase 20260930024247
-- Dona Antônia Operations 2.0
alter table public.orders
  drop constraint if exists orders_site_customer_required_after_identity_cutover;

alter table public.orders
  add constraint orders_site_customer_required_after_identity_cutover
  check (
    created_at < '2026-09-30T02:17:38Z'::timestamptz
    or source not in ('vitrine','storefront_v2')
    or (
      customer_id is not null
      and nullif(btrim(coalesce(phone_e164,'')),'') is not null
    )
  ) not valid;
