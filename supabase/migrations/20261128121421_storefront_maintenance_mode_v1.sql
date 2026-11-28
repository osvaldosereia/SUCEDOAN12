create table if not exists public.storefront_maintenance_state_v1 (
  singleton boolean primary key default true check (singleton is true),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.storefront_maintenance_state_v1 enable row level security;

revoke all on table public.storefront_maintenance_state_v1 from public, anon, authenticated;
grant select, insert, update on table public.storefront_maintenance_state_v1 to service_role;

insert into public.storefront_maintenance_state_v1 (singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;
