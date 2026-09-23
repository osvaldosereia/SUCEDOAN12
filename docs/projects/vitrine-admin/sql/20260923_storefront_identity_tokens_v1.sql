-- Chat Commerce OS / qxstkwshuvplmmftrctj
-- Applied in production on 2026-09-23.
create table if not exists public.storefront_identity_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  phone_e164 text not null,
  contact_name text,
  source text not null default 'papoai',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0)
);

create index if not exists storefront_identity_tokens_expires_at_idx
  on public.storefront_identity_tokens(expires_at);

create index if not exists storefront_identity_tokens_phone_created_idx
  on public.storefront_identity_tokens(phone_e164,created_at desc);

alter table public.storefront_identity_tokens enable row level security;
revoke all on public.storefront_identity_tokens from anon,authenticated;
grant all on public.storefront_identity_tokens to service_role;
