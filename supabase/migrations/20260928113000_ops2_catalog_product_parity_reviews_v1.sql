
create table if not exists public.ops2_catalog_product_parity_reviews (
  product_id uuid primary key references public.products(id) on delete cascade,
  bling_product_id bigint,
  local_active boolean not null,
  local_name text,
  local_sku text,
  local_gtin text,
  local_price numeric(18,2),
  remote_found boolean not null default false,
  remote_name text,
  remote_sku text,
  remote_gtin text,
  remote_price numeric(18,2),
  remote_status text,
  name_match boolean,
  sku_match boolean,
  gtin_match boolean,
  price_match boolean,
  status_match boolean,
  review_status text not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_status in (
    'pending','matched','price_mismatch','identity_mismatch','status_mismatch',
    'multiple_mismatch','remote_missing','readonly_failed'
  ))
);

create table if not exists public.ops2_bling_orphan_product_reviews (
  bling_product_id bigint primary key,
  remote_name text,
  remote_sku text,
  remote_gtin text,
  remote_price numeric(18,2),
  remote_status text,
  linked_local_product_id uuid references public.products(id) on delete set null,
  classification text not null default 'unclassified',
  safe_action text not null default 'review_only',
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (classification in ('unclassified','linked_inactive','bling_only','duplicate_remote','historical_orphan')),
  check (safe_action in ('review_only','candidate_inactivate','keep'))
);

create index if not exists ops2_catalog_product_parity_status_idx
  on public.ops2_catalog_product_parity_reviews(review_status,local_active,updated_at desc);
create index if not exists ops2_catalog_product_parity_bling_idx
  on public.ops2_catalog_product_parity_reviews(bling_product_id);
create index if not exists ops2_bling_orphan_product_class_idx
  on public.ops2_bling_orphan_product_reviews(classification,safe_action,updated_at desc);

alter table public.ops2_catalog_product_parity_reviews enable row level security;
alter table public.ops2_bling_orphan_product_reviews enable row level security;
revoke all on table public.ops2_catalog_product_parity_reviews from public,anon,authenticated;
revoke all on table public.ops2_bling_orphan_product_reviews from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_catalog_product_parity_reviews to service_role;
grant select,insert,update,delete on table public.ops2_bling_orphan_product_reviews to service_role;

create or replace view public.ops2_catalog_product_parity_summary_v1
with (security_invoker=true)
as
select
  count(*)::bigint total,
  count(*) filter(where local_active)::bigint active,
  count(*) filter(where review_status='matched')::bigint matched,
  count(*) filter(where review_status='price_mismatch')::bigint price_mismatch,
  count(*) filter(where review_status='identity_mismatch')::bigint identity_mismatch,
  count(*) filter(where review_status='status_mismatch')::bigint status_mismatch,
  count(*) filter(where review_status='multiple_mismatch')::bigint multiple_mismatch,
  count(*) filter(where review_status='remote_missing')::bigint remote_missing,
  count(*) filter(where review_status='readonly_failed')::bigint readonly_failed,
  max(updated_at) last_updated_at
from public.ops2_catalog_product_parity_reviews;

revoke all on public.ops2_catalog_product_parity_summary_v1 from public,anon,authenticated;
grant select on public.ops2_catalog_product_parity_summary_v1 to service_role;
