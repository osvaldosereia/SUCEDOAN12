\set ON_ERROR_STOP on
-- Dedicated, disposable PostgreSQL only; no connection to the store.
DO $$
BEGIN
  IF current_database() <> 'dona_test' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'customer fixture requires the isolated dona_test database';
  END IF;
END $$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  cpf_cnpj text,
  primary_whatsapp_e164 text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.customer_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  phone_e164 text UNIQUE NOT NULL,
  source text NOT NULL CHECK (source IN ('whatsapp', 'bling', 'manual', 'import', 'papoai_flow', 'vitrine_admin')),
  is_primary boolean NOT NULL DEFAULT false
);
CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  street text, number text, complement text, neighborhood text, city text, state text,
  postal_code text, reference text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.admin_audit_logs (
  admin_user_id uuid, action text, entity_type text, entity_id text, details jsonb
);
CREATE FUNCTION public.normalize_phone_digits(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') $$;
-- Document validation is not under test; these fixtures do not provide a document.
CREATE FUNCTION public.ops2_valid_cpf_cnpj_v1(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;

\ir ../../supabase/migrations/20261029123000_site_admin_customer_phone_full_edit_v3.sql

INSERT INTO public.customers(id, name, primary_whatsapp_e164, updated_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'Cliente fictício', '+5565999991111', '2026-11-28 18:00:00+00');

DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.ops2_site_admin_customer_update_v3(
      '11111111-1111-4111-8111-111111111111', '2026-11-28 18:00:00+00',
      'Cliente fictício', NULL, NULL, '{}'::jsonb, '', '+5565999992222');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'old phone source should have failed the real check constraint'; END IF;
  IF EXISTS(SELECT 1 FROM public.customer_phones) OR
     (SELECT primary_whatsapp_e164 FROM public.customers LIMIT 1) <> '+5565999991111' THEN
    RAISE EXCEPTION 'failed customer update must roll back';
  END IF;
END $$;

\ir ../../supabase/migrations/20261128195700_site_admin_customer_phone_source_and_first_address_v1.sql

DO $$
DECLARE result jsonb; current_version timestamptz; address_version timestamptz; first_address uuid;
  address_data jsonb := '{"street":"Rua de teste","number":"1","neighborhood":"Centro","city":"Cuiabá","state":"MT"}';
BEGIN
  result:=public.ops2_site_admin_customer_update_v3(
    '11111111-1111-4111-8111-111111111111', '2026-11-28 18:00:00+00',
    'Cliente atualizado', NULL, NULL, address_data, '', '+5565999992222');
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'update failed: %', result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_phones WHERE phone_e164='+5565999992222'
                AND source='vitrine_admin' AND is_primary) THEN
    RAISE EXCEPTION 'phone was not recorded with a valid source';
  END IF;
  first_address:=(result->>'address_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.customer_addresses WHERE id=first_address AND is_default AND is_active) THEN
    RAISE EXCEPTION 'the first active address must be the default';
  END IF;
  SELECT updated_at INTO current_version FROM public.customers WHERE id='11111111-1111-4111-8111-111111111111';
  SELECT updated_at INTO address_version FROM public.customer_addresses WHERE id=first_address;

  result:=public.ops2_site_admin_customer_update_v3(
    '11111111-1111-4111-8111-111111111111', '2026-11-28 18:00:00+00',
    'Nome obsoleto', NULL, NULL, '{}'::jsonb, '', '+5565999992222');
  IF result->>'error' <> 'customer_changed' THEN RAISE EXCEPTION 'stale customer edit was accepted'; END IF;

  result:=public.ops2_site_admin_customer_update_v3(
    '11111111-1111-4111-8111-111111111111', current_version,
    'Cliente atualizado', first_address, address_version, address_data || '{"number":"2"}'::jsonb, '', '+5565999992222');
  IF result->>'ok'<>'true' OR NOT EXISTS(
    SELECT 1 FROM public.customer_addresses WHERE id=first_address AND number='2' AND is_default
  ) THEN RAISE EXCEPTION 'existing address update failed'; END IF;

  SELECT updated_at INTO current_version FROM public.customers WHERE id='11111111-1111-4111-8111-111111111111';
  result:=public.ops2_site_admin_customer_update_v3(
    '11111111-1111-4111-8111-111111111111', current_version,
    'Cliente atualizado', NULL, NULL, address_data || '{"number":"3"}'::jsonb, '', '+5565999992222');
  IF result->>'ok'<>'true' OR
     (SELECT count(*) FROM public.customer_addresses WHERE customer_id='11111111-1111-4111-8111-111111111111' AND is_default AND is_active) <> 1 OR
     (SELECT is_default FROM public.customer_addresses WHERE id=(result->>'address_id')::uuid) IS TRUE THEN
    RAISE EXCEPTION 'adding another address must preserve the current default';
  END IF;
END $$;
