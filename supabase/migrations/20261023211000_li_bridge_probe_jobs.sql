-- Ponte de leitura Loja Integrada para comandos internos autorizados.
-- Somente service_role; nenhum acesso pelo navegador ou cliente anon/authenticated.
create table if not exists public.li_bridge_probe_jobs (
  id uuid primary key default gen_random_uuid(),
  proof_hash text not null check (length(proof_hash) = 64),
  action text not null check (action in ('status', 'products', 'categories')),
  args jsonb not null default '{}'::jsonb,
  state text not null default 'pending'
    check (state in ('pending', 'running', 'done', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
alter table public.li_bridge_probe_jobs enable row level security;
revoke all on table public.li_bridge_probe_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.li_bridge_probe_jobs to service_role;
create index if not exists li_bridge_probe_jobs_created_idx
  on public.li_bridge_probe_jobs (created_at desc);
comment on table public.li_bridge_probe_jobs is 'Interno: jobs efêmeros de leitura da Loja Integrada via Supabase; não expor ao cliente';
