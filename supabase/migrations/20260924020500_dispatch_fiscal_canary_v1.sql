-- R35 · Adapter fiscal de expedição / canário controlado
-- Nenhuma escrita externa é ativada por esta migration.
-- Os dois gates de escrita permanecem false por padrão.

alter table public.fiscal_runtime_config
  add column if not exists dispatch_invoice_generate_enabled boolean not null default false,
  add column if not exists dispatch_invoice_authorize_enabled boolean not null default false,
  add column if not exists dispatch_invoice_canary_source_order_id uuid null;

create table if not exists public.dispatch_fiscal_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  source_order_id uuid not null,
  bling_order_id bigint not null,
  fiscal_version integer not null default 1 check (fiscal_version > 0),
  idempotency_key text not null unique,
  status text not null default 'held'
    check (status in ('held','ready','generating','generated','authorizing','authorized','review_required','error','cancelled')),
  external_side_effect boolean not null default false,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 1 check (max_attempts = 1),
  bling_invoice_id bigint null,
  bling_invoice_number text null,
  access_key text null,
  sefaz_status text null,
  provider_request_id text null,
  error_code text null,
  error_detail text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null,
  unique(order_id,fiscal_version)
);

alter table public.dispatch_fiscal_jobs enable row level security;

create index if not exists dispatch_fiscal_jobs_status_created_idx
  on public.dispatch_fiscal_jobs(status,created_at);

create index if not exists dispatch_fiscal_jobs_source_order_idx
  on public.dispatch_fiscal_jobs(source_order_id);

comment on table public.dispatch_fiscal_jobs is
'Canário fiscal pré-expedição. Geração/autorização de NF-e é executada somente por Edge Function com gates explícitos e tentativa única.';

comment on column public.fiscal_runtime_config.dispatch_invoice_generate_enabled is
'Gate independente para POST gerar-nfe a partir de pedido de venda já verificado no Bling.';

comment on column public.fiscal_runtime_config.dispatch_invoice_authorize_enabled is
'Gate independente para envio/autorização de NF-e na SEFAZ após geração segura.';

comment on column public.fiscal_runtime_config.dispatch_invoice_canary_source_order_id is
'Único source_order_id autorizado a executar o canário fiscal enquanto os gates estiverem ativos.';
