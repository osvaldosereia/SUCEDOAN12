-- Registro único por dia, em America/Cuiaba, para lembrar a equipe de conferir
-- a aba "Notas recebidas" no Bling. Não representa nota fiscal pendente.
create table if not exists public.purchase_bling_received_review_v1 (
  review_date date primary key,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null
);
comment on table public.purchase_bling_received_review_v1 is
  'Registro humano de conferência diária da lista Notas recebidas no Bling; não faz manifestação fiscal.';
alter table public.purchase_bling_received_review_v1 enable row level security;
revoke all on public.purchase_bling_received_review_v1 from public, anon, authenticated;
grant select, insert on public.purchase_bling_received_review_v1 to service_role;
