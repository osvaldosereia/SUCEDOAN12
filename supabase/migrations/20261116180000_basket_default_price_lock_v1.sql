-- Keep the manually entered basket default price independent from product prices.
-- Existing displayed prices are copied into metadata so this change does not alter current prices.

WITH candidates AS (
  SELECT
    basket.id AS basket_id,
    mold.id AS mold_id,
    mold.hidden_adjustment,
    mold.conditional_hidden_enabled,
    mold.conditional_hidden_product_id,
    mold.conditional_hidden_adjustment
  FROM public.basket_templates basket
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold
    ON mold.basket_id = basket.id
  WHERE (basket.is_active IS TRUE
      OR coalesce(mold.metadata, '{}'::jsonb) @> '{"site_admin_basket_grid_draft":true}'::jsonb)
    AND NOT (coalesce(mold.metadata, '{}'::jsonb) ? 'site_admin_default_price_cents')
),
preferred_options AS (
  SELECT DISTINCT ON (configured_option.product_type_id)
    configured_option.product_type_id,
    configured_option.product_id
  FROM public.site_basket_product_type_options configured_option
  ORDER BY
    configured_option.product_type_id,
    CASE
      WHEN coalesce(configured_option.metadata, '{}'::jsonb) @> '{"preferred":true}'::jsonb THEN 0
      ELSE 1
    END,
    configured_option.sort_order,
    configured_option.product_id
),
basket_product_totals AS (
  SELECT
    quantity.basket_id,
    sum(
      round((CASE
        WHEN product.is_offer IS TRUE
         AND product.offer_price IS NOT NULL
         AND product.offer_price >= 0
          THEN product.offer_price
        ELSE coalesce(product.price, 0)
      END) * 100) * quantity.quantity
    )::bigint AS product_total_cents
  FROM public.site_basket_product_type_quantities quantity
  JOIN preferred_options preferred
    ON preferred.product_type_id = quantity.product_type_id
  JOIN public.products product
    ON product.id = preferred.product_id
  WHERE quantity.quantity > 0
  GROUP BY quantity.basket_id
)
UPDATE public.basket_molds mold
SET metadata = coalesce(mold.metadata, '{}'::jsonb) || jsonb_build_object(
      'site_admin_default_price_cents',
      greatest(
        0,
        coalesce(total.product_total_cents, 0)
        + round(coalesce(candidate.hidden_adjustment, 0) * 100)
        + CASE
            WHEN candidate.conditional_hidden_enabled IS TRUE
             AND candidate.conditional_hidden_product_id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.site_basket_product_type_quantities quantity
               JOIN preferred_options preferred
                 ON preferred.product_type_id = quantity.product_type_id
               WHERE quantity.basket_id = candidate.basket_id
                 AND quantity.quantity > 0
                 AND preferred.product_id = candidate.conditional_hidden_product_id
             )
              THEN round(coalesce(candidate.conditional_hidden_adjustment, 0) * 100)
            ELSE 0
          END
      )
    ),
    updated_at = now()
FROM candidates candidate
LEFT JOIN basket_product_totals total
  ON total.basket_id = candidate.basket_id
WHERE mold.id = candidate.mold_id;

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_default_prices_v1(
  p_basket_prices jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_entry record;
  v_basket_id uuid;
  v_price_text text;
  v_updated integer := 0;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_basket_prices IS NULL OR jsonb_typeof(p_basket_prices) <> 'object' THEN
    RAISE EXCEPTION 'site_basket_default_price_invalid';
  END IF;

  FOR v_entry IN
    SELECT key, value
    FROM jsonb_each(p_basket_prices) AS prices(key, value)
  LOOP
    BEGIN
      v_basket_id := v_entry.key::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'site_basket_default_price_invalid';
    END;

    v_price_text := v_entry.value #>> '{}';
    IF v_price_text IS NULL
       OR v_price_text !~ '^[0-9]{1,9}$'
       OR v_price_text::numeric > 100000000 THEN
      RAISE EXCEPTION 'site_basket_default_price_invalid';
    END IF;

    UPDATE public.basket_molds
    SET metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('site_admin_default_price_cents', v_price_text::bigint),
        updated_at = now()
    WHERE basket_id = v_basket_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'site_basket_default_price_invalid';
    END IF;
    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'site_basket_default_price_invalid';
  END IF;

  RETURN jsonb_build_object('fixed_default_prices_saved', v_updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_save_basket_default_prices_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_save_basket_default_prices_v1(jsonb)
  TO service_role;

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
BEGIN
  v_saved := public.site_admin_save_basket_grid_with_prices_v1(p_rows, p_basket_prices, p_operator);
  v_fixed_prices := public.site_admin_save_basket_default_prices_v1(p_basket_prices);
  RETURN coalesce(v_saved, '{}'::jsonb) || coalesce(v_fixed_prices, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_save_basket_grid_with_prices_v2(jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_save_basket_grid_with_prices_v2(jsonb,jsonb,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_mold_shared_with_fixed_price_v1(
  p_basket_id uuid,
  p_hidden_adjustment numeric,
  p_public_composition_count integer,
  p_positions jsonb,
  p_operator text,
  p_share_changes jsonb,
  p_default_price_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_saved jsonb;
  v_fixed_prices jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_default_price_cents IS NULL
     OR p_default_price_cents < 0
     OR p_default_price_cents > 100000000 THEN
    RAISE EXCEPTION 'site_basket_default_price_invalid';
  END IF;

  v_saved := public.site_admin_save_basket_mold_shared_v1(
    p_basket_id,
    p_hidden_adjustment,
    p_public_composition_count,
    p_positions,
    p_operator,
    p_share_changes
  );
  v_fixed_prices := public.site_admin_save_basket_default_prices_v1(
    jsonb_build_object(p_basket_id::text, p_default_price_cents)
  );
  RETURN coalesce(v_saved, '{}'::jsonb) || coalesce(v_fixed_prices, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.site_admin_save_basket_mold_shared_with_fixed_price_v1(uuid,numeric,integer,jsonb,text,jsonb,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_admin_save_basket_mold_shared_with_fixed_price_v1(uuid,numeric,integer,jsonb,text,jsonb,integer)
  TO service_role;

-- Basket orders use the same fixed configured base as the public catalog.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_old := $old$v_mold_configured_base:=round(
          v_mold_configured_product_total
          +coalesce(v_mold.hidden_adjustment,0)
          +v_mold_configured_conditional,2
        );$old$;
  v_new := $new$v_mold_configured_base:=CASE
          WHEN coalesce(v_mold.metadata->>'site_admin_default_price_cents','') ~ '^[0-9]{1,9}$'
            THEN (v_mold.metadata->>'site_admin_default_price_cents')::numeric / 100
          ELSE round(
            v_mold_configured_product_total
            +coalesce(v_mold.hidden_adjustment,0)
            +v_mold_configured_conditional,2
          )
        END;$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base_pricing_marker_not_found';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  IF position('site_admin_default_price_cents' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base_fixed_price_patch_failed';
  END IF;
  EXECUTE v_definition;
END;
$patch$;
