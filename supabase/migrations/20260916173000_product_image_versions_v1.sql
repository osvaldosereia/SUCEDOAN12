-- Histórico de imagens por produto para o Admin oficial.
-- A tabela não é acessível diretamente pelo navegador; somente funções server-side usam service_role.

create table if not exists public.product_image_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  source_type text not null,
  source_image_url text,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_image_versions_product_created_v1
  on public.product_image_versions(product_id, created_at desc);

alter table public.product_image_versions enable row level security;

revoke all on table public.product_image_versions from public;
revoke all on table public.product_image_versions from anon, authenticated;
grant select, insert, update, delete on table public.product_image_versions to service_role;
