-- table: flow_catalog_snapshots_v1
create table if not exists whatsapp_ordering_private.flow_catalog_snapshots_v1 (
  snapshot_hash text not null,
  schema_version text not null,
  basket_template_id uuid not null,
  basket_mold_id uuid not null,
  snapshot_json jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint flow_catalog_snapshot_scope_key UNIQUE (snapshot_hash, basket_template_id, basket_mold_id),
  constraint flow_catalog_snapshots_v1_pkey PRIMARY KEY (snapshot_hash),
  constraint flow_catalog_snapshot_size_check CHECK ((pg_column_size(snapshot_json) <= 262144)),
  constraint flow_catalog_snapshots_v1_schema_version_check CHECK (((length(btrim(schema_version)) >= 1) AND (length(btrim(schema_version)) <= 64))),
  constraint flow_catalog_snapshots_v1_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
  constraint flow_catalog_snapshots_v1_snapshot_json_check CHECK ((jsonb_typeof(snapshot_json) = 'object'::text))
);
alter table whatsapp_ordering_private.flow_catalog_snapshots_v1 enable row level security;
comment on table whatsapp_ordering_private.flow_catalog_snapshots_v1 is 'Immutable content-addressed projection of canonical Supabase basket configuration for one Flow revision. Never stores product cost or secrets.';

-- table: meta_catalog_product_links_v1
create table if not exists whatsapp_ordering_private.meta_catalog_product_links_v1 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid not null,
  catalog_id text not null,
  product_retailer_id text not null,
  product_id uuid not null,
  status text default 'needs_review'::text not null,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint meta_catalog_product_links_account_catalog_retailer_key UNIQUE (whatsapp_account_id, catalog_id, product_retailer_id),
  constraint meta_catalog_product_links_v1_pkey PRIMARY KEY (id),
  constraint meta_catalog_product_links_active_verified_check CHECK (((status <> 'active'::text) OR (verified_at IS NOT NULL))),
  constraint meta_catalog_product_links_v1_catalog_id_check CHECK (((length(btrim(catalog_id)) >= 1) AND (length(btrim(catalog_id)) <= 256))),
  constraint meta_catalog_product_links_v1_product_retailer_id_check CHECK (((length(btrim(product_retailer_id)) >= 1) AND (length(btrim(product_retailer_id)) <= 256))),
  constraint meta_catalog_product_links_v1_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'needs_review'::text])))
);
alter table whatsapp_ordering_private.meta_catalog_product_links_v1 enable row level security;
comment on table whatsapp_ordering_private.meta_catalog_product_links_v1 is 'Verified mapping from a specific WhatsApp account/catalog retailer ID to one canonical Supabase product. Webhook item_price is never authoritative.';

-- table: whatsapp_flow_keyring_v1
create table if not exists whatsapp_ordering_private.whatsapp_flow_keyring_v1 (
  whatsapp_account_id uuid not null,
  meta_phone_number_id text not null,
  vault_secret_name text not null,
  key_status text default 'pending_key_provisioning'::text not null,
  private_key_sha256 text,
  meta_public_key_fingerprint text,
  verified_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_flow_keyring_v1_meta_phone_number_id_key UNIQUE (meta_phone_number_id),
  constraint whatsapp_flow_keyring_v1_vault_secret_name_key UNIQUE (vault_secret_name),
  constraint whatsapp_flow_keyring_v1_pkey PRIMARY KEY (whatsapp_account_id),
  constraint whatsapp_flow_keyring_ready_check CHECK (((key_status <> 'ready'::text) OR ((private_key_sha256 IS NOT NULL) AND (meta_public_key_fingerprint IS NOT NULL) AND (verified_at IS NOT NULL)))),
  constraint whatsapp_flow_keyring_v1_key_status_check CHECK ((key_status = ANY (ARRAY['pending_key_provisioning'::text, 'pending_meta_verification'::text, 'ready'::text, 'disabled'::text]))),
  constraint whatsapp_flow_keyring_v1_meta_phone_number_id_check CHECK (((length(btrim(meta_phone_number_id)) >= 1) AND (length(btrim(meta_phone_number_id)) <= 128))),
  constraint whatsapp_flow_keyring_v1_meta_public_key_fingerprint_check CHECK (((meta_public_key_fingerprint IS NULL) OR (meta_public_key_fingerprint ~ '^[0-9a-f]{64}$'::text))),
  constraint whatsapp_flow_keyring_v1_private_key_sha256_check CHECK (((private_key_sha256 IS NULL) OR (private_key_sha256 ~ '^[0-9a-f]{64}$'::text))),
  constraint whatsapp_flow_keyring_v1_vault_secret_name_check CHECK ((vault_secret_name ~ '^[a-z0-9_]{1,120}$'::text))
);
alter table whatsapp_ordering_private.whatsapp_flow_keyring_v1 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_flow_keyring_v1 is 'Private per-line key map. The historical 1018 Vault key is only a candidate; state stays non-ready until its Meta public-key registration is read back and verified.';

-- table: whatsapp_flow_send_attempts_v1
create table if not exists whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 (
  id uuid default gen_random_uuid() not null,
  idempotency_key uuid not null,
  actor_id uuid not null,
  whatsapp_account_id uuid not null,
  conversation_id uuid not null,
  customer_id uuid,
  basket_template_id uuid not null,
  basket_mold_id uuid not null,
  flow_binding_id uuid not null,
  flow_session_id uuid,
  to_phone_e164 text not null,
  meta_flow_id text not null,
  flow_json_version text not null,
  flow_message_version text not null,
  data_api_version text not null,
  flow_cta text not null,
  body_text text not null,
  status text default 'preparing'::text not null,
  provider_message_id text,
  error_code text,
  claimed_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_flow_send_attempts_v1_idempotency_key_key UNIQUE (idempotency_key),
  constraint whatsapp_flow_send_attempts_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_flow_send_attempt_receipt_check CHECK (((status <> 'sent'::text) OR (COALESCE(provider_message_id, ''::text) ~ '^wamid\.[A-Za-z0-9_=-]{10,240}$'::text))),
  constraint whatsapp_flow_send_attempts_v1_body_text_check CHECK (((length(btrim(body_text)) >= 1) AND (length(btrim(body_text)) <= 1024))),
  constraint whatsapp_flow_send_attempts_v1_data_api_version_check CHECK (((length(btrim(data_api_version)) >= 1) AND (length(btrim(data_api_version)) <= 32))),
  constraint whatsapp_flow_send_attempts_v1_error_code_check CHECK (((error_code IS NULL) OR (error_code ~ '^[a-z0-9_]{1,80}$'::text))),
  constraint whatsapp_flow_send_attempts_v1_flow_cta_check CHECK (((length(btrim(flow_cta)) >= 1) AND (length(btrim(flow_cta)) <= 20))),
  constraint whatsapp_flow_send_attempts_v1_flow_json_version_check CHECK (((length(btrim(flow_json_version)) >= 1) AND (length(btrim(flow_json_version)) <= 16))),
  constraint whatsapp_flow_send_attempts_v1_flow_message_version_check CHECK (((length(btrim(flow_message_version)) >= 1) AND (length(btrim(flow_message_version)) <= 8))),
  constraint whatsapp_flow_send_attempts_v1_meta_flow_id_check CHECK ((meta_flow_id ~ '^[0-9]{6,32}$'::text)),
  constraint whatsapp_flow_send_attempts_v1_status_check CHECK ((status = ANY (ARRAY['preparing'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'needs_review'::text]))),
  constraint whatsapp_flow_send_attempts_v1_to_phone_e164_check CHECK ((to_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'::text))
);
alter table whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 is 'One-shot Flow CTA send state; never stores the opaque Flow token. Ambiguous deliveries stay needs_review and are never retried automatically.';

-- table: whatsapp_flow_sessions_v2
create table if not exists whatsapp_ordering_private.whatsapp_flow_sessions_v2 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid not null,
  meta_waba_id text not null,
  meta_phone_number_id text not null,
  meta_flow_id text not null,
  flow_schema_version text not null,
  data_api_version text not null,
  basket_template_id uuid not null,
  basket_mold_id uuid not null,
  snapshot_hash text not null,
  token_hash text not null,
  sender_phone_e164 text not null,
  conversation_id uuid,
  customer_id uuid,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_flow_sessions_v2_token_hash_key UNIQUE (token_hash),
  constraint whatsapp_flow_sessions_v2_pkey PRIMARY KEY (id),
  constraint whatsapp_flow_sessions_v2_data_api_version_check CHECK (((length(btrim(data_api_version)) >= 1) AND (length(btrim(data_api_version)) <= 32))),
  constraint whatsapp_flow_sessions_v2_expiry_check CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '24:00:00'::interval)))),
  constraint whatsapp_flow_sessions_v2_flow_schema_version_check CHECK (((length(btrim(flow_schema_version)) >= 1) AND (length(btrim(flow_schema_version)) <= 32))),
  constraint whatsapp_flow_sessions_v2_meta_flow_id_check CHECK (((length(btrim(meta_flow_id)) >= 1) AND (length(btrim(meta_flow_id)) <= 128))),
  constraint whatsapp_flow_sessions_v2_meta_phone_number_id_check CHECK (((length(btrim(meta_phone_number_id)) >= 1) AND (length(btrim(meta_phone_number_id)) <= 128))),
  constraint whatsapp_flow_sessions_v2_meta_waba_id_check CHECK (((length(btrim(meta_waba_id)) >= 1) AND (length(btrim(meta_waba_id)) <= 128))),
  constraint whatsapp_flow_sessions_v2_sender_phone_e164_check CHECK ((sender_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'::text)),
  constraint whatsapp_flow_sessions_v2_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
  constraint whatsapp_flow_sessions_v2_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);
alter table whatsapp_ordering_private.whatsapp_flow_sessions_v2 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_flow_sessions_v2 is 'Versioned private Flow session for the greenfield Supabase snapshot contract; separate from the legacy Git-backed public.whatsapp_flow_sessions table.';

-- table: whatsapp_identity_review_states_v1
create table if not exists whatsapp_ordering_private.whatsapp_identity_review_states_v1 (
  event_id uuid not null,
  state text default 'acknowledged'::text not null,
  reviewed_by uuid not null,
  reviewed_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_identity_review_states_v1_pkey PRIMARY KEY (event_id),
  constraint whatsapp_identity_review_states_v1_state_check CHECK ((state = 'acknowledged'::text))
);
alter table whatsapp_ordering_private.whatsapp_identity_review_states_v1 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_identity_review_states_v1 is 'Private acknowledgement state for an individual Meta inbound event without verified E.164; it does not establish customer identity or enable outbound messaging.';

-- table: whatsapp_order_confirmation_events_v1
create table if not exists whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
  webhook_event_id uuid not null,
  order_intent_id uuid not null,
  outcome text not null,
  issue_code text,
  quote_revision integer not null,
  order_id uuid,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_order_confirmation_events_v1_pkey PRIMARY KEY (webhook_event_id),
  constraint whatsapp_order_confirmation_event_order_outcome_check CHECK ((((outcome = ANY (ARRAY['converted'::text, 'already_converted'::text])) AND (order_id IS NOT NULL)) OR ((outcome <> ALL (ARRAY['converted'::text, 'already_converted'::text])) AND (order_id IS NULL)))),
  constraint whatsapp_order_confirmation_events_v1_outcome_check CHECK ((outcome = ANY (ARRAY['converted'::text, 'reprice_required'::text, 'needs_review'::text, 'ignored'::text, 'already_converted'::text]))),
  constraint whatsapp_order_confirmation_events_v1_quote_revision_check CHECK ((quote_revision >= 0))
);
alter table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 is 'Private idempotency ledger for inbound WhatsApp order-confirmation button events. Contains outcome codes, never raw webhook payloads or tokens.';

-- table: whatsapp_order_flow_bindings_v1
create table if not exists whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid not null,
  meta_flow_id text not null,
  flow_json_version text not null,
  data_api_version text not null,
  flow_message_version text not null,
  flow_action text default 'data_exchange'::text not null,
  flow_status text not null,
  flow_cta text not null,
  body_text text not null,
  is_verified boolean default false not null,
  is_send_enabled boolean default false not null,
  verified_at timestamp with time zone,
  verified_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_order_flow_binding_account_flow_key UNIQUE (whatsapp_account_id, meta_flow_id, flow_json_version),
  constraint whatsapp_order_flow_bindings_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_order_flow_binding_send_gate_check CHECK (((NOT is_send_enabled) OR (is_verified AND (upper(flow_status) = 'PUBLISHED'::text) AND (verified_at IS NOT NULL)))),
  constraint whatsapp_order_flow_bindings_v1_body_text_check CHECK (((length(btrim(body_text)) >= 1) AND (length(btrim(body_text)) <= 1024))),
  constraint whatsapp_order_flow_bindings_v1_data_api_version_check CHECK (((length(btrim(data_api_version)) >= 1) AND (length(btrim(data_api_version)) <= 32))),
  constraint whatsapp_order_flow_bindings_v1_flow_action_check CHECK ((flow_action = 'data_exchange'::text)),
  constraint whatsapp_order_flow_bindings_v1_flow_cta_check CHECK (((length(btrim(flow_cta)) >= 1) AND (length(btrim(flow_cta)) <= 20))),
  constraint whatsapp_order_flow_bindings_v1_flow_json_version_check CHECK (((length(btrim(flow_json_version)) >= 1) AND (length(btrim(flow_json_version)) <= 16))),
  constraint whatsapp_order_flow_bindings_v1_flow_message_version_check CHECK (((length(btrim(flow_message_version)) >= 1) AND (length(btrim(flow_message_version)) <= 8))),
  constraint whatsapp_order_flow_bindings_v1_flow_status_check CHECK (((length(btrim(flow_status)) >= 1) AND (length(btrim(flow_status)) <= 32))),
  constraint whatsapp_order_flow_bindings_v1_meta_flow_id_check CHECK ((meta_flow_id ~ '^[0-9]{6,32}$'::text))
);
alter table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 is 'Versioned order Flow bindings per Meta sender. Multiple published basket Flows may be enabled for one sender, with one enabled revision per Meta Flow ID. Separate from the legacy registration_flow binding; sending is gated on verified and explicitly enabled state. Stores no private encryption key.';

-- table: whatsapp_order_intents_v1
create table if not exists whatsapp_ordering_private.whatsapp_order_intents_v1 (
  id uuid default gen_random_uuid() not null,
  source_event_id uuid not null,
  whatsapp_account_id uuid not null,
  meta_waba_id text not null,
  conversation_id uuid,
  customer_id uuid,
  source_kind text not null,
  meta_message_id text not null,
  meta_phone_number_id text not null,
  sender_provider_id text,
  sender_phone_e164 text,
  catalog_id text,
  flow_session_id uuid,
  flow_reply_to_message_id text,
  flow_name text,
  flow_schema_version text,
  status text default 'received'::text not null,
  quote_revision integer default 0 not null,
  currency text,
  quote_total_cents bigint,
  intake_snapshot jsonb default '{}'::jsonb not null,
  quote_snapshot jsonb default '{}'::jsonb not null,
  customer_snapshot jsonb default '{}'::jsonb not null,
  delivery_snapshot jsonb default '{}'::jsonb not null,
  payment_method text,
  summary_hash text,
  confirmation_token_hash text,
  confirmation_message_id text,
  confirmation_event_id uuid,
  confirmed_order_id uuid,
  last_error_code text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  quoted_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  converted_at timestamp with time zone,
  constraint whatsapp_order_intents_v1_confirmation_event_id_key UNIQUE (confirmation_event_id),
  constraint whatsapp_order_intents_v1_confirmed_order_id_key UNIQUE (confirmed_order_id),
  constraint whatsapp_order_intents_v1_source_event_id_key UNIQUE (source_event_id),
  constraint whatsapp_order_intents_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_order_intents_catalog_fields_check CHECK ((((source_kind = 'catalog'::text) AND ((status = 'needs_review'::text) OR (NULLIF(btrim(catalog_id), ''::text) IS NOT NULL))) OR ((source_kind = 'flow'::text) AND (catalog_id IS NULL)))),
  constraint whatsapp_order_intents_conversion_state_check CHECK ((((status = 'converted'::text) AND (confirmed_order_id IS NOT NULL) AND (converted_at IS NOT NULL)) OR ((status <> 'converted'::text) AND (confirmed_order_id IS NULL) AND (converted_at IS NULL)))),
  constraint whatsapp_order_intents_identity_check CHECK (((sender_phone_e164 IS NOT NULL) OR (NULLIF(btrim(sender_provider_id), ''::text) IS NOT NULL))),
  constraint whatsapp_order_intents_v1_currency_check CHECK (((currency IS NULL) OR (currency ~ '^[A-Z]{3}$'::text))),
  constraint whatsapp_order_intents_v1_intake_snapshot_check CHECK ((jsonb_typeof(intake_snapshot) = 'object'::text)),
  constraint whatsapp_order_intents_v1_meta_message_id_check CHECK (((length(btrim(meta_message_id)) >= 1) AND (length(btrim(meta_message_id)) <= 256))),
  constraint whatsapp_order_intents_v1_meta_phone_number_id_check CHECK (((length(btrim(meta_phone_number_id)) >= 1) AND (length(btrim(meta_phone_number_id)) <= 128))),
  constraint whatsapp_order_intents_v1_meta_waba_id_check CHECK (((length(btrim(meta_waba_id)) >= 1) AND (length(btrim(meta_waba_id)) <= 128))),
  constraint whatsapp_order_intents_v1_quote_revision_check CHECK ((quote_revision >= 0)),
  constraint whatsapp_order_intents_v1_quote_total_cents_check CHECK (((quote_total_cents IS NULL) OR (quote_total_cents >= 0))),
  constraint whatsapp_order_intents_v1_sender_phone_e164_check CHECK (((sender_phone_e164 IS NULL) OR (sender_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'::text))),
  constraint whatsapp_order_intents_v1_source_kind_check CHECK ((source_kind = ANY (ARRAY['flow'::text, 'catalog'::text]))),
  constraint whatsapp_order_intents_v1_status_check CHECK ((status = ANY (ARRAY['received'::text, 'needs_review'::text, 'awaiting_confirmation'::text, 'reprice_required'::text, 'declined'::text, 'converted'::text])))
);
alter table whatsapp_ordering_private.whatsapp_order_intents_v1 enable row level security;
comment on table whatsapp_ordering_private.whatsapp_order_intents_v1 is 'Private, non-expiring business intents for individual WhatsApp Flow submissions and Meta Catalog carts. Does not create canonical orders until explicit confirmation.';
