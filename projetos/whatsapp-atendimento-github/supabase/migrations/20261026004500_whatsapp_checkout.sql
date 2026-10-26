create schema if not exists whatsapp_atendimento;

revoke all on schema whatsapp_atendimento from public, anon, authenticated;
grant usage on schema whatsapp_atendimento to service_role;

create table whatsapp_atendimento.webhook_events (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('0975', '1018')),
  message_id text not null check (length(message_id) between 1 and 256),
  message_type text not null check (length(message_type) between 1 and 40),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  unique (channel, message_id)
);

create table whatsapp_atendimento.order_drafts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('0975', '1018')),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  session_id uuid not null references public.whatsapp_flow_sessions(id),
  revision integer not null default 1 check (revision > 0),
  status text not null check (status in ('awaiting_customer_confirmation', 'confirmed', 'cancelled', 'expired', 'superseded')),
  snapshot jsonb not null,
  summary_hash text not null check (summary_hash ~ '^[0-9a-f]{64}$'),
  source_event_id text not null,
  expires_at timestamptz not null,
  confirmed_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, source_event_id)
);

create index order_drafts_expiry_idx
  on whatsapp_atendimento.order_drafts (expires_at)
  where status = 'awaiting_customer_confirmation';

create table whatsapp_atendimento.orders (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references whatsapp_atendimento.order_drafts(id),
  channel text not null check (channel in ('0975', '1018')),
  status text not null default 'received' check (status in ('received', 'packing', 'awaiting_invoice', 'invoice_authorized', 'out_for_delivery', 'completed', 'attention', 'cancelled')),
  catalog_commit text not null check (catalog_commit ~ '^[0-9a-f]{40}$'),
  catalog_revision text not null check (catalog_revision ~ '^[0-9a-f]{40}:[0-9a-f]{40}$'),
  total_cents bigint not null check (total_cents >= 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table whatsapp_atendimento.order_drafts
  add constraint order_drafts_confirmed_order_fk
  foreign key (confirmed_order_id) references whatsapp_atendimento.orders(id);

create table whatsapp_atendimento.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references whatsapp_atendimento.orders(id) on delete cascade,
  position integer not null check (position > 0),
  product_id text not null,
  quantity integer not null check (quantity >= 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  snapshot jsonb not null,
  picking_status text not null default 'pending' check (picking_status in ('pending', 'separated', 'missing')),
  unique (order_id, position)
);

create table whatsapp_atendimento.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references whatsapp_atendimento.orders(id) on delete cascade,
  event_key text not null unique,
  event_type text not null check (length(event_type) between 1 and 80),
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table whatsapp_atendimento.message_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('0975', '1018')),
  event_key text not null unique,
  message_type text not null check (message_type in ('basket_menu', 'flow_launch', 'order_summary', 'order_cancelled')),
  payload_iv text not null,
  payload_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error_code text
);

alter table whatsapp_atendimento.webhook_events enable row level security;
alter table whatsapp_atendimento.order_drafts enable row level security;
alter table whatsapp_atendimento.orders enable row level security;
alter table whatsapp_atendimento.order_items enable row level security;
alter table whatsapp_atendimento.order_events enable row level security;
alter table whatsapp_atendimento.message_outbox enable row level security;

revoke all on all tables in schema whatsapp_atendimento from public, anon, authenticated;
revoke all on all sequences in schema whatsapp_atendimento from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema whatsapp_atendimento to service_role;
grant usage, select on all sequences in schema whatsapp_atendimento to service_role;

alter default privileges in schema whatsapp_atendimento
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema whatsapp_atendimento
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema whatsapp_atendimento
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema whatsapp_atendimento
  grant usage, select on sequences to service_role;

comment on schema whatsapp_atendimento is
  'Private transaction schema for the greenfield WhatsApp Atendimento project; never expose through the public API.';
