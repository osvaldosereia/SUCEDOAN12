-- Dona Antônia — notificações transacionais pós-separação.
-- Não faz backfill: somente separações concluídas após o deploy chamam o dispatcher.

create table if not exists public.order_separation_customer_notifications_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  notification_kind text not null check (notification_kind in ('prepared_ok','prepared_adjusted')),
  status text not null default 'pending' check (status in ('pending','sending','accepted','retry','failed','uncertain','suppressed')),
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  phone_e164 text,
  channel_origin text check (channel_origin is null or channel_origin in ('0975','1018')),
  template_name text,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_separation_customer_notifications_v1_order_kind_uidx unique(order_id,notification_kind)
);

create index if not exists order_separation_customer_notifications_v1_status_idx
  on public.order_separation_customer_notifications_v1(status,updated_at);

alter table public.order_separation_customer_notifications_v1 enable row level security;
revoke all on table public.order_separation_customer_notifications_v1 from public,anon,authenticated;
grant select,insert,update on table public.order_separation_customer_notifications_v1 to service_role;

comment on table public.order_separation_customer_notifications_v1 is
  'Idempotência/auditoria dos avisos Utility enviados ao cliente após consolidar a separação física do pedido.';
