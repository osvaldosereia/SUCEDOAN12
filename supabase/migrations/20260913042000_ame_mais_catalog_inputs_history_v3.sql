alter table public.ame_mais_runs
  add column if not exists source_urls jsonb not null default '[]'::jsonb,
  add column if not exists ean text,
  add column if not exists ncm text,
  add column if not exists preco_custo numeric(12,2),
  add column if not exists preco_venda numeric(12,2);

create index if not exists idx_ame_mais_runs_history on public.ame_mais_runs(created_at desc);

revoke all on public.ame_mais_runs from anon, authenticated;
grant select, insert, update, delete on public.ame_mais_runs to service_role;
