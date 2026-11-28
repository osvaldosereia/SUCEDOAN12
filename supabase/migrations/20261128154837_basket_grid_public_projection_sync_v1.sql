CREATE OR REPLACE FUNCTION public.site_admin_sync_basket_grid_public_projection_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_basket record;
  v_positions jsonb;
  v_baskets_synced integer := 0;
  v_mismatch_count integer := 0;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('site_admin_basket_grid_public_projection_v1', 0));

  FOR v_basket IN
    SELECT basket.id AS basket_id,
           mold.id AS mold_id,
           mold.hidden_adjustment,
           mold.public_composition_count
    FROM public.basket_templates basket
    JOIN public.basket_categories category ON category.id = basket.category_id
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    WHERE category.slug = 'cestas-completas'
      AND basket.is_active IS TRUE
    ORDER BY basket.sort_order, basket.name, basket.id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.site_basket_product_types product_type
      JOIN public.site_basket_product_type_quantities type_quantity
        ON type_quantity.product_type_id = product_type.id
       AND type_quantity.basket_id = v_basket.basket_id
       AND type_quantity.quantity > 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.site_basket_product_type_options option_row
        WHERE option_row.product_type_id = product_type.id
      )
    ) THEN
      RAISE EXCEPTION 'basket_projection_session_has_no_products';
    END IF;

    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'label', source.title,
        'quantity', source.total_quantity,
        'sort_order', source.position_order,
        'metadata', source.position_metadata,
        'options', source.options
      ) ORDER BY source.position_order, source.slot_order, source.type_id
    ), '[]'::jsonb)
    INTO v_positions
    FROM (
      SELECT product_type.id AS type_id,
             product_type.title,
             coalesce(product_type.sort_order, 0) AS position_order,
             coalesce(product_type.slot_order, 1) AS slot_order,
             (
               SELECT coalesce(sum(greatest(0, coalesce(quantity.quantity, 0))), 0)::integer
               FROM public.site_basket_product_type_options option_row
               LEFT JOIN public.site_basket_product_type_option_quantities quantity
                 ON quantity.product_type_id = option_row.product_type_id
                AND quantity.product_id = option_row.product_id
                AND quantity.basket_id = v_basket.basket_id
               WHERE option_row.product_type_id = product_type.id
             ) AS total_quantity,
             coalesce((
               SELECT position.metadata
               FROM public.basket_mold_positions position
               WHERE position.mold_id = v_basket.mold_id
                 AND position.metadata ->> 'site_basket_product_type_id' = product_type.id::text
               ORDER BY position.sort_order, position.id
               LIMIT 1
             ), '{}'::jsonb) || jsonb_build_object(
               'site_basket_product_type_id', product_type.id,
               'site_basket_product_session_id', coalesce(product_type.session_id, product_type.id),
               'site_basket_product_slot_order', coalesce(product_type.slot_order, 1)
             ) AS position_metadata,
             (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'product_id', option_row.product_id,
                 'sort_order', option_row.sort_order,
                 'metadata', (
                   coalesce(option_row.metadata, '{}'::jsonb)
                     - 'preferred' - 'base_quantity' - 'quantities' - 'basket_quantities'
                     - 'manual_replacement_required' - 'manual_replacement_reason'
                 ) || jsonb_build_object(
                   'base_quantity', greatest(0, coalesce(quantity.quantity, 0))
                 )
               ) ORDER BY option_row.sort_order, option_row.product_id), '[]'::jsonb)
               FROM public.site_basket_product_type_options option_row
               LEFT JOIN public.site_basket_product_type_option_quantities quantity
                 ON quantity.product_type_id = option_row.product_type_id
                AND quantity.product_id = option_row.product_id
                AND quantity.basket_id = v_basket.basket_id
               WHERE option_row.product_type_id = product_type.id
             ) AS options
      FROM public.site_basket_product_types product_type
      WHERE EXISTS (
        SELECT 1
        FROM public.site_basket_product_type_options option_row
        WHERE option_row.product_type_id = product_type.id
      )
    ) AS source;

    IF jsonb_typeof(v_positions) IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_positions) = 0 THEN
      RAISE EXCEPTION 'basket_projection_positions_missing';
    END IF;

    PERFORM public.save_basket_mold_v1(
      v_basket.basket_id,
      v_basket.hidden_adjustment,
      greatest(1, least(6, coalesce(v_basket.public_composition_count, 1))),
      v_positions,
      'Admin site Dona Antônia'
    );
    v_baskets_synced := v_baskets_synced + 1;
  END LOOP;

  IF v_baskets_synced = 0 THEN
    RAISE EXCEPTION 'basket_projection_active_baskets_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.basket_templates basket
    JOIN public.basket_categories category ON category.id = basket.category_id
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    JOIN public.site_basket_product_types product_type ON true
    WHERE category.slug = 'cestas-completas'
      AND basket.is_active IS TRUE
      AND EXISTS (
        SELECT 1
        FROM public.site_basket_product_type_options option_row
        WHERE option_row.product_type_id = product_type.id
      )
      AND (
        SELECT count(*)
        FROM public.basket_mold_positions position
        WHERE position.mold_id = mold.id
          AND position.metadata ->> 'site_basket_product_type_id' = product_type.id::text
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'basket_projection_position_count_mismatch';
  END IF;

  WITH expected AS (
    SELECT basket.id AS basket_id,
           product_type.id::text AS type_id,
           option_row.product_id,
           greatest(0, coalesce(quantity.quantity, 0))::numeric AS quantity
    FROM public.basket_templates basket
    JOIN public.basket_categories category ON category.id = basket.category_id
    JOIN public.site_basket_product_types product_type ON true
    JOIN public.site_basket_product_type_options option_row
      ON option_row.product_type_id = product_type.id
    LEFT JOIN public.site_basket_product_type_option_quantities quantity
      ON quantity.product_type_id = option_row.product_type_id
     AND quantity.product_id = option_row.product_id
     AND quantity.basket_id = basket.id
    WHERE category.slug = 'cestas-completas'
      AND basket.is_active IS TRUE
  ), actual AS (
    SELECT basket.id AS basket_id,
           position.metadata ->> 'site_basket_product_type_id' AS type_id,
           option_row.product_id,
           greatest(0, coalesce(
             nullif(option_row.metadata ->> 'base_quantity', '')::numeric,
             CASE WHEN option_row.sort_order = 0 THEN position.quantity ELSE 0 END
           )) AS quantity
    FROM public.basket_templates basket
    JOIN public.basket_categories category ON category.id = basket.category_id
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    JOIN public.basket_mold_positions position ON position.mold_id = mold.id
    JOIN public.basket_mold_position_options option_row ON option_row.position_id = position.id
    WHERE category.slug = 'cestas-completas'
      AND basket.is_active IS TRUE
  )
  SELECT count(*)
  INTO v_mismatch_count
  FROM expected
  FULL OUTER JOIN actual USING (basket_id, type_id, product_id)
  WHERE expected.product_id IS NULL
     OR actual.product_id IS NULL
     OR expected.quantity IS DISTINCT FROM actual.quantity;

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'basket_projection_quantity_mismatch:%', v_mismatch_count;
  END IF;

  RETURN jsonb_build_object(
    'baskets_synced', v_baskets_synced,
    'quantity_mismatches', v_mismatch_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_sync_basket_grid_public_projection_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_sync_basket_grid_public_projection_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_with_prices_v2(
  p_rows jsonb,
  p_basket_prices jsonb,
  p_operator text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_saved jsonb;
  v_fixed_prices jsonb;
  v_projection jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('site_admin_basket_grid_public_projection_v1', 0));
  v_saved := public.site_admin_save_basket_grid_with_prices_v1(p_rows, p_basket_prices, p_operator);
  v_fixed_prices := public.site_admin_save_basket_default_prices_v1(p_basket_prices);
  v_projection := public.site_admin_sync_basket_grid_public_projection_v1();
  RETURN coalesce(v_saved, '{}'::jsonb)
    || coalesce(v_fixed_prices, '{}'::jsonb)
    || jsonb_build_object('public_projection_sync', v_projection);
END;
$function$;

DO $migration$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.site_admin_sync_basket_grid_public_projection_v1();
  RAISE NOTICE 'Basket public projection synchronized: %', v_result;
END;
$migration$;
