-- Isolated checkout deduplication for the 1018 pilot. No change to live order tables.
create table if not exists public.whatsapp_1018_checkout_attempts_v1 (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 actor_user_id uuid not null,
 payload_hash text not null,
 status text not null default 'processing' check(status in ('processing','succeeded','failed')),
 order_id uuid,
 result jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.whatsapp_1018_checkout_attempts_v1 enable row level security;
revoke all on public.whatsapp_1018_checkout_attempts_v1 from public, anon, authenticated;
create index if not exists whatsapp_1018_checkout_attempts_created_idx on public.whatsapp_1018_checkout_attempts_v1(created_at desc);
comment on table public.whatsapp_1018_checkout_attempts_v1 is 'Service-role-only idempotency ledger for explicitly authorized 1018 pilot checkout; never stores basket hidden price adjustments.';
