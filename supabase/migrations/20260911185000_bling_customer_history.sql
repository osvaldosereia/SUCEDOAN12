begin;

create table if not exists public.bling_sales_history (
  id uuid primary key default gen_random_uuid(),
  bling_order_id bigint not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  bling_contact_id bigint,
  order_number text,
  order_date date,
  status_id bigint,
  status_name text,
  total numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  other_expenses numeric(14,2) not null default 0,
  store_id bigint,
  store_order_number text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bling_sales_history_items (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.bling_sales_history(id) on delete cascade,
  item_index integer not null,
  bling_product_id bigint,
  product_id uuid references public.products(id) on delete set null,
  sku text,
  name text not null,
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(history_id,item_index)
);

create index if not exists bling_sales_history_customer_date_idx on public.bling_sales_history(customer_id,order_date desc);
create index if not exists bling_sales_history_contact_idx on public.bling_sales_history(bling_contact_id);
create index if not exists bling_sales_history_items_history_idx on public.bling_sales_history_items(history_id);
create index if not exists bling_sales_history_items_product_idx on public.bling_sales_history_items(product_id);

alter table public.bling_sales_history enable row level security;
alter table public.bling_sales_history_items enable row level security;
revoke all on public.bling_sales_history from anon, authenticated;
revoke all on public.bling_sales_history_items from anon, authenticated;

commit;
