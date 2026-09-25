-- Dona Antonia Operations 2.0
-- Bling stock mirror v2.
-- This is a cache/read model only. Bling remains the stock source of truth.

create table if not exists public.bling_stock_mirror_v2 (
  product_id uuid primary key references public.products(id) on delete cascade,
  bling_product_id bigint not null unique,
  physical_total numeric not null default 0,
  virtual_total numeric not null default 0,
  deposit_balances jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  source_event_id text,
  source_resource text not null default 'stock'
    check (source_resource in ('stock','virtual_stock','backfill')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bling_stock_mirror_observed_idx
  on public.bling_stock_mirror_v2(observed_at desc);

alter table public.bling_stock_mirror_v2 enable row level security;

comment on table public.bling_stock_mirror_v2 is
  'Read model/cache of Bling physical and virtual stock. Never the ERP source of truth.';

create or replace function public.get_bling_stock_mirror_status_v2()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'rows',count(*),
    'fresh_15m',count(*) filter (where observed_at>=now()-interval '15 minutes'),
    'stale_24h',count(*) filter (where observed_at<now()-interval '24 hours'),
    'last_observed_at',max(observed_at),
    'source_of_truth','bling'
  )
  from public.bling_stock_mirror_v2;
$$;

revoke all on function public.get_bling_stock_mirror_status_v2()
  from public,anon,authenticated;
grant execute on function public.get_bling_stock_mirror_status_v2()
  to service_role;
