-- table: channel_flow_bindings
create table if not exists whatsapp_atendimento.channel_flow_bindings (
  channel text not null,
  whatsapp_account_id uuid not null,
  meta_flow_id text not null,
  flow_message_version text default '3'::text not null,
  flow_cta text default 'Montar cesta'::text not null,
  flow_action text default 'navigate'::text not null,
  first_screen text default 'GROUP'::text not null,
  updated_by uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint channel_flow_bindings_meta_flow_id_key UNIQUE (meta_flow_id),
  constraint channel_flow_bindings_whatsapp_account_id_key UNIQUE (whatsapp_account_id),
  constraint channel_flow_bindings_pkey PRIMARY KEY (channel),
  constraint channel_flow_bindings_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint channel_flow_bindings_first_screen_check CHECK ((first_screen = 'GROUP'::text)),
  constraint channel_flow_bindings_flow_action_check CHECK ((flow_action = 'navigate'::text)),
  constraint channel_flow_bindings_flow_cta_check CHECK (((length(flow_cta) >= 1) AND (length(flow_cta) <= 20))),
  constraint channel_flow_bindings_flow_message_version_check CHECK ((flow_message_version = '3'::text)),
  constraint channel_flow_bindings_meta_flow_id_check CHECK ((meta_flow_id ~ '^[0-9]{5,32}$'::text))
);
alter table whatsapp_atendimento.channel_flow_bindings enable row level security;
comment on table whatsapp_atendimento.channel_flow_bindings is 'Private greenfield mapping of each WhatsApp channel to its verified, published basket Flow; never exposed through the public API.';

-- table: channel_flow_uploads
create table if not exists whatsapp_atendimento.channel_flow_uploads (
  channel text not null,
  whatsapp_account_id uuid not null,
  meta_flow_id text not null,
  basket_id text not null,
  catalog_revision text not null,
  flow_json_sha256 text not null,
  uploaded_by uuid not null,
  uploaded_at timestamp with time zone default now() not null,
  constraint channel_flow_uploads_meta_flow_id_key UNIQUE (meta_flow_id),
  constraint channel_flow_uploads_pkey PRIMARY KEY (channel, meta_flow_id),
  constraint channel_flow_uploads_basket_id_check CHECK ((basket_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'::text)),
  constraint channel_flow_uploads_catalog_revision_check CHECK ((catalog_revision ~ '^[0-9a-f]{40}:[0-9a-f]{40}$'::text)),
  constraint channel_flow_uploads_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint channel_flow_uploads_flow_json_sha256_check CHECK ((flow_json_sha256 ~ '^[0-9a-f]{64}$'::text)),
  constraint channel_flow_uploads_meta_flow_id_check CHECK ((meta_flow_id ~ '^[0-9]{5,32}$'::text))
);
alter table whatsapp_atendimento.channel_flow_uploads enable row level security;
comment on table whatsapp_atendimento.channel_flow_uploads is 'Private evidence that a basket Flow JSON generated and validated by this greenfield Admin was uploaded to the corresponding Meta account.';

-- table: customer_bling_contacts
create table if not exists whatsapp_atendimento.customer_bling_contacts (
  customer_id uuid not null,
  bling_contact_id bigint not null,
  verified_at timestamp with time zone not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint customer_bling_contacts_bling_contact_id_key UNIQUE (bling_contact_id),
  constraint customer_bling_contacts_pkey PRIMARY KEY (customer_id),
  constraint customer_bling_contacts_bling_contact_id_check CHECK ((bling_contact_id > 0))
);
alter table whatsapp_atendimento.customer_bling_contacts enable row level security;

-- table: integration_credentials
create table if not exists whatsapp_atendimento.integration_credentials (
  provider text not null,
  ciphertext text not null,
  nonce text not null,
  expires_at timestamp with time zone not null,
  scopes text[] default '{}'::text[] not null,
  updated_at timestamp with time zone default now() not null,
  constraint integration_credentials_pkey PRIMARY KEY (provider),
  constraint integration_credentials_provider_check CHECK ((provider = 'bling'::text))
);
alter table whatsapp_atendimento.integration_credentials enable row level security;

-- table: integration_jobs
create table if not exists whatsapp_atendimento.integration_jobs (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  operation text not null,
  idempotency_key text not null,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  request_sha256 text,
  external_id text,
  result_summary jsonb default '{}'::jsonb not null,
  error_code text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint integration_jobs_idempotency_key_key UNIQUE (idempotency_key),
  constraint integration_jobs_order_id_operation_key UNIQUE (order_id, operation),
  constraint integration_jobs_pkey PRIMARY KEY (id),
  constraint integration_jobs_attempts_check CHECK ((attempts >= 0)),
  constraint integration_jobs_operation_check CHECK ((operation = ANY (ARRAY['create_sale'::text, 'generate_invoice'::text, 'read_invoice'::text, 'authorize_invoice'::text, 'start_dispatch'::text, 'complete_delivery'::text]))),
  constraint integration_jobs_request_sha256_check CHECK (((request_sha256 IS NULL) OR (request_sha256 ~ '^[0-9a-f]{64}$'::text))),
  constraint integration_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'unknown'::text, 'blocked'::text])))
);
alter table whatsapp_atendimento.integration_jobs enable row level security;

-- table: integration_oauth_states
create table if not exists whatsapp_atendimento.integration_oauth_states (
  state_hash text not null,
  created_by uuid not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint integration_oauth_states_pkey PRIMARY KEY (state_hash),
  constraint integration_oauth_states_state_hash_check CHECK ((state_hash ~ '^[0-9a-f]{64}$'::text))
);
alter table whatsapp_atendimento.integration_oauth_states enable row level security;

-- table: message_outbox
create table if not exists whatsapp_atendimento.message_outbox (
  id uuid default gen_random_uuid() not null,
  channel text not null,
  event_key text not null,
  message_type text not null,
  payload_iv text not null,
  payload_ciphertext text not null,
  status text default 'pending'::text not null,
  available_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  last_error_code text,
  provider_message_id text,
  provider_status text,
  provider_status_at timestamp with time zone,
  provider_error_code text,
  constraint message_outbox_channel_provider_message_id_key UNIQUE (channel, provider_message_id),
  constraint message_outbox_event_key_key UNIQUE (event_key),
  constraint message_outbox_pkey PRIMARY KEY (id),
  constraint message_outbox_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint message_outbox_message_type_check CHECK ((message_type = ANY (ARRAY['basket_menu'::text, 'flow_launch'::text, 'order_summary'::text, 'order_adjustment'::text, 'order_cancelled'::text]))),
  constraint message_outbox_provider_error_code_check CHECK (((provider_error_code IS NULL) OR (provider_error_code ~ '^[0-9]{1,12}$'::text))),
  constraint message_outbox_provider_message_id_check CHECK (((provider_message_id IS NULL) OR (provider_message_id ~ '^wamid[.][A-Za-z0-9._=-]{1,250}$'::text))),
  constraint message_outbox_provider_status_check CHECK (((provider_status IS NULL) OR (provider_status = ANY (ARRAY['accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))),
  constraint message_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);
alter table whatsapp_atendimento.message_outbox enable row level security;

-- table: order_drafts
create table if not exists whatsapp_atendimento.order_drafts (
  id uuid default gen_random_uuid() not null,
  channel text not null,
  phone_e164 text not null,
  session_id uuid not null,
  revision integer default 1 not null,
  status text not null,
  snapshot jsonb not null,
  summary_hash text not null,
  source_event_id text not null,
  expires_at timestamp with time zone not null,
  confirmed_order_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_drafts_channel_source_event_id_key UNIQUE (channel, source_event_id),
  constraint order_drafts_pkey PRIMARY KEY (id),
  constraint order_drafts_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint order_drafts_phone_e164_check CHECK ((phone_e164 ~ '^\+[1-9][0-9]{1,14}$'::text)),
  constraint order_drafts_revision_check CHECK ((revision > 0)),
  constraint order_drafts_status_check CHECK ((status = ANY (ARRAY['awaiting_customer_confirmation'::text, 'confirmed'::text, 'cancelled'::text, 'expired'::text, 'superseded'::text]))),
  constraint order_drafts_summary_hash_check CHECK ((summary_hash ~ '^[0-9a-f]{64}$'::text))
);
alter table whatsapp_atendimento.order_drafts enable row level security;

-- table: order_events
create table if not exists whatsapp_atendimento.order_events (
  id bigint generated always as identity not null,
  order_id uuid not null,
  event_key text not null,
  event_type text not null,
  event_data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint order_events_event_key_key UNIQUE (event_key),
  constraint order_events_pkey PRIMARY KEY (id),
  constraint order_events_event_type_check CHECK (((length(event_type) >= 1) AND (length(event_type) <= 80)))
);
alter table whatsapp_atendimento.order_events enable row level security;

-- table: order_items
create table if not exists whatsapp_atendimento.order_items (
  id bigint generated always as identity not null,
  order_id uuid not null,
  "position" integer not null,
  product_id text not null,
  quantity integer not null,
  unit_price_cents bigint not null,
  line_total_cents bigint not null,
  snapshot jsonb not null,
  picking_status text default 'pending'::text not null,
  group_id text default ''::text not null,
  picked_quantity integer default 0 not null,
  replacement_product_id text,
  replacement_snapshot jsonb,
  constraint order_items_order_id_position_key UNIQUE (order_id, "position"),
  constraint order_items_pkey PRIMARY KEY (id),
  constraint order_items_line_total_cents_check CHECK ((line_total_cents >= 0)),
  constraint order_items_picked_quantity_check CHECK ((picked_quantity >= 0)),
  constraint order_items_picking_status_check CHECK ((picking_status = ANY (ARRAY['pending'::text, 'separated'::text, 'missing'::text, 'partial'::text]))),
  constraint order_items_position_check CHECK (("position" > 0)),
  constraint order_items_quantity_check CHECK ((quantity >= 0)),
  constraint order_items_unit_price_cents_check CHECK ((unit_price_cents >= 0))
);
alter table whatsapp_atendimento.order_items enable row level security;

-- table: orders
create table if not exists whatsapp_atendimento.orders (
  id uuid default gen_random_uuid() not null,
  draft_id uuid not null,
  channel text not null,
  status text default 'received'::text not null,
  catalog_commit text not null,
  catalog_revision text not null,
  total_cents bigint not null,
  snapshot jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  revision integer default 1 not null,
  assigned_operator_id uuid,
  separation_completed_at timestamp with time zone,
  pending_customer_snapshot jsonb,
  pending_customer_total_cents bigint,
  customer_acceptance_status text default 'not_required'::text not null,
  bling_sale_id bigint,
  bling_sale_reference text,
  invoice_id bigint,
  invoice_status text default 'not_requested'::text not null,
  invoice_authorized_at timestamp with time zone,
  dispatched_at timestamp with time zone,
  completed_at timestamp with time zone,
  received_payment_cents bigint,
  received_payment_method text,
  attention_code text,
  constraint orders_draft_id_key UNIQUE (draft_id),
  constraint orders_pkey PRIMARY KEY (id),
  constraint orders_catalog_commit_check CHECK ((catalog_commit ~ '^[0-9a-f]{40}$'::text)),
  constraint orders_catalog_revision_check CHECK ((catalog_revision ~ '^[0-9a-f]{40}:[0-9a-f]{40}$'::text)),
  constraint orders_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint orders_customer_acceptance_status_check CHECK ((customer_acceptance_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'accepted'::text, 'rejected'::text]))),
  constraint orders_invoice_status_check CHECK ((invoice_status = ANY (ARRAY['not_requested'::text, 'pending'::text, 'authorized'::text, 'rejected'::text, 'unknown'::text]))),
  constraint orders_pending_customer_total_cents_check CHECK (((pending_customer_total_cents IS NULL) OR (pending_customer_total_cents >= 0))),
  constraint orders_received_payment_cents_check CHECK (((received_payment_cents IS NULL) OR (received_payment_cents >= 0))),
  constraint orders_received_payment_method_check CHECK (((received_payment_method IS NULL) OR (received_payment_method = ANY (ARRAY['pix'::text, 'cash'::text, 'debit_card'::text, 'credit_card'::text])))),
  constraint orders_revision_check CHECK ((revision > 0)),
  constraint orders_status_check CHECK ((status = ANY (ARRAY['received'::text, 'packing'::text, 'awaiting_invoice'::text, 'invoice_authorized'::text, 'out_for_delivery'::text, 'completed'::text, 'attention'::text, 'cancelled'::text]))),
  constraint orders_total_cents_check CHECK ((total_cents >= 0))
);
alter table whatsapp_atendimento.orders enable row level security;

-- table: outbox_pending_status_events
create table if not exists whatsapp_atendimento.outbox_pending_status_events (
  id bigint generated always as identity not null,
  event_key text not null,
  channel text not null,
  provider_message_id text not null,
  provider_status text not null,
  provider_status_at timestamp with time zone not null,
  provider_error_code text,
  expires_at timestamp with time zone default (now() + '00:30:00'::interval) not null,
  created_at timestamp with time zone default now() not null,
  constraint outbox_pending_status_events_event_key_key UNIQUE (event_key),
  constraint outbox_pending_status_events_pkey PRIMARY KEY (id),
  constraint outbox_pending_status_events_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint outbox_pending_status_events_event_key_check CHECK ((event_key ~ '^[0-9a-f]{64}$'::text)),
  constraint outbox_pending_status_events_provider_error_code_check CHECK (((provider_error_code IS NULL) OR (provider_error_code ~ '^[0-9]{1,12}$'::text))),
  constraint outbox_pending_status_events_provider_message_id_check CHECK ((provider_message_id ~ '^wamid[.][A-Za-z0-9._=-]{1,250}$'::text)),
  constraint outbox_pending_status_events_provider_status_check CHECK ((provider_status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);
alter table whatsapp_atendimento.outbox_pending_status_events enable row level security;

-- table: webhook_events
create table if not exists whatsapp_atendimento.webhook_events (
  id bigint generated always as identity not null,
  channel text not null,
  message_id text not null,
  message_type text not null,
  body_sha256 text not null,
  received_at timestamp with time zone default now() not null,
  constraint webhook_events_channel_message_id_key UNIQUE (channel, message_id),
  constraint webhook_events_pkey PRIMARY KEY (id),
  constraint webhook_events_body_sha256_check CHECK ((body_sha256 ~ '^[0-9a-f]{64}$'::text)),
  constraint webhook_events_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint webhook_events_message_id_check CHECK (((length(message_id) >= 1) AND (length(message_id) <= 256))),
  constraint webhook_events_message_type_check CHECK (((length(message_type) >= 1) AND (length(message_type) <= 40)))
);
alter table whatsapp_atendimento.webhook_events enable row level security;
