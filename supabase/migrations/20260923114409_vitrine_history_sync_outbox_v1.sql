create table if not exists public.vitrine_history_sync_outbox (
  order_id uuid primary key references public.orders(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','synced','failed')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  remote_order_id uuid,
  remote_customer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vitrine_history_sync_outbox_state_idx
  on public.vitrine_history_sync_outbox(state, updated_at);

alter table public.vitrine_history_sync_outbox enable row level security;
revoke all on table public.vitrine_history_sync_outbox from public, anon, authenticated;
grant select,insert,update,delete on table public.vitrine_history_sync_outbox to service_role;
drop policy if exists service_role_vitrine_history_sync_outbox on public.vitrine_history_sync_outbox;
create policy service_role_vitrine_history_sync_outbox
  on public.vitrine_history_sync_outbox for all to service_role
  using (true) with check (true);

create table if not exists public.internal_integration_secrets (
  integration_key text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);
alter table public.internal_integration_secrets enable row level security;
revoke all on table public.internal_integration_secrets from public, anon, authenticated;
grant select,insert,update,delete on table public.internal_integration_secrets to service_role;
drop policy if exists service_role_internal_integration_secrets on public.internal_integration_secrets;
create policy service_role_internal_integration_secrets
  on public.internal_integration_secrets for all to service_role
  using (true) with check (true);

-- The actual bridge secret is provisioned operationally and is intentionally not stored in source control.
