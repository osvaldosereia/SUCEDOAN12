-- Applied to canonical project ssbesxgaijknwsjbsbcz on 2026-09-29.
-- Persistent commercial quote history for Vitrine/Admin.

create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null,
  customer_id uuid null references public.customers(id) on delete set null,
  client_name text null,
  client_document text null,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','rejected','expired','cancelled')),
  issued_on date null,
  valid_until date null,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

alter table public.sales_quotes enable row level security;

comment on table public.sales_quotes is
  'Orçamentos comerciais do Vitrine/Admin. Snapshot preserva campos, itens, preços e opções do editor.';

create index if not exists sales_quotes_updated_at_idx on public.sales_quotes(updated_at desc);
create index if not exists sales_quotes_quote_number_idx on public.sales_quotes(quote_number);
create index if not exists sales_quotes_customer_id_idx on public.sales_quotes(customer_id);
create index if not exists sales_quotes_status_updated_idx on public.sales_quotes(status, updated_at desc);
create index if not exists sales_quotes_client_name_lower_idx on public.sales_quotes(lower(client_name));
