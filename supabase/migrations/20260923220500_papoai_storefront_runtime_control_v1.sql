create table if not exists public.papoai_storefront_runtime_control_v1 (
  id smallint primary key default 1 check (id=1),
  storefront_link_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

insert into public.papoai_storefront_runtime_control_v1(id,storefront_link_enabled,metadata)
values(1,true,jsonb_build_object('source','vitrine_admin','version',1))
on conflict(id) do nothing;

alter table public.papoai_storefront_runtime_control_v1 enable row level security;
revoke all on public.papoai_storefront_runtime_control_v1 from anon,authenticated;
