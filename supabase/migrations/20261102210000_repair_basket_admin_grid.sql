-- Repair basket-grid saves, calculate manual review from Supabase catalog stock,
-- and save the default site price together with the composition in one transaction.

DO $patch$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.site_admin_save_basket_grid_v1(jsonb,text)'::regprocedure);
  IF position('jsonb_object_length(v_quantities)' IN v_definition) > 0 THEN
    v_definition := replace(
      v_definition,
      'jsonb_object_length(v_quantities)',
      '(SELECT count(*) FROM jsonb_object_keys(v_quantities))'
    );
    EXECUTE v_definition;
  ELSIF position('jsonb_object_keys(v_quantities)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'site_basket_grid_save_function_changed_unexpectedly';
  END IF;
END;
$patch$;

CREATE OR REPLACE FUNCTION public.basket_mold_manual_replacement_review_v1(p_basket_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
WITH positions AS (
  SELECT
    basket.id AS basket_id,
    basket.name AS basket_name,
    position.id AS position_id,
    position.label,
    position.sort_order AS position_order,
    position.quantity,
    option_row.product_id,
    option_row.sort_order AS option_order,
    coalesce(option_row.metadata, '{}'::jsonb) AS option_metadata,
    product.is_active,
    product.is_whatsapp_active,
    greatest(0, coalesce(product.stock, 0)
      - public.supabase_stock_pending_reservations_v1(product.id, NULL::uuid)) AS available_stock,
    count(*) OVER (PARTITION BY position.id)::integer AS option_count
  FROM public.basket_templates basket
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  JOIN public.basket_mold_positions position ON position.mold_id = mold.id
  JOIN public.basket_mold_position_options option_row ON option_row.position_id = position.id
  JOIN public.products product ON product.id = option_row.product_id
  WHERE basket.is_active IS TRUE
    AND (p_basket_ids IS NULL OR basket.id = ANY(p_basket_ids))
), position_state AS (
  SELECT
    position_id,
    bool_or(is_active IS TRUE AND available_stock >= quantity) AS has_available_option
  FROM positions
  GROUP BY position_id
), candidates AS (
  SELECT
    position.*,
    CASE
      WHEN position.option_count = 1
       AND position.is_active IS TRUE
       AND position.is_whatsapp_active IS NOT TRUE
       AND position.available_stock >= position.quantity
       AND position.option_metadata @> '{"manual_replacement_required":true}'::jsonb
        THEN 'only_configured_option_inactive'
      WHEN position.option_count = 1
        THEN 'only_configured_option_unavailable'
      ELSE 'no_sellable_option'
    END AS reason,
    row_number() OVER (
      PARTITION BY position.position_id
      ORDER BY
        CASE WHEN position.option_metadata @> '{"preferred":true}'::jsonb THEN 0 ELSE 1 END,
        position.option_order,
        position.product_id
    ) AS candidate_order
  FROM positions position
  JOIN position_state state ON state.position_id = position.position_id
  WHERE state.has_available_option IS NOT TRUE
     OR (
       position.option_count = 1
       AND position.is_active IS TRUE
       AND position.is_whatsapp_active IS NOT TRUE
       AND position.available_stock >= position.quantity
       AND position.option_metadata @> '{"manual_replacement_required":true}'::jsonb
     )
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'basket_id', basket_id,
  'basket_name', basket_name,
  'position_id', position_id,
  'position_label', label,
  'product_id', product_id,
  'reason', reason
) ORDER BY basket_name, position_order, product_id), '[]'::jsonb)
FROM candidates
WHERE candidate_order = 1;
$function$;

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_with_prices_v1(
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
  WHERE basket.is_active IS TRUE;

  SELECT count(*) INTO v_price_key_count
  FROM jsonb_object_keys(p_basket_prices) AS entry(key_name);

  SELECT count(*) INTO v_valid_price_key_count
  FROM jsonb_object_keys(p_basket_prices) AS entry(key_name)
  JOIN public.basket_templates basket ON basket.id::text = entry.key_name
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE basket.is_active IS TRUE;

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
    WHERE basket.is_active IS TRUE
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
    WHERE basket.is_active IS TRUE
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
$function$;

REVOKE ALL ON FUNCTION public.site_admin_save_basket_grid_with_prices_v1(jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_save_basket_grid_with_prices_v1(jsonb,jsonb,text)
  TO service_role;
