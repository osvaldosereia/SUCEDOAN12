create table if not exists public.inventory_sheet_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  created_by uuid null,
  operator_label text null,
  filters jsonb not null default '{}'::jsonb,
  product_count integer not null check (product_count >= 0),
  page_count integer not null check (page_count >= 0),
  cards_per_page integer not null default 20 check (cards_per_page between 1 and 50),
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists public.inventory_sheet_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.inventory_sheet_batches(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  slot_number integer not null check (slot_number between 1 and 50),
  printed_index integer not null check (printed_index >= 1),
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  gtin_snapshot text null,
  expiration_date_snapshot date null,
  image_url_snapshot text null,
  created_at timestamptz not null default now(),
  unique(batch_id,page_number,slot_number),
  unique(batch_id,printed_index),
  unique(batch_id,product_id)
);

create table if not exists public.inventory_sheet_page_scans (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.inventory_sheet_batches(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  uploaded_by uuid null,
  model text null,
  ai_response_id text null,
  page_confidence numeric(5,4) null,
  raw_result jsonb not null default '{}'::jsonb,
  review_result jsonb not null default '{}'::jsonb,
  status text not null default 'analyzed' check (status in ('analyzed','partial','applied','rejected')),
  created_at timestamptz not null default now(),
  applied_at timestamptz null
);

create table if not exists public.inventory_sheet_item_results (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.inventory_sheet_page_scans(id) on delete cascade,
  sheet_item_id uuid not null references public.inventory_sheet_items(id) on delete cascade,
  ai_ean text null,
  ai_quantity integer null check (ai_quantity is null or ai_quantity >= 0),
  ai_confidence numeric(5,4) null,
  ai_mark_kind text null,
  ai_note text null,
  review_state text not null default 'review' check (review_state in ('ready','review','confirmed','applied','error')),
  confirmed_quantity integer null check (confirmed_quantity is null or confirmed_quantity >= 0),
  confirmed_by uuid null,
  confirmed_at timestamptz null,
  stock_count_id uuid null,
  bling_job_id uuid null,
  apply_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scan_id,sheet_item_id)
);

create index if not exists inventory_sheet_items_page_idx
  on public.inventory_sheet_items(batch_id,page_number,slot_number);
create index if not exists inventory_sheet_page_scans_batch_page_idx
  on public.inventory_sheet_page_scans(batch_id,page_number,created_at desc);
create index if not exists inventory_sheet_item_results_scan_idx
  on public.inventory_sheet_item_results(scan_id,review_state);

alter table public.inventory_sheet_batches enable row level security;
alter table public.inventory_sheet_items enable row level security;
alter table public.inventory_sheet_page_scans enable row level security;
alter table public.inventory_sheet_item_results enable row level security;

revoke all on table public.inventory_sheet_batches from anon, authenticated;
revoke all on table public.inventory_sheet_items from anon, authenticated;
revoke all on table public.inventory_sheet_page_scans from anon, authenticated;
revoke all on table public.inventory_sheet_item_results from anon, authenticated;

grant all on table public.inventory_sheet_batches to service_role;
grant all on table public.inventory_sheet_items to service_role;
grant all on table public.inventory_sheet_page_scans to service_role;
grant all on table public.inventory_sheet_item_results to service_role;
