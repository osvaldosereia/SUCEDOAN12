-- Private durable workspace for independent Flow and native Catalog order intents.
-- No raw Meta payloads or unverified Catalog prices are stored here.

create schema whatsapp_ordering_private;
revoke all on schema whatsapp_ordering_private from public, anon, authenticated;
grant usage on schema whatsapp_ordering_private to service_role;

-- The legacy public Flow-session fields catalog_commit/catalog_revision point
-- to GitHub-backed catalog artifacts. Greenfield sessions use their own
-- content-addressed Supabase snapshot and never overload that legacy contract.
create table whatsapp_ordering_private.flow_catalog_snapshots_v1 (
  snapshot_hash text primary key
    check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  schema_version text not null
    check (length(btrim(schema_version)) between 1 and 64),
  basket_template_id uuid not null
    references public.basket_templates(id) on delete restrict,
  basket_mold_id uuid not null
    references public.basket_molds(id) on delete restrict,
  snapshot_json jsonb not null
    check (jsonb_typeof(snapshot_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint flow_catalog_snapshot_size_check
    check (pg_column_size(snapshot_json) <= 262144),
  constraint flow_catalog_snapshot_scope_key
    unique (snapshot_hash, basket_template_id, basket_mold_id)
);

create table whatsapp_ordering_private.whatsapp_flow_sessions_v2 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete restrict,
  meta_waba_id text not null
    check (length(btrim(meta_waba_id)) between 1 and 128),
  meta_phone_number_id text not null
    check (length(btrim(meta_phone_number_id)) between 1 and 128),
  meta_flow_id text not null
    check (length(btrim(meta_flow_id)) between 1 and 128),
  flow_schema_version text not null
    check (length(btrim(flow_schema_version)) between 1 and 32),
  data_api_version text not null
    check (length(btrim(data_api_version)) between 1 and 32),
  basket_template_id uuid not null
    references public.basket_templates(id) on delete restrict,
  basket_mold_id uuid not null
    references public.basket_molds(id) on delete restrict,
  snapshot_hash text not null
    check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  sender_phone_e164 text not null
    check (sender_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  conversation_id uuid
    references public.conversations(id) on delete set null,
  customer_id uuid
    references public.customers(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_flow_sessions_v2_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint whatsapp_flow_sessions_v2_snapshot_scope_check
    foreign key (snapshot_hash, basket_template_id, basket_mold_id)
    references whatsapp_ordering_private.flow_catalog_snapshots_v1(
      snapshot_hash, basket_template_id, basket_mold_id
    ) on delete restrict
);

-- Each Flow endpoint URI selects a business line, and each line must use only
-- the private key whose public counterpart Meta has verified for that line.
-- The historical 1018 Vault name is recorded as an unverified candidate only.
create table whatsapp_ordering_private.whatsapp_flow_keyring_v1 (
  whatsapp_account_id uuid primary key
    references public.whatsapp_accounts(id) on delete restrict,
  meta_phone_number_id text not null unique
    check (length(btrim(meta_phone_number_id)) between 1 and 128),
  vault_secret_name text not null unique
    check (vault_secret_name ~ '^[a-z0-9_]{1,120}$'),
  key_status text not null default 'pending_key_provisioning'
    check (key_status in ('pending_key_provisioning','pending_meta_verification','ready','disabled')),
  private_key_sha256 text
    check (private_key_sha256 is null or private_key_sha256 ~ '^[0-9a-f]{64}$'),
  meta_public_key_fingerprint text
    check (meta_public_key_fingerprint is null or meta_public_key_fingerprint ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint whatsapp_flow_keyring_ready_check
    check (key_status <> 'ready' or (
      private_key_sha256 is not null
      and meta_public_key_fingerprint is not null
      and verified_at is not null
    ))
);

alter table whatsapp_ordering_private.whatsapp_flow_keyring_v1 enable row level security;
revoke all on table whatsapp_ordering_private.whatsapp_flow_keyring_v1 from public, anon, authenticated;
grant select, insert, update on table whatsapp_ordering_private.whatsapp_flow_keyring_v1 to service_role;

insert into whatsapp_ordering_private.whatsapp_flow_keyring_v1 (
  whatsapp_account_id, meta_phone_number_id, vault_secret_name, key_status
)
select a.id, a.phone_number_id,
  case a.slug
    when 'dona-antonia-1018' then 'dona_antonia_whatsapp_flow_private_key_v1'
    when 'dona-antonia-0975' then 'dona_antonia_whatsapp_flow_private_key_0975_v1'
  end,
  case a.slug
    when 'dona-antonia-1018' then 'pending_meta_verification'
    when 'dona-antonia-0975' then 'pending_key_provisioning'
  end
from public.whatsapp_accounts a
where a.slug in ('dona-antonia-1018','dona-antonia-0975')
on conflict (whatsapp_account_id) do nothing;

comment on table whatsapp_ordering_private.whatsapp_flow_keyring_v1 is
  'Private per-line key map. The historical 1018 Vault key is only a candidate; state stays non-ready until its Meta public-key registration is read back and verified.';

create index whatsapp_flow_sessions_v2_account_phone_expiry_idx
  on whatsapp_ordering_private.whatsapp_flow_sessions_v2
    (whatsapp_account_id, sender_phone_e164, expires_at desc)
  where revoked_at is null;

-- Order Flow bindings are separate from the legacy registration_flow-only
-- table. A technical session cannot be opened unless its WABA has one active,
-- verified, published, send-enabled order Flow.
create table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete restrict,
  meta_flow_id text not null
    check (meta_flow_id ~ '^[0-9]{6,32}$'),
  flow_json_version text not null
    check (length(btrim(flow_json_version)) between 1 and 16),
  data_api_version text not null
    check (length(btrim(data_api_version)) between 1 and 32),
  flow_message_version text not null
    check (length(btrim(flow_message_version)) between 1 and 8),
  flow_action text not null default 'data_exchange'
    check (flow_action = 'data_exchange'),
  flow_status text not null
    check (length(btrim(flow_status)) between 1 and 32),
  flow_cta text not null
    check (length(btrim(flow_cta)) between 1 and 20),
  body_text text not null
    check (length(btrim(body_text)) between 1 and 1024),
  is_verified boolean not null default false,
  is_send_enabled boolean not null default false,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_order_flow_binding_send_gate_check
    check (
      not is_send_enabled
      or (
        is_verified
        and upper(flow_status) = 'PUBLISHED'
        and verified_at is not null
      )
    ),
  constraint whatsapp_order_flow_binding_account_flow_key
    unique (whatsapp_account_id, meta_flow_id, flow_json_version)
);

create unique index whatsapp_order_flow_binding_one_enabled_revision_per_flow_uidx
  on whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 (whatsapp_account_id, meta_flow_id)
  where is_send_enabled;

create table whatsapp_ordering_private.whatsapp_order_intents_v1 (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null unique
    references public.whatsapp_webhook_events_v1(id) on delete restrict,
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete restrict,
  meta_waba_id text not null
    check (length(btrim(meta_waba_id)) between 1 and 128),
  conversation_id uuid
    references public.conversations(id) on delete set null,
  customer_id uuid
    references public.customers(id) on delete set null,
  source_kind text not null
    check (source_kind in ('flow', 'catalog')),
  meta_message_id text not null
    check (length(btrim(meta_message_id)) between 1 and 256),
  meta_phone_number_id text not null
    check (length(btrim(meta_phone_number_id)) between 1 and 128),
  sender_provider_id text,
  sender_phone_e164 text
    check (sender_phone_e164 is null or sender_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  catalog_id text,
  flow_session_id uuid
    references whatsapp_ordering_private.whatsapp_flow_sessions_v2(id) on delete set null,
  flow_reply_to_message_id text,
  flow_name text,
  flow_schema_version text,
  status text not null default 'received'
    check (status in (
      'received',
      'needs_review',
      'awaiting_confirmation',
      'reprice_required',
      'declined',
      'converted'
    )),
  quote_revision integer not null default 0 check (quote_revision >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  quote_total_cents bigint check (quote_total_cents is null or quote_total_cents >= 0),
  intake_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(intake_snapshot) = 'object'),
  quote_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  delivery_snapshot jsonb not null default '{}'::jsonb,
  payment_method text,
  summary_hash text,
  confirmation_token_hash text,
  confirmation_message_id text,
  confirmation_event_id uuid unique
    references public.whatsapp_webhook_events_v1(id) on delete restrict,
  confirmed_order_id uuid unique
    references public.orders(id) on delete restrict,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quoted_at timestamptz,
  confirmed_at timestamptz,
  converted_at timestamptz,
  constraint whatsapp_order_intents_identity_check
    check (sender_phone_e164 is not null or nullif(btrim(sender_provider_id), '') is not null),
  constraint whatsapp_order_intents_catalog_fields_check
    check (
      (source_kind = 'catalog' and (status = 'needs_review' or nullif(btrim(catalog_id), '') is not null))
      or
      (source_kind = 'flow' and catalog_id is null)
    ),
  constraint whatsapp_order_intents_conversion_state_check
    check (
      (status = 'converted' and confirmed_order_id is not null and converted_at is not null)
      or
      (status <> 'converted' and confirmed_order_id is null and converted_at is null)
    )
);

create unique index whatsapp_order_intents_account_message_uidx
  on whatsapp_ordering_private.whatsapp_order_intents_v1 (whatsapp_account_id, meta_message_id);

create unique index whatsapp_order_intents_confirmation_message_uidx
  on whatsapp_ordering_private.whatsapp_order_intents_v1 (whatsapp_account_id, confirmation_message_id)
  where confirmation_message_id is not null;

create unique index whatsapp_order_intents_confirmation_token_uidx
  on whatsapp_ordering_private.whatsapp_order_intents_v1 (confirmation_token_hash)
  where confirmation_token_hash is not null;

create index whatsapp_order_intents_status_created_idx
  on whatsapp_ordering_private.whatsapp_order_intents_v1 (status, created_at desc);

create index whatsapp_order_intents_conversation_created_idx
  on whatsapp_ordering_private.whatsapp_order_intents_v1 (whatsapp_account_id, conversation_id, created_at desc)
  where conversation_id is not null;

create table whatsapp_ordering_private.meta_catalog_product_links_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete restrict,
  catalog_id text not null check (length(btrim(catalog_id)) between 1 and 256),
  product_retailer_id text not null
    check (length(btrim(product_retailer_id)) between 1 and 256),
  product_id uuid not null
    references public.products(id) on delete restrict,
  status text not null default 'needs_review'
    check (status in ('active', 'inactive', 'needs_review')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_catalog_product_links_account_catalog_retailer_key
    unique (whatsapp_account_id, catalog_id, product_retailer_id),
  constraint meta_catalog_product_links_active_verified_check
    check (status <> 'active' or verified_at is not null)
);

create index meta_catalog_product_links_product_idx
  on whatsapp_ordering_private.meta_catalog_product_links_v1 (product_id);

-- Build an authoritative, private quote from exact verified catalog mappings.
-- Meta-reported item_price is deliberately not an input to this function.
create function whatsapp_ordering_private.catalog_quote_v1(
  p_whatsapp_account_id uuid,
  p_catalog_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item record;
  v_product record;
  v_quantity numeric;
  v_unit_price numeric;
  v_unit_price_cents numeric;
  v_line_total_cents numeric;
  v_total_cents numeric := 0;
  v_quote_items jsonb := '[]'::jsonb;
  v_quote jsonb;
begin
  if p_whatsapp_account_id is null
    or nullif(btrim(p_catalog_id), '') is null
    or length(btrim(p_catalog_id)) > 256 then
    return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_scope_invalid');
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(case
      when jsonb_typeof(p_items) = 'array' then p_items
      else '[]'::jsonb
    end) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_items_invalid');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    group by item.value ->> 'retailer_id'
    having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_duplicate_retailer_id');
  end if;

  for v_item in
    select item.value, item.ordinality
    from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    if jsonb_typeof(v_item.value) is distinct from 'object'
      or nullif(btrim(v_item.value ->> 'retailer_id'), '') is null
      or length(btrim(v_item.value ->> 'retailer_id')) > 256
      or coalesce(v_item.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,15}$' then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_item_invalid');
    end if;

    v_quantity := (v_item.value ->> 'quantity')::numeric;
    if v_quantity > 9007199254740991 then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_quantity_out_of_range');
    end if;

    select
      link.id as mapping_id,
      product.id as product_id,
      product.sku,
      product.name,
      product.image_url,
      case
        when product.is_offer is true and product.offer_price is not null then product.offer_price
        else product.price
      end as current_unit_price
    into v_product
    from whatsapp_ordering_private.meta_catalog_product_links_v1 link
    join public.products product on product.id = link.product_id
    where link.whatsapp_account_id = p_whatsapp_account_id
      and link.catalog_id = btrim(p_catalog_id)
      and link.product_retailer_id = btrim(v_item.value ->> 'retailer_id')
      and link.status = 'active'
      and product.is_active is true
      and product.is_whatsapp_active is true
    for share of link, product;

    if not found then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_product_mapping_unresolved');
    end if;

    v_unit_price := v_product.current_unit_price;
    if v_unit_price is null or v_unit_price < 0 then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_product_price_unavailable');
    end if;

    v_unit_price_cents := round(v_unit_price * 100);
    v_line_total_cents := v_unit_price_cents * v_quantity;
    if v_unit_price_cents < 0
      or v_line_total_cents < 0
      or v_line_total_cents > 999999999999
      or v_total_cents + v_line_total_cents > 999999999999 then
      return jsonb_build_object('ok', false, 'issue_code', 'catalog_quote_total_out_of_range');
    end if;

    v_total_cents := v_total_cents + v_line_total_cents;
    v_quote_items := v_quote_items || jsonb_build_array(jsonb_build_object(
      'retailer_id', btrim(v_item.value ->> 'retailer_id'),
      'mapping_id', v_product.mapping_id,
      'product_id', v_product.product_id,
      'sku', v_product.sku,
      'name', v_product.name,
      'image_url', coalesce(v_product.image_url, ''),
      'quantity', v_quantity,
      'unit_price_cents', v_unit_price_cents,
      'line_total_cents', v_line_total_cents
    ));
  end loop;

  v_quote := jsonb_build_object(
    'schema_version', 'sucedoan.whatsapp_catalog_quote.v1',
    'whatsapp_account_id', p_whatsapp_account_id,
    'catalog_id', btrim(p_catalog_id),
    'currency', 'BRL',
    'calculated_at', clock_timestamp(),
    'items', v_quote_items,
    'items_total_cents', v_total_cents,
    'total_cents', v_total_cents
  );

  return jsonb_build_object('ok', true, 'quote', v_quote);
end;
$function$;

revoke all on function whatsapp_ordering_private.catalog_quote_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function whatsapp_ordering_private.catalog_quote_v1(uuid, text, jsonb)
  to service_role;

alter table whatsapp_ordering_private.whatsapp_order_intents_v1 enable row level security;
alter table whatsapp_ordering_private.meta_catalog_product_links_v1 enable row level security;
alter table whatsapp_ordering_private.flow_catalog_snapshots_v1 enable row level security;
alter table whatsapp_ordering_private.whatsapp_flow_sessions_v2 enable row level security;
alter table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 enable row level security;

revoke all on table whatsapp_ordering_private.whatsapp_order_intents_v1 from public, anon, authenticated;
revoke all on table whatsapp_ordering_private.meta_catalog_product_links_v1 from public, anon, authenticated;
revoke all on table whatsapp_ordering_private.flow_catalog_snapshots_v1 from public, anon, authenticated;
revoke all on table whatsapp_ordering_private.whatsapp_flow_sessions_v2 from public, anon, authenticated;
revoke all on table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 from public, anon, authenticated;

grant select, insert, update on table whatsapp_ordering_private.whatsapp_order_intents_v1 to service_role;
grant select, insert, update on table whatsapp_ordering_private.meta_catalog_product_links_v1 to service_role;
grant select, insert on table whatsapp_ordering_private.flow_catalog_snapshots_v1 to service_role;
grant select, insert on table whatsapp_ordering_private.whatsapp_flow_sessions_v2 to service_role;
grant update (revoked_at) on table whatsapp_ordering_private.whatsapp_flow_sessions_v2 to service_role;
grant select, insert, update on table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 to service_role;

comment on table whatsapp_ordering_private.whatsapp_order_intents_v1 is
  'Private, non-expiring business intents for individual WhatsApp Flow submissions and Meta Catalog carts. Does not create canonical orders until explicit confirmation.';
comment on table whatsapp_ordering_private.meta_catalog_product_links_v1 is
  'Verified mapping from a specific WhatsApp account/catalog retailer ID to one canonical Supabase product. Webhook item_price is never authoritative.';
comment on table whatsapp_ordering_private.flow_catalog_snapshots_v1 is
  'Immutable content-addressed projection of canonical Supabase basket configuration for one Flow revision. Never stores product cost or secrets.';
comment on table whatsapp_ordering_private.whatsapp_flow_sessions_v2 is
  'Versioned private Flow session for the greenfield Supabase snapshot contract; separate from the legacy Git-backed public.whatsapp_flow_sessions table.';
comment on table whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 is
  'Versioned order Flow bindings per Meta sender. Multiple published basket Flows may be enabled for one sender, with one enabled revision per Meta Flow ID. Separate from the legacy registration_flow binding; sending is gated on verified and explicitly enabled state. Stores no private encryption key.';

create function public.whatsapp_flow_session_open_v1(
  p_whatsapp_account_id uuid,
  p_meta_waba_id text,
  p_meta_phone_number_id text,
  p_meta_flow_id text,
  p_flow_schema_version text,
  p_basket_template_id uuid,
  p_basket_mold_id uuid,
  p_sender_phone_e164 text,
  p_token_hash text,
  p_snapshot jsonb,
  p_conversation_id uuid default null,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_snapshot_hash text;
  v_session_id uuid;
  v_expires_at timestamptz;
  v_data_api_version text;
  v_slot jsonb;
  v_option jsonb;
begin
  if p_whatsapp_account_id is null
    or nullif(btrim(p_meta_waba_id), '') is null
    or nullif(btrim(p_meta_phone_number_id), '') is null
    or nullif(btrim(p_meta_flow_id), '') is null
    or nullif(btrim(p_flow_schema_version), '') is null
    or p_basket_template_id is null
    or p_basket_mold_id is null
    or p_sender_phone_e164 is null
    or p_sender_phone_e164 !~ '^[+][1-9][0-9]{7,14}$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or length(p_flow_schema_version) > 32
    or p_snapshot is null
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or pg_column_size(p_snapshot) > 262144
    or p_snapshot ->> 'schema_version' is distinct from 'sucedoan.whatsapp_flow_catalog.v1'
    or p_snapshot ->> 'basket_template_id' is distinct from p_basket_template_id::text
    or p_snapshot ->> 'basket_mold_id' is distinct from p_basket_mold_id::text
    or coalesce(p_snapshot ->> 'hidden_adjustment_cents', '') !~ '^-?(0|[1-9][0-9]{0,8})$'
    or coalesce(p_snapshot ->> 'conditional_hidden_adjustment_cents', '') !~ '^-?(0|[1-9][0-9]{0,8})$'
    or coalesce(p_snapshot ->> 'conditional_hidden_enabled', '') not in ('true', 'false')
    or jsonb_typeof(p_snapshot -> 'positions') is distinct from 'array' then
    raise exception 'whatsapp_flow_session_open_invalid' using errcode = '22023';
  end if;

  if jsonb_array_length(p_snapshot -> 'positions') = 0 then
    raise exception 'whatsapp_flow_snapshot_positions_empty' using errcode = '22023';
  end if;

  for v_slot in
    select item.value
    from jsonb_array_elements(p_snapshot -> 'positions') as item(value)
  loop
    if jsonb_typeof(v_slot) is distinct from 'object'
      or coalesce(v_slot ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_slot -> 'options') is distinct from 'array' then
      raise exception 'whatsapp_flow_snapshot_slot_invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(v_slot -> 'options') = 0
      or jsonb_array_length(v_slot -> 'options') > 8 then
      raise exception 'whatsapp_flow_snapshot_slot_invalid' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_slot -> 'options') choice_option(value)
      group by choice_option.value ->> 'product_id'
      having count(*) > 1
    ) or jsonb_array_length(v_slot -> 'options') <> (
      select count(*)
      from public.basket_mold_position_options po
      join public.products p on p.id = po.product_id
      where po.position_id::text = lower(v_slot ->> 'id')
        and p.is_active
        and p.is_whatsapp_active
    ) then
      raise exception 'whatsapp_flow_snapshot_options_incomplete' using errcode = '22023';
    end if;

    for v_option in
      select item.value
      from jsonb_array_elements(v_slot -> 'options') as item(value)
    loop
      if jsonb_typeof(v_option) is distinct from 'object'
        or coalesce(v_option ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'whatsapp_flow_snapshot_option_invalid' using errcode = '22023';
      end if;
      if nullif(btrim(v_option ->> 'name'), '') is null
        or coalesce(v_option ->> 'image_url', '') !~* '^https://[^[:space:]]{1,2048}$'
        or coalesce(v_option ->> 'price_cents', '') !~ '^(0|[1-9][0-9]{0,8})$' then
        raise exception 'whatsapp_flow_snapshot_option_invalid' using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.basket_mold_position_options po
        join public.products p on p.id = po.product_id
        where po.position_id::text = lower(v_slot ->> 'id')
          and po.product_id::text = lower(v_option ->> 'product_id')
          and p.is_active
          and p.is_whatsapp_active
          and p.name = v_option ->> 'name'
          and p.image_url = v_option ->> 'image_url'
          and (case
            when p.is_offer = true and p.offer_price is not null and p.offer_price >= 0
              then p.offer_price
            else p.price
          end) * 100 = (v_option ->> 'price_cents')::numeric
      ) then
        raise exception 'whatsapp_flow_snapshot_product_not_offered' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if p_conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.whatsapp_account_id = p_whatsapp_account_id or c.channel_account_id = p_whatsapp_account_id)
      and c.wa_contact_e164 = p_sender_phone_e164
  ) then
    raise exception 'whatsapp_flow_session_open_conversation_mismatch' using errcode = '22023';
  end if;

  if p_customer_id is not null and not (
    (p_conversation_id is not null and exists (
      select 1 from public.conversations c
      where c.id = p_conversation_id and c.customer_id = p_customer_id
    ))
    or exists (
      select 1
      from public.customers c
      join public.customer_ids_by_phone_variants_v1(p_sender_phone_e164) matched_customer
        on matched_customer.customer_id = c.id
      where c.id = p_customer_id and c.is_active
    )
  ) then
    raise exception 'whatsapp_flow_session_open_customer_mismatch' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.whatsapp_accounts a
    where a.id = p_whatsapp_account_id
      and a.is_active
      and a.phone_number_id = p_meta_phone_number_id
      and a.waba_id = p_meta_waba_id
  ) then
    raise exception 'whatsapp_flow_session_open_account_mismatch' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.basket_templates b
    join public.basket_molds m on m.basket_id = b.id
    where b.id = p_basket_template_id
      and m.id = p_basket_mold_id
      and b.is_active
      and b.is_whatsapp_active
  ) then
    raise exception 'whatsapp_flow_session_open_basket_unavailable' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.basket_molds m
    where m.id = p_basket_mold_id
      and round(coalesce(m.hidden_adjustment, 0) * 100)::bigint = (p_snapshot ->> 'hidden_adjustment_cents')::bigint
      and round(coalesce(m.conditional_hidden_adjustment, 0) * 100)::bigint = (p_snapshot ->> 'conditional_hidden_adjustment_cents')::bigint
      and coalesce(m.conditional_hidden_enabled, false)::text = (p_snapshot ->> 'conditional_hidden_enabled')
      and m.conditional_hidden_product_id::text is not distinct from (p_snapshot ->> 'conditional_hidden_product_id')
  ) then
    raise exception 'whatsapp_flow_snapshot_pricing_mismatch' using errcode = '22023';
  end if;

  select binding.data_api_version into v_data_api_version
  from whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 binding
  where binding.whatsapp_account_id = p_whatsapp_account_id
    and binding.meta_flow_id = p_meta_flow_id
    and binding.flow_json_version = p_flow_schema_version
    and binding.flow_action = 'data_exchange'
    and upper(binding.flow_status) = 'PUBLISHED'
    and binding.is_verified
    and binding.is_send_enabled
    and binding.verified_at is not null
  for share;
  if v_data_api_version is null then
    raise exception 'whatsapp_flow_session_open_binding_unverified' using errcode = '22023';
  end if;

  if jsonb_array_length(p_snapshot -> 'positions') <> (
    select count(*)
    from public.basket_mold_positions pos
    where pos.mold_id = p_basket_mold_id
  ) or exists (
    select 1
    from jsonb_array_elements(p_snapshot -> 'positions') slot(value)
    group by slot.value ->> 'id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_snapshot -> 'positions') slot(value)
    where not exists (
      select 1
      from public.basket_mold_positions pos
      where pos.id::text = lower(slot.value ->> 'id')
        and pos.mold_id = p_basket_mold_id
        and pos.label = slot.value ->> 'label'
    )
  ) then
    raise exception 'whatsapp_flow_snapshot_positions_mismatch' using errcode = '22023';
  end if;

  v_snapshot_hash := encode(
    extensions.digest(convert_to(p_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into whatsapp_ordering_private.flow_catalog_snapshots_v1 (
    snapshot_hash,
    schema_version,
    basket_template_id,
    basket_mold_id,
    snapshot_json
  ) values (
    v_snapshot_hash,
    'sucedoan.whatsapp_flow_catalog.v1',
    p_basket_template_id,
    p_basket_mold_id,
    p_snapshot
  ) on conflict (snapshot_hash) do nothing;

  if not exists (
    select 1
    from whatsapp_ordering_private.flow_catalog_snapshots_v1 s
    where s.snapshot_hash = v_snapshot_hash
      and s.schema_version = 'sucedoan.whatsapp_flow_catalog.v1'
      and s.basket_template_id = p_basket_template_id
      and s.basket_mold_id = p_basket_mold_id
      and s.snapshot_json = p_snapshot
  ) then
    raise exception 'whatsapp_flow_snapshot_hash_conflict' using errcode = '23505';
  end if;

  -- Session tokens are technical credentials. The accepted commercial intent
  -- is stored separately and has no expiry.
  v_expires_at := now() + interval '24 hours';
  insert into whatsapp_ordering_private.whatsapp_flow_sessions_v2 (
    whatsapp_account_id,
    meta_waba_id,
    meta_phone_number_id,
    meta_flow_id,
    flow_schema_version,
    data_api_version,
    basket_template_id,
    basket_mold_id,
    snapshot_hash,
    token_hash,
    sender_phone_e164,
    conversation_id,
    customer_id,
    expires_at
  ) values (
    p_whatsapp_account_id,
    btrim(p_meta_waba_id),
    btrim(p_meta_phone_number_id),
    btrim(p_meta_flow_id),
    btrim(p_flow_schema_version),
    v_data_api_version,
    p_basket_template_id,
    p_basket_mold_id,
    v_snapshot_hash,
    p_token_hash,
    p_sender_phone_e164,
    p_conversation_id,
    p_customer_id,
    v_expires_at
  ) returning id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'snapshot_hash', v_snapshot_hash,
    'expires_at', v_expires_at
  );
end;
$function$;

create function public.whatsapp_flow_session_resolve_v1(p_token_hash text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', s.id,
      'whatsapp_account_id', s.whatsapp_account_id,
      'meta_waba_id', s.meta_waba_id,
      'meta_phone_number_id', s.meta_phone_number_id,
      'meta_flow_id', s.meta_flow_id,
      'flow_schema_version', s.flow_schema_version,
      'data_api_version', s.data_api_version,
      'basket_template_id', s.basket_template_id,
      'basket_mold_id', s.basket_mold_id,
      'snapshot_hash', s.snapshot_hash,
      'sender_phone_e164', s.sender_phone_e164,
      'conversation_id', s.conversation_id,
      'customer_id', s.customer_id,
      'expires_at', s.expires_at
    ),
    'snapshot', c.snapshot_json
  )
  from whatsapp_ordering_private.whatsapp_flow_sessions_v2 s
  join whatsapp_ordering_private.flow_catalog_snapshots_v1 c
    on c.snapshot_hash = s.snapshot_hash
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and p_token_hash ~ '^[0-9a-f]{64}$'
  limit 1
$function$;

create function public.whatsapp_flow_private_key_resolve_v1(p_account_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_account public.whatsapp_accounts%rowtype;
  v_keyring whatsapp_ordering_private.whatsapp_flow_keyring_v1%rowtype;
  v_private text;
begin
  select * into v_account
  from public.whatsapp_accounts a
  where a.slug = lower(btrim(coalesce(p_account_slug,'')))
    and a.is_active;
  if not found then
    return jsonb_build_object('ok',false,'reason','flow_account_unavailable');
  end if;

  select * into v_keyring
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  where k.whatsapp_account_id = v_account.id
    and k.meta_phone_number_id = v_account.phone_number_id;
  if not found or v_keyring.key_status <> 'ready' then
    return jsonb_build_object(
      'ok',false,
      'reason','flow_key_not_verified',
      'whatsapp_account_id',v_account.id,
      'meta_phone_number_id',v_account.phone_number_id
    );
  end if;

  select s.decrypted_secret into v_private
  from vault.decrypted_secrets s
  where s.name = v_keyring.vault_secret_name
  order by s.created_at desc
  limit 1;

  if v_private is null
     or encode(extensions.digest(v_private,'sha256'),'hex') is distinct from v_keyring.private_key_sha256
     or v_private not like '%-----BEGIN PRIVATE KEY-----%'
     or v_private not like '%-----END PRIVATE KEY-----%' then
    return jsonb_build_object('ok',false,'reason','flow_key_unavailable');
  end if;

  return jsonb_build_object(
    'ok',true,
    'whatsapp_account_id',v_account.id,
    'meta_waba_id',v_account.waba_id,
    'meta_phone_number_id',v_account.phone_number_id,
    'private_key_pkcs8',v_private
  );
end;
$function$;

create function public.whatsapp_flow_session_revoke_v1(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_revoked boolean;
begin
  update whatsapp_ordering_private.whatsapp_flow_sessions_v2 s
  set revoked_at = coalesce(s.revoked_at, now())
  where s.id = p_session_id
  returning true into v_revoked;
  return jsonb_build_object('ok', true, 'revoked', coalesce(v_revoked, false));
end;
$function$;

-- PostgREST cannot query the unexposed private schema directly. This narrow
-- SECURITY INVOKER entrypoint is the only ingress path for the server worker.
create function public.whatsapp_order_intent_ingest_v1(
  p_source_event_id uuid,
  p_whatsapp_account_id uuid,
  p_meta_waba_id text,
  p_meta_phone_number_id text,
  p_meta_message_id text,
  p_source_kind text,
  p_sender_provider_id text,
  p_sender_phone_e164 text,
  p_catalog_id text,
  p_flow_name text,
  p_flow_session_id uuid,
  p_flow_reply_to_message_id text,
  p_flow_schema_version text,
  p_intake_snapshot jsonb,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_ingress_issue_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_flow_snapshot jsonb;
  v_inserted boolean;
  v_initial_status text;
  v_error_code text;
  v_catalog_item jsonb;
  v_flow_item jsonb;
  v_has_positive_flow_item boolean := false;
  v_server_quote jsonb;
  v_catalog_quote_result jsonb;
  v_quote_total_cents bigint;
  v_quote_revision integer := 0;
begin
  if p_source_event_id is null
    or p_whatsapp_account_id is null
    or nullif(btrim(p_meta_waba_id), '') is null
    or nullif(btrim(p_meta_phone_number_id), '') is null
    or nullif(btrim(p_meta_message_id), '') is null
    or p_source_kind is null
    or p_source_kind not in ('flow', 'catalog') then
    raise exception 'whatsapp_order_intake_invalid_identity' using errcode = '22023';
  end if;

  if p_sender_phone_e164 is not null
    and p_sender_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'whatsapp_order_intake_invalid_phone' using errcode = '22023';
  end if;

  if p_sender_phone_e164 is null
    and nullif(btrim(p_sender_provider_id), '') is null then
    raise exception 'whatsapp_order_intake_missing_sender' using errcode = '22023';
  end if;

  if length(p_meta_message_id) > 256
    or length(p_meta_phone_number_id) > 128
    or length(p_meta_waba_id) > 128
    or coalesce(length(p_sender_provider_id), 0) > 256 then
    raise exception 'whatsapp_order_intake_field_too_long' using errcode = '22023';
  end if;

  if p_source_kind = 'catalog' and p_flow_session_id is not null then
    raise exception 'whatsapp_order_intake_catalog_scope_invalid' using errcode = '22023';
  end if;

  if p_source_kind = 'flow' and nullif(btrim(p_catalog_id), '') is not null then
    raise exception 'whatsapp_order_intake_flow_scope_invalid' using errcode = '22023';
  end if;

  if p_intake_snapshot is null
    or jsonb_typeof(p_intake_snapshot) <> 'object'
    or pg_column_size(p_intake_snapshot) > 65536 then
    raise exception 'whatsapp_order_intake_snapshot_invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.whatsapp_accounts a
    where a.id = p_whatsapp_account_id
      and a.is_active
      and a.phone_number_id = p_meta_phone_number_id
      and a.waba_id = p_meta_waba_id
  ) then
    raise exception 'whatsapp_order_intake_account_scope_mismatch' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.whatsapp_webhook_events_v1 e
    where e.id = p_source_event_id
      and e.provider = 'meta'
      and e.event_type = 'message.received'
      and e.whatsapp_account_id = p_whatsapp_account_id
      and e.provider_event_id = 'message:' || p_meta_message_id
      and e.provider_message_id = p_meta_message_id
  ) then
    raise exception 'whatsapp_order_intake_event_not_durable' using errcode = '22023';
  end if;

  if p_flow_session_id is not null then
    select c.snapshot_json into v_flow_snapshot
    from whatsapp_ordering_private.whatsapp_flow_sessions_v2 s
    join whatsapp_ordering_private.flow_catalog_snapshots_v1 c
      on c.snapshot_hash = s.snapshot_hash
    where s.id = p_flow_session_id
      and s.whatsapp_account_id = p_whatsapp_account_id
      and s.meta_waba_id = p_meta_waba_id
      and s.meta_phone_number_id = p_meta_phone_number_id
      and s.flow_schema_version = p_flow_schema_version
      and s.sender_phone_e164 = p_sender_phone_e164
      and s.revoked_at is null
      and s.expires_at > now();
    if not found then
      raise exception 'whatsapp_order_intake_flow_session_mismatch' using errcode = '22023';
    end if;
  end if;

  if p_conversation_id is not null and not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.whatsapp_account_id = p_whatsapp_account_id or c.channel_account_id = p_whatsapp_account_id)
      and (
        (p_sender_phone_e164 is not null and c.wa_contact_e164 = p_sender_phone_e164)
        or (p_sender_provider_id is not null and c.external_user_id = p_sender_provider_id)
      )
  ) then
    raise exception 'whatsapp_order_intake_conversation_mismatch' using errcode = '22023';
  end if;

  if p_customer_id is not null and not (
    (p_conversation_id is not null and exists (
      select 1 from public.conversations c
      where c.id = p_conversation_id and c.customer_id = p_customer_id
    ))
    or (p_sender_phone_e164 is not null and exists (
      select 1
      from public.customers c
      join public.customer_ids_by_phone_variants_v1(p_sender_phone_e164) matched_customer
        on matched_customer.customer_id = c.id
      where c.id = p_customer_id and c.is_active
    ))
  ) then
    raise exception 'whatsapp_order_intake_customer_mismatch' using errcode = '22023';
  end if;

  v_error_code := case
    when p_ingress_issue_code ~ '^[a-z0-9_]{1,64}$' then p_ingress_issue_code
    when p_ingress_issue_code is null then null
    else 'invalid_ingress_issue_code'
  end;

  if p_source_kind = 'catalog'
    and nullif(btrim(p_catalog_id), '') is null
    and v_error_code is null then
    v_error_code := 'missing_catalog_id';
  end if;

  if p_source_kind = 'catalog' and v_error_code is null then
    if jsonb_typeof(p_intake_snapshot -> 'items') is distinct from 'array' then
      v_error_code := 'invalid_items';
    elsif jsonb_array_length(p_intake_snapshot -> 'items') not between 1 and 100 then
      v_error_code := 'invalid_items';
    else
      for v_catalog_item in
        select item.value
        from jsonb_array_elements(p_intake_snapshot -> 'items') as item(value)
      loop
        if jsonb_typeof(v_catalog_item) is distinct from 'object'
          or nullif(btrim(v_catalog_item ->> 'retailer_id'), '') is null
          or coalesce(v_catalog_item ->> 'quantity', '') !~ '^[1-9][0-9]*$' then
          v_error_code := 'invalid_items';
          exit;
        end if;
      end loop;
    end if;

    if v_error_code is null and exists (
      select 1
      from jsonb_array_elements(p_intake_snapshot -> 'items') as item(value)
      left join whatsapp_ordering_private.meta_catalog_product_links_v1 mapping
        on mapping.whatsapp_account_id = p_whatsapp_account_id
        and mapping.catalog_id = btrim(p_catalog_id)
        and mapping.product_retailer_id = (item.value ->> 'retailer_id')
        and mapping.status = 'active'
      left join public.products product
        on product.id = mapping.product_id
        and product.is_active
        and product.is_whatsapp_active
      where mapping.id is null or product.id is null
    ) then
      v_error_code := 'catalog_product_mapping_unresolved';
    end if;

    if v_error_code is null then
      v_catalog_quote_result := whatsapp_ordering_private.catalog_quote_v1(
        p_whatsapp_account_id,
        btrim(p_catalog_id),
        p_intake_snapshot -> 'items'
      );
      if coalesce((v_catalog_quote_result ->> 'ok')::boolean, false) then
        v_server_quote := v_catalog_quote_result -> 'quote';
        v_quote_total_cents := (v_server_quote ->> 'total_cents')::bigint;
        v_quote_revision := 1;
      else
        v_error_code := coalesce(v_catalog_quote_result ->> 'issue_code', 'catalog_quote_unavailable');
      end if;
    end if;
  end if;

  if p_source_kind = 'flow' and v_error_code is null then
    if p_flow_session_id is null then
      v_error_code := 'flow_session_unresolved';
    elsif nullif(btrim(p_flow_name), '') is null then
      v_error_code := 'flow_identity_unresolved';
    elsif nullif(btrim(p_flow_schema_version), '') is null then
      v_error_code := 'flow_schema_version_unresolved';
    elsif jsonb_typeof(p_intake_snapshot -> 'items') is distinct from 'array' then
      v_error_code := 'invalid_items';
    elsif jsonb_array_length(p_intake_snapshot -> 'items') not between 1 and 100 then
      v_error_code := 'invalid_items';
    elsif jsonb_array_length(p_intake_snapshot -> 'items') <> jsonb_array_length(v_flow_snapshot -> 'positions') then
      v_error_code := 'incomplete_flow_selection';
    elsif exists (
      select 1
      from jsonb_array_elements(p_intake_snapshot -> 'items') as item(value)
      group by item.value ->> 'position_id'
      having count(*) > 1
    ) then
      v_error_code := 'duplicate_flow_position';
    else
      for v_flow_item in
        select item.value
        from jsonb_array_elements(p_intake_snapshot -> 'items') as item(value)
      loop
        if jsonb_typeof(v_flow_item) is distinct from 'object'
          or coalesce(v_flow_item ->> 'position_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or coalesce(v_flow_item ->> 'product_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or coalesce(v_flow_item ->> 'quantity', '') !~ '^[0-6]$' then
          v_error_code := 'invalid_items';
          exit;
        end if;

        if not exists (
            select 1
            from jsonb_array_elements(v_flow_snapshot -> 'positions') slot(value)
            where slot.value ->> 'id' = lower(v_flow_item ->> 'position_id')
              and exists (
                select 1
                from jsonb_array_elements(slot.value -> 'options') flow_option(value)
                where flow_option.value ->> 'product_id' = lower(v_flow_item ->> 'product_id')
              )
          ) then
          v_error_code := 'flow_selection_outside_snapshot';
          exit;
        end if;

        if (v_flow_item ->> 'quantity') <> '0' then
          v_has_positive_flow_item := true;
          if not exists (
            select 1
            from public.products p
            where p.id::text = (v_flow_item ->> 'product_id')
              and p.is_active
              and p.is_whatsapp_active
          ) then
            v_error_code := 'flow_product_unavailable';
            exit;
          end if;
        end if;
      end loop;

      if v_error_code is null and not v_has_positive_flow_item then
        v_error_code := 'empty_flow_selection';
      end if;
    end if;
  end if;

  if p_source_kind = 'flow' and v_error_code is null then
    if coalesce(p_intake_snapshot ->> 'payment_method', '') not in (
      'pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card'
    ) then
      v_error_code := 'flow_payment_method_invalid';
    elsif jsonb_typeof(p_intake_snapshot -> 'customer_snapshot') is distinct from 'object'
      or nullif(btrim(p_intake_snapshot #>> '{customer_snapshot,name}'), '') is null
      or char_length(p_intake_snapshot #>> '{customer_snapshot,name}') > 180 then
      v_error_code := 'flow_customer_snapshot_invalid';
    elsif jsonb_typeof(p_intake_snapshot -> 'delivery_snapshot') is distinct from 'object'
      or (
        coalesce(p_intake_snapshot #>> '{delivery_snapshot,address_id}', '')
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        and jsonb_typeof(p_intake_snapshot #> '{delivery_snapshot,new_address}') is distinct from 'object'
      ) then
      v_error_code := 'flow_delivery_snapshot_invalid';
    elsif coalesce(p_intake_snapshot ->> 'flow_reported_total_cents', '') !~ '^[0-9]{1,12}$' then
      v_error_code := 'flow_reported_total_invalid';
    elsif jsonb_typeof(p_intake_snapshot -> 'server_quote') is distinct from 'object' then
      v_error_code := 'flow_server_quote_missing';
    elsif coalesce(p_intake_snapshot #>> '{server_quote,schema_version}', '') <> 'sucedoan.whatsapp_flow_quote.v1'
      or coalesce(p_intake_snapshot #>> '{server_quote,currency}', '') <> 'BRL'
      or coalesce(p_intake_snapshot #>> '{server_quote,total_cents}', '') !~ '^[0-9]{1,12}$' then
      v_error_code := 'flow_server_quote_invalid';
    elsif jsonb_typeof(p_intake_snapshot #> '{server_quote,items}') is distinct from 'array' then
      v_error_code := 'flow_server_quote_items_invalid';
    elsif jsonb_array_length(p_intake_snapshot #> '{server_quote,items}') <> jsonb_array_length(p_intake_snapshot -> 'items') then
      v_error_code := 'flow_server_quote_items_invalid';
    elsif (
      coalesce(p_intake_snapshot #>> '{server_quote,items_total_cents}', '') !~ '^[0-9]{1,12}$'
      or coalesce(p_intake_snapshot #>> '{server_quote,fixed_hidden_adjustment_cents}', '') !~ '^[0-9]{1,12}$'
      or coalesce(p_intake_snapshot #>> '{server_quote,conditional_hidden_adjustment_cents}', '') !~ '^[0-9]{1,12}$'
      or case
        when coalesce(p_intake_snapshot #>> '{server_quote,total_cents}', '') ~ '^[0-9]{1,12}$'
          and coalesce(p_intake_snapshot #>> '{server_quote,items_total_cents}', '') ~ '^[0-9]{1,12}$'
          and coalesce(p_intake_snapshot #>> '{server_quote,fixed_hidden_adjustment_cents}', '') ~ '^[0-9]{1,12}$'
          and coalesce(p_intake_snapshot #>> '{server_quote,conditional_hidden_adjustment_cents}', '') ~ '^[0-9]{1,12}$'
        then (p_intake_snapshot #>> '{server_quote,total_cents}')::numeric <>
          (p_intake_snapshot #>> '{server_quote,items_total_cents}')::numeric
          + (p_intake_snapshot #>> '{server_quote,fixed_hidden_adjustment_cents}')::numeric
          + (p_intake_snapshot #>> '{server_quote,conditional_hidden_adjustment_cents}')::numeric
        else false
      end
      or case
        when not exists (
          select 1
          from jsonb_array_elements(p_intake_snapshot #> '{server_quote,items}') quoted(value)
          where coalesce(quoted.value ->> 'line_total_cents', '') !~ '^[0-9]{1,12}$'
        ) and coalesce(p_intake_snapshot #>> '{server_quote,items_total_cents}', '') ~ '^[0-9]{1,12}$'
        then (p_intake_snapshot #>> '{server_quote,items_total_cents}')::numeric <>
          coalesce((
            select sum((quoted.value ->> 'line_total_cents')::numeric)
            from jsonb_array_elements(p_intake_snapshot #> '{server_quote,items}') quoted(value)
          ), 0)
        else false
      end
      or exists (
        select 1
        from jsonb_array_elements(p_intake_snapshot #> '{server_quote,items}') quoted(value)
        where jsonb_typeof(quoted.value) is distinct from 'object'
          or coalesce(quoted.value ->> 'position_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(quoted.value ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(quoted.value ->> 'quantity', '') !~ '^(0|[1-6])$'
          or coalesce(quoted.value ->> 'unit_price_cents', '') !~ '^[0-9]{1,12}$'
          or coalesce(quoted.value ->> 'line_total_cents', '') !~ '^[0-9]{1,12}$'
          or case
            when coalesce(quoted.value ->> 'quantity', '') ~ '^(0|[1-6])$'
              and coalesce(quoted.value ->> 'unit_price_cents', '') ~ '^[0-9]{1,12}$'
            then (quoted.value ->> 'quantity')::numeric * (quoted.value ->> 'unit_price_cents')::numeric
            else null
          end is distinct from case
            when coalesce(quoted.value ->> 'line_total_cents', '') ~ '^[0-9]{1,12}$'
            then (quoted.value ->> 'line_total_cents')::numeric
            else null
          end
      )) then
      v_error_code := 'flow_server_quote_math_invalid';
    elsif exists (
      select 1
      from jsonb_array_elements(p_intake_snapshot -> 'items') selected(value)
      where not exists (
        select 1
        from jsonb_array_elements(p_intake_snapshot #> '{server_quote,items}') quoted(value)
        where quoted.value ->> 'position_id' = lower(selected.value ->> 'position_id')
          and quoted.value ->> 'product_id' = lower(selected.value ->> 'product_id')
          and quoted.value ->> 'quantity' = selected.value ->> 'quantity'
      )
    ) then
      v_error_code := 'flow_server_quote_selection_mismatch';
    elsif coalesce(p_intake_snapshot #>> '{delivery_snapshot,address_id}', '')
        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      and (
        p_customer_id is null
        or not exists (
          select 1
          from public.customer_addresses a
          where a.id = (p_intake_snapshot #>> '{delivery_snapshot,address_id}')::uuid
            and a.customer_id = p_customer_id
            and a.is_active
        )
      ) then
      v_error_code := 'flow_address_unavailable';
    end if;
  end if;

  if p_source_kind = 'flow' and v_error_code is null then
    v_server_quote := p_intake_snapshot -> 'server_quote';
    v_quote_total_cents := (p_intake_snapshot #>> '{server_quote,total_cents}')::bigint;
    v_quote_revision := 1;
  end if;

  v_initial_status := case
    when v_error_code is not null then 'needs_review'
    when p_source_kind = 'flow' and p_flow_session_id is null then 'needs_review'
    else 'received'
  end;

  insert into whatsapp_ordering_private.whatsapp_order_intents_v1 (
    source_event_id,
    whatsapp_account_id,
    meta_waba_id,
    meta_phone_number_id,
    meta_message_id,
    source_kind,
    sender_provider_id,
    sender_phone_e164,
    catalog_id,
    flow_name,
    flow_session_id,
    flow_reply_to_message_id,
    flow_schema_version,
    conversation_id,
    customer_id,
    quote_revision,
    currency,
    quote_total_cents,
    quote_snapshot,
    customer_snapshot,
    delivery_snapshot,
    payment_method,
    intake_snapshot,
    status,
    last_error_code,
    quoted_at
  ) values (
    p_source_event_id,
    p_whatsapp_account_id,
    btrim(p_meta_waba_id),
    btrim(p_meta_phone_number_id),
    btrim(p_meta_message_id),
    p_source_kind,
    nullif(btrim(p_sender_provider_id), ''),
    p_sender_phone_e164,
    nullif(btrim(p_catalog_id), ''),
    nullif(btrim(p_flow_name), ''),
    p_flow_session_id,
    nullif(btrim(p_flow_reply_to_message_id), ''),
    nullif(btrim(p_flow_schema_version), ''),
    p_conversation_id,
    p_customer_id,
    v_quote_revision,
    case when v_server_quote is not null then 'BRL' end,
    v_quote_total_cents,
    coalesce(v_server_quote, '{}'::jsonb),
    coalesce(p_intake_snapshot -> 'customer_snapshot', '{}'::jsonb),
    coalesce(p_intake_snapshot -> 'delivery_snapshot', '{}'::jsonb),
    nullif(btrim(p_intake_snapshot ->> 'payment_method'), ''),
    p_intake_snapshot,
    v_initial_status,
    coalesce(v_error_code, case when p_source_kind = 'flow' and p_flow_session_id is null then 'flow_session_unresolved' end),
    case when v_server_quote is not null then now() end
  ) on conflict do nothing;

  v_inserted := found;

  if v_inserted then
    select * into v_intent
    from whatsapp_ordering_private.whatsapp_order_intents_v1 i
    where i.source_event_id = p_source_event_id;
  else
    select * into v_intent
    from whatsapp_ordering_private.whatsapp_order_intents_v1 i
    where i.source_event_id = p_source_event_id
       or (i.whatsapp_account_id = p_whatsapp_account_id and i.meta_message_id = p_meta_message_id)
    order by (i.source_event_id = p_source_event_id) desc
    limit 1
    for update;

    if not found
      or v_intent.whatsapp_account_id <> p_whatsapp_account_id
      or v_intent.source_event_id <> p_source_event_id
      or v_intent.meta_waba_id <> p_meta_waba_id
      or v_intent.meta_message_id <> p_meta_message_id
      or v_intent.source_kind <> p_source_kind then
      raise exception 'whatsapp_order_intake_idempotency_conflict' using errcode = '23505';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_intent.id,
    'status', v_intent.status,
    'duplicate', not v_inserted
  );
end;
$function$;

create function public.whatsapp_order_intent_prepare_confirmation_v1(
  p_intent_id uuid,
  p_confirmation_token_hash text,
  p_summary_hash text,
  p_confirmation_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_phone text;
  v_name text;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_address_id uuid;
  v_address_json jsonb;
  v_delivery_snapshot jsonb;
  v_customer_snapshot jsonb;
  v_new_address jsonb;
  v_summary text;
  v_button_id text;
  v_button_token text;
  v_idempotency_key text;
begin
  if p_intent_id is null
    or coalesce(p_confirmation_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_summary_hash, '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_confirmation_payload) is distinct from 'object'
    or octet_length(p_confirmation_payload::text) > 12000 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_request_invalid');
  end if;

  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = p_intent_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_not_found');
  end if;

  v_idempotency_key := 'order-confirmation-intent:' || v_intent.id::text || ':quote:' || v_intent.quote_revision::text;
  if v_intent.status = 'awaiting_confirmation' then
    select * into v_outbox
    from public.whatsapp_outbox_v1 o
    where o.idempotency_key = v_idempotency_key
      and o.purpose = 'order_confirmation'
    for update;
    if found then
      return jsonb_build_object(
        'ok', true,
        'intent_id', v_intent.id,
        'status', v_intent.status,
        'outbox_id', v_outbox.id,
        'duplicate', true
      );
    end if;
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_outbox_missing', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  elsif v_intent.status not in ('received', 'reprice_required') then
    return jsonb_build_object(
      'ok', true,
      'intent_id', v_intent.id,
      'status', v_intent.status,
      'duplicate', true
    );
  end if;

  if v_intent.source_kind <> 'flow'
    or v_intent.quote_revision < 1
    or v_intent.quote_total_cents is null
    or v_intent.customer_snapshot is null
    or v_intent.delivery_snapshot is null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_flow_snapshot_invalid', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  v_summary := v_intent.intake_snapshot ->> 'confirmation_summary_text';
  if nullif(btrim(v_summary), '') is null
    or char_length(v_summary) > 900
    or encode(sha256(convert_to(v_summary, 'UTF8')), 'hex') is distinct from p_summary_hash
    or p_confirmation_payload #>> '{type}' is distinct from 'interactive'
    or p_confirmation_payload #>> '{interactive,type}' is distinct from 'button'
    or p_confirmation_payload #>> '{interactive,body,text}' is distinct from v_summary
    or jsonb_typeof(p_confirmation_payload #> '{interactive,action,buttons}') is distinct from 'array'
    then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_payload_invalid', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;
  if jsonb_array_length(p_confirmation_payload #> '{interactive,action,buttons}') <> 1 then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_payload_invalid', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  v_button_id := p_confirmation_payload #>> '{interactive,action,buttons,0,reply,id}';
  v_button_token := split_part(coalesce(v_button_id, ''), ':', 3);
  if p_confirmation_payload #>> '{interactive,action,buttons,0,type}' is distinct from 'reply'
    or p_confirmation_payload #>> '{interactive,action,buttons,0,reply,title}' is distinct from 'Confirmar pedido'
    or char_length(coalesce(v_button_id, '')) > 256
    or coalesce(v_button_id, '') !~ ('^order-confirm-v1:' || v_intent.id::text || ':[A-Za-z0-9_-]{32,128}$') then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_button_invalid', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;
  if encode(sha256(convert_to(v_button_token, 'UTF8')), 'hex') is distinct from p_confirmation_token_hash then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_token_hash_mismatch', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  v_delivery_snapshot := v_intent.delivery_snapshot;
  if nullif(btrim(coalesce(v_delivery_snapshot ->> 'address_id', '')), '') is not null then
    if coalesce(v_delivery_snapshot ->> 'address_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_delivery_snapshot -> 'new_address') = 'object' then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_address_choice_invalid', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
  else
    v_new_address := v_delivery_snapshot -> 'new_address';
    if jsonb_typeof(v_new_address) is distinct from 'object'
      or nullif(btrim(v_new_address ->> 'street'), '') is null
      or char_length(v_new_address ->> 'street') > 180
      or nullif(btrim(v_new_address ->> 'number'), '') is null
      or char_length(v_new_address ->> 'number') > 40
      or nullif(btrim(v_new_address ->> 'neighborhood'), '') is null
      or char_length(v_new_address ->> 'neighborhood') > 120
      or nullif(btrim(v_new_address ->> 'city'), '') is null
      or char_length(v_new_address ->> 'city') > 120
      or coalesce(v_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
      or nullif(btrim(v_new_address ->> 'postal_code'), '') is null
      or char_length(v_new_address ->> 'postal_code') > 16
      or char_length(coalesce(v_new_address ->> 'complement', '')) > 120
      or char_length(coalesce(v_new_address ->> 'reference', '')) > 180 then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_address_invalid', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164);
  if v_phone is null or v_intent.conversation_id is null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_phone_or_conversation_missing', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = v_intent.conversation_id
  for share;
  if not found
    or v_conversation.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164) is distinct from v_phone then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_conversation_mismatch', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  select * into v_account
  from public.whatsapp_accounts wa
  where wa.id = v_intent.whatsapp_account_id
    and wa.is_active = true
    and wa.waba_id = v_intent.meta_waba_id
    and wa.phone_number_id = v_intent.meta_phone_number_id
  for share;
  if not found then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_account_mismatch', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('whatsapp-customer:' || v_phone, 0));
  select c.id into v_primary_customer_id
  from public.customers c
  where c.primary_whatsapp_e164 = v_phone
  for update;
  select cp.customer_id into v_linked_customer_id
  from public.customer_phones cp
  where cp.phone_e164 = v_phone
  for update;
  if v_primary_customer_id is not null
    and v_linked_customer_id is not null
    and v_primary_customer_id is distinct from v_linked_customer_id then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_customer_phone_conflict', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  v_linked_customer_id := coalesce(v_primary_customer_id, v_linked_customer_id);
  if v_intent.customer_id is not null
    and v_intent.customer_id is distinct from v_linked_customer_id then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_customer_phone_conflict', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  if v_linked_customer_id is not null then
    select * into v_customer
    from public.customers c
    where c.id = v_linked_customer_id
    for share;
    if not found or not v_customer.is_active then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_customer_phone_conflict', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
    v_intent.customer_id := v_customer.id;
  elsif v_intent.customer_id is not null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_customer_phone_conflict', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  v_name := coalesce(
    nullif(btrim(v_customer.name), ''),
    nullif(btrim(v_intent.customer_snapshot ->> 'name'), '')
  );
  if v_name is null or char_length(v_name) > 180 then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_customer_name_missing', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
  end if;

  if coalesce(v_delivery_snapshot ->> 'address_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    if v_customer.id is null then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_address_choice_invalid', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
    v_address_id := (v_delivery_snapshot ->> 'address_id')::uuid;
    select * into v_address
    from public.customer_addresses a
    where a.id = v_address_id
      and a.customer_id = v_customer.id
      and a.is_active = true
    for share;
    if not found then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_address_unavailable', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
    v_address_json := jsonb_strip_nulls(jsonb_build_object(
      'address_id', v_address.id,
      'label', v_address.label,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'neighborhood', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference
    ));
    v_delivery_snapshot := (v_delivery_snapshot - 'new_address' - 'address_snapshot')
      || jsonb_build_object('address_id', v_address.id, 'address_snapshot', v_address_json);
  else
    v_new_address := v_delivery_snapshot -> 'new_address';
    if jsonb_typeof(v_new_address) is distinct from 'object'
      or nullif(btrim(v_new_address ->> 'street'), '') is null
      or char_length(v_new_address ->> 'street') > 180
      or nullif(btrim(v_new_address ->> 'number'), '') is null
      or char_length(v_new_address ->> 'number') > 40
      or nullif(btrim(v_new_address ->> 'neighborhood'), '') is null
      or char_length(v_new_address ->> 'neighborhood') > 120
      or nullif(btrim(v_new_address ->> 'city'), '') is null
      or char_length(v_new_address ->> 'city') > 120
      or coalesce(v_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
      or nullif(btrim(v_new_address ->> 'postal_code'), '') is null
      or char_length(v_new_address ->> 'postal_code') > 16
      or char_length(coalesce(v_new_address ->> 'complement', '')) > 120
      or char_length(coalesce(v_new_address ->> 'reference', '')) > 180 then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_address_invalid', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
    v_delivery_snapshot := (v_delivery_snapshot - 'address_id' - 'address_snapshot')
      || jsonb_build_object('new_address', v_new_address);
  end if;

  v_customer_snapshot := (coalesce(v_intent.customer_snapshot, '{}'::jsonb) - 'customer_id')
    || jsonb_strip_nulls(jsonb_build_object(
      'customer_id', v_customer.id,
      'name', v_name,
      'phone_e164', v_phone
    ));

  insert into public.whatsapp_outbox_v1 (
    whatsapp_account_id, conversation_id, customer_id, to_phone_e164, purpose,
    message_type, provider, payload, status, idempotency_key, metadata
  ) values (
    v_intent.whatsapp_account_id, v_intent.conversation_id, v_customer.id, v_phone,
    'order_confirmation', 'interactive', 'meta', p_confirmation_payload, 'queued',
    v_idempotency_key,
    jsonb_build_object(
      'order_intent_id', v_intent.id,
      'quote_revision', v_intent.quote_revision,
      'summary_hash', p_summary_hash
    )
  )
  on conflict (idempotency_key) do nothing;

  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_idempotency_key
  for update;
  if not found
    or v_outbox.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or v_outbox.conversation_id is distinct from v_intent.conversation_id
    or v_outbox.to_phone_e164 is distinct from v_phone
    or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.payload is distinct from p_confirmation_payload then
    raise exception 'order_confirmation_outbox_conflict' using errcode = '23505';
  end if;

  update whatsapp_ordering_private.whatsapp_order_intents_v1
  set customer_id = v_customer.id,
      customer_snapshot = v_customer_snapshot,
      delivery_snapshot = v_delivery_snapshot,
      confirmation_token_hash = p_confirmation_token_hash,
      summary_hash = p_summary_hash,
      confirmation_message_id = null,
      status = 'awaiting_confirmation',
      last_error_code = null,
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_intent.id,
    'status', 'awaiting_confirmation',
    'outbox_id', v_outbox.id,
    'duplicate', v_outbox.status <> 'queued'
  );
end;
$function$;

revoke all on function public.whatsapp_order_intent_ingest_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text, jsonb, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.whatsapp_order_intent_prepare_confirmation_v1(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_intent_ingest_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text, jsonb, uuid, uuid, text
) to service_role;
grant execute on function public.whatsapp_order_intent_prepare_confirmation_v1(uuid, text, text, jsonb)
  to service_role;

revoke all on function public.whatsapp_flow_session_open_v1(
  uuid, text, text, text, text, uuid, uuid, text, text, jsonb, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.whatsapp_flow_session_resolve_v1(text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_flow_private_key_resolve_v1(text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_flow_session_revoke_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.whatsapp_flow_session_open_v1(
  uuid, text, text, text, text, uuid, uuid, text, text, jsonb, uuid, uuid
) to service_role;
grant execute on function public.whatsapp_flow_session_resolve_v1(text)
  to service_role;
grant execute on function public.whatsapp_flow_private_key_resolve_v1(text)
  to service_role;
grant execute on function public.whatsapp_flow_session_revoke_v1(uuid)
  to service_role;

comment on function public.whatsapp_order_intent_ingest_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text, jsonb, uuid, uuid, text
) is 'Service-role-only, idempotent intake for already durable Meta order-related message events; never creates a canonical order.';
comment on function public.whatsapp_order_intent_prepare_confirmation_v1(uuid, text, text, jsonb)
  is 'Service-role-only: resolves an exact-phone customer and a Flow-confirmed address, then atomically prepares one order-confirmation outbox row. Does not create an order or reserve stock.';
comment on function public.whatsapp_flow_session_open_v1(
  uuid, text, text, text, text, uuid, uuid, text, text, jsonb, uuid, uuid
) is 'Service-role-only: stores a SHA-256-addressed immutable Supabase catalog snapshot and opens a 24-hour technical Flow session. It does not expire a resulting commercial intent.';
comment on function public.whatsapp_flow_session_resolve_v1(text)
  is 'Service-role-only: resolves a token hash to an active versioned Flow session and its immutable snapshot; never accepts or returns the raw token.';
comment on function public.whatsapp_flow_private_key_resolve_v1(text)
  is 'Service-role-only: returns a private key only for a per-account keyring entry marked ready whose Vault value still matches its recorded SHA-256 fingerprint.';
comment on function public.whatsapp_flow_session_revoke_v1(uuid)
  is 'Service-role-only: revokes a private versioned Flow session without deleting its snapshot or expiring any resulting commercial intent.';

-- Each verified inbound button event receives one durable outcome. This is
-- separate from the commercial intent so retries remain explainable after a
-- reprice or conversion.
create table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
  webhook_event_id uuid primary key
    references public.whatsapp_webhook_events_v1(id) on delete restrict,
  order_intent_id uuid not null
    references whatsapp_ordering_private.whatsapp_order_intents_v1(id) on delete restrict,
  outcome text not null
    check (outcome in ('converted', 'reprice_required', 'needs_review', 'ignored', 'already_converted')),
  issue_code text,
  quote_revision integer not null check (quote_revision >= 0),
  order_id uuid references public.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint whatsapp_order_confirmation_event_order_outcome_check
    check (
      (outcome in ('converted', 'already_converted') and order_id is not null)
      or (outcome not in ('converted', 'already_converted') and order_id is null)
    )
);

create index whatsapp_order_confirmation_events_intent_created_idx
  on whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (order_intent_id, created_at desc);

alter table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 enable row level security;
revoke all on table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 from public, anon, authenticated;
grant select, insert on table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 to service_role;

comment on table whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 is
  'Private idempotency ledger for inbound WhatsApp order-confirmation button events. Contains outcome codes, never raw webhook payloads or tokens.';

create function whatsapp_ordering_private.flow_confirmation_summary_v1(p_quote jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_name text;
  v_quantity integer;
  v_lines text := '';
  v_cents bigint;
  v_whole text;
  v_grouped text := '';
  v_fraction text;
  v_summary text;
begin
  if jsonb_typeof(p_quote) is distinct from 'object'
    or coalesce(p_quote ->> 'total_cents', '') !~ '^[0-9]{1,12}$' then
    return null;
  end if;
  if jsonb_typeof(p_quote -> 'items') is distinct from 'array'
    or jsonb_array_length(p_quote -> 'items') not between 1 and 100 then
    return null;
  end if;

  v_cents := (p_quote ->> 'total_cents')::bigint;
  for v_item in
    select item.value
    from jsonb_array_elements(p_quote -> 'items') with ordinality as item(value, ordinal)
    order by item.ordinal
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item ->> 'quantity', '') !~ '^(0|[1-6])$' then
      return null;
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity = 0 then
      continue;
    end if;
    v_name := regexp_replace(btrim(coalesce(v_item ->> 'name', '')), '[[:space:]]+', ' ', 'g');
    if v_name = '' or char_length(v_name) > 180 then
      return null;
    end if;
    v_lines := v_lines || case when v_lines = '' then '' else E'\n' end
      || v_quantity::text || ' × ' || v_name;
  end loop;

  if v_lines = '' then
    return null;
  end if;
  v_whole := (v_cents / 100)::text;
  v_fraction := lpad((v_cents % 100)::text, 2, '0');
  while char_length(v_whole) > 3 loop
    v_grouped := '.' || right(v_whole, 3) || v_grouped;
    v_whole := left(v_whole, char_length(v_whole) - 3);
  end loop;
  v_grouped := v_whole || v_grouped;
  v_summary := 'Resumo do seu pedido:' || E'\n' || v_lines || E'\n\n'
    || 'Total do pedido: R$ ' || v_grouped || ',' || v_fraction || E'\n'
    || 'Confira os itens e toque em “Confirmar pedido” para enviar à separação.';
  if char_length(v_summary) > 900 then
    return null;
  end if;
  return v_summary;
end;
$function$;

revoke all on function whatsapp_ordering_private.flow_confirmation_summary_v1(jsonb)
  from public, anon, authenticated;
grant execute on function whatsapp_ordering_private.flow_confirmation_summary_v1(jsonb)
  to service_role;

-- Convert a confirmed Catalog cart in one transaction. A customer and a new
-- address remain private intent data until this exact customer confirmation.
create function whatsapp_ordering_private.catalog_order_intent_confirm_v1(
  p_intent_id uuid,
  p_confirmation_event_id uuid,
  p_whatsapp_account_id uuid,
  p_meta_waba_id text,
  p_meta_phone_number_id text,
  p_conversation_id uuid,
  p_inbound_message_id text,
  p_reply_to_message_id text,
  p_confirmation_token_hash text,
  p_sender_phone_e164 text,
  p_sender_provider_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_event public.whatsapp_webhook_events_v1%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_conversation public.conversations%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_customer_id uuid;
  v_address_id uuid;
  v_phone text;
  v_customer_name text;
  v_address_snapshot jsonb;
  v_delivery_snapshot jsonb;
  v_delivery_address jsonb;
  v_customer_snapshot jsonb;
  v_new_address jsonb;
  v_quote_result jsonb;
  v_quote jsonb;
  v_quote_total_cents bigint;
  v_quote_revision integer;
  v_total_cents bigint := 0;
  v_order_items jsonb := '[]'::jsonb;
  v_cart jsonb;
  v_line jsonb;
  v_item record;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cents bigint;
  v_line_cents bigint;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_order_number text;
  v_now timestamptz := clock_timestamp();
  v_reservation jsonb;
  v_stock_failure boolean := false;
  v_exception_message text;
  v_issue_code text;
  v_summary text;
  v_idempotency_key text;
begin
  if p_intent_id is null or p_confirmation_event_id is null
    or p_whatsapp_account_id is null or p_conversation_id is null
    or nullif(btrim(p_meta_waba_id), '') is null
    or nullif(btrim(p_meta_phone_number_id), '') is null
    or nullif(btrim(p_inbound_message_id), '') is null
    or char_length(p_inbound_message_id) > 256
    or nullif(btrim(p_reply_to_message_id), '') is null
    or char_length(p_reply_to_message_id) > 256
    or coalesce(p_confirmation_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_sender_phone_e164, '') !~ '^[+][1-9][0-9]{7,14}$'
    or char_length(coalesce(p_sender_provider_id, '')) > 256 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_request_invalid');
  end if;

  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = p_intent_id
  for update;
  if not found or v_intent.source_kind <> 'catalog' then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_not_found');
  end if;

  select * into v_event
  from public.whatsapp_webhook_events_v1 e
  where e.id = p_confirmation_event_id
  for share;
  if not found or v_event.provider <> 'meta'
    or v_event.event_type <> 'message.received'
    or v_event.whatsapp_account_id is distinct from p_whatsapp_account_id
    or v_event.provider_event_id is distinct from 'message:' || p_inbound_message_id
    or v_event.provider_message_id is distinct from p_inbound_message_id
    or public.canonical_whatsapp_e164_br_v2(v_event.phone_e164) is distinct from p_sender_phone_e164 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_event_mismatch');
  end if;

  if v_intent.whatsapp_account_id is distinct from p_whatsapp_account_id
    or v_intent.meta_waba_id is distinct from btrim(p_meta_waba_id)
    or v_intent.meta_phone_number_id is distinct from btrim(p_meta_phone_number_id)
    or v_intent.conversation_id is distinct from p_conversation_id
    or public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164) is distinct from p_sender_phone_e164
    or (v_intent.sender_provider_id is not null
      and v_intent.sender_provider_id is distinct from nullif(btrim(p_sender_provider_id), '')) then
    return jsonb_build_object('ok', false, 'error', 'confirmation_sender_scope_mismatch');
  end if;

  select * into v_account
  from public.whatsapp_accounts a
  where a.id = p_whatsapp_account_id and a.is_active
    and a.waba_id = btrim(p_meta_waba_id)
    and a.phone_number_id = btrim(p_meta_phone_number_id)
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'confirmation_account_mismatch');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for share;
  if not found
    or (v_conversation.whatsapp_account_id is distinct from p_whatsapp_account_id
      and v_conversation.channel_account_id is distinct from p_whatsapp_account_id)
    or public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164) is distinct from p_sender_phone_e164 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_conversation_mismatch');
  end if;

  if v_intent.status = 'converted' and v_intent.confirmed_order_id is not null then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, quote_revision, order_id
    ) values (
      p_confirmation_event_id, v_intent.id, 'already_converted', v_intent.quote_revision,
      v_intent.confirmed_order_id
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'already_converted', 'order_id', v_intent.confirmed_order_id,
      'duplicate', true
    );
  end if;

  if v_intent.status <> 'awaiting_confirmation'
    or v_intent.confirmation_token_hash is distinct from p_confirmation_token_hash then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'ignored',
      'stale_or_unavailable_confirmation', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'ignored', 'issue_code', 'stale_or_unavailable_confirmation'
    );
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164);
  if v_phone is null or v_phone is distinct from p_sender_phone_e164 then
    v_issue_code := 'confirmation_phone_unresolved';
  end if;

  v_idempotency_key := 'catalog-order-confirmation-intent:' || v_intent.id::text
    || ':quote:' || v_intent.quote_revision::text;
  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_idempotency_key
  for share;
  if found and v_outbox.status in ('queued', 'claimed') then
    return jsonb_build_object(
      'ok', false, 'retryable', true, 'error', 'confirmation_send_receipt_pending'
    );
  end if;
  v_summary := v_intent.intake_snapshot ->> 'confirmation_summary_text';
  if v_issue_code is null and (
    not found
    or v_outbox.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or v_outbox.conversation_id is distinct from v_intent.conversation_id
    or public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) is distinct from v_phone
    or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.provider <> 'meta'
    or v_outbox.message_type <> 'interactive'
    or v_outbox.status <> 'sent'
    or v_outbox.provider_message_id is distinct from p_reply_to_message_id
    or v_intent.confirmation_message_id is distinct from p_reply_to_message_id
    or v_outbox.metadata ->> 'order_intent_id' is distinct from v_intent.id::text
    or v_outbox.metadata ->> 'source_kind' is distinct from 'catalog'
    or v_outbox.metadata ->> 'quote_revision' is distinct from v_intent.quote_revision::text
    or v_outbox.metadata ->> 'summary_hash' is distinct from v_intent.summary_hash
    or v_outbox.payload #>> '{interactive,body,text}' is distinct from v_summary
    or encode(sha256(convert_to(coalesce(v_summary, ''), 'UTF8')), 'hex') is distinct from v_intent.summary_hash
  ) then
    v_issue_code := 'confirmation_message_not_currently_sent';
  end if;

  if v_issue_code is null then
    v_quote_result := whatsapp_ordering_private.catalog_quote_v1(
      v_intent.whatsapp_account_id, v_intent.catalog_id,
      v_intent.intake_snapshot -> 'items'
    );
    if coalesce((v_quote_result ->> 'ok')::boolean, false) is distinct from true
      or jsonb_typeof(v_quote_result -> 'quote') is distinct from 'object'
      or coalesce(v_quote_result #>> '{quote,total_cents}', '') !~ '^[0-9]{1,12}$'
      or jsonb_typeof(v_quote_result #> '{quote,items}') is distinct from 'array' then
      v_issue_code := case v_quote_result ->> 'issue_code'
        when 'catalog_product_mapping_unresolved' then 'catalog_product_mapping_unresolved'
        when 'catalog_product_price_unavailable' then 'catalog_product_price_unavailable'
        else 'catalog_quote_unavailable'
      end;
    else
      v_quote := v_quote_result -> 'quote';
      v_quote_total_cents := (v_quote ->> 'total_cents')::bigint;
      if v_intent.quote_total_cents is distinct from v_quote_total_cents
        or v_intent.quote_snapshot -> 'items' is distinct from v_quote -> 'items' then
        if v_intent.quote_revision >= 2147483647 then
          v_issue_code := 'confirmation_quote_revision_exhausted';
        else
          v_quote_revision := v_intent.quote_revision + 1;
          update whatsapp_ordering_private.whatsapp_order_intents_v1
          set status = 'reprice_required',
              quote_snapshot = v_quote,
              quote_total_cents = v_quote_total_cents,
              currency = 'BRL',
              quote_revision = v_quote_revision,
              quoted_at = v_now,
              confirmation_token_hash = null,
              summary_hash = null,
              confirmation_message_id = null,
              intake_snapshot = intake_snapshot - 'confirmation_summary_text',
              last_error_code = 'quote_changed_after_customer_confirmation',
              updated_at = v_now
          where id = v_intent.id;
          insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
            webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
          ) values (
            p_confirmation_event_id, v_intent.id, 'reprice_required',
            'quote_changed_after_customer_confirmation', v_quote_revision
          );
          return jsonb_build_object(
            'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
            'status', 'reprice_required', 'quote_revision', v_quote_revision,
            'issue_code', 'quote_changed_after_customer_confirmation'
          );
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null and coalesce(v_intent.payment_method, '')
    not in ('pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card') then
    v_issue_code := 'catalog_confirmation_payment_missing';
  end if;
  v_customer_name := nullif(btrim(v_intent.customer_snapshot ->> 'name'), '');
  if v_issue_code is null and (v_customer_name is null or char_length(v_customer_name) > 180) then
    v_issue_code := 'catalog_confirmation_customer_name_missing';
  end if;

  v_delivery_snapshot := v_intent.delivery_snapshot;
  if v_issue_code is null and nullif(btrim(coalesce(v_delivery_snapshot ->> 'address_id', '')), '') is not null then
    if v_intent.customer_id is null
      or coalesce(v_delivery_snapshot ->> 'address_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_delivery_snapshot -> 'new_address') = 'object' then
      v_issue_code := 'catalog_confirmation_address_invalid';
    else
      v_address_id := (v_delivery_snapshot ->> 'address_id')::uuid;
    end if;
  elsif v_issue_code is null then
    v_new_address := v_delivery_snapshot -> 'new_address';
    if jsonb_typeof(v_new_address) is distinct from 'object'
      or exists (
        select 1 from jsonb_object_keys(v_new_address) as address_key(key_name)
        where key_name not in ('street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal_code', 'reference')
      )
      or jsonb_typeof(v_new_address -> 'street') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'street'), '') is null
      or char_length(v_new_address ->> 'street') > 180
      or jsonb_typeof(v_new_address -> 'number') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'number'), '') is null
      or char_length(v_new_address ->> 'number') > 40
      or (v_new_address ? 'complement' and jsonb_typeof(v_new_address -> 'complement') is distinct from 'string')
      or char_length(coalesce(v_new_address ->> 'complement', '')) > 120
      or jsonb_typeof(v_new_address -> 'neighborhood') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'neighborhood'), '') is null
      or char_length(v_new_address ->> 'neighborhood') > 120
      or jsonb_typeof(v_new_address -> 'city') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'city'), '') is null
      or char_length(v_new_address ->> 'city') > 120
      or jsonb_typeof(v_new_address -> 'state') is distinct from 'string'
      or coalesce(v_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
      or jsonb_typeof(v_new_address -> 'postal_code') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'postal_code'), '') is null
      or char_length(v_new_address ->> 'postal_code') > 16
      or (v_new_address ? 'reference' and jsonb_typeof(v_new_address -> 'reference') is distinct from 'string')
      or char_length(coalesce(v_new_address ->> 'reference', '')) > 180 then
      v_issue_code := 'catalog_confirmation_address_invalid';
    else
      v_new_address := jsonb_strip_nulls(jsonb_build_object(
        'street', btrim(v_new_address ->> 'street'),
        'number', btrim(v_new_address ->> 'number'),
        'complement', nullif(btrim(v_new_address ->> 'complement'), ''),
        'neighborhood', btrim(v_new_address ->> 'neighborhood'),
        'city', btrim(v_new_address ->> 'city'),
        'state', v_new_address ->> 'state',
        'postal_code', btrim(v_new_address ->> 'postal_code'),
        'reference', nullif(btrim(v_new_address ->> 'reference'), '')
      ));
    end if;
  end if;

  if v_issue_code is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('whatsapp-customer:' || v_phone, 0)
    );
    select c.id into v_primary_customer_id
    from public.customers c where c.primary_whatsapp_e164 = v_phone for update;
    select cp.customer_id into v_linked_customer_id
    from public.customer_phones cp where cp.phone_e164 = v_phone for update;
    if v_primary_customer_id is not null and v_linked_customer_id is not null
      and v_primary_customer_id is distinct from v_linked_customer_id then
      v_issue_code := 'catalog_confirmation_customer_conflict';
    else
      v_customer_id := coalesce(v_primary_customer_id, v_linked_customer_id);
      if (v_intent.customer_id is not null and v_intent.customer_id is distinct from v_customer_id)
        or (v_intent.customer_id is not null and v_customer_id is null) then
        v_issue_code := 'catalog_confirmation_customer_conflict';
      elsif v_customer_id is not null then
        select * into v_customer from public.customers c where c.id = v_customer_id for update;
        if not found or v_customer.is_active is not true then
          v_issue_code := 'catalog_confirmation_customer_conflict';
        else
          v_customer_name := coalesce(nullif(btrim(v_customer.name), ''), v_customer_name);
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null and v_address_id is not null then
    if v_customer_id is null then
      v_issue_code := 'catalog_confirmation_customer_conflict';
    else
      select * into v_address
      from public.customer_addresses a
      where a.id = v_address_id and a.customer_id = v_customer_id and a.is_active
      for update;
      if not found then
        v_issue_code := 'catalog_confirmation_address_unavailable';
      else
        v_address_snapshot := jsonb_strip_nulls(jsonb_build_object(
          'address_id', v_address.id,
          'label', v_address.label,
          'street', v_address.street,
          'number', v_address.number,
          'complement', v_address.complement,
          'neighborhood', v_address.neighborhood,
          'city', v_address.city,
          'state', v_address.state,
          'postal_code', v_address.postal_code,
          'reference', v_address.reference
        ));
        if v_address_snapshot is distinct from v_delivery_snapshot -> 'address_snapshot' then
          v_issue_code := 'catalog_confirmation_address_changed';
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null then
    if jsonb_typeof(v_quote -> 'items') is distinct from 'array'
      or jsonb_array_length(v_quote -> 'items') not between 1 and 100 then
      v_issue_code := 'catalog_confirmation_items_invalid';
    else
      for v_item in
        select line.value, line.ordinality
        from jsonb_array_elements(v_quote -> 'items') with ordinality as line(value, ordinality)
        order by line.ordinality
      loop
        v_line := v_item.value;
        if coalesce(v_line ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(v_line ->> 'quantity', '') !~ '^[1-9][0-9]{0,15}$'
          or coalesce(v_line ->> 'unit_price_cents', '') !~ '^[0-9]{1,12}$'
          or coalesce(v_line ->> 'line_total_cents', '') !~ '^[0-9]{1,12}$'
          or nullif(btrim(v_line ->> 'name'), '') is null
          or char_length(v_line ->> 'name') > 180 then
          v_issue_code := 'catalog_confirmation_items_invalid';
          exit;
        end if;
        v_product_id := (v_line ->> 'product_id')::uuid;
        v_quantity := (v_line ->> 'quantity')::numeric;
        v_unit_cents := (v_line ->> 'unit_price_cents')::bigint;
        v_line_cents := (v_line ->> 'line_total_cents')::bigint;
        if v_unit_cents * v_quantity is distinct from v_line_cents
          or v_total_cents + v_line_cents > 999999999999 then
          v_issue_code := 'catalog_confirmation_items_invalid';
          exit;
        end if;
        v_total_cents := v_total_cents + v_line_cents;
        v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
          'product_id', v_product_id,
          'sku', nullif(v_line ->> 'sku', ''),
          'name', regexp_replace(btrim(v_line ->> 'name'), '[[:space:]]+', ' ', 'g'),
          'quantity', v_quantity,
          'unit_price_cents', v_unit_cents,
          'line_total_cents', v_line_cents,
          'retailer_id', v_line ->> 'retailer_id',
          'image_url', coalesce(v_line ->> 'image_url', '')
        ));
      end loop;
      if v_issue_code is null and v_total_cents is distinct from v_quote_total_cents then
        v_issue_code := 'catalog_confirmation_items_invalid';
      end if;
    end if;
  end if;

  if v_issue_code is not null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = v_issue_code,
        confirmation_token_hash = null, summary_hash = null,
        confirmation_message_id = null, updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', v_issue_code, v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'needs_review', 'issue_code', v_issue_code
    );
  end if;

  v_order_number := 'DA-' || to_char(v_now at time zone 'America/Cuiaba', 'YYMMDD')
    || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));
  v_cart := jsonb_build_object(
    'type', 'catalog_cart',
    'catalog_id', v_intent.catalog_id,
    'items', v_order_items
  );

  begin
    if v_customer_id is null then
      insert into public.customers (name, primary_whatsapp_e164, is_active)
      values (v_customer_name, v_phone, true)
      returning * into v_customer;
      v_customer_id := v_customer.id;
      insert into public.customer_phones (
        customer_id, phone_e164, source, is_primary, verified_at
      ) values (v_customer_id, v_phone, 'whatsapp', true, v_now);
    elsif nullif(btrim(v_customer.name), '') is null then
      update public.customers
      set name = v_customer_name, updated_at = v_now
      where id = v_customer_id
      returning * into v_customer;
    end if;

    if v_address_id is not null then
      update public.customer_addresses
      set last_confirmed_at = v_now, updated_at = v_now
      where id = v_address_id and customer_id = v_customer_id
      returning * into v_address;
    else
      insert into public.customer_addresses (
        customer_id, label, street, number, complement, neighborhood,
        city, state, postal_code, reference, is_default, is_active, last_confirmed_at
      ) values (
        v_customer_id, 'WhatsApp', v_new_address ->> 'street', v_new_address ->> 'number',
        v_new_address ->> 'complement', v_new_address ->> 'neighborhood',
        v_new_address ->> 'city', v_new_address ->> 'state',
        v_new_address ->> 'postal_code', v_new_address ->> 'reference',
        not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer_id and a.is_active),
        true, v_now
      ) returning * into v_address;
      v_address_id := v_address.id;
    end if;

    v_delivery_address := jsonb_strip_nulls(jsonb_build_object(
      'customer_name', coalesce(nullif(btrim(v_customer.name), ''), v_customer_name),
      'source_customer_id', v_customer.id,
      'phone', v_phone,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'district', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference,
      'customer_address_id', v_address.id,
      'google_maps_url', v_address.google_maps_url
    ));
    v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'customer_id', v_customer.id,
      'name', coalesce(nullif(btrim(v_customer.name), ''), v_customer_name),
      'phone_e164', v_phone,
      'status', 'registered'
    ));

    insert into public.orders (
      id, customer_id, conversation_id, whatsapp_account_id, status, total, currency,
      delivery_address, customer_snapshot, confirmed_at, created_at, updated_at,
      fiscal_subtotal, other_expenses, discount, sync_status, idempotency_key,
      payment_method, phone_e164, source, subtotal, order_number,
      checkout_snapshot, delivery_customer_address_id
    ) values (
      v_order_id, v_customer.id, v_intent.conversation_id, v_intent.whatsapp_account_id,
      'confirmed', v_quote_total_cents / 100.0, 'BRL', v_delivery_address,
      v_customer_snapshot, v_now, v_now, v_now, v_quote_total_cents / 100.0,
      0, 0, 'local', 'whatsapp-order-intent:' || v_intent.id::text,
      v_intent.payment_method, v_phone, 'manual_whatsapp', v_quote_total_cents / 100.0,
      v_order_number,
      jsonb_build_object(
        'schema_version', 'sucedoan.whatsapp_checkout.v1',
        'source', 'whatsapp_order_intent',
        'origin', 'catalog',
        'order_intent_id', v_intent.id,
        'catalog_id', v_intent.catalog_id,
        'catalog_message_id', v_intent.meta_message_id,
        'confirmation_message_id', v_intent.confirmation_message_id,
        'confirmation_event_id', p_confirmation_event_id,
        'quote_revision', v_intent.quote_revision,
        'currency', 'BRL',
        'payment_method', v_intent.payment_method,
        'customer_confirmed', true,
        'customer', v_customer_snapshot,
        'delivery', v_delivery_address,
        'cart', v_cart
      ),
      v_address.id
    );

    for v_item in select value from jsonb_array_elements(v_order_items)
    loop
      v_line := v_item.value;
      insert into public.order_items (
        order_id, product_id, sku_snapshot, name_snapshot, quantity,
        unit_price, line_total, metadata
      ) values (
        v_order_id, (v_line ->> 'product_id')::uuid, nullif(v_line ->> 'sku', ''),
        v_line ->> 'name', (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit_price_cents')::numeric / 100,
        (v_line ->> 'line_total_cents')::numeric / 100,
        jsonb_build_object(
          'source', 'whatsapp_catalog',
          'order_intent_id', v_intent.id,
          'catalog_id', v_intent.catalog_id,
          'retailer_id', v_line ->> 'retailer_id',
          'image_url', coalesce(v_line ->> 'image_url', '')
        )
      );
    end loop;

    v_reservation := public.reserve_vitrine_order_stock_v1(v_order_id);
    if coalesce((v_reservation ->> 'ok')::boolean, false) is not true then
      raise exception 'whatsapp_order_stock_reservation_failed' using errcode = 'P0001';
    end if;

    insert into public.order_manual_separation_queue_v1 (order_id, selected_by, selected_source)
    values (v_order_id, null, 'customer_confirmed');

    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set customer_id = v_customer.id,
        customer_snapshot = v_customer_snapshot,
        delivery_snapshot = jsonb_build_object(
          'address_id', v_address.id,
          'address_snapshot', jsonb_strip_nulls(jsonb_build_object(
            'address_id', v_address.id,
            'label', v_address.label,
            'street', v_address.street,
            'number', v_address.number,
            'complement', v_address.complement,
            'neighborhood', v_address.neighborhood,
            'city', v_address.city,
            'state', v_address.state,
            'postal_code', v_address.postal_code,
            'reference', v_address.reference
          ))
        ),
        status = 'converted', confirmed_order_id = v_order_id,
        confirmation_event_id = p_confirmation_event_id,
        confirmed_at = v_now, converted_at = v_now,
        last_error_code = null, updated_at = v_now
    where id = v_intent.id;

    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, quote_revision, order_id
    ) values (
      p_confirmation_event_id, v_intent.id, 'converted', v_intent.quote_revision, v_order_id
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_exception_message = message_text;
    if v_exception_message <> 'whatsapp_order_stock_reservation_failed' then
      raise;
    end if;
    v_stock_failure := true;
  end;

  if v_stock_failure then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'stock_reservation_failed', updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', 'stock_reservation_failed', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
      'status', 'needs_review', 'issue_code', 'stock_reservation_failed'
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'intent_id', v_intent.id, 'source_kind', 'catalog',
    'status', 'converted', 'order_id', v_order_id,
    'order_number', v_order_number, 'quote_revision', v_intent.quote_revision,
    'duplicate', false
  );
end;
$function$;

revoke all on function whatsapp_ordering_private.catalog_order_intent_confirm_v1(
  uuid, uuid, uuid, text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function whatsapp_ordering_private.catalog_order_intent_confirm_v1(
  uuid, uuid, uuid, text, text, uuid, text, text, text, text, text
) to service_role;

create function public.whatsapp_order_intent_confirm_v1(
  p_intent_id uuid,
  p_confirmation_event_id uuid,
  p_whatsapp_account_id uuid,
  p_meta_waba_id text,
  p_meta_phone_number_id text,
  p_conversation_id uuid,
  p_inbound_message_id text,
  p_reply_to_message_id text,
  p_confirmation_token_hash text,
  p_sender_phone_e164 text,
  p_sender_provider_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_event public.whatsapp_webhook_events_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_conversation public.conversations%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_template public.basket_templates%rowtype;
  v_mold public.basket_molds%rowtype;
  v_product public.products%rowtype;
  v_position record;
  v_input jsonb;
  v_flow_snapshot jsonb;
  v_intent_items jsonb;
  v_current_items jsonb := '[]'::jsonb;
  v_component_snapshot jsonb := '[]'::jsonb;
  v_order_items jsonb := '[]'::jsonb;
  v_current_position_ids text[];
  v_submitted_position_ids text[];
  v_frozen_position_ids text[];
  v_quote jsonb;
  v_cart jsonb;
  v_separation_plan jsonb;
  v_address_json jsonb;
  v_delivery_address jsonb;
  v_delivery_snapshot jsonb;
  v_customer_snapshot jsonb;
  v_new_address jsonb;
  v_address_id uuid;
  v_issue_code text;
  v_phone text;
  v_name text;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_basket_id uuid;
  v_mold_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_unit_cents bigint;
  v_line_cents bigint;
  v_items_total_cents bigint := 0;
  v_fixed_hidden_cents bigint;
  v_conditional_hidden_cents bigint := 0;
  v_total_cents bigint;
  v_has_positive_item boolean := false;
  v_conditional_product_selected boolean := false;
  v_quote_changed boolean := false;
  v_new_revision integer;
  v_summary text;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_order_number text;
  v_now timestamptz := clock_timestamp();
  v_reservation jsonb;
  v_stock_failure boolean := false;
  v_exception_message text;
  v_idempotency_key text;
  v_attempt whatsapp_ordering_private.whatsapp_order_confirmation_events_v1%rowtype;
  v_line jsonb;
begin
  if p_intent_id is null
    or p_confirmation_event_id is null
    or p_whatsapp_account_id is null
    or nullif(btrim(p_meta_waba_id), '') is null
    or nullif(btrim(p_meta_phone_number_id), '') is null
    or p_conversation_id is null
    or nullif(btrim(p_inbound_message_id), '') is null
    or char_length(p_inbound_message_id) > 256
    or nullif(btrim(p_reply_to_message_id), '') is null
    or char_length(p_reply_to_message_id) > 256
    or coalesce(p_confirmation_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_sender_phone_e164, '') !~ '^[+][1-9][0-9]{7,14}$'
    or char_length(coalesce(p_sender_provider_id, '')) > 256 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_request_invalid');
  end if;

  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = p_intent_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_not_found');
  end if;

  select * into v_attempt
  from whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 a
  where a.webhook_event_id = p_confirmation_event_id;
  if found then
    if v_attempt.order_intent_id is distinct from v_intent.id then
      return jsonb_build_object('ok', false, 'error', 'confirmation_event_reused');
    end if;
    return jsonb_build_object(
      'ok', true,
      'intent_id', v_intent.id,
      'source_kind', v_intent.source_kind,
      'status', v_attempt.outcome,
      'order_id', v_attempt.order_id,
      'issue_code', v_attempt.issue_code,
      'quote_revision', v_intent.quote_revision,
      'summary_text', case
        when v_attempt.outcome = 'reprice_required'
        then v_intent.intake_snapshot ->> 'confirmation_summary_text'
      end,
      'duplicate', true
    );
  end if;

  select * into v_event
  from public.whatsapp_webhook_events_v1 e
  where e.id = p_confirmation_event_id
  for share;
  if not found
    or v_event.provider <> 'meta'
    or v_event.event_type <> 'message.received'
    or v_event.whatsapp_account_id is distinct from p_whatsapp_account_id
    or v_event.provider_event_id is distinct from 'message:' || p_inbound_message_id
    or v_event.provider_message_id is distinct from p_inbound_message_id
    or public.canonical_whatsapp_e164_br_v2(v_event.phone_e164) is distinct from p_sender_phone_e164 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_event_mismatch');
  end if;

  if v_intent.whatsapp_account_id is distinct from p_whatsapp_account_id
    or v_intent.meta_waba_id is distinct from btrim(p_meta_waba_id)
    or v_intent.meta_phone_number_id is distinct from btrim(p_meta_phone_number_id)
    or v_intent.conversation_id is distinct from p_conversation_id
    or public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164) is distinct from p_sender_phone_e164
    or (v_intent.sender_provider_id is not null and v_intent.sender_provider_id is distinct from nullif(btrim(p_sender_provider_id), '')) then
    return jsonb_build_object('ok', false, 'error', 'confirmation_sender_scope_mismatch');
  end if;

  select * into v_account
  from public.whatsapp_accounts a
  where a.id = p_whatsapp_account_id
    and a.is_active
    and a.waba_id = btrim(p_meta_waba_id)
    and a.phone_number_id = btrim(p_meta_phone_number_id)
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'confirmation_account_mismatch');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for share;
  if not found
    or (v_conversation.whatsapp_account_id is distinct from p_whatsapp_account_id
      and v_conversation.channel_account_id is distinct from p_whatsapp_account_id)
    or public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164) is distinct from p_sender_phone_e164 then
    return jsonb_build_object('ok', false, 'error', 'confirmation_conversation_mismatch');
  end if;

  if v_intent.source_kind = 'catalog' then
    return whatsapp_ordering_private.catalog_order_intent_confirm_v1(
      p_intent_id,
      p_confirmation_event_id,
      p_whatsapp_account_id,
      p_meta_waba_id,
      p_meta_phone_number_id,
      p_conversation_id,
      p_inbound_message_id,
      p_reply_to_message_id,
      p_confirmation_token_hash,
      p_sender_phone_e164,
      p_sender_provider_id
    );
  end if;

  if v_intent.status not in ('awaiting_confirmation', 'converted')
    or v_intent.source_kind <> 'flow'
    or v_intent.quote_revision < 1
    or v_intent.confirmation_token_hash is distinct from p_confirmation_token_hash then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'ignored', 'stale_or_unavailable_confirmation', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'status', 'ignored',
      'issue_code', 'stale_or_unavailable_confirmation'
    );
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164);
  if v_phone is null or v_phone is distinct from p_sender_phone_e164 then
    v_issue_code := 'confirmation_phone_unresolved';
  end if;

  v_idempotency_key := 'order-confirmation-intent:' || v_intent.id::text || ':quote:' || v_intent.quote_revision::text;
  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_idempotency_key
  for share;
  if found and v_outbox.status in ('queued', 'claimed') then
    return jsonb_build_object(
      'ok', false,
      'retryable', true,
      'error', 'confirmation_send_receipt_pending'
    );
  end if;
  if not found
    or v_outbox.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or v_outbox.conversation_id is distinct from v_intent.conversation_id
    or v_outbox.to_phone_e164 is distinct from v_phone
    or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.provider <> 'meta'
    or v_outbox.message_type <> 'interactive'
    or v_outbox.status <> 'sent'
    or v_outbox.provider_message_id is distinct from p_reply_to_message_id
    or v_intent.confirmation_message_id is distinct from p_reply_to_message_id
    or v_outbox.metadata ->> 'order_intent_id' is distinct from v_intent.id::text
    or v_outbox.metadata ->> 'quote_revision' is distinct from v_intent.quote_revision::text
    or v_outbox.metadata ->> 'summary_hash' is distinct from v_intent.summary_hash then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'ignored', 'confirmation_message_not_currently_sent', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'status', 'ignored',
      'issue_code', 'confirmation_message_not_currently_sent'
    );
  end if;

  if v_intent.status = 'converted' then
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, quote_revision, order_id
    ) values (
      p_confirmation_event_id, v_intent.id, 'already_converted', v_intent.quote_revision, v_intent.confirmed_order_id
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'status', 'already_converted',
      'order_id', v_intent.confirmed_order_id, 'duplicate', true
    );
  end if;

  if v_issue_code is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('whatsapp-customer:' || v_phone, 0)
    );
    select c.id into v_primary_customer_id
    from public.customers c
    where c.primary_whatsapp_e164 = v_phone
    for update;
    select cp.customer_id into v_linked_customer_id
    from public.customer_phones cp
    where cp.phone_e164 = v_phone
    for update;

    if v_primary_customer_id is not null
      and v_linked_customer_id is not null
      and v_primary_customer_id is distinct from v_linked_customer_id then
      v_issue_code := 'confirmation_customer_phone_conflict';
    else
      v_linked_customer_id := coalesce(v_primary_customer_id, v_linked_customer_id);
      if v_intent.customer_id is not null
        and v_intent.customer_id is distinct from v_linked_customer_id then
        v_issue_code := 'confirmation_customer_phone_conflict';
      elsif v_linked_customer_id is null then
        v_name := nullif(btrim(v_intent.customer_snapshot ->> 'name'), '');
        if v_intent.customer_id is not null then
          v_issue_code := 'confirmation_customer_phone_conflict';
        elsif v_name is null or char_length(v_name) > 180 then
          v_issue_code := 'confirmation_customer_name_missing';
        end if;
      else
        select * into v_customer
        from public.customers c
        where c.id = v_linked_customer_id
        for update;
        if not found or not v_customer.is_active then
          v_issue_code := 'confirmation_customer_unavailable';
        else
          v_name := coalesce(
            nullif(btrim(v_customer.name), ''),
            nullif(btrim(v_intent.customer_snapshot ->> 'name'), '')
          );
          if v_name is null or char_length(v_name) > 180 then
            v_issue_code := 'confirmation_customer_name_missing';
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null then
    v_address_id := null;
    if coalesce(v_intent.delivery_snapshot ->> 'address_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and jsonb_typeof(v_intent.delivery_snapshot -> 'new_address') is distinct from 'object'
      and jsonb_typeof(v_intent.delivery_snapshot -> 'address_snapshot') = 'object'
      and v_customer.id is not null then
      v_address_id := (v_intent.delivery_snapshot ->> 'address_id')::uuid;
      select * into v_address
      from public.customer_addresses a
      where a.id = v_address_id
        and a.customer_id = v_customer.id
        and a.is_active
      for update;
      if not found then
        v_issue_code := 'confirmation_address_unavailable';
      else
        v_address_json := jsonb_strip_nulls(jsonb_build_object(
          'address_id', v_address.id,
          'label', v_address.label,
          'street', v_address.street,
          'number', v_address.number,
          'complement', v_address.complement,
          'neighborhood', v_address.neighborhood,
          'city', v_address.city,
          'state', v_address.state,
          'postal_code', v_address.postal_code,
          'reference', v_address.reference
        ));
        if v_address_json is distinct from v_intent.delivery_snapshot -> 'address_snapshot' then
          v_issue_code := 'confirmation_address_changed';
        end if;
      end if;
    else
      v_new_address := v_intent.delivery_snapshot -> 'new_address';
      if nullif(btrim(coalesce(v_intent.delivery_snapshot ->> 'address_id', '')), '') is not null
        or jsonb_typeof(v_new_address) is distinct from 'object'
        or jsonb_typeof(v_intent.delivery_snapshot -> 'address_snapshot') = 'object'
        or nullif(btrim(v_new_address ->> 'street'), '') is null
        or char_length(v_new_address ->> 'street') > 180
        or nullif(btrim(v_new_address ->> 'number'), '') is null
        or char_length(v_new_address ->> 'number') > 40
        or nullif(btrim(v_new_address ->> 'neighborhood'), '') is null
        or char_length(v_new_address ->> 'neighborhood') > 120
        or nullif(btrim(v_new_address ->> 'city'), '') is null
        or char_length(v_new_address ->> 'city') > 120
        or coalesce(v_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
        or nullif(btrim(v_new_address ->> 'postal_code'), '') is null
        or char_length(v_new_address ->> 'postal_code') > 16
        or char_length(coalesce(v_new_address ->> 'complement', '')) > 120
        or char_length(coalesce(v_new_address ->> 'reference', '')) > 180 then
        v_issue_code := 'confirmation_address_snapshot_invalid';
      end if;
    end if;
  end if;

  if v_issue_code is null then
    if v_intent.flow_session_id is null then
      v_issue_code := 'confirmation_flow_session_missing';
    else
      select s.snapshot_json into v_flow_snapshot
      from whatsapp_ordering_private.whatsapp_flow_sessions_v2 fs
      join whatsapp_ordering_private.flow_catalog_snapshots_v1 s
        on s.snapshot_hash = fs.snapshot_hash
      where fs.id = v_intent.flow_session_id
        and fs.whatsapp_account_id = v_intent.whatsapp_account_id
        and fs.meta_waba_id = v_intent.meta_waba_id
        and fs.meta_phone_number_id = v_intent.meta_phone_number_id
        and fs.sender_phone_e164 = v_phone
        and fs.flow_schema_version = v_intent.flow_schema_version;
      if not found or jsonb_typeof(v_flow_snapshot -> 'positions') is distinct from 'array' then
        v_issue_code := 'confirmation_flow_snapshot_unavailable';
      elsif v_flow_snapshot ->> 'basket_template_id' is distinct from v_intent.quote_snapshot ->> 'basket_template_id'
        or v_flow_snapshot ->> 'basket_mold_id' is distinct from v_intent.quote_snapshot ->> 'basket_mold_id' then
        v_issue_code := 'confirmation_flow_snapshot_scope_mismatch';
      end if;
    end if;
  end if;

  if v_issue_code is null then
    if coalesce(v_intent.quote_snapshot ->> 'basket_template_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_intent.quote_snapshot ->> 'basket_mold_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or v_intent.quote_snapshot ->> 'schema_version' is distinct from 'sucedoan.whatsapp_flow_quote.v1'
      or v_intent.quote_snapshot ->> 'currency' is distinct from 'BRL'
      or coalesce(v_intent.payment_method, '') not in ('pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card')
      or jsonb_typeof(v_intent.intake_snapshot -> 'items') is distinct from 'array'
      or jsonb_typeof(v_intent.quote_snapshot -> 'items') is distinct from 'array' then
      v_issue_code := 'confirmation_quote_snapshot_invalid';
    else
      v_basket_id := (v_intent.quote_snapshot ->> 'basket_template_id')::uuid;
      v_mold_id := (v_intent.quote_snapshot ->> 'basket_mold_id')::uuid;
      v_intent_items := v_intent.intake_snapshot -> 'items';

      select * into v_template
      from public.basket_templates b
      where b.id = v_basket_id
        and b.is_active
        and b.is_whatsapp_active
      for share;
      if not found then
        v_issue_code := 'confirmation_basket_unavailable';
      else
        select * into v_mold
        from public.basket_molds m
        where m.id = v_mold_id and m.basket_id = v_template.id
        for share;
        if not found or v_mold.public_composition_count < 1 then
          v_issue_code := 'confirmation_basket_mold_unavailable';
        end if;
      end if;
    end if;
  end if;

  if v_issue_code is null then
    if jsonb_typeof(v_flow_snapshot -> 'positions') is distinct from 'array'
      or jsonb_typeof(v_intent_items) is distinct from 'array'
      or jsonb_typeof(v_intent.quote_snapshot -> 'items') is distinct from 'array' then
      v_issue_code := 'confirmation_position_count_invalid';
    elsif jsonb_array_length(v_flow_snapshot -> 'positions') not between 1 and 100
      or jsonb_array_length(v_intent_items) not between 1 and 100
      or jsonb_array_length(v_intent.quote_snapshot -> 'items') not between 1 and 100 then
      v_issue_code := 'confirmation_position_count_invalid';
    else
      select array_agg(lower(item.value ->> 'id') order by item.ordinal)
      into v_frozen_position_ids
      from jsonb_array_elements(v_flow_snapshot -> 'positions') with ordinality as item(value, ordinal);
      select array_agg(lower(item.value ->> 'position_id') order by item.ordinal)
      into v_submitted_position_ids
      from jsonb_array_elements(v_intent_items) with ordinality as item(value, ordinal);
      select array_agg(pos.id::text order by pos.sort_order, pos.id)
      into v_current_position_ids
      from public.basket_mold_positions pos
      where pos.mold_id = v_mold.id;

      perform pos.id
      from public.basket_mold_positions pos
      where pos.mold_id = v_mold.id
      order by pos.sort_order, pos.id
      for share;

      if v_frozen_position_ids is distinct from v_submitted_position_ids
        or v_current_position_ids is distinct from v_submitted_position_ids then
        v_issue_code := 'confirmation_basket_positions_changed';
      end if;
    end if;
  end if;

  if v_issue_code is null then
    if v_mold.hidden_adjustment < 0
      or v_mold.hidden_adjustment >= 10000000000
      or round(v_mold.hidden_adjustment, 2) <> v_mold.hidden_adjustment
      or v_mold.conditional_hidden_adjustment < 0
      or v_mold.conditional_hidden_adjustment >= 10000000000
      or round(v_mold.conditional_hidden_adjustment, 2) <> v_mold.conditional_hidden_adjustment then
      v_issue_code := 'confirmation_hidden_adjustment_invalid';
    else
      v_fixed_hidden_cents := round(v_mold.hidden_adjustment * 100)::bigint;
      for v_position in
        select pos.id, pos.label
        from public.basket_mold_positions pos
        where pos.mold_id = v_mold.id
        order by pos.sort_order, pos.id
        for share
      loop
        select item.value into v_input
        from jsonb_array_elements(v_intent_items) as item(value)
        where lower(item.value ->> 'position_id') = v_position.id::text;
        if not found
          or jsonb_typeof(v_input) is distinct from 'object'
          or coalesce(v_input ->> 'product_id', '')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(v_input ->> 'quantity', '') !~ '^(0|[1-6])$' then
          v_issue_code := 'confirmation_selection_invalid';
          exit;
        end if;
        v_product_id := (v_input ->> 'product_id')::uuid;
        v_quantity := (v_input ->> 'quantity')::integer;

        if not exists (
          select 1
          from jsonb_array_elements(v_flow_snapshot -> 'positions') as frozen(value)
          where lower(frozen.value ->> 'id') = v_position.id::text
            and exists (
              select 1
              from jsonb_array_elements(frozen.value -> 'options') as frozen_option(value)
              where lower(frozen_option.value ->> 'product_id') = v_product_id::text
            )
        ) then
          v_issue_code := 'confirmation_selection_outside_flow_snapshot';
          exit;
        end if;

        perform opt.id
        from public.basket_mold_position_options opt
        where opt.position_id = v_position.id
          and opt.product_id = v_product_id
        for share;
        if not found then
          v_issue_code := 'confirmation_selection_no_longer_offered';
          exit;
        end if;

        select * into v_product
        from public.products p
        where p.id = v_product_id
        for share;
        if not found then
          v_issue_code := 'confirmation_product_missing';
          exit;
        end if;
        if v_quantity > 0 and (not v_product.is_active or not v_product.is_whatsapp_active) then
          v_issue_code := 'confirmation_product_unavailable';
          exit;
        end if;

        if v_product.is_offer and v_product.offer_price is not null and v_product.offer_price >= 0 then
          v_unit_price := v_product.offer_price;
        else
          v_unit_price := v_product.price;
        end if;
        if v_unit_price is null
          or v_unit_price < 0
          or v_unit_price >= 10000000000
          or round(v_unit_price, 2) <> v_unit_price then
          if v_quantity = 0 then
            select quoted.value into v_input
            from jsonb_array_elements(v_intent.quote_snapshot -> 'items') as quoted(value)
            where lower(quoted.value ->> 'position_id') = v_position.id::text
              and lower(quoted.value ->> 'product_id') = v_product_id::text;
            if not found
              or coalesce(v_input ->> 'name', '') = ''
              or coalesce(v_input ->> 'unit_price_cents', '') !~ '^[0-9]{1,12}$' then
              v_issue_code := 'confirmation_zero_quantity_snapshot_invalid';
              exit;
            end if;
            v_name := regexp_replace(btrim(v_input ->> 'name'), '[[:space:]]+', ' ', 'g');
            v_unit_cents := (v_input ->> 'unit_price_cents')::bigint;
          else
            v_issue_code := 'confirmation_product_price_invalid';
            exit;
          end if;
        else
          v_name := regexp_replace(btrim(coalesce(v_product.name, '')), '[[:space:]]+', ' ', 'g');
          v_unit_cents := round(v_unit_price * 100)::bigint;
        end if;
        if v_name = '' or char_length(v_name) > 180 then
          v_issue_code := 'confirmation_product_name_invalid';
          exit;
        end if;

        v_line_cents := v_unit_cents * v_quantity;
        if v_line_cents > 999999999999 then
          v_issue_code := 'confirmation_line_total_invalid';
          exit;
        end if;
        v_items_total_cents := v_items_total_cents + v_line_cents;
        if v_items_total_cents > 999999999999 then
          v_issue_code := 'confirmation_order_total_invalid';
          exit;
        end if;
        if v_quantity > 0 then
          v_has_positive_item := true;
          if v_mold.conditional_hidden_enabled
            and v_mold.conditional_hidden_product_id = v_product_id then
            v_conditional_product_selected := true;
          end if;
          v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
            'product_id', v_product.id,
            'sku', v_product.sku,
            'name', v_name,
            'quantity', v_quantity,
            'unit_price_cents', v_unit_cents,
            'line_total_cents', v_line_cents,
            'metadata', jsonb_build_object(
              'source', 'whatsapp_flow',
              'history_kind', 'basket_mold_component',
              'basket_id', v_template.id,
              'basket_name', v_template.name,
              'basket_quantity', 1,
              'mold_id', v_mold.id,
              'position_id', v_position.id,
              'position_label', v_position.label,
              'composition_number', 1,
              'selected_quantity', v_quantity,
              'image_url', coalesce(v_product.image_url, '')
            )
          ));
        end if;
        v_current_items := v_current_items || jsonb_build_array(jsonb_build_object(
          'position_id', v_position.id,
          'product_id', v_product.id,
          'name', v_name,
          'quantity', v_quantity,
          'unit_price_cents', v_unit_cents,
          'line_total_cents', v_line_cents
        ));
        v_component_snapshot := v_component_snapshot || jsonb_build_array(jsonb_build_object(
          'position_id', v_position.id,
          'label', v_position.label,
          'product_id', v_product.id,
          'quantity', v_quantity
        ));
      end loop;
    end if;
  end if;

  if v_issue_code is null and not v_has_positive_item then
    v_issue_code := 'confirmation_empty_flow_order';
  end if;
  if v_issue_code is null and v_mold.conditional_hidden_enabled and v_conditional_product_selected then
    v_conditional_hidden_cents := round(v_mold.conditional_hidden_adjustment * 100)::bigint;
  end if;
  if v_issue_code is null then
    v_total_cents := v_items_total_cents + v_fixed_hidden_cents + v_conditional_hidden_cents;
    if v_total_cents < 0 or v_total_cents > 999999999999 then
      v_issue_code := 'confirmation_order_total_invalid';
    else
      v_quote := jsonb_build_object(
        'schema_version', 'sucedoan.whatsapp_flow_quote.v1',
        'basket_template_id', v_template.id,
        'basket_mold_id', v_mold.id,
        'currency', 'BRL',
        'calculated_at', v_now,
        'items', v_current_items,
        'items_total_cents', v_items_total_cents,
        'fixed_hidden_adjustment_cents', v_fixed_hidden_cents,
        'conditional_hidden_adjustment_cents', v_conditional_hidden_cents,
        'total_cents', v_total_cents,
        'reported_total_matches', case
          when coalesce(v_intent.intake_snapshot ->> 'flow_reported_total_cents', '') ~ '^[0-9]{1,12}$'
          then (v_intent.intake_snapshot ->> 'flow_reported_total_cents')::bigint = v_total_cents
          else false
        end
      );
      v_quote_changed :=
        (v_intent.quote_snapshot -> 'items') is distinct from (v_quote -> 'items')
        or v_intent.quote_snapshot ->> 'items_total_cents' is distinct from v_quote ->> 'items_total_cents'
        or v_intent.quote_snapshot ->> 'fixed_hidden_adjustment_cents' is distinct from v_quote ->> 'fixed_hidden_adjustment_cents'
        or v_intent.quote_snapshot ->> 'conditional_hidden_adjustment_cents' is distinct from v_quote ->> 'conditional_hidden_adjustment_cents'
        or v_intent.quote_snapshot ->> 'total_cents' is distinct from v_quote ->> 'total_cents'
        or v_intent.quote_snapshot ->> 'basket_template_id' is distinct from v_quote ->> 'basket_template_id'
        or v_intent.quote_snapshot ->> 'basket_mold_id' is distinct from v_quote ->> 'basket_mold_id';
    end if;
  end if;

  if v_issue_code is not null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = v_issue_code, updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', v_issue_code, v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'status', 'needs_review', 'issue_code', v_issue_code
    );
  end if;

  if v_quote_changed then
    if v_intent.quote_revision = 2147483647 then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_quote_revision_exhausted', updated_at = v_now
      where id = v_intent.id;
      insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
        webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
      ) values (
        p_confirmation_event_id, v_intent.id, 'needs_review', 'confirmation_quote_revision_exhausted', v_intent.quote_revision
      );
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;
    v_new_revision := v_intent.quote_revision + 1;
    v_summary := whatsapp_ordering_private.flow_confirmation_summary_v1(v_quote);
    if v_summary is null then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'confirmation_repriced_summary_invalid', updated_at = v_now
      where id = v_intent.id;
      insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
        webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
      ) values (
        p_confirmation_event_id, v_intent.id, 'needs_review', 'confirmation_repriced_summary_invalid', v_intent.quote_revision
      );
      return jsonb_build_object('ok', true, 'intent_id', v_intent.id, 'status', 'needs_review');
    end if;

    update public.whatsapp_outbox_v1
    set status = 'cancelled',
        last_error = 'quote_revision_superseded',
        payload = jsonb_set(
          payload,
          '{interactive,action,buttons,0,reply,id}',
          to_jsonb('[redacted]'::text),
          false
        ),
        updated_at = v_now
    where idempotency_key = 'order-confirmation-intent:' || v_intent.id::text || ':quote:' || v_intent.quote_revision::text
      and status = 'queued';

    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'reprice_required',
        quote_revision = v_new_revision,
        quote_total_cents = v_total_cents,
        currency = 'BRL',
        quote_snapshot = v_quote,
        intake_snapshot = jsonb_set(
          jsonb_set(intake_snapshot, '{server_quote}', v_quote, true),
          '{confirmation_summary_text}', to_jsonb(v_summary), true
        ),
        confirmation_token_hash = null,
        summary_hash = null,
        confirmation_message_id = null,
        last_error_code = 'quote_changed',
        quoted_at = v_now,
        updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'reprice_required', 'quote_changed', v_new_revision
    );
    return jsonb_build_object(
      'ok', true,
      'intent_id', v_intent.id,
      'status', 'reprice_required',
      'quote_revision', v_new_revision,
      'quote', v_quote,
      'summary_text', v_summary
    );
  end if;

  v_cart := jsonb_build_array(jsonb_build_object(
    'type', 'basket_mold',
    'id', v_template.id,
    'basket_id', v_template.id,
    'quantity', 1,
    'composition_number', 1,
    'components', v_component_snapshot
  ));
  v_separation_plan := jsonb_build_array(jsonb_build_object(
    'basket_id', v_template.id,
    'basket_name', v_template.name,
    'quantity', 1,
    'mold', jsonb_build_object(
      'mode', 'loose',
      'mold_id', v_mold.id,
      'composition_number', 1,
      'hidden_value_fixed', v_mold.hidden_adjustment,
      'conditional_hidden_value', v_conditional_hidden_cents / 100.0,
      'hidden_value_total', (v_fixed_hidden_cents + v_conditional_hidden_cents) / 100.0,
      'components', v_component_snapshot
    )
  ));
  v_order_number := 'DA-' || to_char(v_now at time zone 'America/Cuiaba', 'YYMMDD')
    || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  begin
    if v_customer.id is null then
      insert into public.customers (name, primary_whatsapp_e164)
      values (v_name, v_phone)
      on conflict (primary_whatsapp_e164) do nothing
      returning * into v_customer;
      if not found then
        select * into v_customer
        from public.customers c
        where c.primary_whatsapp_e164 = v_phone
        for update;
        if not found or not v_customer.is_active then
          raise exception 'whatsapp_order_customer_registration_conflict' using errcode = 'P0001';
        end if;
      end if;
    end if;

    if nullif(btrim(v_customer.name), '') is null then
      update public.customers
      set name = v_name, updated_at = v_now
      where id = v_customer.id
      returning * into v_customer;
    else
      v_name := v_customer.name;
    end if;

    insert into public.customer_phones (customer_id, phone_e164, is_primary, source, verified_at)
    values (v_customer.id, v_phone, coalesce(v_customer.primary_whatsapp_e164 = v_phone, false), 'whatsapp', v_now)
    on conflict (phone_e164) do nothing;
    select cp.customer_id into v_linked_customer_id
    from public.customer_phones cp
    where cp.phone_e164 = v_phone;
    if v_linked_customer_id is distinct from v_customer.id then
      raise exception 'whatsapp_order_customer_phone_conflict' using errcode = 'P0001';
    end if;

    if v_address_id is null then
      insert into public.customer_addresses (
        customer_id, label, street, number, complement, neighborhood, city, state,
        postal_code, reference, is_default, is_active, last_confirmed_at
      ) values (
        v_customer.id, 'WhatsApp', btrim(v_new_address ->> 'street'), btrim(v_new_address ->> 'number'),
        nullif(btrim(v_new_address ->> 'complement'), ''), btrim(v_new_address ->> 'neighborhood'),
        btrim(v_new_address ->> 'city'), v_new_address ->> 'state', btrim(v_new_address ->> 'postal_code'),
        nullif(btrim(v_new_address ->> 'reference'), ''),
        not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer.id and a.is_active),
        true, v_now
      ) returning * into v_address;
    else
      update public.customer_addresses
      set last_confirmed_at = v_now, updated_at = v_now
      where id = v_address_id
        and customer_id = v_customer.id
        and is_active
      returning * into v_address;
      if not found then
        raise exception 'whatsapp_order_address_changed_before_confirmation' using errcode = 'P0001';
      end if;
    end if;

    v_address_json := jsonb_strip_nulls(jsonb_build_object(
      'address_id', v_address.id,
      'label', v_address.label,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'neighborhood', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference
    ));
    v_delivery_snapshot := (coalesce(v_intent.delivery_snapshot, '{}'::jsonb) - 'new_address' - 'address_snapshot')
      || jsonb_build_object('address_id', v_address.id, 'address_snapshot', v_address_json);
    v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'customer_id', v_customer.id,
      'name', v_customer.name,
      'phone_e164', v_phone,
      'status', 'registered'
    ));
    v_delivery_address := jsonb_strip_nulls(jsonb_build_object(
      'customer_name', v_customer.name,
      'source_customer_id', v_customer.id,
      'phone', v_phone,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'district', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference,
      'customer_address_id', v_address.id,
      'google_maps_url', v_address.google_maps_url
    ));
    update public.whatsapp_outbox_v1
    set customer_id = v_customer.id, updated_at = v_now
    where id = v_outbox.id;

    insert into public.orders (
      id, customer_id, conversation_id, whatsapp_account_id, status, total, currency,
      delivery_address, customer_snapshot, confirmed_at, created_at, updated_at,
      basket_id, fiscal_subtotal, other_expenses, discount, sync_status, idempotency_key,
      payment_method, phone_e164, source, subtotal, order_number, basket_name_snapshot,
      checkout_snapshot, basket_hidden_adjustment, delivery_customer_address_id
    ) values (
      v_order_id, v_customer.id, v_intent.conversation_id, v_intent.whatsapp_account_id,
      'confirmed', v_total_cents / 100.0, 'BRL', v_delivery_address, v_customer_snapshot,
      v_now, v_now, v_now, v_template.id, v_items_total_cents / 100.0,
      (v_fixed_hidden_cents + v_conditional_hidden_cents) / 100.0, 0, 'local',
      'whatsapp-order-intent:' || v_intent.id::text, v_intent.payment_method,
      v_phone, 'manual_whatsapp', v_total_cents / 100.0, v_order_number, v_template.name,
      jsonb_build_object(
        'schema_version', 'sucedoan.whatsapp_checkout.v1',
        'source', 'whatsapp_order_intent',
        'origin', 'flow',
        'order_intent_id', v_intent.id,
        'flow_submission_message_id', v_intent.meta_message_id,
        'confirmation_message_id', v_intent.confirmation_message_id,
        'confirmation_event_id', p_confirmation_event_id,
        'quote_revision', v_intent.quote_revision,
        'currency', 'BRL',
        'payment_method', v_intent.payment_method,
        'customer_confirmed', true,
        'customer', v_customer_snapshot,
        'delivery', v_delivery_address,
        'cart', v_cart,
        'separation_plan', v_separation_plan,
        'component_snapshot', v_component_snapshot,
        'hidden_value_preserved', true
      ),
      (v_fixed_hidden_cents + v_conditional_hidden_cents) / 100.0,
      v_address.id
    );

    insert into public.order_items (
      order_id, product_id, sku_snapshot, name_snapshot, quantity, unit_price, line_total, metadata
    ) values (
      v_order_id, null, null, v_template.name, 1,
      v_total_cents / 100.0, v_total_cents / 100.0,
      jsonb_build_object(
        'source', 'whatsapp_flow',
        'history_kind', 'basket_mold',
        'basket_id', v_template.id,
        'basket_name', v_template.name,
        'mold_id', v_mold.id,
        'composition_number', 1,
        'hidden_value_fixed', v_mold.hidden_adjustment,
        'conditional_hidden_enabled', v_mold.conditional_hidden_enabled,
        'conditional_hidden_product_id', v_mold.conditional_hidden_product_id,
        'conditional_hidden_value', v_conditional_hidden_cents / 100.0,
        'hidden_value_total', (v_fixed_hidden_cents + v_conditional_hidden_cents) / 100.0,
        'hidden_value_preserved', true,
        'component_snapshot', v_component_snapshot,
        'image_url', coalesce(v_template.image_url, '')
      )
    );

    for v_line in select value from jsonb_array_elements(v_order_items)
    loop
      insert into public.order_items (
        order_id, product_id, sku_snapshot, name_snapshot, quantity, unit_price, line_total, metadata
      ) values (
        v_order_id, (v_line ->> 'product_id')::uuid, nullif(v_line ->> 'sku', ''),
        v_line ->> 'name', (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit_price_cents')::numeric / 100,
        (v_line ->> 'line_total_cents')::numeric / 100,
        coalesce(v_line -> 'metadata', '{}'::jsonb)
      );
    end loop;

    v_reservation := public.reserve_vitrine_order_stock_v1(v_order_id);
    if coalesce((v_reservation ->> 'ok')::boolean, false) is not true then
      raise exception 'whatsapp_order_stock_reservation_failed' using errcode = 'P0001';
    end if;

    insert into public.order_manual_separation_queue_v1 (order_id, selected_by, selected_source)
    values (v_order_id, null, 'customer_confirmed');

    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'converted',
        customer_id = v_customer.id,
        customer_snapshot = v_customer_snapshot,
        delivery_snapshot = v_delivery_snapshot,
        confirmed_order_id = v_order_id,
        confirmation_event_id = p_confirmation_event_id,
        confirmed_at = v_now,
        converted_at = v_now,
        last_error_code = null,
        updated_at = v_now
    where id = v_intent.id;

    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, quote_revision, order_id
    ) values (
      p_confirmation_event_id, v_intent.id, 'converted', v_intent.quote_revision, v_order_id
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_exception_message = message_text;
    if v_exception_message = 'whatsapp_order_stock_reservation_failed' then
      v_stock_failure := true;
    elsif v_exception_message = 'whatsapp_order_customer_registration_conflict' then
      v_issue_code := 'confirmation_customer_unavailable';
    elsif v_exception_message = 'whatsapp_order_customer_phone_conflict' then
      v_issue_code := 'confirmation_customer_phone_conflict';
    elsif v_exception_message = 'whatsapp_order_address_changed_before_confirmation' then
      v_issue_code := 'confirmation_address_unavailable';
    else
      raise;
    end if;
  end;

  if v_stock_failure then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'stock_reservation_failed', updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', 'stock_reservation_failed', v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'status', 'needs_review',
      'issue_code', 'stock_reservation_failed'
    );
  end if;

  if v_issue_code is not null then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = v_issue_code, updated_at = v_now
    where id = v_intent.id;
    insert into whatsapp_ordering_private.whatsapp_order_confirmation_events_v1 (
      webhook_event_id, order_intent_id, outcome, issue_code, quote_revision
    ) values (
      p_confirmation_event_id, v_intent.id, 'needs_review', v_issue_code, v_intent.quote_revision
    );
    return jsonb_build_object(
      'ok', true, 'intent_id', v_intent.id, 'status', 'needs_review', 'issue_code', v_issue_code
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_intent.id,
    'status', 'converted',
    'order_id', v_order_id,
    'order_number', v_order_number,
    'quote_revision', v_intent.quote_revision,
    'duplicate', false
  );
end;
$function$;

revoke all on function public.whatsapp_order_intent_confirm_v1(
  uuid, uuid, uuid, text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.whatsapp_order_intent_confirm_v1(
  uuid, uuid, uuid, text, text, uuid, text, text, text, text, text
) to service_role;

comment on function public.whatsapp_order_intent_confirm_v1(
  uuid, uuid, uuid, text, text, uuid, text, text, text, text, text
) is 'Service-role-only: accepts one durable Meta button event, reprices the Flow intent, and atomically creates a canonical confirmed order, reserves stock, queues separation and records the event outcome.';

-- This sender has a separate claim path from human attendance. It sends only
-- the explicit Flow order-confirmation row and never takes over a conversation.
create function public.whatsapp_order_confirmation_claim_v1(p_outbox_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_intent_id_text text;
  v_intent_id uuid;
  v_quote_revision_text text;
  v_quote_revision integer;
  v_summary text;
  v_button_id text;
  v_button_token text;
  v_channel text;
  v_catalog_quote_result jsonb;
  v_catalog_quote jsonb;
  v_catalog_quote_total_cents bigint;
  v_catalog_issue_code text;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok', false, 'error', 'outbox_id_required');
  end if;

  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id = p_outbox_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_found');
  end if;

  v_intent_id_text := v_outbox.metadata ->> 'order_intent_id';
  if coalesce(v_intent_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'outbox_intent_invalid');
  end if;
  v_intent_id := v_intent_id_text::uuid;

  -- Match the lock order used by prepare and confirmation RPCs: intent, then outbox.
  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = v_intent_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_not_found');
  end if;

  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id = p_outbox_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_found');
  end if;
  if v_outbox.status = 'sent' then
    return jsonb_build_object(
      'ok', true, 'status', 'sent', 'already_sent', true,
      'outbox_id', v_outbox.id, 'provider_message_id', v_outbox.provider_message_id
    );
  end if;
  if v_outbox.status = 'claimed' then
    if v_outbox.claimed_at is not null and v_outbox.claimed_at < now() - interval '3 minutes' then
      update public.whatsapp_outbox_v1
      set status = 'failed',
          last_error = 'delivery_unknown',
          payload = jsonb_set(
            v_outbox.payload,
            '{interactive,action,buttons,0,reply,id}',
            to_jsonb('[redacted]'::text),
            false
          ),
          updated_at = now()
      where id = v_outbox.id and status = 'claimed';
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'delivery_unknown', updated_at = now()
      where id = v_intent.id and status = 'awaiting_confirmation';
      return jsonb_build_object('ok', true, 'status', 'delivery_unknown', 'outbox_id', v_outbox.id);
    end if;
    return jsonb_build_object('ok', true, 'status', 'claimed', 'outbox_id', v_outbox.id);
  end if;
  if v_outbox.status <> 'queued' or v_outbox.available_at > now() then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_queued', 'status', v_outbox.status);
  end if;

  -- Catalog carts are repriced again at the last possible moment. A stale
  -- message is invalidated before the sender can see or deliver its payload.
  if v_intent.source_kind = 'catalog' then
    v_catalog_quote_result := whatsapp_ordering_private.catalog_quote_v1(
      v_intent.whatsapp_account_id,
      v_intent.catalog_id,
      v_intent.intake_snapshot -> 'items'
    );
    if coalesce((v_catalog_quote_result ->> 'ok')::boolean, false) is distinct from true
      or jsonb_typeof(v_catalog_quote_result -> 'quote') is distinct from 'object'
      or coalesce(v_catalog_quote_result #>> '{quote,total_cents}', '') !~ '^[0-9]{1,12}$'
      or jsonb_typeof(v_catalog_quote_result #> '{quote,items}') is distinct from 'array' then
      v_catalog_issue_code := case v_catalog_quote_result ->> 'issue_code'
        when 'catalog_product_mapping_unresolved' then 'catalog_product_mapping_unresolved'
        when 'catalog_product_price_unavailable' then 'catalog_product_price_unavailable'
        else 'catalog_quote_unavailable'
      end;
      update public.whatsapp_outbox_v1
      set status = 'failed', last_error = v_catalog_issue_code,
          payload = jsonb_set(
            v_outbox.payload,
            '{interactive,action,buttons,0,reply,id}',
            to_jsonb('[redacted]'::text),
            false
          ),
          updated_at = now()
      where id = v_outbox.id and status = 'queued';
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = v_catalog_issue_code,
          confirmation_token_hash = null, summary_hash = null,
          confirmation_message_id = null,
          intake_snapshot = intake_snapshot - 'confirmation_summary_text',
          updated_at = now()
      where id = v_intent.id and status = 'awaiting_confirmation';
      return jsonb_build_object('ok', true, 'status', 'needs_review', 'issue_code', v_catalog_issue_code);
    end if;

    v_catalog_quote := v_catalog_quote_result -> 'quote';
    v_catalog_quote_total_cents := (v_catalog_quote ->> 'total_cents')::bigint;
    if v_intent.quote_total_cents is distinct from v_catalog_quote_total_cents
      or v_intent.quote_snapshot -> 'items' is distinct from v_catalog_quote -> 'items' then
      if v_intent.quote_revision >= 2147483647 then
        update public.whatsapp_outbox_v1
        set status = 'failed', last_error = 'catalog_quote_revision_unavailable',
            payload = jsonb_set(
              v_outbox.payload,
              '{interactive,action,buttons,0,reply,id}',
              to_jsonb('[redacted]'::text),
              false
            ),
            updated_at = now()
        where id = v_outbox.id and status = 'queued';
        update whatsapp_ordering_private.whatsapp_order_intents_v1
        set status = 'needs_review', last_error_code = 'catalog_quote_revision_unavailable',
            confirmation_token_hash = null, summary_hash = null,
            confirmation_message_id = null,
            intake_snapshot = intake_snapshot - 'confirmation_summary_text',
            updated_at = now()
        where id = v_intent.id and status = 'awaiting_confirmation';
        return jsonb_build_object('ok', true, 'status', 'needs_review', 'issue_code', 'catalog_quote_revision_unavailable');
      end if;

      update public.whatsapp_outbox_v1
      set status = 'failed', last_error = 'catalog_reprice_required',
          payload = jsonb_set(
            v_outbox.payload,
            '{interactive,action,buttons,0,reply,id}',
            to_jsonb('[redacted]'::text),
            false
          ),
          updated_at = now()
      where id = v_outbox.id and status = 'queued';
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set quote_snapshot = v_catalog_quote,
          quote_total_cents = v_catalog_quote_total_cents,
          currency = 'BRL',
          quote_revision = quote_revision + 1,
          quoted_at = now(),
          status = 'reprice_required',
          last_error_code = 'catalog_reprice_required',
          confirmation_token_hash = null,
          summary_hash = null,
          confirmation_message_id = null,
          intake_snapshot = intake_snapshot - 'confirmation_summary_text',
          updated_at = now()
      where id = v_intent.id and status = 'awaiting_confirmation';
      return jsonb_build_object('ok', true, 'status', 'reprice_required', 'issue_code', 'catalog_reprice_required');
    end if;
  end if;

  v_summary := v_intent.intake_snapshot ->> 'confirmation_summary_text';
  v_quote_revision_text := v_outbox.metadata ->> 'quote_revision';
  if coalesce(v_quote_revision_text, '') ~ '^[1-9][0-9]{0,8}$' then
    v_quote_revision := v_quote_revision_text::integer;
  else
    v_quote_revision := null;
  end if;
  v_button_id := v_outbox.payload #>> '{interactive,action,buttons,0,reply,id}';
  v_button_token := split_part(coalesce(v_button_id, ''), ':', 3);
  if v_intent.status <> 'awaiting_confirmation'
    or v_intent.source_kind not in ('flow', 'catalog')
    or v_quote_revision is distinct from v_intent.quote_revision
    or v_outbox.metadata ->> 'summary_hash' is distinct from v_intent.summary_hash
    or v_outbox.metadata ->> 'order_intent_id' is distinct from v_intent.id::text
    or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.provider <> 'meta'
    or v_outbox.message_type <> 'interactive'
    or v_outbox.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or v_outbox.conversation_id is distinct from v_intent.conversation_id
    or public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) is distinct from public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164)
    or v_outbox.payload #>> '{type}' is distinct from 'interactive'
    or v_outbox.payload #>> '{interactive,type}' is distinct from 'button'
    or v_outbox.payload #>> '{interactive,body,text}' is distinct from v_summary
    or jsonb_typeof(v_outbox.payload #> '{interactive,action,buttons}') is distinct from 'array'
    or jsonb_array_length(case
      when jsonb_typeof(v_outbox.payload #> '{interactive,action,buttons}') = 'array'
        then v_outbox.payload #> '{interactive,action,buttons}'
      else '[]'::jsonb
    end) <> 1
    or v_outbox.payload #>> '{interactive,action,buttons,0,type}' is distinct from 'reply'
    or v_outbox.payload #>> '{interactive,action,buttons,0,reply,title}' is distinct from 'Confirmar pedido'
    or coalesce(v_button_id, '') !~ ('^order-confirm-v1:' || v_intent.id::text || ':[A-Za-z0-9_-]{43}$')
    or encode(sha256(convert_to(v_button_token, 'UTF8')), 'hex') is distinct from v_intent.confirmation_token_hash
    or encode(sha256(convert_to(coalesce(v_summary, ''), 'UTF8')), 'hex') is distinct from v_intent.summary_hash then
    update public.whatsapp_outbox_v1
    set status = 'failed', last_error = 'confirmation_payload_invalid',
        payload = jsonb_set(
          v_outbox.payload,
          '{interactive,action,buttons,0,reply,id}',
          to_jsonb('[redacted]'::text),
          false
        ),
        updated_at = now()
    where id = v_outbox.id and status = 'queued';
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_payload_invalid', updated_at = now()
    where id = v_intent.id and status = 'awaiting_confirmation';
    return jsonb_build_object('ok', true, 'status', 'needs_review', 'issue_code', 'confirmation_payload_invalid');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = v_intent.conversation_id
  for share;
  select * into v_account
  from public.whatsapp_accounts wa
  where wa.id = v_intent.whatsapp_account_id and wa.is_active = true
  for share;
  if v_conversation.id is null
    or v_account.id is null
    or v_conversation.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164) is distinct from v_intent.sender_phone_e164
    or public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) is distinct from v_intent.sender_phone_e164
    or v_account.phone_number_id is distinct from v_intent.meta_phone_number_id
    or v_account.waba_id is distinct from v_intent.meta_waba_id then
    update public.whatsapp_outbox_v1
    set status = 'failed', last_error = 'confirmation_route_mismatch',
        payload = jsonb_set(
          v_outbox.payload,
          '{interactive,action,buttons,0,reply,id}',
          to_jsonb('[redacted]'::text),
          false
        ),
        updated_at = now()
    where id = v_outbox.id and status = 'queued';
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_route_mismatch', updated_at = now()
    where id = v_intent.id and status = 'awaiting_confirmation';
    return jsonb_build_object('ok', true, 'status', 'needs_review', 'issue_code', 'confirmation_route_mismatch');
  end if;

  if v_conversation.last_inbound_at is null
    or now() >= v_conversation.last_inbound_at + interval '24 hours' then
    update public.whatsapp_outbox_v1
    set status = 'failed', last_error = 'service_window_closed',
        payload = jsonb_set(
          v_outbox.payload,
          '{interactive,action,buttons,0,reply,id}',
          to_jsonb('[redacted]'::text),
          false
        ),
        updated_at = now()
    where id = v_outbox.id and status = 'queued';
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = case
          when source_kind = 'catalog' and quote_revision < 2147483647 then 'reprice_required'
          else 'needs_review'
        end,
        quote_revision = case
          when source_kind = 'catalog' and quote_revision < 2147483647 then quote_revision + 1
          else quote_revision
        end,
        last_error_code = 'service_window_closed',
        confirmation_token_hash = null,
        summary_hash = null,
        confirmation_message_id = null,
        intake_snapshot = case when source_kind = 'catalog'
          then intake_snapshot - 'confirmation_summary_text'
          else intake_snapshot end,
        updated_at = now()
    where id = v_intent.id and status = 'awaiting_confirmation';
    return jsonb_build_object('ok', true, 'status', 'needs_review', 'issue_code', 'service_window_closed');
  end if;

  v_channel := case v_account.slug
    when 'dona-antonia-0975' then '0975'
    when 'dona-antonia-1018' then '1018'
    else null
  end;
  if v_channel is null
    or coalesce(v_account.phone_number_id, '') !~ '^[0-9]{6,32}$'
    or coalesce(v_account.waba_id, '') !~ '^[0-9]{6,32}$' then
    update public.whatsapp_outbox_v1
    set status = 'failed', last_error = 'sender_account_unavailable',
        payload = jsonb_set(
          v_outbox.payload,
          '{interactive,action,buttons,0,reply,id}',
          to_jsonb('[redacted]'::text),
          false
        ),
        updated_at = now()
    where id = v_outbox.id and status = 'queued';
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'sender_account_unavailable', updated_at = now()
    where id = v_intent.id and status = 'awaiting_confirmation';
    return jsonb_build_object('ok', true, 'status', 'needs_review', 'issue_code', 'sender_account_unavailable');
  end if;

  update public.whatsapp_outbox_v1
  set status = 'claimed', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now()
  where id = v_outbox.id and status = 'queued';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outbox_claim_race');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'claimed',
    'outbox_id', v_outbox.id,
    'order_intent_id', v_intent.id,
    'quote_revision', v_intent.quote_revision,
    'channel', v_channel,
    'phone_number_id', v_account.phone_number_id,
    'to_phone_e164', v_outbox.to_phone_e164,
    'payload', v_outbox.payload
  );
end;
$function$;

create function public.whatsapp_order_confirmation_finish_v1(
  p_outbox_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_intent_id_text text;
  v_intent_id uuid;
  v_revision integer;
  v_error text;
begin
  if p_outbox_id is null or p_outcome is null or p_outcome not in ('sent', 'failed', 'delivery_unknown') then
    return jsonb_build_object('ok', false, 'error', 'finish_request_invalid');
  end if;
  if p_outcome = 'sent'
    and coalesce(p_provider_message_id, '') !~ '^wamid\.[A-Za-z0-9_=-]{10,240}$' then
    return jsonb_build_object('ok', false, 'error', 'provider_message_id_invalid');
  end if;
  v_error := coalesce(nullif(p_error_code, ''), p_outcome);
  if v_error !~ '^[a-z0-9_]{1,80}$' then
    return jsonb_build_object('ok', false, 'error', 'error_code_invalid');
  end if;

  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id = p_outbox_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_found');
  end if;
  v_intent_id_text := v_outbox.metadata ->> 'order_intent_id';
  if coalesce(v_intent_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'outbox_intent_invalid');
  end if;
  v_intent_id := v_intent_id_text::uuid;
  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = v_intent_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_not_found');
  end if;
  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id = p_outbox_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_found');
  end if;
  if v_outbox.status = 'sent'
    and p_outcome = 'sent'
    and v_outbox.provider_message_id = p_provider_message_id then
    return jsonb_build_object('ok', true, 'status', 'sent', 'duplicate', true, 'outbox_id', v_outbox.id);
  end if;
  if v_outbox.status <> 'claimed' or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.provider <> 'meta' or v_outbox.message_type <> 'interactive' then
    return jsonb_build_object('ok', false, 'error', 'outbox_not_claimed');
  end if;
  if coalesce(v_outbox.metadata ->> 'quote_revision', '') !~ '^[1-9][0-9]{0,8}$' then
    return jsonb_build_object('ok', false, 'error', 'outbox_revision_invalid');
  end if;
  v_revision := (v_outbox.metadata ->> 'quote_revision')::integer;

  if p_outcome = 'sent' then
    update public.whatsapp_outbox_v1
    set status = 'sent', sent_at = now(), provider_message_id = p_provider_message_id,
        last_error = null,
        payload = jsonb_set(
          v_outbox.payload,
          '{interactive,action,buttons,0,reply,id}',
          to_jsonb('[redacted]'::text),
          false
        ),
        updated_at = now()
    where id = v_outbox.id and status = 'claimed';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'outbox_finish_race');
    end if;
    if v_intent.status = 'awaiting_confirmation'
      and v_intent.quote_revision = v_revision
      and v_intent.id = v_intent_id then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set confirmation_message_id = p_provider_message_id, updated_at = now()
      where id = v_intent.id and status = 'awaiting_confirmation' and quote_revision = v_revision;
      return jsonb_build_object('ok', true, 'status', 'sent', 'outbox_id', v_outbox.id, 'provider_message_id', p_provider_message_id);
    end if;
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'confirmation_intent_changed_after_send', updated_at = now()
    where id = v_intent.id and status = 'awaiting_confirmation';
    return jsonb_build_object('ok', true, 'status', 'sent_needs_review', 'outbox_id', v_outbox.id, 'provider_message_id', p_provider_message_id);
  end if;

  update public.whatsapp_outbox_v1
  set status = 'failed', last_error = v_error,
      payload = jsonb_set(
        v_outbox.payload,
        '{interactive,action,buttons,0,reply,id}',
        to_jsonb('[redacted]'::text),
        false
      ),
      updated_at = now()
  where id = v_outbox.id and status = 'claimed';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outbox_finish_race');
  end if;
  update whatsapp_ordering_private.whatsapp_order_intents_v1
  set status = 'needs_review', last_error_code = v_error, updated_at = now()
  where id = v_intent.id and status = 'awaiting_confirmation' and quote_revision = v_revision;
  return jsonb_build_object('ok', true, 'status', p_outcome, 'outbox_id', v_outbox.id);
end;
$function$;

revoke all on function public.whatsapp_order_confirmation_claim_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.whatsapp_order_confirmation_finish_v1(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_confirmation_claim_v1(uuid) to service_role;
grant execute on function public.whatsapp_order_confirmation_finish_v1(uuid, text, text, text) to service_role;

comment on function public.whatsapp_order_confirmation_claim_v1(uuid)
  is 'Service-role-only, idempotent claim for one confirmed Flow quote; validates the active account, current quote, signed button capability and 24-hour Meta window without taking over the conversation.';
comment on function public.whatsapp_order_confirmation_finish_v1(uuid, text, text, text)
  is 'Service-role-only receipt transition for the dedicated Flow confirmation sender; stores Meta acceptance, scrubs the raw button token, and never retries an ambiguous delivery.';

-- Resolve only an exact canonical phone match for the authenticated Admin
-- projection; do not merge by name or digit variants.
create function whatsapp_ordering_private.catalog_customer_admin_context_v1(p_phone_e164 text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_phone text;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_customer public.customers%rowtype;
  v_address_count integer := 0;
  v_default_count integer := 0;
  v_suggested_address_id uuid;
  v_addresses jsonb := '[]'::jsonb;
  v_address_state text;
begin
  v_phone := public.canonical_whatsapp_e164_br_v2(p_phone_e164);
  if v_phone is null then
    return jsonb_build_object(
      'state', 'phone_missing',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_missing'
    );
  end if;

  select c.id into v_primary_customer_id
  from public.customers c
  where c.primary_whatsapp_e164 = v_phone;

  select cp.customer_id into v_linked_customer_id
  from public.customer_phones cp
  where cp.phone_e164 = v_phone;

  if v_primary_customer_id is not null
    and v_linked_customer_id is not null
    and v_primary_customer_id is distinct from v_linked_customer_id then
    return jsonb_build_object(
      'state', 'phone_conflict',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_review'
    );
  end if;

  if coalesce(v_primary_customer_id, v_linked_customer_id) is null then
    return jsonb_build_object(
      'state', 'not_found',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_missing'
    );
  end if;

  select * into v_customer
  from public.customers c
  where c.id = coalesce(v_primary_customer_id, v_linked_customer_id);

  if not found or v_customer.is_active is not true then
    return jsonb_build_object(
      'state', 'inactive',
      'customer', null,
      'addresses', '[]'::jsonb,
      'suggested_address_id', null,
      'address_state', 'address_review'
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (where a.is_default is true)::integer
  into v_address_count, v_default_count
  from public.customer_addresses a
  where a.customer_id = v_customer.id
    and a.is_active is true;

  if v_default_count = 1 then
    select a.id into v_suggested_address_id
    from public.customer_addresses a
    where a.customer_id = v_customer.id
      and a.is_active is true
      and a.is_default is true
    limit 1;
  elsif v_default_count = 0 and v_address_count = 1 then
    select a.id into v_suggested_address_id
    from public.customer_addresses a
    where a.customer_id = v_customer.id
      and a.is_active is true
    limit 1;
  end if;

  v_address_state := case
    when v_default_count > 1 then 'address_review'
    when v_suggested_address_id is not null then 'address_suggested'
    when v_address_count > 1 then 'address_choice_required'
    else 'address_missing'
  end;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', address_row.id,
      'label', address_row.label,
      'street', address_row.street,
      'number', address_row.number,
      'complement', address_row.complement,
      'neighborhood', address_row.neighborhood,
      'city', address_row.city,
      'state', address_row.state,
      'postal_code', address_row.postal_code,
      'reference', address_row.reference,
      'is_default', address_row.is_default
    ) order by address_row.is_default desc, address_row.id
  ), '[]'::jsonb)
  into v_addresses
  from (
    select a.*
    from public.customer_addresses a
    where a.customer_id = v_customer.id
      and a.is_active is true
    order by a.is_default desc, a.id
    limit 20
  ) address_row;

  return jsonb_build_object(
    'state', 'matched',
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name
    ),
    'addresses', v_addresses,
    'suggested_address_id', v_suggested_address_id,
    'address_state', v_address_state
  );
end;
$function$;

revoke all on function whatsapp_ordering_private.catalog_customer_admin_context_v1(text)
  from public, anon, authenticated, service_role;

-- Authenticated Admin preparation for a native Catalog cart. Customer and
-- address input remains in the private intent snapshots until the customer
-- explicitly confirms the final WhatsApp summary.
create function public.whatsapp_order_intent_catalog_prepare_admin_v1(
  p_intent_id uuid,
  p_payment_method text,
  p_customer_name text,
  p_address_id uuid,
  p_new_address jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_phone text;
  v_name text;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_customer_id uuid;
  v_address_snapshot jsonb;
  v_delivery_snapshot jsonb;
  v_customer_snapshot jsonb;
  v_new_address jsonb;
  v_quote_result jsonb;
  v_quote jsonb;
  v_quote_total_cents bigint;
  v_quote_revision integer;
  v_status text;
  v_quote_changed boolean := false;
  v_payment_method text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  if p_intent_id is null
    or p_payment_method is null
    or p_payment_method not in ('pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card')
    or (p_customer_name is not null and char_length(btrim(p_customer_name)) > 180)
    or (p_new_address is not null and jsonb_typeof(p_new_address) not in ('object', 'null')) then
    return jsonb_build_object('ok', false, 'error', 'catalog_preparation_invalid');
  end if;

  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = p_intent_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_not_found');
  end if;
  if v_intent.source_kind <> 'catalog' then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_required');
  end if;
  if v_intent.status not in ('received', 'reprice_required')
    and not (
      v_intent.status = 'needs_review'
      and v_intent.last_error_code in (
        'catalog_product_mapping_unresolved',
        'catalog_product_price_unavailable'
      )
    ) then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_not_ready');
  end if;
  if v_intent.conversation_id is null or nullif(btrim(v_intent.catalog_id), '') is null then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_scope_invalid');
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'catalog_phone_missing');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = v_intent.conversation_id
    and (c.whatsapp_account_id = v_intent.whatsapp_account_id
      or c.channel_account_id = v_intent.whatsapp_account_id)
    and public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164) = v_phone
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'catalog_conversation_mismatch');
  end if;

  select * into v_account
  from public.whatsapp_accounts wa
  where wa.id = v_intent.whatsapp_account_id
    and wa.is_active is true
    and wa.waba_id = v_intent.meta_waba_id
    and wa.phone_number_id = v_intent.meta_phone_number_id
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'catalog_account_mismatch');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('whatsapp-customer:' || v_phone, 0));
  select c.id into v_primary_customer_id
  from public.customers c
  where c.primary_whatsapp_e164 = v_phone
  for update;
  select cp.customer_id into v_linked_customer_id
  from public.customer_phones cp
  where cp.phone_e164 = v_phone
  for update;
  if v_primary_customer_id is not null
    and v_linked_customer_id is not null
    and v_primary_customer_id is distinct from v_linked_customer_id then
    return jsonb_build_object('ok', false, 'error', 'catalog_customer_phone_conflict');
  end if;

  v_customer_id := coalesce(v_primary_customer_id, v_linked_customer_id);
  if v_customer_id is not null then
    select * into v_customer
    from public.customers c
    where c.id = v_customer_id
    for update;
    if not found or v_customer.is_active is not true
      or (v_intent.customer_id is not null and v_intent.customer_id is distinct from v_customer.id) then
      return jsonb_build_object('ok', false, 'error', 'catalog_customer_phone_conflict');
    end if;
    v_name := coalesce(nullif(btrim(v_customer.name), ''), nullif(btrim(p_customer_name), ''));
    if v_name is null then
      return jsonb_build_object('ok', false, 'error', 'catalog_customer_name_required');
    end if;
  else
    if v_intent.customer_id is not null then
      return jsonb_build_object('ok', false, 'error', 'catalog_customer_phone_conflict');
    end if;
    v_name := nullif(btrim(p_customer_name), '');
    if v_name is null then
      return jsonb_build_object('ok', false, 'error', 'catalog_customer_name_required');
    end if;
  end if;

  if p_address_id is not null and jsonb_typeof(p_new_address) = 'object' then
    return jsonb_build_object('ok', false, 'error', 'catalog_address_choice_invalid');
  elsif p_address_id is not null then
    if v_customer_id is null then
      return jsonb_build_object('ok', false, 'error', 'catalog_address_customer_missing');
    end if;
    select * into v_address
    from public.customer_addresses a
    where a.id = p_address_id
      and a.customer_id = v_customer_id
      and a.is_active is true
    for share;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'catalog_address_unavailable');
    end if;
    v_address_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'address_id', v_address.id,
      'label', v_address.label,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'neighborhood', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference
    ));
    v_delivery_snapshot := jsonb_build_object(
      'address_id', v_address.id,
      'address_snapshot', v_address_snapshot
    );
  elsif jsonb_typeof(p_new_address) = 'object' then
    if exists (
      select 1 from jsonb_object_keys(p_new_address) as address_key(key_name)
      where key_name not in ('street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal_code', 'reference')
    )
      or jsonb_typeof(p_new_address -> 'street') is distinct from 'string'
      or nullif(btrim(p_new_address ->> 'street'), '') is null
      or char_length(p_new_address ->> 'street') > 180
      or jsonb_typeof(p_new_address -> 'number') is distinct from 'string'
      or nullif(btrim(p_new_address ->> 'number'), '') is null
      or char_length(p_new_address ->> 'number') > 40
      or (p_new_address ? 'complement' and jsonb_typeof(p_new_address -> 'complement') is distinct from 'string')
      or char_length(coalesce(p_new_address ->> 'complement', '')) > 120
      or jsonb_typeof(p_new_address -> 'neighborhood') is distinct from 'string'
      or nullif(btrim(p_new_address ->> 'neighborhood'), '') is null
      or char_length(p_new_address ->> 'neighborhood') > 120
      or jsonb_typeof(p_new_address -> 'city') is distinct from 'string'
      or nullif(btrim(p_new_address ->> 'city'), '') is null
      or char_length(p_new_address ->> 'city') > 120
      or jsonb_typeof(p_new_address -> 'state') is distinct from 'string'
      or coalesce(p_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
      or jsonb_typeof(p_new_address -> 'postal_code') is distinct from 'string'
      or nullif(btrim(p_new_address ->> 'postal_code'), '') is null
      or char_length(p_new_address ->> 'postal_code') > 16
      or (p_new_address ? 'reference' and jsonb_typeof(p_new_address -> 'reference') is distinct from 'string')
      or char_length(coalesce(p_new_address ->> 'reference', '')) > 180 then
      return jsonb_build_object('ok', false, 'error', 'catalog_address_invalid');
    end if;
    v_new_address := jsonb_strip_nulls(jsonb_build_object(
      'street', btrim(p_new_address ->> 'street'),
      'number', btrim(p_new_address ->> 'number'),
      'complement', nullif(btrim(p_new_address ->> 'complement'), ''),
      'neighborhood', btrim(p_new_address ->> 'neighborhood'),
      'city', btrim(p_new_address ->> 'city'),
      'state', p_new_address ->> 'state',
      'postal_code', btrim(p_new_address ->> 'postal_code'),
      'reference', nullif(btrim(p_new_address ->> 'reference'), '')
    ));
    v_delivery_snapshot := jsonb_build_object('new_address', v_new_address);
  else
    return jsonb_build_object('ok', false, 'error', 'catalog_address_required');
  end if;

  v_payment_method := p_payment_method;
  v_quote_result := whatsapp_ordering_private.catalog_quote_v1(
    v_intent.whatsapp_account_id,
    v_intent.catalog_id,
    v_intent.intake_snapshot -> 'items'
  );
  if coalesce((v_quote_result ->> 'ok')::boolean, false) is distinct from true
    or jsonb_typeof(v_quote_result -> 'quote') is distinct from 'object'
    or coalesce(v_quote_result #>> '{quote,total_cents}', '') !~ '^[0-9]{1,12}$'
    or jsonb_typeof(v_quote_result #> '{quote,items}') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'catalog_quote_unavailable');
  end if;
  v_quote := v_quote_result -> 'quote';
  v_quote_total_cents := (v_quote ->> 'total_cents')::bigint;
  v_quote_changed := v_intent.quote_total_cents is distinct from v_quote_total_cents
    or v_intent.quote_snapshot -> 'items' is distinct from v_quote -> 'items';
  v_quote_revision := v_intent.quote_revision;
  v_status := v_intent.status;
  if v_intent.quote_total_cents is null then
    if v_intent.quote_revision >= 2147483647 then
      return jsonb_build_object('ok', false, 'error', 'catalog_quote_revision_unavailable');
    end if;
    v_quote_revision := greatest(v_intent.quote_revision, 0) + 1;
    v_status := 'received';
  elsif v_quote_changed then
    if v_intent.quote_revision >= 2147483646 then
      return jsonb_build_object('ok', false, 'error', 'catalog_quote_revision_unavailable');
    end if;
    v_quote_revision := v_intent.quote_revision + 1;
    v_status := 'reprice_required';
  end if;

  v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'customer_id', v_customer_id,
    'name', v_name,
    'phone_e164', v_phone
  ));

  update whatsapp_ordering_private.whatsapp_order_intents_v1
  set customer_id = v_customer_id,
      customer_snapshot = v_customer_snapshot,
      delivery_snapshot = v_delivery_snapshot,
      payment_method = v_payment_method,
      quote_snapshot = v_quote,
      quote_total_cents = v_quote_total_cents,
      currency = 'BRL',
      quote_revision = v_quote_revision,
      status = v_status,
      quoted_at = case when v_quote_changed or quoted_at is null then now() else quoted_at end,
      last_error_code = null,
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_intent.id,
    'status', v_status,
    'quote_revision', v_quote_revision,
    'total_cents', v_quote_total_cents,
    'customer_id', v_customer_id,
    'address_id', p_address_id,
    'quote_changed', v_quote_changed,
    'preparation_ready', true
  );
end;
$function$;

revoke all on function public.whatsapp_order_intent_catalog_prepare_admin_v1(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_intent_catalog_prepare_admin_v1(uuid, text, text, uuid, jsonb)
  to authenticated;
comment on function public.whatsapp_order_intent_catalog_prepare_admin_v1(uuid, text, text, uuid, jsonb)
  is 'Authenticated staff-only Catalog preparation; resolves the exact phone and validates a private customer/address/payment draft without writing canonical customer, address, order, stock, or outbox records.';

-- Reprice and enqueue one Catalog confirmation after an explicit staff action.
-- The random reply token is generated inside PostgreSQL and leaves only in the
-- protected outbox payload; the RPC response contains no token or message body.
create function public.whatsapp_order_intent_catalog_confirmation_prepare_admin_v1(
  p_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_intent whatsapp_ordering_private.whatsapp_order_intents_v1%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_primary_customer_id uuid;
  v_linked_customer_id uuid;
  v_customer_id uuid;
  v_address_id uuid;
  v_phone text;
  v_customer_name text;
  v_address_json jsonb;
  v_new_address jsonb;
  v_delivery_snapshot jsonb;
  v_customer_snapshot jsonb;
  v_quote_result jsonb;
  v_quote jsonb;
  v_quote_total_cents bigint;
  v_quote_revision integer;
  v_quote_changed boolean;
  v_status text;
  v_summary text;
  v_item_lines text;
  v_address_text text;
  v_payment_label text;
  v_integer_part text;
  v_total_display text;
  v_button_token text;
  v_button_id text;
  v_payload jsonb;
  v_summary_hash text;
  v_token_hash text;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    if auth.role() is distinct from 'service_role' then
      return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
    end if;
  else
    v_access := public.ops2_admin_attendance_customer_access_v1(false);
    if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
      return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
    end if;
  end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_id_required');
  end if;

  select * into v_intent
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.id = p_intent_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_not_found');
  end if;
  if v_intent.source_kind <> 'catalog' then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_required');
  end if;

  v_idempotency_key := 'catalog-order-confirmation-intent:' || v_intent.id::text
    || ':quote:' || v_intent.quote_revision::text;
  if v_intent.status = 'awaiting_confirmation' then
    select * into v_outbox
    from public.whatsapp_outbox_v1 o
    where o.idempotency_key = v_idempotency_key
      and o.purpose = 'order_confirmation'
    for update;
    if found
      and v_outbox.whatsapp_account_id = v_intent.whatsapp_account_id
      and v_outbox.conversation_id = v_intent.conversation_id
      and v_outbox.metadata ->> 'source_kind' = 'catalog' then
      return jsonb_build_object(
        'ok', true,
        'intent_id', v_intent.id,
        'status', v_intent.status,
        'outbox_id', v_outbox.id,
        'duplicate', true
      );
    end if;
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'catalog_confirmation_outbox_missing', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_outbox_missing');
  end if;
  if v_intent.status not in ('received', 'reprice_required')
    and not (
      v_intent.status = 'needs_review'
      and v_intent.last_error_code in (
        'catalog_product_mapping_unresolved',
        'catalog_product_price_unavailable',
        'service_window_closed'
      )
    ) then
    return jsonb_build_object('ok', false, 'error', 'catalog_intent_not_ready');
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_intent.sender_phone_e164);
  if v_phone is null or v_intent.conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_identity_unavailable');
  end if;
  select * into v_conversation
  from public.conversations c
  where c.id = v_intent.conversation_id
    and c.whatsapp_account_id = v_intent.whatsapp_account_id
    and public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164) = v_phone
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_conversation_mismatch');
  end if;
  if v_conversation.last_inbound_at is null
    or now() >= v_conversation.last_inbound_at + interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'service_window_closed');
  end if;
  select * into v_account
  from public.whatsapp_accounts wa
  where wa.id = v_intent.whatsapp_account_id
    and wa.is_active is true
    and wa.waba_id = v_intent.meta_waba_id
    and wa.phone_number_id = v_intent.meta_phone_number_id
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_account_mismatch');
  end if;
  if v_intent.payment_method is null
    or v_intent.payment_method not in ('pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card') then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_payment_missing');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('whatsapp-customer:' || v_phone, 0));
  select c.id into v_primary_customer_id
  from public.customers c
  where c.primary_whatsapp_e164 = v_phone
  for update;
  select cp.customer_id into v_linked_customer_id
  from public.customer_phones cp
  where cp.phone_e164 = v_phone
  for update;
  if v_primary_customer_id is not null
    and v_linked_customer_id is not null
    and v_primary_customer_id is distinct from v_linked_customer_id then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'catalog_confirmation_customer_conflict', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_customer_conflict');
  end if;
  v_customer_id := coalesce(v_primary_customer_id, v_linked_customer_id);
  if v_customer_id is not null then
    select * into v_customer
    from public.customers c
    where c.id = v_customer_id
    for share;
    if not found or v_customer.is_active is not true
      or (v_intent.customer_id is not null and v_intent.customer_id is distinct from v_customer.id) then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'catalog_confirmation_customer_conflict', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_customer_conflict');
    end if;
    v_customer_name := coalesce(nullif(btrim(v_customer.name), ''), nullif(btrim(v_intent.customer_snapshot ->> 'name'), ''));
  else
    if v_intent.customer_id is not null then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'catalog_confirmation_customer_conflict', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_customer_conflict');
    end if;
    v_customer_name := nullif(btrim(v_intent.customer_snapshot ->> 'name'), '');
  end if;
  if v_customer_name is null or char_length(v_customer_name) > 180 then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_customer_name_missing');
  end if;

  v_delivery_snapshot := v_intent.delivery_snapshot;
  if nullif(btrim(coalesce(v_delivery_snapshot ->> 'address_id', '')), '') is not null then
    if v_customer_id is null
      or coalesce(v_delivery_snapshot ->> 'address_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_delivery_snapshot -> 'new_address') = 'object' then
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_address_invalid');
    end if;
    v_address_id := (v_delivery_snapshot ->> 'address_id')::uuid;
    select * into v_address
    from public.customer_addresses a
    where a.id = v_address_id
      and a.customer_id = v_customer_id
      and a.is_active is true
    for share;
    if not found then
      update whatsapp_ordering_private.whatsapp_order_intents_v1
      set status = 'needs_review', last_error_code = 'catalog_confirmation_address_unavailable', updated_at = now()
      where id = v_intent.id;
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_address_unavailable');
    end if;
    v_address_json := jsonb_strip_nulls(jsonb_build_object(
      'address_id', v_address.id,
      'label', v_address.label,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'neighborhood', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'reference', v_address.reference
    ));
    v_delivery_snapshot := jsonb_build_object(
      'address_id', v_address.id,
      'address_snapshot', v_address_json
    );
  else
    v_new_address := v_delivery_snapshot -> 'new_address';
    if jsonb_typeof(v_new_address) is distinct from 'object'
      or exists (
        select 1 from jsonb_object_keys(v_new_address) as address_key(key_name)
        where key_name not in ('street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal_code', 'reference')
      )
      or jsonb_typeof(v_new_address -> 'street') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'street'), '') is null
      or char_length(v_new_address ->> 'street') > 180
      or jsonb_typeof(v_new_address -> 'number') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'number'), '') is null
      or char_length(v_new_address ->> 'number') > 40
      or (v_new_address ? 'complement' and jsonb_typeof(v_new_address -> 'complement') is distinct from 'string')
      or char_length(coalesce(v_new_address ->> 'complement', '')) > 120
      or jsonb_typeof(v_new_address -> 'neighborhood') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'neighborhood'), '') is null
      or char_length(v_new_address ->> 'neighborhood') > 120
      or jsonb_typeof(v_new_address -> 'city') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'city'), '') is null
      or char_length(v_new_address ->> 'city') > 120
      or jsonb_typeof(v_new_address -> 'state') is distinct from 'string'
      or coalesce(v_new_address ->> 'state', '') !~ '^[A-Z]{2}$'
      or jsonb_typeof(v_new_address -> 'postal_code') is distinct from 'string'
      or nullif(btrim(v_new_address ->> 'postal_code'), '') is null
      or char_length(v_new_address ->> 'postal_code') > 16
      or (v_new_address ? 'reference' and jsonb_typeof(v_new_address -> 'reference') is distinct from 'string')
      or char_length(coalesce(v_new_address ->> 'reference', '')) > 180 then
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_address_invalid');
    end if;
    v_new_address := jsonb_strip_nulls(jsonb_build_object(
      'street', btrim(v_new_address ->> 'street'),
      'number', btrim(v_new_address ->> 'number'),
      'complement', nullif(btrim(v_new_address ->> 'complement'), ''),
      'neighborhood', btrim(v_new_address ->> 'neighborhood'),
      'city', btrim(v_new_address ->> 'city'),
      'state', v_new_address ->> 'state',
      'postal_code', btrim(v_new_address ->> 'postal_code'),
      'reference', nullif(btrim(v_new_address ->> 'reference'), '')
    ));
    v_delivery_snapshot := jsonb_build_object('new_address', v_new_address);
  end if;

  v_quote_result := whatsapp_ordering_private.catalog_quote_v1(
    v_intent.whatsapp_account_id,
    v_intent.catalog_id,
    v_intent.intake_snapshot -> 'items'
  );
  if coalesce((v_quote_result ->> 'ok')::boolean, false) is distinct from true
    or jsonb_typeof(v_quote_result -> 'quote') is distinct from 'object'
    or coalesce(v_quote_result #>> '{quote,total_cents}', '') !~ '^[0-9]{1,12}$'
    or jsonb_typeof(v_quote_result #> '{quote,items}') is distinct from 'array' then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set status = 'needs_review', last_error_code = 'catalog_confirmation_quote_unavailable', updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_quote_unavailable');
  end if;
  v_quote := v_quote_result -> 'quote';
  v_quote_total_cents := (v_quote ->> 'total_cents')::bigint;
  v_quote_changed := v_intent.quote_total_cents is distinct from v_quote_total_cents
    or v_intent.quote_snapshot -> 'items' is distinct from v_quote -> 'items';
  v_quote_revision := v_intent.quote_revision;
  v_status := v_intent.status;
  if v_intent.quote_total_cents is null then
    if v_intent.quote_revision >= 2147483647 then
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_revision_unavailable');
    end if;
    v_quote_revision := greatest(v_intent.quote_revision, 0) + 1;
    v_status := 'received';
    v_quote_changed := true;
  elsif v_quote_changed then
    if v_intent.quote_revision >= 2147483646 then
      return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_revision_unavailable');
    end if;
    v_quote_revision := v_intent.quote_revision + 1;
    v_status := 'reprice_required';
  elsif v_intent.status = 'needs_review' then
    v_status := 'received';
  end if;

  v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'customer_id', v_customer_id,
    'name', v_customer_name,
    'phone_e164', v_phone
  ));
  if v_quote_changed then
    update whatsapp_ordering_private.whatsapp_order_intents_v1
    set customer_id = v_customer_id,
        customer_snapshot = v_customer_snapshot,
        delivery_snapshot = v_delivery_snapshot,
        quote_snapshot = v_quote,
        quote_total_cents = v_quote_total_cents,
        currency = 'BRL',
        quote_revision = v_quote_revision,
        status = v_status,
        quoted_at = now(),
        confirmation_token_hash = null,
        summary_hash = null,
        confirmation_message_id = null,
        last_error_code = null,
        updated_at = now()
    where id = v_intent.id;
    return jsonb_build_object(
      'ok', true,
      'intent_id', v_intent.id,
      'status', v_status,
      'quote_revision', v_quote_revision,
      'total_cents', v_quote_total_cents,
      'quote_changed', true,
      'outbox_id', null
    );
  end if;

  v_payment_label := case v_intent.payment_method
    when 'pix' then 'Pix'
    when 'cash' then 'Dinheiro'
    when 'debit_card' then 'Cartão de débito'
    when 'credit_card' then 'Cartão de crédito'
    when 'food_card' then 'Vale-alimentação'
    when 'meal_card' then 'Vale-refeição'
    else null
  end;
  select string_agg(
    '• ' || (round((line.value ->> 'quantity')::numeric)::bigint)::text
      || ' × ' || left(btrim(regexp_replace(coalesce(line.value ->> 'name', ''), '[[:cntrl:]]+', ' ', 'g')), 100),
    E'\n' order by line.ordinality
  )
  into v_item_lines
  from jsonb_array_elements(v_quote -> 'items') with ordinality as line(value, ordinality)
  where nullif(btrim(line.value ->> 'name'), '') is not null
    and coalesce(line.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$';
  if nullif(v_item_lines, '') is null
    or (select count(*) from jsonb_array_elements(v_quote -> 'items')) <>
      (select count(*) from jsonb_array_elements(v_quote -> 'items') line(value)
       where nullif(btrim(line.value ->> 'name'), '') is not null
         and coalesce(line.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$') then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_items_invalid');
  end if;

  v_address_text := concat_ws(', ',
    nullif(btrim(v_delivery_snapshot #>> '{address_snapshot,street}') || ', ' || btrim(v_delivery_snapshot #>> '{address_snapshot,number}'), ', '),
    nullif(btrim(v_delivery_snapshot #>> '{address_snapshot,complement}'), ''),
    nullif(btrim(v_delivery_snapshot #>> '{address_snapshot,neighborhood}'), ''),
    nullif(btrim(v_delivery_snapshot #>> '{address_snapshot,city}') || '/' || btrim(v_delivery_snapshot #>> '{address_snapshot,state}'), '/'),
    case when nullif(btrim(coalesce(v_delivery_snapshot #>> '{address_snapshot,postal_code}', v_delivery_snapshot #>> '{new_address,postal_code}')), '') is null
      then null
      else 'CEP ' || coalesce(v_delivery_snapshot #>> '{address_snapshot,postal_code}', v_delivery_snapshot #>> '{new_address,postal_code}')
    end
  );
  if v_delivery_snapshot ? 'new_address' then
    v_address_text := concat_ws(', ',
      nullif(btrim(v_delivery_snapshot #>> '{new_address,street}') || ', ' || btrim(v_delivery_snapshot #>> '{new_address,number}'), ', '),
      nullif(btrim(v_delivery_snapshot #>> '{new_address,complement}'), ''),
      nullif(btrim(v_delivery_snapshot #>> '{new_address,neighborhood}'), ''),
      nullif(btrim(v_delivery_snapshot #>> '{new_address,city}') || '/' || btrim(v_delivery_snapshot #>> '{new_address,state}'), '/'),
      case when nullif(btrim(v_delivery_snapshot #>> '{new_address,postal_code}'), '') is null
        then null else 'CEP ' || v_delivery_snapshot #>> '{new_address,postal_code}' end
    );
  end if;
  v_address_text := btrim(regexp_replace(coalesce(v_address_text, ''), '[[:cntrl:]]+', ' ', 'g'));
  v_integer_part := (v_quote_total_cents / 100)::text;
  v_total_display := '';
  while char_length(v_integer_part) > 3 loop
    v_total_display := '.' || right(v_integer_part, 3) || v_total_display;
    v_integer_part := left(v_integer_part, char_length(v_integer_part) - 3);
  end loop;
  v_total_display := 'R$ ' || v_integer_part || v_total_display || ','
    || lpad((v_quote_total_cents % 100)::text, 2, '0');
  v_summary := 'Confira seu pedido do Catálogo:' || E'\n' || v_item_lines
    || E'\n\nPagamento: ' || v_payment_label
    || E'\nEntrega: ' || v_address_text
    || E'\nTotal: ' || v_total_display
    || E'\n\nToque em "Confirmar pedido" para aceitar.';
  if char_length(v_summary) > 900 then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_summary_too_long');
  end if;

  v_idempotency_key := 'catalog-order-confirmation-intent:' || v_intent.id::text
    || ':quote:' || v_quote_revision::text;
  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_idempotency_key
  for update;
  if found then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_outbox_conflict');
  end if;

  v_button_token := translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/',
    '-_'
  );
  if char_length(v_button_token) <> 43 then
    return jsonb_build_object('ok', false, 'error', 'catalog_confirmation_token_unavailable');
  end if;
  v_button_id := 'order-confirm-v1:' || v_intent.id::text || ':' || v_button_token;
  v_payload := jsonb_build_object(
    'messaging_product', 'whatsapp',
    'recipient_type', 'individual',
    'type', 'interactive',
    'interactive', jsonb_build_object(
      'type', 'button',
      'body', jsonb_build_object('text', v_summary),
      'action', jsonb_build_object('buttons', jsonb_build_array(jsonb_build_object(
        'type', 'reply',
        'reply', jsonb_build_object('id', v_button_id, 'title', 'Confirmar pedido')
      )))
    )
  );
  v_summary_hash := encode(sha256(convert_to(v_summary, 'UTF8')), 'hex');
  v_token_hash := encode(sha256(convert_to(v_button_token, 'UTF8')), 'hex');

  insert into public.whatsapp_outbox_v1 (
    whatsapp_account_id, conversation_id, customer_id, to_phone_e164, purpose,
    message_type, provider, payload, status, idempotency_key, metadata
  ) values (
    v_intent.whatsapp_account_id, v_intent.conversation_id, v_customer_id, v_phone,
    'order_confirmation', 'interactive', 'meta', v_payload, 'queued',
    v_idempotency_key,
    jsonb_build_object(
      'order_intent_id', v_intent.id,
      'source_kind', 'catalog',
      'quote_revision', v_quote_revision,
      'summary_hash', v_summary_hash
    )
  ) on conflict (idempotency_key) do nothing;
  select * into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.idempotency_key = v_idempotency_key
  for update;
  if not found
    or v_outbox.whatsapp_account_id is distinct from v_intent.whatsapp_account_id
    or v_outbox.conversation_id is distinct from v_intent.conversation_id
    or v_outbox.to_phone_e164 is distinct from v_phone
    or v_outbox.purpose <> 'order_confirmation'
    or v_outbox.provider <> 'meta'
    or v_outbox.payload is distinct from v_payload then
    raise exception 'catalog_order_confirmation_outbox_conflict' using errcode = '23505';
  end if;

  update whatsapp_ordering_private.whatsapp_order_intents_v1
  set customer_id = v_customer_id,
      customer_snapshot = v_customer_snapshot,
      delivery_snapshot = v_delivery_snapshot,
      quote_snapshot = v_quote,
      quote_total_cents = v_quote_total_cents,
      currency = 'BRL',
      quote_revision = v_quote_revision,
      confirmation_token_hash = v_token_hash,
      summary_hash = v_summary_hash,
      confirmation_message_id = null,
      intake_snapshot = intake_snapshot || jsonb_build_object('confirmation_summary_text', v_summary),
      status = 'awaiting_confirmation',
      last_error_code = null,
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_intent.id,
    'status', 'awaiting_confirmation',
    'outbox_id', v_outbox.id,
    'quote_revision', v_quote_revision,
    'total_cents', v_quote_total_cents,
    'duplicate', false
  );
end;
$function$;

revoke all on function public.whatsapp_order_intent_catalog_confirmation_prepare_admin_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.whatsapp_order_intent_catalog_confirmation_prepare_admin_v1(uuid)
  to authenticated, service_role;
comment on function public.whatsapp_order_intent_catalog_confirmation_prepare_admin_v1(uuid)
  is 'Staff- or service-role-only Catalog confirmation preparation; rechecks the current server quote, binds one random reply token to the intent revision and queues one interactive summary without creating an order or sending a message.';

-- Read-only projection for the authenticated Admin inbox. The private intent
-- snapshots and one-time confirmation capability never leave this function.
create function public.whatsapp_order_intents_admin_list_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_items jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_conversation_id');
  end if;

  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  select coalesce(
    jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      i.id,
      i.created_at,
      jsonb_build_object(
        'id', i.id,
        'source_kind', i.source_kind,
        'intent_kind', case
          when i.source_kind = 'flow' and i.last_error_code = 'customer_review_requested'
            then 'customer_review'
          else 'order'
        end,
        'status', i.status,
        'quote_revision', i.quote_revision,
        'quote_total_cents', i.quote_total_cents,
        'currency', i.currency,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'order_id', i.confirmed_order_id,
        'order_status', o.status,
        'catalog_preparation', case
          when i.source_kind = 'catalog' then jsonb_build_object(
            'status_ready', i.status in ('received', 'reprice_required')
              or (i.status = 'needs_review' and i.last_error_code in (
                'catalog_product_mapping_unresolved',
                'catalog_product_price_unavailable'
              )),
            'service_window_open', exists (
              select 1
              from public.conversations active_conversation
              where active_conversation.id = i.conversation_id
                and active_conversation.whatsapp_account_id = i.whatsapp_account_id
                and active_conversation.last_inbound_at is not null
                and now() < active_conversation.last_inbound_at + interval '24 hours'
            ),
            'customer_state', customer_context.value ->> 'state',
            'customer', customer_context.value -> 'customer',
            'addresses', coalesce(customer_context.value -> 'addresses', '[]'::jsonb),
            'suggested_address_id', customer_context.value -> 'suggested_address_id',
            'address_state', customer_context.value ->> 'address_state',
            'draft_customer_name', case
              when char_length(btrim(i.customer_snapshot ->> 'name')) between 1 and 180
                then btrim(i.customer_snapshot ->> 'name')
              else null
            end,
            'payment_method', case
              when i.payment_method in ('pix', 'cash', 'debit_card', 'credit_card', 'food_card', 'meal_card')
                then i.payment_method
              else null
            end,
            'selected_address_id', case
              when coalesce(i.delivery_snapshot ->> 'address_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then i.delivery_snapshot ->> 'address_id'
              else null
            end,
            'new_address', case
              when jsonb_typeof(i.delivery_snapshot -> 'new_address') = 'object' then jsonb_build_object(
                'street', i.delivery_snapshot #>> '{new_address,street}',
                'number', i.delivery_snapshot #>> '{new_address,number}',
                'complement', i.delivery_snapshot #>> '{new_address,complement}',
                'neighborhood', i.delivery_snapshot #>> '{new_address,neighborhood}',
                'city', i.delivery_snapshot #>> '{new_address,city}',
                'state', i.delivery_snapshot #>> '{new_address,state}',
                'postal_code', i.delivery_snapshot #>> '{new_address,postal_code}',
                'reference', i.delivery_snapshot #>> '{new_address,reference}'
              )
              else null
            end
          )
          else null
        end,
        'items', case
          when i.source_kind = 'flow' then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'key', coalesce(nullif(line.value ->> 'position_id', ''), line.ordinality::text),
                'name', left(btrim(line.value ->> 'name'), 180),
                'quantity', (line.value ->> 'quantity')::integer,
                'available', true
              ) order by line.ordinality
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(i.quote_snapshot -> 'items') = 'array'
                  then i.quote_snapshot -> 'items'
                else '[]'::jsonb
              end
            ) with ordinality as line(value, ordinality)
            where coalesce(line.value ->> 'quantity', '') ~ '^[1-6]$'
              and nullif(btrim(line.value ->> 'name'), '') is not null
          ), '[]'::jsonb)
          when i.source_kind = 'catalog' then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'key', coalesce(mapping.id::text, 'line-' || item.ordinality::text),
                'name', coalesce(nullif(btrim(product.name), ''), 'Produto aguardando conferência'),
                'quantity', case
                  when coalesce(item.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$' then
                    case
                      when (item.value ->> 'quantity')::numeric <= 9007199254740991
                        then (item.value ->> 'quantity')::numeric
                      else null
                    end
                  else null
                end,
                'available', mapping.id is not null
                  and product.id is not null
                  and product.is_active is true
                  and product.is_whatsapp_active is true
                  and case
                    when coalesce(item.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$'
                      then (item.value ->> 'quantity')::numeric <= 9007199254740991
                    else false
                  end
              ) order by item.ordinality
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(i.intake_snapshot -> 'items') = 'array'
                  then i.intake_snapshot -> 'items'
                else '[]'::jsonb
              end
            ) with ordinality as item(value, ordinality)
            left join whatsapp_ordering_private.meta_catalog_product_links_v1 mapping
              on mapping.whatsapp_account_id = i.whatsapp_account_id
              and mapping.catalog_id = i.catalog_id
              and mapping.product_retailer_id = item.value ->> 'retailer_id'
              and mapping.status = 'active'
            left join public.products product on product.id = mapping.product_id
          ), '[]'::jsonb)
          else '[]'::jsonb
        end,
        'current_estimate_total_cents', case
          when i.source_kind = 'catalog' then (
            select case
              when count(*) > 0
                and coalesce(bool_and(
                  mapping.id is not null
                  and product.id is not null
                  and product.is_active is true
                  and product.is_whatsapp_active is true
                  and case
                    when product.is_offer is true and product.offer_price is not null
                      then product.offer_price >= 0
                    else product.price is not null and product.price >= 0
                  end
                  and coalesce(item.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$'
                  and case
                    when coalesce(item.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$'
                      then (item.value ->> 'quantity')::numeric <= 9007199254740991
                    else false
                  end
                ), false)
                and sum(
                  round(
                    (case
                      when product.is_offer is true and product.offer_price is not null
                        then product.offer_price
                      else product.price
                    end) * 100,
                    0
                  ) * case
                    when coalesce(item.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$' then
                      case
                        when (item.value ->> 'quantity')::numeric <= 9007199254740991
                          then (item.value ->> 'quantity')::numeric
                        else 0
                      end
                    else 0
                  end
                ) between 0 and 9007199254740991
                then sum(
                  round(
                    (case
                      when product.is_offer is true and product.offer_price is not null
                        then product.offer_price
                      else product.price
                    end) * 100,
                    0
                  ) * case
                    when coalesce(item.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,15}$' then
                      case
                        when (item.value ->> 'quantity')::numeric <= 9007199254740991
                          then (item.value ->> 'quantity')::numeric
                        else 0
                      end
                    else 0
                  end
                )::bigint
              else null
            end
            from jsonb_array_elements(
              case
                when jsonb_typeof(i.intake_snapshot -> 'items') = 'array'
                  then i.intake_snapshot -> 'items'
                else '[]'::jsonb
              end
            ) with ordinality as item(value, ordinality)
            left join whatsapp_ordering_private.meta_catalog_product_links_v1 mapping
              on mapping.whatsapp_account_id = i.whatsapp_account_id
              and mapping.catalog_id = i.catalog_id
              and mapping.product_retailer_id = item.value ->> 'retailer_id'
              and mapping.status = 'active'
            left join public.products product on product.id = mapping.product_id
          )
          else null
        end
      ) as item
    from whatsapp_ordering_private.whatsapp_order_intents_v1 i
    left join public.orders o on o.id = i.confirmed_order_id
    left join lateral (
      select case
        when i.source_kind = 'catalog'
          then whatsapp_ordering_private.catalog_customer_admin_context_v1(i.sender_phone_e164)
        else null
      end as value
    ) customer_context on true
    where i.conversation_id = p_conversation_id
    order by i.created_at desc, i.id desc
    limit 20
  ) page;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$function$;

revoke all on function public.whatsapp_order_intents_admin_list_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_intents_admin_list_v1(uuid)
  to authenticated;
comment on function public.whatsapp_order_intents_admin_list_v1(uuid)
  is 'Authenticated read-only Admin projection of the latest WhatsApp order intents for one conversation; checks active staff membership and omits private snapshots and button tokens.';

-- Resolve the structured WhatsApp origin for a bounded page of canonical
-- orders without changing orders.source or returning private checkout data.
create function public.whatsapp_order_intent_origins_admin_v1(p_order_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_origins jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_order_ids is null
    or cardinality(p_order_ids) < 1
    or cardinality(p_order_ids) > 50
    or array_position(p_order_ids, null) is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_order_ids');
  end if;

  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_id', i.confirmed_order_id,
        'origin', i.source_kind
      )
      order by i.confirmed_order_id
    ),
    '[]'::jsonb
  )
  into v_origins
  from whatsapp_ordering_private.whatsapp_order_intents_v1 i
  where i.confirmed_order_id = any(p_order_ids);

  return jsonb_build_object('ok', true, 'origins', v_origins);
end;
$function$;

revoke all on function public.whatsapp_order_intent_origins_admin_v1(uuid[])
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_intent_origins_admin_v1(uuid[])
  to authenticated;
comment on function public.whatsapp_order_intent_origins_admin_v1(uuid[])
  is 'Authenticated read-only Admin projection mapping a bounded set of canonical order IDs to Flow or Catalog origin; validates active staff membership and returns no private order snapshots.';

-- Phone-less Meta messages remain independent review items. Acknowledgement
-- records that staff inspected the event; it never links an identity or sends
-- a message to an opaque provider identifier.
create table whatsapp_ordering_private.whatsapp_identity_review_states_v1 (
  event_id uuid primary key
    references public.whatsapp_webhook_events_v1(id) on delete restrict,
  state text not null default 'acknowledged'
    check (state = 'acknowledged'),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index whatsapp_identity_review_states_reviewed_by_idx
  on whatsapp_ordering_private.whatsapp_identity_review_states_v1 (reviewed_by);

alter table whatsapp_ordering_private.whatsapp_identity_review_states_v1
  enable row level security;
revoke all on table whatsapp_ordering_private.whatsapp_identity_review_states_v1
  from public, anon, authenticated, service_role;

create index whatsapp_webhook_events_opaque_sender_review_idx
  on public.whatsapp_webhook_events_v1 (received_at desc, id desc)
  where provider = 'meta'
    and event_type = 'message.received'
    and status = 'review_required'
    and phone_e164 is null
    and (payload ->> 'review_kind') = 'opaque_sender';

comment on table whatsapp_ordering_private.whatsapp_identity_review_states_v1
  is 'Private acknowledgement state for an individual Meta inbound event without verified E.164; it does not establish customer identity or enable outbound messaging.';

create function public.whatsapp_identity_reviews_admin_list_v1(
  p_state text default 'pending',
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_items jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_state is null or p_state not in ('pending', 'acknowledged') then
    return jsonb_build_object('ok', false, 'error', 'invalid_review_state');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid_limit');
  end if;

  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  select coalesce(
    jsonb_agg(page.item order by page.received_at desc, page.event_id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      e.id as event_id,
      e.received_at,
      jsonb_build_object(
        'event_id', e.id,
        'whatsapp_account_id', e.whatsapp_account_id,
        'account_name', a.display_name,
        'account_phone', a.phone_e164,
        'received_at', e.received_at,
        'sender_provider_id', nullif(left(btrim(e.payload ->> 'sender_provider_id'), 256), ''),
        'message_type', coalesce(nullif(left(e.payload ->> 'message_type', 32), ''), 'unknown'),
        'intake_kind', case
          when e.payload ->> 'intake_kind' in ('catalog_order', 'flow_submission', 'confirmation_reply')
          then e.payload ->> 'intake_kind'
          else null
        end,
        'text_preview', nullif(left(btrim(e.payload ->> 'text_body'), 280), ''),
        'state', case when s.event_id is null then 'pending' else 'acknowledged' end,
        'reviewed_at', s.reviewed_at
      ) as item
    from public.whatsapp_webhook_events_v1 e
    join public.whatsapp_accounts a on a.id = e.whatsapp_account_id
    left join whatsapp_ordering_private.whatsapp_identity_review_states_v1 s
      on s.event_id = e.id
    where e.provider = 'meta'
      and e.event_type = 'message.received'
      and e.status = 'review_required'
      and e.phone_e164 is null
      and e.payload ->> 'review_kind' = 'opaque_sender'
      and (
        (p_state = 'pending' and s.event_id is null)
        or (p_state = 'acknowledged' and s.event_id is not null)
      )
    order by e.received_at desc, e.id desc
    limit p_limit
  ) page;

  return jsonb_build_object('ok', true, 'state', p_state, 'items', v_items);
end;
$function$;

revoke all on function public.whatsapp_identity_reviews_admin_list_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.whatsapp_identity_reviews_admin_list_v1(text, integer)
  to authenticated;
comment on function public.whatsapp_identity_reviews_admin_list_v1(text, integer)
  is 'Authenticated Admin projection of a bounded page of individual Meta inbound events without verified E.164; exposes safe summaries only and requires active staff attendance access.';

create function public.whatsapp_identity_review_ack_v1(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_event_id');
  end if;

  v_access := public.ops2_admin_attendance_customer_access_v1(true);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  perform 1
  from public.whatsapp_webhook_events_v1 e
  where e.id = p_event_id
    and e.provider = 'meta'
    and e.event_type = 'message.received'
    and e.status = 'review_required'
    and e.phone_e164 is null
    and e.payload ->> 'review_kind' = 'opaque_sender'
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'review_event_not_found');
  end if;

  insert into whatsapp_ordering_private.whatsapp_identity_review_states_v1 (
    event_id, state, reviewed_by, reviewed_at
  ) values (
    p_event_id, 'acknowledged', auth.uid(), now()
  )
  on conflict (event_id) do nothing;

  return jsonb_build_object('ok', true, 'event_id', p_event_id);
end;
$function$;

revoke all on function public.whatsapp_identity_review_ack_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.whatsapp_identity_review_ack_v1(uuid)
  to authenticated;
comment on function public.whatsapp_identity_review_ack_v1(uuid)
  is 'Authenticated Admin action that acknowledges one durably stored phone-less Meta inbound event; does not link a customer, alter the event, or send a WhatsApp message.';

-- Admin can prepare exact Meta Catalog retailer-ID mappings, but only the
-- server-side Meta verifier may promote them to active/verified.
create function public.meta_catalog_product_links_admin_list_v1(
  p_limit integer default 100,
  p_query text default null,
  p_link_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_is_active boolean;
  v_accounts jsonb;
  v_items jsonb;
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200
    or length(coalesce(v_query, '')) > 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid_query');
  end if;

  select u.role, u.is_active
  into v_role, v_is_active
  from public.admin_users u
  where u.user_id = auth.uid();
  if not found
    or v_is_active is distinct from true
    or coalesce(v_role, '') not in ('owner', 'admin', 'catalog_manager') then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'slug', a.slug,
        'name', a.display_name,
        'phone_e164', a.phone_e164
      ) order by a.display_name, a.id
    ),
    '[]'::jsonb
  )
  into v_accounts
  from public.whatsapp_accounts a
  where a.is_active = true;

  select coalesce(
    jsonb_agg(page.item order by page.review_priority, page.updated_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      l.id,
      l.updated_at,
      case
        when l.status = 'needs_review' and p.is_active and p.is_whatsapp_active then 0
        when l.status = 'needs_review' then 1
        else 2
      end as review_priority,
      jsonb_build_object(
        'id', l.id,
        'whatsapp_account_id', l.whatsapp_account_id,
        'account_name', a.display_name,
        'account_phone', a.phone_e164,
        'catalog_id', l.catalog_id,
        'product_retailer_id', l.product_retailer_id,
        'product_id', p.id,
        'product_name', p.name,
        'product_sku', p.sku,
        'status', l.status,
        'verified_at', l.verified_at,
        'updated_at', l.updated_at,
        'product_eligible', p.is_active and p.is_whatsapp_active
      ) as item
    from whatsapp_ordering_private.meta_catalog_product_links_v1 l
    join public.whatsapp_accounts a on a.id = l.whatsapp_account_id
    join public.products p on p.id = l.product_id
    where (p_link_id is null or l.id = p_link_id)
      and (
        v_query is null
        or l.catalog_id ilike '%' || v_query || '%'
        or l.product_retailer_id ilike '%' || v_query || '%'
        or p.name ilike '%' || v_query || '%'
        or coalesce(p.sku, '') ilike '%' || v_query || '%'
      )
    order by review_priority, l.updated_at desc, l.id desc
    limit p_limit
  ) page;

  return jsonb_build_object(
    'ok', true,
    'accounts', v_accounts,
    'items', v_items
  );
end;
$function$;

revoke all on function public.meta_catalog_product_links_admin_list_v1(integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.meta_catalog_product_links_admin_list_v1(integer, text, uuid)
  to authenticated;
comment on function public.meta_catalog_product_links_admin_list_v1(integer, text, uuid)
  is 'Authenticated staff-only, bounded projection for exact Meta Catalog retailer-ID mappings; omits tokens and internal product cost.';

create function public.meta_catalog_product_link_admin_save_v1(
  p_whatsapp_account_id uuid,
  p_catalog_id text,
  p_product_retailer_id text,
  p_product_id uuid,
  p_link_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_is_active boolean;
  v_link_id uuid;
  v_catalog_id text := nullif(btrim(coalesce(p_catalog_id, '')), '');
  v_retailer_id text := nullif(btrim(coalesce(p_product_retailer_id, '')), '');
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_whatsapp_account_id is null
    or p_product_id is null
    or length(coalesce(v_catalog_id, '')) not between 1 and 256
    or length(coalesce(v_retailer_id, '')) not between 1 and 256
    or v_catalog_id ~ '[[:cntrl:]]'
    or v_retailer_id ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'error', 'invalid_mapping');
  end if;

  select u.role, u.is_active
  into v_role, v_is_active
  from public.admin_users u
  where u.user_id = auth.uid();
  if not found
    or v_is_active is distinct from true
    or coalesce(v_role, '') not in ('owner', 'admin', 'catalog_manager') then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;

  perform 1
  from public.whatsapp_accounts a
  where a.id = p_whatsapp_account_id and a.is_active = true
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'whatsapp_account_unavailable');
  end if;

  perform 1
  from public.products p
  where p.id = p_product_id and p.is_active = true and p.is_whatsapp_active = true
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'whatsapp_product_unavailable');
  end if;

  if p_link_id is null then
    insert into whatsapp_ordering_private.meta_catalog_product_links_v1 (
      whatsapp_account_id, catalog_id, product_retailer_id, product_id,
      status, verified_at, updated_at
    ) values (
      p_whatsapp_account_id, v_catalog_id, v_retailer_id, p_product_id,
      'needs_review', null, now()
    )
    returning id into v_link_id;
  else
    update whatsapp_ordering_private.meta_catalog_product_links_v1
    set whatsapp_account_id = p_whatsapp_account_id,
        catalog_id = v_catalog_id,
        product_retailer_id = v_retailer_id,
        product_id = p_product_id,
        status = 'needs_review',
        verified_at = null,
        updated_at = now()
    where id = p_link_id
    returning id into v_link_id;
    if v_link_id is null then
      return jsonb_build_object('ok', false, 'error', 'mapping_not_found');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_link_id, 'status', 'needs_review');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'mapping_already_exists');
end;
$function$;

revoke all on function public.meta_catalog_product_link_admin_save_v1(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.meta_catalog_product_link_admin_save_v1(uuid, text, text, uuid, uuid)
  to authenticated;
comment on function public.meta_catalog_product_link_admin_save_v1(uuid, text, text, uuid, uuid)
  is 'Authenticated staff can create/edit an exact Catalog mapping for an active WhatsApp product; every edit clears verification and returns it to needs_review. Only the server Meta verifier may activate it.';

-- Server-only read snapshot for the Meta verifier. The endpoint resolves the
-- account's allowlisted slug to a server-side token and never accepts secrets
-- or WABA IDs from the browser.
create function public.meta_catalog_product_links_verification_candidates_v1(
  p_whatsapp_account_id uuid,
  p_catalog_id text,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_catalog_id text := nullif(btrim(coalesce(p_catalog_id, '')), '');
  v_account jsonb;
  v_links jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_whatsapp_account_id is null
    or length(coalesce(v_catalog_id, '')) not between 1 and 256
    or v_catalog_id !~ '^[0-9]{1,256}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_catalog_request');
  end if;

  if (p_after_updated_at is null) <> (p_after_id is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_catalog_cursor');
  end if;

  select jsonb_build_object(
    'id', a.id,
    'slug', a.slug,
    'waba_id', a.waba_id
  )
  into v_account
  from public.whatsapp_accounts a
  where a.id = p_whatsapp_account_id
    and a.is_active = true
    and a.waba_id ~ '^[0-9]{1,256}$'
  for share;

  if v_account is null then
    return jsonb_build_object('ok', false, 'error', 'whatsapp_account_unavailable');
  end if;

  with candidate_rows as (
    select
      l.id,
      l.product_retailer_id,
      l.product_id,
      l.updated_at
    from whatsapp_ordering_private.meta_catalog_product_links_v1 l
    join public.products p on p.id = l.product_id
    where l.whatsapp_account_id = p_whatsapp_account_id
      and l.catalog_id = v_catalog_id
      and l.status = 'needs_review'
      and p.is_active = true
      and p.is_whatsapp_active = true
      and (
        p_after_updated_at is null
        or (l.updated_at, l.id) > (p_after_updated_at, p_after_id)
      )
    order by l.updated_at, l.id
    limit 201
  ),
  limited_rows as (
    select *
    from candidate_rows
    order by updated_at, id
    limit 200
  )
  select
    coalesce(
      jsonb_agg(jsonb_build_object(
        'id', limited_rows.id,
        'product_retailer_id', limited_rows.product_retailer_id,
        'product_id', limited_rows.product_id,
        'updated_at', limited_rows.updated_at
      ) order by limited_rows.updated_at, limited_rows.id),
      '[]'::jsonb
    ),
    (select count(*) > 200 from candidate_rows)
  into v_links, v_has_more
  from limited_rows;

  if coalesce(v_has_more, false) then
    select jsonb_build_object(
      'updated_at', item.value ->> 'updated_at',
      'id', item.value ->> 'id'
    )
    into v_next_cursor
    from jsonb_array_elements(v_links) with ordinality item(value, ordinal)
    order by item.ordinal desc
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'account', v_account,
    'links', v_links,
    'has_more', coalesce(v_has_more, false),
    'next_cursor', v_next_cursor
  );
end;
$function$;

revoke all on function public.meta_catalog_product_links_verification_candidates_v1(uuid, text, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.meta_catalog_product_links_verification_candidates_v1(uuid, text, timestamptz, uuid)
  to service_role;
comment on function public.meta_catalog_product_links_verification_candidates_v1(uuid, text, timestamptz, uuid)
  is 'Service-only keyset-paged snapshot of up to 200 eligible needs_review Meta Catalog mappings and their active WABA account; never returns product cost or secrets.';

-- Activate only the exact mapping snapshots the server verifier read before
-- the Meta request. A concurrent Admin edit invalidates the snapshot and
-- rolls back the whole batch rather than activating a changed association.
create function public.meta_catalog_product_links_activate_batch_v1(
  p_whatsapp_account_id uuid,
  p_waba_id text,
  p_catalog_id text,
  p_verified_links jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_catalog_id text := nullif(btrim(coalesce(p_catalog_id, '')), '');
  v_expected integer;
  v_activated integer;
begin
  if p_whatsapp_account_id is null
    or coalesce(p_waba_id, '') !~ '^[0-9]{1,256}$'
    or length(coalesce(v_catalog_id, '')) not between 1 and 256
    or v_catalog_id !~ '^[0-9]{1,256}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_verification_result');
  end if;

  if jsonb_typeof(p_verified_links) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_verification_result');
  end if;

  if jsonb_array_length(p_verified_links) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_verification_result');
  end if;

  v_expected := jsonb_array_length(p_verified_links);
  if v_expected = 0 then
    return jsonb_build_object('ok', true, 'activated_count', 0);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_verified_links) item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or coalesce(item.value ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(item.value ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or length(coalesce(item.value ->> 'product_retailer_id', '')) not between 1 and 256
      or coalesce(item.value ->> 'product_retailer_id', '') ~ '[[:cntrl:]]'
      or coalesce(item.value ->> 'updated_at', '') = ''
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_verification_result');
  end if;

  if (
    select count(distinct item.value ->> 'id')
    from jsonb_array_elements(p_verified_links) item(value)
  ) <> v_expected then
    return jsonb_build_object('ok', false, 'error', 'duplicate_verification_result');
  end if;

  perform 1
  from public.whatsapp_accounts a
  where a.id = p_whatsapp_account_id
    and a.waba_id = p_waba_id
    and a.is_active = true
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'whatsapp_account_changed');
  end if;

  with verified_rows as (
    select *
    from jsonb_to_recordset(p_verified_links) as item(
      id uuid,
      product_retailer_id text,
      product_id uuid,
      updated_at timestamptz
    )
  ),
  updated_rows as (
    update whatsapp_ordering_private.meta_catalog_product_links_v1 l
    set status = 'active',
        verified_at = now(),
        updated_at = now()
    from verified_rows item
    join public.products p
      on p.id = item.product_id
      and p.is_active = true
      and p.is_whatsapp_active = true
    where l.id = item.id
      and l.whatsapp_account_id = p_whatsapp_account_id
      and l.catalog_id = v_catalog_id
      and l.product_retailer_id = item.product_retailer_id
      and l.product_id = item.product_id
      and l.updated_at = item.updated_at
      and l.status = 'needs_review'
    returning l.id
  )
  select count(*)::integer into v_activated from updated_rows;

  if v_activated <> v_expected then
    raise exception using
      errcode = '40001',
      message = 'catalog_verification_snapshot_changed';
  end if;

  return jsonb_build_object('ok', true, 'activated_count', v_activated);
end;
$function$;

revoke all on function public.meta_catalog_product_links_activate_batch_v1(uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.meta_catalog_product_links_activate_batch_v1(uuid, text, text, jsonb)
  to service_role;
comment on function public.meta_catalog_product_links_activate_batch_v1(uuid, text, text, jsonb)
  is 'Service-only compare-and-activate RPC for up to 200 exact Meta-verified links; checks active WABA, product eligibility, and unchanged link/product/timestamp snapshots atomically.';
