CREATE OR REPLACE FUNCTION public.site_admin_save_basket_mold_shared_v1(
  p_basket_id uuid,
  p_hidden_adjustment numeric,
  p_public_composition_count integer,
  p_positions jsonb,
  p_operator text,
  p_share_changes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := COALESCE(auth.jwt() ->> 'role', '');
  v_category_slug text;
  v_editor jsonb;
  v_change jsonb;
  v_action text;
  v_item_id uuid;
  v_old_label text;
  v_label text;
  v_options jsonb;
  v_option jsonb;
  v_product_id uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_order integer := 0;
  v_defaults jsonb;
  v_old_totals jsonb;
  v_basket record;
  v_old_total_cents bigint;
  v_new_base_cents bigint;
  v_new_conditional_cents bigint;
  v_option_rows integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_hidden_adjustment_cents bigint;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_share_changes IS NULL
    OR jsonb_typeof(p_share_changes) <> 'array'
    OR jsonb_array_length(p_share_changes) > 80 THEN
    RAISE EXCEPTION 'basket_mold_shared_changes_invalid';
  END IF;

  SELECT cat.slug INTO v_category_slug
  FROM public.basket_templates b
  JOIN public.basket_categories cat ON cat.id = b.category_id
  WHERE b.id = p_basket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'basket_mold_basket_not_found';
  END IF;
  IF jsonb_array_length(p_share_changes) > 0 AND v_category_slug <> 'cestas-completas' THEN
    RAISE EXCEPTION 'basket_mold_shared_scope_invalid';
  END IF;

  v_editor := public.save_basket_mold_v1(
    p_basket_id,
    p_hidden_adjustment,
    p_public_composition_count,
    p_positions,
    p_operator
  );

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_share_changes)
  LOOP
    v_action := COALESCE(v_change ->> 'action', '');
    PERFORM pg_advisory_xact_lock(hashtextextended('basket_mold_shared_items:cestas-completas', 0));

    IF v_action = 'disable' THEN
      v_item_id := NULLIF(v_change ->> 'shared_item_id', '')::uuid;
      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'basket_mold_shared_item_invalid';
      END IF;

      DELETE FROM public.basket_mold_shared_items
      WHERE id = v_item_id AND scope = 'cestas-completas';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'basket_mold_shared_item_not_found';
      END IF;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'action', 'disable', 'item_id', v_item_id
      ));
      CONTINUE;
    END IF;

    IF v_action <> 'upsert' THEN
      RAISE EXCEPTION 'basket_mold_shared_action_invalid';
    END IF;

    v_label := btrim(COALESCE(v_change ->> 'label', ''));
    v_options := v_change -> 'options';
    IF v_label = '' OR char_length(v_label) > 180
      OR COALESCE(jsonb_typeof(v_options), '') <> 'array'
      OR jsonb_array_length(v_options) < 1
      OR jsonb_array_length(v_options) > 40 THEN
      RAISE EXCEPTION 'basket_mold_shared_item_invalid';
    END IF;

    v_item_id := NULLIF(v_change ->> 'shared_item_id', '')::uuid;
    v_old_label := NULL;
    IF v_item_id IS NULL THEN
      SELECT id, label INTO v_item_id, v_old_label
      FROM public.basket_mold_shared_items
      WHERE scope = 'cestas-completas' AND label = v_label
      FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.basket_mold_shared_items(scope, label, sort_order, metadata)
        VALUES (
          'cestas-completas',
          v_label,
          (SELECT COALESCE(MAX(sort_order) + 1, 0)
           FROM public.basket_mold_shared_items WHERE scope = 'cestas-completas'),
          jsonb_build_object('updated_by', COALESCE(NULLIF(btrim(p_operator), ''), 'Admin site Dona Antônia'))
        )
        RETURNING id INTO v_item_id;
      ELSE
        UPDATE public.basket_mold_shared_items
        SET updated_at = now(),
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('updated_by', COALESCE(NULLIF(btrim(p_operator), ''), 'Admin site Dona Antônia'))
        WHERE id = v_item_id;
      END IF;
    ELSE
      SELECT label INTO v_old_label
      FROM public.basket_mold_shared_items
      WHERE id = v_item_id AND scope = 'cestas-completas'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'basket_mold_shared_item_not_found';
      END IF;
      IF v_old_label <> v_label THEN
        UPDATE public.basket_mold_positions pos SET label = v_label
        FROM public.basket_molds m,
             public.basket_templates b,
             public.basket_categories cat
        WHERE pos.mold_id = m.id
          AND m.basket_id = b.id
          AND b.category_id = cat.id
          AND cat.slug = 'cestas-completas'
          AND pos.label = v_old_label;
      END IF;
      UPDATE public.basket_mold_shared_items
      SET label = v_label,
          updated_at = now(),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('updated_by', COALESCE(NULLIF(btrim(p_operator), ''), 'Admin site Dona Antônia'))
      WHERE id = v_item_id;
    END IF;

    v_seen := '{}'::uuid[];
    FOR v_option IN SELECT value FROM jsonb_array_elements(v_options)
    LOOP
      BEGIN
        v_product_id := NULLIF(v_option ->> 'product_id', '')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'basket_mold_shared_product_invalid';
      END;
      IF v_product_id IS NULL
        OR v_product_id = ANY(v_seen)
        OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = v_product_id) THEN
        RAISE EXCEPTION 'basket_mold_shared_product_invalid';
      END IF;
      v_seen := array_append(v_seen, v_product_id);
    END LOOP;

    SELECT COALESCE(jsonb_object_agg(pos.id::text, default_option.product_id::text), '{}'::jsonb)
    INTO v_defaults
    FROM public.basket_mold_positions pos
    JOIN public.basket_molds m ON m.id = pos.mold_id
    JOIN public.basket_templates b ON b.id = m.basket_id
    JOIN public.basket_categories cat ON cat.id = b.category_id
    CROSS JOIN LATERAL (
      SELECT opt.product_id
      FROM public.basket_mold_position_options opt
      WHERE opt.position_id = pos.id
      ORDER BY opt.sort_order, opt.id
      LIMIT 1
    ) default_option
    WHERE cat.slug = 'cestas-completas' AND pos.label = v_label;

    SELECT COALESCE(jsonb_object_agg(m.id::text, jsonb_build_object(
      'total_cents',
      COALESCE((
        SELECT SUM(ROUND(ROUND((CASE
          WHEN p.is_offer IS TRUE AND p.offer_price IS NOT NULL AND p.offer_price >= 0 THEN p.offer_price
          ELSE COALESCE(p.price, 0)
        END)::numeric * 100) * pos.quantity))::bigint
        FROM public.basket_mold_positions pos
        JOIN LATERAL (
          SELECT opt.product_id
          FROM public.basket_mold_position_options opt
          WHERE opt.position_id = pos.id
          ORDER BY opt.sort_order, opt.id
          LIMIT 1
        ) default_option ON TRUE
        JOIN public.products p ON p.id = default_option.product_id
        WHERE pos.mold_id = m.id
      ), 0)
      + ROUND(COALESCE(m.hidden_adjustment, 0) * 100)::bigint
      + CASE WHEN m.conditional_hidden_enabled IS TRUE
          AND m.conditional_hidden_product_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.basket_mold_positions pos
            JOIN LATERAL (
              SELECT opt.product_id
              FROM public.basket_mold_position_options opt
              WHERE opt.position_id = pos.id
              ORDER BY opt.sort_order, opt.id
              LIMIT 1
            ) default_option ON TRUE
            WHERE pos.mold_id = m.id
              AND pos.quantity > 0
              AND default_option.product_id = m.conditional_hidden_product_id
          )
        THEN ROUND(COALESCE(m.conditional_hidden_adjustment, 0) * 100)::bigint
        ELSE 0 END
    )), '{}'::jsonb)
    INTO v_old_totals
    FROM public.basket_molds m
    JOIN public.basket_templates b ON b.id = m.basket_id
    JOIN public.basket_categories cat ON cat.id = b.category_id
    WHERE cat.slug = 'cestas-completas'
      AND EXISTS (
        SELECT 1 FROM public.basket_mold_positions pos
        WHERE pos.mold_id = m.id AND pos.label = v_label
      );

    DELETE FROM public.basket_mold_shared_item_options
    WHERE shared_item_id = v_item_id;
    v_order := 0;
    FOR v_option IN SELECT value FROM jsonb_array_elements(v_options)
    LOOP
      v_product_id := (v_option ->> 'product_id')::uuid;
      INSERT INTO public.basket_mold_shared_item_options(shared_item_id, product_id, sort_order)
      VALUES (v_item_id, v_product_id, v_order);
      v_order := v_order + 1;
    END LOOP;

    DELETE FROM public.basket_mold_position_options opt
    USING public.basket_mold_positions pos,
          public.basket_molds m,
          public.basket_templates b,
          public.basket_categories cat
    WHERE opt.position_id = pos.id
      AND pos.mold_id = m.id
      AND m.basket_id = b.id
      AND b.category_id = cat.id
      AND cat.slug = 'cestas-completas'
      AND pos.label = v_label;

    WITH ranked_options AS (
      SELECT pos.id AS position_id,
             shared_option.product_id,
             ROW_NUMBER() OVER (
               PARTITION BY pos.id
               ORDER BY CASE
                 WHEN shared_option.product_id::text = (v_defaults ->> (pos.id::text)) THEN 0
                 ELSE 1
               END,
               shared_option.sort_order,
               shared_option.id
             ) - 1 AS sort_order
      FROM public.basket_mold_positions pos
      JOIN public.basket_molds m ON m.id = pos.mold_id
      JOIN public.basket_templates b ON b.id = m.basket_id
      JOIN public.basket_categories cat ON cat.id = b.category_id
      JOIN public.basket_mold_shared_item_options shared_option ON shared_option.shared_item_id = v_item_id
      WHERE cat.slug = 'cestas-completas' AND pos.label = v_label
    )
    INSERT INTO public.basket_mold_position_options(position_id, product_id, sort_order)
    SELECT position_id, product_id, sort_order FROM ranked_options;
    GET DIAGNOSTICS v_option_rows = ROW_COUNT;

    FOR v_basket IN
      SELECT m.id, (v_old_totals -> (m.id::text) ->> 'total_cents')::bigint AS total_cents
      FROM public.basket_molds m
      WHERE v_old_totals ? (m.id::text)
    LOOP
      v_old_total_cents := v_basket.total_cents;

      SELECT COALESCE(SUM(ROUND(ROUND((CASE
        WHEN p.is_offer IS TRUE AND p.offer_price IS NOT NULL AND p.offer_price >= 0 THEN p.offer_price
        ELSE COALESCE(p.price, 0)
      END)::numeric * 100) * pos.quantity)), 0)::bigint
      INTO v_new_base_cents
      FROM public.basket_mold_positions pos
      JOIN LATERAL (
        SELECT opt.product_id
        FROM public.basket_mold_position_options opt
        WHERE opt.position_id = pos.id
        ORDER BY opt.sort_order, opt.id
        LIMIT 1
      ) default_option ON TRUE
      JOIN public.products p ON p.id = default_option.product_id
      WHERE pos.mold_id = v_basket.id;

      SELECT CASE WHEN m.conditional_hidden_enabled IS TRUE
          AND m.conditional_hidden_product_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.basket_mold_positions pos
            JOIN LATERAL (
              SELECT opt.product_id
              FROM public.basket_mold_position_options opt
              WHERE opt.position_id = pos.id
              ORDER BY opt.sort_order, opt.id
              LIMIT 1
            ) default_option ON TRUE
            WHERE pos.mold_id = m.id
              AND pos.quantity > 0
              AND default_option.product_id = m.conditional_hidden_product_id
          )
        THEN ROUND(COALESCE(m.conditional_hidden_adjustment, 0) * 100)::bigint
        ELSE 0 END
      INTO v_new_conditional_cents
      FROM public.basket_molds m
      WHERE m.id = v_basket.id;

      UPDATE public.basket_molds
      SET hidden_adjustment = (v_old_total_cents - v_new_base_cents - COALESCE(v_new_conditional_cents, 0))::numeric / 100,
          updated_at = now()
      WHERE id = v_basket.id;
    END LOOP;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'action', 'upsert',
      'item_id', v_item_id,
      'label', v_label,
      'option_rows', v_option_rows
    ));
  END LOOP;

  v_editor := public.basket_mold_editor_v1(p_basket_id);
  SELECT ROUND(COALESCE(m.hidden_adjustment, 0) * 100)::bigint
  INTO v_hidden_adjustment_cents
  FROM public.basket_molds m
  WHERE m.basket_id = p_basket_id;

  RETURN jsonb_build_object(
    'editor', v_editor,
    'hidden_adjustment_cents', COALESCE(v_hidden_adjustment_cents, 0),
    'share_changes', v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_save_basket_mold_shared_v1(uuid, numeric, integer, jsonb, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_save_basket_mold_shared_v1(uuid, numeric, integer, jsonb, text, jsonb)
  TO service_role;
