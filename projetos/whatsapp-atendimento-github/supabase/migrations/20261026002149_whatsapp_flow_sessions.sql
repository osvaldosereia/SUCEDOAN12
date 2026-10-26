create table public.whatsapp_flow_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  channel text not null check (channel in ('0975', '1018')),
  basket_id text not null check (length(basket_id) between 1 and 80),
  catalog_commit text not null check (catalog_commit ~ '^[0-9a-f]{40}$'),
  catalog_revision text not null check (catalog_revision ~ '^[0-9a-f]{40}:[0-9a-f]{40}$'),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index whatsapp_flow_sessions_expiry_idx
  on public.whatsapp_flow_sessions (expires_at)
  where revoked_at is null;

alter table public.whatsapp_flow_sessions enable row level security;

revoke all on table public.whatsapp_flow_sessions from public, anon, authenticated;
grant select, insert, update on table public.whatsapp_flow_sessions to service_role;

comment on table public.whatsapp_flow_sessions is
  'Short-lived server-side WhatsApp Flow sessions. The opaque flow token is stored only as SHA-256.';
