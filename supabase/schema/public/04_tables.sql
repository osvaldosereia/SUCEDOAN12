-- table: admin_audit_logs
create table if not exists public.admin_audit_logs (
  id uuid default gen_random_uuid() not null,
  admin_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint admin_audit_logs_pkey PRIMARY KEY (id)
);
alter table public.admin_audit_logs enable row level security;

-- table: admin_pin_access_attempts
create table if not exists public.admin_pin_access_attempts (
  fingerprint text not null,
  attempts integer default 0 not null,
  window_started_at timestamp with time zone default now() not null,
  blocked_until timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint admin_pin_access_attempts_pkey PRIMARY KEY (fingerprint)
);
alter table public.admin_pin_access_attempts enable row level security;

-- table: admin_pin_access_config
create table if not exists public.admin_pin_access_config (
  id smallint default 1 not null,
  pin_hash text not null,
  enabled boolean default true not null,
  max_attempts integer default 5 not null,
  lock_minutes integer default 15 not null,
  updated_at timestamp with time zone default now() not null,
  constraint admin_pin_access_config_pkey PRIMARY KEY (id),
  constraint admin_pin_access_config_id_check CHECK ((id = 1)),
  constraint admin_pin_access_config_lock_minutes_check CHECK (((lock_minutes >= 1) AND (lock_minutes <= 1440))),
  constraint admin_pin_access_config_max_attempts_check CHECK (((max_attempts >= 3) AND (max_attempts <= 20)))
);
alter table public.admin_pin_access_config enable row level security;

-- table: admin_saved_card_uses_v1
create table if not exists public.admin_saved_card_uses_v1 (
  id uuid default gen_random_uuid() not null,
  card_id uuid not null,
  amount numeric(12,2) not null,
  idempotency_key uuid not null,
  used_at timestamp with time zone default now() not null,
  transaction_type text default 'exit'::text not null,
  location text,
  transaction_origin text default 'manual'::text not null,
  constraint admin_saved_card_uses_v1_idempotency_key_key UNIQUE (idempotency_key),
  constraint admin_saved_card_uses_v1_pkey PRIMARY KEY (id),
  constraint admin_saved_card_uses_v1_amount_check CHECK ((amount > (0)::numeric)),
  constraint admin_saved_card_uses_v1_location_check CHECK ((((transaction_type = 'entry'::text) AND (location IS NULL)) OR ((transaction_type = 'exit'::text) AND ((location IS NULL) OR (location = ANY (ARRAY['Assaí'::text, 'Fort'::text, 'Atacadão'::text])))))),
  constraint admin_saved_card_uses_v1_transaction_origin_check CHECK (((transaction_origin = 'manual'::text) OR ((transaction_origin = 'initial'::text) AND (transaction_type = 'entry'::text) AND (location IS NULL)))),
  constraint admin_saved_card_uses_v1_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['entry'::text, 'exit'::text])))
);
alter table public.admin_saved_card_uses_v1 enable row level security;

-- table: admin_saved_cards_v1
create table if not exists public.admin_saved_cards_v1 (
  id uuid default gen_random_uuid() not null,
  name text not null,
  brand text not null,
  initial_value numeric(12,2) not null,
  current_balance numeric(12,2) not null,
  card_password text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  credit_added_on date default ((now() AT TIME ZONE 'America/Cuiaba'::text))::date not null,
  deleted_at timestamp with time zone,
  constraint admin_saved_cards_v1_pkey PRIMARY KEY (id),
  constraint admin_saved_cards_v1_brand_check CHECK (((char_length(btrim(brand)) >= 1) AND (char_length(btrim(brand)) <= 60))),
  constraint admin_saved_cards_v1_card_password_check CHECK ((((deleted_at IS NOT NULL) AND (card_password = ''::text)) OR ((deleted_at IS NULL) AND ((char_length(card_password) >= 1) AND (char_length(card_password) <= 120))))),
  constraint admin_saved_cards_v1_current_balance_check CHECK ((current_balance >= (0)::numeric)),
  constraint admin_saved_cards_v1_initial_value_check CHECK ((initial_value > (0)::numeric)),
  constraint admin_saved_cards_v1_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120)))
);
alter table public.admin_saved_cards_v1 enable row level security;

-- table: admin_users
create table if not exists public.admin_users (
  user_id uuid not null,
  role text default 'operator'::text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  display_name text,
  updated_at timestamp with time zone default now() not null,
  email text,
  last_login_at timestamp with time zone,
  constraint admin_users_pkey PRIMARY KEY (user_id),
  constraint admin_users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'operator'::text, 'viewer'::text])))
);
alter table public.admin_users enable row level security;

-- table: assembly_kit_items
create table if not exists public.assembly_kit_items (
  id uuid default gen_random_uuid() not null,
  kit_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,3) not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint assembly_kit_items_kit_id_product_id_key UNIQUE (kit_id, product_id),
  constraint assembly_kit_items_pkey PRIMARY KEY (id),
  constraint assembly_kit_items_quantity_check CHECK ((quantity > (0)::numeric))
);
alter table public.assembly_kit_items enable row level security;

-- table: assembly_kits
create table if not exists public.assembly_kits (
  id uuid default gen_random_uuid() not null,
  name text not null,
  type text not null,
  notes text,
  source_kit_id uuid,
  is_active boolean default true not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint assembly_kits_pkey PRIMARY KEY (id),
  constraint assembly_kits_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 180))),
  constraint assembly_kits_type_check CHECK ((type = ANY (ARRAY['food'::text, 'cleaning_hygiene'::text, 'other'::text])))
);
alter table public.assembly_kits enable row level security;

-- table: assembly_search_chips
create table if not exists public.assembly_search_chips (
  id uuid default gen_random_uuid() not null,
  label text not null,
  query text not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint assembly_search_chips_pkey PRIMARY KEY (id),
  constraint assembly_search_chips_label_check CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 80))),
  constraint assembly_search_chips_query_check CHECK (((length(btrim(query)) >= 1) AND (length(btrim(query)) <= 120)))
);
alter table public.assembly_search_chips enable row level security;

-- table: attendance_conversation_auto_labels_v1
create table if not exists public.attendance_conversation_auto_labels_v1 (
  conversation_id uuid not null,
  label_id uuid not null,
  source_kind text not null,
  source_ref uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint attendance_conversation_auto_labels_v1_pkey PRIMARY KEY (conversation_id, label_id, source_kind, source_ref),
  constraint attendance_conversation_auto_labels_v1_source_check CHECK ((source_kind = ANY (ARRAY['delivery_schedule'::text, 'product_purchase'::text, 'ana_trigger'::text])))
);
alter table public.attendance_conversation_auto_labels_v1 enable row level security;

-- table: attendance_conversation_labels_v1
create table if not exists public.attendance_conversation_labels_v1 (
  conversation_id uuid not null,
  label_id uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint attendance_conversation_labels_v1_pkey PRIMARY KEY (conversation_id, label_id)
);
alter table public.attendance_conversation_labels_v1 enable row level security;

-- table: attendance_conversation_manual_labels_v1
create table if not exists public.attendance_conversation_manual_labels_v1 (
  conversation_id uuid not null,
  label_id uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint attendance_conversation_manual_labels_v1_pkey PRIMARY KEY (conversation_id, label_id)
);
alter table public.attendance_conversation_manual_labels_v1 enable row level security;

-- table: attendance_conversation_state_v1
create table if not exists public.attendance_conversation_state_v1 (
  conversation_id uuid not null,
  last_read_message_id uuid,
  last_read_at timestamp with time zone,
  follow_up_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint attendance_conversation_state_v1_pkey PRIMARY KEY (conversation_id)
);
alter table public.attendance_conversation_state_v1 enable row level security;

-- table: attendance_human_ai_audit_v1
create table if not exists public.attendance_human_ai_audit_v1 (
  id uuid default gen_random_uuid() not null,
  conversation_id uuid not null,
  action text not null,
  admin_user_id uuid,
  from_mode text,
  to_mode text,
  source text default 'system'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint attendance_human_ai_audit_v1_pkey PRIMARY KEY (id),
  constraint attendance_human_ai_audit_v1_action_check CHECK ((action = ANY (ARRAY['takeover'::text, 'resume_ai'::text, 'human_outbox_takeover'::text, 'human_message'::text])))
);
alter table public.attendance_human_ai_audit_v1 enable row level security;

-- table: attendance_labels_v1
create table if not exists public.attendance_labels_v1 (
  id uuid default gen_random_uuid() not null,
  name text not null,
  color text default '#5f6368'::text not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint attendance_labels_v1_pkey PRIMARY KEY (id),
  constraint attendance_labels_v1_color_hex CHECK ((color ~ '^#[0-9A-Fa-f]{6}$'::text)),
  constraint attendance_labels_v1_name_nonempty CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60)))
);
alter table public.attendance_labels_v1 enable row level security;

-- table: attendance_library_audit_v1
create table if not exists public.attendance_library_audit_v1 (
  id uuid default gen_random_uuid() not null,
  admin_user_id uuid not null,
  item_id uuid,
  conversation_id uuid,
  whatsapp_account_id uuid,
  action text not null,
  result text not null,
  error_code text,
  outbox_id uuid,
  message_id uuid,
  provider_message_id text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint attendance_library_audit_v1_pkey PRIMARY KEY (id)
);
alter table public.attendance_library_audit_v1 enable row level security;

-- table: attendance_library_items_v1
create table if not exists public.attendance_library_items_v1 (
  id uuid default gen_random_uuid() not null,
  title text not null,
  media_kind text not null,
  mime_type text not null,
  storage_path text not null,
  thumbnail_path text,
  original_filename text not null,
  original_size_bytes bigint,
  stored_size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  category text,
  tags text[] default '{}'::text[] not null,
  sort_order integer default 0 not null,
  upload_status text default 'pending'::text not null,
  upload_expires_at timestamp with time zone,
  is_active boolean default false not null,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  constraint attendance_library_items_v1_storage_path_key UNIQUE (storage_path),
  constraint attendance_library_items_v1_thumbnail_path_key UNIQUE (thumbnail_path),
  constraint attendance_library_items_v1_pkey PRIMARY KEY (id),
  constraint attendance_library_items_v1_duration_seconds_check CHECK (((duration_seconds IS NULL) OR (duration_seconds >= (0)::numeric))),
  constraint attendance_library_items_v1_height_check CHECK (((height IS NULL) OR (height > 0))),
  constraint attendance_library_items_v1_media_kind_check CHECK ((media_kind = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'document'::text]))),
  constraint attendance_library_items_v1_original_size_bytes_check CHECK (((original_size_bytes IS NULL) OR (original_size_bytes > 0))),
  constraint attendance_library_items_v1_stored_size_bytes_check CHECK (((stored_size_bytes IS NULL) OR (stored_size_bytes > 0))),
  constraint attendance_library_items_v1_upload_status_check CHECK ((upload_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text]))),
  constraint attendance_library_items_v1_width_check CHECK (((width IS NULL) OR (width > 0)))
);
alter table public.attendance_library_items_v1 enable row level security;

-- table: attendance_media_cache_v1
create table if not exists public.attendance_media_cache_v1 (
  message_id uuid not null,
  object_path text not null,
  mime_type text,
  filename text,
  cached_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  constraint attendance_media_cache_v1_object_path_key UNIQUE (object_path),
  constraint attendance_media_cache_v1_pkey PRIMARY KEY (message_id)
);
alter table public.attendance_media_cache_v1 enable row level security;

-- table: attendance_quick_replies_v1
create table if not exists public.attendance_quick_replies_v1 (
  id uuid default gen_random_uuid() not null,
  title text not null,
  content text not null,
  is_favorite boolean default true not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint attendance_quick_replies_v1_pkey PRIMARY KEY (id),
  constraint attendance_quick_replies_v1_content_nonempty CHECK (((length(btrim(content)) >= 1) AND (length(btrim(content)) <= 4000))),
  constraint attendance_quick_replies_v1_title_nonempty CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 80)))
);
alter table public.attendance_quick_replies_v1 enable row level security;

-- table: basket_admin_basket_types
create table if not exists public.basket_admin_basket_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  linked_basket_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_admin_basket_types_pkey PRIMARY KEY (id),
  constraint basket_admin_basket_types_name_check CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 100))),
  constraint basket_admin_basket_types_sort_order_check CHECK ((sort_order >= 0))
);
alter table public.basket_admin_basket_types enable row level security;

-- table: basket_admin_product_options
create table if not exists public.basket_admin_product_options (
  product_type_id uuid not null,
  product_id uuid not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint basket_admin_product_options_pkey PRIMARY KEY (product_type_id, product_id),
  constraint basket_admin_product_options_sort_order_check CHECK ((sort_order >= 0))
);
alter table public.basket_admin_product_options enable row level security;

-- table: basket_admin_product_types
create table if not exists public.basket_admin_product_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  legacy_labels text[] default '{}'::text[] not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_admin_product_types_pkey PRIMARY KEY (id),
  constraint basket_admin_product_types_category_check CHECK ((category = ANY (ARRAY['Alimentos'::text, 'Limpeza'::text, 'Higiene'::text]))),
  constraint basket_admin_product_types_name_check CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 100))),
  constraint basket_admin_product_types_sort_order_check CHECK ((sort_order >= 0))
);
alter table public.basket_admin_product_types enable row level security;

-- table: basket_admin_quantities
create table if not exists public.basket_admin_quantities (
  basket_type_id uuid not null,
  product_type_id uuid not null,
  quantity numeric(12,3) default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_admin_quantities_pkey PRIMARY KEY (basket_type_id, product_type_id),
  constraint basket_admin_quantities_quantity_check CHECK ((quantity >= (0)::numeric))
);
alter table public.basket_admin_quantities enable row level security;

-- table: basket_categories
create table if not exists public.basket_categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_categories_pkey PRIMARY KEY (id),
  constraint basket_categories_name_chk CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 80))),
  constraint basket_categories_slug_chk CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))
);
alter table public.basket_categories enable row level security;

-- table: basket_extra_theme_products
create table if not exists public.basket_extra_theme_products (
  theme_id uuid not null,
  product_id uuid not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint basket_extra_theme_products_pkey PRIMARY KEY (theme_id, product_id)
);
alter table public.basket_extra_theme_products enable row level security;

-- table: basket_extra_themes
create table if not exists public.basket_extra_themes (
  id uuid default gen_random_uuid() not null,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  search_terms text[] default '{}'::text[] not null,
  sales_categories text[] default '{}'::text[] not null,
  is_active boolean default true not null,
  constraint basket_extra_themes_pkey PRIMARY KEY (id),
  constraint basket_extra_themes_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)))
);
alter table public.basket_extra_themes enable row level security;

-- table: basket_mold_position_options
create table if not exists public.basket_mold_position_options (
  id uuid default gen_random_uuid() not null,
  position_id uuid not null,
  product_id uuid not null,
  sort_order integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_mold_position_options_position_id_product_id_key UNIQUE (position_id, product_id),
  constraint basket_mold_position_options_pkey PRIMARY KEY (id),
  constraint basket_mold_position_options_sort_order_check CHECK ((sort_order >= 0))
);
alter table public.basket_mold_position_options enable row level security;

-- table: basket_mold_positions
create table if not exists public.basket_mold_positions (
  id uuid default gen_random_uuid() not null,
  mold_id uuid not null,
  label text not null,
  quantity numeric(12,3) not null,
  sort_order integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_mold_positions_pkey PRIMARY KEY (id),
  constraint basket_mold_positions_label_check CHECK ((btrim(label) <> ''::text)),
  constraint basket_mold_positions_quantity_check CHECK (((quantity >= (0)::numeric) AND (quantity <= (999)::numeric))),
  constraint basket_mold_positions_sort_order_check CHECK ((sort_order >= 0))
);
alter table public.basket_mold_positions enable row level security;

-- table: basket_mold_shared_item_options
create table if not exists public.basket_mold_shared_item_options (
  id uuid default gen_random_uuid() not null,
  shared_item_id uuid not null,
  product_id uuid not null,
  sort_order integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_mold_shared_item_options_shared_item_id_product_id_key UNIQUE (shared_item_id, product_id),
  constraint basket_mold_shared_item_options_shared_item_id_sort_order_key UNIQUE (shared_item_id, sort_order),
  constraint basket_mold_shared_item_options_pkey PRIMARY KEY (id),
  constraint basket_mold_shared_item_options_sort_order_check CHECK (((sort_order >= 0) AND (sort_order <= 39)))
);
alter table public.basket_mold_shared_item_options enable row level security;

-- table: basket_mold_shared_items
create table if not exists public.basket_mold_shared_items (
  id uuid default gen_random_uuid() not null,
  scope text default 'cestas-completas'::text not null,
  label text not null,
  sort_order integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_mold_shared_items_scope_label_key UNIQUE (scope, label),
  constraint basket_mold_shared_items_pkey PRIMARY KEY (id),
  constraint basket_mold_shared_items_label_check CHECK ((btrim(label) <> ''::text)),
  constraint basket_mold_shared_items_sort_order_check CHECK ((sort_order >= 0))
);
alter table public.basket_mold_shared_items enable row level security;

-- table: basket_molds
create table if not exists public.basket_molds (
  id uuid default gen_random_uuid() not null,
  basket_id uuid not null,
  hidden_adjustment numeric(12,2) default 0 not null,
  public_composition_count smallint default 2 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  conditional_hidden_enabled boolean default false not null,
  conditional_hidden_product_id uuid,
  conditional_hidden_adjustment numeric(12,2) default 0 not null,
  constraint basket_molds_basket_id_key UNIQUE (basket_id),
  constraint basket_molds_pkey PRIMARY KEY (id),
  constraint basket_molds_conditional_hidden_adjustment_check CHECK (((conditional_hidden_adjustment >= (0)::numeric) AND (conditional_hidden_adjustment <= (9999999)::numeric))),
  constraint basket_molds_public_composition_count_check CHECK (((public_composition_count >= 1) AND (public_composition_count <= 6)))
);
alter table public.basket_molds enable row level security;

-- table: basket_subcategories
create table if not exists public.basket_subcategories (
  id uuid default gen_random_uuid() not null,
  category_id uuid not null,
  name text not null,
  sort_order integer default 0 not null,
  is_active boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_subcategories_category_name_key UNIQUE (category_id, name),
  constraint basket_subcategories_pkey PRIMARY KEY (id),
  constraint basket_subcategories_name_nonempty CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);
alter table public.basket_subcategories enable row level security;

-- table: basket_template_item_alternatives
create table if not exists public.basket_template_item_alternatives (
  id uuid default gen_random_uuid() not null,
  template_item_id uuid not null,
  product_id uuid not null,
  priority integer default 100 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint basket_template_item_alternativ_template_item_id_product_id_key UNIQUE (template_item_id, product_id),
  constraint basket_template_item_alternatives_pkey PRIMARY KEY (id),
  constraint basket_template_item_alternatives_priority_check CHECK (((priority >= 1) AND (priority <= 9999)))
);
alter table public.basket_template_item_alternatives enable row level security;

-- table: basket_template_items
create table if not exists public.basket_template_items (
  id uuid default gen_random_uuid() not null,
  basket_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,3) not null,
  removable boolean default true not null,
  quantity_editable boolean default true not null,
  min_quantity numeric(14,3) default 0 not null,
  max_quantity numeric(14,3),
  substitution_group text,
  pricing_rule jsonb default '{}'::jsonb not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  remove_unit_delta numeric,
  add_unit_delta numeric,
  updated_at timestamp with time zone default now() not null,
  constraint basket_template_items_basket_id_product_id_key UNIQUE (basket_id, product_id),
  constraint basket_template_items_pkey PRIMARY KEY (id),
  constraint basket_template_items_quantity_check CHECK ((quantity > (0)::numeric))
);
alter table public.basket_template_items enable row level security;

-- table: basket_templates
create table if not exists public.basket_templates (
  id uuid default gen_random_uuid() not null,
  sku text,
  name text not null,
  description text,
  image_url text,
  base_price numeric(12,2) not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  rules jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_whatsapp_active boolean default true not null,
  is_featured boolean default false not null,
  internal_notes text,
  updated_by uuid,
  hidden_adjustment numeric(14,2) default 0 not null,
  uses_hygiene_kit boolean default false not null,
  split_kits_enabled boolean default false not null,
  category_id uuid,
  subcategory_id uuid,
  constraint basket_templates_sku_key UNIQUE (sku),
  constraint basket_templates_pkey PRIMARY KEY (id),
  constraint basket_templates_category_required CHECK ((category_id IS NOT NULL))
);
alter table public.basket_templates enable row level security;

-- table: bling_hub_audit_v2
create table if not exists public.bling_hub_audit_v2 (
  id bigint generated by default as identity not null,
  event_type text not null,
  severity text default 'info'::text not null,
  domain text,
  job_id uuid,
  source_system text,
  source_id text,
  correlation_id uuid,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint bling_hub_audit_v2_pkey PRIMARY KEY (id),
  constraint bling_hub_audit_v2_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text])))
);
alter table public.bling_hub_audit_v2 enable row level security;

-- table: bling_hub_canary_allowlist_v2
create table if not exists public.bling_hub_canary_allowlist_v2 (
  id uuid default gen_random_uuid() not null,
  domain text not null,
  source_system text not null,
  source_id text not null,
  enabled boolean default true not null,
  expires_at timestamp with time zone,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_hub_canary_allowlist_v2_domain_source_system_source_i_key UNIQUE (domain, source_system, source_id),
  constraint bling_hub_canary_allowlist_v2_pkey PRIMARY KEY (id),
  constraint bling_hub_canary_allowlist_v2_domain_check CHECK ((domain = ANY (ARRAY['product'::text, 'stock'::text, 'customer'::text, 'order'::text, 'fiscal'::text])))
);
alter table public.bling_hub_canary_allowlist_v2 enable row level security;

-- table: bling_hub_entity_links_v2
create table if not exists public.bling_hub_entity_links_v2 (
  id uuid default gen_random_uuid() not null,
  source_system text not null,
  entity_type text not null,
  source_id text not null,
  bling_id bigint,
  identity_kind text,
  identity_value text,
  status text default 'unresolved'::text not null,
  last_verified_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_hub_entity_links_v2_source_system_entity_type_source__key UNIQUE (source_system, entity_type, source_id),
  constraint bling_hub_entity_links_v2_pkey PRIMARY KEY (id),
  constraint bling_hub_entity_links_v2_entity_type_check CHECK ((entity_type = ANY (ARRAY['product'::text, 'customer'::text, 'order'::text, 'invoice'::text]))),
  constraint bling_hub_entity_links_v2_status_check CHECK ((status = ANY (ARRAY['unresolved'::text, 'matched'::text, 'not_found'::text, 'ambiguous'::text, 'review_required'::text, 'inactive'::text])))
);
alter table public.bling_hub_entity_links_v2 enable row level security;

-- table: bling_hub_jobs_v2
create table if not exists public.bling_hub_jobs_v2 (
  id uuid default gen_random_uuid() not null,
  domain text not null,
  operation text not null,
  source_system text not null,
  source_id text not null,
  idempotency_key text not null,
  status text default 'pending'::text not null,
  payload_version integer default 1 not null,
  payload jsonb default '{}'::jsonb not null,
  correlation_id uuid default gen_random_uuid() not null,
  provider_id text,
  attempts integer default 0 not null,
  max_attempts integer default 5 not null,
  next_attempt_at timestamp with time zone default now() not null,
  locked_at timestamp with time zone,
  locked_by text,
  result jsonb default '{}'::jsonb not null,
  error_code text,
  error_message text,
  last_http_status integer,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_hub_jobs_v2_idempotency_key_key UNIQUE (idempotency_key),
  constraint bling_hub_jobs_v2_pkey PRIMARY KEY (id),
  constraint bling_hub_jobs_v2_domain_check CHECK ((domain = ANY (ARRAY['product'::text, 'stock'::text, 'customer'::text, 'order'::text, 'webhook'::text, 'fiscal'::text]))),
  constraint bling_hub_jobs_v2_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
  constraint bling_hub_jobs_v2_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'retry'::text, 'review_required'::text, 'synced'::text, 'failed'::text, 'cancelled'::text])))
);
alter table public.bling_hub_jobs_v2 enable row level security;

-- table: bling_hub_rate_limit_v2
create table if not exists public.bling_hub_rate_limit_v2 (
  id smallint default 1 not null,
  next_allowed_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_hub_rate_limit_v2_pkey PRIMARY KEY (id),
  constraint bling_hub_rate_limit_v2_id_check CHECK ((id = 1))
);
alter table public.bling_hub_rate_limit_v2 enable row level security;

-- table: bling_hub_runtime_v2
create table if not exists public.bling_hub_runtime_v2 (
  id smallint default 1 not null,
  mode text default 'observe'::text not null,
  hub_enabled boolean default false not null,
  legacy_queues_frozen boolean default true not null,
  products_enabled boolean default false not null,
  stock_enabled boolean default false not null,
  customers_enabled boolean default false not null,
  orders_enabled boolean default false not null,
  webhooks_enabled boolean default false not null,
  fiscal_enabled boolean default false not null,
  write_canary_limit integer default 1 not null,
  min_request_interval_ms integer default 420 not null,
  max_attempts integer default 5 not null,
  oauth_lock_owner uuid,
  oauth_locked_until timestamp with time zone,
  last_oauth_check_at timestamp with time zone,
  last_oauth_ok_at timestamp with time zone,
  last_oauth_error text,
  last_readonly_check_at timestamp with time zone,
  last_readonly_ok_at timestamp with time zone,
  last_readonly_error text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_hub_runtime_v2_pkey PRIMARY KEY (id),
  constraint bling_hub_runtime_v2_id_check CHECK ((id = 1)),
  constraint bling_hub_runtime_v2_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
  constraint bling_hub_runtime_v2_min_request_interval_ms_check CHECK (((min_request_interval_ms >= 350) AND (min_request_interval_ms <= 5000))),
  constraint bling_hub_runtime_v2_mode_check CHECK ((mode = ANY (ARRAY['off'::text, 'observe'::text, 'homologation'::text, 'live'::text]))),
  constraint bling_hub_runtime_v2_write_canary_limit_check CHECK (((write_canary_limit >= 1) AND (write_canary_limit <= 100)))
);
alter table public.bling_hub_runtime_v2 enable row level security;

-- table: bling_official_ncm_catalog_cache_v1
create table if not exists public.bling_official_ncm_catalog_cache_v1 (
  id boolean default true not null,
  source_url text default 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json'::text not null,
  source_revision text,
  codes text[] default ARRAY[]::text[] not null,
  code_count integer default 0 not null,
  fetched_at timestamp with time zone,
  refresh_lease_until timestamp with time zone,
  next_refresh_after timestamp with time zone,
  last_error text,
  updated_at timestamp with time zone default now() not null,
  constraint bling_official_ncm_catalog_cache_v1_pkey PRIMARY KEY (id),
  constraint bling_official_ncm_catalog_cache_count_matches CHECK ((code_count = cardinality(codes))),
  constraint bling_official_ncm_catalog_cache_v1_id_check CHECK (id)
);
alter table public.bling_official_ncm_catalog_cache_v1 enable row level security;

-- table: bling_order_homologation_allowlist
create table if not exists public.bling_order_homologation_allowlist (
  order_id uuid not null,
  enabled boolean default true not null,
  expires_at timestamp with time zone,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_order_homologation_allowlist_pkey PRIMARY KEY (order_id)
);
alter table public.bling_order_homologation_allowlist enable row level security;

-- table: bling_order_stock_controls_v2
create table if not exists public.bling_order_stock_controls_v2 (
  source_order_id uuid not null,
  bling_order_id bigint not null,
  deposit_id bigint not null,
  state text default 'not_launched'::text not null,
  launch_attempts integer default 0 not null,
  reverse_attempts integer default 0 not null,
  before_launch jsonb,
  after_launch jsonb,
  before_reverse jsonb,
  after_reverse jsonb,
  launched_at timestamp with time zone,
  reversed_at timestamp with time zone,
  last_error text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_order_stock_controls_v2_bling_order_id_key UNIQUE (bling_order_id),
  constraint bling_order_stock_controls_v2_pkey PRIMARY KEY (source_order_id),
  constraint bling_order_stock_controls_v2_state_check CHECK ((state = ANY (ARRAY['not_launched'::text, 'launching'::text, 'launched'::text, 'reversing'::text, 'reversed'::text, 'review_required'::text])))
);
alter table public.bling_order_stock_controls_v2 enable row level security;
comment on table public.bling_order_stock_controls_v2 is 'Operations 2.0: trava idempotente e evidência do lançamento/estorno físico de pedido no Bling.';

-- table: bling_product_binding_events
create table if not exists public.bling_product_binding_events (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  bling_product_id bigint not null,
  binding_source text not null,
  external_key text,
  created_at timestamp with time zone default now() not null,
  constraint bling_product_binding_events_pkey PRIMARY KEY (id)
);
alter table public.bling_product_binding_events enable row level security;

-- table: bling_stock_mirror_v2
create table if not exists public.bling_stock_mirror_v2 (
  product_id uuid not null,
  bling_product_id bigint not null,
  physical_total numeric default 0 not null,
  virtual_total numeric default 0 not null,
  deposit_balances jsonb default '{}'::jsonb not null,
  observed_at timestamp with time zone not null,
  source_event_id text,
  source_resource text default 'stock'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_stock_mirror_v2_bling_product_id_key UNIQUE (bling_product_id),
  constraint bling_stock_mirror_v2_pkey PRIMARY KEY (product_id),
  constraint bling_stock_mirror_v2_source_resource_check CHECK ((source_resource = ANY (ARRAY['stock'::text, 'virtual_stock'::text, 'backfill'::text])))
);
alter table public.bling_stock_mirror_v2 enable row level security;
comment on table public.bling_stock_mirror_v2 is 'Read model/cache of Bling physical and virtual stock. Never the ERP source of truth.';

-- table: bling_webhook_inbox_v2
create table if not exists public.bling_webhook_inbox_v2 (
  event_id text not null,
  event_hash text not null,
  event_name text not null,
  resource text not null,
  action text not null,
  company_id text,
  event_version text,
  event_at timestamp with time zone,
  provider_entity_id text,
  payload jsonb not null,
  signature_verified boolean default true not null,
  self_generated_candidate boolean default false not null,
  status text default 'held'::text not null,
  attempt_count integer default 0 not null,
  max_attempts integer default 8 not null,
  next_attempt_at timestamp with time zone default now() not null,
  locked_by text,
  locked_at timestamp with time zone,
  processed_at timestamp with time zone,
  result jsonb default '{}'::jsonb not null,
  last_error text,
  received_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bling_webhook_inbox_v2_pkey PRIMARY KEY (event_id),
  constraint bling_webhook_inbox_v2_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint bling_webhook_inbox_v2_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
  constraint bling_webhook_inbox_v2_status_check CHECK ((status = ANY (ARRAY['held'::text, 'received'::text, 'processing'::text, 'processed'::text, 'ignored'::text, 'review_required'::text, 'retry'::text, 'failed'::text])))
);
alter table public.bling_webhook_inbox_v2 enable row level security;

-- table: caneca_studio_generation_limits
create table if not exists public.caneca_studio_generation_limits (
  client_ip_hash text not null,
  window_started_at timestamp with time zone default now() not null,
  request_count integer default 0 not null,
  last_seen_at timestamp with time zone default now() not null,
  constraint caneca_studio_generation_limits_pkey PRIMARY KEY (client_ip_hash),
  constraint caneca_studio_generation_limits_client_ip_hash_check CHECK ((client_ip_hash ~ '^[0-9a-f]{64}$'::text)),
  constraint caneca_studio_generation_limits_request_count_check CHECK (((request_count >= 0) AND (request_count <= 10)))
);
alter table public.caneca_studio_generation_limits enable row level security;

-- table: caneca_studio_jobs
create table if not exists public.caneca_studio_jobs (
  id uuid default gen_random_uuid() not null,
  created_by uuid,
  title text not null,
  creation_mode text not null,
  input jsonb not null,
  reference_path text,
  status text not null,
  processing boolean default false not null,
  processing_started_at timestamp with time zone,
  correction_count smallint default 0 not null,
  art_versions jsonb default '[]'::jsonb not null,
  mockups jsonb default '[]'::jsonb not null,
  validation jsonb,
  error_code text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  guest_session_id uuid,
  constraint caneca_studio_jobs_pkey PRIMARY KEY (id),
  constraint caneca_studio_jobs_art_versions_check CHECK ((jsonb_typeof(art_versions) = 'array'::text)),
  constraint caneca_studio_jobs_correction_count_check CHECK (((correction_count >= 0) AND (correction_count <= 1))),
  constraint caneca_studio_jobs_creation_mode_check CHECK ((creation_mode = ANY (ARRAY['reference'::text, 'from_scratch'::text]))),
  constraint caneca_studio_jobs_identity_check CHECK ((((created_by IS NOT NULL) AND (guest_session_id IS NULL)) OR ((created_by IS NULL) AND (guest_session_id IS NOT NULL)))),
  constraint caneca_studio_jobs_input_check CHECK ((jsonb_typeof(input) = 'object'::text)),
  constraint caneca_studio_jobs_mockups_check CHECK ((jsonb_typeof(mockups) = 'array'::text)),
  constraint caneca_studio_jobs_status_check CHECK ((status = ANY (ARRAY['art_pending'::text, 'review_pending'::text, 'correction_pending'::text, 'mockup_front_pending'::text, 'mockup_back_pending'::text, 'needs_review'::text, 'failed'::text])))
);
alter table public.caneca_studio_jobs enable row level security;

-- table: capineca_b2b_jobs
create table if not exists public.capineca_b2b_jobs (
  id uuid default gen_random_uuid() not null,
  request_token_hash text not null,
  input jsonb not null,
  logo_path text not null,
  research jsonb,
  concepts jsonb default '[]'::jsonb not null,
  next_concept_index integer default 0 not null,
  status text default 'queued'::text not null,
  processing boolean default false not null,
  processing_until timestamp with time zone,
  error_code text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '15 days'::interval) not null,
  constraint capineca_b2b_jobs_pkey PRIMARY KEY (id),
  constraint capineca_b2b_jobs_next_concept_index_check CHECK (((next_concept_index >= 0) AND (next_concept_index <= 6))),
  constraint capineca_b2b_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'researching'::text, 'generating'::text, 'ready'::text, 'failed'::text])))
);
alter table public.capineca_b2b_jobs enable row level security;

-- table: capineca_b2b_rate_limits
create table if not exists public.capineca_b2b_rate_limits (
  ip_hash text not null,
  window_started_at timestamp with time zone default now() not null,
  attempts integer default 0 not null,
  constraint capineca_b2b_rate_limits_pkey PRIMARY KEY (ip_hash),
  constraint capineca_b2b_rate_limits_attempts_check CHECK ((attempts >= 0))
);
alter table public.capineca_b2b_rate_limits enable row level security;

-- table: carts
create table if not exists public.carts (
  id uuid default gen_random_uuid() not null,
  conversation_id uuid not null,
  customer_id uuid,
  basket_id uuid,
  status text default 'draft'::text not null,
  subtotal numeric(12,2) default 0 not null,
  adjustments numeric(12,2) default 0 not null,
  total numeric(12,2) default 0 not null,
  currency character(3) default 'BRL'::bpchar not null,
  version integer default 1 not null,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  base_commercial_price numeric default 0 not null,
  fiscal_subtotal numeric default 0 not null,
  other_expenses numeric default 0 not null,
  discount numeric default 0 not null,
  pricing_status text default 'ready'::text not null,
  pricing_issues jsonb default '[]'::jsonb not null,
  basket_hidden_adjustment numeric(14,2) default 0 not null,
  constraint carts_pkey PRIMARY KEY (id),
  constraint carts_pricing_status_check CHECK ((pricing_status = ANY (ARRAY['ready'::text, 'needs_review'::text]))),
  constraint carts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'converted'::text, 'abandoned'::text, 'cancelled'::text])))
);
alter table public.carts enable row level security;

-- table: catalog_sessions
create table if not exists public.catalog_sessions (
  id uuid default gen_random_uuid() not null,
  public_token text default (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) not null,
  customer_id uuid,
  conversation_id uuid,
  cart_id uuid,
  kind text default 'personalized'::text not null,
  title text,
  status text default 'open'::text not null,
  expires_at timestamp with time zone default (now() + '24:00:00'::interval) not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  last_opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  experience text default 'shopping_room'::text not null,
  last_activity_at timestamp with time zone default now() not null,
  checkout_started_at timestamp with time zone,
  completed_at timestamp with time zone,
  current_view text default 'home'::text not null,
  constraint catalog_sessions_public_token_key UNIQUE (public_token),
  constraint catalog_sessions_pkey PRIMARY KEY (id),
  constraint catalog_sessions_experience_check CHECK ((experience = ANY (ARRAY['shopping_room'::text, 'legacy_catalog'::text]))),
  constraint catalog_sessions_kind_check CHECK ((kind = ANY (ARRAY['personalized'::text, 'offers'::text, 'browse'::text, 'basket'::text, 'manual'::text]))),
  constraint catalog_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'expired'::text])))
);
alter table public.catalog_sessions enable row level security;

-- table: conversations
create table if not exists public.conversations (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid,
  customer_id uuid,
  wa_contact_e164 text,
  source text default 'unknown'::text not null,
  status text default 'open'::text not null,
  stage text default 'new'::text not null,
  response_preference text default 'auto'::text not null,
  human_required boolean default false not null,
  referral jsonb default '{}'::jsonb not null,
  context_summary text,
  opened_at timestamp with time zone default now() not null,
  last_inbound_at timestamp with time zone,
  last_outbound_at timestamp with time zone,
  service_window_expires_at timestamp with time zone,
  free_entry_window_expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  mode text default 'ai'::text not null,
  last_human_message_at timestamp with time zone,
  human_takeover_at timestamp with time zone,
  ai_resume_at timestamp with time zone,
  assigned_admin_user_id uuid,
  sales_pressure_level smallint default 1 not null,
  proactive_offer_count integer default 0 not null,
  upsell_declined boolean default false not null,
  fast_checkout boolean default false not null,
  last_offer_at timestamp with time zone,
  room_last_active_at timestamp with time zone,
  channel text default 'whatsapp'::text not null,
  automation_cohort text,
  automation_bucket smallint,
  channel_account_id uuid,
  external_user_id text,
  constraint conversations_pkey PRIMARY KEY (id),
  constraint conversations_automation_bucket_check CHECK (((automation_bucket IS NULL) OR ((automation_bucket >= 0) AND (automation_bucket <= 99)))),
  constraint conversations_automation_cohort_check CHECK (((automation_cohort IS NULL) OR (automation_cohort = ANY (ARRAY['homologation'::text, 'observe'::text, 'ai_canary'::text, 'human_control'::text])))),
  constraint conversations_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'web'::text, 'hybrid'::text, 'instagram'::text, 'messenger'::text]))),
  constraint conversations_channel_identity_v1_check CHECK ((((channel = 'whatsapp'::text) AND (whatsapp_account_id IS NOT NULL)) OR ((channel = ANY (ARRAY['instagram'::text, 'messenger'::text])) AND (channel_account_id IS NOT NULL) AND (NULLIF(btrim(external_user_id), ''::text) IS NOT NULL)) OR (channel = ANY (ARRAY['web'::text, 'hybrid'::text])))),
  constraint conversations_mode_check CHECK ((mode = ANY (ARRAY['ai'::text, 'human'::text, 'human_copilot'::text, 'paused'::text]))),
  constraint conversations_response_preference_check CHECK ((response_preference = ANY (ARRAY['auto'::text, 'text'::text, 'audio'::text]))),
  constraint conversations_sales_pressure_check CHECK (((sales_pressure_level >= 0) AND (sales_pressure_level <= 3))),
  constraint conversations_source_check CHECK ((source = ANY (ARRAY['organic'::text, 'meta_ad'::text, 'campaign'::text, 'catalog'::text, 'website'::text, 'unknown'::text]))),
  constraint conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'waiting_customer'::text, 'needs_human'::text, 'closed'::text])))
);
alter table public.conversations enable row level security;

-- table: cosmos_catalog_families
create table if not exists public.cosmos_catalog_families (
  id uuid default gen_random_uuid() not null,
  brand text,
  product_type text,
  product_line text,
  presentation_key text,
  shared_attributes jsonb default '{}'::jsonb not null,
  evidence jsonb default '{}'::jsonb not null,
  verification_status text default 'candidate'::text not null,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint cosmos_catalog_families_pkey PRIMARY KEY (id),
  constraint cosmos_catalog_families_verification_status_check CHECK ((verification_status = ANY (ARRAY['candidate'::text, 'verified'::text, 'rejected'::text])))
);
alter table public.cosmos_catalog_families enable row level security;
comment on table public.cosmos_catalog_families is 'Famílias candidatas/validadas. Campos físicos só podem ser herdados mediante equivalência comprovada. NCM e CEST jamais são herdados automaticamente.';

-- table: cosmos_catalog_family_members
create table if not exists public.cosmos_catalog_family_members (
  product_id uuid not null,
  family_id uuid not null,
  variant_attributes jsonb default '{}'::jsonb not null,
  status text default 'candidate'::text not null,
  evidence jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint cosmos_catalog_family_members_pkey PRIMARY KEY (product_id),
  constraint cosmos_catalog_family_members_status_check CHECK ((status = ANY (ARRAY['candidate'::text, 'confirmed'::text, 'rejected'::text])))
);
alter table public.cosmos_catalog_family_members enable row level security;

-- table: cosmos_ean_capture_research_v1
create table if not exists public.cosmos_ean_capture_research_v1 (
  id uuid default gen_random_uuid() not null,
  capture_id uuid not null,
  gtin text not null,
  status text not null,
  proposal jsonb default '{}'::jsonb not null,
  response_summary jsonb default '{}'::jsonb not null,
  last_http_status integer,
  last_error text,
  attempted_at timestamp with time zone,
  researched_at timestamp with time zone,
  researched_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint cosmos_ean_capture_research_v1_capture_id_key UNIQUE (capture_id),
  constraint cosmos_ean_capture_research_v1_pkey PRIMARY KEY (id),
  constraint cosmos_ean_capture_research_v1_gtin_check CHECK ((gtin ~ '^[0-9]{8,14}$'::text)),
  constraint cosmos_ean_capture_research_v1_status_check CHECK ((status = ANY (ARRAY['researching'::text, 'review'::text, 'not_found'::text, 'error'::text])))
);
alter table public.cosmos_ean_capture_research_v1 enable row level security;

-- table: cosmos_product_research
create table if not exists public.cosmos_product_research (
  product_id uuid not null,
  gtin text not null,
  candidate_cohort_key text,
  status text default 'pending'::text not null,
  response_summary jsonb default '{}'::jsonb not null,
  proposed_attributes jsonb default '{}'::jsonb not null,
  identity_verified boolean default false not null,
  source_license_confirmed boolean default false not null,
  last_http_status integer,
  last_error text,
  last_attempt_at timestamp with time zone,
  retry_after timestamp with time zone,
  researched_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint cosmos_product_research_pkey PRIMARY KEY (product_id),
  constraint cosmos_product_research_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reserved'::text, 'review'::text, 'not_found'::text, 'retry'::text, 'blocked'::text])))
);
alter table public.cosmos_product_research enable row level security;

-- table: cosmos_research_config
create table if not exists public.cosmos_research_config (
  id boolean default true not null,
  enabled boolean default false not null,
  daily_limit smallint default 25 not null,
  max_batch smallint default 5 not null,
  updated_at timestamp with time zone default now() not null,
  research_mode text default 'representatives_only'::text not null,
  constraint cosmos_research_config_pkey PRIMARY KEY (id),
  constraint cosmos_research_config_daily_limit_check CHECK (((daily_limit >= 1) AND (daily_limit <= 25))),
  constraint cosmos_research_config_id_check CHECK (id),
  constraint cosmos_research_config_max_batch_check CHECK (((max_batch >= 1) AND (max_batch <= 5))),
  constraint cosmos_research_config_research_mode_check CHECK ((research_mode = ANY (ARRAY['representatives_only'::text, 'full'::text])))
);
alter table public.cosmos_research_config enable row level security;

-- table: cosmos_research_requests
create table if not exists public.cosmos_research_requests (
  id bigint generated always as identity not null,
  quota_date date not null,
  quota_slot smallint not null,
  product_id uuid not null,
  gtin text not null,
  state text default 'reserved'::text not null,
  http_status integer,
  completed_at timestamp with time zone,
  error_code text,
  created_at timestamp with time zone default now() not null,
  constraint cosmos_research_requests_quota_date_quota_slot_key UNIQUE (quota_date, quota_slot),
  constraint cosmos_research_requests_pkey PRIMARY KEY (id),
  constraint cosmos_research_requests_quota_slot_check CHECK (((quota_slot >= 1) AND (quota_slot <= 25))),
  constraint cosmos_research_requests_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'found'::text, 'not_found'::text, 'http_error'::text, 'rate_limited'::text, 'invalid_identity'::text, 'network_error'::text])))
);
alter table public.cosmos_research_requests enable row level security;

-- table: customer_address_reference_photos_v1
create table if not exists public.customer_address_reference_photos_v1 (
  id uuid default gen_random_uuid() not null,
  customer_address_id uuid not null,
  stop_id uuid not null,
  order_id uuid not null,
  driver_id uuid not null,
  storage_path text not null,
  content_type text not null,
  size_bytes integer not null,
  captured_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint customer_address_reference_photos_v1_storage_path_key UNIQUE (storage_path),
  constraint customer_address_reference_photos_v1_pkey PRIMARY KEY (id),
  constraint customer_address_reference_photos_v1_content_type_check CHECK ((content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
  constraint customer_address_reference_photos_v1_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 5242880)))
);
alter table public.customer_address_reference_photos_v1 enable row level security;

-- table: customer_addresses
create table if not exists public.customer_addresses (
  id uuid default gen_random_uuid() not null,
  customer_id uuid not null,
  bling_address_ref text,
  label text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  reference text,
  is_default boolean default false not null,
  is_active boolean default true not null,
  last_confirmed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  google_maps_url text,
  block text,
  latitude numeric,
  longitude numeric,
  constraint customer_addresses_pkey PRIMARY KEY (id)
);
alter table public.customer_addresses enable row level security;

-- table: customer_emails
create table if not exists public.customer_emails (
  id uuid default gen_random_uuid() not null,
  customer_id uuid,
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  verification_status text default 'observed'::text not null,
  is_primary boolean default false not null,
  source text default 'observed'::text not null,
  evidence jsonb default '{}'::jsonb not null,
  verified_at timestamp with time zone,
  linked_at timestamp with time zone,
  linked_by_admin_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customer_emails_pkey PRIMARY KEY (id),
  constraint customer_emails_check CHECK (((verification_status <> 'verified'::text) OR ((customer_id IS NOT NULL) AND (verified_at IS NOT NULL)))),
  constraint customer_emails_email_normalized_check CHECK (((length(email_normalized) >= 3) AND (length(email_normalized) <= 320))),
  constraint customer_emails_email_normalized_check1 CHECK ((POSITION(('@'::text) IN (email_normalized)) > 1)),
  constraint customer_emails_verification_status_check CHECK ((verification_status = ANY (ARRAY['observed'::text, 'verified'::text, 'conflicted'::text, 'revoked'::text])))
);
alter table public.customer_emails enable row level security;

-- table: customer_identity_profiles_v1
create table if not exists public.customer_identity_profiles_v1 (
  customer_id uuid not null,
  identity_status text default 'provisional'::text not null,
  created_from text default 'unknown'::text not null,
  canonical_phone_e164 text,
  last_source_key text,
  verified_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customer_identity_profiles_v1_pkey PRIMARY KEY (customer_id),
  constraint customer_identity_profiles_v1_identity_status_check CHECK ((identity_status = ANY (ARRAY['provisional'::text, 'verified_flow'::text, 'verified_existing'::text, 'review_required'::text, 'merged'::text])))
);
alter table public.customer_identity_profiles_v1 enable row level security;

-- table: customer_location_evidence_v1
create table if not exists public.customer_location_evidence_v1 (
  id uuid default gen_random_uuid() not null,
  customer_id uuid,
  customer_address_id uuid,
  order_id uuid,
  conversation_id uuid,
  whatsapp_message_id uuid,
  source text not null,
  direction text,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  label text,
  address_text text,
  confidence text default 'unconfirmed'::text not null,
  confirmation_source text,
  confirmed_at timestamp with time zone,
  captured_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customer_location_evidence_v1_pkey PRIMARY KEY (id),
  constraint customer_location_evidence_confirmation_ck CHECK (((confidence <> 'confirmed'::text) OR (confirmed_at IS NOT NULL))),
  constraint customer_location_evidence_v1_confidence_check CHECK ((confidence = ANY (ARRAY['unconfirmed'::text, 'probable'::text, 'confirmed'::text]))),
  constraint customer_location_evidence_v1_direction_check CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text])))),
  constraint customer_location_evidence_v1_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
  constraint customer_location_evidence_v1_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
  constraint customer_location_evidence_v1_source_check CHECK ((source = ANY (ARRAY['customer_whatsapp'::text, 'business_whatsapp'::text, 'driver'::text, 'admin'::text, 'geocoder'::text, 'import'::text])))
);
alter table public.customer_location_evidence_v1 enable row level security;
comment on table public.customer_location_evidence_v1 is 'Smart Delivery: immutable-ish evidence of real delivery locations. Evidence must be explicitly promoted/confirmed before changing a customer address.';

-- table: customer_phones
create table if not exists public.customer_phones (
  id uuid default gen_random_uuid() not null,
  customer_id uuid not null,
  phone_e164 text not null,
  source text default 'whatsapp'::text not null,
  is_primary boolean default false not null,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint customer_phones_phone_e164_key UNIQUE (phone_e164),
  constraint customer_phones_pkey PRIMARY KEY (id),
  constraint customer_phones_source_check CHECK ((source = ANY (ARRAY['whatsapp'::text, 'bling'::text, 'manual'::text, 'import'::text, 'papoai_flow'::text, 'vitrine_admin'::text])))
);
alter table public.customer_phones enable row level security;

-- table: customer_profile_confirmation_requests_v1
create table if not exists public.customer_profile_confirmation_requests_v1 (
  id uuid default gen_random_uuid() not null,
  conversation_id uuid not null,
  customer_id uuid,
  suggestion_ids uuid[] not null,
  confirmation_summary jsonb default '[]'::jsonb not null,
  status text default 'pending'::text not null,
  requested_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '00:30:00'::interval) not null,
  outbound_message_id uuid,
  confirmation_inbound_message_id uuid,
  created_by_admin_user_id uuid,
  completed_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customer_profile_confirmation_requests_v1_pkey PRIMARY KEY (id),
  constraint customer_profile_confirmation_reques_confirmation_summary_check CHECK ((jsonb_typeof(confirmation_summary) = 'array'::text)),
  constraint customer_profile_confirmation_requests_v1_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
  constraint customer_profile_confirmation_requests_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'corrected'::text, 'expired'::text, 'cancelled'::text]))),
  constraint customer_profile_confirmation_requests_v1_suggestion_ids_check CHECK (((cardinality(suggestion_ids) >= 1) AND (cardinality(suggestion_ids) <= 8)))
);
alter table public.customer_profile_confirmation_requests_v1 enable row level security;

-- table: customer_profile_extraction_runs_v1
create table if not exists public.customer_profile_extraction_runs_v1 (
  id uuid default gen_random_uuid() not null,
  conversation_id uuid not null,
  customer_id uuid,
  conversation_phone_e164 text,
  snapshot_key text not null,
  status text default 'completed'::text not null,
  model text,
  provider_response_id text,
  metadata jsonb default '{}'::jsonb not null,
  created_by_admin_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customer_profile_extraction_ru_conversation_id_snapshot_key_key UNIQUE (conversation_id, snapshot_key),
  constraint customer_profile_extraction_runs_v1_pkey PRIMARY KEY (id),
  constraint customer_profile_extraction_runs_v1_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text])))
);
alter table public.customer_profile_extraction_runs_v1 enable row level security;

-- table: customer_profile_suggestions_v1
create table if not exists public.customer_profile_suggestions_v1 (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  conversation_id uuid not null,
  customer_id uuid,
  field_name text not null,
  suggested_value jsonb not null,
  normalized_value text not null,
  confidence numeric(5,4) not null,
  classification text not null,
  recommendation text not null,
  evidence_message_ids uuid[] default ARRAY[]::uuid[] not null,
  status text default 'pending'::text not null,
  model text,
  policy_version text default 'ana_customer_profile_v1'::text not null,
  reviewed_by_admin_user_id uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customer_profile_suggestions__run_id_field_name_normalized__key UNIQUE (run_id, field_name, normalized_value),
  constraint customer_profile_suggestions_v1_pkey PRIMARY KEY (id),
  constraint customer_profile_suggestions_v1_classification_check CHECK ((classification = ANY (ARRAY['explicit'::text, 'derived'::text, 'ambiguous'::text]))),
  constraint customer_profile_suggestions_v1_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  constraint customer_profile_suggestions_v1_field_name_check CHECK ((field_name = ANY (ARRAY['name'::text, 'cpf_cnpj'::text, 'email'::text, 'postal_code'::text, 'street'::text, 'number'::text, 'complement'::text, 'neighborhood'::text, 'city'::text, 'state'::text, 'reference'::text]))),
  constraint customer_profile_suggestions_v1_recommendation_check CHECK ((recommendation = ANY (ARRAY['auto_apply'::text, 'confirm'::text, 'ignore'::text]))),
  constraint customer_profile_suggestions_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed_accepted'::text, 'reviewed_rejected'::text, 'expired'::text])))
);
alter table public.customer_profile_suggestions_v1 enable row level security;

-- table: customers
create table if not exists public.customers (
  id uuid default gen_random_uuid() not null,
  bling_contact_id bigint,
  name text,
  cpf_cnpj text,
  primary_whatsapp_e164 text,
  preferred_reply text default 'auto'::text not null,
  is_active boolean default true not null,
  last_bling_sync_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  shopping_mode text default 'auto'::text not null,
  catalog_skill_score smallint default 0 not null,
  catalog_open_count integer default 0 not null,
  catalog_success_count integer default 0 not null,
  last_catalog_at timestamp with time zone,
  last_order_at timestamp with time zone,
  order_count integer default 0 not null,
  lifetime_value numeric(14,2) default 0 not null,
  inbound_text_count integer default 0 not null,
  inbound_audio_count integer default 0 not null,
  inbound_image_count integer default 0 not null,
  last_inbound_message_type text,
  birthday_day smallint,
  birthday_month smallint,
  marketing_opt_in boolean default false not null,
  marketing_consent_updated_at timestamp with time zone,
  constraint customers_bling_contact_id_key UNIQUE (bling_contact_id),
  constraint customers_primary_whatsapp_e164_key UNIQUE (primary_whatsapp_e164),
  constraint customers_pkey PRIMARY KEY (id),
  constraint customers_birthday_valid CHECK ((((birthday_day IS NULL) AND (birthday_month IS NULL)) OR ((birthday_day IS NOT NULL) AND (birthday_month IS NOT NULL) AND ((birthday_month >= 1) AND (birthday_month <= 12)) AND ((birthday_day >= 1) AND (birthday_day <=
CASE
    WHEN (birthday_month = 2) THEN 29
    WHEN (birthday_month = ANY (ARRAY[4, 6, 9, 11])) THEN 30
    ELSE 31
END))))),
  constraint customers_catalog_skill_score_check CHECK (((catalog_skill_score >= 0) AND (catalog_skill_score <= 100))),
  constraint customers_preferred_reply_check CHECK ((preferred_reply = ANY (ARRAY['auto'::text, 'text'::text, 'audio'::text]))),
  constraint customers_shopping_mode_check CHECK ((shopping_mode = ANY (ARRAY['auto'::text, 'catalog_first'::text, 'whatsapp_only'::text, 'hybrid'::text])))
);
alter table public.customers enable row level security;

-- table: da_instagram_automations_v1
create table if not exists public.da_instagram_automations_v1 (
  id uuid default gen_random_uuid() not null,
  automation_key text not null,
  name text not null,
  content_format text not null,
  source_type text default 'daily_offers'::text not null,
  status text default 'active'::text not null,
  schedule_days smallint[] default ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint] not null,
  schedule_times text[] default ARRAY['07:05'::text] not null,
  time_zone text default 'America/Cuiaba'::text not null,
  products_per_post smallint default 1 not null,
  caption_template text default ''::text not null,
  last_run_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint da_instagram_automations_v1_automation_key_key UNIQUE (automation_key),
  constraint da_instagram_automations_v1_pkey PRIMARY KEY (id),
  constraint da_instagram_automations_v1_caption_template_check CHECK ((length(caption_template) <= 2200)),
  constraint da_instagram_automations_v1_content_format_check CHECK ((content_format = ANY (ARRAY['story'::text, 'feed'::text, 'carousel'::text]))),
  constraint da_instagram_automations_v1_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 80))),
  constraint da_instagram_automations_v1_products_per_post_check CHECK (((products_per_post >= 1) AND (products_per_post <= 48))),
  constraint da_instagram_automations_v1_schedule_days_check CHECK ((((cardinality(schedule_days) >= 1) AND (cardinality(schedule_days) <= 7)) AND (schedule_days <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))),
  constraint da_instagram_automations_v1_schedule_times_check CHECK (((cardinality(schedule_times) >= 1) AND (cardinality(schedule_times) <= 8))),
  constraint da_instagram_automations_v1_source_type_check CHECK ((source_type = 'daily_offers'::text)),
  constraint da_instagram_automations_v1_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text]))),
  constraint da_instagram_automations_v1_time_zone_check CHECK ((time_zone = 'America/Cuiaba'::text))
);
alter table public.da_instagram_automations_v1 enable row level security;

-- table: da_instagram_job_events_v1
create table if not exists public.da_instagram_job_events_v1 (
  id bigint generated always as identity not null,
  job_id uuid not null,
  event_type text not null,
  message text default ''::text not null,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint da_instagram_job_events_v1_pkey PRIMARY KEY (id),
  constraint da_instagram_job_events_v1_details_check CHECK ((jsonb_typeof(details) = 'object'::text)),
  constraint da_instagram_job_events_v1_event_type_check CHECK (((length(event_type) >= 2) AND (length(event_type) <= 40))),
  constraint da_instagram_job_events_v1_message_check CHECK ((length(message) <= 500))
);
alter table public.da_instagram_job_events_v1 enable row level security;

-- table: da_instagram_job_items_v1
create table if not exists public.da_instagram_job_items_v1 (
  id uuid default gen_random_uuid() not null,
  job_id uuid not null,
  item_number smallint not null,
  product_id uuid,
  product_name text default ''::text not null,
  asset_path text,
  creation_id text,
  meta_media_id text,
  status text default 'queued'::text not null,
  last_error text,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint da_instagram_job_items_v1_job_id_item_number_key UNIQUE (job_id, item_number),
  constraint da_instagram_job_items_v1_pkey PRIMARY KEY (id),
  constraint da_instagram_job_items_v1_item_number_check CHECK (((item_number >= 1) AND (item_number <= 48))),
  constraint da_instagram_job_items_v1_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'asset_ready'::text, 'container_created'::text, 'published'::text, 'failed'::text, 'needs_review'::text])))
);
alter table public.da_instagram_job_items_v1 enable row level security;

-- table: da_instagram_jobs_v1
create table if not exists public.da_instagram_jobs_v1 (
  id uuid default gen_random_uuid() not null,
  automation_id uuid not null,
  automation_name text not null,
  content_format text not null,
  source_type text default 'daily_offers'::text not null,
  scheduled_for timestamp with time zone not null,
  run_kind text default 'scheduled'::text not null,
  source_date date,
  status text default 'queued'::text not null,
  products_per_post smallint default 1 not null,
  selected_products jsonb default '[]'::jsonb not null,
  caption text default ''::text not null,
  meta_creation_id text,
  meta_media_id text,
  attempt_count smallint default 0 not null,
  last_error text,
  result jsonb default '{}'::jsonb not null,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint da_instagram_jobs_v1_automation_id_scheduled_for_key UNIQUE (automation_id, scheduled_for),
  constraint da_instagram_jobs_v1_pkey PRIMARY KEY (id),
  constraint da_instagram_jobs_v1_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 20))),
  constraint da_instagram_jobs_v1_caption_check CHECK ((length(caption) <= 2200)),
  constraint da_instagram_jobs_v1_content_format_check CHECK ((content_format = ANY (ARRAY['story'::text, 'feed'::text, 'carousel'::text]))),
  constraint da_instagram_jobs_v1_products_per_post_check CHECK (((products_per_post >= 1) AND (products_per_post <= 48))),
  constraint da_instagram_jobs_v1_result_check CHECK ((jsonb_typeof(result) = 'object'::text)),
  constraint da_instagram_jobs_v1_run_kind_check CHECK ((run_kind = ANY (ARRAY['scheduled'::text, 'manual'::text]))),
  constraint da_instagram_jobs_v1_selected_products_check CHECK ((jsonb_typeof(selected_products) = 'array'::text)),
  constraint da_instagram_jobs_v1_source_type_check CHECK ((source_type = 'daily_offers'::text)),
  constraint da_instagram_jobs_v1_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'pending'::text, 'assets_ready'::text, 'container_created'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'needs_review'::text, 'skipped'::text])))
);
alter table public.da_instagram_jobs_v1 enable row level security;

-- table: da_instagram_story_creatives_v1
create table if not exists public.da_instagram_story_creatives_v1 (
  id uuid default gen_random_uuid() not null,
  phrase text not null,
  theme text not null,
  extra_info text default ''::text not null,
  status text default 'generating'::text not null,
  image_path text,
  image_size_bytes integer,
  model text default 'gpt-image-2'::text not null,
  quality text default 'low'::text not null,
  estimated_cost_usd numeric(10,6) default 0.005 not null,
  meta_creation_id text,
  meta_media_id text,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  published_at timestamp with time zone,
  constraint da_instagram_story_creatives_v1_pkey PRIMARY KEY (id),
  constraint da_instagram_story_creatives_v1_estimated_cost_usd_check CHECK ((estimated_cost_usd >= (0)::numeric)),
  constraint da_instagram_story_creatives_v1_extra_info_check CHECK ((char_length(extra_info) <= 240)),
  constraint da_instagram_story_creatives_v1_image_size_bytes_check CHECK (((image_size_bytes IS NULL) OR ((image_size_bytes >= 1) AND (image_size_bytes <= 102400)))),
  constraint da_instagram_story_creatives_v1_model_check CHECK ((model = 'gpt-image-2'::text)),
  constraint da_instagram_story_creatives_v1_phrase_check CHECK (((char_length(btrim(phrase)) >= 1) AND (char_length(btrim(phrase)) <= 160))),
  constraint da_instagram_story_creatives_v1_quality_check CHECK ((quality = 'low'::text)),
  constraint da_instagram_story_creatives_v1_status_check CHECK ((status = ANY (ARRAY['generating'::text, 'ready'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'needs_review'::text]))),
  constraint da_instagram_story_creatives_v1_theme_check CHECK (((char_length(btrim(theme)) >= 2) AND (char_length(btrim(theme)) <= 160)))
);
alter table public.da_instagram_story_creatives_v1 enable row level security;
comment on table public.da_instagram_story_creatives_v1 is 'Rascunhos de Stories gerados sob demanda e publicados somente após aprovação manual no admin.';

-- table: da_offer_status_images_v1
create table if not exists public.da_offer_status_images_v1 (
  offer_date date not null,
  status text default 'pending'::text not null,
  product_count integer default 0 not null,
  image_count integer default 0 not null,
  unpictured_count integer default 0 not null,
  image_paths jsonb default '[]'::jsonb not null,
  zip_path text,
  generated_at timestamp with time zone,
  error_message text,
  updated_at timestamp with time zone default now() not null,
  constraint da_offer_status_images_v1_pkey PRIMARY KEY (offer_date),
  constraint da_offer_status_images_v1_image_count_check CHECK ((image_count >= 0)),
  constraint da_offer_status_images_v1_product_count_check CHECK ((product_count >= 0)),
  constraint da_offer_status_images_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'ready'::text, 'failed'::text, 'empty'::text]))),
  constraint da_offer_status_images_v1_unpictured_count_check CHECK ((unpictured_count >= 0))
);
alter table public.da_offer_status_images_v1 enable row level security;

-- table: da_offer_story_publications_v1
create table if not exists public.da_offer_story_publications_v1 (
  offer_date date not null,
  image_number smallint not null,
  source_path text not null,
  status text default 'pending'::text not null,
  attempt_count smallint default 0 not null,
  creation_id text,
  story_id text,
  last_error text,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint da_offer_story_publications_v1_pkey PRIMARY KEY (offer_date, image_number),
  constraint da_offer_story_publications_v1_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 3))),
  constraint da_offer_story_publications_v1_image_number_check CHECK (((image_number >= 1) AND (image_number <= 8))),
  constraint da_offer_story_publications_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'creating'::text, 'container_created'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'needs_review'::text])))
);
alter table public.da_offer_story_publications_v1 enable row level security;

-- table: delivery_customer_notifications_v1
create table if not exists public.delivery_customer_notifications_v1 (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  stop_id uuid not null,
  order_id uuid not null,
  driver_id uuid not null,
  channel text not null,
  template_name text not null,
  eta_minutes integer not null,
  status text not null,
  provider_message_id text,
  last_error text,
  attempt_count integer default 1 not null,
  payload jsonb default '{}'::jsonb not null,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint delivery_customer_notifications_v1_run_id_stop_id_key UNIQUE (run_id, stop_id),
  constraint delivery_customer_notifications_v1_pkey PRIMARY KEY (id),
  constraint delivery_customer_notifications_v1_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 10))),
  constraint delivery_customer_notifications_v1_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint delivery_customer_notifications_v1_eta_minutes_check CHECK (((eta_minutes >= 5) AND (eta_minutes <= 120))),
  constraint delivery_customer_notifications_v1_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'accepted'::text, 'uncertain'::text, 'failed'::text])))
);
alter table public.delivery_customer_notifications_v1 enable row level security;

-- table: delivery_driver_access_v1
create table if not exists public.delivery_driver_access_v1 (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  token_hash text not null,
  issued_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  last_used_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone default now() not null,
  constraint delivery_driver_access_v1_token_hash_key UNIQUE (token_hash),
  constraint delivery_driver_access_v1_pkey PRIMARY KEY (id),
  constraint delivery_driver_access_v1_expiry_check CHECK ((expires_at > issued_at)),
  constraint delivery_driver_access_v1_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);
alter table public.delivery_driver_access_v1 enable row level security;

-- table: delivery_drivers_v1
create table if not exists public.delivery_drivers_v1 (
  id uuid default gen_random_uuid() not null,
  name text not null,
  phone_e164 text,
  is_active boolean default true not null,
  home_region_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint delivery_drivers_v1_pkey PRIMARY KEY (id)
);
alter table public.delivery_drivers_v1 enable row level security;
comment on table public.delivery_drivers_v1 is 'Smart Delivery: driver registry independent from WhatsApp/customer identities.';

-- table: delivery_regions_v1
create table if not exists public.delivery_regions_v1 (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  city text,
  state text default 'MT'::text,
  is_active boolean default true not null,
  priority integer default 100 not null,
  polygon_geojson jsonb,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint delivery_regions_v1_code_key UNIQUE (code),
  constraint delivery_regions_v1_pkey PRIMARY KEY (id)
);
alter table public.delivery_regions_v1 enable row level security;
comment on table public.delivery_regions_v1 is 'Smart Delivery: operational delivery regions. Polygon is optional until geographic boundaries are homologated.';

-- table: delivery_vehicles_v1
create table if not exists public.delivery_vehicles_v1 (
  id uuid default gen_random_uuid() not null,
  label text not null,
  plate text,
  vehicle_type text,
  capacity_units integer,
  is_active boolean default true not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint delivery_vehicles_v1_pkey PRIMARY KEY (id)
);
alter table public.delivery_vehicles_v1 enable row level security;
comment on table public.delivery_vehicles_v1 is 'Smart Delivery: vehicle registry used by delivery runs.';

-- table: dispatch_fiscal_jobs
create table if not exists public.dispatch_fiscal_jobs (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  source_order_id uuid not null,
  bling_order_id bigint,
  fiscal_version integer default 1 not null,
  idempotency_key text not null,
  status text default 'held'::text not null,
  external_side_effect boolean default false not null,
  attempts integer default 0 not null,
  max_attempts integer default 1 not null,
  bling_invoice_id bigint,
  bling_invoice_number text,
  access_key text,
  sefaz_status text,
  provider_request_id text,
  error_code text,
  error_detail text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  next_attempt_at timestamp with time zone default now(),
  constraint dispatch_fiscal_jobs_idempotency_key_key UNIQUE (idempotency_key),
  constraint dispatch_fiscal_jobs_order_id_fiscal_version_key UNIQUE (order_id, fiscal_version),
  constraint dispatch_fiscal_jobs_pkey PRIMARY KEY (id),
  constraint dispatch_fiscal_jobs_attempts_check CHECK ((attempts >= 0)),
  constraint dispatch_fiscal_jobs_fiscal_version_check CHECK ((fiscal_version > 0)),
  constraint dispatch_fiscal_jobs_max_attempts_check CHECK ((max_attempts = 1)),
  constraint dispatch_fiscal_jobs_status_check CHECK ((status = ANY (ARRAY['held'::text, 'ready'::text, 'generating'::text, 'generated'::text, 'authorizing'::text, 'authorized'::text, 'review_required'::text, 'error'::text, 'cancelled'::text])))
);
alter table public.dispatch_fiscal_jobs enable row level security;
comment on table public.dispatch_fiscal_jobs is 'Canário fiscal pré-expedição. Geração/autorização de NF-e é executada somente por Edge Function com gates explícitos e tentativa única.';

-- table: ean_capture_records_v1
create table if not exists public.ean_capture_records_v1 (
  id uuid default gen_random_uuid() not null,
  client_entry_id uuid not null,
  ean text not null,
  quantity numeric(12,3) not null,
  expires_on date,
  sync_status text default 'pending'::text not null,
  matched_product_id uuid,
  synced_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  photo_path text,
  photo_captured_at timestamp with time zone,
  constraint ean_capture_records_v1_client_entry_id_key UNIQUE (client_entry_id),
  constraint ean_capture_records_v1_pkey PRIMARY KEY (id),
  constraint ean_capture_records_v1_ean_check CHECK ((ean ~ '^[0-9]{8,14}$'::text)),
  constraint ean_capture_records_v1_quantity_check CHECK (((quantity > (0)::numeric) AND (quantity <= (999999)::numeric))),
  constraint ean_capture_records_v1_sync_status_check CHECK ((sync_status = ANY (ARRAY['pending'::text, 'found'::text, 'not_found'::text])))
);
alter table public.ean_capture_records_v1 enable row level security;
comment on table public.ean_capture_records_v1 is 'Leituras operacionais EAN independentes, sem atualizar produtos/estoque/site. Dados preservados para etapa futura autorizada.';

-- table: fiscal_ai_family_jobs
create table if not exists public.fiscal_ai_family_jobs (
  id bigint generated always as identity not null,
  ncm text not null,
  sample_names jsonb default '[]'::jsonb not null,
  product_count integer default 0 not null,
  status text default 'pending'::text not null,
  priority integer default 100 not null,
  attempt_count integer default 0 not null,
  requires_web boolean default false not null,
  official_domains text[] default ARRAY['sefaz.mt.gov.br'::text, 'confaz.fazenda.gov.br'::text, 'gov.br'::text] not null,
  result jsonb,
  error text,
  estimated_cost_usd numeric(12,6) default 0 not null,
  actual_cost_usd numeric(12,6),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint fiscal_ai_family_jobs_ncm_key UNIQUE (ncm),
  constraint fiscal_ai_family_jobs_pkey PRIMARY KEY (id),
  constraint fiscal_ai_family_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'resolved'::text, 'review'::text, 'failed'::text])))
);
alter table public.fiscal_ai_family_jobs enable row level security;
comment on table public.fiscal_ai_family_jobs is 'Internal fiscal classification queue grouped by NCM. Deterministic rules first; AI/web only for unresolved families. No automatic Bling writes.';

-- table: fiscal_ai_worker_control
create table if not exists public.fiscal_ai_worker_control (
  id boolean default true not null,
  enabled boolean default true not null,
  batch_size integer default 5 not null,
  max_attempts integer default 3 not null,
  stale_minutes integer default 15 not null,
  updated_at timestamp with time zone default now() not null,
  constraint fiscal_ai_worker_control_pkey PRIMARY KEY (id),
  constraint fiscal_ai_worker_control_batch_size_check CHECK (((batch_size >= 1) AND (batch_size <= 10))),
  constraint fiscal_ai_worker_control_id_check CHECK (id),
  constraint fiscal_ai_worker_control_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 10))),
  constraint fiscal_ai_worker_control_stale_minutes_check CHECK (((stale_minutes >= 5) AND (stale_minutes <= 120)))
);
alter table public.fiscal_ai_worker_control enable row level security;

-- table: fiscal_issue_jobs
create table if not exists public.fiscal_issue_jobs (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  fiscal_version integer not null,
  idempotency_key text not null,
  status text default 'held'::text not null,
  external_side_effect boolean default false not null,
  attempts integer default 0 not null,
  max_attempts integer default 1 not null,
  bling_invoice_id bigint,
  provider_request_id text,
  error_code text,
  error_detail text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  constraint fiscal_issue_jobs_idempotency_key_key UNIQUE (idempotency_key),
  constraint fiscal_issue_jobs_order_id_fiscal_version_key UNIQUE (order_id, fiscal_version),
  constraint fiscal_issue_jobs_pkey PRIMARY KEY (id),
  constraint fiscal_issue_jobs_attempts_check CHECK ((attempts >= 0)),
  constraint fiscal_issue_jobs_max_attempts_check CHECK ((max_attempts = 1)),
  constraint fiscal_issue_jobs_status_check CHECK ((status = ANY (ARRAY['held'::text, 'ready'::text, 'processing'::text, 'issued'::text, 'review_required'::text, 'error'::text, 'cancelled'::text])))
);
alter table public.fiscal_issue_jobs enable row level security;

-- table: fiscal_nfe_recovery_control_v1
create table if not exists public.fiscal_nfe_recovery_control_v1 (
  id boolean default true not null,
  enabled boolean default true not null,
  auto_fix_with_verified_evidence boolean default true not null,
  auto_retry_after_verified_fix boolean default true not null,
  max_attempts integer default 3 not null,
  updated_at timestamp with time zone default now() not null,
  min_order_created_at timestamp with time zone not null,
  constraint fiscal_nfe_recovery_control_v1_pkey PRIMARY KEY (id),
  constraint fiscal_nfe_autorecovery_cutover_floor_v1 CHECK ((min_order_created_at >= '2026-10-09 20:08:06.484578+00'::timestamp with time zone)),
  constraint fiscal_nfe_recovery_control_v1_id_check CHECK (id),
  constraint fiscal_nfe_recovery_control_v1_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 5)))
);
alter table public.fiscal_nfe_recovery_control_v1 enable row level security;

-- table: fiscal_nfe_recovery_events_v1
create table if not exists public.fiscal_nfe_recovery_events_v1 (
  id bigint generated by default as identity not null,
  order_id uuid not null,
  dispatch_job_id uuid,
  event_key text not null,
  stage text not null,
  error_code text,
  error_detail text,
  diagnostics jsonb default '{}'::jsonb not null,
  external_write boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint fiscal_nfe_recovery_events_v1_event_key_key UNIQUE (event_key),
  constraint fiscal_nfe_recovery_events_v1_pkey PRIMARY KEY (id)
);
alter table public.fiscal_nfe_recovery_events_v1 enable row level security;

-- table: fiscal_rule_sets
create table if not exists public.fiscal_rule_sets (
  id uuid default gen_random_uuid() not null,
  jurisdiction text default 'MT'::text not null,
  tax_kind text default 'ICMS_ST'::text not null,
  version_key text not null,
  status text default 'draft'::text not null,
  source_title text,
  source_url text,
  legal_reference text,
  content_sha256 text,
  valid_from date,
  valid_to date,
  published_at timestamp with time zone,
  activated_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint fiscal_rule_sets_jurisdiction_tax_kind_version_key_key UNIQUE (jurisdiction, tax_kind, version_key),
  constraint fiscal_rule_sets_pkey PRIMARY KEY (id),
  constraint fiscal_rule_sets_check CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))),
  constraint fiscal_rule_sets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))
);
alter table public.fiscal_rule_sets enable row level security;
comment on table public.fiscal_rule_sets is 'Versioned legal rule-set registry. No rule becomes active merely by being inserted.';

-- table: fiscal_rule_validation_policy
create table if not exists public.fiscal_rule_validation_policy (
  rule_id uuid not null,
  validation_tier text default 'manual_only'::text not null,
  allowed_categories text[] default '{}'::text[] not null,
  verified_on date,
  source_url text,
  rationale text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint fiscal_rule_validation_policy_pkey PRIMARY KEY (rule_id),
  constraint fiscal_rule_validation_policy_validation_tier_check CHECK ((validation_tier = ANY (ARRAY['strict_auto'::text, 'manual_only'::text])))
);
alter table public.fiscal_rule_validation_policy enable row level security;
comment on table public.fiscal_rule_validation_policy is 'Allowlist for fiscal auto-validation. Rules not explicitly strict_auto remain manual-only.';

-- table: fiscal_runtime_config
create table if not exists public.fiscal_runtime_config (
  id smallint default 1 not null,
  enabled boolean default false not null,
  execution_mode text default 'off'::text not null,
  bling_invoice_prepare_enabled boolean default false not null,
  bling_invoice_send_enabled boolean default false not null,
  require_delivery_confirmation boolean default true not null,
  require_payment_confirmation boolean default true not null,
  canary_percent smallint default 0 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  dispatch_gate_mode text default 'observe'::text not null,
  require_fiscal_authorization_before_dispatch boolean default true not null,
  dispatch_invoice_generate_enabled boolean default false not null,
  dispatch_invoice_authorize_enabled boolean default false not null,
  dispatch_invoice_canary_source_order_id uuid,
  dispatch_fiscal_canary_enabled boolean default false not null,
  dispatch_fiscal_canary_armed_at timestamp with time zone,
  dispatch_fiscal_human_issue_enabled boolean default false not null,
  dispatch_fiscal_auto_issue_enabled boolean default false not null,
  dispatch_fiscal_auto_issue_since timestamp with time zone,
  constraint fiscal_runtime_config_pkey PRIMARY KEY (id),
  constraint fiscal_runtime_config_canary_percent_check CHECK (((canary_percent >= 0) AND (canary_percent <= 100))),
  constraint fiscal_runtime_config_dispatch_gate_mode_check CHECK ((dispatch_gate_mode = ANY (ARRAY['off'::text, 'observe'::text, 'enforce'::text]))),
  constraint fiscal_runtime_config_execution_mode_check CHECK ((execution_mode = ANY (ARRAY['off'::text, 'observe'::text, 'dry_run'::text, 'homologation'::text, 'canary'::text, 'live'::text]))),
  constraint fiscal_runtime_config_id_check CHECK ((id = 1))
);
alter table public.fiscal_runtime_config enable row level security;

-- table: fiscal_source_documents
create table if not exists public.fiscal_source_documents (
  id uuid default gen_random_uuid() not null,
  source text not null,
  source_document_id text,
  document_key text not null,
  issued_at timestamp with time zone,
  status text default 'pending'::text not null,
  item_count integer default 0 not null,
  matched_product_count integer default 0 not null,
  unmatched_item_count integer default 0 not null,
  content_sha256 text,
  last_error text,
  metadata jsonb default '{}'::jsonb not null,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint fiscal_source_documents_source_document_key_key UNIQUE (source, document_key),
  constraint fiscal_source_documents_pkey PRIMARY KEY (id),
  constraint fiscal_source_documents_item_count_check CHECK ((item_count >= 0)),
  constraint fiscal_source_documents_matched_product_count_check CHECK ((matched_product_count >= 0)),
  constraint fiscal_source_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'skipped'::text, 'unavailable'::text, 'error'::text]))),
  constraint fiscal_source_documents_unmatched_item_count_check CHECK ((unmatched_item_count >= 0))
);
alter table public.fiscal_source_documents enable row level security;

-- table: fiscal_source_scan_state
create table if not exists public.fiscal_source_scan_state (
  source text not null,
  status text default 'running'::text not null,
  cursor_month date not null,
  cursor_page integer default 1 not null,
  earliest_month date not null,
  months_scanned integer default 0 not null,
  pages_scanned integer default 0 not null,
  documents_seen integer default 0 not null,
  documents_downloaded integer default 0 not null,
  evidence_rows integer default 0 not null,
  matched_items integer default 0 not null,
  unmatched_items integer default 0 not null,
  last_scan_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_error text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint fiscal_source_scan_state_pkey PRIMARY KEY (source),
  constraint fiscal_source_scan_state_cursor_page_check CHECK ((cursor_page >= 1)),
  constraint fiscal_source_scan_state_documents_downloaded_check CHECK ((documents_downloaded >= 0)),
  constraint fiscal_source_scan_state_documents_seen_check CHECK ((documents_seen >= 0)),
  constraint fiscal_source_scan_state_evidence_rows_check CHECK ((evidence_rows >= 0)),
  constraint fiscal_source_scan_state_matched_items_check CHECK ((matched_items >= 0)),
  constraint fiscal_source_scan_state_months_scanned_check CHECK ((months_scanned >= 0)),
  constraint fiscal_source_scan_state_pages_scanned_check CHECK ((pages_scanned >= 0)),
  constraint fiscal_source_scan_state_status_check CHECK ((status = ANY (ARRAY['running'::text, 'paused'::text, 'done'::text, 'error'::text]))),
  constraint fiscal_source_scan_state_unmatched_items_check CHECK ((unmatched_items >= 0))
);
alter table public.fiscal_source_scan_state enable row level security;

-- table: fiscal_st_rules_mt
create table if not exists public.fiscal_st_rules_mt (
  id uuid default gen_random_uuid() not null,
  rule_set_id uuid not null,
  segment_code text,
  segment_name text,
  cest text not null,
  ncm text,
  legal_description text not null,
  qualifiers jsonb default '{}'::jsonb not null,
  valid_from date,
  valid_to date,
  status text default 'active'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  ncm_legal_text text,
  ncm_prefix text,
  match_mode text default 'prefix'::text not null,
  constraint fiscal_st_rules_mt_pkey PRIMARY KEY (id),
  constraint fiscal_st_rules_mt_cest_check CHECK ((cest ~ '^[0-9]{7}$'::text)),
  constraint fiscal_st_rules_mt_check CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))),
  constraint fiscal_st_rules_mt_match_mode_check CHECK ((match_mode = ANY (ARRAY['exact'::text, 'prefix'::text]))),
  constraint fiscal_st_rules_mt_ncm_prefix_check CHECK (((ncm_prefix IS NULL) OR (ncm_prefix ~ '^[0-9]{2,8}$'::text))),
  constraint fiscal_st_rules_mt_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'review_required'::text])))
);
alter table public.fiscal_st_rules_mt enable row level security;
comment on table public.fiscal_st_rules_mt is 'Versioned Mato Grosso ICMS-ST classification rows keyed by rule set, NCM, CEST, segment and legal description.';

-- table: inventory_label_batches
create table if not exists public.inventory_label_batches (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  operator text default 'Operação'::text not null,
  total_files integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint inventory_label_batches_pkey PRIMARY KEY (id),
  constraint inventory_label_batches_total_check CHECK (((total_files >= 0) AND (total_files <= 1000)))
);
alter table public.inventory_label_batches enable row level security;

-- table: inventory_label_counts
create table if not exists public.inventory_label_counts (
  id uuid default gen_random_uuid() not null,
  photo_id uuid not null,
  batch_id uuid not null,
  product_id uuid not null,
  label_serial text not null,
  balance_slot smallint not null,
  quantity smallint not null,
  confidence numeric(5,4) default 0 not null,
  status text default 'pending_review'::text not null,
  created_at timestamp with time zone default now() not null,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  constraint inventory_label_counts_label_serial_balance_slot_key UNIQUE (label_serial, balance_slot),
  constraint inventory_label_counts_pkey PRIMARY KEY (id),
  constraint inventory_label_counts_balance_slot_check CHECK (((balance_slot >= 1) AND (balance_slot <= 6))),
  constraint inventory_label_counts_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  constraint inventory_label_counts_label_serial_check CHECK ((label_serial ~ '^[0-9A-F]{10,20}$'::text)),
  constraint inventory_label_counts_quantity_check CHECK (((quantity >= 0) AND (quantity <= 99))),
  constraint inventory_label_counts_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])))
);
alter table public.inventory_label_counts enable row level security;

-- table: inventory_label_photos
create table if not exists public.inventory_label_photos (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  created_by uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  sha256 text,
  status text default 'uploading'::text not null,
  attempts smallint default 0 not null,
  claimed_at timestamp with time zone,
  next_attempt_at timestamp with time zone,
  finished_at timestamp with time zone,
  error_code text,
  error_detail text,
  parsed jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  claim_token uuid,
  constraint inventory_label_photos_storage_path_key UNIQUE (storage_path),
  constraint inventory_label_photos_pkey PRIMARY KEY (id),
  constraint inventory_label_photos_attempts_check CHECK (((attempts >= 0) AND (attempts <= 3))),
  constraint inventory_label_photos_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
  constraint inventory_label_photos_sha256_check CHECK (((sha256 IS NULL) OR (sha256 ~ '^[a-f0-9]{64}$'::text))),
  constraint inventory_label_photos_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760))),
  constraint inventory_label_photos_status_check CHECK ((status = ANY (ARRAY['uploading'::text, 'queued'::text, 'processing'::text, 'retry'::text, 'complete'::text, 'needs_review'::text, 'failed'::text])))
);
alter table public.inventory_label_photos enable row level security;

-- table: inventory_sheet_batches
create table if not exists public.inventory_sheet_batches (
  id uuid default gen_random_uuid() not null,
  batch_code text not null,
  created_by uuid,
  operator_label text,
  filters jsonb default '{}'::jsonb not null,
  product_count integer not null,
  page_count integer not null,
  cards_per_page integer default 20 not null,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint inventory_sheet_batches_batch_code_key UNIQUE (batch_code),
  constraint inventory_sheet_batches_pkey PRIMARY KEY (id),
  constraint inventory_sheet_batches_cards_per_page_check CHECK (((cards_per_page >= 1) AND (cards_per_page <= 50))),
  constraint inventory_sheet_batches_page_count_check CHECK ((page_count >= 0)),
  constraint inventory_sheet_batches_product_count_check CHECK ((product_count >= 0)),
  constraint inventory_sheet_batches_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text])))
);
alter table public.inventory_sheet_batches enable row level security;

-- table: inventory_sheet_item_results
create table if not exists public.inventory_sheet_item_results (
  id uuid default gen_random_uuid() not null,
  scan_id uuid not null,
  sheet_item_id uuid not null,
  ai_ean text,
  ai_quantity integer,
  ai_confidence numeric(5,4),
  ai_mark_kind text,
  ai_note text,
  review_state text default 'review'::text not null,
  confirmed_quantity integer,
  confirmed_by uuid,
  confirmed_at timestamp with time zone,
  stock_count_id uuid,
  bling_job_id uuid,
  apply_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  ai_gondola integer,
  confirmed_gondola integer,
  constraint inventory_sheet_item_results_scan_id_sheet_item_id_key UNIQUE (scan_id, sheet_item_id),
  constraint inventory_sheet_item_results_pkey PRIMARY KEY (id),
  constraint inventory_sheet_item_results_ai_gondola_check CHECK (((ai_gondola IS NULL) OR ((ai_gondola >= 1) AND (ai_gondola <= 9999)))),
  constraint inventory_sheet_item_results_ai_quantity_check CHECK (((ai_quantity IS NULL) OR (ai_quantity >= 0))),
  constraint inventory_sheet_item_results_confirmed_gondola_check CHECK (((confirmed_gondola IS NULL) OR ((confirmed_gondola >= 1) AND (confirmed_gondola <= 9999)))),
  constraint inventory_sheet_item_results_confirmed_quantity_check CHECK (((confirmed_quantity IS NULL) OR (confirmed_quantity >= 0))),
  constraint inventory_sheet_item_results_review_state_check CHECK ((review_state = ANY (ARRAY['ready'::text, 'review'::text, 'confirmed'::text, 'applied'::text, 'error'::text])))
);
alter table public.inventory_sheet_item_results enable row level security;

-- table: inventory_sheet_items
create table if not exists public.inventory_sheet_items (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  page_number integer not null,
  slot_number integer not null,
  printed_index integer not null,
  product_id uuid not null,
  product_name_snapshot text not null,
  gtin_snapshot text,
  expiration_date_snapshot date,
  image_url_snapshot text,
  created_at timestamp with time zone default now() not null,
  constraint inventory_sheet_items_batch_id_page_number_slot_number_key UNIQUE (batch_id, page_number, slot_number),
  constraint inventory_sheet_items_batch_id_printed_index_key UNIQUE (batch_id, printed_index),
  constraint inventory_sheet_items_batch_id_product_id_key UNIQUE (batch_id, product_id),
  constraint inventory_sheet_items_pkey PRIMARY KEY (id),
  constraint inventory_sheet_items_page_number_check CHECK ((page_number >= 1)),
  constraint inventory_sheet_items_printed_index_check CHECK ((printed_index >= 1)),
  constraint inventory_sheet_items_slot_number_check CHECK (((slot_number >= 1) AND (slot_number <= 50)))
);
alter table public.inventory_sheet_items enable row level security;

-- table: inventory_sheet_page_scans
create table if not exists public.inventory_sheet_page_scans (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  page_number integer not null,
  uploaded_by uuid,
  model text,
  ai_response_id text,
  page_confidence numeric(5,4),
  raw_result jsonb default '{}'::jsonb not null,
  review_result jsonb default '{}'::jsonb not null,
  status text default 'analyzed'::text not null,
  created_at timestamp with time zone default now() not null,
  applied_at timestamp with time zone,
  constraint inventory_sheet_page_scans_pkey PRIMARY KEY (id),
  constraint inventory_sheet_page_scans_page_number_check CHECK ((page_number >= 1)),
  constraint inventory_sheet_page_scans_status_check CHECK ((status = ANY (ARRAY['analyzed'::text, 'partial'::text, 'applied'::text, 'rejected'::text])))
);
alter table public.inventory_sheet_page_scans enable row level security;
comment on table public.inventory_sheet_page_scans is 'Leituras de folhas A4 de balanço. Uma mesma página física pode ter várias tentativas/leleituras; cada scan preserva seu próprio histórico.';

-- table: inventory_unknown_eans
create table if not exists public.inventory_unknown_eans (
  id uuid default gen_random_uuid() not null,
  ean text not null,
  status text default 'pending'::text not null,
  seen_count integer default 1 not null,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  first_operator_label text,
  last_operator_label text,
  source text default 'quick_balance'::text not null,
  observed_quantity numeric(14,3),
  observed_gondola_number integer,
  research jsonb default '{}'::jsonb not null,
  research_model text,
  research_response_id text,
  research_attempts integer default 0 not null,
  research_started_at timestamp with time zone,
  research_completed_at timestamp with time zone,
  research_error text,
  linked_product_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint inventory_unknown_eans_ean_key UNIQUE (ean),
  constraint inventory_unknown_eans_pkey PRIMARY KEY (id),
  constraint inventory_unknown_eans_ean_chk CHECK ((ean ~ '^[0-9]{4,30}$'::text)),
  constraint inventory_unknown_eans_gondola_chk CHECK (((observed_gondola_number IS NULL) OR ((observed_gondola_number >= 1) AND (observed_gondola_number <= 9999)))),
  constraint inventory_unknown_eans_seen_count_check CHECK ((seen_count > 0)),
  constraint inventory_unknown_eans_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'researching'::text, 'review'::text, 'not_found'::text, 'error'::text, 'registered'::text, 'ignored'::text])))
);
alter table public.inventory_unknown_eans enable row level security;

-- table: li_bridge_probe_jobs
create table if not exists public.li_bridge_probe_jobs (
  id uuid default gen_random_uuid() not null,
  proof_hash text not null,
  action text not null,
  args jsonb default '{}'::jsonb not null,
  state text default 'pending'::text not null,
  result jsonb,
  created_at timestamp with time zone default now() not null,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  constraint li_bridge_probe_jobs_pkey PRIMARY KEY (id),
  constraint li_bridge_probe_jobs_action_check CHECK ((action = ANY (ARRAY['status'::text, 'products'::text, 'categories'::text]))),
  constraint li_bridge_probe_jobs_proof_hash_check CHECK ((length(proof_hash) = 64)),
  constraint li_bridge_probe_jobs_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);
alter table public.li_bridge_probe_jobs enable row level security;
comment on table public.li_bridge_probe_jobs is 'Interno: jobs efêmeros de leitura da Loja Integrada via Supabase';

-- table: marketing_attribution_events_v1
create table if not exists public.marketing_attribution_events_v1 (
  id uuid default gen_random_uuid() not null,
  strategy_id uuid,
  campaign_id uuid,
  customer_id uuid,
  order_id uuid,
  commercial_id uuid,
  public_lot_id uuid,
  event_type text not null,
  attribution_kind text,
  amount numeric,
  token_hash text,
  idempotency_key text not null,
  occurred_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_attribution_events_v1_idempotency_key_key UNIQUE (idempotency_key),
  constraint marketing_attribution_events_v1_pkey PRIMARY KEY (id),
  constraint marketing_attribution_events_v1_amount_check CHECK (((amount IS NULL) OR (amount >= (0)::numeric))),
  constraint marketing_attribution_events_v1_attribution_kind_check CHECK (((attribution_kind IS NULL) OR (attribution_kind = ANY (ARRAY['direct'::text, 'assisted'::text])))),
  constraint marketing_attribution_events_v1_event_type_check CHECK (((length(btrim(event_type)) >= 1) AND (length(btrim(event_type)) <= 100)))
);
alter table public.marketing_attribution_events_v1 enable row level security;

-- table: marketing_campaign_brand_rules_v1
create table if not exists public.marketing_campaign_brand_rules_v1 (
  brand_key text not null,
  display_name text not null,
  is_enabled boolean default true not null,
  notes text,
  sort_order integer default 100 not null,
  updated_at timestamp with time zone default now() not null,
  constraint marketing_campaign_brand_rules_v1_pkey PRIMARY KEY (brand_key)
);
alter table public.marketing_campaign_brand_rules_v1 enable row level security;

-- table: marketing_campaign_dispatches_v1
create table if not exists public.marketing_campaign_dispatches_v1 (
  id uuid default gen_random_uuid() not null,
  snapshot_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  whatsapp_account_id uuid not null,
  phone_e164 text,
  status text default 'pending'::text not null,
  attempt_count integer default 0 not null,
  available_at timestamp with time zone default now() not null,
  claimed_at timestamp with time zone,
  provider_message_id text,
  last_error text,
  skip_reason text,
  outbox_id uuid,
  eligibility_checked_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  manual_batch_id uuid,
  constraint marketing_campaign_dispatches_v1_snapshot_id_customer_id_key UNIQUE (snapshot_id, customer_id),
  constraint marketing_campaign_dispatches_v1_pkey PRIMARY KEY (id),
  constraint marketing_campaign_dispatches_v1_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint marketing_campaign_dispatches_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'skipped'::text, 'accepted'::text, 'retry'::text, 'uncertain'::text, 'failed'::text])))
);
alter table public.marketing_campaign_dispatches_v1 enable row level security;

-- table: marketing_campaign_events_v1
create table if not exists public.marketing_campaign_events_v1 (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  event_type text not null,
  campaign_revision integer not null,
  snapshot_id uuid,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint marketing_campaign_events_v1_pkey PRIMARY KEY (id)
);
alter table public.marketing_campaign_events_v1 enable row level security;

-- table: marketing_campaign_execution_runtime_v1
create table if not exists public.marketing_campaign_execution_runtime_v1 (
  whatsapp_account_id uuid not null,
  mode text default 'off'::text not null,
  max_batch_size integer default 10 not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_campaign_execution_runtime_v1_pkey PRIMARY KEY (whatsapp_account_id),
  constraint marketing_campaign_execution_runtime_v1_max_batch_size_check CHECK (((max_batch_size >= 1) AND (max_batch_size <= 25))),
  constraint marketing_campaign_execution_runtime_v1_mode_check CHECK ((mode = ANY (ARRAY['off'::text, 'canary'::text, 'live'::text])))
);
alter table public.marketing_campaign_execution_runtime_v1 enable row level security;

-- table: marketing_campaign_manual_batches_v1
create table if not exists public.marketing_campaign_manual_batches_v1 (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  idempotency_key text not null,
  status text default 'processing'::text not null,
  requested_limit integer default 10 not null,
  claimed_count integer default 0 not null,
  worker_started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint marketing_campaign_manual_batch_campaign_id_idempotency_key_key UNIQUE (campaign_id, idempotency_key),
  constraint marketing_campaign_manual_batches_v1_pkey PRIMARY KEY (id),
  constraint marketing_campaign_manual_batches_v1_claimed_count_check CHECK (((claimed_count >= 0) AND (claimed_count <= 10))),
  constraint marketing_campaign_manual_batches_v1_requested_limit_check CHECK (((requested_limit >= 1) AND (requested_limit <= 10))),
  constraint marketing_campaign_manual_batches_v1_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'no_work'::text])))
);
alter table public.marketing_campaign_manual_batches_v1 enable row level security;

-- table: marketing_campaign_snapshot_recipients_v1
create table if not exists public.marketing_campaign_snapshot_recipients_v1 (
  id uuid default gen_random_uuid() not null,
  snapshot_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  phone_e164 text,
  whatsapp_account_id uuid not null,
  eligible_at_snapshot boolean not null,
  exclusion_reasons text[] default '{}'::text[] not null,
  phone_rank bigint not null,
  city text,
  neighborhood text,
  order_count integer default 0 not null,
  lifetime_value numeric default 0 not null,
  last_purchase_at timestamp with time zone,
  segment_evidence jsonb default '{}'::jsonb not null,
  parameter_source_metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint marketing_campaign_snapshot_recipie_snapshot_id_customer_id_key UNIQUE (snapshot_id, customer_id),
  constraint marketing_campaign_snapshot_recipients_v1_pkey PRIMARY KEY (id)
);
alter table public.marketing_campaign_snapshot_recipients_v1 enable row level security;

-- table: marketing_campaign_snapshots_v1
create table if not exists public.marketing_campaign_snapshots_v1 (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  campaign_revision integer not null,
  snapshot_version integer not null,
  whatsapp_account_id uuid not null,
  template_id uuid not null,
  template_name text not null,
  template_language text not null,
  template_category text not null,
  template_components jsonb default '[]'::jsonb not null,
  filters_snapshot jsonb default '{}'::jsonb not null,
  variable_values_snapshot jsonb default '{}'::jsonb not null,
  deep_link_snapshot jsonb default '{}'::jsonb not null,
  found_count integer default 0 not null,
  eligible_count integer default 0 not null,
  excluded_count integer default 0 not null,
  idempotency_key text,
  created_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_campaign_snapshots__campaign_id_campaign_revision_key UNIQUE (campaign_id, campaign_revision),
  constraint marketing_campaign_snapshots_v_campaign_id_snapshot_version_key UNIQUE (campaign_id, snapshot_version),
  constraint marketing_campaign_snapshots_v1_pkey PRIMARY KEY (id),
  constraint marketing_campaign_snapshots_v1_snapshot_version_check CHECK ((snapshot_version >= 1))
);
alter table public.marketing_campaign_snapshots_v1 enable row level security;

-- table: marketing_campaign_worker_secret_v1
create table if not exists public.marketing_campaign_worker_secret_v1 (
  singleton boolean default true not null,
  secret text not null,
  created_at timestamp with time zone default now() not null,
  rotated_at timestamp with time zone,
  constraint marketing_campaign_worker_secret_v1_pkey PRIMARY KEY (singleton),
  constraint marketing_campaign_worker_secret_v1_secret_check CHECK ((length(secret) >= 48)),
  constraint marketing_campaign_worker_secret_v1_singleton_check CHECK ((singleton IS TRUE))
);
alter table public.marketing_campaign_worker_secret_v1 enable row level security;

-- table: marketing_campaigns_v1
create table if not exists public.marketing_campaigns_v1 (
  id uuid default gen_random_uuid() not null,
  name text not null,
  whatsapp_account_id uuid not null,
  template_id uuid not null,
  status text default 'draft'::text not null,
  revision integer default 1 not null,
  filters jsonb default '{}'::jsonb not null,
  variable_values jsonb default '{}'::jsonb not null,
  deep_link jsonb default '{}'::jsonb not null,
  notes text,
  idempotency_key text,
  template_name_snapshot text,
  template_language_snapshot text,
  template_category_snapshot text,
  template_components_snapshot jsonb,
  ready_for_review_at timestamp with time zone,
  approved_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  scheduled_for timestamp with time zone,
  started_at timestamp with time zone,
  paused_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  execution_last_error text,
  strategy_id uuid,
  manual_batch_mode boolean default false not null,
  constraint marketing_campaigns_v1_pkey PRIMARY KEY (id),
  constraint marketing_campaigns_v1_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160))),
  constraint marketing_campaigns_v1_revision_check CHECK ((revision >= 1)),
  constraint marketing_campaigns_v1_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready_for_review'::text, 'approved'::text, 'scheduled'::text, 'running'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);
alter table public.marketing_campaigns_v1 enable row level security;

-- table: marketing_consent_events_v1
create table if not exists public.marketing_consent_events_v1 (
  id uuid default gen_random_uuid() not null,
  customer_id uuid,
  phone_e164 text,
  decision text not null,
  source text not null,
  source_ref text,
  source_event_key text,
  consent_text_version text,
  consent_text_snapshot text,
  occurred_at timestamp with time zone default now() not null,
  recorded_by text default 'system'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint marketing_consent_events_v1_source_event_key_key UNIQUE (source_event_key),
  constraint marketing_consent_events_v1_pkey PRIMARY KEY (id),
  constraint marketing_consent_events_v1_decision_check CHECK ((decision = ANY (ARRAY['opt_in'::text, 'opt_out'::text])))
);
alter table public.marketing_consent_events_v1 enable row level security;

-- table: marketing_optout_events_v1
create table if not exists public.marketing_optout_events_v1 (
  capture_id uuid not null,
  customer_id uuid,
  phone_e164 text,
  source text default 'papoai_inbound'::text not null,
  reason_code text default 'customer_optout'::text not null,
  occurred_at timestamp with time zone default now() not null,
  constraint marketing_optout_events_v1_pkey PRIMARY KEY (capture_id)
);
alter table public.marketing_optout_events_v1 enable row level security;

-- table: marketing_optout_events_v2
create table if not exists public.marketing_optout_events_v2 (
  id uuid default gen_random_uuid() not null,
  customer_id uuid,
  phone_e164 text,
  whatsapp_message_id uuid,
  provider text not null,
  source_event_key text not null,
  reason_code text default 'customer_optout'::text not null,
  occurred_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_optout_events_v2_source_uidx UNIQUE (provider, source_event_key),
  constraint marketing_optout_events_v2_pkey PRIMARY KEY (id),
  constraint marketing_optout_events_v2_provider_check CHECK ((provider = ANY (ARRAY['papoai'::text, 'meta'::text])))
);
alter table public.marketing_optout_events_v2 enable row level security;

-- table: marketing_repurchase_state_v1
create table if not exists public.marketing_repurchase_state_v1 (
  customer_id uuid not null,
  last_purchase_order_id uuid,
  last_purchase_order_number text,
  last_purchase_at timestamp with time zone,
  due_at timestamp with time zone,
  status text default 'no_purchase'::text not null,
  marketing_opt_in boolean default false not null,
  phone_e164 text,
  send_channel_e164 text default '+5565998150975'::text not null,
  template_name text default 'recompradonaantonia10dias'::text not null,
  last_sent_at timestamp with time zone,
  last_sent_order_id uuid,
  blocked_reason text,
  metadata jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint marketing_repurchase_state_v1_pkey PRIMARY KEY (customer_id),
  constraint marketing_repurchase_state_v1_status_check CHECK ((status = ANY (ARRAY['no_purchase'::text, 'not_eligible'::text, 'blocked_opt_out'::text, 'scheduled'::text, 'ready'::text, 'sent'::text])))
);
alter table public.marketing_repurchase_state_v1 enable row level security;

-- table: marketing_seasonality_rules_v1
create table if not exists public.marketing_seasonality_rules_v1 (
  id uuid default gen_random_uuid() not null,
  rule_key text not null,
  version integer default 1 not null,
  name text not null,
  starts_on date,
  ends_on date,
  month_numbers smallint[] default '{}'::smallint[] not null,
  day_of_month_start smallint,
  day_of_month_end smallint,
  priority integer default 0 not null,
  score_effect numeric default 0 not null,
  operational_closed boolean default false not null,
  is_active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_seasonality_rules_v1_rule_key_version_key UNIQUE (rule_key, version),
  constraint marketing_seasonality_rules_v1_pkey PRIMARY KEY (id),
  constraint marketing_seasonality_rules_v1_check CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (starts_on <= ends_on))),
  constraint marketing_seasonality_rules_v1_day_of_month_end_check CHECK (((day_of_month_end >= 1) AND (day_of_month_end <= 31))),
  constraint marketing_seasonality_rules_v1_day_of_month_start_check CHECK (((day_of_month_start >= 1) AND (day_of_month_start <= 31))),
  constraint marketing_seasonality_rules_v1_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160))),
  constraint marketing_seasonality_rules_v1_score_effect_check CHECK (((score_effect >= ('-100'::integer)::numeric) AND (score_effect <= (100)::numeric))),
  constraint marketing_seasonality_rules_v1_version_check CHECK ((version >= 1))
);
alter table public.marketing_seasonality_rules_v1 enable row level security;

-- table: marketing_strategy_events_v1
create table if not exists public.marketing_strategy_events_v1 (
  id uuid default gen_random_uuid() not null,
  strategy_id uuid not null,
  event_type text not null,
  strategy_revision integer not null,
  from_status text,
  to_status text,
  actor_user_id uuid,
  reason text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint marketing_strategy_events_v1_pkey PRIMARY KEY (id),
  constraint marketing_strategy_events_v1_event_type_check CHECK (((length(btrim(event_type)) >= 1) AND (length(btrim(event_type)) <= 100))),
  constraint marketing_strategy_events_v1_strategy_revision_check CHECK ((strategy_revision >= 1))
);
alter table public.marketing_strategy_events_v1 enable row level security;

-- table: marketing_strategy_offers_v1
create table if not exists public.marketing_strategy_offers_v1 (
  id uuid default gen_random_uuid() not null,
  strategy_id uuid not null,
  "position" integer not null,
  source_kind text not null,
  commercial_id uuid not null,
  public_lot_id uuid,
  public_name text not null,
  image_url text,
  category_id uuid,
  category_name text,
  sale_price_snapshot numeric not null,
  public_available_snapshot integer not null,
  availability_reason_snapshot text not null,
  score numeric default 0 not null,
  score_breakdown jsonb default '{}'::jsonb not null,
  reasons jsonb default '[]'::jsonb not null,
  evidence jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint marketing_strategy_offers_v1_strategy_id_position_key UNIQUE (strategy_id, "position"),
  constraint marketing_strategy_offers_v1_pkey PRIMARY KEY (id),
  constraint marketing_strategy_offers_v1_position_check CHECK ((("position" >= 1) AND ("position" <= 10))),
  constraint marketing_strategy_offers_v1_public_available_snapshot_check CHECK ((public_available_snapshot >= 0)),
  constraint marketing_strategy_offers_v1_sale_price_snapshot_check CHECK ((sale_price_snapshot >= (0)::numeric)),
  constraint marketing_strategy_offers_v1_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric))),
  constraint marketing_strategy_offers_v1_source_kind_check CHECK ((source_kind = ANY (ARRAY['basket'::text, 'kit'::text])))
);
alter table public.marketing_strategy_offers_v1 enable row level security;

-- table: marketing_strategy_runs_v1
create table if not exists public.marketing_strategy_runs_v1 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid not null,
  period_start date not null,
  period_end date not null,
  status text default 'draft'::text not null,
  objective text default 'weekly_basket_kit'::text not null,
  audience_snapshot jsonb default '{}'::jsonb not null,
  offer_format text default 'single'::text not null,
  copy_snapshot jsonb default '{}'::jsonb not null,
  schedule_suggestion timestamp with time zone,
  score numeric default 0 not null,
  score_breakdown jsonb default '{}'::jsonb not null,
  weight_set_id uuid,
  weight_version_snapshot text,
  weight_snapshot jsonb default '{}'::jsonb not null,
  evidence jsonb default '{}'::jsonb not null,
  content_fingerprint text,
  revision integer default 1 not null,
  template_id uuid,
  campaign_id uuid,
  internal_approved_at timestamp with time zone,
  internal_approved_by uuid,
  meta_submitted_at timestamp with time zone,
  meta_approved_at timestamp with time zone,
  meta_rejected_at timestamp with time zone,
  send_approved_at timestamp with time zone,
  send_approved_by uuid,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_strategy_runs_v1_pkey PRIMARY KEY (id),
  constraint marketing_strategy_runs_v1_check CHECK ((period_start <= period_end)),
  constraint marketing_strategy_runs_v1_objective_check CHECK (((length(btrim(objective)) >= 1) AND (length(btrim(objective)) <= 120))),
  constraint marketing_strategy_runs_v1_offer_format_check CHECK ((offer_format = ANY (ARRAY['single'::text, 'carousel'::text]))),
  constraint marketing_strategy_runs_v1_revision_check CHECK ((revision >= 1)),
  constraint marketing_strategy_runs_v1_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric))),
  constraint marketing_strategy_runs_v1_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'awaiting_internal_approval'::text, 'approved_internal'::text, 'awaiting_meta'::text, 'meta_approved'::text, 'meta_rejected'::text, 'ready_to_send'::text, 'send_approved'::text, 'scheduled'::text, 'running'::text, 'completed'::text, 'discarded'::text, 'blocked'::text])))
);
alter table public.marketing_strategy_runs_v1 enable row level security;

-- table: marketing_strategy_weight_sets_v1
create table if not exists public.marketing_strategy_weight_sets_v1 (
  id uuid default gen_random_uuid() not null,
  version text not null,
  weights jsonb not null,
  is_active boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_strategy_weight_sets_v1_version_key UNIQUE (version),
  constraint marketing_strategy_weight_sets_v1_pkey PRIMARY KEY (id),
  constraint marketing_strategy_weight_sets_v1_version_check CHECK (((length(btrim(version)) >= 1) AND (length(btrim(version)) <= 80))),
  constraint marketing_strategy_weight_sets_v1_weights_check CHECK ((jsonb_typeof(weights) = 'object'::text))
);
alter table public.marketing_strategy_weight_sets_v1 enable row level security;

-- table: marketing_template_lifecycle_v1
create table if not exists public.marketing_template_lifecycle_v1 (
  id uuid default gen_random_uuid() not null,
  template_id uuid not null,
  protected boolean default false not null,
  lifecycle_status text default 'active'::text not null,
  last_used_at timestamp with time zone,
  retired_at timestamp with time zone,
  candidate_after timestamp with time zone,
  delete_requested_at timestamp with time zone,
  delete_requested_by uuid,
  delete_approved_at timestamp with time zone,
  delete_approved_by uuid,
  meta_deleted_at timestamp with time zone,
  reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_template_lifecycle_v1_template_id_key UNIQUE (template_id),
  constraint marketing_template_lifecycle_v1_pkey PRIMARY KEY (id),
  constraint marketing_template_lifecycle_v1_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['active'::text, 'in_use'::text, 'retired'::text, 'deletion_candidate'::text, 'delete_approved'::text, 'deleted_meta'::text])))
);
alter table public.marketing_template_lifecycle_v1 enable row level security;

-- table: marketing_tracking_links_v1
create table if not exists public.marketing_tracking_links_v1 (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  dispatch_id uuid not null,
  strategy_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  offer_position integer not null,
  commercial_id uuid,
  public_lot_id uuid,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  first_opened_at timestamp with time zone,
  last_opened_at timestamp with time zone,
  open_count integer default 0 not null,
  checkout_started_at timestamp with time zone,
  attributed_order_id uuid,
  attribution_kind text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint marketing_tracking_links_v1_dispatch_id_offer_position_key UNIQUE (dispatch_id, offer_position),
  constraint marketing_tracking_links_v1_token_hash_key UNIQUE (token_hash),
  constraint marketing_tracking_links_v1_pkey PRIMARY KEY (id),
  constraint marketing_tracking_links_v1_attribution_kind_check CHECK (((attribution_kind IS NULL) OR (attribution_kind = ANY (ARRAY['direct'::text, 'assisted'::text])))),
  constraint marketing_tracking_links_v1_offer_position_check CHECK (((offer_position >= 1) AND (offer_position <= 10))),
  constraint marketing_tracking_links_v1_open_count_check CHECK ((open_count >= 0))
);
alter table public.marketing_tracking_links_v1 enable row level security;

-- table: marketing_weekly_consent_requests_v1
create table if not exists public.marketing_weekly_consent_requests_v1 (
  id uuid default gen_random_uuid() not null,
  customer_id uuid not null,
  conversation_id uuid not null,
  phone_e164 text not null,
  consent_scope text default 'weekly_offers_coupons'::text not null,
  consent_text_version text default 'weekly_offers_coupons_v1'::text not null,
  consent_text_snapshot text not null,
  frequency_label text default 'max_once_per_week'::text not null,
  status text default 'prepared'::text not null,
  attempt_count integer default 1 not null,
  outbox_id uuid,
  provider_message_id text,
  asked_at timestamp with time zone,
  decision text,
  responded_at timestamp with time zone,
  response_message_id uuid,
  consent_event_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint marketing_weekly_consent_requests_customer_id_consent_scope_key UNIQUE (customer_id, consent_scope),
  constraint marketing_weekly_consent_requests_v1_pkey PRIMARY KEY (id),
  constraint marketing_weekly_consent_requests_v1_attempt_count_check CHECK ((attempt_count >= 1)),
  constraint marketing_weekly_consent_requests_v1_consent_scope_check CHECK ((consent_scope = 'weekly_offers_coupons'::text)),
  constraint marketing_weekly_consent_requests_v1_decision_check CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['opt_in'::text, 'opt_out'::text])))),
  constraint marketing_weekly_consent_requests_v1_status_check CHECK ((status = ANY (ARRAY['prepared'::text, 'sent'::text, 'send_failed'::text])))
);
alter table public.marketing_weekly_consent_requests_v1 enable row level security;

-- table: ops2_bling_orphan_product_reviews
create table if not exists public.ops2_bling_orphan_product_reviews (
  bling_product_id bigint not null,
  remote_name text,
  remote_sku text,
  remote_gtin text,
  remote_price numeric(18,2),
  remote_status text,
  linked_local_product_id uuid,
  classification text default 'unclassified'::text not null,
  safe_action text default 'review_only'::text not null,
  details jsonb default '{}'::jsonb not null,
  observed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_bling_orphan_product_reviews_pkey PRIMARY KEY (bling_product_id),
  constraint ops2_bling_orphan_product_reviews_classification_check CHECK ((classification = ANY (ARRAY['unclassified'::text, 'linked_inactive'::text, 'bling_only'::text, 'duplicate_remote'::text, 'historical_orphan'::text]))),
  constraint ops2_bling_orphan_product_reviews_safe_action_check CHECK ((safe_action = ANY (ARRAY['review_only'::text, 'candidate_inactivate'::text, 'keep'::text])))
);
alter table public.ops2_bling_orphan_product_reviews enable row level security;

-- table: ops2_catalog_baseline_items
create table if not exists public.ops2_catalog_baseline_items (
  run_id uuid not null,
  product_id uuid not null,
  bling_product_id bigint,
  sku text,
  gtin text,
  is_active boolean not null,
  sale_price numeric not null,
  stock numeric not null,
  bling_physical_before numeric,
  bling_virtual_before numeric,
  bling_observed_at timestamp with time zone,
  identity_state text not null,
  created_at timestamp with time zone default now() not null,
  constraint ops2_catalog_baseline_items_pkey PRIMARY KEY (run_id, product_id)
);
alter table public.ops2_catalog_baseline_items enable row level security;

-- table: ops2_catalog_baseline_runs
create table if not exists public.ops2_catalog_baseline_runs (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  status text default 'captured'::text not null,
  source_authority text default 'supabase_transition_baseline'::text not null,
  product_count integer default 0 not null,
  notes text,
  constraint ops2_catalog_baseline_runs_pkey PRIMARY KEY (id),
  constraint ops2_catalog_baseline_runs_status_check CHECK ((status = ANY (ARRAY['captured'::text, 'planned'::text, 'canary'::text, 'applied'::text, 'verified'::text, 'rolled_back'::text, 'failed'::text])))
);
alter table public.ops2_catalog_baseline_runs enable row level security;

-- table: ops2_catalog_product_parity_reviews
create table if not exists public.ops2_catalog_product_parity_reviews (
  product_id uuid not null,
  bling_product_id bigint,
  local_active boolean not null,
  local_name text,
  local_sku text,
  local_gtin text,
  local_price numeric(18,2),
  remote_found boolean default false not null,
  remote_name text,
  remote_sku text,
  remote_gtin text,
  remote_price numeric(18,2),
  remote_status text,
  name_match boolean,
  sku_match boolean,
  gtin_match boolean,
  price_match boolean,
  status_match boolean,
  review_status text default 'pending'::text not null,
  details jsonb default '{}'::jsonb not null,
  observed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_catalog_product_parity_reviews_pkey PRIMARY KEY (product_id),
  constraint ops2_catalog_product_parity_reviews_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'matched'::text, 'price_mismatch'::text, 'identity_mismatch'::text, 'status_mismatch'::text, 'multiple_mismatch'::text, 'remote_missing'::text, 'readonly_failed'::text])))
);
alter table public.ops2_catalog_product_parity_reviews enable row level security;

-- table: ops2_catalog_stock_highrisk_reviews
create table if not exists public.ops2_catalog_stock_highrisk_reviews (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  product_id uuid not null,
  bling_product_id bigint,
  desired_stock numeric(18,3) not null,
  planned_bling_stock numeric(18,3),
  observed_bling_stock numeric(18,3),
  abs_delta numeric(18,3),
  risk_bucket text not null,
  status text not null,
  observed_at timestamp with time zone,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_catalog_stock_highrisk_reviews_run_id_product_id_key UNIQUE (run_id, product_id),
  constraint ops2_catalog_stock_highrisk_reviews_pkey PRIMARY KEY (id),
  constraint ops2_catalog_stock_highrisk_reviews_risk_bucket_check CHECK ((risk_bucket = ANY (ARRAY['elevated_21_50'::text, 'high_51_100'::text, 'critical_over_100'::text]))),
  constraint ops2_catalog_stock_highrisk_reviews_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'target_drift'::text, 'binding_drift'::text, 'readonly_failed'::text, 'confirmed_readonly'::text, 'snapshot_rebased'::text])))
);
alter table public.ops2_catalog_stock_highrisk_reviews enable row level security;

-- table: ops2_catalog_sync_canaries
create table if not exists public.ops2_catalog_sync_canaries (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  created_at timestamp with time zone default now() not null,
  status text default 'prepared'::text not null,
  max_items integer not null,
  item_count integer default 0 not null,
  external_write_enabled boolean default false not null,
  notes text,
  risk_band integer,
  constraint ops2_catalog_sync_canaries_pkey PRIMARY KEY (id),
  constraint ops2_catalog_sync_canaries_max_items_check CHECK (((max_items >= 1) AND (max_items <= 20))),
  constraint ops2_catalog_sync_canaries_status_check CHECK ((status = ANY (ARRAY['prepared'::text, 'armed'::text, 'queued'::text, 'sent'::text, 'verified'::text, 'divergent'::text, 'failed'::text, 'rolled_back'::text])))
);
alter table public.ops2_catalog_sync_canaries enable row level security;

-- table: ops2_catalog_sync_canary_items
create table if not exists public.ops2_catalog_sync_canary_items (
  canary_id uuid not null,
  run_id uuid not null,
  product_id uuid not null,
  bling_product_id bigint not null,
  desired_stock numeric not null,
  bling_physical_before numeric,
  delta numeric not null,
  state text default 'prepared'::text not null,
  job_id uuid,
  verified_bling_physical numeric,
  verified_at timestamp with time zone,
  error text,
  constraint ops2_catalog_sync_canary_items_pkey PRIMARY KEY (canary_id, product_id),
  constraint ops2_catalog_sync_canary_items_state_check CHECK ((state = ANY (ARRAY['prepared'::text, 'queued'::text, 'sent'::text, 'confirmed'::text, 'divergent'::text, 'failed'::text, 'rolled_back'::text])))
);
alter table public.ops2_catalog_sync_canary_items enable row level security;

-- table: ops2_catalog_sync_plan_items
create table if not exists public.ops2_catalog_sync_plan_items (
  run_id uuid not null,
  product_id uuid not null,
  bling_product_id bigint not null,
  operation text not null,
  desired_stock numeric,
  current_bling_physical numeric,
  desired_sale_price numeric,
  state text default 'planned'::text not null,
  reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_catalog_sync_plan_items_pkey PRIMARY KEY (run_id, product_id),
  constraint ops2_catalog_sync_plan_items_operation_check CHECK ((operation = ANY (ARRAY['noop'::text, 'stock_update'::text, 'price_review'::text, 'identity_review'::text]))),
  constraint ops2_catalog_sync_plan_items_state_check CHECK ((state = ANY (ARRAY['planned'::text, 'blocked'::text, 'canary'::text, 'sent'::text, 'confirmed'::text, 'divergent'::text, 'failed'::text, 'rolled_back'::text])))
);
alter table public.ops2_catalog_sync_plan_items enable row level security;

-- table: ops2_customer_registration_journeys_v1
create table if not exists public.ops2_customer_registration_journeys_v1 (
  order_id uuid not null,
  customer_id uuid,
  registration_state text not null,
  missing_fields text[] default '{}'::text[] not null,
  workflow_open boolean default false not null,
  transition_seq integer default 1 not null,
  first_evaluated_at timestamp with time zone default now() not null,
  first_pending_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_transition_at timestamp with time zone default now() not null,
  last_evaluated_at timestamp with time zone default now() not null,
  order_status_snapshot text,
  metadata jsonb default '{}'::jsonb not null,
  constraint ops2_customer_registration_journeys_v1_pkey PRIMARY KEY (order_id),
  constraint ops2_customer_registration_journeys_v1_registration_state_check CHECK ((registration_state = ANY (ARRAY['pending'::text, 'complete'::text]))),
  constraint ops2_customer_registration_journeys_v1_transition_seq_check CHECK ((transition_seq > 0))
);
alter table public.ops2_customer_registration_journeys_v1 enable row level security;

-- table: ops2_meta_whatsapp_flow_bindings_v1
create table if not exists public.ops2_meta_whatsapp_flow_bindings_v1 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid not null,
  purpose text not null,
  meta_flow_id text not null,
  flow_message_version text default '3'::text not null,
  flow_cta text default 'Preencher cadastro'::text not null,
  flow_action text default 'data_exchange'::text not null,
  flow_mode text default 'published'::text not null,
  body_text text default 'Para concluir seu cadastro, toque no botão abaixo.'::text not null,
  is_verified boolean default false not null,
  is_send_enabled boolean default false not null,
  source text default 'manual_verification_required'::text not null,
  verified_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_meta_whatsapp_flow_binding_whatsapp_account_id_purpose_key UNIQUE (whatsapp_account_id, purpose),
  constraint ops2_meta_whatsapp_flow_bindings_v1_pkey PRIMARY KEY (id),
  constraint ops2_meta_whatsapp_flow_bindings_flow_id_check CHECK ((meta_flow_id ~ '^[0-9]{6,32}$'::text)),
  constraint ops2_meta_whatsapp_flow_bindings_v1_flow_action_check CHECK ((flow_action = ANY (ARRAY['data_exchange'::text, 'navigate'::text]))),
  constraint ops2_meta_whatsapp_flow_bindings_v1_flow_mode_check CHECK ((flow_mode = ANY (ARRAY['draft'::text, 'published'::text]))),
  constraint ops2_meta_whatsapp_flow_bindings_v1_purpose_check CHECK ((purpose = 'registration_flow'::text))
);
alter table public.ops2_meta_whatsapp_flow_bindings_v1 enable row level security;

-- table: ops2_meta_whatsapp_senders_v1
create table if not exists public.ops2_meta_whatsapp_senders_v1 (
  whatsapp_account_id uuid not null,
  meta_phone_number_id text not null,
  source text not null,
  is_verified boolean default false not null,
  is_send_enabled boolean default false not null,
  evidence_at timestamp with time zone,
  verified_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_meta_whatsapp_senders_v1_pkey PRIMARY KEY (whatsapp_account_id),
  constraint ops2_meta_whatsapp_senders_phone_number_id_check CHECK ((meta_phone_number_id ~ '^[0-9]{6,32}$'::text))
);
alter table public.ops2_meta_whatsapp_senders_v1 enable row level security;

-- table: ops2_order_registration_links_v1
create table if not exists public.ops2_order_registration_links_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  phone_e164 text not null,
  token_hash text not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  consumed_customer_id uuid,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_order_registration_links_v1_token_hash_key UNIQUE (token_hash),
  constraint ops2_order_registration_links_v1_pkey PRIMARY KEY (id)
);
alter table public.ops2_order_registration_links_v1 enable row level security;

-- table: ops2_papoai_bridge_runtime_v1
create table if not exists public.ops2_papoai_bridge_runtime_v1 (
  id smallint default 1 not null,
  structured_draft_enabled boolean default true not null,
  structured_order_commit_enabled boolean default false not null,
  identity_link_enabled boolean default true not null,
  identity_link_ttl_minutes integer default 120 not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint ops2_papoai_bridge_runtime_v1_pkey PRIMARY KEY (id),
  constraint ops2_papoai_bridge_runtime_v1_id_check CHECK ((id = 1)),
  constraint ops2_papoai_bridge_runtime_v1_identity_link_ttl_minutes_check CHECK (((identity_link_ttl_minutes >= 5) AND (identity_link_ttl_minutes <= 1440)))
);
alter table public.ops2_papoai_bridge_runtime_v1 enable row level security;

-- table: ops2_papoai_channel_bindings_v1
create table if not exists public.ops2_papoai_channel_bindings_v1 (
  whatsapp_account_id uuid not null,
  papoai_agentbot_id text not null,
  expected_phone_e164 text not null,
  source text default 'observed'::text not null,
  is_active boolean default true not null,
  observed_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint ops2_papoai_channel_bindings_v1_papoai_agentbot_id_key UNIQUE (papoai_agentbot_id),
  constraint ops2_papoai_channel_bindings_v1_pkey PRIMARY KEY (whatsapp_account_id)
);
alter table public.ops2_papoai_channel_bindings_v1 enable row level security;

-- table: ops2_papoai_homologation_targets_v1
create table if not exists public.ops2_papoai_homologation_targets_v1 (
  target_phone_e164 text not null,
  label text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint ops2_papoai_homologation_targets_v1_pkey PRIMARY KEY (target_phone_e164),
  constraint ops2_papoai_homologation_target_phone_check CHECK ((target_phone_e164 ~ '^\\+55[0-9]{10,11}$'::text))
);
alter table public.ops2_papoai_homologation_targets_v1 enable row level security;

-- table: ops2_papoai_order_signal_outbox_v1
create table if not exists public.ops2_papoai_order_signal_outbox_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  phone_e164 text not null,
  channel_origin text not null,
  signal_key text not null,
  status text default 'pending'::text not null,
  attempt_count integer default 0 not null,
  available_at timestamp with time zone default now() not null,
  locked_at timestamp with time zone,
  sent_at timestamp with time zone,
  external_ref text,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_papoai_order_signal_outb_order_id_channel_origin_signa_key UNIQUE (order_id, channel_origin, signal_key),
  constraint ops2_papoai_order_signal_outbox_v1_pkey PRIMARY KEY (id),
  constraint ops2_papoai_order_signal_outbox_v1_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint ops2_papoai_order_signal_outbox_v1_channel_origin_check CHECK ((channel_origin = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint ops2_papoai_order_signal_outbox_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'retry'::text, 'failed'::text, 'suppressed'::text])))
);
alter table public.ops2_papoai_order_signal_outbox_v1 enable row level security;

-- table: ops2_papoai_order_signal_runtime_v1
create table if not exists public.ops2_papoai_order_signal_runtime_v1 (
  id integer not null,
  mode text default 'off'::text not null,
  canary_order_id uuid,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_papoai_order_signal_runtime_v1_pkey PRIMARY KEY (id),
  constraint ops2_papoai_order_signal_runtime_v1_id_check CHECK ((id = 1)),
  constraint ops2_papoai_order_signal_runtime_v1_mode_check CHECK ((mode = ANY (ARRAY['off'::text, 'canary'::text, 'live'::text])))
);
alter table public.ops2_papoai_order_signal_runtime_v1 enable row level security;

-- table: ops2_papoai_outbound_intents_v1
create table if not exists public.ops2_papoai_outbound_intents_v1 (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  purpose text not null,
  order_id uuid not null,
  customer_id uuid,
  conversation_id uuid,
  whatsapp_account_id uuid,
  channel_phone_e164 text,
  papoai_session_uid text,
  papoai_contact_id text,
  papoai_agentbot_id text,
  transition_seq integer not null,
  status text not null,
  reason text,
  idempotency_key text not null,
  payload jsonb default '{}'::jsonb not null,
  cancelled_at timestamp with time zone,
  sent_at timestamp with time zone,
  last_error text,
  constraint ops2_papoai_outbound_intents_v1_pkey PRIMARY KEY (id),
  constraint ops2_papoai_outbound_intents_v1_purpose_check CHECK ((purpose = 'registration_flow'::text)),
  constraint ops2_papoai_outbound_intents_v1_status_check CHECK ((status = ANY (ARRAY['waiting_route'::text, 'blocked_transport'::text, 'cancelled'::text, 'sent'::text, 'failed'::text]))),
  constraint ops2_papoai_outbound_intents_v1_transition_seq_check CHECK ((transition_seq > 0))
);
alter table public.ops2_papoai_outbound_intents_v1 enable row level security;

-- table: ops2_papoai_outbound_runtime_v1
create table if not exists public.ops2_papoai_outbound_runtime_v1 (
  id smallint default 1 not null,
  dispatch_enabled boolean default false not null,
  transport_verified boolean default false not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  dispatch_mode text default 'disabled'::text not null,
  constraint ops2_papoai_outbound_runtime_v1_pkey PRIMARY KEY (id),
  constraint ops2_papoai_outbound_runtime_dispatch_mode_check CHECK ((dispatch_mode = ANY (ARRAY['disabled'::text, 'homologation'::text, 'production'::text]))),
  constraint ops2_papoai_outbound_runtime_v1_id_check CHECK ((id = 1))
);
alter table public.ops2_papoai_outbound_runtime_v1 enable row level security;

-- table: ops2_stock_cutover_runs
create table if not exists public.ops2_stock_cutover_runs (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  status text default 'prepared'::text not null,
  preflight jsonb default '{}'::jsonb not null,
  activated_at timestamp with time zone,
  checked_at timestamp with time zone,
  rolled_back_at timestamp with time zone,
  activation_snapshot jsonb,
  check_result jsonb,
  rollback_reason text,
  constraint ops2_stock_cutover_runs_pkey PRIMARY KEY (id),
  constraint ops2_stock_cutover_runs_status_check CHECK ((status = ANY (ARRAY['prepared'::text, 'active'::text, 'passed'::text, 'rolled_back'::text, 'failed'::text])))
);
alter table public.ops2_stock_cutover_runs enable row level security;

-- table: ops2_whatsapp_order_runtime_v1
create table if not exists public.ops2_whatsapp_order_runtime_v1 (
  id smallint not null,
  mode text default 'off'::text not null,
  canary_order_id uuid,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_whatsapp_order_runtime_v1_pkey PRIMARY KEY (id),
  constraint ops2_whatsapp_order_runtime_v1_check CHECK (((mode <> 'canary'::text) OR (canary_order_id IS NOT NULL))),
  constraint ops2_whatsapp_order_runtime_v1_id_check CHECK ((id = 1)),
  constraint ops2_whatsapp_order_runtime_v1_mode_check CHECK ((mode = ANY (ARRAY['off'::text, 'canary'::text, 'live'::text])))
);
alter table public.ops2_whatsapp_order_runtime_v1 enable row level security;

-- table: ops2_whatsapp_outbox_v1
create table if not exists public.ops2_whatsapp_outbox_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  customer_id uuid,
  conversation_id uuid,
  whatsapp_account_id uuid,
  recipient_kind text not null,
  phone_e164 text not null,
  channel_origin text not null,
  channel_phone_e164 text not null,
  delivery_mode text default 'utility_template'::text not null,
  message_kind text default 'order_received'::text not null,
  payload jsonb default '{}'::jsonb not null,
  status text default 'pending'::text not null,
  attempt_count integer default 0 not null,
  external_message_id text,
  last_error text,
  available_at timestamp with time zone default now() not null,
  locked_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops2_whatsapp_outbox_v1_order_id_message_kind_recipient_kin_key UNIQUE (order_id, message_kind, recipient_kind),
  constraint ops2_whatsapp_outbox_v1_pkey PRIMARY KEY (id),
  constraint ops2_whatsapp_outbox_v1_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint ops2_whatsapp_outbox_v1_channel_origin_check CHECK ((channel_origin = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint ops2_whatsapp_outbox_v1_delivery_mode_check CHECK ((delivery_mode = 'utility_template'::text)),
  constraint ops2_whatsapp_outbox_v1_recipient_kind_check CHECK ((recipient_kind = ANY (ARRAY['customer'::text, 'ops_0975'::text]))),
  constraint ops2_whatsapp_outbox_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'accepted'::text, 'sent'::text, 'retry'::text, 'failed'::text, 'suppressed'::text])))
);
alter table public.ops2_whatsapp_outbox_v1 enable row level security;

-- table: ops_approvals
create table if not exists public.ops_approvals (
  id uuid default gen_random_uuid() not null,
  requested_at timestamp with time zone default now() not null,
  decided_at timestamp with time zone,
  executed_at timestamp with time zone,
  expires_at timestamp with time zone,
  status text default 'pending'::text not null,
  risk text default 'medium'::text not null,
  action_type text not null,
  entity_type text,
  entity_id text,
  correlation_id text,
  requested_by_type text default 'automation'::text not null,
  requested_by_id text,
  requested_by_label text,
  decided_by_id text,
  decided_by_label text,
  summary text not null,
  proposed_action jsonb default '{}'::jsonb not null,
  evidence jsonb default '{}'::jsonb not null,
  decision_note text,
  execution_ref text,
  idempotency_key text,
  constraint ops_approvals_pkey PRIMARY KEY (id),
  constraint ops_approvals_requested_by_type_check CHECK ((requested_by_type = ANY (ARRAY['human'::text, 'automation'::text, 'ai'::text, 'system'::text]))),
  constraint ops_approvals_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
  constraint ops_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'executed'::text, 'failed'::text, 'cancelled'::text])))
);
alter table public.ops_approvals enable row level security;
comment on table public.ops_approvals is 'Operations 2.0 explicit approval queue for sensitive actions.';

-- table: ops_attention
create table if not exists public.ops_attention (
  id uuid default gen_random_uuid() not null,
  opened_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone,
  type text not null,
  entity_type text,
  entity_id text,
  correlation_id text,
  priority text default 'normal'::text not null,
  owner_role text default 'supervisor'::text not null,
  status text default 'open'::text not null,
  summary text not null,
  recommended_action text,
  evidence jsonb default '{}'::jsonb not null,
  source_system text default 'dona_antonia'::text not null,
  resolution text,
  resolution_ref text,
  idempotency_key text,
  due_at timestamp with time zone,
  constraint ops_attention_pkey PRIMARY KEY (id),
  constraint ops_attention_owner_role_check CHECK ((owner_role = ANY (ARRAY['owner'::text, 'supervisor'::text, 'operator'::text, 'driver'::text, 'automation'::text]))),
  constraint ops_attention_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))),
  constraint ops_attention_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text])))
);
alter table public.ops_attention enable row level security;
comment on table public.ops_attention is 'Operations 2.0 current human-attention queue for Control Tower.';

-- table: ops_delivery_runs
create table if not exists public.ops_delivery_runs (
  id uuid default gen_random_uuid() not null,
  service_date date default ((now() AT TIME ZONE 'America/Cuiaba'::text))::date not null,
  vehicle_key text not null,
  status text default 'planned'::text not null,
  operator_label text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  dispatched_at timestamp with time zone,
  completed_at timestamp with time zone,
  region_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  optimizer_provider text,
  optimizer_job_ref text,
  optimizer_payload jsonb,
  loading_started_at timestamp with time zone,
  loaded_at timestamp with time zone,
  constraint ops_delivery_runs_pkey PRIMARY KEY (id),
  constraint ops_delivery_runs_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'dispatched'::text, 'completed'::text, 'cancelled'::text]))),
  constraint ops_delivery_runs_vehicle_key_check CHECK (((vehicle_key = ANY (ARRAY['car_1'::text, 'car_2'::text])) OR (vehicle_key ~* '^driver_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)))
);
alter table public.ops_delivery_runs enable row level security;

-- table: ops_delivery_stops
create table if not exists public.ops_delivery_stops (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  order_id uuid not null,
  sequence integer not null,
  status text default 'planned'::text not null,
  address_snapshot jsonb default '{}'::jsonb not null,
  phone_snapshot text,
  customer_name_snapshot text,
  order_number_snapshot text,
  total_cents bigint default 0 not null,
  payment_method_snapshot text,
  maps_url_snapshot text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  customer_address_id uuid,
  location_evidence_id uuid,
  region_id uuid,
  destination_latitude numeric(9,6),
  destination_longitude numeric(9,6),
  destination_confidence text,
  loaded_at timestamp with time zone,
  custody_confirmed_at timestamp with time zone,
  failed_at timestamp with time zone,
  failure_reason text,
  returned_at timestamp with time zone,
  proof_metadata jsonb default '{}'::jsonb not null,
  constraint ops_delivery_stops_run_id_order_id_key UNIQUE (run_id, order_id),
  constraint ops_delivery_stops_run_id_sequence_key UNIQUE (run_id, sequence) DEFERRABLE INITIALLY DEFERRED,
  constraint ops_delivery_stops_pkey PRIMARY KEY (id),
  constraint ops_delivery_stops_sequence_check CHECK (((sequence >= 1) AND (sequence <= 100))),
  constraint ops_delivery_stops_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'out_for_delivery'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text]))),
  constraint smart_delivery_coordinate_pair_v2 CHECK ((((destination_latitude IS NULL) AND (destination_longitude IS NULL)) OR ((destination_latitude IS NOT NULL) AND (destination_longitude IS NOT NULL)))),
  constraint smart_delivery_custody_pair_v1 CHECK ((((loaded_at IS NULL) AND (custody_confirmed_at IS NULL)) OR ((loaded_at IS NOT NULL) AND (custody_confirmed_at IS NOT NULL)))),
  constraint smart_delivery_valid_destination_v1 CHECK ((((destination_latitude IS NULL) AND (destination_longitude IS NULL)) OR (((destination_latitude >= ('-90'::integer)::numeric) AND (destination_latitude <= (90)::numeric)) AND ((destination_longitude >= ('-180'::integer)::numeric) AND (destination_longitude <= (180)::numeric)) AND ((destination_latitude <> (0)::numeric) OR (destination_longitude <> (0)::numeric)))))
);
alter table public.ops_delivery_stops enable row level security;

-- table: ops_events
create table if not exists public.ops_events (
  id uuid default gen_random_uuid() not null,
  occurred_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  domain text not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  correlation_id text,
  actor_type text default 'system'::text not null,
  actor_id text,
  actor_label text,
  source_system text default 'dona_antonia'::text not null,
  severity text default 'info'::text not null,
  summary text not null,
  payload jsonb default '{}'::jsonb not null,
  external_ref text,
  idempotency_key text,
  constraint ops_events_pkey PRIMARY KEY (id),
  constraint ops_events_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'automation'::text, 'ai'::text, 'external'::text, 'system'::text]))),
  constraint ops_events_severity_check CHECK ((severity = ANY (ARRAY['debug'::text, 'info'::text, 'warning'::text, 'error'::text, 'critical'::text])))
);
alter table public.ops_events enable row level security;
comment on table public.ops_events is 'Operations 2.0 append-only business event ledger. Not a debug log or ERP replacement.';

-- table: ops_inventory_counts
create table if not exists public.ops_inventory_counts (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  product_id uuid not null,
  product_name_snapshot text not null,
  gtin_snapshot text,
  sku_snapshot text,
  system_quantity_before numeric(14,3) not null,
  counted_quantity numeric(14,3) not null,
  difference numeric(14,3) not null,
  operator_label text,
  source text default 'mobile_balance'::text not null,
  local_stock_applied boolean default true not null,
  reconciliation_state text not null,
  reconciliation_ref text,
  notes text,
  constraint ops_inventory_counts_pkey PRIMARY KEY (id),
  constraint ops_inventory_counts_counted_quantity_check CHECK ((counted_quantity >= (0)::numeric)),
  constraint ops_inventory_counts_reconciliation_state_check CHECK ((reconciliation_state = ANY (ARRAY['matched'::text, 'pending_erp_reconciliation'::text, 'resolved'::text])))
);
alter table public.ops_inventory_counts enable row level security;

-- table: ops_inventory_incidents
create table if not exists public.ops_inventory_incidents (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  incident_type text not null,
  status text default 'open'::text not null,
  product_id uuid not null,
  product_name_snapshot text not null,
  gtin_snapshot text,
  sku_snapshot text,
  quantity numeric(14,3) not null,
  local_stock_before numeric(14,3) not null,
  local_stock_delta numeric(14,3) default 0 not null,
  local_stock_after numeric(14,3) not null,
  local_stock_applied boolean default false not null,
  needs_bling_reconciliation boolean default true not null,
  source_order_id uuid,
  operator_label text,
  note text,
  resolution text,
  resolution_ref text,
  evidence jsonb default '{}'::jsonb not null,
  constraint ops_inventory_incidents_pkey PRIMARY KEY (id),
  constraint ops_inventory_incidents_incident_type_check CHECK ((incident_type = ANY (ARRAY['damage'::text, 'expired'::text, 'loss'::text, 'return'::text, 'other'::text]))),
  constraint ops_inventory_incidents_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint ops_inventory_incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'review'::text, 'closed'::text])))
);
alter table public.ops_inventory_incidents enable row level security;

-- table: ops_order_check_items
create table if not exists public.ops_order_check_items (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  product_id uuid not null,
  gtin text,
  name_snapshot text not null,
  expected_quantity numeric(14,3) not null,
  checked_quantity numeric(14,3) default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops_order_check_items_session_id_product_id_key UNIQUE (session_id, product_id),
  constraint ops_order_check_items_pkey PRIMARY KEY (id)
);
alter table public.ops_order_check_items enable row level security;

-- table: ops_order_check_sessions
create table if not exists public.ops_order_check_sessions (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  status text default 'open'::text not null,
  operator_label text,
  started_at timestamp with time zone default now() not null,
  verified_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint ops_order_check_sessions_order_id_status_key UNIQUE (order_id, status),
  constraint ops_order_check_sessions_pkey PRIMARY KEY (id),
  constraint ops_order_check_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'verified'::text, 'cancelled'::text])))
);
alter table public.ops_order_check_sessions enable row level security;

-- table: ops_payment_bling_method_map_v1
create table if not exists public.ops_payment_bling_method_map_v1 (
  method text not null,
  bling_payment_method_id bigint,
  bling_financial_account_id bigint,
  bling_category_id bigint,
  mapping_state text default 'unmapped'::text not null,
  notes text,
  updated_at timestamp with time zone default now() not null,
  updated_by text,
  constraint ops_payment_bling_method_map_v1_pkey PRIMARY KEY (method),
  constraint ops_payment_bling_method_map_v1_mapping_state_check CHECK ((mapping_state = ANY (ARRAY['unmapped'::text, 'shadow_verified'::text, 'live_approved'::text]))),
  constraint ops_payment_bling_method_map_v1_method_check CHECK ((method = ANY (ARRAY['pix'::text, 'cash'::text, 'credit_card'::text, 'food_card'::text, 'meal_card'::text, 'other'::text])))
);
alter table public.ops_payment_bling_method_map_v1 enable row level security;

-- table: ops_payment_bling_shadow_plans_v1
create table if not exists public.ops_payment_bling_shadow_plans_v1 (
  id uuid default gen_random_uuid() not null,
  settlement_id uuid not null,
  order_id uuid not null,
  plan_fingerprint text not null,
  state text not null,
  total_cents bigint not null,
  plan jsonb not null,
  blockers jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ops_payment_bling_shadow_plan_settlement_id_plan_fingerprin_key UNIQUE (settlement_id, plan_fingerprint),
  constraint ops_payment_bling_shadow_plans_v1_pkey PRIMARY KEY (id),
  constraint ops_payment_bling_shadow_plans_v1_state_check CHECK ((state = ANY (ARRAY['blocked_mapping'::text, 'ready_shadow'::text, 'reconciled_shadow'::text, 'review_required'::text]))),
  constraint ops_payment_bling_shadow_plans_v1_total_cents_check CHECK ((total_cents > 0))
);
alter table public.ops_payment_bling_shadow_plans_v1 enable row level security;

-- table: ops_print_jobs
create table if not exists public.ops_print_jobs (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  job_type text not null,
  entity_type text default 'order'::text not null,
  entity_id text not null,
  version_key text not null,
  printer_profile text default 'separation_85mm'::text not null,
  status text default 'pending'::text not null,
  copies integer default 1 not null,
  attempts integer default 0 not null,
  payload jsonb default '{}'::jsonb not null,
  source_system text default 'dona_antonia'::text not null,
  idempotency_key text not null,
  claimed_at timestamp with time zone,
  claimed_by text,
  printed_at timestamp with time zone,
  last_error text,
  constraint ops_print_jobs_pkey PRIMARY KEY (id),
  constraint ops_print_jobs_attempts_check CHECK ((attempts >= 0)),
  constraint ops_print_jobs_copies_check CHECK (((copies >= 1) AND (copies <= 5))),
  constraint ops_print_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['picking'::text, 'delivery'::text, 'danfe'::text, 'internal'::text]))),
  constraint ops_print_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'presented'::text, 'printed'::text, 'failed'::text, 'cancelled'::text])))
);
alter table public.ops_print_jobs enable row level security;
comment on table public.ops_print_jobs is 'Operations 2.0 event-driven physical print queue. A local printer agent may consume it after hardware homologation.';

-- table: ops_stock_reconciliation_reviews
create table if not exists public.ops_stock_reconciliation_reviews (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  attention_id uuid not null,
  product_id uuid not null,
  count_id uuid,
  counted_quantity numeric(14,3) not null,
  bling_physical_snapshot numeric(14,3) not null,
  difference_to_bling numeric(14,3) not null,
  cause_code text,
  cause_note text,
  evidence_ref text,
  operator_label text,
  status text default 'classification_required'::text not null,
  automatic_stock_write boolean default false not null,
  constraint ops_stock_reconciliation_reviews_attention_id_count_id_key UNIQUE (attention_id, count_id),
  constraint ops_stock_reconciliation_reviews_pkey PRIMARY KEY (id),
  constraint ops_stock_reconciliation_reviews_counted_quantity_check CHECK ((counted_quantity >= (0)::numeric)),
  constraint ops_stock_reconciliation_reviews_status_check CHECK ((status = ANY (ARRAY['classification_required'::text, 'classified'::text, 'ready_for_erp_review'::text, 'closed'::text])))
);
alter table public.ops_stock_reconciliation_reviews enable row level security;

-- table: order_delivery_return_cases
create table if not exists public.order_delivery_return_cases (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  attempt_number integer not null,
  reason_code text not null,
  reason_label text not null,
  note text,
  status text default 'returning'::text not null,
  recommended_disposition text not null,
  final_disposition text,
  failed_at timestamp with time zone default now() not null,
  failed_by text,
  returned_at timestamp with time zone,
  returned_by text,
  closed_at timestamp with time zone,
  resolution text,
  resolution_ref text,
  idempotency_key text,
  metadata jsonb default '{}'::jsonb not null,
  constraint order_delivery_return_cases_idempotency_key_key UNIQUE (idempotency_key),
  constraint order_delivery_return_cases_pkey PRIMARY KEY (id),
  constraint order_delivery_return_cases_attempt_number_check CHECK ((attempt_number >= 1)),
  constraint order_delivery_return_cases_final_disposition_check CHECK (((final_disposition IS NULL) OR (final_disposition = ANY (ARRAY['redelivery'::text, 'review'::text, 'cancelled'::text, 'other'::text])))),
  constraint order_delivery_return_cases_reason_code_check CHECK ((reason_code = ANY (ARRAY['customer_absent'::text, 'address_not_found'::text, 'reschedule'::text, 'payment_failed'::text, 'customer_refused'::text, 'vehicle_route'::text, 'other'::text]))),
  constraint order_delivery_return_cases_recommended_disposition_check CHECK ((recommended_disposition = ANY (ARRAY['redelivery'::text, 'review'::text]))),
  constraint order_delivery_return_cases_status_check CHECK ((status = ANY (ARRAY['returning'::text, 'returned_redelivery'::text, 'returned_review'::text, 'closed'::text])))
);
alter table public.order_delivery_return_cases enable row level security;

-- table: order_fiscal_controls
create table if not exists public.order_fiscal_controls (
  order_id uuid not null,
  delivery_status text default 'pending'::text not null,
  delivery_confirmed_at timestamp with time zone,
  delivery_event_id uuid,
  payment_status text default 'pending'::text not null,
  payment_method text,
  payment_source text,
  settled_amount numeric(14,2),
  payment_confirmed_at timestamp with time zone,
  fiscal_status text default 'blocked'::text not null,
  fiscal_block_reason text,
  fiscal_ready_at timestamp with time zone,
  fiscal_version integer default 1 not null,
  bling_invoice_id bigint,
  bling_invoice_number text,
  sefaz_status text,
  issued_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  dispatch_fiscal_status text default 'pending'::text not null,
  dispatch_fiscal_authorized_at timestamp with time zone,
  dispatch_fiscal_source text,
  dispatch_fiscal_reason text,
  dispatch_started_at timestamp with time zone,
  dispatch_started_by text,
  dispatch_idempotency_key text,
  constraint order_fiscal_controls_pkey PRIMARY KEY (order_id),
  constraint order_fiscal_controls_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'out_for_delivery'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text, 'returned'::text]))),
  constraint order_fiscal_controls_dispatch_fiscal_status_check CHECK ((dispatch_fiscal_status = ANY (ARRAY['pending'::text, 'authorized'::text, 'not_required'::text, 'review_required'::text, 'cancelled'::text]))),
  constraint order_fiscal_controls_fiscal_status_check CHECK ((fiscal_status = ANY (ARRAY['blocked'::text, 'ready'::text, 'queued'::text, 'issued'::text, 'review_required'::text, 'cancelled'::text]))),
  constraint order_fiscal_controls_fiscal_version_check CHECK ((fiscal_version > 0)),
  constraint order_fiscal_controls_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'review_required'::text, 'cancelled'::text]))),
  constraint order_fiscal_controls_settled_amount_check CHECK (((settled_amount IS NULL) OR (settled_amount >= (0)::numeric)))
);
alter table public.order_fiscal_controls enable row level security;

-- table: order_items
create table if not exists public.order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  product_id uuid,
  sku_snapshot text,
  name_snapshot text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(12,2) default 0 not null,
  line_total numeric(12,2) default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_items_pkey PRIMARY KEY (id),
  constraint order_items_quantity_check CHECK ((quantity > (0)::numeric))
);
alter table public.order_items enable row level security;

-- table: order_manual_separation_queue_v1
create table if not exists public.order_manual_separation_queue_v1 (
  order_id uuid not null,
  selected_at timestamp with time zone default now() not null,
  selected_by uuid,
  selected_source text default 'admin_manual'::text not null,
  constraint order_manual_separation_queue_v1_pkey PRIMARY KEY (order_id),
  constraint manual_pick_queue_selected_source_check CHECK ((selected_source = ANY (ARRAY['admin_manual'::text, 'customer_confirmed'::text, 'admin_confirmed'::text])))
);
alter table public.order_manual_separation_queue_v1 enable row level security;
comment on table public.order_manual_separation_queue_v1 is 'Fila de separacao por inclusao manual explicita; nao modifica status, reserva ou estoque.';

-- table: order_payment_parts
create table if not exists public.order_payment_parts (
  id uuid default gen_random_uuid() not null,
  settlement_id uuid not null,
  sequence integer not null,
  method text not null,
  amount_cents bigint not null,
  detail jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint order_payment_parts_settlement_id_sequence_key UNIQUE (settlement_id, sequence),
  constraint order_payment_parts_pkey PRIMARY KEY (id),
  constraint order_payment_parts_amount_cents_check CHECK ((amount_cents > 0)),
  constraint order_payment_parts_method_check CHECK ((method = ANY (ARRAY['pix'::text, 'cash'::text, 'credit_card'::text, 'food_card'::text, 'meal_card'::text, 'other'::text]))),
  constraint order_payment_parts_sequence_check CHECK (((sequence >= 1) AND (sequence <= 8)))
);
alter table public.order_payment_parts enable row level security;

-- table: order_payment_settlements
create table if not exists public.order_payment_settlements (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  captured_at timestamp with time zone default now() not null,
  status text default 'captured'::text not null,
  expected_total_cents bigint not null,
  captured_total_cents bigint not null,
  planned_method text,
  operator_label text,
  source text default 'delivery'::text not null,
  bling_sync_state text default 'blocked_homologation'::text not null,
  bling_sync_ref text,
  bling_sync_error text,
  idempotency_key text,
  metadata jsonb default '{}'::jsonb not null,
  constraint order_payment_settlements_idempotency_key_key UNIQUE (idempotency_key),
  constraint order_payment_settlements_order_id_key UNIQUE (order_id),
  constraint order_payment_settlements_pkey PRIMARY KEY (id),
  constraint order_payment_settlements_bling_sync_state_check CHECK ((bling_sync_state = ANY (ARRAY['blocked_homologation'::text, 'pending'::text, 'synced'::text, 'failed'::text, 'not_required'::text]))),
  constraint order_payment_settlements_captured_total_cents_check CHECK ((captured_total_cents >= 0)),
  constraint order_payment_settlements_expected_total_cents_check CHECK ((expected_total_cents >= 0)),
  constraint order_payment_settlements_status_check CHECK ((status = ANY (ARRAY['captured'::text, 'synced'::text, 'needs_review'::text, 'void'::text])))
);
alter table public.order_payment_settlements enable row level security;

-- table: order_public_snapshots_v1
create table if not exists public.order_public_snapshots_v1 (
  order_id uuid not null,
  snapshot jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  refreshed_at timestamp with time zone default now() not null,
  open_count bigint default 0 not null,
  last_opened_at timestamp with time zone,
  public_token text default substr(md5((((((gen_random_uuid())::text || ':'::text) || (clock_timestamp())::text) || ':'::text) || (random())::text)), 1, 16) not null,
  public_code text default ops2_format_order_public_code_v1(nextval('order_public_code_seq_v1'::regclass)) not null,
  constraint order_public_snapshots_v1_pkey PRIMARY KEY (order_id),
  constraint order_public_snapshots_v1_open_count_check CHECK ((open_count >= 0)),
  constraint order_public_snapshots_v1_public_code_format_chk CHECK ((public_code ~ '^[A-Z]{2}[0-9]{3}$'::text)),
  constraint order_public_snapshots_v1_public_token_format_chk CHECK ((public_token ~ '^[a-f0-9]{16}$'::text))
);
alter table public.order_public_snapshots_v1 enable row level security;

-- table: order_separation_assignments_v1
create table if not exists public.order_separation_assignments_v1 (
  order_id uuid not null,
  separator_key text,
  separator_label text,
  assigned_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_separation_assignments_v1_pkey PRIMARY KEY (order_id),
  constraint order_separation_assignments_v1_separator_key_check CHECK (((separator_key IS NULL) OR (separator_key = ANY (ARRAY['jose'::text, 'claudio'::text, 'claudenil'::text, 'kelly'::text, 'jovenil'::text]))))
);
alter table public.order_separation_assignments_v1 enable row level security;

-- table: order_separation_completions_v1
create table if not exists public.order_separation_completions_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  order_number text,
  phase text default 'prepared'::text not null,
  original_total numeric default 0 not null,
  original_subtotal numeric default 0 not null,
  original_fiscal_subtotal numeric default 0 not null,
  original_discount numeric default 0 not null,
  original_other_expenses numeric default 0 not null,
  original_basket_hidden_adjustment numeric default 0 not null,
  missing_subtotal numeric default 0 not null,
  final_total numeric default 0 not null,
  missing_items jsonb default '[]'::jsonb not null,
  deliverable_order_item_ids uuid[] default '{}'::uuid[] not null,
  separator_key text,
  metadata jsonb default '{}'::jsonb not null,
  prepared_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_separation_completions_v1_order_id_key UNIQUE (order_id),
  constraint order_separation_completions_v1_pkey PRIMARY KEY (id),
  constraint order_separation_completions_v1_separator_key_check CHECK (((separator_key IS NULL) OR (separator_key = ANY (ARRAY['jose'::text, 'claudio'::text, 'claudenil'::text, 'kelly'::text, 'jovenil'::text]))))
);
alter table public.order_separation_completions_v1 enable row level security;

-- table: order_separation_customer_notifications_v1
create table if not exists public.order_separation_customer_notifications_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  notification_kind text not null,
  status text default 'pending'::text not null,
  whatsapp_account_id uuid,
  conversation_id uuid,
  customer_id uuid,
  phone_e164 text,
  channel_origin text,
  template_name text,
  provider_message_id text,
  attempt_count integer default 0 not null,
  payload jsonb default '{}'::jsonb not null,
  last_error text,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_separation_customer_notifications_v1_order_kind_uidx UNIQUE (order_id, notification_kind),
  constraint order_separation_customer_notifications_v1_pkey PRIMARY KEY (id),
  constraint order_separation_customer_notifications_notification_kind_check CHECK ((notification_kind = ANY (ARRAY['prepared_ok'::text, 'prepared_adjusted'::text]))),
  constraint order_separation_customer_notifications_v1_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint order_separation_customer_notifications_v1_channel_origin_check CHECK (((channel_origin IS NULL) OR (channel_origin = ANY (ARRAY['0975'::text, '1018'::text])))),
  constraint order_separation_customer_notifications_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'accepted'::text, 'retry'::text, 'failed'::text, 'uncertain'::text, 'suppressed'::text])))
);
alter table public.order_separation_customer_notifications_v1 enable row level security;
comment on table public.order_separation_customer_notifications_v1 is 'Idempotência/auditoria dos avisos Utility enviados ao cliente após consolidar a separação física do pedido.';

-- table: order_separation_items_v1
create table if not exists public.order_separation_items_v1 (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  order_item_id uuid not null,
  product_id uuid,
  state text default 'pending'::text not null,
  quantity numeric not null,
  unit_price numeric default 0 not null,
  line_total numeric default 0 not null,
  changed_at timestamp with time zone,
  changed_by_separator_key text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_separation_items_v1_order_id_order_item_id_key UNIQUE (order_id, order_item_id),
  constraint order_separation_items_v1_pkey PRIMARY KEY (id),
  constraint order_separation_items_v1_changed_by_separator_key_check CHECK (((changed_by_separator_key IS NULL) OR (changed_by_separator_key = ANY (ARRAY['jose'::text, 'claudio'::text, 'claudenil'::text, 'kelly'::text, 'jovenil'::text])))),
  constraint order_separation_items_v1_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint order_separation_items_v1_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'separated'::text, 'missing'::text])))
);
alter table public.order_separation_items_v1 enable row level security;

-- table: order_separation_whatsapp_settings_v1
create table if not exists public.order_separation_whatsapp_settings_v1 (
  notification_kind text not null,
  channel text not null,
  is_enabled boolean default true not null,
  draft_body text not null,
  active_template_name text not null,
  pending_template_name text,
  updated_at timestamp with time zone default now() not null,
  constraint order_separation_whatsapp_settings_v1_pkey PRIMARY KEY (notification_kind, channel),
  constraint order_separation_whatsapp_settings_v1_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint order_separation_whatsapp_settings_v1_notification_kind_check CHECK ((notification_kind = ANY (ARRAY['prepared_ok'::text, 'prepared_adjusted'::text, 'driver_next_stop'::text])))
);
alter table public.order_separation_whatsapp_settings_v1 enable row level security;

-- table: orders
create table if not exists public.orders (
  id uuid default gen_random_uuid() not null,
  customer_id uuid,
  conversation_id uuid,
  whatsapp_account_id uuid,
  bling_order_id bigint,
  status text default 'confirmed'::text not null,
  total numeric(12,2) default 0 not null,
  currency character(3) default 'BRL'::bpchar not null,
  delivery_address jsonb default '{}'::jsonb not null,
  customer_snapshot jsonb default '{}'::jsonb not null,
  confirmed_at timestamp with time zone,
  bling_synced_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  cart_id uuid,
  basket_id uuid,
  fiscal_subtotal numeric default 0 not null,
  other_expenses numeric default 0 not null,
  discount numeric default 0 not null,
  sync_status text default 'local'::text not null,
  sync_error text,
  last_sync_at timestamp with time zone,
  idempotency_key text,
  delivered_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  returned_at timestamp with time zone,
  external_status_updated_at timestamp with time zone,
  payment_method text,
  phone_e164 text,
  source text default 'legacy'::text not null,
  subtotal numeric(12,2) default 0 not null,
  order_number text,
  catalog_session_id uuid,
  basket_name_snapshot text,
  checkout_snapshot jsonb default '{}'::jsonb not null,
  basket_hidden_adjustment numeric(14,2) default 0 not null,
  delivery_customer_address_id uuid,
  delivery_location_evidence_id uuid,
  delivery_region_id uuid,
  delivery_paid_ahead boolean default false not null,
  delivery_paid_ahead_method text,
  delivery_paid_ahead_reference text,
  delivery_paid_ahead_at timestamp with time zone,
  delivery_paid_ahead_by text,
  constraint orders_bling_order_id_key UNIQUE (bling_order_id),
  constraint orders_pkey PRIMARY KEY (id),
  constraint orders_delivery_paid_ahead_method_check CHECK (((delivery_paid_ahead_method IS NULL) OR (delivery_paid_ahead_method = ANY (ARRAY['pix'::text, 'credit_card'::text])))),
  constraint orders_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['pix'::text, 'cash'::text, 'debit_card'::text, 'credit_card'::text, 'food_card'::text, 'meal_card'::text])))),
  constraint orders_status_check CHECK ((status = ANY (ARRAY['storefront_received'::text, 'confirmed'::text, 'sent_to_bling'::text, 'processing'::text, 'ready'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text, 'returned'::text]))),
  constraint orders_sync_status_check CHECK ((sync_status = ANY (ARRAY['local'::text, 'pending_bling'::text, 'processing_bling'::text, 'sent_to_bling'::text, 'error_bling'::text, 'review_bling'::text])))
);
alter table public.orders enable row level security;

-- table: oscb_gtin_research_attempts_v1
create table if not exists public.oscb_gtin_research_attempts_v1 (
  id uuid default gen_random_uuid() not null,
  gtin text not null,
  capture_id uuid,
  actor_id uuid,
  attempted_at timestamp with time zone default now() not null,
  outcome text,
  http_status integer,
  constraint oscb_gtin_research_attempts_v1_pkey PRIMARY KEY (id),
  constraint oscb_gtin_research_attempts_v1_gtin_check CHECK ((gtin ~ '^[0-9]{8,14}$'::text))
);
alter table public.oscb_gtin_research_attempts_v1 enable row level security;

-- table: oscb_gtin_research_cache_v1
create table if not exists public.oscb_gtin_research_cache_v1 (
  gtin text not null,
  status text not null,
  proposal jsonb default '{}'::jsonb not null,
  response_summary jsonb default '{}'::jsonb not null,
  last_http_status integer,
  last_error text,
  attempted_at timestamp with time zone,
  researched_at timestamp with time zone,
  researched_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint oscb_gtin_research_cache_v1_pkey PRIMARY KEY (gtin),
  constraint oscb_gtin_research_cache_v1_gtin_check CHECK ((gtin ~ '^[0-9]{8,14}$'::text)),
  constraint oscb_gtin_research_cache_v1_status_check CHECK ((status = ANY (ARRAY['researching'::text, 'review'::text, 'not_found'::text, 'error'::text])))
);
alter table public.oscb_gtin_research_cache_v1 enable row level security;

-- table: oscb_product_research_v1
create table if not exists public.oscb_product_research_v1 (
  product_id uuid not null,
  gtin text not null,
  status text not null,
  proposal jsonb default '{}'::jsonb not null,
  response_summary jsonb default '{}'::jsonb not null,
  last_http_status integer,
  last_error text,
  attempts integer default 0 not null,
  attempted_at timestamp with time zone,
  researched_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  review_state text default 'pending'::text not null,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  constraint oscb_product_research_v1_pkey PRIMARY KEY (product_id),
  constraint oscb_product_research_v1_attempts_check CHECK ((attempts >= 0)),
  constraint oscb_product_research_v1_gtin_check CHECK ((gtin ~ '^[0-9]{8,14}$'::text)),
  constraint oscb_product_research_v1_review_state_check CHECK ((review_state = ANY (ARRAY['pending'::text, 'reviewed'::text]))),
  constraint oscb_product_research_v1_status_check CHECK ((status = ANY (ARRAY['researching'::text, 'review'::text, 'not_found'::text, 'error'::text, 'skipped'::text])))
);
alter table public.oscb_product_research_v1 enable row level security;

-- table: papoai_customer_flow_events_v1
create table if not exists public.papoai_customer_flow_events_v1 (
  event_key text not null,
  phone_e164 text not null,
  customer_id uuid,
  conversation_id uuid,
  customer_created boolean default false not null,
  orders_linked integer default 0 not null,
  status text default 'processed'::text not null,
  result jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint papoai_customer_flow_events_v1_pkey PRIMARY KEY (event_key),
  constraint papoai_customer_flow_events_v1_status_check CHECK ((status = ANY (ARRAY['processed'::text, 'review_required'::text, 'failed'::text])))
);
alter table public.papoai_customer_flow_events_v1 enable row level security;

-- table: papoai_draft_events_v2
create table if not exists public.papoai_draft_events_v2 (
  event_key text not null,
  draft_id uuid not null,
  revision integer not null,
  event_type text default 'draft_update'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint papoai_draft_events_v2_pkey PRIMARY KEY (event_key)
);
alter table public.papoai_draft_events_v2 enable row level security;

-- table: papoai_order_drafts_v2
create table if not exists public.papoai_order_drafts_v2 (
  id uuid default gen_random_uuid() not null,
  conversation_ref text not null,
  phone_e164 text not null,
  customer_id uuid,
  revision integer default 1 not null,
  status text default 'draft'::text not null,
  cart jsonb default '[]'::jsonb not null,
  payment_method text,
  customer_snapshot jsonb default '{}'::jsonb not null,
  delivery jsonb default '{}'::jsonb not null,
  quoted_total_cents bigint,
  summary_hash text,
  sent_message_id text,
  confirmed_message_id text,
  canonical_order_id uuid,
  last_source_event_key text,
  expires_at timestamp with time zone default (now() + '02:00:00'::interval) not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  confirmed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  constraint papoai_order_drafts_v2_pkey PRIMARY KEY (id),
  constraint papoai_order_drafts_v2_revision_check CHECK ((revision >= 1)),
  constraint papoai_order_drafts_v2_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'awaiting_confirmation'::text, 'confirmed'::text, 'cancelled'::text, 'expired'::text, 'review_required'::text])))
);
alter table public.papoai_order_drafts_v2 enable row level security;

-- table: papoai_webhook_inbox_v2
create table if not exists public.papoai_webhook_inbox_v2 (
  id uuid default gen_random_uuid() not null,
  received_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  event_key text not null,
  body_hash text not null,
  mode text,
  event_name text,
  external_event_id text,
  external_message_id text,
  conversation_ref text,
  phone_candidate text,
  payload_bytes integer default 0 not null,
  user_agent text,
  payload jsonb default '{}'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  status text default 'captured'::text not null,
  adapter_version integer default 1 not null,
  processed_at timestamp with time zone,
  last_error text,
  constraint papoai_webhook_inbox_v2_pkey PRIMARY KEY (id),
  constraint papoai_webhook_inbox_v2_status_check CHECK ((status = ANY (ARRAY['captured'::text, 'normalized'::text, 'ignored'::text, 'processed'::text, 'review_required'::text])))
);
alter table public.papoai_webhook_inbox_v2 enable row level security;
comment on table public.papoai_webhook_inbox_v2 is 'Capture-only POC inbox for the real PapoAI webhook contract. Sanitized payloads expire logically after 7 days.';

-- table: papoai_webhook_runtime_v2
create table if not exists public.papoai_webhook_runtime_v2 (
  id smallint default 1 not null,
  capture_enabled boolean default false not null,
  key_sha256 text,
  last_seen_at timestamp with time zone,
  last_event_key text,
  last_error text,
  updated_at timestamp with time zone default now() not null,
  constraint papoai_webhook_runtime_v2_pkey PRIMARY KEY (id),
  constraint papoai_webhook_runtime_v2_id_check CHECK ((id = 1))
);
alter table public.papoai_webhook_runtime_v2 enable row level security;

-- table: product_catalog_enrichment_jobs_v1
create table if not exists public.product_catalog_enrichment_jobs_v1 (
  product_id uuid not null,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  available_at timestamp with time zone default now() not null,
  locked_at timestamp with time zone,
  review_reason text,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  constraint product_catalog_enrichment_jobs_v1_pkey PRIMARY KEY (product_id),
  constraint product_catalog_enrichment_jobs_v1_attempts_check CHECK ((attempts >= 0)),
  constraint product_catalog_enrichment_jobs_v1_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'review'::text, 'skipped'::text, 'error'::text])))
);
alter table public.product_catalog_enrichment_jobs_v1 enable row level security;

-- table: product_fiscal_evidence
create table if not exists public.product_fiscal_evidence (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  evidence_type text not null,
  source_name text,
  source_url text,
  document_key text,
  supplier_document text,
  gtin text,
  ncm text,
  cest text,
  origin_code smallint,
  cfop text,
  tax_code text,
  fiscal_description text,
  evidence_confidence numeric(5,4),
  observed_at timestamp with time zone,
  evidence_payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  evidence_key text not null,
  constraint product_fiscal_evidence_pkey PRIMARY KEY (id),
  constraint product_fiscal_evidence_cest_check CHECK (((cest IS NULL) OR (cest ~ '^[0-9]{7}$'::text))),
  constraint product_fiscal_evidence_cfop_check CHECK (((cfop IS NULL) OR (cfop ~ '^[0-9]{4}$'::text))),
  constraint product_fiscal_evidence_evidence_confidence_check CHECK (((evidence_confidence IS NULL) OR ((evidence_confidence >= (0)::numeric) AND (evidence_confidence <= (1)::numeric)))),
  constraint product_fiscal_evidence_evidence_type_check CHECK ((length(TRIM(BOTH FROM evidence_type)) > 0)),
  constraint product_fiscal_evidence_ncm_check CHECK (((ncm IS NULL) OR (ncm ~ '^[0-9]{8}$'::text))),
  constraint product_fiscal_evidence_origin_code_check CHECK (((origin_code IS NULL) OR ((origin_code >= 0) AND (origin_code <= 8))))
);
alter table public.product_fiscal_evidence enable row level security;
comment on table public.product_fiscal_evidence is 'Evidence ledger for fiscal classification. Evidence never overwrites product fiscal truth by itself.';

-- table: product_fiscal_profiles
create table if not exists public.product_fiscal_profiles (
  product_id uuid not null,
  ncm text,
  cest text,
  origin_code smallint,
  commercial_gtin text,
  tax_gtin text,
  commercial_unit text,
  tax_unit text,
  fiscal_description text,
  tax_segment_code text,
  tax_segment_name text,
  tax_group_key text,
  st_status text default 'unknown'::text not null,
  matched_st_rule_id uuid,
  classification_source text,
  classification_confidence numeric(5,4),
  review_status text default 'pending'::text not null,
  validated_at timestamp with time zone,
  validated_by uuid,
  rule_version text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_fiscal_profiles_pkey PRIMARY KEY (product_id),
  constraint product_fiscal_profiles_cest_check CHECK (((cest IS NULL) OR (cest ~ '^[0-9]{7}$'::text))),
  constraint product_fiscal_profiles_classification_confidence_check CHECK (((classification_confidence IS NULL) OR ((classification_confidence >= (0)::numeric) AND (classification_confidence <= (1)::numeric)))),
  constraint product_fiscal_profiles_commercial_gtin_check CHECK (((commercial_gtin IS NULL) OR (commercial_gtin ~ '^[0-9]{8}$'::text) OR (commercial_gtin ~ '^[0-9]{12,14}$'::text))),
  constraint product_fiscal_profiles_ncm_check CHECK (((ncm IS NULL) OR (ncm ~ '^[0-9]{8}$'::text))),
  constraint product_fiscal_profiles_origin_code_check CHECK (((origin_code IS NULL) OR ((origin_code >= 0) AND (origin_code <= 8)))),
  constraint product_fiscal_profiles_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'auto_validated'::text, 'human_validated'::text, 'blocked'::text, 'not_required'::text]))),
  constraint product_fiscal_profiles_st_status_check CHECK ((st_status = ANY (ARRAY['unknown'::text, 'not_applicable'::text, 'candidate'::text, 'applicable'::text, 'conflict'::text]))),
  constraint product_fiscal_profiles_tax_gtin_check CHECK (((tax_gtin IS NULL) OR (tax_gtin ~ '^[0-9]{8}$'::text) OR (tax_gtin ~ '^[0-9]{12,14}$'::text)))
);
alter table public.product_fiscal_profiles enable row level security;
comment on table public.product_fiscal_profiles is 'Canonical per-product fiscal identity and classification for Dona Antonia. Operational CFOP/CSOSN remain transaction/Natureza-de-Operacao concerns.';

-- table: product_fiscal_review_items
create table if not exists public.product_fiscal_review_items (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  issue_code text not null,
  severity text default 'warning'::text not null,
  status text default 'open'::text not null,
  title text not null,
  details jsonb default '{}'::jsonb not null,
  detected_by text default 'system'::text not null,
  detected_at timestamp with time zone default now() not null,
  assigned_to uuid,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  resolution_note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_fiscal_review_items_pkey PRIMARY KEY (id),
  constraint product_fiscal_review_items_issue_code_check CHECK ((length(TRIM(BOTH FROM issue_code)) > 0)),
  constraint product_fiscal_review_items_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'blocker'::text]))),
  constraint product_fiscal_review_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'resolved'::text, 'dismissed'::text]))),
  constraint product_fiscal_review_items_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);
alter table public.product_fiscal_review_items enable row level security;
comment on table public.product_fiscal_review_items is 'Human/system review queue for fiscal conflicts and incomplete classifications.';

-- table: product_identifiers
create table if not exists public.product_identifiers (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  identifier_value text not null,
  identifier_kind text not null,
  packaging_unit text,
  conversion_factor numeric,
  supplier_document text default ''::text not null,
  source text default 'system'::text not null,
  confidence numeric default 1 not null,
  status text default 'confirmed'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_identifiers_pkey PRIMARY KEY (id),
  constraint product_identifiers_check CHECK (((identifier_kind <> 'package_gtin'::text) OR (conversion_factor IS NULL) OR (conversion_factor > (1)::numeric))),
  constraint product_identifiers_check1 CHECK (((identifier_kind <> 'supplier_code'::text) OR (btrim(supplier_document) <> ''::text))),
  constraint product_identifiers_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  constraint product_identifiers_conversion_factor_check CHECK (((conversion_factor IS NULL) OR (conversion_factor >= (1)::numeric))),
  constraint product_identifiers_identifier_kind_check CHECK ((identifier_kind = ANY (ARRAY['base_gtin'::text, 'package_gtin'::text, 'supplier_code'::text, 'sku_alias'::text]))),
  constraint product_identifiers_identifier_value_check CHECK ((btrim(identifier_value) <> ''::text)),
  constraint product_identifiers_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'candidate'::text, 'rejected'::text, 'inactive'::text])))
);
alter table public.product_identifiers enable row level security;

-- table: product_inventory_lots
create table if not exists public.product_inventory_lots (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  lot_code text,
  expiration_date date,
  quantity_on_hand numeric(14,3),
  quantity_reserved numeric(14,3) default 0 not null,
  status text default 'active'::text not null,
  source text default 'manual'::text not null,
  source_ref text,
  received_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_inventory_lots_product_id_lot_code_expiration_date__key UNIQUE (product_id, lot_code, expiration_date, source_ref),
  constraint product_inventory_lots_pkey PRIMARY KEY (id),
  constraint product_inventory_lots_quantity_on_hand_check CHECK (((quantity_on_hand IS NULL) OR (quantity_on_hand >= (0)::numeric))),
  constraint product_inventory_lots_quantity_reserved_check CHECK ((quantity_reserved >= (0)::numeric)),
  constraint product_inventory_lots_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'inventory_count'::text, 'purchase_xml'::text, 'bling'::text, 'legacy'::text]))),
  constraint product_inventory_lots_status_check CHECK ((status = ANY (ARRAY['active'::text, 'quarantine'::text, 'depleted'::text, 'expired'::text, 'cancelled'::text])))
);
alter table public.product_inventory_lots enable row level security;

-- table: product_lifecycle_audit
create table if not exists public.product_lifecycle_audit (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  event text not null,
  actor_type text default 'operator'::text not null,
  actor_label text,
  previous_active boolean,
  new_active boolean,
  previous_expiration_date date,
  new_expiration_date date,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint product_lifecycle_audit_pkey PRIMARY KEY (id)
);
alter table public.product_lifecycle_audit enable row level security;

-- table: product_purchase_history
create table if not exists public.product_purchase_history (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  purchase_item_id uuid not null,
  product_id uuid not null,
  document_key text not null,
  issued_at timestamp with time zone,
  supplier_document text,
  supplier_name text,
  supplier_bling_contact_id bigint,
  original_unit text,
  original_quantity numeric(18,6),
  conversion_factor numeric(18,6),
  conversion_chain jsonb default '[]'::jsonb not null,
  base_unit text default 'UN'::text not null,
  base_quantity numeric(18,6),
  line_total numeric(18,6),
  purchase_unit_cost numeric(18,6),
  base_unit_cost numeric(18,6),
  source text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint product_purchase_history_item_unique UNIQUE (purchase_item_id),
  constraint product_purchase_history_pkey PRIMARY KEY (id)
);
alter table public.product_purchase_history enable row level security;

-- table: product_supplier_packaging
create table if not exists public.product_supplier_packaging (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  supplier_document text default ''::text not null,
  supplier_bling_contact_id bigint,
  supplier_item_code text default ''::text not null,
  purchase_unit text not null,
  base_unit text default 'UN'::text not null,
  conversion_factor numeric(18,6) not null,
  conversion_chain jsonb default '[]'::jsonb not null,
  confidence numeric(5,4) default 1 not null,
  status text default 'confirmed'::text not null,
  is_default boolean default false not null,
  source_document_key text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_supplier_packaging_identity_uq UNIQUE (product_id, supplier_document, supplier_item_code, purchase_unit),
  constraint product_supplier_packaging_pkey PRIMARY KEY (id),
  constraint product_supplier_packaging_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  constraint product_supplier_packaging_conversion_factor_check CHECK ((conversion_factor >= (1)::numeric)),
  constraint product_supplier_packaging_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'inferred_xml'::text, 'review_required'::text, 'inactive'::text])))
);
alter table public.product_supplier_packaging enable row level security;

-- table: product_taxonomy_terms
create table if not exists public.product_taxonomy_terms (
  id uuid default gen_random_uuid() not null,
  kind text not null,
  name text not null,
  parent_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_taxonomy_terms_pkey PRIMARY KEY (id),
  constraint product_taxonomy_parent_scope CHECK (((kind = 'subcategory'::text) OR (parent_id IS NULL))),
  constraint product_taxonomy_terms_kind_check CHECK ((kind = ANY (ARRAY['category'::text, 'subcategory'::text, 'brand'::text, 'gondola'::text]))),
  constraint product_taxonomy_terms_name_check CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100))))
);
alter table public.product_taxonomy_terms enable row level security;

-- table: products
create table if not exists public.products (
  id uuid default gen_random_uuid() not null,
  bling_product_id bigint,
  sku text,
  name text not null,
  gtin text,
  ncm text,
  price numeric(12,2),
  cost numeric(12,2),
  stock numeric(14,3),
  image_url text,
  whatsapp_category text,
  is_whatsapp_active boolean default true not null,
  is_offer boolean default false not null,
  metadata jsonb default '{}'::jsonb not null,
  last_bling_sync_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  firebase_key text,
  brand text,
  category text,
  subcategory text,
  subsubcategory text,
  packaging text,
  supplier text,
  validity_date date,
  gondola text,
  shelf text,
  source_system text default 'operational'::text not null,
  sync_status text default 'local'::text not null,
  last_counted_at timestamp with time zone,
  firebase_snapshot jsonb default '{}'::jsonb not null,
  unit text,
  is_active boolean default true not null,
  physically_verified boolean default false not null,
  physically_verified_at timestamp with time zone,
  physically_verified_by uuid,
  sync_error text,
  description_short text,
  description_long text,
  tags text[] default '{}'::text[] not null,
  min_stock numeric,
  sort_order integer default 0 not null,
  is_upsell boolean default false not null,
  desired_bling_status text default 'A'::text not null,
  last_admin_edit_at timestamp with time zone,
  last_admin_edit_by uuid,
  sales_category text,
  storefront_featured boolean default false not null,
  storefront_category text,
  image_original_url text,
  image_ai_url text,
  image_ai_status text,
  image_ai_model text,
  image_ai_processed_at timestamp with time zone,
  image_ai_attempts integer default 0 not null,
  image_ai_error text,
  image_ai_cost_usd numeric(12,6),
  image_ai_validation jsonb,
  image_ai_validation_cost_usd numeric(12,6),
  image_source_url text,
  image_source_origin text,
  image_source_width integer,
  image_source_height integer,
  image_source_sha256 text,
  image_source_verified_at timestamp with time zone,
  offer_price numeric(12,2),
  image_ai_ignored boolean default false not null,
  image_ai_admin_note text,
  image_ai_admin_updated_at timestamp with time zone,
  image_ai_pipeline_version text,
  image_firebase_source_url text,
  image_ai_manual_review_required boolean default false not null,
  image_ai_manual_review_reason text,
  image_ai_manual_prompt text,
  image_ai_manual_requested_at timestamp with time zone,
  image_ai_manual_requested_by uuid,
  image_ai_manual_attempts integer default 0 not null,
  image_ai_manual_resolved_at timestamp with time zone,
  customer_category text,
  customer_subcategory text,
  customer_subsubcategory text,
  customer_taxonomy_version text,
  customer_taxonomy_confidence text,
  customer_taxonomy_review_status text,
  purchase_xml_stock_update boolean default true not null,
  constraint products_bling_product_id_key UNIQUE (bling_product_id),
  constraint products_gtin_key UNIQUE (gtin),
  constraint products_sku_key UNIQUE (sku),
  constraint products_pkey PRIMARY KEY (id),
  constraint products_desired_bling_status_check CHECK ((desired_bling_status = ANY (ARRAY['A'::text, 'I'::text]))),
  constraint products_image_ai_status_check CHECK (((image_ai_status IS NULL) OR (image_ai_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'error'::text, 'rejected'::text, 'source_rejected'::text, 'needs_reprocess'::text])))),
  constraint products_sales_category_check CHECK (((sales_category IS NULL) OR (sales_category = ANY (ARRAY['mercearia'::text, 'limpeza_lavanderia'::text, 'higiene_beleza'::text, 'casa_pet'::text]))))
);
alter table public.products enable row level security;

-- table: public_rate_limits
create table if not exists public.public_rate_limits (
  rate_key text not null,
  bucket text not null,
  window_started_at timestamp with time zone default now() not null,
  hit_count integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint public_rate_limits_pkey PRIMARY KEY (rate_key, bucket)
);
alter table public.public_rate_limits enable row level security;

-- table: purchase_bling_received_review_v1
create table if not exists public.purchase_bling_received_review_v1 (
  review_date date not null,
  reviewed_at timestamp with time zone default now() not null,
  reviewed_by uuid,
  constraint purchase_bling_received_review_v1_pkey PRIMARY KEY (review_date)
);
alter table public.purchase_bling_received_review_v1 enable row level security;
comment on table public.purchase_bling_received_review_v1 is 'Registro humano de conferência diária da lista Notas recebidas no Bling; não faz manifestação fiscal.';

-- table: purchase_stock_receipt_plans_v1
create table if not exists public.purchase_stock_receipt_plans_v1 (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  status text default 'preview'::text not null,
  stock_authority text not null,
  deposit_id bigint,
  expected_items jsonb default '[]'::jsonb not null,
  baseline_snapshot jsonb default '[]'::jsonb not null,
  verification_snapshot jsonb default '[]'::jsonb not null,
  lot_evidence_summary jsonb default '{}'::jsonb not null,
  verified_at timestamp with time zone,
  verified_by uuid,
  review_reason text,
  idempotency_key text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint purchase_stock_receipt_plans_v1_document_id_key UNIQUE (document_id),
  constraint purchase_stock_receipt_plans_v1_idempotency_key_key UNIQUE (idempotency_key),
  constraint purchase_stock_receipt_plans_v1_pkey PRIMARY KEY (id),
  constraint purchase_stock_receipt_plans_v1_status_check CHECK ((status = ANY (ARRAY['preview'::text, 'awaiting_bling_receipt'::text, 'verified'::text, 'review_required'::text, 'cancelled'::text])))
);
alter table public.purchase_stock_receipt_plans_v1 enable row level security;

-- table: purchase_stock_receipts
create table if not exists public.purchase_stock_receipts (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  status text default 'pending'::text not null,
  confirmed_by uuid,
  confirmed_at timestamp with time zone,
  applied_at timestamp with time zone,
  result jsonb default '{}'::jsonb not null,
  idempotency_key text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint purchase_stock_receipts_document_unique UNIQUE (document_id),
  constraint purchase_stock_receipts_idem_unique UNIQUE (idempotency_key),
  constraint purchase_stock_receipts_pkey PRIMARY KEY (id),
  constraint purchase_stock_receipts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'applied'::text, 'review_required'::text, 'cancelled'::text])))
);
alter table public.purchase_stock_receipts enable row level security;

-- table: purchase_xml_catalog_identity_actions_v1
create table if not exists public.purchase_xml_catalog_identity_actions_v1 (
  id uuid default gen_random_uuid() not null,
  item_id uuid not null,
  document_id uuid not null,
  product_id uuid not null,
  action text not null,
  gtin_source text not null,
  gtin_role text not null,
  identifier text not null,
  conversion_factor integer not null,
  actor_id uuid not null,
  created_at timestamp with time zone default now() not null,
  purchase_pack_units_for_review integer,
  constraint purchase_xml_catalog_identity_actions_v1_item_id_key UNIQUE (item_id),
  constraint purchase_xml_catalog_identity_actions_v1_pkey PRIMARY KEY (id),
  constraint purchase_xml_catalog_identity_actions_v1_action_check CHECK ((action = ANY (ARRAY['link_existing'::text, 'create_inactive'::text]))),
  constraint purchase_xml_catalog_identity_actions_v1_gtin_role_check CHECK ((gtin_role = ANY (ARRAY['base_unit'::text, 'package'::text]))),
  constraint purchase_xml_catalog_identity_actions_v1_gtin_source_check CHECK ((gtin_source = ANY (ARRAY['commercial'::text, 'tax'::text]))),
  constraint purchase_xml_catalog_identity_actions_v_conversion_factor_check CHECK (((conversion_factor >= 1) AND (conversion_factor <= 100000))),
  constraint purchase_xml_identity_pack_review_range_v2 CHECK (((purchase_pack_units_for_review >= 1) AND (purchase_pack_units_for_review <= 100000)))
);
alter table public.purchase_xml_catalog_identity_actions_v1 enable row level security;
comment on table public.purchase_xml_catalog_identity_actions_v1 is 'R22 release candidate: identity decisions atomic, private, audit only; receipt separate.';

-- table: purchase_xml_catalog_ingest_errors_v1
create table if not exists public.purchase_xml_catalog_ingest_errors_v1 (
  document_id uuid not null,
  error_code text not null,
  error_message text not null,
  first_failed_at timestamp with time zone default now() not null,
  last_failed_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone,
  constraint purchase_xml_catalog_ingest_errors_v1_pkey PRIMARY KEY (document_id),
  constraint purchase_xml_catalog_ingest_errors_v1_error_code_check CHECK (((length(error_code) >= 1) AND (length(error_code) <= 160))),
  constraint purchase_xml_catalog_ingest_errors_v1_error_message_check CHECK (((length(error_message) >= 1) AND (length(error_message) <= 400))),
  constraint xml_ingest_error_valid_times CHECK (((resolved_at IS NULL) OR (resolved_at >= first_failed_at)))
);
alter table public.purchase_xml_catalog_ingest_errors_v1 enable row level security;
comment on table public.purchase_xml_catalog_ingest_errors_v1 is 'Catalog XML parser/upsert errors; never blocks original purchase processing; auditable, manual reprocessing only.';

-- table: purchase_xml_catalog_observations_v1
create table if not exists public.purchase_xml_catalog_observations_v1 (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  item_number integer not null,
  document_key text not null,
  supplier_item_code text,
  description text,
  commercial_gtin text,
  tax_gtin text,
  ncm text,
  cest text,
  cfop text,
  tax_code text,
  origin_code smallint,
  purchase_unit text,
  purchase_quantity numeric,
  purchase_unit_price numeric,
  tax_unit text,
  tax_quantity numeric,
  line_total numeric,
  net_line_total numeric,
  lot_traces jsonb default '[]'::jsonb not null,
  tax_detail jsonb default '{}'::jsonb not null,
  raw_item jsonb default '{}'::jsonb not null,
  source_state text default 'staging_snapshot'::text not null,
  source_content_sha256 text,
  parser_version text,
  extracted_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint purchase_xml_catalog_observations_v_document_id_item_number_key UNIQUE (document_id, item_number),
  constraint purchase_xml_catalog_observations_v1_pkey PRIMARY KEY (id),
  constraint purchase_xml_catalog_observations_v1_item_number_check CHECK (((item_number > 0) AND (item_number < 100000))),
  constraint purchase_xml_catalog_observations_v1_source_state_check CHECK ((source_state = ANY (ARRAY['staging_snapshot'::text, 'xml_verified'::text])))
);
alter table public.purchase_xml_catalog_observations_v1 enable row level security;
comment on table public.purchase_xml_catalog_observations_v1 is 'Immutable-source observations (updatable only to replace staging snapshot with verified XML); deliberately independent of products.';

-- table: purchase_xml_documents
create table if not exists public.purchase_xml_documents (
  id uuid default gen_random_uuid() not null,
  import_run_id uuid,
  source text not null,
  source_document_id text,
  bling_nfe_id bigint,
  document_key text not null,
  content_sha256 text,
  storage_path text,
  issued_at timestamp with time zone,
  supplier_document text,
  supplier_name text,
  supplier_bling_contact_id bigint,
  recipient_document text,
  recipient_kind text default 'unknown'::text not null,
  financial_eligible boolean default false not null,
  finance_status text default 'not_applicable'::text not null,
  finance_reference jsonb default '{}'::jsonb not null,
  receipt_status text default 'not_received'::text not null,
  processing_status text default 'pending'::text not null,
  total_amount numeric(18,6),
  item_count integer default 0 not null,
  matched_item_count integer default 0 not null,
  review_item_count integer default 0 not null,
  last_error text,
  metadata jsonb default '{}'::jsonb not null,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  finance_attempt_count integer default 0 not null,
  finance_last_attempt_at timestamp with time zone,
  finance_last_error text,
  finance_posted_at timestamp with time zone,
  finance_reconciled_at timestamp with time zone,
  finance_method text,
  constraint purchase_xml_documents_key_unique UNIQUE (document_key),
  constraint purchase_xml_documents_pkey PRIMARY KEY (id),
  constraint purchase_xml_documents_cpf_finance_guard CHECK (((recipient_kind <> 'CPF'::text) OR ((financial_eligible = false) AND (finance_status = 'blocked_personal'::text) AND (COALESCE(jsonb_array_length(COALESCE((finance_reference -> 'accounts'::text), '[]'::jsonb)), 0) = 0)))),
  constraint purchase_xml_documents_finance_attempt_count_check CHECK ((finance_attempt_count >= 0)),
  constraint purchase_xml_documents_finance_status_check CHECK ((finance_status = ANY (ARRAY['not_applicable'::text, 'blocked_personal'::text, 'pending_company_match'::text, 'eligible'::text, 'posted'::text, 'review'::text]))),
  constraint purchase_xml_documents_item_count_check CHECK ((item_count >= 0)),
  constraint purchase_xml_documents_matched_item_count_check CHECK ((matched_item_count >= 0)),
  constraint purchase_xml_documents_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'review_required'::text, 'failed'::text, 'duplicate'::text]))),
  constraint purchase_xml_documents_receipt_status_check CHECK ((receipt_status = ANY (ARRAY['not_received'::text, 'ready'::text, 'received'::text, 'review'::text]))),
  constraint purchase_xml_documents_recipient_kind_check CHECK ((recipient_kind = ANY (ARRAY['CNPJ'::text, 'CPF'::text, 'unknown'::text]))),
  constraint purchase_xml_documents_review_item_count_check CHECK ((review_item_count >= 0)),
  constraint purchase_xml_documents_source_check CHECK ((source = ANY (ARRAY['bling_daily'::text, 'bling_manual'::text, 'manual_xml'::text, 'bulk_xml'::text])))
);
alter table public.purchase_xml_documents enable row level security;

-- table: purchase_xml_import_runs
create table if not exists public.purchase_xml_import_runs (
  id uuid default gen_random_uuid() not null,
  source text not null,
  status text default 'running'::text not null,
  started_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  documents_seen integer default 0 not null,
  documents_processed integer default 0 not null,
  documents_duplicate integer default 0 not null,
  documents_failed integer default 0 not null,
  items_seen integer default 0 not null,
  items_matched integer default 0 not null,
  items_review integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint purchase_xml_import_runs_pkey PRIMARY KEY (id),
  constraint purchase_xml_import_runs_documents_duplicate_check CHECK ((documents_duplicate >= 0)),
  constraint purchase_xml_import_runs_documents_failed_check CHECK ((documents_failed >= 0)),
  constraint purchase_xml_import_runs_documents_processed_check CHECK ((documents_processed >= 0)),
  constraint purchase_xml_import_runs_documents_seen_check CHECK ((documents_seen >= 0)),
  constraint purchase_xml_import_runs_items_matched_check CHECK ((items_matched >= 0)),
  constraint purchase_xml_import_runs_items_review_check CHECK ((items_review >= 0)),
  constraint purchase_xml_import_runs_items_seen_check CHECK ((items_seen >= 0)),
  constraint purchase_xml_import_runs_source_check CHECK ((source = ANY (ARRAY['bling_daily'::text, 'bling_manual'::text, 'manual_xml'::text, 'bulk_xml'::text]))),
  constraint purchase_xml_import_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'completed_with_review'::text, 'failed'::text])))
);
alter table public.purchase_xml_import_runs enable row level security;

-- table: purchase_xml_item_lot_evidence
create table if not exists public.purchase_xml_item_lot_evidence (
  id uuid default gen_random_uuid() not null,
  purchase_item_id uuid not null,
  trace_index integer default 1 not null,
  lot_code text,
  manufacture_date date,
  expiration_date date,
  xml_quantity numeric(18,6),
  base_quantity numeric(18,6),
  conversion_factor numeric(18,6),
  status text default 'observed'::text not null,
  source text default 'nfe_rastro'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint purchase_xml_item_lot_evidence_purchase_item_id_trace_index_key UNIQUE (purchase_item_id, trace_index),
  constraint purchase_xml_item_lot_evidence_pkey PRIMARY KEY (id),
  constraint purchase_xml_item_lot_evidence_status_check CHECK ((status = ANY (ARRAY['observed'::text, 'ready'::text, 'review_required'::text, 'materialized'::text, 'ignored'::text]))),
  constraint purchase_xml_item_lot_evidence_trace_index_check CHECK ((trace_index > 0))
);
alter table public.purchase_xml_item_lot_evidence enable row level security;

-- table: purchase_xml_items
create table if not exists public.purchase_xml_items (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  item_number integer not null,
  supplier_item_code text,
  description text not null,
  commercial_gtin text,
  tax_gtin text,
  ncm text,
  cest text,
  cfop text,
  tax_code text,
  origin_code smallint,
  purchase_unit text,
  purchase_quantity numeric(18,6) default 0 not null,
  purchase_unit_price numeric(18,6),
  line_total numeric(18,6),
  base_unit text default 'UN'::text not null,
  conversion_status text default 'review_required'::text not null,
  conversion_factor numeric(18,6),
  conversion_chain jsonb default '[]'::jsonb not null,
  converted_quantity numeric(18,6),
  base_unit_cost numeric(18,6),
  product_id uuid,
  bling_product_id bigint,
  match_method text,
  processing_status text default 'pending'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  lot_expiration_date date,
  inventory_lot_id uuid,
  stock_update_requested boolean default true not null,
  constraint purchase_xml_items_doc_item_unique UNIQUE (document_id, item_number),
  constraint purchase_xml_items_pkey PRIMARY KEY (id),
  constraint purchase_xml_items_conversion_factor_check CHECK (((conversion_factor IS NULL) OR (conversion_factor >= (1)::numeric))),
  constraint purchase_xml_items_conversion_status_check CHECK ((conversion_status = ANY (ARRAY['not_needed'::text, 'known'::text, 'inferred_xml'::text, 'review_required'::text]))),
  constraint purchase_xml_items_item_number_check CHECK ((item_number > 0)),
  constraint purchase_xml_items_origin_code_check CHECK (((origin_code >= 0) AND (origin_code <= 8))),
  constraint purchase_xml_items_pack_factor_guard CHECK (((upper(COALESCE(purchase_unit, ''::text)) <> ALL (ARRAY['CX'::text, 'FD'::text, 'PCT'::text, 'DP'::text])) OR (conversion_status = 'review_required'::text) OR (COALESCE(conversion_factor, (0)::numeric) > (1)::numeric))),
  constraint purchase_xml_items_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'matched'::text, 'created_inactive'::text, 'review_required'::text, 'processed'::text, 'failed'::text]))),
  constraint purchase_xml_items_purchase_quantity_check CHECK ((purchase_quantity >= (0)::numeric))
);
alter table public.purchase_xml_items enable row level security;

-- table: purchase_xml_settings
create table if not exists public.purchase_xml_settings (
  id smallint default 1 not null,
  company_document text,
  daily_enabled boolean default true not null,
  daily_lookback_days integer default 3 not null,
  daily_hour_cuiaba smallint default 6 not null,
  auto_create_inactive_products boolean default true not null,
  auto_sync_product_supplier boolean default true not null,
  auto_create_payables boolean default true not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint purchase_xml_settings_pkey PRIMARY KEY (id),
  constraint purchase_xml_settings_daily_hour_cuiaba_check CHECK (((daily_hour_cuiaba >= 0) AND (daily_hour_cuiaba <= 23))),
  constraint purchase_xml_settings_daily_lookback_days_check CHECK (((daily_lookback_days >= 1) AND (daily_lookback_days <= 31))),
  constraint purchase_xml_settings_id_check CHECK ((id = 1))
);
alter table public.purchase_xml_settings enable row level security;

-- table: sales_quote_bling_orders
create table if not exists public.sales_quote_bling_orders (
  quote_id uuid not null,
  external_key text not null,
  status text default 'processing'::text not null,
  bling_order_id bigint,
  attempt_count integer default 0 not null,
  last_error text,
  detail jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint sales_quote_bling_orders_bling_order_id_key UNIQUE (bling_order_id),
  constraint sales_quote_bling_orders_external_key_key UNIQUE (external_key),
  constraint sales_quote_bling_orders_pkey PRIMARY KEY (quote_id),
  constraint sales_quote_bling_orders_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'synced'::text, 'review_required'::text])))
);
alter table public.sales_quote_bling_orders enable row level security;

-- table: sales_quotes
create table if not exists public.sales_quotes (
  id uuid default gen_random_uuid() not null,
  quote_number text not null,
  customer_id uuid,
  client_name text,
  client_document text,
  status text default 'draft'::text not null,
  issued_on date,
  valid_until date,
  subtotal_cents bigint default 0 not null,
  total_cents bigint default 0 not null,
  item_count integer default 0 not null,
  snapshot jsonb default '{}'::jsonb not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  archived_at timestamp with time zone,
  constraint sales_quotes_pkey PRIMARY KEY (id),
  constraint sales_quotes_item_count_check CHECK ((item_count >= 0)),
  constraint sales_quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text]))),
  constraint sales_quotes_subtotal_cents_check CHECK ((subtotal_cents >= 0)),
  constraint sales_quotes_total_cents_check CHECK ((total_cents >= 0))
);
alter table public.sales_quotes enable row level security;
comment on table public.sales_quotes is 'Orçamentos comerciais do Vitrine/Admin. Snapshot preserva exatamente campos, itens, preços e opções do editor no momento do salvamento.';

-- table: si5_internal_trigger_guard_v1
create table if not exists public.si5_internal_trigger_guard_v1 (
  id boolean default true not null,
  secret_sha256 text not null,
  created_at timestamp with time zone default now() not null,
  constraint si5_internal_trigger_guard_v1_pkey PRIMARY KEY (id),
  constraint si5_internal_trigger_guard_v1_id_check CHECK (id),
  constraint si5_internal_trigger_guard_v1_secret_sha256_check CHECK ((secret_sha256 ~ '^[0-9a-f]{64}$'::text))
);
alter table public.si5_internal_trigger_guard_v1 enable row level security;
comment on table public.si5_internal_trigger_guard_v1 is 'Internal SI5 webhook authorization digest. Plain token stored only encrypted in Vault.';

-- table: si5_product_research
create table if not exists public.si5_product_research (
  product_id uuid not null,
  gtin text not null,
  status text default 'pending'::text not null,
  identity_verified boolean default false not null,
  source_license_confirmed boolean default false not null,
  observed_fields text[] default '{}'::text[] not null,
  proposed_attributes jsonb default '{}'::jsonb not null,
  response_summary jsonb default '{}'::jsonb not null,
  last_http_status integer,
  last_error text,
  last_attempt_at timestamp with time zone,
  retry_after timestamp with time zone,
  researched_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint si5_product_research_pkey PRIMARY KEY (product_id),
  constraint si5_product_research_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reserved'::text, 'review'::text, 'not_found'::text, 'retry'::text, 'blocked'::text])))
);
alter table public.si5_product_research enable row level security;

-- table: si5_research_config
create table if not exists public.si5_research_config (
  id boolean default true not null,
  enabled boolean default false not null,
  daily_limit smallint default 100 not null,
  max_batch smallint default 5 not null,
  research_mode text default 'representatives_only'::text not null,
  updated_at timestamp with time zone default now() not null,
  constraint si5_research_config_pkey PRIMARY KEY (id),
  constraint si5_research_config_daily_limit_check CHECK (((daily_limit >= 1) AND (daily_limit <= 100))),
  constraint si5_research_config_id_check CHECK (id),
  constraint si5_research_config_max_batch_check CHECK (((max_batch >= 1) AND (max_batch <= 5))),
  constraint si5_research_config_research_mode_check CHECK ((research_mode = ANY (ARRAY['representatives_only'::text, 'full'::text])))
);
alter table public.si5_research_config enable row level security;

-- table: si5_research_requests
create table if not exists public.si5_research_requests (
  id bigint generated always as identity not null,
  quota_date date not null,
  quota_slot smallint not null,
  product_id uuid not null,
  gtin text not null,
  state text default 'reserved'::text not null,
  http_status integer,
  completed_at timestamp with time zone,
  error_code text,
  created_at timestamp with time zone default now() not null,
  constraint si5_research_requests_quota_date_quota_slot_key UNIQUE (quota_date, quota_slot),
  constraint si5_research_requests_pkey PRIMARY KEY (id),
  constraint si5_research_requests_quota_slot_check CHECK (((quota_slot >= 1) AND (quota_slot <= 100))),
  constraint si5_research_requests_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'found'::text, 'not_found'::text, 'http_error'::text, 'rate_limited'::text, 'invalid_identity'::text, 'network_error'::text])))
);
alter table public.si5_research_requests enable row level security;

-- table: simples_homologation_checks
create table if not exists public.simples_homologation_checks (
  id uuid default gen_random_uuid() not null,
  period_id uuid not null,
  accountant_das_amount numeric(14,2) not null,
  accountant_values jsonb default '{}'::jsonb not null,
  system_das_amount numeric(14,2) not null,
  absolute_difference numeric(14,2) not null,
  percentage_difference numeric(12,6),
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint simples_homologation_checks_pkey PRIMARY KEY (id),
  constraint simples_homologation_checks_accountant_das_amount_check CHECK ((accountant_das_amount >= (0)::numeric)),
  constraint simples_homologation_checks_system_das_amount_check CHECK ((system_das_amount >= (0)::numeric))
);
alter table public.simples_homologation_checks enable row level security;

-- table: simples_monthly_revenue_history
create table if not exists public.simples_monthly_revenue_history (
  id uuid default gen_random_uuid() not null,
  competence_month date not null,
  gross_sales numeric(14,2) default 0 not null,
  returns_amount numeric(14,2) default 0 not null,
  net_revenue numeric(14,2) default 0 not null,
  document_count integer default 0 not null,
  return_document_count integer default 0 not null,
  source text default 'bling_nfe'::text not null,
  source_hash text,
  collection_status text default 'incomplete'::text not null,
  review_reason text,
  evidence jsonb default '{}'::jsonb not null,
  collected_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint simples_monthly_revenue_history_competence_month_key UNIQUE (competence_month),
  constraint simples_monthly_revenue_history_pkey PRIMARY KEY (id),
  constraint simples_monthly_revenue_history_collection_status_check CHECK ((collection_status = ANY (ARRAY['complete'::text, 'incomplete'::text, 'review_required'::text, 'failed'::text]))),
  constraint simples_monthly_revenue_history_competence_month_check CHECK (((date_trunc('month'::text, (competence_month)::timestamp with time zone))::date = competence_month)),
  constraint simples_monthly_revenue_history_document_count_check CHECK ((document_count >= 0)),
  constraint simples_monthly_revenue_history_gross_sales_check CHECK ((gross_sales >= (0)::numeric)),
  constraint simples_monthly_revenue_history_net_revenue_check CHECK ((net_revenue >= (0)::numeric)),
  constraint simples_monthly_revenue_history_return_document_count_check CHECK ((return_document_count >= 0)),
  constraint simples_monthly_revenue_history_returns_amount_check CHECK ((returns_amount >= (0)::numeric)),
  constraint simples_monthly_revenue_history_source_check CHECK ((source = ANY (ARRAY['bling_nfe'::text, 'manual_verified'::text])))
);
alter table public.simples_monthly_revenue_history enable row level security;
comment on table public.simples_monthly_revenue_history is 'Monthly earned-revenue evidence used only for RBT12 bootstrap. Populated on demand from Bling NF-e; no PGDAS side effects.';

-- table: simples_periods
create table if not exists public.simples_periods (
  id uuid default gen_random_uuid() not null,
  competence_month date not null,
  version integer default 1 not null,
  status text default 'draft'::text not null,
  rule_set_id uuid,
  collection_status text default 'incomplete'::text not null,
  gross_revenue_month numeric(14,2) default 0 not null,
  segregated_revenue jsonb default '{}'::jsonb not null,
  rbt12 numeric(14,2),
  nominal_rate numeric(9,6),
  deduction_amount numeric(14,2),
  effective_rate numeric(9,6),
  estimated_das_amount numeric(14,2),
  blocking_issue_count integer default 0 not null,
  warning_count integer default 0 not null,
  calculation_memory jsonb default '{}'::jsonb not null,
  input_hash text,
  calculated_at timestamp with time zone,
  locked_at timestamp with time zone,
  locked_by uuid,
  supersedes_period_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint simples_periods_competence_month_version_key UNIQUE (competence_month, version),
  constraint simples_periods_pkey PRIMARY KEY (id),
  constraint simples_periods_blocking_issue_count_check CHECK ((blocking_issue_count >= 0)),
  constraint simples_periods_collection_status_check CHECK ((collection_status = ANY (ARRAY['complete'::text, 'incomplete'::text, 'failed'::text, 'stale'::text]))),
  constraint simples_periods_competence_month_check CHECK (((date_trunc('month'::text, (competence_month)::timestamp with time zone))::date = competence_month)),
  constraint simples_periods_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review_required'::text, 'ready'::text, 'locked'::text, 'superseded'::text]))),
  constraint simples_periods_version_check CHECK ((version > 0)),
  constraint simples_periods_warning_count_check CHECK ((warning_count >= 0))
);
alter table public.simples_periods enable row level security;

-- table: simples_reconciliation_issues
create table if not exists public.simples_reconciliation_issues (
  id uuid default gen_random_uuid() not null,
  period_id uuid not null,
  issue_type text not null,
  severity text default 'blocking'::text not null,
  status text default 'open'::text not null,
  source_document_id text,
  access_key text,
  order_id uuid,
  product_id uuid,
  amount numeric(14,2),
  title text not null,
  explanation text not null,
  evidence jsonb default '{}'::jsonb not null,
  resolution jsonb default '{}'::jsonb not null,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint simples_reconciliation_issues_pkey PRIMARY KEY (id),
  constraint simples_reconciliation_issues_issue_type_check CHECK ((issue_type = ANY (ARRAY['order_without_invoice'::text, 'invoice_without_order'::text, 'cancel_status_mismatch'::text, 'return_status_mismatch'::text, 'product_without_fiscal_profile'::text, 'st_unresolved'::text, 'monophase_unresolved'::text, 'document_value_mismatch'::text, 'duplicated_document'::text, 'rule_not_effective_for_date'::text, 'rbt12_history_incomplete'::text, 'collection_incomplete'::text, 'other'::text]))),
  constraint simples_reconciliation_issues_severity_check CHECK ((severity = ANY (ARRAY['blocking'::text, 'warning'::text]))),
  constraint simples_reconciliation_issues_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'ignored_with_reason'::text])))
);
alter table public.simples_reconciliation_issues enable row level security;

-- table: simples_revenue_lines
create table if not exists public.simples_revenue_lines (
  id uuid default gen_random_uuid() not null,
  period_id uuid not null,
  source_type text not null,
  source_document_id text,
  access_key text,
  bling_invoice_id bigint,
  order_id uuid,
  product_id uuid,
  issued_at timestamp with time zone,
  gross_amount numeric(14,2) default 0 not null,
  recognized_amount numeric(14,2) default 0 not null,
  tax_bucket text default 'manual_review'::text not null,
  classification_status text default 'manual_review'::text not null,
  classification_rule_id uuid,
  classification_rule_version integer,
  confidence numeric(5,4),
  evidence jsonb default '{}'::jsonb not null,
  blocking_reason text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint simples_revenue_lines_pkey PRIMARY KEY (id),
  constraint simples_revenue_lines_access_key_check CHECK (((access_key IS NULL) OR (access_key ~ '^[0-9]{44}$'::text))),
  constraint simples_revenue_lines_classification_status_check CHECK ((classification_status = ANY (ARRAY['classified'::text, 'manual_review'::text, 'blocked'::text]))),
  constraint simples_revenue_lines_tax_bucket_check CHECK ((tax_bucket = ANY (ARRAY['normal_resale'::text, 'icms_st'::text, 'monophase'::text, 'cancellation'::text, 'return'::text, 'manual_review'::text])))
);
alter table public.simples_revenue_lines enable row level security;

-- table: simples_rule_sets
create table if not exists public.simples_rule_sets (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  annex_code text default 'I'::text not null,
  effective_from date not null,
  effective_to date,
  status text default 'draft'::text not null,
  brackets jsonb default '[]'::jsonb not null,
  tax_shares jsonb default '{}'::jsonb not null,
  legal_basis jsonb default '[]'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint simples_rule_sets_code_key UNIQUE (code),
  constraint simples_rule_sets_pkey PRIMARY KEY (id),
  constraint simples_rule_sets_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  constraint simples_rule_sets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))
);
alter table public.simples_rule_sets enable row level security;

-- table: simples_tax_classification_rules
create table if not exists public.simples_tax_classification_rules (
  id uuid default gen_random_uuid() not null,
  rule_set_id uuid not null,
  code text not null,
  version integer default 1 not null,
  tax_bucket text not null,
  application_mode text default 'manual_only'::text not null,
  effective_from date not null,
  effective_to date,
  match_criteria jsonb default '{}'::jsonb not null,
  required_evidence jsonb default '{}'::jsonb not null,
  legal_basis jsonb default '[]'::jsonb not null,
  status text default 'draft'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint simples_tax_classification_rules_code_version_key UNIQUE (code, version),
  constraint simples_tax_classification_rules_pkey PRIMARY KEY (id),
  constraint simples_tax_classification_rules_application_mode_check CHECK ((application_mode = ANY (ARRAY['strict_auto'::text, 'manual_only'::text]))),
  constraint simples_tax_classification_rules_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  constraint simples_tax_classification_rules_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]))),
  constraint simples_tax_classification_rules_tax_bucket_check CHECK ((tax_bucket = ANY (ARRAY['normal_resale'::text, 'icms_st'::text, 'monophase'::text, 'cancellation'::text, 'return'::text, 'manual_review'::text]))),
  constraint simples_tax_classification_rules_version_check CHECK ((version > 0))
);
alter table public.simples_tax_classification_rules enable row level security;

-- table: simples_validation_runs
create table if not exists public.simples_validation_runs (
  id uuid default gen_random_uuid() not null,
  period_id uuid not null,
  run_kind text default 'recalculate'::text not null,
  status text not null,
  input_hash text,
  input_summary jsonb default '{}'::jsonb not null,
  result_summary jsonb default '{}'::jsonb not null,
  error_detail text,
  started_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  duration_ms integer,
  actor_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint simples_validation_runs_pkey PRIMARY KEY (id),
  constraint simples_validation_runs_run_kind_check CHECK ((run_kind = ANY (ARRAY['collect'::text, 'reconcile'::text, 'recalculate'::text, 'lock_check'::text, 'homologation'::text]))),
  constraint simples_validation_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'blocked'::text])))
);
alter table public.simples_validation_runs enable row level security;

-- table: site_basket_product_type_option_quantities
create table if not exists public.site_basket_product_type_option_quantities (
  product_type_id uuid not null,
  product_id uuid not null,
  basket_id uuid not null,
  quantity integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint site_basket_product_type_option_quantities_pkey PRIMARY KEY (product_type_id, product_id, basket_id),
  constraint site_basket_product_type_option_quantities_quantity_check CHECK (((quantity >= 0) AND (quantity <= 999)))
);
alter table public.site_basket_product_type_option_quantities enable row level security;

-- table: site_basket_product_type_options
create table if not exists public.site_basket_product_type_options (
  product_type_id uuid not null,
  product_id uuid not null,
  sort_order integer default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint site_basket_product_type_options_pkey PRIMARY KEY (product_type_id, product_id)
);
alter table public.site_basket_product_type_options enable row level security;

-- table: site_basket_product_type_quantities
create table if not exists public.site_basket_product_type_quantities (
  product_type_id uuid not null,
  basket_id uuid not null,
  quantity integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint site_basket_product_type_quantities_pkey PRIMARY KEY (product_type_id, basket_id),
  constraint site_basket_product_type_quantities_quantity_check CHECK (((quantity >= 0) AND (quantity <= 999)))
);
alter table public.site_basket_product_type_quantities enable row level security;

-- table: site_basket_product_types
create table if not exists public.site_basket_product_types (
  id uuid default gen_random_uuid() not null,
  seed_source_type_id uuid,
  title text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  session_id uuid default gen_random_uuid() not null,
  slot_order integer default 1 not null,
  constraint site_basket_product_types_seed_source_type_id_key UNIQUE (seed_source_type_id),
  constraint site_basket_product_types_pkey PRIMARY KEY (id),
  constraint site_basket_product_types_slot_order_check CHECK ((slot_order >= 1)),
  constraint site_basket_product_types_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 180)))
);
alter table public.site_basket_product_types enable row level security;

-- table: site_order_whatsapp_settings_v1
create table if not exists public.site_order_whatsapp_settings_v1 (
  channel text not null,
  is_enabled boolean default true not null,
  draft_body text not null,
  active_template_name text not null,
  pending_template_name text,
  updated_at timestamp with time zone default now() not null,
  constraint site_order_whatsapp_settings_v1_pkey PRIMARY KEY (channel),
  constraint site_order_whatsapp_settings_v1_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text])))
);
alter table public.site_order_whatsapp_settings_v1 enable row level security;

-- table: storefront_builder_categories_v1
create table if not exists public.storefront_builder_categories_v1 (
  id uuid default gen_random_uuid() not null,
  category_key text not null,
  label text not null,
  sort_order integer default 10 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint storefront_builder_categories_v1_category_key_key UNIQUE (category_key),
  constraint storefront_builder_categories_v1_pkey PRIMARY KEY (id),
  constraint storefront_builder_categories_v1_category_key_check CHECK ((category_key = ANY (ARRAY['mercearia'::text, 'limpeza_lavanderia'::text, 'higiene_beleza'::text, 'casa_pet'::text]))),
  constraint storefront_builder_categories_v1_label_check CHECK (((char_length(btrim(label)) >= 2) AND (char_length(btrim(label)) <= 80)))
);
alter table public.storefront_builder_categories_v1 enable row level security;

-- table: storefront_identity_resolve_attempts
create table if not exists public.storefront_identity_resolve_attempts (
  id bigint generated by default as identity not null,
  ip_hash text not null,
  attempted_at timestamp with time zone default now() not null,
  success boolean default false not null,
  constraint storefront_identity_resolve_attempts_pkey PRIMARY KEY (id)
);
alter table public.storefront_identity_resolve_attempts enable row level security;

-- table: storefront_identity_tokens
create table if not exists public.storefront_identity_tokens (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  phone_e164 text not null,
  contact_name text,
  source text default 'papoai'::text not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  last_used_at timestamp with time zone,
  use_count integer default 0 not null,
  redeemed_at timestamp with time zone,
  short_code text,
  conversation_id uuid,
  customer_id uuid,
  source_event_key text,
  constraint storefront_identity_tokens_token_hash_key UNIQUE (token_hash),
  constraint storefront_identity_tokens_pkey PRIMARY KEY (id)
);
alter table public.storefront_identity_tokens enable row level security;

-- table: storefront_maintenance_state_v1
create table if not exists public.storefront_maintenance_state_v1 (
  singleton boolean default true not null,
  enabled boolean default false not null,
  updated_at timestamp with time zone default now() not null,
  constraint storefront_maintenance_state_v1_pkey PRIMARY KEY (singleton),
  constraint storefront_maintenance_state_v1_singleton_check CHECK ((singleton IS TRUE))
);
alter table public.storefront_maintenance_state_v1 enable row level security;

-- table: storefront_public_home_snapshot_v1
create table if not exists public.storefront_public_home_snapshot_v1 (
  snapshot_key text not null,
  payload jsonb,
  generated_at timestamp with time zone,
  refresh_token uuid,
  refresh_lease_until timestamp with time zone default '1970-01-01 00:00:00+00'::timestamp with time zone not null,
  constraint storefront_public_home_snapshot_v1_pkey PRIMARY KEY (snapshot_key),
  constraint storefront_public_home_snapshot_payload_chk CHECK (((payload IS NULL) OR ((jsonb_typeof(payload) = 'object'::text) AND ((payload ->> 'ok'::text) = 'true'::text) AND (jsonb_typeof((payload -> 'baskets'::text)) = 'array'::text) AND (jsonb_typeof((payload -> 'basket_categories'::text)) = 'array'::text)))),
  constraint storefront_public_home_snapshot_singleton_chk CHECK ((snapshot_key = 'home'::text))
);
alter table public.storefront_public_home_snapshot_v1 enable row level security;

-- table: storefront_v3_categories
create table if not exists public.storefront_v3_categories (
  name text not null,
  is_visible boolean default true not null,
  show_home boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint storefront_v3_categories_pkey PRIMARY KEY (name),
  constraint storefront_v3_categories_name_not_blank CHECK ((btrim(name) <> ''::text))
);
alter table public.storefront_v3_categories enable row level security;

-- table: system_secrets
create table if not exists public.system_secrets (
  id uuid default gen_random_uuid() not null,
  key_name text not null,
  key_hash text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  rotated_at timestamp with time zone,
  constraint system_secrets_key_name_key UNIQUE (key_name),
  constraint system_secrets_pkey PRIMARY KEY (id)
);
alter table public.system_secrets enable row level security;

-- table: vitrine_gondolas
create table if not exists public.vitrine_gondolas (
  id uuid default gen_random_uuid() not null,
  number integer not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint vitrine_gondolas_number_key UNIQUE (number),
  constraint vitrine_gondolas_pkey PRIMARY KEY (id),
  constraint vitrine_gondolas_number_check CHECK (((number > 0) AND (number <= 9999)))
);
alter table public.vitrine_gondolas enable row level security;

-- table: vitrine_operational_cutover_config
create table if not exists public.vitrine_operational_cutover_config (
  id integer not null,
  live_orders_since timestamp with time zone not null,
  legacy_orders_read_only boolean default true not null,
  updated_at timestamp with time zone default now() not null,
  constraint vitrine_operational_cutover_config_pkey PRIMARY KEY (id)
);
alter table public.vitrine_operational_cutover_config enable row level security;

-- table: vitrine_stock_reservation_lots
create table if not exists public.vitrine_stock_reservation_lots (
  id uuid default gen_random_uuid() not null,
  reservation_id uuid not null,
  lot_id uuid not null,
  product_id uuid not null,
  allocated_quantity numeric(18,6) not null,
  status text default 'reserved'::text not null,
  consumed_at timestamp with time zone,
  released_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint vitrine_stock_reservation_lots_reservation_id_lot_id_key UNIQUE (reservation_id, lot_id),
  constraint vitrine_stock_reservation_lots_pkey PRIMARY KEY (id),
  constraint vitrine_stock_reservation_lots_allocated_quantity_check CHECK ((allocated_quantity > (0)::numeric)),
  constraint vitrine_stock_reservation_lots_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text])))
);
alter table public.vitrine_stock_reservation_lots enable row level security;

-- table: vitrine_stock_reservations
create table if not exists public.vitrine_stock_reservations (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  product_id uuid not null,
  quantity numeric not null,
  status text default 'reserved'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '02:00:00'::interval) not null,
  consumed_at timestamp with time zone,
  released_at timestamp with time zone,
  constraint vitrine_stock_reservations_order_id_product_id_key UNIQUE (order_id, product_id),
  constraint vitrine_stock_reservations_pkey PRIMARY KEY (id),
  constraint vitrine_stock_reservations_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint vitrine_stock_reservations_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text])))
);
alter table public.vitrine_stock_reservations enable row level security;

-- table: whatsapp_1018_checkout_attempts_v1
create table if not exists public.whatsapp_1018_checkout_attempts_v1 (
  id uuid default gen_random_uuid() not null,
  request_key uuid not null,
  actor_user_id uuid not null,
  payload_hash text not null,
  status text default 'processing'::text not null,
  order_id uuid,
  result jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_1018_checkout_attempts_v1_request_key_key UNIQUE (request_key),
  constraint whatsapp_1018_checkout_attempts_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_1018_checkout_attempts_v1_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed'::text])))
);
alter table public.whatsapp_1018_checkout_attempts_v1 enable row level security;
comment on table public.whatsapp_1018_checkout_attempts_v1 is 'Service-role-only idempotency ledger for explicitly authorized 1018 pilot checkout; never stores basket hidden price adjustments.';

-- table: whatsapp_1018_interactive_canary_v1
create table if not exists public.whatsapp_1018_interactive_canary_v1 (
  request_id uuid not null,
  sender_account_id uuid not null,
  conversation_id uuid not null,
  recipient_e164 text not null,
  kind text not null,
  date_utc date default ((now() AT TIME ZONE 'utc'::text))::date not null,
  payload_hash text not null,
  status text default 'claimed'::text not null,
  provider_message_id text,
  error_code text,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint whatsapp_1018_canary_one_kind_per_day UNIQUE (sender_account_id, recipient_e164, date_utc, kind),
  constraint whatsapp_1018_interactive_canary_v1_pkey PRIMARY KEY (request_id),
  constraint whatsapp_1018_interactive_canary_v1_kind_check CHECK ((kind = ANY (ARRAY['sizes'::text, 'combinations'::text, 'composition'::text]))),
  constraint whatsapp_1018_interactive_canary_v1_payload_hash_check CHECK ((payload_hash ~ '^[a-f0-9]{64}$'::text)),
  constraint whatsapp_1018_interactive_canary_v1_recipient_e164_check CHECK ((recipient_e164 = '+5565999828360'::text)),
  constraint whatsapp_1018_interactive_canary_v1_status_check CHECK ((status = ANY (ARRAY['claimed'::text, 'sent'::text, 'failed'::text, 'uncertain'::text])))
);
alter table public.whatsapp_1018_interactive_canary_v1 enable row level security;
comment on table public.whatsapp_1018_interactive_canary_v1 is 'Internal Meta canary, sender 1018 recipient 8360. One claim per kind per UTC day, including itemized composition. Requires human send and open 24h window.';

-- table: whatsapp_accounts
create table if not exists public.whatsapp_accounts (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  display_name text not null,
  phone_e164 text not null,
  phone_number_id text,
  waba_id text,
  make_connection_id bigint,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_accounts_phone_e164_key UNIQUE (phone_e164),
  constraint whatsapp_accounts_phone_number_id_key UNIQUE (phone_number_id),
  constraint whatsapp_accounts_slug_key UNIQUE (slug),
  constraint whatsapp_accounts_pkey PRIMARY KEY (id)
);
alter table public.whatsapp_accounts enable row level security;

-- table: whatsapp_ana_jobs_v1
create table if not exists public.whatsapp_ana_jobs_v1 (
  id uuid default gen_random_uuid() not null,
  inbound_message_id uuid not null,
  conversation_id uuid not null,
  whatsapp_account_id uuid not null,
  dry_run boolean default true not null,
  status text default 'queued'::text not null,
  decision text,
  suggestion_text text,
  confidence numeric(5,4),
  reason text,
  model text,
  provider_response_id text,
  attempt_count integer default 0 not null,
  available_at timestamp with time zone default now() not null,
  claimed_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_error text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_ana_jobs_v1_inbound_message_id_key UNIQUE (inbound_message_id),
  constraint whatsapp_ana_jobs_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_ana_jobs_v1_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint whatsapp_ana_jobs_v1_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
  constraint whatsapp_ana_jobs_v1_decision_check CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['suggest'::text, 'handoff'::text, 'no_reply'::text])))),
  constraint whatsapp_ana_jobs_v1_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'claimed'::text, 'completed'::text, 'skipped'::text, 'failed'::text])))
);
alter table public.whatsapp_ana_jobs_v1 enable row level security;

-- table: whatsapp_ana_reviews_v1
create table if not exists public.whatsapp_ana_reviews_v1 (
  id uuid default gen_random_uuid() not null,
  job_id uuid not null,
  conversation_id uuid not null,
  reviewer_user_id uuid not null,
  outcome text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_ana_reviews_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_ana_reviews_v1_outcome_check CHECK ((outcome = ANY (ARRAY['used'::text, 'helpful'::text, 'rejected'::text])))
);
alter table public.whatsapp_ana_reviews_v1 enable row level security;

-- table: whatsapp_channel_runtime_v1
create table if not exists public.whatsapp_channel_runtime_v1 (
  whatsapp_account_id uuid not null,
  inbound_provider text default 'papoai'::text not null,
  outbound_provider text default 'papoai'::text not null,
  capture_enabled boolean default true not null,
  send_enabled boolean default true not null,
  ana_enabled boolean default false not null,
  campaigns_enabled boolean default false not null,
  human_send_enabled boolean default false not null,
  homologated_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_channel_runtime_v1_pkey PRIMARY KEY (whatsapp_account_id),
  constraint whatsapp_channel_runtime_v1_inbound_provider_check CHECK ((inbound_provider = ANY (ARRAY['papoai'::text, 'meta'::text]))),
  constraint whatsapp_channel_runtime_v1_outbound_provider_check CHECK ((outbound_provider = ANY (ARRAY['papoai'::text, 'meta'::text, 'disabled'::text])))
);
alter table public.whatsapp_channel_runtime_v1 enable row level security;

-- table: whatsapp_conversation_favorites_v1
create table if not exists public.whatsapp_conversation_favorites_v1 (
  admin_user_id uuid not null,
  conversation_id uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_conversation_favorites_v1_pkey PRIMARY KEY (admin_user_id, conversation_id)
);
alter table public.whatsapp_conversation_favorites_v1 enable row level security;

-- table: whatsapp_conversation_order_overrides_v1
create table if not exists public.whatsapp_conversation_order_overrides_v1 (
  admin_user_id uuid not null,
  conversation_id uuid not null,
  mode text not null,
  updated_at timestamp with time zone default now() not null,
  constraint whatsapp_conversation_order_overrides_v1_pkey PRIMARY KEY (admin_user_id, conversation_id),
  constraint whatsapp_conversation_order_overrides_v1_mode_check CHECK ((mode = ANY (ARRAY['include'::text, 'exclude'::text])))
);
alter table public.whatsapp_conversation_order_overrides_v1 enable row level security;

-- table: whatsapp_flow_sessions
create table if not exists public.whatsapp_flow_sessions (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  channel text not null,
  basket_id text not null,
  catalog_commit text not null,
  catalog_revision text not null,
  phone_e164 text not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint whatsapp_flow_sessions_token_hash_key UNIQUE (token_hash),
  constraint whatsapp_flow_sessions_pkey PRIMARY KEY (id),
  constraint whatsapp_flow_sessions_basket_id_check CHECK (((length(basket_id) >= 1) AND (length(basket_id) <= 80))),
  constraint whatsapp_flow_sessions_catalog_commit_check CHECK ((catalog_commit ~ '^[0-9a-f]{40}$'::text)),
  constraint whatsapp_flow_sessions_catalog_revision_check CHECK ((catalog_revision ~ '^[0-9a-f]{40}:[0-9a-f]{40}$'::text)),
  constraint whatsapp_flow_sessions_channel_check CHECK ((channel = ANY (ARRAY['0975'::text, '1018'::text]))),
  constraint whatsapp_flow_sessions_phone_e164_check CHECK ((phone_e164 ~ '^\+[1-9][0-9]{1,14}$'::text)),
  constraint whatsapp_flow_sessions_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);
alter table public.whatsapp_flow_sessions enable row level security;
comment on table public.whatsapp_flow_sessions is 'Short-lived server-side WhatsApp Flow sessions. The opaque flow token is stored only as SHA-256.';

-- table: whatsapp_media_v1
create table if not exists public.whatsapp_media_v1 (
  id uuid default gen_random_uuid() not null,
  message_id uuid not null,
  provider_media_id text,
  media_type text not null,
  mime_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  sha256 text,
  transcription text,
  transcription_status text default 'not_requested'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_media_message_provider_uidx UNIQUE (message_id, provider_media_id),
  constraint whatsapp_media_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_media_v1_media_type_check CHECK ((media_type = ANY (ARRAY['audio'::text, 'image'::text, 'document'::text, 'video'::text, 'sticker'::text, 'unknown'::text]))),
  constraint whatsapp_media_v1_transcription_status_check CHECK ((transcription_status = ANY (ARRAY['not_requested'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);
alter table public.whatsapp_media_v1 enable row level security;

-- table: whatsapp_message_status_events_v1
create table if not exists public.whatsapp_message_status_events_v1 (
  id uuid default gen_random_uuid() not null,
  message_id uuid not null,
  provider text not null,
  provider_message_id text,
  status text not null,
  occurred_at timestamp with time zone default now() not null,
  received_at timestamp with time zone default now() not null,
  error_code text,
  error_title text,
  error_detail text,
  payload jsonb default '{}'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_message_status_events_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_message_status_events_v1_provider_check CHECK ((provider = ANY (ARRAY['papoai'::text, 'meta'::text]))),
  constraint whatsapp_message_status_events_v1_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'cancelled'::text, 'received'::text])))
);
alter table public.whatsapp_message_status_events_v1 enable row level security;

-- table: whatsapp_messages_v1
create table if not exists public.whatsapp_messages_v1 (
  id uuid default gen_random_uuid() not null,
  conversation_id uuid not null,
  whatsapp_account_id uuid not null,
  customer_id uuid,
  direction text not null,
  message_type text default 'unknown'::text not null,
  provider text not null,
  provider_message_id text,
  provider_conversation_id text,
  reply_to_message_id uuid,
  text_body text,
  status_current text default 'queued'::text not null,
  sender_kind text not null,
  sender_ref text,
  sent_at timestamp with time zone,
  received_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_messages_provider_message_uidx UNIQUE (whatsapp_account_id, provider, provider_message_id),
  constraint whatsapp_messages_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_messages_v1_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
  constraint whatsapp_messages_v1_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'audio'::text, 'image'::text, 'video'::text, 'document'::text, 'location'::text, 'interactive'::text, 'button'::text, 'template'::text, 'reaction'::text, 'system'::text, 'unknown'::text]))),
  constraint whatsapp_messages_v1_provider_check CHECK ((provider = ANY (ARRAY['papoai'::text, 'meta'::text]))),
  constraint whatsapp_messages_v1_sender_kind_check CHECK ((sender_kind = ANY (ARRAY['customer'::text, 'ana_rule'::text, 'ana_ai'::text, 'human'::text, 'automation'::text, 'campaign'::text, 'system'::text, 'unknown'::text]))),
  constraint whatsapp_messages_v1_status_current_check CHECK ((status_current = ANY (ARRAY['queued'::text, 'sending'::text, 'accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'cancelled'::text, 'received'::text])))
);
alter table public.whatsapp_messages_v1 enable row level security;

-- table: whatsapp_outbox_v1
create table if not exists public.whatsapp_outbox_v1 (
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  whatsapp_account_id uuid not null,
  conversation_id uuid,
  customer_id uuid,
  to_phone_e164 text not null,
  message_id uuid,
  purpose text not null,
  message_type text not null,
  template_id uuid,
  payload jsonb default '{}'::jsonb not null,
  provider text not null,
  status text default 'queued'::text not null,
  attempt_count integer default 0 not null,
  available_at timestamp with time zone default now() not null,
  claimed_at timestamp with time zone,
  sent_at timestamp with time zone,
  provider_message_id text,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_outbox_v1_idempotency_key_key UNIQUE (idempotency_key),
  constraint whatsapp_outbox_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_outbox_v1_attempt_count_check CHECK ((attempt_count >= 0)),
  constraint whatsapp_outbox_v1_provider_check CHECK ((provider = ANY (ARRAY['papoai'::text, 'meta'::text]))),
  constraint whatsapp_outbox_v1_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'claimed'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);
alter table public.whatsapp_outbox_v1 enable row level security;

-- table: whatsapp_papoai_guard_v1
create table if not exists public.whatsapp_papoai_guard_v1 (
  id integer not null,
  active_until timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  last_activated_at timestamp with time zone,
  last_deactivated_at timestamp with time zone,
  constraint whatsapp_papoai_guard_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_papoai_guard_v1_id_check CHECK ((id = 1))
);
alter table public.whatsapp_papoai_guard_v1 enable row level security;

-- table: whatsapp_papoai_status_queue_v1
create table if not exists public.whatsapp_papoai_status_queue_v1 (
  id bigint generated always as identity not null,
  payload_hash text not null,
  payload jsonb not null,
  received_at timestamp with time zone default now() not null,
  next_attempt_at timestamp with time zone default now() not null,
  attempts integer default 0 not null,
  processed_at timestamp with time zone,
  last_error text,
  needs_review boolean default false not null,
  constraint whatsapp_papoai_status_queue_v1_payload_hash_key UNIQUE (payload_hash),
  constraint whatsapp_papoai_status_queue_v1_pkey PRIMARY KEY (id)
);
alter table public.whatsapp_papoai_status_queue_v1 enable row level security;

-- table: whatsapp_template_events_v1
create table if not exists public.whatsapp_template_events_v1 (
  id uuid default gen_random_uuid() not null,
  waba_id text not null,
  whatsapp_account_id uuid,
  meta_template_id text,
  template_name text,
  language text,
  event_type text not null,
  status text,
  quality_rating text,
  reason text,
  provider_event_key text not null,
  payload jsonb default '{}'::jsonb not null,
  occurred_at timestamp with time zone,
  received_at timestamp with time zone default now() not null,
  constraint whatsapp_template_events_v1_provider_event_key_key UNIQUE (provider_event_key),
  constraint whatsapp_template_events_v1_pkey PRIMARY KEY (id)
);
alter table public.whatsapp_template_events_v1 enable row level security;

-- table: whatsapp_templates_v1
create table if not exists public.whatsapp_templates_v1 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid,
  waba_id text not null,
  meta_template_id text,
  name text not null,
  language text not null,
  category text,
  status text default 'LOCAL_DRAFT'::text not null,
  components jsonb default '[]'::jsonb not null,
  quality_rating text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_templates_name_language_uidx UNIQUE (waba_id, name, language),
  constraint whatsapp_templates_v1_pkey PRIMARY KEY (id)
);
alter table public.whatsapp_templates_v1 enable row level security;

-- table: whatsapp_webhook_events_v1
create table if not exists public.whatsapp_webhook_events_v1 (
  id uuid default gen_random_uuid() not null,
  whatsapp_account_id uuid not null,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  provider_message_id text,
  phone_e164 text,
  received_at timestamp with time zone default now() not null,
  payload_hash text not null,
  payload jsonb default '{}'::jsonb not null,
  status text default 'received'::text not null,
  processed_at timestamp with time zone,
  last_error text,
  metadata jsonb default '{}'::jsonb not null,
  constraint whatsapp_webhook_events_provider_event_uidx UNIQUE (provider, whatsapp_account_id, provider_event_id),
  constraint whatsapp_webhook_events_v1_pkey PRIMARY KEY (id),
  constraint whatsapp_webhook_events_v1_provider_check CHECK ((provider = ANY (ARRAY['papoai'::text, 'meta'::text]))),
  constraint whatsapp_webhook_events_v1_status_check CHECK ((status = ANY (ARRAY['received'::text, 'normalized'::text, 'ignored'::text, 'review_required'::text, 'failed'::text])))
);
alter table public.whatsapp_webhook_events_v1 enable row level security;
