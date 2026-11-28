ALTER TABLE public.site_basket_product_types
  DROP CONSTRAINT IF EXISTS site_basket_product_types_slot_order_check;

ALTER TABLE public.site_basket_product_types
  ADD CONSTRAINT site_basket_product_types_slot_order_check CHECK (slot_order >= 1);

UPDATE public.basket_mold_positions
SET label = regexp_replace(label, ' · Padrão [0-9]+$', '')
WHERE label ~ ' · Padrão [0-9]+$'
  AND coalesce(metadata, '{}'::jsonb) ? 'site_basket_product_session_id';

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_v1(p_rows jsonb, p_operator text)
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
  v_session_id uuid;
  v_slot_order integer;
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
  IF jsonb_array_length(p_rows) < 1 THEN
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
    session_id uuid NOT NULL,
    slot_order integer NOT NULL,
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
    v_session_id := coalesce(nullif(btrim(v_row ->> 'session_id'), '')::uuid, v_row_id);
    v_slot_order := coalesce(nullif(btrim(v_row ->> 'slot_order'), '')::integer, 1);
    v_title := btrim(coalesce(v_row ->> 'title', ''));
    v_options := v_row -> 'options';
    v_quantities := v_row -> 'quantities';
    IF v_title = '' OR char_length(v_title) > 180 OR v_slot_order < 1
      OR v_options IS NULL OR v_quantities IS NULL THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;
    IF jsonb_typeof(v_options) <> 'array' OR jsonb_typeof(v_quantities) <> 'object' THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;
    IF jsonb_array_length(v_options) > 100 OR (SELECT count(*) FROM jsonb_object_keys(v_quantities)) <> v_basket_count THEN
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

    INSERT INTO pg_temp._site_basket_grid_rows(type_id, session_id, slot_order, row_order, title, options, quantities)
    VALUES (v_row_id, v_session_id, v_slot_order, v_row_order, v_title, v_options, v_quantities);
    v_row_order := v_row_order + 1;
  END LOOP;
  v_type_count := v_row_order;

  IF EXISTS (
    SELECT 1
    FROM pg_temp._site_basket_grid_rows
    GROUP BY session_id
    HAVING count(DISTINCT title) <> 1
      OR count(DISTINCT slot_order) <> count(*)
      OR min(slot_order) <> 1
      OR max(slot_order) <> count(*)
  ) THEN
    RAISE EXCEPTION 'site_basket_grid_session_invalid';
  END IF;

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
  INSERT INTO public.site_basket_product_types(id, title, session_id, slot_order, sort_order, updated_at)
  SELECT type_id, title, session_id, slot_order, row_order, now()
  FROM pg_temp._site_basket_grid_rows
  ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      session_id = EXCLUDED.session_id,
      slot_order = EXCLUDED.slot_order,
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
          || jsonb_build_object(
            'site_basket_product_type_id', grid_row.type_id,
            'site_basket_product_session_id', grid_row.session_id,
            'site_basket_product_slot_order', grid_row.slot_order
          ),
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
    ) = 1;RETURN jsonb_build_object('type_count', v_type_count, 'basket_count', v_basket_count);
END;
$function$
;
