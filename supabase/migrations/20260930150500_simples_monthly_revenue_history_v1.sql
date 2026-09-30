-- Dona Antonia · Simples Nacional monthly fiscal revenue history v1
-- Server-only cache for RBT12 bootstrap from verified Bling NF-e evidence.

create table if not exists public.simples_monthly_revenue_history (
  id uuid primary key default gen_random_uuid(),
  competence_month date not null check (date_trunc('month',competence_month)::date=competence_month),
  gross_sales numeric(14,2) not null default 0 check (gross_sales>=0),
  returns_amount numeric(14,2) not null default 0 check (returns_amount>=0),
  net_revenue numeric(14,2) not null default 0 check (net_revenue>=0),
  document_count integer not null default 0 check (document_count>=0),
  return_document_count integer not null default 0 check (return_document_count>=0),
  source text not null default 'bling_nfe' check (source in ('bling_nfe','manual_verified')),
  source_hash text,
  collection_status text not null default 'incomplete' check (collection_status in ('complete','incomplete','review_required','failed')),
  review_reason text,
  evidence jsonb not null default '{}'::jsonb,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competence_month)
);

create index if not exists simples_monthly_revenue_history_status_idx
  on public.simples_monthly_revenue_history(competence_month desc,collection_status);

alter table public.simples_monthly_revenue_history enable row level security;
revoke all on public.simples_monthly_revenue_history from anon, authenticated;
grant select,insert,update,delete on public.simples_monthly_revenue_history to service_role;

comment on table public.simples_monthly_revenue_history is
  'Monthly earned-revenue evidence used only for RBT12 bootstrap. Populated on demand from Bling NF-e; no PGDAS side effects.';
