-- R44 · Corte operacional: pedidos anteriores ficam somente leitura
-- Nenhum pedido antigo é alterado. O corte nasce no momento da aplicação.

create table if not exists public.vitrine_operational_cutover_config (
  id integer primary key default 1 check (id=1),
  live_orders_since timestamptz not null,
  legacy_orders_read_only boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.vitrine_operational_cutover_config(id,live_orders_since,legacy_orders_read_only)
values(1,now(),true)
on conflict(id) do nothing;

alter table public.vitrine_operational_cutover_config enable row level security;

revoke all on table public.vitrine_operational_cutover_config from public,anon,authenticated;

comment on table public.vitrine_operational_cutover_config is
'Corte operacional da Vitrine/Admin. Pedidos anteriores permanecem somente leitura e fora das rotinas operacionais normais.';
