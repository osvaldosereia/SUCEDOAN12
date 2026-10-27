-- Catalog and basket foundations. This migration is intentionally local-first;
-- do not apply it to the connected production project during preparation.

-- Costs are operationally useful to staff, but must never be part of the
-- public Data API representation consumed by customer-facing channels.
CREATE TABLE app_private.product_financials (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_cents bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_financials_cost_cents_check CHECK (cost_cents IS NULL OR cost_cents >= 0)
);

INSERT INTO app_private.product_financials (product_id, cost_cents, updated_at)
SELECT id, cost_cents, updated_at
FROM public.products
ON CONFLICT (product_id) DO UPDATE
SET cost_cents = EXCLUDED.cost_cents,
    updated_at = EXCLUDED.updated_at;

ALTER TABLE public.products DROP CONSTRAINT products_cost_cents_check;
ALTER TABLE public.products DROP COLUMN cost_cents;

ALTER TABLE public.product_images
  ADD COLUMN flow_thumbnail_path text;

ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_verified_flow_image_check
  CHECK (
    NOT verified
    OR (
      flow_thumbnail_path IS NOT NULL
      AND length(btrim(flow_thumbnail_path)) > 0
      AND alt_text IS NOT NULL
      AND length(btrim(alt_text)) > 0
    )
  ) NOT VALID;

COMMENT ON COLUMN public.product_images.flow_thumbnail_path IS
  'Pre-generated image variant served to WhatsApp Flow. It must be verified with non-empty alt text before a basket version can be published.';

COMMENT ON COLUMN public.basket_templates.price_cents IS
  'Legacy fixed price; do not use for new basket checkouts. New basket totals are calculated from selected option product prices plus the private version extra.';

-- Meta retailer IDs belong to a catalog/WABA mapping. They are not assumed to
-- equal the local SKU, GTIN, or Bling identifier.
CREATE TABLE public.meta_catalog_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id text NOT NULL,
  catalog_id text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_retailer_id text NOT NULL,
  sync_status text NOT NULL DEFAULT 'pending',
  synced_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_catalog_listings_waba_id_check CHECK (length(btrim(waba_id)) > 0),
  CONSTRAINT meta_catalog_listings_catalog_id_check CHECK (length(btrim(catalog_id)) > 0),
  CONSTRAINT meta_catalog_listings_retailer_id_check CHECK (length(btrim(product_retailer_id)) > 0),
  CONSTRAINT meta_catalog_listings_sync_status_check CHECK (sync_status IN ('pending', 'synced', 'failed', 'disabled')),
  CONSTRAINT meta_catalog_listings_waba_catalog_product_key UNIQUE (waba_id, catalog_id, product_id),
  CONSTRAINT meta_catalog_listings_waba_catalog_retailer_key UNIQUE (waba_id, catalog_id, product_retailer_id)
);

CREATE INDEX meta_catalog_listings_product_idx
  ON public.meta_catalog_listings (product_id);

-- A basket template is versioned so an order can later retain the exact set of
-- options selected by the customer even after the next version is published.
CREATE TABLE public.basket_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basket_template_id uuid NOT NULL REFERENCES public.basket_templates(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  minimum_selected_components smallint NOT NULL DEFAULT 1,
  published_at timestamptz,
  published_by uuid REFERENCES public.staff_profiles(user_id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.staff_profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT basket_template_versions_number_check CHECK (version_number > 0),
  CONSTRAINT basket_template_versions_status_check CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT basket_template_versions_publication_fields_check CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR (status <> 'published' AND published_at IS NULL AND published_by IS NULL)
  ),
  CONSTRAINT basket_template_versions_min_components_check CHECK (minimum_selected_components >= 1),
  CONSTRAINT basket_template_versions_template_number_key UNIQUE (basket_template_id, version_number)
);

CREATE UNIQUE INDEX basket_template_versions_one_published_idx
  ON public.basket_template_versions (basket_template_id)
  WHERE status = 'published';

CREATE TABLE public.basket_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.basket_template_versions(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL,
  minimum_quantity smallint NOT NULL DEFAULT 0,
  maximum_quantity smallint NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT basket_components_key_check CHECK (length(btrim(component_key)) > 0),
  CONSTRAINT basket_components_label_check CHECK (length(btrim(label)) > 0),
  CONSTRAINT basket_components_position_check CHECK (position >= 0),
  CONSTRAINT basket_components_quantity_range_check CHECK (minimum_quantity = 0 AND maximum_quantity BETWEEN 0 AND 6),
  CONSTRAINT basket_components_version_key_key UNIQUE (version_id, component_key),
  CONSTRAINT basket_components_version_position_key UNIQUE (version_id, position)
);

CREATE INDEX basket_components_version_idx ON public.basket_components (version_id);

CREATE TABLE public.basket_component_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.basket_components(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  price_cents bigint NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT basket_component_options_position_check CHECK (position >= 0),
  CONSTRAINT basket_component_options_price_cents_check CHECK (price_cents >= 0),
  CONSTRAINT basket_component_options_component_product_key UNIQUE (component_id, product_id),
  CONSTRAINT basket_component_options_component_position_key UNIQUE (component_id, position)
);

CREATE INDEX basket_component_options_product_idx ON public.basket_component_options (product_id);

CREATE TABLE app_private.basket_version_financials (
  version_id uuid PRIMARY KEY REFERENCES public.basket_template_versions(id) ON DELETE CASCADE,
  internal_extra_cents bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT basket_version_financials_extra_check CHECK (internal_extra_cents >= 0)
);

-- This narrow helper is safe for RLS: it returns only the caller's active staff
-- role and does not expose other staff records.
CREATE OR REPLACE FUNCTION app_private.current_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT sp.role
  FROM public.staff_profiles AS sp
  WHERE sp.user_id = (SELECT auth.uid())
    AND sp.enabled = true
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app_private.current_staff_role() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_staff_role() TO authenticated;

-- Publish-time validation prevents the Flow from receiving stale or
-- incomplete products. All listed alternatives must have an approved image.
CREATE OR REPLACE FUNCTION app_private.assert_basket_version_publishable(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_minimum smallint;
  v_component_count integer;
BEGIN
  PERFORM p.id
  FROM public.basket_components AS c
  JOIN public.basket_component_options AS o ON o.component_id = c.id
  JOIN public.products AS p ON p.id = o.product_id
  WHERE c.version_id = p_version_id
  ORDER BY p.id
  FOR UPDATE OF p;

  SELECT v.minimum_selected_components
  INTO v_minimum
  FROM public.basket_template_versions AS v
  WHERE v.id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Basket version does not exist.' USING ERRCODE = '23503';
  END IF;

  SELECT count(*)::integer
  INTO v_component_count
  FROM public.basket_components AS c
  WHERE c.version_id = p_version_id;

  IF v_component_count = 0 OR v_minimum > v_component_count THEN
    RAISE EXCEPTION 'Add basket components and set a valid minimum before publishing.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.basket_components AS c
    LEFT JOIN public.basket_component_options AS o ON o.component_id = c.id
    WHERE c.version_id = p_version_id
    GROUP BY c.id
    HAVING count(o.id) = 0
  ) THEN
    RAISE EXCEPTION 'Every basket component must contain at least one product option.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.basket_components AS c
    JOIN public.basket_component_options AS o ON o.component_id = c.id
    JOIN public.products AS p ON p.id = o.product_id
    WHERE c.version_id = p_version_id
      AND (
        p.active IS DISTINCT FROM true
        OR p.published_at IS NULL
        OR p.review_status <> 'approved'
        OR NOT EXISTS (
          SELECT 1
          FROM public.product_images AS i
          WHERE i.product_id = p.id
            AND i.verified = true
            AND i.flow_thumbnail_path IS NOT NULL
            AND length(btrim(i.flow_thumbnail_path)) > 0
            AND i.alt_text IS NOT NULL
            AND length(btrim(i.alt_text)) > 0
        )
      )
  ) THEN
    RAISE EXCEPTION 'Every basket option must be an approved, published product with an assigned basket price and a verified Flow photo.' USING ERRCODE = '23514';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.assert_basket_version_publishable(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.guard_basket_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Basket versions must be created as drafts.' USING ERRCODE = '55000';
    END IF;
    NEW.created_by := (SELECT auth.uid());
    NEW.published_at := NULL;
    NEW.published_by := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Published and retired basket versions cannot be deleted.' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.basket_template_id IS DISTINCT FROM OLD.basket_template_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Basket version identity and creation audit fields are immutable.' USING ERRCODE = '55000';
    END IF;

    IF NEW.status = 'published' THEN
      PERFORM app_private.assert_basket_version_publishable(NEW.id);
      NEW.published_at := COALESCE(NEW.published_at, now());
      NEW.published_by := (SELECT auth.uid());
    ELSIF NEW.status = 'retired' THEN
      NEW.published_at := NULL;
      NEW.published_by := NULL;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'published'
     AND NEW.status = 'retired'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.basket_template_id IS NOT DISTINCT FROM OLD.basket_template_id
     AND NEW.version_number IS NOT DISTINCT FROM OLD.version_number
     AND NEW.minimum_selected_components IS NOT DISTINCT FROM OLD.minimum_selected_components
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
     AND NEW.published_by IS NOT DISTINCT FROM OLD.published_by
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Published and retired basket versions are immutable.' USING ERRCODE = '55000';
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_basket_component_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    SELECT v.status INTO v_status
    FROM public.basket_template_versions AS v
    WHERE v.id = OLD.version_id
    FOR UPDATE;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Components of published or retired basket versions are immutable.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT v.status INTO v_status
    FROM public.basket_template_versions AS v
    WHERE v.id = NEW.version_id
    FOR UPDATE;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Components can only be added to a draft basket version.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_basket_option_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    SELECT v.status INTO v_status
    FROM public.basket_components AS c
    JOIN public.basket_template_versions AS v ON v.id = c.version_id
    WHERE c.id = OLD.component_id
    FOR UPDATE OF v;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Options of published or retired basket versions are immutable.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT v.status INTO v_status
    FROM public.basket_components AS c
    JOIN public.basket_template_versions AS v ON v.id = c.version_id
    WHERE c.id = NEW.component_id
    FOR UPDATE OF v;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Options can only be added to a draft basket version.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_basket_internal_extra_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_version_id uuid;
  v_status text;
BEGIN
  v_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  SELECT v.status INTO v_status
  FROM public.basket_template_versions AS v
  WHERE v.id = v_version_id
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft basket versions can change internal extra.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_published_basket_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.basket_component_options AS o
    JOIN public.basket_components AS c ON c.id = o.component_id
    JOIN public.basket_template_versions AS v ON v.id = c.version_id
    WHERE o.product_id = OLD.id AND v.status = 'published'
  ) AND (
    NEW.active IS DISTINCT FROM true
    OR NEW.published_at IS NULL
    OR NEW.review_status IS DISTINCT FROM 'approved'
  ) THEN
    RAISE EXCEPTION 'Retire the published basket version before unpublishing or rejecting one of its products.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_published_basket_product_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_remains_usable boolean;
BEGIN
  PERFORM p.id
  FROM public.products AS p
  WHERE p.id = OLD.product_id
  FOR UPDATE;

  IF OLD.verified = true
     AND OLD.flow_thumbnail_path IS NOT NULL
     AND length(btrim(OLD.flow_thumbnail_path)) > 0
     AND OLD.alt_text IS NOT NULL
     AND length(btrim(OLD.alt_text)) > 0
     AND (TG_OP = 'DELETE' OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NOT (
       NEW.verified = true
       AND NEW.flow_thumbnail_path IS NOT NULL
       AND length(btrim(NEW.flow_thumbnail_path)) > 0
       AND NEW.alt_text IS NOT NULL
       AND length(btrim(NEW.alt_text)) > 0
     )) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.product_images AS i
      WHERE i.product_id = OLD.product_id
        AND i.id <> OLD.id
        AND i.verified = true
        AND i.flow_thumbnail_path IS NOT NULL
        AND length(btrim(i.flow_thumbnail_path)) > 0
        AND i.alt_text IS NOT NULL
        AND length(btrim(i.alt_text)) > 0
    ) INTO v_remains_usable;

    IF NOT v_remains_usable AND EXISTS (
      SELECT 1
      FROM public.basket_component_options AS o
      JOIN public.basket_components AS c ON c.id = o.component_id
      JOIN public.basket_template_versions AS v ON v.id = c.version_id
      WHERE o.product_id = OLD.product_id AND v.status = 'published'
    ) THEN
      RAISE EXCEPTION 'Keep at least one verified Flow photo for products in a published basket; retire the basket first.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.guard_basket_template_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_basket_component_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_basket_option_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_basket_internal_extra_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_published_basket_product() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_published_basket_product_image() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER basket_template_versions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.basket_template_versions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_basket_template_version();

CREATE TRIGGER basket_components_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.basket_components
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_basket_component_mutation();

CREATE TRIGGER basket_component_options_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.basket_component_options
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_basket_option_mutation();

CREATE TRIGGER basket_version_financials_guard
  BEFORE INSERT OR UPDATE OR DELETE ON app_private.basket_version_financials
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_basket_internal_extra_mutation();

CREATE TRIGGER published_basket_product_guard
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_published_basket_product();

CREATE TRIGGER published_basket_product_image_guard
  BEFORE UPDATE OR DELETE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_published_basket_product_image();

-- The customer-facing client never receives these values. The authenticated
-- admin gets narrowly scoped RPCs after the same active-role check as RLS.
CREATE OR REPLACE FUNCTION public.admin_get_product_cost(p_product_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(app_private.current_staff_role() NOT IN ('owner', 'admin', 'catalog_manager'), true) THEN
    RAISE EXCEPTION 'Insufficient privilege.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT f.cost_cents FROM app_private.product_financials AS f WHERE f.product_id = p_product_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_product_cost(p_product_id uuid, p_cost_cents bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(app_private.current_staff_role() NOT IN ('owner', 'admin', 'catalog_manager'), true) THEN
    RAISE EXCEPTION 'Insufficient privilege.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products AS p WHERE p.id = p_product_id) THEN
    RAISE EXCEPTION 'Product does not exist.' USING ERRCODE = '23503';
  END IF;
  INSERT INTO app_private.product_financials (product_id, cost_cents, updated_at)
  VALUES (p_product_id, p_cost_cents, now())
  ON CONFLICT (product_id) DO UPDATE
  SET cost_cents = EXCLUDED.cost_cents,
      updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_basket_internal_extra(p_version_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(app_private.current_staff_role() NOT IN ('owner', 'admin', 'catalog_manager'), true) THEN
    RAISE EXCEPTION 'Insufficient privilege.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(
    (SELECT f.internal_extra_cents FROM app_private.basket_version_financials AS f WHERE f.version_id = p_version_id),
    0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_basket_internal_extra(p_version_id uuid, p_extra_cents bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF COALESCE(app_private.current_staff_role() NOT IN ('owner', 'admin', 'catalog_manager'), true) THEN
    RAISE EXCEPTION 'Insufficient privilege.' USING ERRCODE = '42501';
  END IF;
  SELECT v.status INTO v_status
  FROM public.basket_template_versions AS v
  WHERE v.id = p_version_id
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft basket versions can change internal extra.' USING ERRCODE = '55000';
  END IF;
  INSERT INTO app_private.basket_version_financials (version_id, internal_extra_cents, updated_at)
  VALUES (p_version_id, p_extra_cents, now())
  ON CONFLICT (version_id) DO UPDATE
  SET internal_extra_cents = EXCLUDED.internal_extra_cents,
      updated_at = EXCLUDED.updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_product_cost(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_product_cost(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_basket_internal_extra(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_basket_internal_extra(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_product_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_cost(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_basket_internal_extra(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_basket_internal_extra(uuid, bigint) TO authenticated;

-- All catalog tables are accessible only to authenticated catalog staff. The
-- same role expression is used in each command-specific policy for auditability.
DO $policies$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'products', 'product_images', 'product_identifiers', 'basket_templates',
    'meta_catalog_listings', 'basket_template_versions', 'basket_components',
    'basket_component_options'
  ];
  v_role_check text := '(SELECT app_private.current_staff_role()) IN (''owner'', ''admin'', ''catalog_manager'')';
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('CREATE POLICY staff_catalog_select ON public.%I FOR SELECT TO authenticated USING (%s)', v_table, v_role_check);
    EXECUTE format('CREATE POLICY staff_catalog_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', v_table, v_role_check);
    EXECUTE format('CREATE POLICY staff_catalog_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', v_table, v_role_check, v_role_check);
    EXECUTE format('CREATE POLICY staff_catalog_delete ON public.%I FOR DELETE TO authenticated USING (%s)', v_table, v_role_check);
  END LOOP;
END;
$policies$;

ALTER TABLE app_private.product_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.basket_version_financials ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE app_private.product_financials, app_private.basket_version_financials FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE app_private.product_financials, app_private.basket_version_financials TO service_role;

ALTER TABLE public.meta_catalog_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basket_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basket_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basket_component_options ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.products,
  public.product_images,
  public.product_identifiers,
  public.basket_templates,
  public.meta_catalog_listings,
  public.basket_template_versions,
  public.basket_components,
  public.basket_component_options
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.meta_catalog_listings,
  public.basket_template_versions,
  public.basket_components,
  public.basket_component_options
TO service_role;

COMMENT ON TABLE public.basket_template_versions IS
  'Versioned basket definition; only drafts are editable. A published version can only be retired, and orders must snapshot its chosen product options and prices.';
COMMENT ON TABLE public.basket_components IS
  'One ordered WhatsApp Flow page/slot in a basket version. Each slot has one product choice and a quantity from zero through six.';
COMMENT ON TABLE public.basket_component_options IS
  'Alternative products offered for one basket slot, with a versioned basket-specific sale price distinct from the product retail price. Checkout reads the verified Flow photo server-side.';
COMMENT ON TABLE app_private.basket_version_financials IS
  'Private basket adjustment excluded from all customer-facing DTOs and ordinary table reads; staff access is through role-checked admin RPCs.';
