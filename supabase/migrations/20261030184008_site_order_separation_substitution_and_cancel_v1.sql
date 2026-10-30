-- Admin order deletion, product substitution, and matching stock reservations.

CREATE OR REPLACE FUNCTION public.ops2_admin_set_order_separation_item_v1(
  p_order_id uuid,
  p_order_item_id uuid,
  p_state text,
  p_expected_order_updated_at timestamptz,
  p_separator_key text,
  p_replacement_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_separation public.order_separation_items_v1%ROWTYPE;
  v_replacement public.products%ROWTYPE;
  v_original_reservation public.vitrine_stock_reservations%ROWTYPE;
  v_replacement_reservation public.vitrine_stock_reservations%ROWTYPE;
  v_state text := lower(trim(coalesce(p_state, '')));
  v_separator text := nullif(lower(trim(coalesce(p_separator_key, ''))), '');
  v_reserved numeric := 0;
  v_available numeric := 0;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF p_order_id IS NULL OR p_order_item_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_order_item');
  END IF;

  IF v_state NOT IN ('separated', 'missing', 'substituted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_separation_state');
  END IF;

  IF v_separator = 'claudenil' THEN v_separator := 'claudio'; END IF;
  IF v_separator IS NULL OR v_separator NOT IN ('jose', 'claudio', 'kelly', 'jovenil') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_separator');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status NOT IN ('confirmed', 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_in_separation', 'status', v_order.status);
  END IF;

  IF p_expected_order_updated_at IS NULL OR v_order.updated_at IS DISTINCT FROM p_expected_order_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_order_version', 'order_updated_at', v_order.updated_at);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_separation_completions_v1
    WHERE order_id = p_order_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'separation_already_completed');
  END IF;

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id AND order_id = p_order_id AND quantity > 0
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_item_not_found');
  END IF;

  SELECT * INTO v_separation
  FROM public.order_separation_items_v1
  WHERE order_id = p_order_id AND order_item_id = p_order_item_id
  FOR UPDATE;

  IF FOUND AND v_separation.state <> 'pending' THEN
    IF v_state = 'substituted'
       AND v_separation.state = 'separated'
       AND v_item.metadata ? 'separation_substitution'
       AND v_item.metadata->'separation_substitution'->>'replacement_product_id' = p_replacement_product_id::text THEN
      RETURN jsonb_build_object('ok', true, 'status', 'already_applied', 'state', 'substituted',
        'order_item_id', p_order_item_id, 'order_updated_at', v_order.updated_at);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'item_already_checked');
  END IF;

  IF v_state = 'substituted' THEN
    IF p_replacement_product_id IS NULL OR v_item.product_id IS NULL
       OR p_replacement_product_id = v_item.product_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'replacement_product_invalid');
    END IF;

    SELECT * INTO v_replacement
    FROM public.products
    WHERE id = p_replacement_product_id
    FOR UPDATE;
    IF NOT FOUND OR v_replacement.is_active IS DISTINCT FROM true
       OR v_replacement.stock IS NULL OR v_replacement.stock <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'replacement_product_unavailable');
    END IF;

    SELECT coalesce(sum(r.quantity), 0)
    INTO v_reserved
    FROM public.vitrine_stock_reservations r
    JOIN public.orders o ON o.id = r.order_id
    WHERE r.product_id = p_replacement_product_id
      AND r.status = 'reserved'
      AND o.status NOT IN ('cancelled', 'returned', 'delivered');

    v_available := greatest(0, v_replacement.stock - v_reserved);
    IF v_available < v_item.quantity THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_replacement_stock',
        'available_stock', v_available, 'requested_quantity', v_item.quantity);
    END IF;

    SELECT * INTO v_replacement_reservation
    FROM public.vitrine_stock_reservations
    WHERE order_id = p_order_id AND product_id = p_replacement_product_id
    FOR UPDATE;
    IF FOUND AND v_replacement_reservation.status = 'consumed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'replacement_stock_already_consumed');
    END IF;
  END IF;

  IF v_item.product_id IS NOT NULL THEN
    SELECT * INTO v_original_reservation
    FROM public.vitrine_stock_reservations
    WHERE order_id = p_order_id AND product_id = v_item.product_id
    FOR UPDATE;
    IF FOUND AND v_original_reservation.status = 'consumed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'replacement_stock_already_consumed');
    END IF;
  END IF;

  v_result := public.ops2_set_order_separation_item_v2(
    p_order_id,
    p_order_item_id,
    CASE WHEN v_state = 'substituted' THEN 'separated' ELSE v_state END,
    p_expected_order_updated_at,
    v_separator
  );
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  IF v_state IN ('missing', 'substituted') AND v_item.product_id IS NOT NULL THEN
    UPDATE public.products SET is_active = false WHERE id = v_item.product_id;

    IF v_original_reservation.status = 'reserved' THEN
      IF v_original_reservation.quantity > v_item.quantity THEN
        UPDATE public.vitrine_stock_reservations
        SET quantity = quantity - v_item.quantity, updated_at = v_now
        WHERE id = v_original_reservation.id;
      ELSE
        UPDATE public.vitrine_stock_reservations
        SET status = 'released', released_at = v_now, consumed_at = NULL, updated_at = v_now
        WHERE id = v_original_reservation.id;
      END IF;
    END IF;
  END IF;

  IF v_state = 'substituted' THEN
    INSERT INTO public.vitrine_stock_reservations (
      order_id, product_id, quantity, status, created_at, updated_at, expires_at
    )
    VALUES (
      p_order_id, p_replacement_product_id, v_item.quantity, 'reserved', v_now, v_now, v_now + interval '2 hours'
    )
    ON CONFLICT (order_id, product_id) DO UPDATE
    SET quantity = CASE
          WHEN public.vitrine_stock_reservations.status = 'reserved'
            THEN public.vitrine_stock_reservations.quantity + EXCLUDED.quantity
          ELSE EXCLUDED.quantity
        END,
        status = 'reserved',
        updated_at = EXCLUDED.updated_at,
        expires_at = greatest(public.vitrine_stock_reservations.expires_at, EXCLUDED.expires_at),
        consumed_at = NULL,
        released_at = NULL;

    UPDATE public.order_items
    SET product_id = v_replacement.id,
        sku_snapshot = v_replacement.sku,
        name_snapshot = v_replacement.name,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'image_url', coalesce(nullif(v_replacement.image_url, ''), metadata->>'image_url'),
            'separation_substitution', jsonb_build_object(
              'original_product_id', v_item.product_id,
              'original_name', v_item.name_snapshot,
              'original_sku', v_item.sku_snapshot,
              'original_image_url', v_item.metadata->>'image_url',
              'original_preassembled_units', v_item.metadata->>'preassembled_units',
              'replacement_product_id', v_replacement.id,
              'replacement_name', v_replacement.name,
              'replacement_sku', v_replacement.sku,
              'replacement_gtin', v_replacement.gtin,
              'replacement_image_url', v_replacement.image_url,
              'replaced_at', v_now,
              'separator_key', v_separator,
              'price_policy', 'original_order_price'
            )
          )
          || CASE
               WHEN coalesce(v_item.metadata->>'history_kind', '') = 'basket_component'
                 THEN jsonb_build_object('preassembled_units', 0)
               ELSE '{}'::jsonb
             END,
        updated_at = v_now
    WHERE id = p_order_item_id AND order_id = p_order_id;

    UPDATE public.order_separation_items_v1
    SET product_id = v_replacement.id, updated_at = v_now
    WHERE order_id = p_order_id AND order_item_id = p_order_item_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'state', v_state,
    'order_updated_at', v_now,
    'replacement_product_id', CASE WHEN v_state = 'substituted' THEN p_replacement_product_id ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ops2_admin_set_order_separation_item_v1(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_admin_set_order_separation_item_v1(uuid, uuid, text, timestamptz, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ops2_admin_cancel_site_order_v1(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_order_id');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_cancelled', 'order_id', p_order_id);
  END IF;

  IF v_order.status NOT IN ('storefront_received', 'received', 'confirmed', 'processing')
     OR v_order.bling_order_id IS NOT NULL
     OR v_order.sync_status <> 'local'
     OR EXISTS (
       SELECT 1 FROM public.order_separation_completions_v1
       WHERE order_id = p_order_id
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_cancel_not_allowed', 'status', v_order.status);
  END IF;

  UPDATE public.vitrine_stock_reservations
  SET status = 'released', released_at = v_now, consumed_at = NULL, updated_at = v_now
  WHERE order_id = p_order_id AND status = 'reserved';

  UPDATE public.orders
  SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'order_id', p_order_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.ops2_admin_cancel_site_order_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_admin_cancel_site_order_v1(uuid) TO service_role;
