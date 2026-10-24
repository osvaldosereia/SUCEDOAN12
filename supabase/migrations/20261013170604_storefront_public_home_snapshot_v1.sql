-- Dona Antônia · R2 · public storefront snapshot persisted across Edge instances.
-- Stores only the already-public home response. Never store customer or order data.
create table if not exists public.storefront_public_home_snapshot_v1 (
  snapshot_key text primary key
    constraint storefront_public_home_snapshot_singleton_chk check (snapshot_key = 'home'),
  payload jsonb,
  generated_at timestamptz,
  refresh_token uuid,
  refresh_lease_until timestamptz not null default '1970-01-01 00:00:00+00'::timestamptz,
  constraint storefront_public_home_snapshot_payload_chk check (
    payload is null or (
      jsonb_typeof(payload) = 'object'
      and payload->>'ok' = 'true'
      and jsonb_typeof(payload->'baskets') = 'array'
      and jsonb_typeof(payload->'basket_categories') = 'array'
    )
  )
);
alter table public.storefront_public_home_snapshot_v1 enable row level security;
revoke all on table public.storefront_public_home_snapshot_v1 from public, anon, authenticated;
grant select, insert, update on table public.storefront_public_home_snapshot_v1 to service_role;
insert into public.storefront_public_home_snapshot_v1(snapshot_key)
values ('home') on conflict (snapshot_key) do nothing;
