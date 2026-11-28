-- table: da_instagram_automation_cron_token_v1
create table if not exists private.da_instagram_automation_cron_token_v1 (
  id smallint not null,
  token_hash text not null,
  created_at timestamp with time zone default now() not null,
  constraint da_instagram_automation_cron_token_v1_pkey PRIMARY KEY (id),
  constraint da_instagram_automation_cron_token_v1_id_check CHECK ((id = 1)),
  constraint da_instagram_automation_cron_token_v1_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);
alter table private.da_instagram_automation_cron_token_v1 enable row level security;

-- table: da_offer_rotation_state_v1
create table if not exists private.da_offer_rotation_state_v1 (
  id integer not null,
  cycle_started_at timestamp with time zone,
  last_run_at timestamp with time zone,
  enabled boolean default true not null,
  daily_product_count integer default 30 not null,
  min_discount_percent integer default 5 not null,
  max_discount_percent integer default 15 not null,
  min_gross_margin_percent numeric(5,2) default 5 not null,
  last_rotation_date date,
  last_rotation_count integer default 0 not null,
  constraint da_offer_rotation_state_v1_pkey PRIMARY KEY (id),
  constraint da_offer_rotation_daily_count_check CHECK (((daily_product_count >= 1) AND (daily_product_count <= 100))),
  constraint da_offer_rotation_discount_range_check CHECK ((((min_discount_percent >= 5) AND (min_discount_percent <= 15)) AND ((max_discount_percent >= min_discount_percent) AND (max_discount_percent <= 15)))),
  constraint da_offer_rotation_margin_check CHECK (((min_gross_margin_percent >= (0)::numeric) AND (min_gross_margin_percent <= (50)::numeric)))
);
alter table private.da_offer_rotation_state_v1 enable row level security;

-- table: da_offer_status_image_cron_token_v1
create table if not exists private.da_offer_status_image_cron_token_v1 (
  id smallint not null,
  token_hash text not null,
  constraint da_offer_status_image_cron_token_v1_pkey PRIMARY KEY (id),
  constraint da_offer_status_image_cron_token_v1_id_check CHECK ((id = 1)),
  constraint da_offer_status_image_cron_token_v1_token_hash_check CHECK ((length(token_hash) = 64))
);

-- table: ops4_meta_postorder_commands_v1
create table if not exists private.ops4_meta_postorder_commands_v1 (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  requested_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  claimed_at timestamp with time zone,
  request_id bigint,
  status text default 'queued'::text not null,
  constraint ops4_meta_postorder_commands_v1_token_hash_key UNIQUE (token_hash),
  constraint ops4_meta_postorder_commands_v1_pkey PRIMARY KEY (id),
  constraint ops4_meta_postorder_commands_v1_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'claimed'::text]))),
  constraint ops4_meta_postorder_commands_v1_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);
alter table private.ops4_meta_postorder_commands_v1 enable row level security;

-- table: ops4_postorder_dispatch_commands_v1
create table if not exists private.ops4_postorder_dispatch_commands_v1 (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  expires_at timestamp with time zone not null,
  claimed_at timestamp with time zone,
  request_id bigint,
  created_at timestamp with time zone default now() not null,
  constraint ops4_postorder_dispatch_commands_v1_token_hash_key UNIQUE (token_hash),
  constraint ops4_postorder_dispatch_commands_v1_pkey PRIMARY KEY (id),
  constraint ops4_postorder_dispatch_commands_v1_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);
alter table private.ops4_postorder_dispatch_commands_v1 enable row level security;

-- table: ops4_postorder_followups_v1
create table if not exists private.ops4_postorder_followups_v1 (
  order_id uuid not null,
  whatsapp_account_id uuid not null,
  phone_e164 text not null,
  channel text not null,
  offer_status text default 'pending'::text not null,
  offer_provider_message_id text,
  confirm_due_at timestamp with time zone not null,
  confirm_status text default 'pending'::text not null,
  confirm_nonce_hash text,
  confirm_total numeric,
  confirm_order_updated_at timestamp with time zone,
  confirm_provider_message_id text,
  reply_provider_message_id text,
  claimed_at timestamp with time zone,
  sent_at timestamp with time zone,
  expires_at timestamp with time zone default (now() + '48:00:00'::interval) not null,
  last_error text,
  attempts integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops4_postorder_followups_v1_pkey PRIMARY KEY (order_id),
  constraint ops4_postorder_followups_v1_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint ops4_postorder_followups_v1_confirm_nonce_hash_check CHECK (((confirm_nonce_hash IS NULL) OR (confirm_nonce_hash ~ '^[a-f0-9]{64}$'::text))),
  constraint ops4_postorder_followups_v1_confirm_status_check CHECK ((confirm_status = ANY (ARRAY['pending'::text, 'claimed'::text, 'sent'::text, 'failed'::text, 'suppressed'::text, 'confirmed'::text, 'changes_requested'::text, 'conflict'::text]))),
  constraint ops4_postorder_followups_v1_offer_status_check CHECK ((offer_status = ANY (ARRAY['pending'::text, 'sent'::text, 'skipped'::text, 'failed'::text, 'uncertain'::text])))
);
alter table private.ops4_postorder_followups_v1 enable row level security;

-- table: order_addon_operations_v1
create table if not exists private.order_addon_operations_v1 (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  order_id uuid not null,
  request_key text not null,
  payload_fingerprint text not null,
  status text default 'pending'::text not null,
  result jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint order_addon_operations_v1_session_id_request_key_key UNIQUE (session_id, request_key),
  constraint order_addon_operations_v1_pkey PRIMARY KEY (id),
  constraint order_addon_operations_v1_payload_fingerprint_check CHECK ((payload_fingerprint ~ '^[a-f0-9]{64}$'::text)),
  constraint order_addon_operations_v1_request_key_check CHECK ((request_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'::text)),
  constraint order_addon_operations_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'applied'::text, 'rejected'::text])))
);
alter table private.order_addon_operations_v1 enable row level security;

-- table: order_addon_runtime_v1
create table if not exists private.order_addon_runtime_v1 (
  singleton boolean default true not null,
  enabled boolean default false not null,
  window_minutes integer default 20 not null,
  max_operations integer default 5 not null,
  max_distinct_products_per_operation integer default 20 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  constraint order_addon_runtime_v1_pkey PRIMARY KEY (singleton),
  constraint order_addon_runtime_v1_max_distinct_products_per_operatio_check CHECK (((max_distinct_products_per_operation >= 1) AND (max_distinct_products_per_operation <= 40))),
  constraint order_addon_runtime_v1_max_operations_check CHECK (((max_operations >= 1) AND (max_operations <= 20))),
  constraint order_addon_runtime_v1_singleton_check CHECK (singleton),
  constraint order_addon_runtime_v1_window_minutes_check CHECK (((window_minutes >= 1) AND (window_minutes <= 120)))
);
alter table private.order_addon_runtime_v1 enable row level security;

-- table: order_addon_sessions_v1
create table if not exists private.order_addon_sessions_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  token_hash text not null,
  status text default 'open'::text not null,
  source text default 'post_checkout'::text not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  closed_at timestamp with time zone,
  close_reason text,
  operation_count integer default 0 not null,
  max_operations integer default 5 not null,
  metadata jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_addon_sessions_v1_token_hash_key UNIQUE (token_hash),
  constraint order_addon_sessions_v1_pkey PRIMARY KEY (id),
  constraint order_addon_sessions_v1_check CHECK ((expires_at > created_at)),
  constraint order_addon_sessions_v1_max_operations_check CHECK (((max_operations >= 1) AND (max_operations <= 20))),
  constraint order_addon_sessions_v1_operation_count_check CHECK ((operation_count >= 0)),
  constraint order_addon_sessions_v1_source_check CHECK ((source ~ '^[a-z0-9][a-z0-9_-]{0,39}$'::text)),
  constraint order_addon_sessions_v1_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'expired'::text]))),
  constraint order_addon_sessions_v1_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);
alter table private.order_addon_sessions_v1 enable row level security;

-- table: order_customer_actions_v1
create table if not exists private.order_customer_actions_v1 (
  order_id uuid not null,
  token_hash text not null,
  issued_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  confirmed_at timestamp with time zone,
  confirmed_total numeric(14,2),
  source text default 'whatsapp_order_utility'::text not null,
  constraint order_customer_actions_v1_token_hash_key UNIQUE (token_hash),
  constraint order_customer_actions_v1_pkey PRIMARY KEY (order_id),
  constraint order_customer_actions_expiry_check CHECK ((expires_at > issued_at)),
  constraint order_customer_actions_v1_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);
alter table private.order_customer_actions_v1 enable row level security;

-- table: product_image_runtime_state_v2
create table if not exists private.product_image_runtime_state_v2 (
  id boolean default true not null,
  initial_sync_dispatched_at timestamp with time zone,
  initial_drain_completed_at timestamp with time zone,
  last_maintenance_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  lock_token uuid,
  lock_until timestamp with time zone,
  constraint product_image_runtime_state_v2_pkey PRIMARY KEY (id),
  constraint product_image_runtime_state_v2_id_check CHECK (id)
);

-- table: whatsapp_ana_admin_draft_v1
create table if not exists private.whatsapp_ana_admin_draft_v1 (
  singleton boolean default true not null,
  configuration jsonb not null,
  revision bigint default 1 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  constraint whatsapp_ana_admin_draft_v1_pkey PRIMARY KEY (singleton),
  constraint whatsapp_ana_admin_draft_v1_configuration_check CHECK ((jsonb_typeof(configuration) = 'object'::text)),
  constraint whatsapp_ana_admin_draft_v1_revision_check CHECK ((revision > 0)),
  constraint whatsapp_ana_admin_draft_v1_singleton_check CHECK (singleton)
);
alter table private.whatsapp_ana_admin_draft_v1 enable row level security;

-- table: whatsapp_ana_admin_events_v1
create table if not exists private.whatsapp_ana_admin_events_v1 (
  id bigint generated by default as identity not null,
  action text not null,
  actor_id uuid,
  version_id bigint,
  draft_revision bigint,
  channel_key text,
  detail jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_ana_admin_events_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_ana_admin_events_v1_action_check CHECK ((action = ANY (ARRAY['draft_saved'::text, 'published'::text, 'rolled_back'::text, 'channel_toggled'::text]))),
  constraint whatsapp_ana_admin_events_v1_detail_check CHECK ((jsonb_typeof(detail) = 'object'::text))
);
alter table private.whatsapp_ana_admin_events_v1 enable row level security;

-- table: whatsapp_ana_admin_runtime_v1
create table if not exists private.whatsapp_ana_admin_runtime_v1 (
  singleton boolean default true not null,
  active_version_id bigint not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  constraint whatsapp_ana_admin_runtime_v1_pkey PRIMARY KEY (singleton),
  constraint whatsapp_ana_admin_runtime_v1_singleton_check CHECK (singleton)
);
alter table private.whatsapp_ana_admin_runtime_v1 enable row level security;

-- table: whatsapp_ana_admin_test_runs_v1
create table if not exists private.whatsapp_ana_admin_test_runs_v1 (
  id uuid default gen_random_uuid() not null,
  draft_revision bigint not null,
  scenario_keys text[] default '{}'::text[] not null,
  passed_count integer not null,
  failed_count integer not null,
  safe_reasons jsonb default '[]'::jsonb not null,
  latency_ms integer default 0 not null,
  actor_id uuid,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_ana_admin_test_runs_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_ana_admin_test_runs_v1_failed_count_check CHECK ((failed_count >= 0)),
  constraint whatsapp_ana_admin_test_runs_v1_latency_ms_check CHECK ((latency_ms >= 0)),
  constraint whatsapp_ana_admin_test_runs_v1_passed_count_check CHECK ((passed_count >= 0)),
  constraint whatsapp_ana_admin_test_runs_v1_safe_reasons_check CHECK ((jsonb_typeof(safe_reasons) = 'array'::text))
);
alter table private.whatsapp_ana_admin_test_runs_v1 enable row level security;

-- table: whatsapp_ana_admin_versions_v1
create table if not exists private.whatsapp_ana_admin_versions_v1 (
  id bigint generated by default as identity not null,
  version integer not null,
  configuration jsonb not null,
  actor_id uuid,
  change_note text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_ana_admin_versions_v1_version_key UNIQUE (version),
  constraint whatsapp_ana_admin_versions_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_ana_admin_versions_v1_configuration_check CHECK ((jsonb_typeof(configuration) = 'object'::text)),
  constraint whatsapp_ana_admin_versions_v1_version_check CHECK ((version > 0))
);
alter table private.whatsapp_ana_admin_versions_v1 enable row level security;
