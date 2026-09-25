-- Dona Antonia Operations 2.0
-- PapoAI capture-only POC.
-- No order, stock, Bling or customer mutation is performed here.

create table if not exists public.papoai_webhook_runtime_v2 (
  id smallint primary key default 1 check (id=1),
  capture_enabled boolean not null default false,
  key_sha256 text,
  last_seen_at timestamptz,
  last_event_key text,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.papoai_webhook_runtime_v2(id,capture_enabled)
values(1,false)
on conflict(id) do nothing;

create table if not exists public.papoai_webhook_inbox_v2 (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  event_key text not null,
  body_hash text not null,
  mode text,
  event_name text,
  external_event_id text,
  external_message_id text,
  conversation_ref text,
  phone_candidate text,
  payload_bytes integer not null default 0,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'captured'
    check (status in ('captured','normalized','ignored','processed','review_required')),
  adapter_version integer not null default 1,
  processed_at timestamptz,
  last_error text
);

create unique index if not exists papoai_webhook_inbox_v2_event_key_uidx
  on public.papoai_webhook_inbox_v2(event_key);

create index if not exists papoai_webhook_inbox_v2_received_idx
  on public.papoai_webhook_inbox_v2(received_at desc);

create index if not exists papoai_webhook_inbox_v2_status_idx
  on public.papoai_webhook_inbox_v2(status,received_at)
  where status in ('captured','review_required');

alter table public.papoai_webhook_runtime_v2 enable row level security;
alter table public.papoai_webhook_inbox_v2 enable row level security;

comment on table public.papoai_webhook_inbox_v2 is
  'Capture-only POC inbox for the real PapoAI webhook contract. Sanitized payloads expire logically after 7 days.';

create or replace function public.get_papoai_webhook_capture_status_v2()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'capture_enabled',r.capture_enabled,
    'last_seen_at',r.last_seen_at,
    'last_event_key',r.last_event_key,
    'last_error',r.last_error,
    'captured_24h',(select count(*) from public.papoai_webhook_inbox_v2 where received_at>=now()-interval '24 hours'),
    'pending',(select count(*) from public.papoai_webhook_inbox_v2 where status='captured' and expires_at>now()),
    'expired',(select count(*) from public.papoai_webhook_inbox_v2 where expires_at<=now())
  )
  from public.papoai_webhook_runtime_v2 r
  where r.id=1;
$$;

revoke all on table public.papoai_webhook_runtime_v2 from public,anon,authenticated;
revoke all on table public.papoai_webhook_inbox_v2 from public,anon,authenticated;
revoke all on function public.get_papoai_webhook_capture_status_v2() from public,anon,authenticated;
grant execute on function public.get_papoai_webhook_capture_status_v2() to service_role;
