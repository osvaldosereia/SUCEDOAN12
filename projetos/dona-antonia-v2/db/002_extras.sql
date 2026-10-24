-- PLANEJADO; NÃO EXECUTAR ATÉ EXISTIR AMBIENTE DE HOMOLOGAÇÃO.
-- Referencia o mesmo cadastro de tipos e SKUs que as cestas.
-- Sem migrações ou operações no banco em produção.
create table if not exists da_next.extra_groups (
  product_type_id uuid primary key references da_next.product_types(id) on delete cascade,
  sort_order integer not null default 0,
  active boolean not null default true
);
alter table da_next.extra_groups enable row level security;
-- Deny-by-default: não há grants nem políticas públicas nesta etapa.
