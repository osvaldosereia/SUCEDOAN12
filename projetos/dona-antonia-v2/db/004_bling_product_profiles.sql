-- PERFIL FISCAL BLING, PARA AMBIENTE V2 FUTURO. NÃO APLICAR NA PRODUÇÃO ATUAL.
-- Não expor este schema por API pública; acesso somente por backend autenticado.
create table if not exists da_next.bling_product_profiles(
  sku text primary key references da_next.products(sku) on update cascade on delete restrict,
  bling_product_id text unique,
  unit text not null default 'UN' check(unit='UN'),
  origin_code text,
  ncm text,
  cest text,
  packaging_gtin text,
  units_per_case integer check(units_per_case>0),
  supplier_name text,
  supplier_code text,
  original_bling_import jsonb not null default '{}'::jsonb,
  synced_at timestamptz,
  sync_error text,
  updated_at timestamptz not null default now(),
  check (ncm is null or ncm ~ '^[0-9]{8}$'),
  check (cest is null or cest ~ '^[0-9]{7}$')
);
alter table da_next.bling_product_profiles enable row level security;
-- Sem políticas RLS anon/auth. Nunca incluir original_bling_import em views públicas.
