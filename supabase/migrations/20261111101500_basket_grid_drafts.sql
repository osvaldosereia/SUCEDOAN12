-- Support editable, non-public basket grid drafts and creating a new basket from an existing composition.
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
  WHERE (basket.is_active = true OR coalesce(mold.metadata ->> 'site_admin_basket_grid_draft', 'false') = 'true')
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
    IF jsonb_array_length(v_options) > 40 OR (SELECT count(*) FROM jsonb_object_keys(v_quantities)) <> v_basket_count THEN
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
$function$


CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_with_prices_v1(p_rows jsonb, p_basket_prices jsonb, p_operator text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_basket record;
  v_basket_count integer;
  v_price_key_count integer;
  v_valid_price_key_count integer;
  v_price_text text;
  v_target_price_cents numeric;
  v_product_total_cents numeric;
  v_conditional_cents numeric;
  v_saved jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_basket_prices IS NULL OR jsonb_typeof(p_basket_prices) <> 'object' THEN
    RAISE EXCEPTION 'site_basket_grid_price_invalid';
  END IF;

  SELECT count(*) INTO v_basket_count
  FROM public.basket_templates basket
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE (basket.is_active IS TRUE OR coalesce(mold.metadata ->> 'site_admin_basket_grid_draft', 'false') = 'true');

  SELECT count(*) INTO v_price_key_count
  FROM jsonb_object_keys(p_basket_prices) AS entry(key_name);

  SELECT count(*) INTO v_valid_price_key_count
  FROM jsonb_object_keys(p_basket_prices) AS entry(key_name)
  JOIN public.basket_templates basket ON basket.id::text = entry.key_name
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE (basket.is_active IS TRUE OR coalesce(mold.metadata ->> 'site_admin_basket_grid_draft', 'false') = 'true');

  IF v_basket_count < 1
     OR v_price_key_count <> v_basket_count
     OR v_valid_price_key_count <> v_basket_count THEN
    RAISE EXCEPTION 'site_basket_grid_price_invalid';
  END IF;

  FOR v_basket IN
    SELECT basket.id AS basket_id
    FROM public.basket_templates basket
    JOIN public.basket_categories category
      ON category.id = basket.category_id
     AND category.slug = 'cestas-completas'
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    WHERE (basket.is_active IS TRUE OR coalesce(mold.metadata ->> 'site_admin_basket_grid_draft', 'false') = 'true')
  LOOP
    v_price_text := p_basket_prices ->> v_basket.basket_id::text;
    IF v_price_text IS NULL OR v_price_text !~ '^[0-9]{1,9}$'
       OR v_price_text::numeric > 100000000 THEN
      RAISE EXCEPTION 'site_basket_grid_price_invalid';
    END IF;
  END LOOP;

  v_saved := public.site_admin_save_basket_grid_v1(p_rows, p_operator);

  -- Remove only obsolete metadata from the shared option record. Review is
  -- calculated per active basket above, so the shared record is not authoritative.
  UPDATE public.site_basket_product_type_options configured_option
  SET metadata = coalesce(configured_option.metadata, '{}'::jsonb)
      - 'manual_replacement_required' - 'manual_replacement_reason',
      updated_at = now()
  FROM public.products product
  WHERE product.id = configured_option.product_id
    AND product.is_active IS TRUE
    AND product.is_whatsapp_active IS TRUE
    AND coalesce(product.stock, 0) > 0
    AND configured_option.metadata @> '{"manual_replacement_required":true}'::jsonb;

  UPDATE public.basket_mold_position_options position_option
  SET metadata = coalesce(position_option.metadata, '{}'::jsonb)
      - 'manual_replacement_required' - 'manual_replacement_reason',
      updated_at = now()
  FROM public.basket_mold_positions position
  JOIN public.basket_molds mold ON mold.id = position.mold_id
  JOIN public.basket_templates basket ON basket.id = mold.basket_id AND basket.is_active IS TRUE
  WHERE position_option.position_id = position.id
    AND position_option.metadata @> '{"manual_replacement_required":true}'::jsonb
    AND EXISTS (
      SELECT 1
      FROM public.products product
      WHERE product.id = position_option.product_id
        AND product.is_active IS TRUE
        AND product.is_whatsapp_active IS TRUE
        AND greatest(0, coalesce(product.stock, 0)
          - public.supabase_stock_pending_reservations_v1(product.id, NULL::uuid)) >= position.quantity
    );

  FOR v_basket IN
    SELECT
      basket.id AS basket_id,
      mold.id AS mold_id,
      mold.conditional_hidden_enabled,
      mold.conditional_hidden_product_id,
      mold.conditional_hidden_adjustment
    FROM public.basket_templates basket
    JOIN public.basket_categories category
      ON category.id = basket.category_id
     AND category.slug = 'cestas-completas'
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    WHERE (basket.is_active IS TRUE OR coalesce(mold.metadata ->> 'site_admin_basket_grid_draft', 'false') = 'true')
  LOOP
    v_target_price_cents := (p_basket_prices ->> v_basket.basket_id::text)::numeric;

    SELECT coalesce(sum(round((CASE
      WHEN product.is_offer IS TRUE
       AND product.offer_price IS NOT NULL
       AND product.offer_price >= 0
        THEN product.offer_price
      ELSE coalesce(product.price, 0)
    END) * 100) * position.quantity), 0)
    INTO v_product_total_cents
    FROM public.basket_mold_positions position
    JOIN public.basket_mold_position_options option_row
      ON option_row.position_id = position.id
     AND option_row.sort_order = 0
    JOIN public.products product ON product.id = option_row.product_id
    WHERE position.mold_id = v_basket.mold_id
      AND position.quantity > 0;

    v_conditional_cents := 0;
    IF v_basket.conditional_hidden_enabled IS TRUE
       AND v_basket.conditional_hidden_product_id IS NOT NULL
       AND coalesce(v_basket.conditional_hidden_adjustment, 0) > 0
       AND EXISTS (
         SELECT 1
         FROM public.basket_mold_positions position
         JOIN public.basket_mold_position_options option_row
           ON option_row.position_id = position.id
          AND option_row.sort_order = 0
         WHERE position.mold_id = v_basket.mold_id
           AND position.quantity > 0
           AND option_row.product_id = v_basket.conditional_hidden_product_id
       ) THEN
      v_conditional_cents := round(v_basket.conditional_hidden_adjustment * 100);
    END IF;

    UPDATE public.basket_molds
    SET hidden_adjustment = (v_target_price_cents - v_product_total_cents - v_conditional_cents) / 100
    WHERE id = v_basket.mold_id;
  END LOOP;

  RETURN coalesce(v_saved, '{}'::jsonb)
    || jsonb_build_object('default_prices_saved', v_basket_count);
END;
$function$


CREATE OR REPLACE FUNCTION public.site_admin_create_basket_grid_draft_v1(
  p_source_basket_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_category_id uuid;
  v_source public.basket_templates%ROWTYPE;
  v_source_mold public.basket_molds%ROWTYPE;
  v_new_basket_id uuid;
  v_new_mold_id uuid;
  v_new_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_source_basket_id IS NULL OR v_new_name = '' OR char_length(v_new_name) > 120 THEN
    RAISE EXCEPTION 'site_basket_grid_draft_invalid';
  END IF;

  SELECT id INTO v_category_id
  FROM public.basket_categories
  WHERE slug = 'cestas-completas'
  LIMIT 1;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'site_basket_category_missing';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-admin-basket-grid:' || v_category_id::text, 0)
  );

  SELECT basket.* INTO v_source
  FROM public.basket_templates basket
  WHERE basket.id = p_source_basket_id
    AND basket.category_id = v_category_id
    AND basket.is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_basket_grid_source_invalid';
  END IF;

  SELECT mold.* INTO v_source_mold
  FROM public.basket_molds mold
  WHERE mold.basket_id = v_source.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_basket_grid_source_mold_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.basket_templates basket
    WHERE basket.category_id = v_category_id
      AND lower(btrim(basket.name)) = lower(v_new_name)
  ) THEN
    RAISE EXCEPTION 'site_basket_grid_name_exists';
  END IF;

  INSERT INTO public.basket_templates (
    sku, name, description, image_url, base_price, is_active, sort_order,
    rules, is_whatsapp_active, is_featured, internal_notes, hidden_adjustment,
    uses_hygiene_kit, split_kits_enabled, category_id, subcategory_id
  )
  SELECT
    NULL,
    v_new_name,
    source.description,
    source.image_url,
    source.base_price,
    false,
    coalesce((SELECT max(existing.sort_order) + 1 FROM public.basket_templates existing
      WHERE existing.category_id = v_category_id), 0),
    source.rules,
    false,
    false,
    NULL,
    source.hidden_adjustment,
    source.uses_hygiene_kit,
    source.split_kits_enabled,
    source.category_id,
    source.subcategory_id
  FROM public.basket_templates source
  WHERE source.id = v_source.id
  RETURNING id INTO v_new_basket_id;

  INSERT INTO public.basket_molds (
    basket_id, hidden_adjustment, public_composition_count, metadata,
    conditional_hidden_enabled, conditional_hidden_product_id, conditional_hidden_adjustment
  )
  VALUES (
    v_new_basket_id,
    v_source_mold.hidden_adjustment,
    v_source_mold.public_composition_count,
    coalesce(v_source_mold.metadata, '{}'::jsonb)
      || jsonb_build_object('site_admin_basket_grid_draft', true),
    v_source_mold.conditional_hidden_enabled,
    v_source_mold.conditional_hidden_product_id,
    v_source_mold.conditional_hidden_adjustment
  )
  RETURNING id INTO v_new_mold_id;

  CREATE TEMP TABLE pg_temp._site_admin_basket_draft_positions (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO pg_temp._site_admin_basket_draft_positions(old_id, new_id)
  SELECT position.id, gen_random_uuid()
  FROM public.basket_mold_positions position
  WHERE position.mold_id = v_source_mold.id;

  INSERT INTO public.basket_mold_positions (
    id, mold_id, label, quantity, sort_order, metadata
  )
  SELECT map.new_id, v_new_mold_id, position.label, position.quantity,
    position.sort_order, position.metadata
  FROM public.basket_mold_positions position
  JOIN pg_temp._site_admin_basket_draft_positions map ON map.old_id = position.id;

  INSERT INTO public.basket_mold_position_options (
    position_id, product_id, sort_order, metadata
  )
  SELECT map.new_id, option_row.product_id, option_row.sort_order, option_row.metadata
  FROM public.basket_mold_position_options option_row
  JOIN pg_temp._site_admin_basket_draft_positions map ON map.old_id = option_row.position_id;

  INSERT INTO public.site_basket_product_type_quantities(product_type_id, basket_id, quantity)
  SELECT quantity.product_type_id, v_new_basket_id, quantity.quantity
  FROM public.site_basket_product_type_quantities quantity
  WHERE quantity.basket_id = v_source.id;

  CREATE TEMP TABLE pg_temp._site_admin_basket_draft_items (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO pg_temp._site_admin_basket_draft_items(old_id, new_id)
  SELECT item.id, gen_random_uuid()
  FROM public.basket_template_items item
  WHERE item.basket_id = v_source.id;

  INSERT INTO public.basket_template_items (
    id, basket_id, product_id, quantity, removable, quantity_editable,
    min_quantity, max_quantity, substitution_group, pricing_rule, sort_order,
    remove_unit_delta, add_unit_delta
  )
  SELECT map.new_id, v_new_basket_id, item.product_id, item.quantity, item.removable,
    item.quantity_editable, item.min_quantity, item.max_quantity, item.substitution_group,
    item.pricing_rule, item.sort_order, item.remove_unit_delta, item.add_unit_delta
  FROM public.basket_template_items item
  JOIN pg_temp._site_admin_basket_draft_items map ON map.old_id = item.id;

  INSERT INTO public.basket_template_item_alternatives (
    template_item_id, product_id, priority, is_active
  )
  SELECT map.new_id, alternative.product_id, alternative.priority, alternative.is_active
  FROM public.basket_template_item_alternatives alternative
  JOIN pg_temp._site_admin_basket_draft_items map ON map.old_id = alternative.template_item_id;

  RETURN jsonb_build_object(
    'id', v_new_basket_id,
    'name', v_new_name,
    'is_active', false,
    'source_basket_id', v_source.id,
    'mold_id', v_new_mold_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_create_basket_grid_draft_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_create_basket_grid_draft_v1(uuid, text) TO service_role;
