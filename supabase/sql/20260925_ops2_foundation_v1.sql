-- Dona Antonia Operations 2.0
-- Foundation v1: operational ledger, attention queue and approval queue.
-- Non-destructive: creates new tables/indexes only.

create table if not exists public.ops_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  domain text not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  correlation_id text,
  actor_type text not null default 'system'
    check (actor_type in ('human','automation','ai','external','system')),
  actor_id text,
  actor_label text,
  source_system text not null default 'dona_antonia',
  severity text not null default 'info'
    check (severity in ('debug','info','warning','error','critical')),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  external_ref text,
  idempotency_key text
);

create unique index if not exists ops_events_idempotency_uidx
  on public.ops_events(idempotency_key)
  where idempotency_key is not null;

create index if not exists ops_events_occurred_at_idx
  on public.ops_events(occurred_at desc);

create index if not exists ops_events_entity_idx
  on public.ops_events(entity_type, entity_id, occurred_at desc);

create index if not exists ops_events_correlation_idx
  on public.ops_events(correlation_id, occurred_at desc)
  where correlation_id is not null;

create index if not exists ops_events_domain_idx
  on public.ops_events(domain, occurred_at desc);

alter table public.ops_events enable row level security;

create table if not exists public.ops_attention (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  type text not null,
  entity_type text,
  entity_id text,
  correlation_id text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  owner_role text not null default 'supervisor'
    check (owner_role in ('owner','supervisor','operator','driver','automation')),
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved','dismissed')),
  summary text not null,
  recommended_action text,
  evidence jsonb not null default '{}'::jsonb,
  source_system text not null default 'dona_antonia',
  resolution text,
  resolution_ref text,
  idempotency_key text,
  due_at timestamptz
);

create unique index if not exists ops_attention_idempotency_uidx
  on public.ops_attention(idempotency_key)
  where idempotency_key is not null;

create index if not exists ops_attention_open_idx
  on public.ops_attention(status, priority, opened_at)
  where status in ('open','acknowledged');

create index if not exists ops_attention_entity_idx
  on public.ops_attention(entity_type, entity_id, opened_at desc);

alter table public.ops_attention enable row level security;

create table if not exists public.ops_approvals (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','expired','executed','failed','cancelled')),
  risk text not null default 'medium'
    check (risk in ('low','medium','high','critical')),
  action_type text not null,
  entity_type text,
  entity_id text,
  correlation_id text,
  requested_by_type text not null default 'automation'
    check (requested_by_type in ('human','automation','ai','system')),
  requested_by_id text,
  requested_by_label text,
  decided_by_id text,
  decided_by_label text,
  summary text not null,
  proposed_action jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  decision_note text,
  execution_ref text,
  idempotency_key text
);

create unique index if not exists ops_approvals_idempotency_uidx
  on public.ops_approvals(idempotency_key)
  where idempotency_key is not null;

create index if not exists ops_approvals_pending_idx
  on public.ops_approvals(status, risk, requested_at)
  where status='pending';

create index if not exists ops_approvals_entity_idx
  on public.ops_approvals(entity_type, entity_id, requested_at desc);

alter table public.ops_approvals enable row level security;

comment on table public.ops_events is
  'Operations 2.0 append-only business event ledger. Not a debug log or ERP replacement.';
comment on table public.ops_attention is
  'Operations 2.0 current human-attention queue for Control Tower.';
comment on table public.ops_approvals is
  'Operations 2.0 explicit approval queue for sensitive actions.';
