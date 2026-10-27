-- Local-only snapshot reconstructed from the selected Supabase catalog on 2026-10-26.
-- Schema only: no customer, product, integration, or other row data is copied.
-- Do not apply to production: reconcile the two existing remote migration versions before any remote deployment.
-- The remote schema grants service_role access to existing tables and has no staff policies yet.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE app_private.image_import_queue (
  product_id uuid NOT NULL,
  source_project_ref text NOT NULL,
  source_url text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  target_storage_path text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE app_private.integration_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  account_ref text NOT NULL,
  secret_reference text,
  enabled boolean DEFAULT false NOT NULL,
  external_writes_enabled boolean DEFAULT false NOT NULL,
  safe_config jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE app_private.migration_xref (
  entity_type text NOT NULL,
  source_project_ref text NOT NULL,
  source_id text NOT NULL,
  target_id uuid NOT NULL,
  source_fingerprint text,
  imported_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE app_private.outbox_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'blocked'::text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  available_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE app_private.webhook_inbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  payload jsonb NOT NULL,
  signature_valid boolean DEFAULT false NOT NULL,
  status text DEFAULT 'received'::text NOT NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone
);

CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details_redacted jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.basket_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  basket_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(12,3) NOT NULL
);

CREATE TABLE public.basket_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  price_cents bigint,
  active boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  label text,
  street text,
  house_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  reference text,
  is_default boolean DEFAULT false NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  kind text NOT NULL,
  value_normalized text NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  tax_id text,
  bling_contact_id bigint,
  marketing_opt_in boolean,
  marketing_consent_verified boolean DEFAULT false NOT NULL,
  marketing_consent_updated_at timestamp with time zone,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.external_entity_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  entity_type text NOT NULL,
  local_entity_id uuid NOT NULL,
  external_id text NOT NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.inventory_reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(12,3) NOT NULL,
  state text DEFAULT 'held'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sku_snapshot text,
  name_snapshot text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  price_cents bigint NOT NULL,
  total_cents bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_number bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  customer_id uuid,
  status text DEFAULT 'draft'::text NOT NULL,
  payment_method text,
  idempotency_key text NOT NULL,
  subtotal_cents bigint DEFAULT 0 NOT NULL,
  delivery_cents bigint DEFAULT 0 NOT NULL,
  total_cents bigint DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_identifiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  kind text NOT NULL,
  value text NOT NULL,
  packaging_unit text,
  conversion_factor numeric(14,3),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  storage_path text NOT NULL,
  alt_text text,
  "position" integer DEFAULT 0 NOT NULL,
  verified boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sku text,
  name text NOT NULL,
  gtin text,
  brand text,
  category text,
  subcategory text,
  description_short text,
  unit text,
  price_cents bigint,
  cost_cents bigint,
  stock_units numeric(14,3) DEFAULT 0 NOT NULL,
  bling_product_id bigint,
  active boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  review_status text DEFAULT 'needs_review'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.staff_profiles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE app_private.image_import_queue ADD CONSTRAINT image_import_queue_pkey PRIMARY KEY (product_id);

ALTER TABLE app_private.integration_accounts ADD CONSTRAINT integration_accounts_pkey PRIMARY KEY (id);

ALTER TABLE app_private.integration_accounts ADD CONSTRAINT integration_accounts_provider_account_ref_key UNIQUE (provider, account_ref);

ALTER TABLE app_private.migration_xref ADD CONSTRAINT migration_xref_pkey PRIMARY KEY (entity_type, source_project_ref, source_id);

ALTER TABLE app_private.outbox_jobs ADD CONSTRAINT outbox_jobs_pkey PRIMARY KEY (id);

ALTER TABLE app_private.outbox_jobs ADD CONSTRAINT outbox_jobs_provider_idempotency_key_key UNIQUE (provider, idempotency_key);

ALTER TABLE app_private.webhook_inbox ADD CONSTRAINT webhook_inbox_pkey PRIMARY KEY (id);

ALTER TABLE app_private.webhook_inbox ADD CONSTRAINT webhook_inbox_provider_external_event_id_key UNIQUE (provider, external_event_id);

ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE public.basket_items ADD CONSTRAINT basket_items_basket_id_product_id_key UNIQUE (basket_id, product_id);

ALTER TABLE public.basket_items ADD CONSTRAINT basket_items_pkey PRIMARY KEY (id);

ALTER TABLE public.basket_templates ADD CONSTRAINT basket_templates_code_key UNIQUE (code);

ALTER TABLE public.basket_templates ADD CONSTRAINT basket_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_addresses ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_contacts ADD CONSTRAINT customer_contacts_customer_id_kind_value_normalized_key UNIQUE (customer_id, kind, value_normalized);

ALTER TABLE public.customer_contacts ADD CONSTRAINT customer_contacts_pkey PRIMARY KEY (id);

ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE public.external_entity_links ADD CONSTRAINT external_entity_links_pkey PRIMARY KEY (id);

ALTER TABLE public.external_entity_links ADD CONSTRAINT external_entity_links_provider_entity_type_external_id_key UNIQUE (provider, entity_type, external_id);

ALTER TABLE public.external_entity_links ADD CONSTRAINT external_entity_links_provider_entity_type_local_entity_id__key UNIQUE (provider, entity_type, local_entity_id, external_id);

ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_order_id_product_id_key UNIQUE (order_id, product_id);

ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);

ALTER TABLE public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE public.orders ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);

ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE public.product_identifiers ADD CONSTRAINT product_identifiers_pkey PRIMARY KEY (id);

ALTER TABLE public.product_identifiers ADD CONSTRAINT product_identifiers_product_id_kind_value_key UNIQUE (product_id, kind, value);

ALTER TABLE public.product_images ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);

ALTER TABLE public.product_images ADD CONSTRAINT product_images_product_id_storage_path_key UNIQUE (product_id, storage_path);

ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE app_private.image_import_queue ADD CONSTRAINT image_import_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public.basket_items ADD CONSTRAINT basket_items_basket_id_fkey FOREIGN KEY (basket_id) REFERENCES basket_templates(id) ON DELETE CASCADE;

ALTER TABLE public.basket_items ADD CONSTRAINT basket_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_addresses ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.customer_contacts ADD CONSTRAINT customer_contacts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

ALTER TABLE public.product_identifiers ADD CONSTRAINT product_identifiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public.product_images ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE app_private.image_import_queue ADD CONSTRAINT image_import_queue_source_project_ref_check CHECK ((source_project_ref = 'ssbesxgaijknwsjbsbcz'::text));

ALTER TABLE app_private.image_import_queue ADD CONSTRAINT image_import_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'copied'::text, 'failed'::text, 'skipped'::text])));

ALTER TABLE app_private.integration_accounts ADD CONSTRAINT integration_accounts_provider_check CHECK ((provider = ANY (ARRAY['bling'::text, 'meta'::text])));

ALTER TABLE app_private.migration_xref ADD CONSTRAINT migration_xref_source_project_ref_check CHECK ((source_project_ref = 'ssbesxgaijknwsjbsbcz'::text));

ALTER TABLE app_private.outbox_jobs ADD CONSTRAINT outbox_jobs_attempt_count_check CHECK ((attempt_count >= 0));

ALTER TABLE app_private.outbox_jobs ADD CONSTRAINT outbox_jobs_provider_check CHECK ((provider = ANY (ARRAY['bling'::text, 'meta'::text])));

ALTER TABLE app_private.outbox_jobs ADD CONSTRAINT outbox_jobs_status_check CHECK ((status = ANY (ARRAY['blocked'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE app_private.webhook_inbox ADD CONSTRAINT webhook_inbox_provider_check CHECK ((provider = ANY (ARRAY['bling'::text, 'meta'::text])));

ALTER TABLE app_private.webhook_inbox ADD CONSTRAINT webhook_inbox_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processing'::text, 'processed'::text, 'failed'::text])));

ALTER TABLE public.basket_items ADD CONSTRAINT basket_items_quantity_check CHECK ((quantity > (0)::numeric));

ALTER TABLE public.basket_templates ADD CONSTRAINT basket_templates_check CHECK (((NOT active) OR ((published_at IS NOT NULL) AND (price_cents IS NOT NULL))));

ALTER TABLE public.basket_templates ADD CONSTRAINT basket_templates_price_cents_check CHECK ((price_cents >= 0));

ALTER TABLE public.customer_contacts ADD CONSTRAINT customer_contacts_kind_check CHECK ((kind = ANY (ARRAY['phone'::text, 'email'::text])));

ALTER TABLE public.customer_contacts ADD CONSTRAINT customer_contacts_value_normalized_check CHECK ((length(btrim(value_normalized)) > 0));

ALTER TABLE public.customers ADD CONSTRAINT customers_check CHECK (((marketing_consent_verified = false) OR (marketing_opt_in IS NOT NULL)));

ALTER TABLE public.customers ADD CONSTRAINT customers_full_name_check CHECK ((length(btrim(full_name)) > 0));

ALTER TABLE public.external_entity_links ADD CONSTRAINT external_entity_links_provider_check CHECK ((provider = ANY (ARRAY['bling'::text, 'meta'::text])));

ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_quantity_check CHECK ((quantity > (0)::numeric));

ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_state_check CHECK ((state = ANY (ARRAY['held'::text, 'committed'::text, 'released'::text])));

ALTER TABLE public.order_items ADD CONSTRAINT order_items_price_cents_check CHECK ((price_cents >= 0));

ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_check CHECK ((quantity > (0)::numeric));

ALTER TABLE public.order_items ADD CONSTRAINT order_items_total_cents_check CHECK ((total_cents >= 0));

ALTER TABLE public.orders ADD CONSTRAINT orders_check CHECK ((total_cents = (subtotal_cents + delivery_cents)));

ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_cents_check CHECK ((delivery_cents >= 0));

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'placed'::text, 'confirmed'::text, 'preparing'::text, 'delivered'::text, 'cancelled'::text])));

ALTER TABLE public.orders ADD CONSTRAINT orders_subtotal_cents_check CHECK ((subtotal_cents >= 0));

ALTER TABLE public.product_identifiers ADD CONSTRAINT product_identifiers_conversion_factor_check CHECK (((conversion_factor IS NULL) OR (conversion_factor > (0)::numeric)));

ALTER TABLE public.product_identifiers ADD CONSTRAINT product_identifiers_kind_check CHECK ((kind = ANY (ARRAY['gtin'::text, 'sku'::text, 'supplier_code'::text, 'packaging_barcode'::text])));

ALTER TABLE public.product_identifiers ADD CONSTRAINT product_identifiers_value_check CHECK ((length(btrim(value)) > 0));

ALTER TABLE public.product_images ADD CONSTRAINT product_images_position_check CHECK (("position" >= 0));

ALTER TABLE public.products ADD CONSTRAINT products_cost_cents_check CHECK ((cost_cents >= 0));

ALTER TABLE public.products ADD CONSTRAINT products_name_check CHECK ((length(btrim(name)) > 0));

ALTER TABLE public.products ADD CONSTRAINT products_price_cents_check CHECK ((price_cents >= 0));

ALTER TABLE public.products ADD CONSTRAINT products_publication_valid CHECK ((((active = false) AND (published_at IS NULL)) OR ((active = true) AND (published_at IS NOT NULL) AND (review_status = 'approved'::text) AND (sku IS NOT NULL) AND (price_cents IS NOT NULL))));

ALTER TABLE public.products ADD CONSTRAINT products_review_status_check CHECK ((review_status = ANY (ARRAY['needs_review'::text, 'approved'::text, 'rejected'::text])));

ALTER TABLE public.products ADD CONSTRAINT products_stock_units_check CHECK ((stock_units >= (0)::numeric));

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'catalog_manager'::text, 'fulfillment'::text])));

CREATE INDEX image_import_pending_idx ON app_private.image_import_queue USING btree (status, created_at) WHERE (status = 'pending'::text);

CREATE INDEX migration_xref_target_idx ON app_private.migration_xref USING btree (entity_type, target_id);

CREATE INDEX outbox_jobs_pending_idx ON app_private.outbox_jobs USING btree (provider, available_at) WHERE (status = 'pending'::text);

CREATE INDEX webhook_inbox_pending_idx ON app_private.webhook_inbox USING btree (provider, received_at) WHERE (status = ANY (ARRAY['received'::text, 'failed'::text]));

CREATE INDEX audit_events_created_idx ON public.audit_events USING btree (created_at DESC);

CREATE INDEX basket_items_product_fk ON public.basket_items USING btree (product_id);

CREATE INDEX customer_addresses_customer_fk ON public.customer_addresses USING btree (customer_id);

CREATE INDEX customer_contacts_customer_fk ON public.customer_contacts USING btree (customer_id);

CREATE INDEX customer_contacts_lookup ON public.customer_contacts USING btree (kind, value_normalized);

CREATE UNIQUE INDEX customers_bling_contact_unique ON public.customers USING btree (bling_contact_id) WHERE (bling_contact_id IS NOT NULL);

CREATE INDEX external_entity_links_local_lookup ON public.external_entity_links USING btree (provider, entity_type, local_entity_id);

CREATE INDEX inventory_reservations_product_fk ON public.inventory_reservations USING btree (product_id);

CREATE INDEX order_items_order_fk ON public.order_items USING btree (order_id);

CREATE INDEX order_items_product_fk ON public.order_items USING btree (product_id);

CREATE INDEX orders_created_idx ON public.orders USING btree (created_at DESC);

CREATE INDEX orders_customer_fk ON public.orders USING btree (customer_id);

CREATE INDEX product_identifiers_product_fk ON public.product_identifiers USING btree (product_id);

CREATE INDEX product_images_product_fk ON public.product_images USING btree (product_id, "position");

CREATE UNIQUE INDEX products_bling_id_unique ON public.products USING btree (bling_product_id) WHERE (bling_product_id IS NOT NULL);

CREATE UNIQUE INDEX products_sku_unique ON public.products USING btree (lower(btrim(sku))) WHERE (sku IS NOT NULL);

CREATE INDEX products_visible_idx ON public.products USING btree (category, updated_at DESC) WHERE (active = true);

ALTER TABLE app_private.image_import_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_private.integration_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_private.migration_xref ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_private.outbox_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_private.webhook_inbox ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.basket_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.basket_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.external_entity_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_identifiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY images_of_public_products_only ON public.product_images AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((verified = true) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_images.product_id) AND (p.active = true) AND (p.published_at IS NOT NULL) AND (p.review_status = 'approved'::text))))));

CREATE POLICY catalog_public_approved_only ON public.products AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((active = true) AND (published_at IS NOT NULL) AND (review_status = 'approved'::text)));


-- Match the current object access: RLS is present; no anon/authenticated table access is granted.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app_private FROM anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app_private TO service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, app_private FROM anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, app_private TO service_role;

-- app_private is available only to the trusted server role.
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

-- New public objects otherwise inherit broad grants from the remote project's
-- default ACLs. Keep this greenfield development baseline closed by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
