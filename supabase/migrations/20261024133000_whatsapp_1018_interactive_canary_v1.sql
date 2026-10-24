-- Isolated WhatsApp 1018 interactive canary. No changes to orders,
-- production queues, conversational state, ANA or the existing Meta transport.
create table if not exists public.whatsapp_1018_interactive_canary_v1 (
  request_id uuid primary key,
  sender_account_id uuid not null references public.whatsapp_accounts(id),
  conversation_id uuid not null references public.conversations(id),
  recipient_e164 text not null check (recipient_e164 = '+5565999828360'),
  kind text not null check (kind in ('sizes','combinations')),
  date_utc date not null default ((now() at time zone 'utc')::date),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'claimed' check (status in ('claimed','sent','failed','uncertain')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint whatsapp_1018_canary_one_kind_per_day unique
    (sender_account_id,recipient_e164,date_utc,kind)
);
create index if not exists whatsapp_1018_canary_created_idx
  on public.whatsapp_1018_interactive_canary_v1 (created_at desc);
alter table public.whatsapp_1018_interactive_canary_v1 enable row level security;
revoke all on table public.whatsapp_1018_interactive_canary_v1 from public,anon,authenticated;
grant select,insert,update on table public.whatsapp_1018_interactive_canary_v1 to service_role;
comment on table public.whatsapp_1018_interactive_canary_v1 is
  'Strict internal human-triggered Meta list canary from 1018 to 8360 only; max 1 per kind/day, fail closed, no automatic retry.';
