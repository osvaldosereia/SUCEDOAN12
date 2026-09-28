
create table if not exists public.ops2_catalog_stock_highrisk_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ops2_catalog_baseline_runs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  bling_product_id bigint,
  desired_stock numeric(18,3) not null,
  planned_bling_stock numeric(18,3),
  observed_bling_stock numeric(18,3),
  abs_delta numeric(18,3),
  risk_bucket text not null,
  status text not null,
  observed_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,product_id),
  check (risk_bucket in ('elevated_21_50','high_51_100','critical_over_100')),
  check (status in ('pending_review','target_drift','binding_drift','readonly_failed','confirmed_readonly','snapshot_rebased'))
);

create index if not exists ops2_catalog_stock_highrisk_reviews_status_idx
  on public.ops2_catalog_stock_highrisk_reviews(status,risk_bucket,updated_at desc);
create index if not exists ops2_catalog_stock_highrisk_reviews_product_idx
  on public.ops2_catalog_stock_highrisk_reviews(product_id);

alter table public.ops2_catalog_stock_highrisk_reviews enable row level security;
revoke all on table public.ops2_catalog_stock_highrisk_reviews from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_catalog_stock_highrisk_reviews to service_role;

create or replace view public.ops2_catalog_stock_highrisk_review_summary_v1
with (security_invoker=true)
as
select
  run_id,
  count(*)::bigint as total,
  count(*) filter(where status='pending_review')::bigint as pending_review,
  count(*) filter(where status='snapshot_rebased')::bigint as snapshot_rebased,
  count(*) filter(where status='confirmed_readonly')::bigint as confirmed_readonly,
  count(*) filter(where status in ('target_drift','binding_drift','readonly_failed'))::bigint as blocked,
  count(*) filter(where risk_bucket='elevated_21_50')::bigint as elevated_21_50,
  count(*) filter(where risk_bucket='high_51_100')::bigint as high_51_100,
  count(*) filter(where risk_bucket='critical_over_100')::bigint as critical_over_100,
  max(updated_at) as last_updated_at
from public.ops2_catalog_stock_highrisk_reviews
group by run_id;

revoke all on public.ops2_catalog_stock_highrisk_review_summary_v1 from public,anon,authenticated;
grant select on public.ops2_catalog_stock_highrisk_review_summary_v1 to service_role;
