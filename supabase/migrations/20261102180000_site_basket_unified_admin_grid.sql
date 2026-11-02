CREATE TABLE public.site_basket_product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_source_type_id uuid UNIQUE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.site_basket_product_type_options (
  product_type_id uuid NOT NULL REFERENCES public.site_basket_product_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_type_id, product_id)
);

CREATE TABLE public.site_basket_product_type_quantities (
  product_type_id uuid NOT NULL REFERENCES public.site_basket_product_types(id) ON DELETE CASCADE,
  basket_id uuid NOT NULL REFERENCES public.basket_templates(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0 AND quantity <= 999),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_type_id, basket_id)
);

ALTER TABLE public.site_basket_product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_basket_product_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_basket_product_type_quantities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_basket_product_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_basket_product_type_options FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_basket_product_type_quantities FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.site_basket_product_types TO service_role;
GRANT ALL ON TABLE public.site_basket_product_type_options TO service_role;
GRANT ALL ON TABLE public.site_basket_product_type_quantities TO service_role;

-- Match the current public basket positions to their configured product types once.
CREATE TEMP TABLE pg_temp._site_basket_grid_seed_map ON COMMIT DROP AS
WITH position_products AS (
  SELECT
    b.id AS basket_id,
    b.name AS basket_name,
    b.sort_order AS basket_sort_order,
    pos.id AS position_id,
    pos.label,
    pos.quantity,
    pos.sort_order AS position_sort_order,
    pos.metadata AS position_metadata,
    array_agg(DISTINCT pos_option.product_id) AS product_ids
  FROM public.basket_templates b
  JOIN public.basket_categories category ON category.id = b.category_id
  JOIN public.basket_molds mold ON mold.basket_id = b.id
  JOIN public.basket_mold_positions pos ON pos.mold_id = mold.id
  JOIN public.basket_mold_position_options pos_option ON pos_option.position_id = pos.id
  WHERE b.is_active = true
    AND category.slug = 'cestas-completas'
  GROUP BY b.id, b.name, b.sort_order, pos.id, pos.label, pos.quantity, pos.sort_order, pos.metadata
), type_scores AS (
  SELECT
    position.basket_id,
    position.basket_name,
    position.basket_sort_order,
    position.position_id,
    position.label,
    position.quantity,
    position.position_sort_order,
    position.position_metadata,
    position.product_ids,
    product_type.id AS source_type_id,
    product_type.name AS source_type_name,
    product_type.sort_order AS source_type_sort_order,
    count(DISTINCT type_option.product_id) FILTER (
      WHERE type_option.product_id = ANY(position.product_ids)
    ) AS overlap
  FROM position_products position
  CROSS JOIN public.basket_admin_product_types product_type
  LEFT JOIN public.basket_admin_product_options type_option
    ON type_option.product_type_id = product_type.id
  GROUP BY
    position.basket_id, position.basket_name, position.basket_sort_order,
    position.position_id, position.label, position.quantity, position.position_sort_order,
    position.position_metadata, position.product_ids,
    product_type.id, product_type.name, product_type.sort_order
), ranked AS (
  SELECT
    type_scores.*,
    dense_rank() OVER (PARTITION BY position_id ORDER BY overlap DESC) AS best_rank
  FROM type_scores
)
SELECT *
FROM ranked
WHERE best_rank = 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT position_id
    FROM pg_temp._site_basket_grid_seed_map
    GROUP BY position_id
    HAVING count(*) <> 1 OR max(overlap) = 0
  ) THEN
    RAISE EXCEPTION 'site_basket_grid_seed_mapping_ambiguous';
  END IF;
END;
$$;

WITH type_orders AS (
  SELECT
    source_type_id,
    source_type_name,
    min(position_sort_order) AS first_position_order
  FROM pg_temp._site_basket_grid_seed_map
  GROUP BY source_type_id, source_type_name
), ordered_types AS (
  SELECT
    source_type_id,
    source_type_name,
    row_number() OVER (ORDER BY first_position_order, source_type_name) - 1 AS type_order
  FROM type_orders
)
INSERT INTO public.site_basket_product_types(seed_source_type_id, title, sort_order)
SELECT source_type_id, source_type_name, type_order
FROM ordered_types
ON CONFLICT (seed_source_type_id) DO UPDATE
SET title = EXCLUDED.title,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

WITH option_occurrences AS (
  SELECT
    seed.source_type_id,
    position_option.product_id,
    count(*) FILTER (WHERE position_option.sort_order = 0) AS first_option_count,
    bool_or(coalesce(position_option.metadata, '{}'::jsonb) @> '{"preferred":true}'::jsonb) AS was_preferred,
    min(position_option.sort_order) AS earliest_order,
    bool_or(coalesce(position_option.metadata->>'manual_replacement_required', 'false') = 'true') AS manual_review,
    max(position_option.metadata->>'manual_replacement_reason') AS manual_reason
  FROM pg_temp._site_basket_grid_seed_map seed
  JOIN public.basket_mold_position_options position_option ON position_option.position_id = seed.position_id
  GROUP BY seed.source_type_id, position_option.product_id
), ordered_options AS (
  SELECT
    option_occurrences.*,
    row_number() OVER (
      PARTITION BY source_type_id
      ORDER BY was_preferred DESC, first_option_count DESC, earliest_order, product_id
    ) - 1 AS option_order
  FROM option_occurrences
)
INSERT INTO public.site_basket_product_type_options(product_type_id, product_id, sort_order, metadata)
SELECT
  product_type.id,
  ordered_options.product_id,
  ordered_options.option_order,
  jsonb_build_object('preferred', ordered_options.option_order = 0)
    || CASE WHEN ordered_options.manual_review THEN jsonb_build_object('manual_replacement_required', true) ELSE '{}'::jsonb END
    || CASE WHEN ordered_options.manual_reason IS NOT NULL THEN jsonb_build_object('manual_replacement_reason', ordered_options.manual_reason) ELSE '{}'::jsonb END
FROM ordered_options
JOIN public.site_basket_product_types product_type
  ON product_type.seed_source_type_id = ordered_options.source_type_id
ON CONFLICT (product_type_id, product_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    updated_at = now();

CREATE TEMP TABLE pg_temp._site_basket_grid_seed_position_options ON COMMIT DROP AS
SELECT position_option.position_id, position_option.product_id, position_option.metadata
FROM pg_temp._site_basket_grid_seed_map seed
JOIN public.basket_mold_position_options position_option
  ON position_option.position_id = seed.position_id;

UPDATE public.basket_mold_positions position
SET label = product_type.title,
    sort_order = product_type.sort_order,
    metadata = coalesce(position.metadata, '{}'::jsonb)
      || jsonb_build_object('site_basket_product_type_id', product_type.id)
FROM pg_temp._site_basket_grid_seed_map seed
JOIN public.site_basket_product_types product_type
  ON product_type.seed_source_type_id = seed.source_type_id
WHERE position.id = seed.position_id;

DELETE FROM public.basket_mold_position_options position_option
USING pg_temp._site_basket_grid_seed_map seed
WHERE position_option.position_id = seed.position_id;

INSERT INTO public.basket_mold_position_options(position_id, product_id, sort_order, metadata)
SELECT
  seed.position_id,
  configured_option.product_id,
  configured_option.sort_order,
  (coalesce(current_option.metadata, '{}'::jsonb) - 'preferred')
    || jsonb_build_object('preferred', configured_option.sort_order = 0)
FROM pg_temp._site_basket_grid_seed_map seed
JOIN public.site_basket_product_types product_type
  ON product_type.seed_source_type_id = seed.source_type_id
JOIN public.site_basket_product_type_options configured_option
  ON configured_option.product_type_id = product_type.id
LEFT JOIN pg_temp._site_basket_grid_seed_position_options current_option
  ON current_option.position_id = seed.position_id
 AND current_option.product_id = configured_option.product_id
ORDER BY seed.position_id, configured_option.sort_order, configured_option.product_id;

WITH active_baskets AS (
  SELECT b.id
  FROM public.basket_templates b
  JOIN public.basket_categories category ON category.id = b.category_id
  JOIN public.basket_molds mold ON mold.basket_id = b.id
  WHERE b.is_active = true
    AND category.slug = 'cestas-completas'
), mapped_quantities AS (
  SELECT source_type_id, basket_id, sum(quantity)::integer AS quantity
  FROM pg_temp._site_basket_grid_seed_map
  GROUP BY source_type_id, basket_id
)
INSERT INTO public.site_basket_product_type_quantities(product_type_id, basket_id, quantity)
SELECT
  product_type.id,
  active_baskets.id,
  coalesce(mapped_quantities.quantity, 0)
FROM public.site_basket_product_types product_type
CROSS JOIN active_baskets
LEFT JOIN mapped_quantities
  ON mapped_quantities.source_type_id = product_type.seed_source_type_id
 AND mapped_quantities.basket_id = active_baskets.id
WHERE product_type.seed_source_type_id IS NOT NULL
ON CONFLICT (product_type_id, basket_id) DO UPDATE
SET quantity = EXCLUDED.quantity,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_v1(
  p_rows jsonb,
  p_operator text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_row jsonb;
  v_option_count integer;
  v_unique_option_count integer;
  v_existing_product_count integer;
  v_total_product_count integer;
  v_row_id uuid;
  v_title text;
  v_options jsonb;
  v_quantities jsonb;
  v_quantity_text text;
  v_quantity numeric;
  v_basket record;
  v_row_order integer := 0;
  v_basket_count integer := 0;
  v_type_count integer := 0;
  v_positive_count integer := 0;
  v_positions jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'site_basket_grid_rows_invalid';
  END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 80 THEN
    RAISE EXCEPTION 'site_basket_grid_rows_invalid';
  END IF;

  CREATE TEMP TABLE pg_temp._site_basket_grid_baskets ON COMMIT DROP AS
  SELECT
    basket.id AS basket_id,
    mold.id AS mold_id,
    mold.hidden_adjustment,
    mold.public_composition_count,
    basket.sort_order,
    basket.name
  FROM public.basket_templates basket
  JOIN public.basket_categories category ON category.id = basket.category_id
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE basket.is_active = true
    AND category.slug = 'cestas-completas'
  ORDER BY basket.sort_order, basket.name;
  SELECT count(*) INTO v_basket_count FROM pg_temp._site_basket_grid_baskets;
  IF v_basket_count < 1 THEN
    RAISE EXCEPTION 'site_basket_grid_baskets_missing';
  END IF;

  CREATE TEMP TABLE pg_temp._site_basket_grid_rows (
    type_id uuid PRIMARY KEY,
    row_order integer NOT NULL,
    title text NOT NULL,
    options jsonb NOT NULL,
    quantities jsonb NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE pg_temp._site_basket_grid_forced_products (
    product_id uuid PRIMARY KEY
  ) ON COMMIT DROP;
  INSERT INTO pg_temp._site_basket_grid_forced_products(product_id)
  SELECT DISTINCT position_option.product_id
  FROM public.basket_mold_position_options position_option
  JOIN public.basket_mold_positions position ON position.id = position_option.position_id
  JOIN public.basket_molds mold ON mold.id = position.mold_id
  JOIN public.basket_templates basket ON basket.id = mold.basket_id AND basket.is_active = true
  WHERE position_option.metadata ->> 'manual_replacement_reason' = 'only_configured_option_unavailable';

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := coalesce(nullif(btrim(v_row ->> 'id'), '')::uuid, gen_random_uuid());
    v_title := btrim(coalesce(v_row ->> 'title', ''));
    v_options := v_row -> 'options';
    v_quantities := v_row -> 'quantities';
    IF v_title = '' OR char_length(v_title) > 180
      OR v_options IS NULL OR v_quantities IS NULL THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;
    IF jsonb_typeof(v_options) <> 'array' OR jsonb_typeof(v_quantities) <> 'object' THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;
    IF jsonb_array_length(v_options) > 40 OR jsonb_object_length(v_quantities) <> v_basket_count THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;

    SELECT count(*), count(DISTINCT (option.value ->> 'product_id')::uuid)
      INTO v_option_count, v_unique_option_count
    FROM jsonb_array_elements(v_options) AS option(value);
    IF v_option_count <> v_unique_option_count THEN
      RAISE EXCEPTION 'site_basket_grid_option_invalid';
    END IF;

    FOR v_basket IN SELECT basket_id FROM pg_temp._site_basket_grid_baskets
    LOOP
      IF NOT (v_quantities ? v_basket.basket_id::text) THEN
        RAISE EXCEPTION 'site_basket_grid_quantity_missing';
      END IF;
      v_quantity_text := v_quantities ->> v_basket.basket_id::text;
      IF v_quantity_text IS NULL OR v_quantity_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'site_basket_grid_quantity_invalid';
      END IF;
      v_quantity := v_quantity_text::numeric;
      IF v_quantity < 0 OR v_quantity > 999
        OR (v_quantity > 0 AND v_option_count < 1) THEN
        RAISE EXCEPTION 'site_basket_grid_quantity_invalid';
      END IF;
    END LOOP;

    INSERT INTO pg_temp._site_basket_grid_rows(type_id, row_order, title, options, quantities)
    VALUES (v_row_id, v_row_order, v_title, v_options, v_quantities);
    v_row_order := v_row_order + 1;
  END LOOP;
  v_type_count := v_row_order;

  SELECT count(DISTINCT (option.value ->> 'product_id')::uuid)
    INTO v_total_product_count
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) AS option(value);
  SELECT count(*) INTO v_existing_product_count
  FROM public.products product
  WHERE product.id IN (
    SELECT DISTINCT (option.value ->> 'product_id')::uuid
    FROM pg_temp._site_basket_grid_rows grid_row
    CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) AS option(value)
  );
  IF v_existing_product_count <> v_total_product_count THEN
    RAISE EXCEPTION 'site_basket_grid_product_not_found';
  END IF;

  SELECT count(*) INTO v_positive_count
  FROM pg_temp._site_basket_grid_baskets basket
  WHERE EXISTS (
    SELECT 1
    FROM pg_temp._site_basket_grid_rows grid_row
    WHERE (grid_row.quantities ->> basket.basket_id::text)::numeric > 0
  );
  IF v_positive_count <> v_basket_count THEN
    RAISE EXCEPTION 'site_basket_grid_empty_basket';
  END IF;

  DELETE FROM public.site_basket_product_types product_type
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_temp._site_basket_grid_rows grid_row WHERE grid_row.type_id = product_type.id
  );
  INSERT INTO public.site_basket_product_types(id, title, sort_order, updated_at)
  SELECT type_id, title, row_order, now()
  FROM pg_temp._site_basket_grid_rows
  ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

  DELETE FROM public.site_basket_product_type_options option
  USING pg_temp._site_basket_grid_rows grid_row
  WHERE option.product_type_id = grid_row.type_id;
  INSERT INTO public.site_basket_product_type_options(product_type_id, product_id, sort_order, metadata, updated_at)
  SELECT
    grid_row.type_id,
    (option.value ->> 'product_id')::uuid,
    (option.ordinality - 1)::integer,
    (CASE WHEN jsonb_typeof(option.value -> 'metadata') = 'object'
      THEN option.value -> 'metadata' ELSE '{}'::jsonb END)
      || jsonb_build_object('preferred', option.ordinality = 1),
    now()
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) WITH ORDINALITY AS option(value, ordinality);

  DELETE FROM public.site_basket_product_type_quantities quantity
  USING pg_temp._site_basket_grid_baskets basket
  WHERE quantity.basket_id = basket.basket_id;
  INSERT INTO public.site_basket_product_type_quantities(product_type_id, basket_id, quantity, updated_at)
  SELECT
    grid_row.type_id,
    basket.basket_id,
    (grid_row.quantities ->> basket.basket_id::text)::integer,
    now()
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN pg_temp._site_basket_grid_baskets basket;

  FOR v_basket IN SELECT * FROM pg_temp._site_basket_grid_baskets ORDER BY sort_order, name
  LOOP
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'label', grid_row.title,
        'quantity', basket_quantity.quantity,
        'sort_order', grid_row.row_order,
        'metadata', coalesce(current_position.metadata, '{}'::jsonb)
          || jsonb_build_object('site_basket_product_type_id', grid_row.type_id),
        'options', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'product_id', configured_option.product_id,
            'sort_order', configured_option.sort_order,
            'metadata', (
              coalesce(current_option.metadata, configured_option.metadata, '{}'::jsonb) - 'preferred'
            ) || jsonb_build_object('preferred', configured_option.sort_order = 0)
          ) ORDER BY configured_option.sort_order, configured_option.product_id)
          FROM public.site_basket_product_type_options configured_option
          LEFT JOIN public.basket_mold_position_options current_option
            ON current_option.position_id = current_position.position_id
           AND current_option.product_id = configured_option.product_id
          WHERE configured_option.product_type_id = grid_row.type_id
        ), '[]'::jsonb)
      ) ORDER BY grid_row.row_order
    ), '[]'::jsonb)
    INTO v_positions
    FROM pg_temp._site_basket_grid_rows grid_row
    CROSS JOIN LATERAL (
      SELECT (grid_row.quantities ->> v_basket.basket_id::text)::numeric AS quantity
    ) basket_quantity
    LEFT JOIN LATERAL (
      SELECT position.id AS position_id, position.metadata
      FROM public.basket_mold_positions position
      WHERE position.mold_id = v_basket.mold_id
        AND position.metadata ->> 'site_basket_product_type_id' = grid_row.type_id::text
      ORDER BY position.sort_order, position.id
      LIMIT 1
    ) current_position ON true
    WHERE basket_quantity.quantity > 0;

    PERFORM public.site_admin_save_basket_mold_shared_v1(
      v_basket.basket_id,
      v_basket.hidden_adjustment,
      v_basket.public_composition_count,
      v_positions,
      coalesce(nullif(btrim(p_operator), ''), 'Admin site Dona Antônia'),
      '[]'::jsonb
    );
  END LOOP;

  UPDATE public.basket_mold_position_options position_option
  SET metadata = (coalesce(position_option.metadata, '{}'::jsonb) - 'manual_replacement_reason')
    || jsonb_build_object(
      'manual_replacement_required', true,
      'manual_replacement_reason', 'only_configured_option_unavailable'
    )
  FROM public.basket_mold_positions position
  JOIN public.basket_molds mold ON mold.id = position.mold_id
  JOIN public.basket_templates basket ON basket.id = mold.basket_id AND basket.is_active = true
  JOIN public.site_basket_product_type_quantities quantity
    ON quantity.basket_id = basket.id
   AND quantity.quantity > 0
  JOIN public.site_basket_product_types product_type
    ON product_type.id = quantity.product_type_id
   AND position.metadata ->> 'site_basket_product_type_id' = product_type.id::text
  JOIN public.site_basket_product_type_options configured_option
    ON configured_option.product_type_id = product_type.id
  JOIN public.products product ON product.id = configured_option.product_id
  WHERE position_option.position_id = position.id
    AND position_option.product_id = product.id
    AND product.is_active = false
    AND (
      SELECT count(*)
      FROM public.site_basket_product_type_options type_option
      WHERE type_option.product_type_id = product_type.id
    ) = 1;

  -- A single unavailable choice must remain active while it is part of an active site basket.
  UPDATE public.products product
  SET is_active = true,
      is_whatsapp_active = false
  WHERE product.is_active = false
    AND EXISTS (
      SELECT 1
      FROM public.site_basket_product_type_options configured_option
      JOIN public.site_basket_product_type_quantities quantity
        ON quantity.product_type_id = configured_option.product_type_id
      JOIN public.basket_templates basket ON basket.id = quantity.basket_id AND basket.is_active = true
      WHERE configured_option.product_id = product.id
        AND quantity.quantity > 0
        AND (
          SELECT count(*)
          FROM public.site_basket_product_type_options type_option
          WHERE type_option.product_type_id = configured_option.product_type_id
        ) = 1
    );

  UPDATE public.products product
  SET is_active = false
  FROM pg_temp._site_basket_grid_forced_products forced
  WHERE product.id = forced.product_id
    AND product.is_active = true
    AND product.is_whatsapp_active = false
    AND NOT EXISTS (
      SELECT 1
      FROM public.basket_mold_position_options position_option
      JOIN public.basket_mold_positions position ON position.id = position_option.position_id
      JOIN public.basket_molds mold ON mold.id = position.mold_id
      JOIN public.basket_templates basket ON basket.id = mold.basket_id AND basket.is_active = true
      WHERE position_option.product_id = product.id
    );

  RETURN jsonb_build_object('type_count', v_type_count, 'basket_count', v_basket_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_save_basket_grid_v1(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_save_basket_grid_v1(jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_site_basket_type_after_product_unavailable_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_type_id uuid;
  v_removed_order integer;
  v_remaining_count integer;
BEGIN
  IF OLD.stock IS NOT DISTINCT FROM NEW.stock
    AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active THEN
    RETURN NEW;
  END IF;
  IF NEW.is_active IS TRUE AND coalesce(NEW.stock, 0) > 0 THEN
    RETURN NEW;
  END IF;

  FOR v_type_id IN
    SELECT DISTINCT option.product_type_id
    FROM public.site_basket_product_type_options option
    JOIN public.site_basket_product_type_quantities quantity
      ON quantity.product_type_id = option.product_type_id
    JOIN public.basket_templates basket
      ON basket.id = quantity.basket_id
     AND basket.is_active = true
    WHERE option.product_id = NEW.id
      AND quantity.quantity > 0
  LOOP
    SELECT option.sort_order INTO v_removed_order
    FROM public.site_basket_product_type_options option
    WHERE option.product_type_id = v_type_id
      AND option.product_id = NEW.id;

    SELECT count(*) INTO v_remaining_count
    FROM public.site_basket_product_type_options option
    WHERE option.product_type_id = v_type_id
      AND option.product_id <> NEW.id;

    IF v_remaining_count > 0 THEN
      DELETE FROM public.site_basket_product_type_options
      WHERE product_type_id = v_type_id
        AND product_id = NEW.id;

      WITH ordered AS (
        SELECT
          option.product_id,
          row_number() OVER (
            ORDER BY CASE WHEN option.sort_order > v_removed_order THEN 0 ELSE 1 END,
                     option.sort_order,
                     option.product_id
          ) - 1 AS next_order
        FROM public.site_basket_product_type_options option
        WHERE option.product_type_id = v_type_id
      )
      UPDATE public.site_basket_product_type_options option
      SET sort_order = ordered.next_order,
          metadata = (coalesce(option.metadata, '{}'::jsonb) - 'preferred')
            || jsonb_build_object('preferred', ordered.next_order = 0),
          updated_at = now()
      FROM ordered
      WHERE option.product_type_id = v_type_id
        AND option.product_id = ordered.product_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_site_basket_type_after_product_unavailable_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_site_basket_type_after_product_unavailable_v1() TO service_role;

DROP TRIGGER IF EXISTS trg_site_basket_type_after_product_unavailable ON public.products;
CREATE TRIGGER trg_site_basket_type_after_product_unavailable
AFTER UPDATE OF stock, is_active ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_site_basket_type_after_product_unavailable_v1();

-- These products were kept active only because their old basket had one option.
-- After the variation lists are unified, let the existing replacement trigger
-- move any such product to the next configured option.
UPDATE public.products product
SET is_active = false,
    is_whatsapp_active = false
WHERE product.is_active = true
  AND product.is_whatsapp_active = false
  AND EXISTS (
    SELECT 1
    FROM public.basket_mold_position_options position_option
    JOIN public.basket_mold_positions position ON position.id = position_option.position_id
    JOIN public.basket_molds mold ON mold.id = position.mold_id
    JOIN public.basket_templates basket ON basket.id = mold.basket_id AND basket.is_active = true
    JOIN public.site_basket_product_type_quantities quantity
      ON quantity.basket_id = basket.id
     AND quantity.quantity > 0
    JOIN public.site_basket_product_types product_type
      ON product_type.id = quantity.product_type_id
     AND position.metadata ->> 'site_basket_product_type_id' = product_type.id::text
    WHERE position_option.product_id = product.id
      AND position_option.metadata ->> 'manual_replacement_reason' = 'only_configured_option_unavailable'
      AND (
        SELECT count(*)
        FROM public.site_basket_product_type_options type_option
        WHERE type_option.product_type_id = product_type.id
      ) > 1
  );
