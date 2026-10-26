alter table whatsapp_atendimento.orders
  add column revision integer not null default 1 check (revision > 0),
  add column assigned_operator_id uuid,
  add column separation_completed_at timestamptz,
  add column pending_customer_snapshot jsonb,
  add column pending_customer_total_cents bigint check (pending_customer_total_cents is null or pending_customer_total_cents >= 0),
  add column customer_acceptance_status text not null default 'not_required'
    check (customer_acceptance_status in ('not_required', 'pending', 'accepted', 'rejected')),
  add column bling_sale_id bigint,
  add column bling_sale_reference text,
  add column invoice_id bigint,
  add column invoice_status text not null default 'not_requested'
    check (invoice_status in ('not_requested', 'pending', 'authorized', 'rejected', 'unknown')),
  add column invoice_authorized_at timestamptz,
  add column dispatched_at timestamptz,
  add column completed_at timestamptz,
  add column received_payment_cents bigint check (received_payment_cents is null or received_payment_cents >= 0),
  add column received_payment_method text,
  add column attention_code text;

alter table whatsapp_atendimento.order_items
  add column group_id text not null default '',
  add column picked_quantity integer not null default 0 check (picked_quantity >= 0),
  add column replacement_product_id text,
  add column replacement_snapshot jsonb;

alter table whatsapp_atendimento.order_items
  drop constraint order_items_picking_status_check;

alter table whatsapp_atendimento.order_items
  add constraint order_items_picking_status_check
  check (picking_status in ('pending', 'separated', 'missing', 'partial'));

alter table whatsapp_atendimento.message_outbox
  drop constraint message_outbox_message_type_check;
alter table whatsapp_atendimento.message_outbox
  add constraint message_outbox_message_type_check
  check (message_type in ('basket_menu', 'flow_launch', 'order_summary', 'order_adjustment', 'order_cancelled'));

create table whatsapp_atendimento.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references whatsapp_atendimento.orders(id) on delete cascade,
  operation text not null check (operation in ('create_sale', 'generate_invoice', 'read_invoice', 'authorize_invoice', 'complete_delivery')),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'unknown', 'blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  request_sha256 text check (request_sha256 is null or request_sha256 ~ '^[0-9a-f]{64}$'),
  external_id text,
  result_summary jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, operation)
);

create index integration_jobs_queue_idx
  on whatsapp_atendimento.integration_jobs (created_at)
  where status in ('pending', 'unknown');

create table whatsapp_atendimento.customer_bling_contacts (
  customer_id uuid primary key,
  bling_contact_id bigint not null unique check (bling_contact_id > 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table whatsapp_atendimento.bling_payment_mappings (
  payment_method text primary key check (payment_method in ('pix', 'cash', 'debit_card', 'credit_card')),
  bling_payment_form_id bigint not null check (bling_payment_form_id > 0),
  due_date_offset_days integer check (due_date_offset_days is null or due_date_offset_days between 0 and 365),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table whatsapp_atendimento.integration_credentials (
  provider text primary key check (provider in ('bling')),
  ciphertext text not null,
  nonce text not null,
  expires_at timestamptz not null,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table whatsapp_atendimento.integration_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table whatsapp_atendimento.integration_jobs enable row level security;
alter table whatsapp_atendimento.customer_bling_contacts enable row level security;
alter table whatsapp_atendimento.bling_payment_mappings enable row level security;
alter table whatsapp_atendimento.integration_credentials enable row level security;
alter table whatsapp_atendimento.integration_oauth_states enable row level security;

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
