-- Balanço rápido: atualiza o cadastro local e registra a contagem sem trocar a autoridade de vendas.
CREATE OR REPLACE FUNCTION public.ops_quick_balance_save_v1(
  p_product_id uuid,
  p_scanned_ean text,
  p_counted_quantity numeric,
  p_validity_date date,
  p_gondola text,
  p_expected_stock numeric,
  p_expected_validity_date date,
  p_expected_gondola text,
  p_operator_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_scanned_digits text;
  v_gtin_digits text;
  v_canonical_ean text;
  v_ean_candidates text[];
  v_ean_matches boolean;
  v_gondola text;
  v_diff numeric(14,3);
  v_count_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 OR p_counted_quantity > 999999.999 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_count');
  END IF;

  v_scanned_digits := regexp_replace(coalesce(p_scanned_ean, ''), '[^0-9]', '', 'g');
  IF length(v_scanned_digits) < 8 OR length(v_scanned_digits) > 14 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ean');
  END IF;

  v_canonical_ean := coalesce(nullif(regexp_replace(v_scanned_digits, '^0+', ''), ''), '0');
  v_ean_candidates := ARRAY[v_scanned_digits, v_canonical_ean];
  FOREACH v_gtin_digits IN ARRAY ARRAY['8','12','13','14'] LOOP
    IF length(v_canonical_ean) <= v_gtin_digits::integer THEN
      v_ean_candidates := array_append(v_ean_candidates, lpad(v_canonical_ean, v_gtin_digits::integer, '0'));
    END IF;
  END LOOP;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  v_gtin_digits := regexp_replace(coalesce(v_product.gtin, ''), '[^0-9]', '', 'g');
  v_ean_matches := v_gtin_digits = ANY(v_ean_candidates)
    OR EXISTS (
      SELECT 1
      FROM public.ean_capture_records_v1 e
      WHERE e.matched_product_id = p_product_id
        AND e.sync_status = 'found'
        AND regexp_replace(coalesce(e.ean, ''), '[^0-9]', '', 'g') = ANY(v_ean_candidates)
    );
  IF NOT coalesce(v_ean_matches, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ean_mismatch');
  END IF;

  IF v_product.stock IS DISTINCT FROM p_expected_stock
    OR v_product.validity_date IS DISTINCT FROM p_expected_validity_date
    OR v_product.gondola IS DISTINCT FROM p_expected_gondola THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_changed');
  END IF;

  v_gondola := nullif(left(trim(coalesce(p_gondola, '')), 24), '');
  IF v_gondola IS NOT NULL
    AND v_gondola IS DISTINCT FROM v_product.gondola
    AND NOT EXISTS (
      SELECT 1 FROM public.vitrine_gondolas g
      WHERE g.active = true AND g.number::text = v_gondola
    ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gondola');
  END IF;

  v_diff := round(p_counted_quantity - coalesce(v_product.stock, 0), 3);

  UPDATE public.products
  SET stock = round(p_counted_quantity, 3),
      validity_date = p_validity_date,
      gondola = v_gondola,
      last_counted_at = v_now,
      physically_verified = true,
      updated_at = v_now
  WHERE id = p_product_id;

  INSERT INTO public.ops_inventory_counts(
    product_id, product_name_snapshot, gtin_snapshot, sku_snapshot,
    system_quantity_before, counted_quantity, difference, operator_label,
    source, local_stock_applied, reconciliation_state, notes
  ) VALUES (
    v_product.id, v_product.name, v_product.gtin, v_product.sku,
    coalesce(v_product.stock, 0), round(p_counted_quantity, 3), v_diff,
    left(nullif(trim(coalesce(p_operator_label, '')), ''), 80),
    'mobile_balance', true,
    CASE WHEN v_diff = 0 THEN 'matched' ELSE 'pending_erp_reconciliation' END,
    'Contagem física aplicada ao estoque no Supabase; autoridade atual de vendas mantida.'
  ) RETURNING id INTO v_count_id;

  RETURN jsonb_build_object(
    'ok', true,
    'count', jsonb_build_object(
      'count_id', v_count_id,
      'product_id', v_product.id,
      'previous_stock', coalesce(v_product.stock, 0),
      'counted_stock', round(p_counted_quantity, 3),
      'difference', v_diff,
      'local_stock_applied', true,
      'validity_date', p_validity_date,
      'gondola', v_gondola
    ),
    'product', jsonb_build_object(
      'id', v_product.id,
      'stock', round(p_counted_quantity, 3),
      'validity_date', p_validity_date,
      'gondola', v_gondola
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ops_quick_balance_save_v1(uuid, text, numeric, date, text, numeric, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_quick_balance_save_v1(uuid, text, numeric, date, text, numeric, date, text, text) TO service_role;
